-- COACH OS 2.0 — esquema inicial
-- Principios: el CRM es la fuente de verdad administrativa; Jotform la de check-ins.
-- Nada de valores estáticos de días: se calculan en vistas a partir de fechas.
-- RGPD: datos mínimos, RLS restringida al coach (tabla coach_users), sin teléfonos si no hacen falta.

-- gen_random_uuid() es nativo desde Postgres 13

-- ───────────── Acceso ─────────────
create table coach_users (
  user_id uuid primary key,          -- auth.users.id
  email text not null unique,
  role text not null default 'owner' check (role in ('owner','assistant')),
  created_at timestamptz not null default now()
);

create or replace function is_coach() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from coach_users where user_id = auth.uid());
$$;

-- ───────────── Clientes ─────────────
create table clients (
  id uuid primary key default gen_random_uuid(),
  email text unique,                                -- identificador principal (normalizado, minúsculas)
  full_name text not null,                          -- tal como aparece en el CRM
  name_key text not null,                           -- nombre normalizado (sin tildes, minúsculas) para emparejar
  phone text,
  aliases text[] not null default '{}',             -- nombres alternativos CONFIRMADOS por el coach
  status text not null default 'active' check (status in ('active','upcoming','finished','abandoned')),
  success_case_url text,
  crm_last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_name_key_idx on clients (name_key);

-- Cada fila del CRM = un programa (renovaciones = varias filas con el mismo email)
create table programs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  crm_row integer not null,                         -- nº de fila en la hoja (informativo: puede cambiar si se insertan filas)
  crm_row_hash text not null,                       -- detecta cambios sin reescribir
  start_date date,
  contracted_raw text,                              -- "6 meses", "3 meses + 1"
  contracted_months numeric,
  contracted_extra_raw text,                        -- lo que va tras "+", sin interpretar
  crm_end_date date,                                -- "Fecha final" del CRM (manda si existe)
  computed_end_date date,                           -- inicio + meses contratados
  crm_status_text text,                             -- p.ej. "FINALIZADO"
  report_url text,
  contract_url text,
  onboarding_url text,
  call_urls text[] not null default '{}',
  data_issues text[] not null default '{}',         -- discrepancias detectadas
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  program_key text not null unique                  -- client_id + fecha de inicio: estable aunque se muevan filas
);
create index programs_client_idx on programs (client_id);

-- Ajustes que el CRM no recoge: pausas y extensiones (en días)
create table program_adjustments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  kind text not null check (kind in ('pause','extension','reduction')),
  starts_on date,
  ends_on date,
  days integer not null check (days >= 0),
  note text,
  created_at timestamptz not null default now()
);

-- ───────────── Check-ins ─────────────
create table checkins (
  id uuid primary key default gen_random_uuid(),
  jotform_submission_id text not null unique,       -- idempotencia (webhook + reconciliación)
  form_id text not null,
  client_id uuid references clients(id) on delete set null,  -- null = pendiente de identificar
  submitted_name text,
  submitted_at timestamptz not null,
  week_start date not null,                         -- lunes de la semana del envío
  sessions numeric, fatigue numeric, recovery numeric,
  weight_kg numeric, hunger numeric, satiety numeric, hydration numeric, adherence numeric,
  sleep_hours numeric, sleep_quality numeric, stress numeric, motivation numeric,
  proud text, improve text, exercise_comment text, nutrition_comment text, coach_feedback text,
  raw jsonb not null,                               -- respuesta completa de Jotform
  received_via text not null check (received_via in ('webhook','api_backfill','api_reconcile')),
  created_at timestamptz not null default now()
);
create index checkins_client_week_idx on checkins (client_id, submitted_at desc);

-- Envíos cuyo nombre no casa con un único cliente → revisión manual (no se autocorrige)
create table identity_reviews (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid references checkins(id) on delete cascade,
  submitted_name text,
  candidates uuid[] not null default '{}',
  reason text not null,
  resolved_client_id uuid references clients(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────── Análisis, alertas, mensajes ─────────────
create table analyses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  checkin_id uuid not null references checkins(id) on delete cascade unique,
  level text not null check (level in ('red','yellow','green')),
  reasons jsonb not null,                           -- [{metric, text, date, value, ref}]
  positives jsonb not null default '[]',
  needs_action boolean not null,
  created_at timestamptz not null default now()
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  program_id uuid references programs(id) on delete cascade,
  kind text not null,                               -- checkin_red, checkin_missing, renewal_30, renewal_15, renewal_7, renewal_0, data_issue
  severity text not null check (severity in ('red','yellow','info')),
  title text not null,
  detail text,
  dedupe_key text not null unique,                  -- evita duplicar la misma alerta
  status text not null default 'open' check (status in ('open','done','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  analysis_id uuid references analyses(id) on delete set null,
  draft text not null,
  edited text,
  status text not null default 'draft' check (status in ('draft','sent','discarded')),
  sent_at timestamptz,                              -- marcado manualmente: COACH OS nunca envía
  created_at timestamptz not null default now()
);

-- ───────────── Operación ─────────────
create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('crm','jotform')),
  trigger text not null,                            -- apps_script, cron, webhook, manual
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  stats jsonb,
  error text
);

create table error_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  scope text not null,
  message text not null,
  context jsonb
);

create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,                              -- user id o 'system:crm-sync' etc.
  action text not null,
  entity text not null,
  entity_id text,
  diff jsonb
);

-- ───────────── Vista de duración (siempre calculada a hoy, hora de Madrid) ─────────────
create or replace function today_madrid() returns date language sql stable as $$ select (now() at time zone 'Europe/Madrid')::date $$;

create or replace view program_status as
select
  p.*,
  coalesce((select sum(case when a.kind='reduction' then -a.days else a.days end)
            from program_adjustments a where a.program_id = p.id), 0) as adjustment_days,
  (coalesce(p.crm_end_date, p.computed_end_date)
     + coalesce((select sum(case when a.kind='reduction' then -a.days else a.days end)
                 from program_adjustments a where a.program_id = p.id), 0)::int) as effective_end_date,
  (today_madrid() - p.start_date) as days_elapsed,
  ((coalesce(p.crm_end_date, p.computed_end_date)
     + coalesce((select sum(case when a.kind='reduction' then -a.days else a.days end)
                 from program_adjustments a where a.program_id = p.id), 0)::int) - today_madrid()) as days_remaining
from programs p;

-- ───────────── RLS ─────────────
alter table coach_users enable row level security;
alter table clients enable row level security;
alter table programs enable row level security;
alter table program_adjustments enable row level security;
alter table checkins enable row level security;
alter table identity_reviews enable row level security;
alter table analyses enable row level security;
alter table alerts enable row level security;
alter table whatsapp_messages enable row level security;
alter table sync_runs enable row level security;
alter table error_log enable row level security;
alter table audit_log enable row level security;

create policy coach_self on coach_users for select using (user_id = auth.uid());
create policy coach_all on clients for all using (is_coach()) with check (is_coach());
create policy coach_all on programs for all using (is_coach()) with check (is_coach());
create policy coach_all on program_adjustments for all using (is_coach()) with check (is_coach());
create policy coach_all on checkins for select using (is_coach());
create policy coach_all on identity_reviews for all using (is_coach()) with check (is_coach());
create policy coach_all on analyses for select using (is_coach());
create policy coach_all on alerts for all using (is_coach()) with check (is_coach());
create policy coach_all on whatsapp_messages for all using (is_coach()) with check (is_coach());
create policy coach_read on sync_runs for select using (is_coach());
create policy coach_read on error_log for select using (is_coach());
create policy coach_read on audit_log for select using (is_coach());
-- Las escrituras de sincronización usan la service_role key SOLO en el servidor (bypass RLS).

alter view program_status set (security_invoker = true);

-- is_coach() no debe poder invocarse sin sesión
revoke execute on function is_coach() from public, anon;
grant execute on function is_coach() to authenticated;
