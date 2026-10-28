-- Avisos de pedidos tomados por el mesero, sin volver a agregar consumos.
-- Ejecutar después de 01, 02 y 03. Se puede repetir.
begin;

alter table public.service_requests
  add column if not exists request_source text not null default 'client',
  add column if not exists requested_by_user_id uuid references public.app_users(id) on delete set null,
  add column if not exists requested_by_name text;

create or replace function public.dp_notify_waiter_order(p_request_id uuid,p_session_id uuid,p_item_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  actor public.app_users;
  account public.table_sessions;
  saved public.service_requests;
  detail text;
  matched integer;
begin
  actor := public.require_app_user(public.request_header('x-app-token'));
  if actor.role <> 'waiter' then raise exception 'Esta solicitud corresponde a un mesero.'; end if;
  if p_request_id is null or coalesce(cardinality(p_item_ids),0) not between 1 and 100 then
    raise exception 'El pedido no contiene productos válidos.';
  end if;
  -- The same notice may be retried after a lost response, including after checkout.
  perform pg_advisory_xact_lock(hashtext('dp-waiter-order:' || p_request_id::text));
  select * into saved from public.service_requests where id=p_request_id;
  if saved.id is not null then
    if saved.session_id is distinct from p_session_id then raise exception 'La solicitud pertenece a otra cuenta.'; end if;
    return jsonb_build_object('request',to_jsonb(saved),'duplicate',true);
  end if;
  select * into account from public.table_sessions where id=p_session_id for update;
  if account.id is null or account.status <> 'open' then
    -- A delayed notice must not reopen a closed table or create another account.
    return jsonb_build_object('skipped',true,'request',jsonb_build_object('id',p_request_id,'status','resolved'));
  end if;
  select count(*),string_agg(i.quantity::text || ' × ' || i.item_name ||
    case when coalesce(i.notes,'')<>'' then ' (' || i.notes || ')' else '' end,'; ' order by i.created_at,i.id)
    into matched,detail from public.session_items i
    where i.id=any(p_item_ids) and i.session_id=account.id and i.table_id=account.table_id
      and i.status<>'cancelled' and i.created_by_user_id=actor.id;
  if matched <> cardinality(p_item_ids) then raise exception 'El pedido debe contener productos guardados por este mesero en esta mesa.'; end if;
  if not p_request_id=any(p_item_ids) then raise exception 'Identificador de pedido inválido.'; end if;
  insert into public.service_requests(id,table_id,session_id,request_type,message,request_source,requested_by_user_id,requested_by_name)
    values(p_request_id,account.table_id,account.id,'other',left(detail,1000),'waiter',actor.id,
      left(coalesce(nullif(actor.full_name,''),actor.username),80))
    returning * into saved;
  return jsonb_build_object('request',to_jsonb(saved),'duplicate',false);
end;$$;

revoke all on function public.dp_notify_waiter_order(uuid,uuid,uuid[]) from public;
grant execute on function public.dp_notify_waiter_order(uuid,uuid,uuid[]) to anon;
notify pgrst,'reload schema';
commit;
