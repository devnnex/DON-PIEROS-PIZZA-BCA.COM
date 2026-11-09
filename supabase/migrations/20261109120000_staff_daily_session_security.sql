begin;

-- El servidor es la autoridad del corte, independientemente del reloj del celular.
create or replace function public.staff_session_deadline(at_time timestamptz default now())
returns timestamptz language sql stable set search_path = public
as $$
  select (date_trunc('day', at_time at time zone 'America/Bogota' - interval '2 hours')
    + interval '1 day 2 hours') at time zone 'America/Bogota';
$$;

create or replace function public.app_user_for_token(token text)
returns public.app_users language sql stable security definer
set search_path = public, extensions
as $$
  select u from public.auth_sessions s
  join public.app_users u on u.id = s.user_id
  where s.token_hash = encode(digest(token, 'sha256'), 'hex')
    and s.expires_at > now()
    and s.created_at >= public.staff_session_deadline(now()) - interval '1 day'
    and s.created_at <= now()
    and u.is_active and u.role in ('boss', 'admin', 'waiter')
  limit 1;
$$;

-- Acorta también las sesiones emitidas antes de instalar esta migración.
update public.auth_sessions
set expires_at = least(expires_at, public.staff_session_deadline(created_at))
where expires_at > public.staff_session_deadline(created_at);

create or replace function public.login(username text, pin text)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare
  normalized text := lower(trim($1));
  found_user public.app_users;
  attempt public.login_attempts;
  raw_token text;
  expiry timestamptz := least(now() + interval '12 hours', public.staff_session_deadline(now()));
begin
  if normalized is null or length(normalized) not between 1 and 80 then return null; end if;
  insert into public.login_attempts(username, attempts) values (normalized, 0)
  on conflict on constraint login_attempts_pkey do nothing;
  select a.* into attempt from public.login_attempts a where a.username = normalized for update;
  if attempt.blocked_until > now() then return null; end if;
  if attempt.blocked_until <= now() or attempt.updated_at < now() - interval '5 minutes' then
    attempt.attempts := 0;
  end if;
  select u.* into found_user from public.app_users u
  where u.username = normalized and u.is_active and u.role in ('boss', 'admin', 'waiter') limit 1;
  -- IS DISTINCT FROM rechaza también PIN nulo: SQL NULL nunca debe autenticar.
  if found_user.id is null or $2 is null or $2 !~ '^[0-9]{4,12}$'
    or crypt($2, found_user.pin_hash) is distinct from found_user.pin_hash then
    update public.login_attempts set attempts = attempt.attempts + 1,
      blocked_until = case when attempt.attempts + 1 >= 8 then now() + interval '5 minutes' else null end,
      updated_at = now() where login_attempts.username = normalized;
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

create or replace function public.get_current_user(auth_token text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions
as $$
declare actor public.app_users; result jsonb; maintenance boolean;
begin
  actor := public.require_app_user(auth_token);
  result := public.public_user(actor) || jsonb_build_object(
    'session_expires_at', (select least(s.expires_at, public.staff_session_deadline(s.created_at))
      from public.auth_sessions s where s.token_hash = encode(digest(auth_token, 'sha256'), 'hex') limit 1));
  if to_regclass('public.dp_maintenance_users') is not null then
    select exists(select 1 from public.dp_maintenance_users where user_id = actor.id) into maintenance;
    result := result || jsonb_build_object('is_maintenance', maintenance);
  end if;
  return result;
end;
$$;

revoke all on function public.staff_session_deadline(timestamptz) from public;
grant execute on function public.staff_session_deadline(timestamptz) to anon, authenticated, service_role;
grant execute on function public.login(text, text), public.get_current_user(text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
