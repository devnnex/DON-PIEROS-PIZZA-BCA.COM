
-- ARCHIVO: 20260903170000_operational_improvements.sql
-- Tienda Napoles - migracion operativa 2026-09-03
-- Archivo aditivo e idempotente. Ejecutar en el SQL Editor del proyecto actual.

begin;

alter table public.table_sessions add column if not exists sale_channel text not null default 'table';
alter table public.table_sessions alter column table_id drop not null;
alter table public.session_items alter column table_id drop not null;
alter table public.session_items add column if not exists created_by_user_id uuid;
alter table public.session_items add column if not exists updated_by_user_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'table_sessions_sale_channel_check') then
    alter table public.table_sessions add constraint table_sessions_sale_channel_check check (sale_channel in ('table', 'walk_in'));
  end if;
end $$;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.table_sessions(id) on delete cascade,
  table_id uuid references public.restaurant_tables(id) on delete cascade,
  sender_type text not null check (sender_type in ('client', 'staff', 'system')),
  sender_user_id uuid,
  sender_name text not null default '',
  body text not null check (char_length(body) between 1 and 600),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_created_idx on public.chat_messages(session_id, created_at);
alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;

create or replace function public.chat_staff_user(p_auth_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  staff jsonb;
begin
  if coalesce(p_auth_token, '') = '' then return null; end if;
  select to_jsonb(public.get_current_user(p_auth_token)) into staff;
  if coalesce((staff->>'is_active')::boolean, false) is not true then return null; end if;
  return staff;
exception when others then
  return null;
end;
$$;

create or replace function public.chat_client_can_access(p_table_id uuid, p_session_id uuid, p_table_access_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.valid_table_access(p_table_id, p_table_access_code) and exists (
    select 1
    from public.restaurant_tables rt
    join public.table_sessions ts on ts.table_id = rt.id
    where rt.id = p_table_id
      and ts.id = p_session_id
      and ts.status = 'open'
  );
$$;

create or replace function public.list_chat_messages(p_session_id uuid, p_table_id uuid default null, p_table_access_code text default '', p_auth_token text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  staff jsonb;
  result jsonb;
begin
  staff := public.chat_staff_user(p_auth_token);
  if staff is null and not public.chat_client_can_access(p_table_id, p_session_id, p_table_access_code) then
    raise exception 'Acceso al chat no autorizado';
  end if;
  select jsonb_build_object('messages', coalesce(jsonb_agg(to_jsonb(cm) order by cm.created_at), '[]'::jsonb))
    into result
  from public.chat_messages cm
  where cm.session_id = p_session_id;
  return result;
end;
$$;

create or replace function public.send_chat_message(p_message_id uuid, p_session_id uuid, p_table_id uuid default null, p_sender_type text default 'client', p_body text default '', p_table_access_code text default '', p_auth_token text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  staff jsonb;
  saved public.chat_messages;
  effective_sender text;
begin
  staff := public.chat_staff_user(p_auth_token);
  effective_sender := lower(coalesce(p_sender_type, 'client'));
  if effective_sender in ('staff', 'system') then
    if staff is null then raise exception 'Usuario administrativo no autorizado'; end if;
  elsif effective_sender = 'client' then
    if not public.chat_client_can_access(p_table_id, p_session_id, p_table_access_code) then raise exception 'Mesa no autorizada'; end if;
  else
    raise exception 'Remitente invalido';
  end if;
  insert into public.chat_messages(id, session_id, table_id, sender_type, sender_user_id, sender_name, body)
  values (
    coalesce(p_message_id, gen_random_uuid()), p_session_id, p_table_id, effective_sender,
    case when staff is null then null else nullif(staff->>'id', '')::uuid end,
    case when effective_sender = 'client' then 'Cliente' when effective_sender = 'system' then 'Sistema' else coalesce(staff->>'full_name', staff->>'username', 'Equipo') end,
    left(trim(p_body), 600)
  )
  on conflict (id) do update set body = excluded.body
  returning * into saved;
  return jsonb_build_object('message', to_jsonb(saved));
end;
$$;

create or replace function public.close_chat_session(p_session_id uuid, p_auth_token text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  staff jsonb;
  deleted_count integer;
begin
  staff := public.chat_staff_user(p_auth_token);
  if staff is null then raise exception 'Usuario administrativo no autorizado'; end if;
  delete from public.chat_messages cm where cm.session_id = p_session_id;
  get diagnostics deleted_count = row_count;
  return jsonb_build_object('closed', true, 'deleted', deleted_count);
end;
$$;

grant execute on function public.list_chat_messages(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.send_chat_message(uuid, uuid, uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.close_chat_session(uuid, text) to anon, authenticated;

do $$
declare
  category_name text;
  category_order integer := 100;
begin
  foreach category_name in array array['Snack', 'Bebidas', 'Medicina', 'Otros'] loop
    if not exists (select 1 from public.menu_categories mc where lower(mc.name) = lower(category_name)) then
      insert into public.menu_categories(name, sort_order, is_active) values (category_name, category_order, true);
    end if;
    category_order := category_order + 1;
  end loop;
end $$;

do $$
begin
  begin alter publication supabase_realtime add table public.service_requests; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.table_sessions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.session_items; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.chat_messages; exception when duplicate_object then null; end;
end $$;

commit;



-- ARCHIVO: 20260903173000_walk_in_snapshot.sql
create or replace function public.get_admin_snapshot(auth_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_app_user(auth_token);
  return jsonb_build_object(
    'requests', (
      select coalesce(jsonb_agg(
        to_jsonb(r) || jsonb_build_object(
          'restaurant_tables', jsonb_build_object('table_number', t.table_number, 'table_name', t.table_name),
          'acknowledged_by_user', case when u.id is null then null else public.public_user(u) end
        ) order by r.created_at desc), '[]'::jsonb)
      from public.service_requests r
      join public.restaurant_tables t on t.id = r.table_id
      left join public.app_users u on u.id = r.acknowledged_by_user_id
      where r.status in ('pending', 'acknowledged')
    ),
    'sessions', (
      select coalesce(jsonb_agg(
        to_jsonb(s) || jsonb_build_object(
          'restaurant_tables', case when t.id is null then null else jsonb_build_object('table_number', t.table_number, 'table_name', t.table_name) end,
          'assigned_waiter', case when u.id is null then null else public.public_user(u) end,
          'session_items', (
            select coalesce(jsonb_agg(
              to_jsonb(i) || jsonb_build_object('created_by_user', case when cu.id is null then null else public.public_user(cu) end)
              order by i.created_at
            ), '[]'::jsonb)
            from public.session_items i
            left join public.app_users cu on cu.id = i.created_by_user_id
            where i.session_id = s.id
          )
        ) order by s.opened_at desc), '[]'::jsonb)
      from public.table_sessions s
      left join public.restaurant_tables t on t.id = s.table_id
      left join public.app_users u on u.id = s.assigned_waiter_id
      where s.status = 'open'
    )
  );
end;
$$;

grant execute on function public.get_admin_snapshot(text) to anon, authenticated;


-- ARCHIVO: 20260903190000_user_deletion.sql
begin;

create or replace function public.delete_user(auth_token text, user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor public.app_users;
  target public.app_users;
begin
  actor := public.require_admin(auth_token);
  select * into target from public.app_users where id = user_id;
  if target.id is null then return jsonb_build_object('deleted', false, 'reason', 'not_found'); end if;
  if target.id = actor.id then raise exception 'No puedes eliminar tu propio usuario mientras tienes la sesion abierta.'; end if;
  if target.role = 'admin' and target.is_active
     and not exists(select 1 from public.app_users u where u.id <> target.id and u.role = 'admin' and u.is_active) then
    raise exception 'No puedes eliminar el ultimo administrador activo.';
  end if;
  delete from public.app_users where id = target.id;
  return jsonb_build_object('deleted', true, 'id', target.id, 'full_name', target.full_name);
end;
$$;

grant execute on function public.delete_user(text, uuid) to anon, authenticated;

commit;


-- ARCHIVO: 20260903210000_user_management_fix.sql
begin;

create or replace function public.save_user(
  auth_token text,
  id uuid,
  full_name text,
  username text,
  pin text default '',
  role text default 'waiter',
  is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  saved public.app_users;
  current_row public.app_users;
begin
  perform public.require_admin($1);

  if trim($3) = '' or lower(trim($4)) !~ '^[a-z0-9._-]{3,40}$' then
    raise exception 'Nombre o usuario invalido.';
  end if;
  if $5 <> '' and $5 !~ '^[0-9]{4,12}$' then
    raise exception 'El PIN debe tener entre 4 y 12 digitos.';
  end if;

  select u.* into current_row
  from public.app_users u
  where u.id = $2;

  if current_row.id is null and $5 = '' then
    raise exception 'El PIN es obligatorio para un usuario nuevo.';
  end if;
  if current_row.role = 'admin' and ($6 <> 'admin' or not $7)
     and not exists (
       select 1 from public.app_users u
       where u.id <> current_row.id and u.role = 'admin' and u.is_active
     ) then
    raise exception 'No puedes desactivar o cambiar el rol del ultimo administrador.';
  end if;

  insert into public.app_users(id, full_name, username, pin_hash, role, is_active)
  values (
    $2,
    trim($3),
    lower(trim($4)),
    crypt($5, gen_salt('bf', 10)),
    case when $6 = 'admin' then 'admin' else 'waiter' end,
    $7
  )
  on conflict on constraint app_users_pkey do update set
    full_name = excluded.full_name,
    username = excluded.username,
    role = excluded.role,
    is_active = excluded.is_active,
    pin_hash = case when $5 <> '' then crypt($5, gen_salt('bf', 10)) else app_users.pin_hash end
  returning * into saved;

  return public.public_user(saved);
exception
  when unique_violation then
    raise exception 'Ese nombre de usuario ya esta en uso.';
end;
$$;

grant execute on function public.save_user(text, uuid, text, text, text, text, boolean) to anon, authenticated;

create or replace function public.login(username text, pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized text := lower(trim($1));
  found_user public.app_users;
  attempt public.login_attempts;
  raw_token text;
  expiry timestamptz := now() + interval '12 hours';
begin
  select a.* into attempt from public.login_attempts a where a.username = normalized;
  if attempt.blocked_until > now() then return null; end if;

  select u.* into found_user
  from public.app_users u
  where u.username = normalized and u.is_active
  limit 1;

  if found_user.id is null or crypt($2, found_user.pin_hash) <> found_user.pin_hash then
    insert into public.login_attempts(username, attempts, blocked_until)
    values (normalized, 1, null)
    on conflict on constraint login_attempts_pkey do update set
      attempts = case when login_attempts.blocked_until <= now() then 1 else login_attempts.attempts + 1 end,
      blocked_until = case when login_attempts.attempts + 1 >= 8 then now() + interval '5 minutes' else login_attempts.blocked_until end,
      updated_at = now();
    return null;
  end if;

  delete from public.login_attempts a where a.username = normalized;
  delete from public.auth_sessions s where s.expires_at <= now();
  raw_token := encode(gen_random_bytes(32), 'hex');
  insert into public.auth_sessions(user_id, token_hash, expires_at)
  values (found_user.id, encode(digest(raw_token, 'sha256'), 'hex'), expiry);
  update public.app_users u set last_login_at = now() where u.id = found_user.id returning u.* into found_user;
  return jsonb_build_object('token', raw_token, 'expires_at', expiry, 'user', public.public_user(found_user));
end;
$$;

grant execute on function public.login(text, text) to anon, authenticated;

commit;


-- ARCHIVO: 20260923190000_roles_permissions.sql
-- Roles Jefe / Administrador / Mesero y permisos por sección.
-- Convierte los administradores existentes en Jefes para conservar el acceso total.

begin;

alter table public.app_users
  add column if not exists permissions jsonb not null default '[]'::jsonb;

alter table public.app_users drop constraint if exists app_users_role_check;
update public.app_users set role = 'boss' where role = 'admin';
alter table public.app_users
  add constraint app_users_role_check check (role in ('boss', 'admin', 'waiter'));

create or replace function public.public_user(user_value public.app_users)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'id', user_value.id,
    'full_name', user_value.full_name,
    'username', user_value.username,
    'role', user_value.role,
    'permissions', coalesce(user_value.permissions, '[]'::jsonb),
    'is_active', user_value.is_active,
    'last_login_at', user_value.last_login_at,
    'created_at', user_value.created_at,
    'updated_at', user_value.updated_at
  );
$$;

create or replace function public.app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce((public.app_user_for_token(public.request_header('x-app-token'))).role in ('boss', 'admin'), false);
$$;

create or replace function public.app_is_boss()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce((public.app_user_for_token(public.request_header('x-app-token'))).role = 'boss', false);
$$;

create or replace function public.app_can_access_section(section_name text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select case
    when (staff).id is null then false
    when (staff).role = 'boss' then true
    when (staff).role <> 'admin' then section_name = 'service'
    else coalesce((staff).permissions, '[]'::jsonb) ? section_name
  end
  from (select public.app_user_for_token(public.request_header('x-app-token')) as staff) current_staff;
$$;

create or replace function public.require_boss(token text)
returns public.app_users
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare result public.app_users;
begin
  result := public.require_app_user(token);
  if result.role <> 'boss' then raise exception 'Permiso exclusivo del Jefe.'; end if;
  return result;
end;
$$;

-- Las funciones administrativas históricas pasan a ser exclusivas del Jefe.
create or replace function public.require_admin(token text)
returns public.app_users
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  return public.require_boss(token);
end;
$$;

create or replace function public.list_users(auth_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  perform public.require_boss(auth_token);
  return (select coalesce(jsonb_agg(public.public_user(u) order by u.full_name), '[]'::jsonb) from public.app_users u);
end;
$$;

drop function if exists public.save_user(text, uuid, text, text, text, text, boolean);

create function public.save_user(
  auth_token text,
  id uuid,
  full_name text,
  username text,
  pin text default '',
  role text default 'waiter',
  is_active boolean default true,
  permissions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  saved public.app_users;
  current_row public.app_users;
  clean_role text := case when $6 in ('boss', 'admin', 'waiter') then $6 else 'waiter' end;
  clean_permissions jsonb := case when $6 = 'admin' and jsonb_typeof(coalesce($8, '[]'::jsonb)) = 'array' then coalesce($8, '[]'::jsonb) else '[]'::jsonb end;
begin
  perform public.require_boss($1);
  if trim($3) = '' or lower(trim($4)) !~ '^[a-z0-9._-]{3,40}$' then raise exception 'Nombre o usuario invalido.'; end if;
  if $5 <> '' and $5 !~ '^[0-9]{4,12}$' then raise exception 'El PIN debe tener entre 4 y 12 digitos.'; end if;
  if clean_role = 'admin' and jsonb_array_length(clean_permissions) = 0 then raise exception 'Selecciona al menos una seccion para el Administrador.'; end if;

  select u.* into current_row from public.app_users u where u.id = $2;
  if current_row.id is null and $5 = '' then raise exception 'El PIN es obligatorio para un usuario nuevo.'; end if;
  if current_row.role = 'boss' and (clean_role <> 'boss' or not $7)
     and not exists(select 1 from public.app_users u where u.id <> current_row.id and u.role = 'boss' and u.is_active) then
    raise exception 'No puedes desactivar o cambiar el rol del ultimo Jefe.';
  end if;

  insert into public.app_users(id, full_name, username, pin_hash, role, is_active, permissions)
  values ($2, trim($3), lower(trim($4)), crypt($5, gen_salt('bf', 10)), clean_role, $7, clean_permissions)
  on conflict on constraint app_users_pkey do update set
    full_name = excluded.full_name,
    username = excluded.username,
    role = excluded.role,
    is_active = excluded.is_active,
    permissions = excluded.permissions,
    pin_hash = case when $5 <> '' then crypt($5, gen_salt('bf', 10)) else app_users.pin_hash end
  returning * into saved;
  return public.public_user(saved);
exception when unique_violation then
  raise exception 'Ese nombre de usuario ya esta en uso.';
end;
$$;

create or replace function public.delete_user(auth_token text, user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare actor public.app_users; target public.app_users;
begin
  actor := public.require_boss(auth_token);
  select * into target from public.app_users where id = user_id;
  if target.id is null then return jsonb_build_object('deleted', false, 'reason', 'not_found'); end if;
  if target.id = actor.id then raise exception 'No puedes eliminar tu propio usuario mientras tienes la sesion abierta.'; end if;
  if target.role = 'boss' and target.is_active
     and not exists(select 1 from public.app_users u where u.id <> target.id and u.role = 'boss' and u.is_active) then
    raise exception 'No puedes eliminar el ultimo Jefe activo.';
  end if;
  delete from public.app_users where id = target.id;
  return jsonb_build_object('deleted', true, 'id', target.id, 'full_name', target.full_name);
end;
$$;

grant execute on function public.app_is_boss() to anon, authenticated;
grant execute on function public.app_can_access_section(text) to anon, authenticated;
revoke all on function public.require_boss(text) from public, anon, authenticated;
grant execute on function public.save_user(text, uuid, text, text, text, text, boolean, jsonb) to anon, authenticated;

-- Separa crear/editar de eliminar: Administrador puede operar sus secciones,
-- pero únicamente Jefe puede borrar datos.
drop policy if exists admin_business_all on public.business_settings;
drop policy if exists admin_categories_all on public.menu_categories;
drop policy if exists admin_items_all on public.menu_items;
drop policy if exists admin_tables_all on public.restaurant_tables;

create policy staff_business_insert on public.business_settings for insert to anon with check (public.app_can_access_section('brand'));
create policy staff_business_update on public.business_settings for update to anon using (public.app_can_access_section('brand')) with check (public.app_can_access_section('brand'));
create policy boss_business_delete on public.business_settings for delete to anon using (public.app_is_boss());

create policy staff_categories_insert on public.menu_categories for insert to anon with check (public.app_can_access_section('menu') or public.app_can_access_section('inventory'));
create policy staff_categories_update on public.menu_categories for update to anon using (public.app_can_access_section('menu') or public.app_can_access_section('inventory')) with check (public.app_can_access_section('menu') or public.app_can_access_section('inventory'));
create policy boss_categories_delete on public.menu_categories for delete to anon using (public.app_is_boss());

create policy staff_items_insert on public.menu_items for insert to anon with check (public.app_can_access_section('menu') or public.app_can_access_section('inventory'));
create policy staff_items_update on public.menu_items for update to anon using (public.app_can_access_section('menu') or public.app_can_access_section('inventory')) with check (public.app_can_access_section('menu') or public.app_can_access_section('inventory'));
create policy boss_menu_items_delete on public.menu_items for delete to anon using (public.app_is_boss());

create policy staff_tables_insert on public.restaurant_tables for insert to anon with check (public.app_can_access_section('menu'));
create policy staff_tables_update on public.restaurant_tables for update to anon using (public.app_can_access_section('menu')) with check (public.app_can_access_section('menu'));
create policy boss_tables_delete on public.restaurant_tables for delete to anon using (public.app_is_boss());

drop policy if exists staff_items_delete on public.session_items;
drop policy if exists staff_requests_delete on public.service_requests;
drop policy if exists staff_sessions_delete on public.table_sessions;
create policy boss_session_items_delete on public.session_items for delete to anon using (public.app_is_boss());
create policy boss_service_requests_delete on public.service_requests for delete to anon using (public.app_is_boss());
create policy boss_table_sessions_delete on public.table_sessions for delete to anon using (public.app_is_boss());

create or replace function public.enforce_staff_mutation_limits()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare actor public.app_users;
begin
  actor := public.app_user_for_token(public.request_header('x-app-token'));
  if actor.id is null then return new; end if;
  if tg_table_name = 'session_items' and new.status = 'cancelled' and old.status is distinct from new.status and actor.role <> 'boss' then
    raise exception 'Solo el Jefe puede eliminar consumos.';
  end if;
  if tg_table_name = 'table_sessions' and actor.role = 'waiter' and new.status is distinct from old.status then
    raise exception 'El Mesero solo puede agregar o editar consumos.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_session_item_role_limits on public.session_items;
create trigger enforce_session_item_role_limits before update on public.session_items
for each row execute function public.enforce_staff_mutation_limits();

drop trigger if exists enforce_table_session_role_limits on public.table_sessions;
create trigger enforce_table_session_role_limits before update on public.table_sessions
for each row execute function public.enforce_staff_mutation_limits();

commit;


-- ARCHIVO: 20260930100000_tip_settings_default_off.sql
alter table public.business_settings
  add column if not exists tips_enabled boolean not null default false,
  add column if not exists tip_percentage integer not null default 10;

alter table public.business_settings
  alter column tips_enabled set default false,
  alter column tip_percentage set default 10;

alter table public.business_settings
  drop constraint if exists business_settings_tip_percentage_check;

alter table public.business_settings
  add constraint business_settings_tip_percentage_check
  check (tip_percentage between 1 and 100);


-- ARCHIVO: 20261007190000_abonos_turnos_caja.sql
-- Ejecutar UNA vez en el SQL Editor del backend compartido por BCA y Offline.
-- Aditivo e idempotente. No borra cuentas, consumos, ventas ni colas existentes.
begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.restaurant_tables add column if not exists is_outdoor boolean not null default false;

create table if not exists public.session_payments (
  id uuid primary key,
  -- Conserva el registro cuando Apps Script archiva y retira la cuenta.
  session_id uuid not null,
  amount numeric(12,0) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash','transfer','breb')),
  reference text not null default '',
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists session_payments_session_idx on public.session_payments(session_id, created_at);
alter table public.session_payments drop constraint if exists session_payments_session_id_fkey;
alter table public.session_payments enable row level security;
revoke all on public.session_payments from anon, authenticated;

create or replace function public.record_session_payment(auth_token text, payment_id uuid, p_session_id uuid, p_amount numeric, p_method text, p_reference text default '', p_created_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare staff jsonb; account public.table_sessions; saved public.session_payments; consumed numeric; paid numeric;
begin
  staff := to_jsonb(public.require_app_user(auth_token));
  select * into account from public.table_sessions s where s.id = p_session_id for update;
  if not found then raise exception 'La cuenta no existe. El abono no fue registrado.'; end if;
  select * into saved from public.session_payments p where p.id = payment_id;
  if found then
    if saved.session_id <> p_session_id or saved.amount <> p_amount or saved.payment_method <> p_method or saved.reference <> left(coalesce(p_reference,''),100) then
      raise exception 'El identificador de abono ya pertenece a otro pago.';
    end if;
    return jsonb_build_object('payment',to_jsonb(saved),'duplicate',true);
  end if;
  if account.status <> 'open' then raise exception 'La cuenta ya está cerrada. El abono no fue registrado.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) or p_method not in ('cash','transfer','breb') then raise exception 'Abono no válido.'; end if;
  select coalesce(sum(i.quantity*round(i.unit_price)),0) into consumed from public.session_items i where i.session_id=p_session_id and i.status <> 'cancelled';
  select coalesce(sum(p.amount),0) into paid from public.session_payments p where p.session_id=p_session_id;
  if p_amount > consumed-paid then raise exception 'El abono supera el saldo pendiente. Actualiza la cuenta.'; end if;
  insert into public.session_payments(id,session_id,amount,payment_method,reference,created_by_user_id,created_at)
  values(payment_id,p_session_id,p_amount,p_method,left(coalesce(p_reference,''),100),(staff->>'id')::uuid,least(coalesce(p_created_at,now()),now())) returning * into saved;
  return jsonb_build_object('payment',to_jsonb(saved),'duplicate',false);
end;
$$;
revoke all on function public.record_session_payment(text,uuid,uuid,numeric,text,text,timestamptz) from public;
grant execute on function public.record_session_payment(text,uuid,uuid,numeric,text,text,timestamptz) to anon, authenticated;

create or replace function public.get_session_payments(p_session_id uuid, auth_token text default '', p_table_id uuid default null, p_table_access_code text default '')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if coalesce(auth_token,'') <> '' then perform public.require_app_user(auth_token);
  elsif not public.valid_table_access(p_table_id,p_table_access_code) or not exists(select 1 from public.table_sessions s where s.id=p_session_id and s.table_id=p_table_id) then
    raise exception 'Acceso a la cuenta no autorizado.';
  end if;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at,p.id),'[]'::jsonb) into result from public.session_payments p where p.session_id=p_session_id;
  return jsonb_build_object('payments',result);
end;
$$;
revoke all on function public.get_session_payments(uuid,text,uuid,text) from public;
grant execute on function public.get_session_payments(uuid,text,uuid,text) to anon, authenticated;

-- Lectura autorizada de una cuenta: no interpreta cero filas de REST como
-- prueba de eliminación cuando una política impide verlas.
create or replace function public.get_table_session_for_sync(auth_token text,p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  perform public.require_app_user(auth_token);
  select to_jsonb(s) into result from public.table_sessions s where s.id=p_session_id;
  return jsonb_build_object('session',result,'exists',result is not null);
end;
$$;
create or replace function public.replay_table_session_change(auth_token text,p_session_id uuid,p_patch jsonb,p_expected_status text default '',p_expected_paid numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare current_row public.table_sessions; next_row public.table_sessions; consumed numeric; paid numeric; field text;
begin
  perform public.require_app_user(auth_token);
  if jsonb_typeof(p_patch) <> 'object' then raise exception 'Cambio de cuenta no válido.'; end if;
  for field in select jsonb_object_keys(p_patch) loop
    if field not in ('payer_name','assigned_waiter_id','table_id','sale_channel','notes','payment_method','updated_at','status','closed_at','subtotal','discount','tax','service_fee','total') then raise exception 'Campo de cuenta no permitido: %',field; end if;
  end loop;
  select * into current_row from public.table_sessions s where s.id=p_session_id for update;
  if not found then raise exception 'La cuenta no existe. No se aplicó el cambio.'; end if;
  select coalesce(sum(p.amount),0) into paid from public.session_payments p where p.session_id=p_session_id;
  if p_expected_paid is not null and paid <> p_expected_paid then raise exception 'Los abonos cambiaron en otra sesión. Actualiza la cuenta antes de cobrar.'; end if;
  if current_row.status='closed' and p_patch->>'status'='closed' and current_row.closed_at=(p_patch->>'closed_at')::timestamptz then
    return jsonb_build_object('session',to_jsonb(current_row),'duplicate',true);
  end if;
  if current_row.status <> 'open' or (p_expected_status <> '' and current_row.status <> p_expected_status) then raise exception 'La cuenta cambió de estado. Actualiza antes de continuar.'; end if;
  next_row := jsonb_populate_record(current_row,p_patch);
  if p_patch ? 'status' then
    if next_row.status <> 'closed' then raise exception 'Estado de cuenta no permitido.'; end if;
    select coalesce(sum(i.quantity*round(i.unit_price)),0) into consumed from public.session_items i where i.session_id=p_session_id and i.status <> 'cancelled';
    if paid > consumed then raise exception 'Los abonos superan el consumo actual. Revisa la cuenta antes de cobrar.'; end if;
    if next_row.subtotal <> consumed or next_row.total <> consumed or next_row.discount <> 0 or next_row.tax <> 0 or next_row.service_fee <> 0 then raise exception 'El consumo cambió. Actualiza la cuenta antes de cobrar.'; end if;
  elsif p_patch ?| array['closed_at','subtotal','discount','tax','service_fee','total'] then
    raise exception 'No se pueden cambiar importes sin cerrar la cuenta.';
  end if;
  update public.table_sessions s set payer_name=next_row.payer_name,assigned_waiter_id=next_row.assigned_waiter_id,
    table_id=next_row.table_id,sale_channel=next_row.sale_channel,notes=next_row.notes,payment_method=next_row.payment_method,
    status=next_row.status,closed_at=next_row.closed_at,subtotal=next_row.subtotal,discount=next_row.discount,
    tax=next_row.tax,service_fee=next_row.service_fee,total=next_row.total,updated_at=now()
  where s.id=p_session_id returning s.* into current_row;
  return jsonb_build_object('session',to_jsonb(current_row),'duplicate',false);
end;
$$;
revoke all on function public.get_table_session_for_sync(text,uuid),public.replay_table_session_change(text,uuid,jsonb,text,numeric) from public;
grant execute on function public.get_table_session_for_sync(text,uuid),public.replay_table_session_change(text,uuid,jsonb,text,numeric) to anon,authenticated;

-- Copia la implementación administrativa actual, con sus permisos y campos,
-- antes de añadir abonos al resultado. No reemplaza la autenticación existente.
do $patch$
declare definition text;
begin
  if to_regprocedure('public.get_admin_snapshot_before_abonos(text)') is null then
    -- Conserva las mesas exteriores marcadas por el BCA anterior. Solo se
    -- convierte una vez; repetir la migración no revierte cambios posteriores.
    update public.restaurant_tables set is_outdoor=true
    where qr_image_url like 'tn-outdoor:v1:%' and is_outdoor is false;
    definition := pg_get_functiondef('public.get_admin_snapshot(text)'::regprocedure);
    definition := regexp_replace(definition,'FUNCTION public\.get_admin_snapshot\(', 'FUNCTION public.get_admin_snapshot_before_abonos(', 'i');
    execute definition;
  end if;
end;
$patch$;
revoke all on function public.get_admin_snapshot_before_abonos(text) from public, anon, authenticated;
create or replace function public.get_admin_snapshot(auth_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare snapshot jsonb; sessions jsonb;
begin
  snapshot := public.get_admin_snapshot_before_abonos(auth_token);
  select coalesce(jsonb_agg(account || jsonb_build_object('session_payments',(
    select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at,p.id),'[]'::jsonb)
    from public.session_payments p where p.session_id=(account->>'id')::uuid
  ))),'[]'::jsonb) into sessions from jsonb_array_elements(coalesce(snapshot->'sessions','[]'::jsonb)) account;
  return snapshot || jsonb_build_object('sessions',sessions,'pos_features',jsonb_build_object('abonos',true,'turnos',true,'remote_drawer',true));
end;
$$;
grant execute on function public.get_admin_snapshot(text) to anon, authenticated;

-- Limita canciones dentro del mismo turno pendiente. El bloqueo por mesa
-- evita superar cinco enviando desde varios celulares simultáneamente.
create or replace function public.enforce_song_turn_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare queued integer;
begin
  if new.request_type <> 'other' or lower(new.message) not like '%solicita la canci%n:%' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('song:'||new.table_id::text,0));
  if exists(select 1 from public.service_requests r where r.id=new.id) then return new; end if;
  select count(*) into queued from public.service_requests r where r.table_id=new.table_id
    and r.status='pending' and r.request_type='other' and lower(r.message) like '%solicita la canci%n:%';
  if queued >= 5 then raise exception 'Puedes pedir máximo 5 canciones por turno. Espera a que termine tu turno.'; end if;
  return new;
end;
$$;
drop trigger if exists service_requests_song_limit on public.service_requests;
create trigger service_requests_song_limit before insert on public.service_requests for each row execute function public.enforce_song_turn_limit();

create or replace function public.get_service_request_queue(p_table_id uuid, p_table_access_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.valid_table_access(p_table_id,p_table_access_code) then raise exception 'Mesa no autorizada.'; end if;
  with waiting as (
    select r.*, case when r.request_type='other' and lower(r.message) like '%solicita la canci%n:%' then 'song' else 'service' end as queue_kind
    from public.service_requests r where r.status='pending'
  ), turns as (
    select queue_kind,table_id,min(created_at) first_at from waiting group by queue_kind,table_id
  ), ranked as (
    select *,row_number() over(partition by queue_kind order by first_at,table_id) position from turns
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'kind',w.queue_kind,'position',r.position,'status',w.status,'created_at',w.created_at) order by w.created_at),'[]'::jsonb)
  into result from waiting w join ranked r using(queue_kind,table_id) where w.table_id=p_table_id;
  return jsonb_build_object('requests',result);
end;
$$;
revoke all on function public.get_service_request_queue(uuid,text) from public;
grant execute on function public.get_service_request_queue(uuid,text) to anon, authenticated;

-- Una orden remota se entrega a UNA caja configurada y con señal reciente.
-- El secreto del controlador protege la recepción y la confirmación.
create table if not exists public.pos_drawer_devices (
  id uuid primary key, secret_hash text not null, label text not null,
  last_seen timestamptz not null default now(), user_id uuid not null
);
create table if not exists public.pos_drawer_commands (
  id uuid primary key, device_id uuid not null references public.pos_drawer_devices(id),
  requested_by uuid not null, created_at timestamptz not null default now(),
  status text not null default 'pending' check(status in ('pending','claimed','accepted','failed','expired')),
  claimed_at timestamptz, finished_at timestamptz, error text not null default ''
);
create index if not exists pos_drawer_commands_device_idx on public.pos_drawer_commands(device_id,status,created_at);
alter table public.pos_drawer_devices enable row level security;
alter table public.pos_drawer_commands enable row level security;
revoke all on public.pos_drawer_devices, public.pos_drawer_commands from anon, authenticated;

create or replace function public.register_pos_drawer(auth_token text,p_device_id uuid,p_secret text,p_label text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare staff jsonb; old public.pos_drawer_devices;
begin
  staff := to_jsonb(public.require_app_user(auth_token));
  if length(coalesce(p_secret,'')) < 32 then raise exception 'Controlador no válido.'; end if;
  select * into old from public.pos_drawer_devices d where d.id=p_device_id for update;
  if found and old.secret_hash <> encode(digest(p_secret,'sha256'),'hex') then raise exception 'Identidad de controlador no válida.'; end if;
  insert into public.pos_drawer_devices(id,secret_hash,label,last_seen,user_id)
  values(p_device_id,encode(digest(p_secret,'sha256'),'hex'),left(coalesce(p_label,'Caja POS'),100),now(),(staff->>'id')::uuid)
  on conflict(id) do update set last_seen=now(),label=excluded.label,user_id=excluded.user_id;
  return jsonb_build_object('ok',true);
end;
$$;
create or replace function public.request_pos_drawer(auth_token text,p_command_id uuid,p_device_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare staff jsonb; target public.pos_drawer_devices; command public.pos_drawer_commands;
begin
  staff := to_jsonb(public.require_app_user(auth_token));
  select * into command from public.pos_drawer_commands c where c.id=p_command_id;
  if found then
    if command.requested_by <> (staff->>'id')::uuid then raise exception 'Orden no autorizada.'; end if;
    return jsonb_build_object('command',to_jsonb(command));
  end if;
  select * into target from public.pos_drawer_devices d where d.last_seen > now()-interval '12 seconds'
    and (p_device_id is null or d.id=p_device_id) order by d.last_seen desc,d.id limit 1;
  if not found then raise exception 'No hay una caja conectada. Abre Tienda Nápoles en el PC de la caja y configura la impresora.'; end if;
  insert into public.pos_drawer_commands(id,device_id,requested_by) values(p_command_id,target.id,(staff->>'id')::uuid) returning * into command;
  return jsonb_build_object('command',to_jsonb(command),'device',target.label);
end;
$$;
create or replace function public.claim_pos_drawer(auth_token text,p_device_id uuid,p_secret text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare command public.pos_drawer_commands;
begin
  perform public.require_app_user(auth_token);
  if not exists(select 1 from public.pos_drawer_devices d where d.id=p_device_id and d.secret_hash=encode(digest(p_secret,'sha256'),'hex')) then raise exception 'Controlador no autorizado.'; end if;
  update public.pos_drawer_commands c set status='expired',finished_at=now() where c.device_id=p_device_id and c.status='pending' and c.created_at < now()-interval '15 seconds';
  select * into command from public.pos_drawer_commands c where c.device_id=p_device_id and c.status='pending' order by c.created_at,c.id for update skip locked limit 1;
  if not found then return jsonb_build_object('command',null); end if;
  update public.pos_drawer_commands c set status='claimed',claimed_at=now() where c.id=command.id;
  return jsonb_build_object('command',to_jsonb(command));
end;
$$;
create or replace function public.finish_pos_drawer(auth_token text,p_device_id uuid,p_secret text,p_command_id uuid,p_accepted boolean,p_error text default '')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.require_app_user(auth_token);
  if not exists(select 1 from public.pos_drawer_devices d where d.id=p_device_id and d.secret_hash=encode(digest(p_secret,'sha256'),'hex')) then raise exception 'Controlador no autorizado.'; end if;
  update public.pos_drawer_commands c set status=case when p_accepted then 'accepted' else 'failed' end,finished_at=now(),error=left(coalesce(p_error,''),200)
  where c.id=p_command_id and c.device_id=p_device_id and c.status='claimed';
  return jsonb_build_object('ok',found);
end;
$$;
create or replace function public.get_pos_drawer_command(auth_token text,p_command_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare staff jsonb; result jsonb;
begin
  staff := to_jsonb(public.require_app_user(auth_token));
  select to_jsonb(c) into result from public.pos_drawer_commands c where c.id=p_command_id and c.requested_by=(staff->>'id')::uuid;
  return jsonb_build_object('command',result);
end;
$$;
revoke all on function public.register_pos_drawer(text,uuid,text,text),public.request_pos_drawer(text,uuid,uuid),public.claim_pos_drawer(text,uuid,text),public.finish_pos_drawer(text,uuid,text,uuid,boolean,text),public.get_pos_drawer_command(text,uuid) from public;
grant execute on function public.register_pos_drawer(text,uuid,text,text),public.request_pos_drawer(text,uuid,uuid),public.claim_pos_drawer(text,uuid,text),public.finish_pos_drawer(text,uuid,text,uuid,boolean,text),public.get_pos_drawer_command(text,uuid) to anon,authenticated;

notify pgrst, 'reload schema';
commit;


-- ARCHIVO: 20261007230000_abonos_consumos_coherentes.sql
-- Ejecutar UNA vez en el backend compartido, después de la migración de abonos.
-- Idempotente. Conserva los abonos archivados de cuentas cerradas.
begin;

-- Usa el mismo bloqueo de cuenta que record_session_payment. Un abono y una
-- modificación de consumo nunca validan el saldo simultáneamente.
create or replace function public.lock_session_consumption_account()
returns trigger language plpgsql security definer set search_path = public as $$
declare account_ids uuid[];
begin
  if tg_op = 'INSERT' then account_ids := array[new.session_id];
  elsif tg_op = 'DELETE' then account_ids := array[old.session_id];
  else account_ids := array[old.session_id,new.session_id];
  end if;
  perform 1 from public.table_sessions s where s.id = any(account_ids) order by s.id for update;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- Valida al terminar la sentencia para permitir retirar TODOS los productos
-- juntos, sin rechazar estados intermedios de una eliminación de varias filas.
create or replace function public.validate_session_consumption_payments()
returns trigger language plpgsql security definer set search_path = public as $$
declare account_ids uuid[]; account_id uuid; consumed numeric; paid numeric;
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct session_id) into account_ids from new_consumption_rows;
  elsif tg_op = 'DELETE' then
    select array_agg(distinct session_id) into account_ids from old_consumption_rows;
  else
    select array_agg(distinct session_id) into account_ids from (
      select session_id from new_consumption_rows union select session_id from old_consumption_rows
    ) changed;
  end if;
  for account_id in select s.id from public.table_sessions s
    where s.id = any(account_ids) and s.status = 'open' order by s.id for update
  loop
    select coalesce(sum(i.quantity*round(i.unit_price)),0) into consumed
      from public.session_items i where i.session_id=account_id and i.status <> 'cancelled';
    select coalesce(sum(p.amount),0) into paid from public.session_payments p where p.session_id=account_id;
    if consumed > 0 and consumed < paid then
      raise exception 'No se puede reducir el consumo por debajo de los abonos. Conserva productos por el valor abonado o retira todo el consumo.';
    end if;
    if consumed = 0 and paid > 0 then
      delete from public.session_payments p where p.session_id=account_id;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists session_consumption_account_lock on public.session_items;
create trigger session_consumption_account_lock before insert or update or delete
  on public.session_items for each row execute function public.lock_session_consumption_account();
drop trigger if exists session_consumption_payments_insert on public.session_items;
create trigger session_consumption_payments_insert after insert on public.session_items
  referencing new table as new_consumption_rows for each statement execute function public.validate_session_consumption_payments();
drop trigger if exists session_consumption_payments_update on public.session_items;
create trigger session_consumption_payments_update after update on public.session_items
  referencing old table as old_consumption_rows new table as new_consumption_rows
  for each statement execute function public.validate_session_consumption_payments();
drop trigger if exists session_consumption_payments_delete on public.session_items;
create trigger session_consumption_payments_delete after delete on public.session_items
  referencing old table as old_consumption_rows for each statement execute function public.validate_session_consumption_payments();
revoke all on function public.lock_session_consumption_account(),public.validate_session_consumption_payments() from public,anon,authenticated;

-- Limpia únicamente cuentas abiertas que ya quedaron sin consumo antes de
-- instalar esta regla. No altera cuentas con consumo ni pagos archivados.
do $$
declare account_id uuid;
begin
  for account_id in select s.id from public.table_sessions s where s.status='open' order by s.id for update loop
    if not exists(select 1 from public.session_items i where i.session_id=account_id and i.status <> 'cancelled' and i.quantity*round(i.unit_price) > 0) then
      delete from public.session_payments p where p.session_id=account_id;
    end if;
  end loop;
end;
$$;
notify pgrst, 'reload schema';
commit;


-- ARCHIVO: 20261008120000_song_chat_turn_limit.sql
-- Tras cinco canciones pendientes de una mesa, cierra su chat de cliente
-- hasta que el equipo atienda el turno. Comparte el bloqueo con el limite
-- de canciones para cubrir solicitudes simultaneas desde varios dispositivos.
create or replace function public.enforce_song_chat_turn_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sender_type <> 'client' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('song:' || new.table_id::text, 0));
  if exists(select 1 from public.chat_messages m where m.id = new.id) then return new; end if;
  if (select count(*) from public.service_requests r
      where r.table_id = new.table_id and r.status = 'pending'
        and r.request_type = 'other' and lower(r.message) like '%solicita la canci%n:%') >= 5 then
    raise exception 'Ya solicitaste 5 canciones en este turno. Espera a que termine tu turno.';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_messages_song_turn_limit on public.chat_messages;
create trigger chat_messages_song_turn_limit before insert on public.chat_messages
for each row execute function public.enforce_song_chat_turn_limit();


-- ARCHIVO: 20261013160000_fast_reports_and_client_bill.sql
begin;

alter table public.business_settings
  add column if not exists client_bill_enabled boolean not null default true;

-- Realtime solo anuncia que hay cambios. Los importes se leen con el token del empleado.
create table if not exists public.pos_report_changes (
  sequence bigint generated always as identity primary key,
  operation_id text not null unique,
  action text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.pos_report_changes enable row level security;
revoke all on public.pos_report_changes from public, anon, authenticated;

create or replace function public.publish_report_change(auth_token text, p_operation_id text, p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare staff jsonb; saved public.pos_report_changes;
begin
  staff := to_jsonb(public.require_app_user(auth_token));
  if staff->>'role' not in ('boss','admin') then raise exception 'No autorizado'; end if;
  if p_action not in ('record_sale','edit_sale','delete_sale','clear_income','adjust_inventory','upsert_inventory','set_inventory_stock','delete_inventory','clear_inventory','update_inventory_movement_cost','clear_inventory_movements')
     or coalesce(length(p_operation_id),0) not between 1 and 200
     or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 2000000 then
    raise exception 'Cambio no válido';
  end if;
  -- Orden de confirmación estable también cuando dos equipos escriben juntos.
  perform pg_advisory_xact_lock(1313102026);
  select * into saved from public.pos_report_changes c where c.operation_id=p_operation_id;
  if found then
    if saved.action <> p_action then raise exception 'Operación ya utilizada'; end if;
    return jsonb_build_object('ok',true,'sequence',saved.sequence,'duplicate',true);
  end if;
  insert into public.pos_report_changes(operation_id,action,payload)
    values(p_operation_id,p_action,p_payload) returning * into saved;
  perform realtime.send('{}'::jsonb,'reports-committed','admin',false);
  return jsonb_build_object('ok',true,'sequence',saved.sequence);
end;
$$;

create or replace function public.get_report_changes(auth_token text, p_after bigint default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare staff jsonb; sales_allowed boolean; stock_allowed boolean; changes jsonb;
begin
  staff := to_jsonb(public.require_app_user(auth_token));
  sales_allowed := staff->>'role'='boss' or (staff->>'role'='admin' and (staff->'permissions' is null or staff->'permissions'='null'::jsonb or staff->'permissions' ? 'income'));
  stock_allowed := staff->>'role'='boss' or (staff->>'role'='admin' and (staff->'permissions' is null or staff->'permissions'='null'::jsonb or staff->'permissions' ?| array['inventory','movements']));
  if not sales_allowed and not stock_allowed then raise exception 'No autorizado'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('sequence',c.sequence,'action',c.action,'confirmedAt',c.created_at,'payload',
    (case when sales_allowed then c.payload else c.payload-'invoice'-'saleId' end)
    || case when stock_allowed then '{}'::jsonb else jsonb_build_object('movements','[]'::jsonb,'items','[]'::jsonb) end
  ) order by c.sequence),'[]'::jsonb) into changes
  from (select * from public.pos_report_changes where sequence > greatest(p_after,0) order by sequence limit 200) c;
  return jsonb_build_object('ok',true,'changes',changes,'hasMore',jsonb_array_length(changes)=200);
end;
$$;

revoke all on function public.publish_report_change(text,text,text,jsonb) from public;
revoke all on function public.get_report_changes(text,bigint) from public;
grant execute on function public.publish_report_change(text,text,text,jsonb) to anon, authenticated;
grant execute on function public.get_report_changes(text,bigint) to anon, authenticated;

notify pgrst, 'reload schema';
commit;


-- ARCHIVO: 20261019190000_pos_menu_cards.sql
-- Biblioteca de imágenes de Carta. No modifica ventas, solicitudes ni sus tablas.
begin;

create table if not exists public.pos_menu_cards (
  id uuid primary key,
  name text not null check (length(trim(name)) between 1 and 80),
  image_path text not null unique,
  all_tables boolean not null default true,
  sort_order integer not null default 0,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create table if not exists public.pos_menu_card_tables (
  card_id uuid references public.pos_menu_cards(id) on delete cascade,
  table_id uuid references public.restaurant_tables(id) on delete cascade,
  primary key(card_id, table_id)
);
create index if not exists pos_menu_card_tables_table_idx on public.pos_menu_card_tables(table_id);
alter table public.pos_menu_cards enable row level security;
alter table public.pos_menu_card_tables enable row level security;
revoke all on public.pos_menu_cards, public.pos_menu_card_tables from public, anon, authenticated;

create or replace function public.pos_menu_can_manage(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(u->>'role' = 'boss' or (u->>'role' = 'admin' and
    (u->'permissions' is null or u->'permissions' = 'null'::jsonb or u->'permissions' ? 'brand')), false)
  from (select to_jsonb(public.app_user_for_token(p_token)) u) actor;
$$;

create or replace function public.pos_list_menu_cards(p_auth_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pos_menu_can_manage(p_auth_token) then raise exception 'No tienes permiso para administrar la Carta.'; end if;
  return coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('table_ids',
    (select coalesce(jsonb_agg(t.table_id order by t.table_id), '[]'::jsonb) from public.pos_menu_card_tables t where t.card_id=c.id))
    order by c.sort_order, c.id) from public.pos_menu_cards c), '[]'::jsonb);
end; $$;

create or replace function public.pos_save_menu_card(p_id uuid, p_name text, p_image_path text,
  p_all_tables boolean, p_table_ids uuid[], p_expected_version integer, p_auth_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare old public.pos_menu_cards; saved public.pos_menu_cards;
begin
  if not public.pos_menu_can_manage(p_auth_token) then raise exception 'No tienes permiso para administrar la Carta.'; end if;
  perform pg_advisory_xact_lock(hashtext('pos_menu_cards'));
  select * into old from public.pos_menu_cards where id=p_id;
  -- Reintentar la misma alta/edición tras perder la respuesta no crea otra carta.
  if old.id is not null and old.name=trim(p_name) and old.image_path=p_image_path and old.all_tables=p_all_tables
    and array(select table_id from public.pos_menu_card_tables where card_id=p_id order by table_id)
      = array(select distinct unnest(coalesce(p_table_ids, array[]::uuid[])) order by 1) then
    return to_jsonb(old);
  end if;
  if p_expected_version is null or coalesce(old.version,0) <> p_expected_version then raise exception 'Otra persona cambió esta carta. Recarga la biblioteca antes de guardar.'; end if;
  if p_id is null or length(trim(coalesce(p_name,''))) not between 1 and 80 or p_all_tables is null then raise exception 'Nombre de carta inválido.'; end if;
  if old.id is null and (select count(*) from public.pos_menu_cards)>=2 then raise exception 'Máximo 2 imágenes. Elimina una antes de subir otra.'; end if;
  if p_image_path !~ ('^cards/' || p_id::text || '/[a-f0-9]{64}\.(jpg|png|webp)$')
    or not exists(select 1 from storage.objects where bucket_id='pos-menu-cards' and name=p_image_path) then
    raise exception 'Primero sube una imagen válida de esta carta.';
  end if;
  if exists(select 1 from unnest(coalesce(p_table_ids,array[]::uuid[])) t(id)
    where not exists(select 1 from public.restaurant_tables r where r.id=t.id and r.is_active)) then
    raise exception 'La selección contiene mesas inactivas. Recarga la biblioteca.';
  end if;
  insert into public.pos_menu_cards(id,name,image_path,all_tables,sort_order)
    values(p_id,trim(p_name),p_image_path,p_all_tables,coalesce((select max(sort_order)+1 from public.pos_menu_cards),0))
    on conflict(id) do update set name=excluded.name,image_path=excluded.image_path,all_tables=excluded.all_tables,
      version=pos_menu_cards.version+1,updated_at=clock_timestamp() returning * into saved;
  delete from public.pos_menu_card_tables where card_id=p_id;
  insert into public.pos_menu_card_tables select p_id, id from (select distinct unnest(coalesce(p_table_ids,array[]::uuid[])) id) t;
  return to_jsonb(saved);
end; $$;

create or replace function public.pos_delete_menu_card(p_id uuid, p_expected_version integer, p_auth_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.pos_menu_can_manage(p_auth_token) then raise exception 'No tienes permiso para administrar la Carta.'; end if;
  perform pg_advisory_xact_lock(hashtext('pos_menu_cards'));
  if p_expected_version is null or exists(select 1 from public.pos_menu_cards where id=p_id and version<>p_expected_version) then
    raise exception 'Otra persona cambió esta carta. Recarga la biblioteca.';
  end if;
  delete from public.pos_menu_cards where id=p_id;
  return jsonb_build_object('ok',true);
end; $$;

create or replace function public.pos_reorder_menu_cards(p_ids uuid[], p_auth_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.pos_menu_can_manage(p_auth_token) then raise exception 'No tienes permiso para administrar la Carta.'; end if;
  perform pg_advisory_xact_lock(hashtext('pos_menu_cards'));
  if coalesce(cardinality(p_ids),0)<>(select count(*) from public.pos_menu_cards)
    or (select count(distinct id) from unnest(p_ids) t(id))<>cardinality(p_ids)
    or exists(select 1 from unnest(p_ids) t(id) where not exists(select 1 from public.pos_menu_cards c where c.id=t.id)) then
    raise exception 'La biblioteca cambió. Recárgala antes de ordenar.';
  end if;
  update public.pos_menu_cards c set sort_order=t.position::integer,version=c.version+1,updated_at=clock_timestamp()
    from unnest(p_ids) with ordinality t(id,position) where c.id=t.id and c.sort_order<>t.position;
  return jsonb_build_object('ok',true);
end; $$;

create or replace function public.pos_get_menu_cards(p_table_id uuid, p_table_access_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.valid_table_access(p_table_id,p_table_access_code) then raise exception 'Selecciona una mesa con un QR válido para ver la Carta.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'image_path',c.image_path)
    order by c.sort_order,c.id) from public.pos_menu_cards c where c.all_tables
    or exists(select 1 from public.pos_menu_card_tables t where t.card_id=c.id and t.table_id=p_table_id)), '[]'::jsonb);
end; $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pos-menu-cards','pos-menu-cards',false,15728640,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.pos_menu_image_readable(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pos_menu_can_manage(public.request_header('x-app-token')) or exists(
    select 1 from public.pos_menu_cards c where c.image_path=p_path and exists(
      select 1 from public.restaurant_tables r where r.is_active and public.valid_table_header(r.id)
      and (c.all_tables or exists(select 1 from public.pos_menu_card_tables t where t.card_id=c.id and t.table_id=r.id))));
$$;
drop policy if exists pos_menu_images_read on storage.objects;
create policy pos_menu_images_read on storage.objects for select to anon,authenticated
using(bucket_id='pos-menu-cards' and public.pos_menu_image_readable(name));
drop policy if exists pos_menu_images_insert on storage.objects;
create policy pos_menu_images_insert on storage.objects for insert to anon,authenticated
with check(bucket_id='pos-menu-cards' and public.pos_menu_can_manage(public.request_header('x-app-token'))
  and name ~ '^cards/[0-9a-f-]{36}/[a-f0-9]{64}\.(jpg|png|webp)$');
-- Objetos inmutables: reemplazar publica una ruta nueva antes de retirar la anterior.
drop policy if exists pos_menu_images_delete on storage.objects;
create or replace function public.pos_menu_image_deletable(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pos_menu_can_manage(public.request_header('x-app-token'))
    and not exists(select 1 from public.pos_menu_cards c where c.image_path=p_path);
$$;
create policy pos_menu_images_delete on storage.objects for delete to anon,authenticated
using(bucket_id='pos-menu-cards' and public.pos_menu_image_deletable(name));

revoke all on function public.pos_menu_can_manage(text),public.pos_menu_image_readable(text),public.pos_menu_image_deletable(text),
  public.pos_list_menu_cards(text),public.pos_save_menu_card(uuid,text,text,boolean,uuid[],integer,text),
  public.pos_delete_menu_card(uuid,integer,text),public.pos_reorder_menu_cards(uuid[],text),public.pos_get_menu_cards(uuid,text) from public;
grant execute on function public.pos_menu_can_manage(text),public.pos_menu_image_readable(text),public.pos_menu_image_deletable(text),
  public.pos_list_menu_cards(text),public.pos_save_menu_card(uuid,text,text,boolean,uuid[],integer,text),
  public.pos_delete_menu_card(uuid,integer,text),public.pos_reorder_menu_cards(uuid[],text),public.pos_get_menu_cards(uuid,text) to anon,authenticated;
commit;


-- ARCHIVO: 20261019220000_pos_menu_cards_limit_two.sql
-- Limita nuevas cartas a dos imágenes sin eliminar imágenes existentes.
begin;

create or replace function public.pos_save_menu_card(p_id uuid, p_name text, p_image_path text,
  p_all_tables boolean, p_table_ids uuid[], p_expected_version integer, p_auth_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare old public.pos_menu_cards; saved public.pos_menu_cards;
begin
  if not public.pos_menu_can_manage(p_auth_token) then raise exception 'No tienes permiso para administrar la Carta.'; end if;
  perform pg_advisory_xact_lock(hashtext('pos_menu_cards'));
  select * into old from public.pos_menu_cards where id=p_id;
  -- Reintentar la misma alta/edición tras perder la respuesta no crea otra carta.
  if old.id is not null and old.name=trim(p_name) and old.image_path=p_image_path and old.all_tables=p_all_tables
    and array(select table_id from public.pos_menu_card_tables where card_id=p_id order by table_id)
      = array(select distinct unnest(coalesce(p_table_ids, array[]::uuid[])) order by 1) then
    return to_jsonb(old);
  end if;
  if p_expected_version is null or coalesce(old.version,0) <> p_expected_version then raise exception 'Otra persona cambió esta carta. Recarga la biblioteca antes de guardar.'; end if;
  if p_id is null or length(trim(coalesce(p_name,''))) not between 1 and 80 or p_all_tables is null then raise exception 'Nombre de carta inválido.'; end if;
  if old.id is null and (select count(*) from public.pos_menu_cards)>=2 then raise exception 'Máximo 2 imágenes. Elimina una antes de subir otra.'; end if;
  if p_image_path !~ ('^cards/' || p_id::text || '/[a-f0-9]{64}\.(jpg|png|webp)$')
    or not exists(select 1 from storage.objects where bucket_id='pos-menu-cards' and name=p_image_path) then
    raise exception 'Primero sube una imagen válida de esta carta.';
  end if;
  if exists(select 1 from unnest(coalesce(p_table_ids,array[]::uuid[])) t(id)
    where not exists(select 1 from public.restaurant_tables r where r.id=t.id and r.is_active)) then
    raise exception 'La selección contiene mesas inactivas. Recarga la biblioteca.';
  end if;
  insert into public.pos_menu_cards(id,name,image_path,all_tables,sort_order)
    values(p_id,trim(p_name),p_image_path,p_all_tables,coalesce((select max(sort_order)+1 from public.pos_menu_cards),0))
    on conflict(id) do update set name=excluded.name,image_path=excluded.image_path,all_tables=excluded.all_tables,
      version=pos_menu_cards.version+1,updated_at=clock_timestamp() returning * into saved;
  delete from public.pos_menu_card_tables where card_id=p_id;
  insert into public.pos_menu_card_tables select p_id, id from (select distinct unnest(coalesce(p_table_ids,array[]::uuid[])) id) t;
  return to_jsonb(saved);
end; $$;

commit;


-- ARCHIVO: 20261019233000_report_change_batches.sql
-- Publica un conjunto completo de avisos confirmados en una transacción.
-- Conserva la bitácora, los IDs y los permisos de lectura existentes.
begin;

create or replace function public.publish_report_changes_batch(auth_token text, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  staff jsonb;
  change jsonb;
  saved public.pos_report_changes;
  receipts jsonb := '[]'::jsonb;
  inserted boolean := false;
  duplicate boolean;
begin
  staff := to_jsonb(public.require_app_user(auth_token));
  if staff->>'role' not in ('boss','admin') then raise exception 'No autorizado'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then raise exception 'Lote no válido'; end if;
  if jsonb_array_length(p_changes) not between 1 and 20 or octet_length(p_changes::text)>5000000 then
    raise exception 'Lote no válido';
  end if;
  perform pg_advisory_xact_lock(1313102026);
  for change in select value from jsonb_array_elements(p_changes) loop
    if coalesce(change->>'action','') not in ('record_sale','edit_sale','delete_sale','clear_income','adjust_inventory','upsert_inventory','set_inventory_stock','delete_inventory','clear_inventory','update_inventory_movement_cost','clear_inventory_movements')
      or coalesce(length(change->>'operationId'),0) not between 1 and 200
      or coalesce(jsonb_typeof(change->'payload'),'null') <> 'object'
      or octet_length((change->'payload')::text)>2000000 then
      raise exception 'Cambio no válido';
    end if;
    select * into saved from public.pos_report_changes c where c.operation_id=change->>'operationId';
    duplicate := found;
    if duplicate then
      if saved.action<>change->>'action' then raise exception 'Operación ya utilizada'; end if;
    else
      insert into public.pos_report_changes(operation_id,action,payload)
        values(change->>'operationId',change->>'action',change->'payload') returning * into saved;
      inserted := true;
    end if;
    receipts := receipts || jsonb_build_array(jsonb_build_object('operationId',saved.operation_id,'sequence',saved.sequence,'duplicate',duplicate));
  end loop;
  if inserted then perform realtime.send('{}'::jsonb,'reports-committed','admin',false); end if;
  return jsonb_build_object('ok',true,'results',receipts);
end;
$$;

revoke all on function public.publish_report_changes_batch(text,jsonb) from public;
grant execute on function public.publish_report_changes_batch(text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
