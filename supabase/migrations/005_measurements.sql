-- Medidas corporales con fecha y fuente (llamadas de Fathom, manual). Aditivo.
create table if not exists measurements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  measured_on date not null,
  metric text not null check (metric in ('weight_kg','waist_cm','hip_cm','chest_cm','arm_cm','arm_flexed_cm','bicep_cm','thigh_cm')),
  value numeric,            -- valor absoluto, si se dijo
  change numeric,           -- variación, si solo se dijo «ha bajado X»
  source_type text not null check (source_type in ('fathom','jotform','manual')),
  source_ref text,          -- id de la llamada
  link text,
  basis text not null default 'fathom_summary',
  note text,
  created_at timestamptz not null default now(),
  check (value is not null or change is not null),
  unique (client_id, metric, measured_on, source_type, source_ref)
);
create index if not exists measurements_client_idx on measurements(client_id, measured_on);
alter table measurements enable row level security;
create policy measurements_coach on measurements for all to authenticated using (private.is_coach()) with check (private.is_coach());
