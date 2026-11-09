begin;

-- Impide que un retiro tardío borre consumos ya aceptados en una mesa abierta.
create or replace function public.dp_protect_accepted_comanda()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.accepted_at is not null
    and exists(select 1 from public.table_sessions where id=old.session_id and status='open') then
    if tg_op='DELETE' then
      raise exception 'Esta comanda ya fue agregada a la mesa y no se puede retirar mientras la cuenta esté abierta.';
    end if;
    if new.accepted_at is null or jsonb_array_length(new.items)=0 then
      raise exception 'Esta comanda ya fue agregada a la mesa y no se puede retirar mientras la cuenta esté abierta.';
    end if;
  end if;
  if tg_op='DELETE' then return old;end if;
  return new;
end;
$$;
drop trigger if exists dp_protect_accepted_comanda on public.waiter_comandas;
create trigger dp_protect_accepted_comanda before update or delete on public.waiter_comandas
for each row execute function public.dp_protect_accepted_comanda();
revoke all on function public.dp_protect_accepted_comanda() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
