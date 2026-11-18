-- Aplicado en Supabase el 18/11/2026 (proyecto xriawbiqoejhyysvbwsd)
-- is_coach() fuera del esquema expuesto por la API
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter function public.is_coach() set schema private;
alter function private.is_coach() set search_path = public;

-- Índices de claves foráneas
create index if not exists program_adjustments_program_idx on program_adjustments (program_id);
create index if not exists identity_reviews_checkin_idx on identity_reviews (checkin_id);
create index if not exists analyses_client_idx on analyses (client_id);
create index if not exists alerts_client_idx on alerts (client_id);
create index if not exists alerts_program_idx on alerts (program_id);
create index if not exists whatsapp_messages_client_idx on whatsapp_messages (client_id);
create index if not exists whatsapp_messages_analysis_idx on whatsapp_messages (analysis_id);
create index if not exists identity_reviews_resolved_idx on identity_reviews (resolved_client_id);

-- El propietario recibe permiso de coach al crearse su usuario
create or replace function private.authorize_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) = 'miguelteentrena@gmail.com' then
    insert into public.coach_users (user_id, email) values (new.id, lower(new.email)) on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
revoke execute on function private.authorize_owner() from public, anon, authenticated;
create trigger on_auth_user_created_authorize_owner
  after insert on auth.users for each row execute function private.authorize_owner();

-- Al llegar un check-in identificado, se cierran las alertas de "días sin check-in" de ese cliente
create or replace function private.close_missing_alerts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is not null then
    update alerts set status = 'done', resolved_at = now()
     where client_id = new.client_id and kind = 'checkin_missing' and status = 'open';
  end if;
  return new;
end $$;
revoke execute on function private.close_missing_alerts() from public, anon, authenticated;
create trigger checkins_close_missing_alerts
  after insert or update of client_id on checkins
  for each row execute function private.close_missing_alerts();
