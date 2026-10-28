-- Actualización para instalaciones que ya ejecutaron 01, 02 y 03.
-- Permite PIN numéricos de 4 a 12 dígitos para el primer Jefe.
-- Los usuarios creados desde el panel ya admiten ese mismo rango.
-- No modifica usuarios ni contraseñas existentes. Se puede repetir.
begin;

create or replace function public.dp_create_boss(p_name text,p_username text,p_pin text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
begin
  perform pg_advisory_xact_lock(hashtext('dp-first-boss'));
  if exists(select 1 from public.app_users) then raise exception 'El primer Jefe ya fue creado.';end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 80 or coalesce(p_username,'') !~ '^[a-z0-9._-]{3,40}$' or coalesce(p_pin,'') !~ '^[0-9]{4,12}$' then
    raise exception 'Nombre de 2 a 80 caracteres, usuario de 3 a 40 caracteres y PIN de 4 a 12 dígitos.';
  end if;
  insert into public.app_users(full_name,username,pin_hash,role,permissions,is_active)
  values(trim(p_name),p_username,crypt(p_pin,gen_salt('bf',10)),'boss','[]'::jsonb,true);
  return jsonb_build_object('ok',true);
end;$$;

revoke all on function public.dp_create_boss(text,text,text) from public;
grant execute on function public.dp_create_boss(text,text,text) to anon;
notify pgrst,'reload schema';
commit;
