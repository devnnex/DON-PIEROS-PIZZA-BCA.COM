-- Impresión remota: ejecutar una vez en SQL Editor. No modifica pedidos ni caja.
begin;
create table if not exists public.dp_print_receivers (
 id uuid primary key, secret_hash text not null, label text not null,
 printer text not null, last_seen timestamptz not null default now()
);
create table if not exists public.dp_print_devices (
 id uuid primary key, user_id uuid not null, label text not null,
 receiver_id uuid references public.dp_print_receivers(id), last_seen timestamptz not null default now()
);
create table if not exists public.dp_print_jobs (
 id uuid primary key, requested_by uuid not null, receiver_id uuid not null references public.dp_print_receivers(id),
 title text not null, pdf text, payload_hash text not null,
 status text not null default 'pending' check(status in ('pending','claimed','spooled','failed','unknown','expired')),
 created_at timestamptz not null default now(), claimed_at timestamptz, finished_at timestamptz, error text not null default ''
);
create index if not exists dp_print_jobs_queue on public.dp_print_jobs(receiver_id,status,created_at);
create index if not exists dp_print_jobs_expiration on public.dp_print_jobs(created_at) where status in ('pending','claimed');
create index if not exists dp_print_jobs_history on public.dp_print_jobs(finished_at) where finished_at is not null;
alter table public.dp_print_receivers enable row level security;
alter table public.dp_print_devices enable row level security;
alter table public.dp_print_jobs enable row level security;
revoke all on public.dp_print_receivers,public.dp_print_devices,public.dp_print_jobs from public,anon,authenticated;

create or replace function public.dp_print_heartbeat(auth_token text,p_device_id uuid,p_label text,
 p_receiver_id uuid default null,p_secret text default null,p_printer text default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare actor public.app_users; old public.dp_print_receivers;
begin
 actor:=public.require_app_user(auth_token);
 if p_receiver_id is not null then
  if length(coalesce(p_secret,''))<32 or length(coalesce(p_printer,''))<1 then raise exception 'Receptor no válido.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_receiver_id::text,1));
  select * into old from public.dp_print_receivers where id=p_receiver_id;
  if found and old.secret_hash<>encode(digest(p_secret,'sha256'),'hex') then raise exception 'Receptor no autorizado.'; end if;
  insert into public.dp_print_receivers(id,secret_hash,label,printer) values(p_receiver_id,encode(digest(p_secret,'sha256'),'hex'),left(p_label,100),left(p_printer,200))
  on conflict(id) do update set last_seen=now(),label=excluded.label,printer=excluded.printer;
 end if;
 insert into public.dp_print_devices(id,user_id,label,receiver_id) values(p_device_id,actor.id,left(p_label,100),p_receiver_id)
 on conflict(id) do update set user_id=excluded.user_id,label=excluded.label,receiver_id=excluded.receiver_id,last_seen=now();
 -- Small bounded batches: stale PDFs are cleared even when the recipient closes.
 update public.dp_print_jobs set status=case when status='pending' then 'expired' else 'unknown' end,
  pdf=null,finished_at=now(),error='El receptor no confirmó a tiempo. Comprueba la impresora antes de reimprimir.'
 where id in(select id from public.dp_print_jobs where status in ('pending','claimed') and created_at<now()-interval '2 minutes' limit 50);
 delete from public.dp_print_jobs where id in(select id from public.dp_print_jobs where finished_at<now()-interval '7 days' limit 50);
 delete from public.dp_print_devices where last_seen<now()-interval '3 days';
 delete from public.dp_print_receivers r where r.last_seen<now()-interval '8 days'
  and not exists(select 1 from public.dp_print_jobs j where j.receiver_id=r.id)
  and not exists(select 1 from public.dp_print_devices d where d.receiver_id=r.id);
 return jsonb_build_object('ok',true);
end;$$;

create or replace function public.dp_print_status(auth_token text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 perform public.require_app_user(auth_token);
 return jsonb_build_object('devices',(select count(*) from public.dp_print_devices where last_seen>now()-interval '90 seconds'),
 'receivers',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'printer',printer) order by label,id),'[]'::jsonb)
 from public.dp_print_receivers r where last_seen>now()-interval '45 seconds'
 and exists(select 1 from public.dp_print_devices d where d.receiver_id=r.id and d.last_seen>now()-interval '90 seconds')));
end;$$;

create or replace function public.dp_print_submit(auth_token text,p_job_id uuid,p_title text,p_pdf text,p_preferred uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.app_users; job public.dp_print_jobs; target public.dp_print_receivers;
begin
 actor:=public.require_app_user(auth_token);
 if length(coalesce(p_pdf,'')) not between 12 and 8388608 or left(p_pdf,7)<>'JVBERi0' or p_pdf !~ '^[A-Za-z0-9+/=]+$' then raise exception 'PDF no válido o demasiado grande.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_job_id::text,2));
 select * into job from public.dp_print_jobs where id=p_job_id;
 if found then
  if job.requested_by<>actor.id or job.payload_hash<>md5(p_pdf) then raise exception 'Identificador de impresión ya utilizado.'; end if;
  return jsonb_build_object('id',job.id,'status',job.status,'receiver',job.receiver_id);
 end if;
 select * into target from public.dp_print_receivers r where last_seen>now()-interval '45 seconds'
 and exists(select 1 from public.dp_print_devices d where d.receiver_id=r.id and d.last_seen>now()-interval '90 seconds')
 order by (r.id=p_preferred) desc nulls last,r.last_seen desc,r.id limit 1;
 if not found then return jsonb_build_object('unavailable',true); end if;
 insert into public.dp_print_jobs(id,requested_by,receiver_id,title,pdf,payload_hash)
 values(p_job_id,actor.id,target.id,left(coalesce(p_title,'Comprobante'),160),p_pdf,md5(p_pdf)) returning * into job;
 return jsonb_build_object('id',job.id,'status',job.status,'receiver',target.id,'label',target.label,'printer',target.printer);
end;$$;

create or replace function public.dp_print_claim(auth_token text,p_receiver_id uuid,p_secret text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare job public.dp_print_jobs;
begin
 perform public.require_app_user(auth_token);
 if not exists(select 1 from public.dp_print_receivers where id=p_receiver_id and secret_hash=encode(digest(p_secret,'sha256'),'hex')) then raise exception 'Receptor no autorizado.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_receiver_id::text,3));
 select * into job from public.dp_print_jobs where receiver_id=p_receiver_id and status in ('pending','claimed')
 and created_at>now()-interval '2 minutes' order by created_at,id for update limit 1;
 if not found then return jsonb_build_object('job',null); end if;
 update public.dp_print_jobs set status='claimed',claimed_at=coalesce(claimed_at,now()) where id=job.id;
 -- Retries go to the SAME receiver. Its persistent ledger prevents a second spool.
 return jsonb_build_object('job',jsonb_build_object('id',job.id,'pdf',job.pdf,'title',job.title));
end;$$;

create or replace function public.dp_print_finish(auth_token text,p_receiver_id uuid,p_secret text,p_job_id uuid,p_status text,p_error text default '')
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
begin
 perform public.require_app_user(auth_token);
 if p_status not in ('spooled','failed','unknown') then raise exception 'Estado no válido.'; end if;
 if not exists(select 1 from public.dp_print_receivers where id=p_receiver_id and secret_hash=encode(digest(p_secret,'sha256'),'hex')) then raise exception 'Receptor no autorizado.'; end if;
 update public.dp_print_jobs set status=p_status,pdf=null,finished_at=now(),error=left(coalesce(p_error,''),300)
 where id=p_job_id and receiver_id=p_receiver_id and status='claimed';
 return jsonb_build_object('ok',true);
end;$$;

create or replace function public.dp_print_result(auth_token text,p_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare actor public.app_users; result jsonb;
begin
 actor:=public.require_app_user(auth_token);
 select jsonb_build_object('id',id,'status',status,'error',error) into result from public.dp_print_jobs
 where id=p_job_id and requested_by=actor.id;
 return result;
end;$$;
revoke all on function public.dp_print_heartbeat(text,uuid,text,uuid,text,text),public.dp_print_status(text),public.dp_print_submit(text,uuid,text,text,uuid),public.dp_print_claim(text,uuid,text),public.dp_print_finish(text,uuid,text,uuid,text,text),public.dp_print_result(text,uuid) from public;
grant execute on function public.dp_print_heartbeat(text,uuid,text,uuid,text,text),public.dp_print_status(text),public.dp_print_submit(text,uuid,text,text,uuid),public.dp_print_claim(text,uuid,text),public.dp_print_finish(text,uuid,text,uuid,text,text),public.dp_print_result(text,uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
