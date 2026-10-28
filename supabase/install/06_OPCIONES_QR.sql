-- Opciones visibles al escanear el QR de una mesa.
-- Se puede repetir. Conserva la configuración y los datos existentes.
begin;
alter table public.business_settings
  add column if not exists client_waiter_enabled boolean not null default true,
  add column if not exists client_menu_enabled boolean not null default true,
  add column if not exists client_chat_enabled boolean not null default true;
notify pgrst,'reload schema';
commit;
