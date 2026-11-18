-- COACH OS 2.1 — Fathom, LOGROS y advertencias con estados e historial.
-- Migración ADITIVA: no borra ni modifica datos existentes. La tabla `alerts` se conserva como histórico.

-- ───────────── Llamadas (Fathom) ─────────────
-- No se guardan transcripciones completas: solo resumen, tareas y citas breves (minimización RGPD).
create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  fathom_recording_id bigint not null unique,           -- idempotencia (webhook + reconciliación)
  client_id uuid references clients(id) on delete set null,
  match_method text check (match_method in ('crm_link','invitee_email','manual')),
  title text,
  recorded_at timestamptz not null,
  call_url text,                                         -- https://fathom.video/calls/…
  share_url text,                                        -- https://fathom.video/share/… (lo que se pega en el CRM)
  invitee_emails text[] not null default '{}',
  summary_md text,                                       -- resumen de Fathom (solo si el cliente está identificado)
  action_items jsonb not null default '[]',
  extraction_status text not null default 'pending' check (extraction_status in ('pending','done','failed','not_configured')),
  extraction_basis text,                                 -- 'fathom_summary' | 'transcript_llm' | 'manual_review'
  extracted_at timestamptz,
  received_via text not null default 'api' check (received_via in ('webhook','api','backfill')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calls_client_idx on calls (client_id, recorded_at desc);

-- Información extraída de cada llamada, con procedencia explícita
create table if not exists call_insights (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references calls(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  kind text not null check (kind in ('problem','goal','life_change','availability','adherence','doubt',
                                     'client_commitment','coach_commitment','progress','achievement','incident','health')),
  speaker text not null check (speaker in ('client','coach','unknown')),          -- quién lo dijo
  basis text not null check (basis in ('verbatim_quote','fathom_summary','ai_inference')), -- cómo se sabe
  text text not null,
  quote text,                                             -- cita literal breve (≤ 200 caracteres) si existe
  timestamp_sec integer,
  link text,                                              -- enlace al minuto exacto
  issue_category text,                                    -- para cruzar con advertencias
  polarity text not null default 'neutral' check (polarity in ('problem','improvement','neutral')),
  sensitive boolean not null default false,               -- datos de salud: nunca en WhatsApp
  occurred_on date not null,                              -- fecha de la llamada
  fingerprint text not null,
  created_at timestamptz not null default now(),
  unique (call_id, fingerprint)
);
create index if not exists call_insights_client_idx on call_insights (client_id, occurred_on desc);

-- Compromisos (del cliente y del entrenador)
create table if not exists commitments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  owner text not null check (owner in ('client','coach')),
  text text not null,
  source_type text not null check (source_type in ('fathom','jotform','manual')),
  source_ref text not null,
  source_link text,
  made_on date not null,
  status text not null default 'open' check (status in ('open','done','dropped')),
  done_at timestamptz,
  done_note text,
  fingerprint text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists commitments_client_idx on commitments (client_id, status);

-- ───────────── LOGROS ─────────────
create table if not exists achievements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  category text not null,                                 -- peso, medidas, fuerza, nutricion, habitos, actividad, mentalidad, otro
  achieved_on date,                                       -- cuándo se consiguió (si se sabe)
  first_mentioned_on date not null,
  last_mentioned_on date not null,
  mentions_count integer not null default 1,
  hidden boolean not null default false,                  -- el coach puede ocultar un falso positivo (no se borra)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists achievements_client_idx on achievements (client_id, last_mentioned_on desc);

create table if not exists achievement_mentions (
  id uuid primary key default gen_random_uuid(),
  achievement_id uuid not null references achievements(id) on delete cascade,
  source_type text not null check (source_type in ('jotform','fathom','manual')),
  source_ref text not null,                               -- id del check-in o del insight
  mentioned_on date not null,
  context text,
  quote text,
  link text,
  basis text,
  created_at timestamptz not null default now(),
  unique (source_type, source_ref)
);
create index if not exists achievement_mentions_ach_idx on achievement_mentions (achievement_id);

-- ───────────── ADVERTENCIAS (problemas vivos con historial) ─────────────
create table if not exists issues (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  program_id uuid references programs(id) on delete set null,
  category text not null,
  scope_key text not null,                                -- client:category[:program] — un solo problema activo por clave
  title text not null,
  status text not null default 'new' check (status in ('new','pending','monitoring','resolved','dismissed')),
  severity text not null default 'yellow' check (severity in ('red','yellow','info')),
  trend text not null default 'single' check (trend in ('single','repeated','worsening','improving')),
  first_detected_on date not null,
  last_evidence_on date not null,
  last_problem_on date not null,
  problem_count integer not null default 1,
  reopened_count integer not null default 0,
  status_changed_at timestamptz not null default now(),
  reviewed_at timestamptz,
  resolved_at timestamptz,
  resolved_on date,                                       -- fecha de referencia para "evidencia posterior"
  resolution_kind text check (resolution_kind in ('manual','auto_evidence','archived_initial','legacy_done')),
  resolution_note text,
  action_note text,
  improvement_refs jsonb not null default '[]',          -- mejoras posteriores al último problema (para resolución por evidencia)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists issues_one_active on issues (scope_key) where status in ('new','pending','monitoring');
create index if not exists issues_client_idx on issues (client_id, status);
create index if not exists issues_program_idx on issues (program_id);

create table if not exists issue_evidence (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id) on delete cascade,
  source_type text not null check (source_type in ('jotform','fathom','crm','system','manual')),
  source_ref text not null,
  observed_on date not null,
  polarity text not null check (polarity in ('problem','improvement')),
  severity text,
  basis text,                                             -- dato del formulario, cita literal, resumen Fathom, inferencia IA
  text text not null,
  link text,
  evidence_key text not null unique,                      -- idempotencia: misma evidencia nunca se aplica dos veces
  created_at timestamptz not null default now()
);
create index if not exists issue_evidence_issue_idx on issue_evidence (issue_id, observed_on);

create table if not exists issue_events (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,                                    -- user id | 'system'
  from_status text,
  to_status text,
  note text,
  evidence_id uuid references issue_evidence(id) on delete set null
);
create index if not exists issue_events_issue_idx on issue_events (issue_id, at);
create index if not exists issue_events_evidence_idx on issue_events (evidence_id);

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table sync_runs drop constraint if exists sync_runs_source_check;
alter table sync_runs add constraint sync_runs_source_check check (source in ('crm','jotform','fathom'));

-- WhatsApp: guardar el tema de cada consejo para no repetirlo
alter table whatsapp_messages add column if not exists topics text[] not null default '{}';
alter table whatsapp_messages add column if not exists context_notes jsonb not null default '[]';

-- ───────────── RLS ─────────────
alter table calls enable row level security;
alter table call_insights enable row level security;
alter table commitments enable row level security;
alter table achievements enable row level security;
alter table achievement_mentions enable row level security;
alter table issues enable row level security;
alter table issue_evidence enable row level security;
alter table issue_events enable row level security;
alter table app_settings enable row level security;

create policy coach_all on calls for all to authenticated using ((select private.is_coach())) with check ((select private.is_coach()));
create policy coach_read on call_insights for select to authenticated using ((select private.is_coach()));
create policy coach_all on commitments for all to authenticated using ((select private.is_coach())) with check ((select private.is_coach()));
create policy coach_all on achievements for all to authenticated using ((select private.is_coach())) with check ((select private.is_coach()));
create policy coach_read on achievement_mentions for select to authenticated using ((select private.is_coach()));
create policy coach_all on issues for all to authenticated using ((select private.is_coach())) with check ((select private.is_coach()));
create policy coach_read on issue_evidence for select to authenticated using ((select private.is_coach()));
create policy coach_read on issue_events for select to authenticated using ((select private.is_coach()));
create policy coach_read on app_settings for select to authenticated using ((select private.is_coach()));
