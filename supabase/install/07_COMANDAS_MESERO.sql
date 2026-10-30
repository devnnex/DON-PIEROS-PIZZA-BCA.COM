-- Comandas de mesa: enviar, revisar, aceptar y corregir sin duplicar consumos.
-- Ejecutar después de 01 a 06. Se puede repetir sin borrar información.
begin;
create table if not exists public.waiter_comandas (
  id uuid primary key,table_id uuid not null references public.restaurant_tables(id) on delete cascade,
  session_id uuid not null references public.table_sessions(id) on delete cascade,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  notes text not null default '' check(length(notes)<=500),version integer not null default 1,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.waiter_comandas
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by_user_id uuid references public.app_users(id) on delete set null;
alter table public.session_items
  add column if not exists waiter_comanda_id uuid references public.waiter_comandas(id) on delete set null,
  add column if not exists web_product_id uuid,
  add column if not exists waiter_options jsonb not null default '{}'::jsonb,
  add column if not exists waiter_line_notes text not null default '';
create index if not exists session_items_waiter_comanda_idx on public.session_items(waiter_comanda_id);
create index if not exists waiter_comandas_session_idx on public.waiter_comandas(session_id);
create table if not exists public.waiter_comanda_operations (
  id uuid primary key,actor_id uuid not null references public.app_users(id) on delete cascade,
  signature text not null,result jsonb not null,created_at timestamptz not null default now()
);
-- Preserve any comanda saved by an earlier copy of this migration.
update public.waiter_comandas c set accepted_at=c.created_at,items=coalesce((
  select jsonb_agg(jsonb_build_object('id',i.id,'product_id',i.web_product_id,'name',i.item_name,
    'quantity',i.quantity,'unit_price',i.unit_price,'notes',i.waiter_line_notes,'options',i.waiter_options) order by i.created_at,i.id)
  from public.session_items i where i.waiter_comanda_id=c.id and i.status<>'cancelled'
),'[]'::jsonb) where c.accepted_at is null and c.items='[]'::jsonb
  and exists(select 1 from public.session_items i where i.waiter_comanda_id=c.id);
alter table public.waiter_comandas enable row level security;
alter table public.waiter_comanda_operations enable row level security;
revoke all on public.waiter_comandas,public.waiter_comanda_operations from anon,authenticated;

create or replace function public.enforce_staff_mutation_limits()
returns trigger language plpgsql set search_path=public,extensions as $$
declare actor public.app_users;
begin
  actor:=public.app_user_for_token(public.request_header('x-app-token'));
  if actor.id is null then return new;end if;
  if tg_table_name='session_items' and new.status='cancelled' and old.status is distinct from new.status and actor.role<>'boss' then
    if new.waiter_comanda_id is null or new.waiter_comanda_id is distinct from old.waiter_comanda_id
      or new.session_id is distinct from old.session_id or not exists(
        select 1 from public.waiter_comandas c join public.table_sessions s on s.id=c.session_id
        where c.id=old.waiter_comanda_id and s.status='open' and
        ((actor.role='waiter' and c.created_by_user_id=actor.id) or
         (actor.role='admin' and(public.app_can_access_section('dashboard') or public.app_can_access_section('service'))))
      ) then raise exception 'No puedes quitar productos de esta comanda.';end if;
  end if;
  if tg_table_name='table_sessions' and actor.role='waiter' and new.status is distinct from old.status then
    raise exception 'El Mesero solo puede agregar o editar consumos.';
  end if;
  return new;
end;$$;

create or replace function public.dp_waiter_comanda_result(p_id uuid)
returns jsonb language sql stable security definer set search_path=public,extensions as $$
  select jsonb_build_object('comanda',to_jsonb(c),'session',to_jsonb(s)||jsonb_build_object('session_items',
    coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at,i.id) from public.session_items i where i.session_id=s.id),'[]'::jsonb)),
    'request',(select to_jsonb(r) from public.service_requests r where r.id=c.id))
  from public.waiter_comandas c join public.table_sessions s on s.id=c.session_id where c.id=p_id;
$$;

-- Private: accepting a new comanda or correcting an accepted one uses this
-- exact same set of line IDs. A retry cannot add another consumption.
create or replace function public.dp_apply_waiter_comanda(p_id uuid,p_actor uuid)
returns void language plpgsql security definer set search_path=public,extensions as $$
declare c public.waiter_comandas;account public.table_sessions;item jsonb;line_id uuid;product_id uuid;
  line_ids uuid[]:='{}';detail text;next_total numeric;other_total numeric;paid numeric;
begin
  select * into c from public.waiter_comandas where id=p_id;
  if c.id is null then raise exception 'La comanda ya no existe.';end if;
  select * into account from public.table_sessions where id=c.session_id for update;
  if account.id is null or account.status<>'open' then raise exception 'Esta cuenta ya se cerró. Vuelve a las mesas.';end if;
  select * into c from public.waiter_comandas where id=p_id for update;
  select coalesce(sum((value->>'quantity')::numeric*(value->>'unit_price')::numeric),0) into next_total from jsonb_array_elements(c.items);
  select coalesce(sum(quantity*round(unit_price)),0) into other_total from public.session_items
    where session_id=account.id and status<>'cancelled' and waiter_comanda_id is distinct from p_id;
  select coalesce(sum(amount),0) into paid from public.session_payments where session_id=account.id;
  if next_total+other_total<paid then raise exception 'El consumo no puede quedar por debajo de los abonos registrados.';end if;
  for item in select value from jsonb_array_elements(c.items) loop
    line_id:=(item->>'id')::uuid;product_id:=(item->>'product_id')::uuid;
    if exists(select 1 from public.session_items where id=line_id and waiter_comanda_id is distinct from p_id) then raise exception 'El producto pertenece a otro pedido.';end if;
    line_ids:=array_append(line_ids,line_id);
    select string_agg(value,' · ') into detail from jsonb_array_elements_text(coalesce(item->'options'->'labels','[]'::jsonb));
    detail:=concat_ws(' · ',nullif(detail,''),nullif(item->>'notes',''));
    insert into public.session_items(id,session_id,table_id,menu_item_id,item_name,quantity,unit_price,notes,status,
      created_by_user_id,updated_by_user_id,waiter_comanda_id,web_product_id,waiter_options,waiter_line_notes)
    values(line_id,account.id,c.table_id,(select id from public.menu_items where id=product_id),item->>'name',
      (item->>'quantity')::integer,(item->>'unit_price')::numeric,detail,'served',c.created_by_user_id,p_actor,p_id,product_id,item->'options',coalesce(item->>'notes',''))
    on conflict(id) do update set item_name=excluded.item_name,menu_item_id=excluded.menu_item_id,quantity=excluded.quantity,
      unit_price=excluded.unit_price,notes=excluded.notes,status='served',updated_by_user_id=p_actor,web_product_id=excluded.web_product_id,
      waiter_options=excluded.waiter_options,waiter_line_notes=excluded.waiter_line_notes,updated_at=now();
  end loop;
  update public.session_items set status='cancelled',updated_by_user_id=p_actor,updated_at=now()
    where waiter_comanda_id=p_id and not(id=any(line_ids)) and status<>'cancelled';
  update public.waiter_comandas set accepted_at=coalesce(accepted_at,now()),accepted_by_user_id=coalesce(accepted_by_user_id,p_actor),updated_at=now() where id=p_id;
end;$$;

-- Acknowledging a notice only marks it as reviewed. Applying the products is
-- explicit in dp_accept_waiter_comanda, after reviewing/printing the comanda.
create or replace function public.dp_accept_comanda_on_ack()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare actor public.app_users;
begin
  if new.status='acknowledged' and exists(select 1 from public.waiter_comandas where id=new.id and accepted_at is null) then
    actor:=public.require_app_user(public.request_header('x-app-token'));
    if actor.role='waiter' or not(public.app_can_access_section('dashboard') or public.app_can_access_section('service')) then
      raise exception 'La comanda debe ser aceptada por administración.';
    end if;
  end if;
  return new;
end;$$;
drop trigger if exists dp_comanda_accept on public.service_requests;
create trigger dp_comanda_accept before update on public.service_requests for each row execute function public.dp_accept_comanda_on_ack();

create or replace function public.acknowledge_service_requests(
  auth_token text,ids uuid[],acknowledged_at timestamptz default now(),message text default null
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare staff_user public.app_users;result jsonb;
begin
  staff_user:=public.require_app_user(auth_token);
  if coalesce(array_length(ids,1),0) not between 1 and 50 then raise exception 'Solicitudes inválidas.';end if;
  perform 1 from public.service_requests where id=any(ids) order by id for update;
  with changed as (
    update public.service_requests r set status='acknowledged',acknowledged_by_user_id=staff_user.id,
      acknowledged_at=acknowledge_service_requests.acknowledged_at,
      message=case when acknowledge_service_requests.message is null then r.message else left(acknowledge_service_requests.message,1000) end
    where r.id=any(ids) returning r.*
  ) select coalesce(jsonb_agg(to_jsonb(changed)),'[]'::jsonb) into result from changed;
  return result;
end;$$;

create or replace function public.dp_list_waiter_comandas()
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare actor public.app_users;result jsonb;
begin
  actor:=public.require_app_user(public.request_header('x-app-token'));
  if actor.role<>'waiter' and not(public.app_can_access_section('dashboard') or public.app_can_access_section('service')) then raise exception 'No tienes acceso a las comandas.';end if;
  select coalesce(jsonb_agg(entry order by changed desc),'[]'::jsonb) into result from (
    select c.updated_at as changed,to_jsonb(c)||jsonb_build_object(
      'table',jsonb_build_object('table_number',t.table_number,'table_name',t.table_name),
      'waiter_name',coalesce(nullif(u.full_name,''),u.username,'Mesero'),'request_status',coalesce(r.status,'resolved'),
      'items',coalesce((select jsonb_agg(jsonb_build_object('id',value->'id','web_product_id',value->'product_id',
        'item_name',value->'name','quantity',value->'quantity','unit_price',value->'unit_price',
        'waiter_options',value->'options','waiter_line_notes',value->'notes') order by position)
        from jsonb_array_elements(c.items) with ordinality a(value,position)),'[]'::jsonb)
    ) as entry from public.waiter_comandas c join public.table_sessions s on s.id=c.session_id and s.status='open'
    join public.restaurant_tables t on t.id=c.table_id left join public.app_users u on u.id=c.created_by_user_id
    left join public.service_requests r on r.id=c.id where actor.role<>'waiter' or c.created_by_user_id=actor.id
  ) q;
  return jsonb_build_object('orders',result);
end;$$;

create or replace function public.dp_accept_waiter_comanda(p_comanda_id uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare actor public.app_users;c public.waiter_comandas;
begin
  actor:=public.require_app_user(public.request_header('x-app-token'));
  if actor.role='waiter' or not(public.app_can_access_section('dashboard') or public.app_can_access_section('service')) then raise exception 'Esta operación requiere administración.';end if;
  select * into c from public.waiter_comandas where id=p_comanda_id;
  if c.id is null then raise exception 'La comanda ya no existe.';end if;
  perform 1 from public.service_requests where id=p_comanda_id for update;
  perform 1 from public.restaurant_tables where id=c.table_id for update;
  perform 1 from public.table_sessions where id=c.session_id and status='open' for update;
  if not found then raise exception 'Esta cuenta ya se cerró.';end if;
  select * into c from public.waiter_comandas where id=p_comanda_id for update;
  if c.accepted_at is not null then return public.dp_waiter_comanda_result(c.id)||jsonb_build_object('duplicate',true);end if;
  if c.version is distinct from p_expected_version then raise exception 'La comanda cambió en otro equipo. Revisa los cambios antes de aceptar.';end if;
  if jsonb_array_length(c.items)=0 then raise exception 'La comanda no contiene productos.';end if;
  perform public.dp_apply_waiter_comanda(c.id,actor.id);
  update public.service_requests set status='acknowledged',acknowledged_at=now(),acknowledged_by_user_id=actor.id where id=c.id;
  return public.dp_waiter_comanda_result(c.id)||jsonb_build_object('duplicate',false);
end;$$;

create or replace function public.dp_save_waiter_comanda(
  p_operation_id uuid,p_comanda_id uuid,p_table_id uuid,p_session_id uuid,p_expected_version integer,p_items jsonb,p_notes text default ''
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare actor public.app_users;account public.table_sessions;c public.waiter_comandas;receipt public.waiter_comanda_operations;
  item jsonb;line_id uuid;product_id uuid;unit_value numeric;units integer;options jsonb;line_notes text;detail text;
  line_ids uuid[]:='{}';clean_items jsonb:='[]'::jsonb;fingerprint text;result jsonb;is_new boolean;can_manage boolean;
begin
  actor:=public.require_app_user(public.request_header('x-app-token'));
  can_manage:=actor.role in ('boss','admin') and(public.app_can_access_section('dashboard') or public.app_can_access_section('service'));
  if actor.role<>'waiter' and not can_manage then raise exception 'No tienes permiso para editar comandas.';end if;
  if p_operation_id is null or p_comanda_id is null or p_table_id is null or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items)>100 or length(coalesce(p_notes,''))>500 then raise exception 'Revisa los productos y las notas del pedido.';end if;
  fingerprint:=encode(digest(jsonb_build_array(actor.id,p_comanda_id,p_table_id,p_session_id,p_expected_version,p_items,p_notes)::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtext('dp-comanda-operation:'||p_operation_id::text));
  select * into receipt from public.waiter_comanda_operations where id=p_operation_id;
  if receipt.id is not null then
    if receipt.actor_id is distinct from actor.id or receipt.signature<>fingerprint then raise exception 'La operación ya existe con otro contenido.';end if;
    result:=public.dp_waiter_comanda_result((receipt.result->'comanda'->>'id')::uuid);
    return coalesce(result,receipt.result)||jsonb_build_object('duplicate',true,'closed',not exists(select 1 from public.table_sessions where id=(receipt.result->'session'->>'id')::uuid and status='open'));
  end if;
  perform 1 from public.service_requests where id=p_comanda_id for update;
  perform 1 from public.restaurant_tables where id=p_table_id and is_active for update;
  if not found then raise exception 'La mesa ya no está disponible.';end if;
  select * into c from public.waiter_comandas where id=p_comanda_id for update;is_new:=c.id is null;
  if p_session_id is not null then
    select * into account from public.table_sessions where id=p_session_id for update;
    if account.id is not null and account.table_id<>p_table_id then raise exception 'La cuenta no pertenece a esta mesa.';end if;
    if account.id is null or account.status<>'open' then
      -- A new comanda can outlive the previous customer's account in a local
      -- draft. Resolve it under the table lock without reopening paid accounts.
      if not is_new or coalesce(p_expected_version,0)<>0 then raise exception 'Esta cuenta ya se cerró. Vuelve a las mesas.';end if;
      select * into account from public.table_sessions where table_id=p_table_id and status='open' order by opened_at desc limit 1 for update;
      if account.id is not null then raise exception 'La mesa tiene otra cuenta abierta. Revisa el consumo actual antes de enviar.';end if;
      insert into public.table_sessions(table_id,status,assigned_waiter_id) values(p_table_id,'open',actor.id) returning * into account;
    end if;
  elsif not is_new then
    -- Editing a historical comanda must never move it to the next customer.
    select * into account from public.table_sessions where id=c.session_id and table_id=p_table_id for update;
    if account.id is null or account.status<>'open' then raise exception 'Esta cuenta ya se cerró. Vuelve a las mesas.';end if;
  else
    select * into account from public.table_sessions where table_id=p_table_id and status='open' order by opened_at desc limit 1 for update;
    if account.id is null then insert into public.table_sessions(table_id,status,assigned_waiter_id) values(p_table_id,'open',actor.id) returning * into account;end if;
  end if;
  if is_new then
    if actor.role<>'waiter' then raise exception 'Selecciona una comanda recibida para editarla.';end if;
    if exists(select 1 from public.service_requests where id=p_comanda_id) then raise exception 'El identificador pertenece a otra solicitud.';end if;
    if coalesce(p_expected_version,0)<>0 or jsonb_array_length(p_items)=0 then raise exception 'Agrega al menos un producto.';end if;
    insert into public.waiter_comandas(id,table_id,session_id,created_by_user_id,notes) values(p_comanda_id,p_table_id,account.id,actor.id,coalesce(p_notes,'')) returning * into c;
  else
    if (not can_manage and c.created_by_user_id is distinct from actor.id) or c.session_id<>account.id or c.table_id<>p_table_id then raise exception 'Solo puedes editar tus propias comandas de esta mesa.';end if;
    if c.version is distinct from p_expected_version then raise exception 'La comanda cambió en otro equipo. Actualiza antes de editar.';end if;
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    line_id:=(item->>'id')::uuid;product_id:=(item->>'product_id')::uuid;units:=(item->>'quantity')::integer;unit_value:=(item->>'unit_price')::numeric;
    options:=coalesce(item->'options','{}'::jsonb);line_notes:=coalesce(item->>'notes','');
    if line_id is null or product_id is null or line_id=any(line_ids) or coalesce(item->>'quantity','')!~'^[1-9][0-9]?$'
      or unit_value is null or unit_value::text in ('NaN','Infinity','-Infinity') or unit_value not between 0 and 10000000 or unit_value<>round(unit_value)
      or length(trim(coalesce(item->>'name',''))) not between 1 and 160 or length(line_notes)>500 or jsonb_typeof(options) is distinct from 'object'
      or pg_column_size(options)>12000 or jsonb_typeof(coalesce(options->'labels','[]'::jsonb)) is distinct from 'array' then raise exception 'Un producto tiene datos inválidos.';end if;
    if exists(select 1 from public.session_items where id=line_id and waiter_comanda_id is distinct from p_comanda_id) then raise exception 'El producto pertenece a otro pedido.';end if;
    line_ids:=array_append(line_ids,line_id);
    select string_agg(value,' · ') into detail from jsonb_array_elements_text(coalesce(options->'labels','[]'::jsonb));
    detail:=concat_ws(' · ',nullif(detail,''),nullif(line_notes,''));if length(detail)>500 then raise exception 'Acorta las opciones y notas de este producto.';end if;
    clean_items:=clean_items||jsonb_build_array(jsonb_build_object('id',line_id,'product_id',product_id,'name',trim(item->>'name'),
      'quantity',units,'unit_price',unit_value,'notes',line_notes,'options',options||jsonb_build_object('labels',coalesce(options->'labels','[]'::jsonb))));
  end loop;
  update public.waiter_comandas set items=clean_items,notes=coalesce(p_notes,''),version=case when is_new then version else version+1 end,updated_at=now()
    where id=p_comanda_id returning * into c;
  if c.accepted_at is not null then perform public.dp_apply_waiter_comanda(c.id,actor.id);end if;
  select string_agg((value->>'quantity')||' × '||(value->>'name')||case when coalesce(value->>'notes','')<>'' then ' ('||(value->>'notes')||')' else '' end,'; ')
    into detail from jsonb_array_elements(clean_items);
  detail:=coalesce(detail,'Comanda retirada.');if coalesce(p_notes,'')<>'' then detail:=detail||E'\nNotas: '||p_notes;end if;
  insert into public.service_requests(id,table_id,session_id,request_type,message,request_source,requested_by_user_id,requested_by_name)
    values(p_comanda_id,p_table_id,account.id,'other',left(detail,1000),'waiter',c.created_by_user_id,
      left(coalesce((select coalesce(nullif(full_name,''),username) from public.app_users where id=c.created_by_user_id),'Mesero'),80))
    on conflict(id) do update set message=excluded.message,updated_at=now(),
      status=case when jsonb_array_length(clean_items)=0 then 'resolved' when c.accepted_at is not null then 'acknowledged' else 'pending' end;
  if jsonb_array_length(clean_items)=0 then update public.service_requests set status='resolved' where id=p_comanda_id;end if;
  result:=public.dp_waiter_comanda_result(c.id);
  insert into public.waiter_comanda_operations(id,actor_id,signature,result) values(p_operation_id,actor.id,fingerprint,result);
  return result||jsonb_build_object('duplicate',false);
end;$$;

revoke all on function public.dp_waiter_comanda_result(uuid) from public,anon,authenticated;
revoke all on function public.dp_apply_waiter_comanda(uuid,uuid) from public,anon,authenticated;
revoke all on function public.dp_accept_comanda_on_ack() from public,anon,authenticated;
revoke all on function public.dp_list_waiter_comandas() from public;
revoke all on function public.dp_accept_waiter_comanda(uuid,integer) from public;
revoke all on function public.dp_save_waiter_comanda(uuid,uuid,uuid,uuid,integer,jsonb,text) from public;
grant execute on function public.dp_list_waiter_comandas() to anon;
grant execute on function public.dp_accept_waiter_comanda(uuid,integer) to anon;
grant execute on function public.dp_save_waiter_comanda(uuid,uuid,uuid,uuid,integer,jsonb,text) to anon;
notify pgrst,'reload schema';
commit;
