-- FatSecret: conexión por cliente (OAuth 1.0) y diario de nutrición. Aditivo.
alter table clients add column if not exists calorie_target integer;

-- Enlaces de invitación de un solo uso (uno por cliente y petición)
create table if not exists fatsecret_invites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz
);
-- Tokens temporales del flujo OAuth (paso 1 → 3)
create table if not exists fatsecret_requests (
  oauth_token text primary key,
  token_secret text not null,
  invite_id uuid not null references fatsecret_invites(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- Permiso de lectura de cada cliente. Solo accesible con la clave de servicio (sin políticas para usuarios).
create table if not exists fatsecret_links (
  client_id uuid primary key references clients(id) on delete cascade,
  access_token text not null,
  access_secret text not null,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error text,
  active boolean not null default true
);
-- Totales diarios y comidas del diario de FatSecret
create table if not exists nutrition_days (
  client_id uuid not null references clients(id) on delete cascade,
  day date not null,
  calories numeric, protein numeric, carbs numeric, fat numeric,
  meals jsonb,            -- [{meal, name, calories, protein, carbs, fat}]
  source text not null default 'fatsecret',
  synced_at timestamptz not null default now(),
  primary key (client_id, day)
);
alter table measurements drop constraint if exists measurements_source_type_check;
alter table measurements add constraint measurements_source_type_check check (source_type in ('fathom','jotform','manual','fatsecret'));

alter table fatsecret_invites enable row level security;
alter table fatsecret_requests enable row level security;
alter table fatsecret_links enable row level security;
alter table nutrition_days enable row level security;
create policy fatsecret_invites_coach on fatsecret_invites for select to authenticated using (private.is_coach());
create policy nutrition_days_coach on nutrition_days for select to authenticated using (private.is_coach());
create index if not exists fatsecret_invites_client_idx on fatsecret_invites(client_id);
create index if not exists fatsecret_requests_invite_idx on fatsecret_requests(invite_id);
-- Vista sin secretos para la interfaz
create or replace view fatsecret_status with (security_invoker = false) as
  select client_id, connected_at, last_sync_at, last_error, active from fatsecret_links where private.is_coach();
revoke all on fatsecret_status from anon;
grant select on fatsecret_status to authenticated;

alter table sync_runs drop constraint if exists sync_runs_source_check;
alter table sync_runs add constraint sync_runs_source_check check (source in ('crm','jotform','fathom','fatsecret'));
