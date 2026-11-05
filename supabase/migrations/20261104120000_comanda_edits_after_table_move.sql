-- Permite editar comandas de una cuenta abierta después de moverla de mesa.
-- La sesión es la identidad de la cuenta; su mesa actual prevalece sobre el dato histórico de la comanda.
BEGIN;

create or replace function public.dp_save_waiter_comanda(
  p_operation_id uuid,p_comanda_id uuid,p_table_id uuid,p_session_id uuid,p_expected_version integer,p_items jsonb,p_notes text default ''
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare actor public.app_users;account public.table_sessions;c public.waiter_comandas;receipt public.waiter_comanda_operations;
  item jsonb;line_id uuid;product_id uuid;unit_value numeric;units integer;options jsonb;line_notes text;detail text;
  line_ids uuid[]:='{}';clean_items jsonb:='[]'::jsonb;fingerprint text;result jsonb;is_new boolean;can_manage boolean;effective_table_id uuid;
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
  select * into c from public.waiter_comandas where id=p_comanda_id for update;is_new:=c.id is null;
  if not is_new then
    if p_session_id is not null and c.session_id<>p_session_id then raise exception 'La comanda ya no pertenece a esta cuenta.';end if;
    select * into account from public.table_sessions where id=c.session_id for update;
    if account.id is null or account.status<>'open' then raise exception 'Esta cuenta ya se cerró. Vuelve a las mesas.';end if;
    effective_table_id:=account.table_id;
  else
    effective_table_id:=p_table_id;
  end if;
  perform 1 from public.restaurant_tables where id=effective_table_id and is_active for update;
  if not found then raise exception 'La mesa ya no está disponible.';end if;
  -- The open account determines the current table; the comanda may still contain its previous table ID.
  if p_session_id is not null then
    select * into account from public.table_sessions where id=p_session_id for update;
    if account.id is not null and account.table_id<>effective_table_id then raise exception 'La cuenta cambió de mesa. Actualiza la comanda e intenta de nuevo.';end if;
    if account.id is null or account.status<>'open' then
      -- A new comanda can outlive the previous customer's account in a local
      -- draft. Resolve it under the table lock without reopening paid accounts.
      if not is_new or coalesce(p_expected_version,0)<>0 then raise exception 'Esta cuenta ya se cerró. Vuelve a las mesas.';end if;
      select * into account from public.table_sessions where table_id=effective_table_id and status='open' order by opened_at desc limit 1 for update;
      if account.id is not null then raise exception 'La mesa tiene otra cuenta abierta. Revisa el consumo actual antes de enviar.';end if;
      insert into public.table_sessions(table_id,status,assigned_waiter_id) values(effective_table_id,'open',actor.id) returning * into account;
    end if;
  elsif not is_new then
    -- Editing a historical comanda must never move it to the next customer.
    select * into account from public.table_sessions where id=c.session_id and table_id=effective_table_id for update;
    if account.id is null or account.status<>'open' then raise exception 'Esta cuenta ya se cerró. Vuelve a las mesas.';end if;
  else
    select * into account from public.table_sessions where table_id=effective_table_id and status='open' order by opened_at desc limit 1 for update;
    if account.id is null then insert into public.table_sessions(table_id,status,assigned_waiter_id) values(effective_table_id,'open',actor.id) returning * into account;end if;
  end if;
  if is_new then
    if actor.role='waiter' and not exists(select 1 from public.app_users where id=account.assigned_waiter_id and role='waiter') then
      update public.table_sessions set assigned_waiter_id=actor.id,updated_at=now() where id=account.id;
    end if;
    if exists(select 1 from public.service_requests where id=p_comanda_id) then raise exception 'El identificador pertenece a otra solicitud.';end if;
    if coalesce(p_expected_version,0)<>0 or jsonb_array_length(p_items)=0 then raise exception 'Agrega al menos un producto.';end if;
    insert into public.waiter_comandas(id,table_id,session_id,created_by_user_id,notes) values(p_comanda_id,effective_table_id,account.id,actor.id,coalesce(p_notes,'')) returning * into c;
  else
    if (not can_manage and c.created_by_user_id is distinct from actor.id) or c.session_id<>account.id then raise exception 'Solo puedes editar tus propias comandas de esta mesa.';end if;
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
  update public.waiter_comandas set table_id=effective_table_id,items=clean_items,notes=coalesce(p_notes,''),version=case when is_new then version else version+1 end,updated_at=now()
    where id=p_comanda_id returning * into c;
  -- Administration adds directly to the account. Waiter orders still require
  -- explicit acceptance. Both paths apply the same stable line IDs atomically.
  if c.accepted_at is not null or (is_new and can_manage) then
    perform public.dp_apply_waiter_comanda(c.id,actor.id);
    select * into c from public.waiter_comandas where id=p_comanda_id;
  end if;
  select string_agg((value->>'quantity')||' × '||(value->>'name')||case when coalesce(value->>'notes','')<>'' then ' ('||(value->>'notes')||')' else '' end,'; ')
    into detail from jsonb_array_elements(clean_items);
  detail:=coalesce(detail,'Comanda retirada.');if coalesce(p_notes,'')<>'' then detail:=detail||E'\nNotas: '||p_notes;end if;
  insert into public.service_requests(id,table_id,session_id,request_type,message,request_source,requested_by_user_id,requested_by_name)
    values(p_comanda_id,effective_table_id,account.id,'other',left(detail,1000),'waiter',c.created_by_user_id,
      left(coalesce((select coalesce(nullif(full_name,''),username) from public.app_users where id=c.created_by_user_id),'Mesero'),80))
    on conflict(id) do update set table_id=excluded.table_id,session_id=excluded.session_id,message=excluded.message,updated_at=now(),
      status=case when jsonb_array_length(clean_items)=0 then 'resolved' when c.accepted_at is not null then 'acknowledged' else 'pending' end;
  if jsonb_array_length(clean_items)=0 then update public.service_requests set status='resolved' where id=p_comanda_id;end if;
  if c.accepted_at is not null and jsonb_array_length(clean_items)>0 then
    update public.service_requests set status='acknowledged',acknowledged_at=coalesce(acknowledged_at,now()),
      acknowledged_by_user_id=coalesce(acknowledged_by_user_id,actor.id) where id=p_comanda_id;
  end if;
  result:=public.dp_waiter_comanda_result(c.id);
  insert into public.waiter_comanda_operations(id,actor_id,signature,result) values(p_operation_id,actor.id,fingerprint,result);
  return result||jsonb_build_object('duplicate',false);
end;$$;

notify pgrst,'reload schema';
commit;

