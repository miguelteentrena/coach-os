-- Varias cuentas de Fathom: 1 = FATHOM_API_KEY, 2 = FATHOM_API_KEY_2. Aditivo, no toca datos existentes.
alter table calls add column if not exists fathom_account smallint not null default 1;
