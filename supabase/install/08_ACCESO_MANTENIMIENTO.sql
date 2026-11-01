-- Ejecutar después de 01 a 07. No crea credenciales ni accesos por defecto.
begin;
create table if not exists public.dp_maintenance_users (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.dp_maintenance_users enable row level security;
revoke all on public.dp_maintenance_users from public,anon,authenticated;

-- Solo el propietario de la base puede aprovisionar este acceso desde SQL.
create or replace function public.dp_provision_maintenance(p_username text,p_pin text)
returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare target uuid;
begin
  if lower(trim(p_username)) !~ '^[a-z0-9._-]{3,40}$' or p_pin !~ '^[0-9]{12}$' then
    raise exception 'Indica un usuario válido y un PIN de 12 dígitos.';
  end if;
  perform pg_advisory_xact_lock(hashtext('dp_provision_maintenance'));
  select id into target from public.app_users where username=lower(trim(p_username));
  if target is not null and not exists(select 1 from public.dp_maintenance_users where user_id=target) then
    raise exception 'Ese usuario ya pertenece al equipo. Elige otro nombre.';
  end if;
  if target is null then
    insert into public.app_users(full_name,username,pin_hash,role,is_active)
    values('Soporte de mantenimiento',lower(trim(p_username)),crypt(p_pin,gen_salt('bf',10)),'boss',true) returning id into target;
    insert into public.dp_maintenance_users(user_id) values(target);
  else
    update public.app_users set pin_hash=crypt(p_pin,gen_salt('bf',10)),role='boss',is_active=true where id=target;
    delete from public.auth_sessions where user_id=target;
  end if;
  return target;
end;$$;
revoke all on function public.dp_provision_maintenance(text,text) from public,anon,authenticated;

create or replace function public.get_current_user(auth_token text)
returns jsonb language sql stable security definer set search_path=public,extensions as $$
  select public.public_user(u)||jsonb_build_object('is_maintenance',exists(select 1 from public.dp_maintenance_users m where m.user_id=u.id))
  from public.require_app_user(auth_token) u;
$$;

create or replace function public.list_users(auth_token text)
returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
declare actor public.app_users;maintenance boolean;
begin
  actor:=public.require_boss(auth_token);
  maintenance:=exists(select 1 from public.dp_maintenance_users where user_id=actor.id);
  return (select coalesce(jsonb_agg(public.public_user(u) order by u.full_name),'[]'::jsonb)
    from public.app_users u where maintenance or not exists(select 1 from public.dp_maintenance_users m where m.user_id=u.id));
end;$$;

create or replace function public.save_user(auth_token text,id uuid,full_name text,username text,pin text default '',
  role text default 'waiter',is_active boolean default true,permissions jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare actor public.app_users;saved public.app_users;current_row public.app_users;
  clean_role text:=case when $6 in ('boss','admin','waiter') then $6 else 'waiter' end;
  clean_permissions jsonb:=case when $6='admin' and jsonb_typeof(coalesce($8,'[]'::jsonb))='array' then coalesce($8,'[]'::jsonb) else '[]'::jsonb end;
begin
  actor:=public.require_boss($1);
  if exists(select 1 from public.dp_maintenance_users where user_id=$2) then
    if actor.id<>$2 then raise exception 'No puedes modificar este usuario.';end if;
    if clean_role<>'boss' or not $7 then raise exception 'Para retirar este acceso utiliza Eliminar usuario.';end if;
  end if;
  if trim($3)='' or lower(trim($4)) !~ '^[a-z0-9._-]{3,40}$' then raise exception 'Nombre o usuario inválido.';end if;
  if $5<>'' and $5 !~ '^[0-9]{4,12}$' then raise exception 'El PIN debe tener entre 4 y 12 dígitos.';end if;
  if clean_role='admin' and jsonb_array_length(clean_permissions)=0 then raise exception 'Selecciona al menos una sección para el Administrador.';end if;
  select u.* into current_row from public.app_users u where u.id=$2 for update;
  if current_row.id is null and $5='' then raise exception 'El PIN es obligatorio para un usuario nuevo.';end if;
  if current_row.role='boss' and (clean_role<>'boss' or not $7) and not exists(
    select 1 from public.app_users u where u.id<>$2 and u.role='boss' and u.is_active
      and not exists(select 1 from public.dp_maintenance_users m where m.user_id=u.id)
  ) then raise exception 'No puedes desactivar o cambiar el rol del último Jefe.';end if;
  insert into public.app_users(id,full_name,username,pin_hash,role,is_active,permissions)
  values($2,trim($3),lower(trim($4)),crypt($5,gen_salt('bf',10)),clean_role,$7,clean_permissions)
  on conflict on constraint app_users_pkey do update set full_name=excluded.full_name,username=excluded.username,
    role=excluded.role,is_active=excluded.is_active,permissions=excluded.permissions,
    pin_hash=case when $5<>'' then crypt($5,gen_salt('bf',10)) else app_users.pin_hash end returning * into saved;
  return public.public_user(saved)||case when saved.id=actor.id then jsonb_build_object('is_maintenance',exists(select 1 from public.dp_maintenance_users m where m.user_id=actor.id)) else '{}'::jsonb end;
exception when unique_violation then raise exception 'Ese nombre de usuario ya está en uso.';
end;$$;

create or replace function public.delete_user(auth_token text,user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare actor public.app_users;target public.app_users;maintenance boolean;
begin
  actor:=public.require_boss(auth_token);
  select * into target from public.app_users where id=user_id for update;
  if target.id is null then return jsonb_build_object('deleted',false,'reason','not_found');end if;
  maintenance:=exists(select 1 from public.dp_maintenance_users m where m.user_id=target.id);
  if maintenance and actor.id<>target.id then raise exception 'No puedes eliminar este usuario.';end if;
  if target.id=actor.id and not maintenance then raise exception 'No puedes eliminar tu propio usuario mientras tienes la sesión abierta.';end if;
  if target.role='boss' and target.is_active and not exists(
    select 1 from public.app_users u where u.id<>target.id and u.role='boss' and u.is_active
      and not exists(select 1 from public.dp_maintenance_users m where m.user_id=u.id)
  ) then raise exception 'Debe quedar al menos un Jefe activo del negocio.';end if;
  delete from public.app_users where id=target.id;
  return jsonb_build_object('deleted',true,'id',target.id,'full_name',target.full_name);
end;$$;
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

  if found_user.id is null or $2 is null or $2 !~ '^[0-9]{4,12}$'
     or crypt($2, found_user.pin_hash) is distinct from found_user.pin_hash then
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
  return jsonb_build_object('token', raw_token, 'expires_at', expiry, 'user', public.get_current_user(raw_token));
end;
$$;
notify pgrst,'reload schema';
commit;
