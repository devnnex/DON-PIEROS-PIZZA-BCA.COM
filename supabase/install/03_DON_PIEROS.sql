-- Don Pieros Pizza: marca inicial, primer Jefe y almacenamiento de imágenes.
-- Ejecutar DESPUÉS de 01_BASE.sql y 02_ACTUALIZACIONES_NAPOLES.sql.
begin;
set local search_path = public, extensions;

insert into public.business_settings(is_primary,business_name,subtitle,accent_color,currency,logo_url)
values(true,'Don Pieros Pizza','Servicio a la mesa','#111111','COP','images/don-pieros-logo.png')
on conflict(is_primary) do nothing;

create or replace function public.dp_setup_status()
returns boolean language sql stable security definer set search_path=public as $$
  select not exists(select 1 from public.app_users);
$$;

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
revoke all on function public.dp_setup_status() from public;
revoke all on function public.dp_create_boss(text,text,text) from public;
grant execute on function public.dp_setup_status() to anon;
grant execute on function public.dp_create_boss(text,text,text) to anon;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',true,5242880,array['image/png','image/jpeg','image/webp']),
      ('brand-assets','brand-assets',true,10485760,array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict(id) do nothing;

drop policy if exists dp_product_images_read on storage.objects;
create policy dp_product_images_read on storage.objects for select to anon using(bucket_id='product-images');
drop policy if exists dp_product_images_insert on storage.objects;
create policy dp_product_images_insert on storage.objects for insert to anon
with check(bucket_id='product-images' and public.app_can_access_section('inventory'));
drop policy if exists dp_product_images_update on storage.objects;
create policy dp_product_images_update on storage.objects for update to anon
using(bucket_id='product-images' and public.app_can_access_section('inventory'))
with check(bucket_id='product-images' and public.app_can_access_section('inventory'));
drop policy if exists dp_product_images_delete on storage.objects;
create policy dp_product_images_delete on storage.objects for delete to anon
using(bucket_id='product-images' and public.app_can_access_section('inventory'));
drop policy if exists dp_brand_read on storage.objects;
create policy dp_brand_read on storage.objects for select to anon using(bucket_id='brand-assets');
drop policy if exists dp_brand_manage on storage.objects;
create policy dp_brand_manage on storage.objects for all to anon
using(bucket_id='brand-assets' and public.app_can_access_section('brand'))
with check(bucket_id='brand-assets' and public.app_can_access_section('brand'));

-- Broadcast is already used by Nápoles; enable table change subscriptions too.
do $$declare relation text; begin
  foreach relation in array array['business_settings','restaurant_tables','menu_categories','menu_items','service_requests','table_sessions','session_items','app_users'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=relation) then
      execute format('alter publication supabase_realtime add table public.%I',relation);
    end if;
  end loop;
end;$$;
notify pgrst,'reload schema';
commit;
