// Integración con Postgres 16 real: migración + importación del CRM REAL + vista de días + RLS.
// Requiere PG_URL y CRM_CSV (no se versionan datos reales).
import { existsSync, readFileSync } from 'fs';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { groupClients, parseCrm, SheetRow } from '../lib/crm';
import { clientRecord, programRecord } from '../lib/crm-map';
import { todayISO } from '../lib/dates';

const PG = process.env.PG_URL, CSV = process.env.CRM_CSV;
const rowsFromCsv = (csv: string): SheetRow[] => csv.split(/\n/).filter((l) => l.trim()).map((line, i) => ({
  values: line.split(',').map((v, c) => (i > 0 && c === 4 && /^-?\d+$/.test(v.replace(/\r$/, '')) ? { formattedValue: v, userEnteredValue: { formulaValue: '=TODAY()-D' } } : { formattedValue: v.replace(/\r$/, '') })),
}));

describe.skipIf(!PG || !CSV || !existsSync(CSV!))('Postgres real + CRM real', () => {
  it('importa, calcula días en la vista y aplica RLS', async () => {
    const db = new Client({ connectionString: PG });
    await db.connect();
    await db.query(`drop schema if exists public cascade; drop schema if exists auth cascade; create schema public; create schema auth;
      do $$ begin if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists (select from pg_roles where rolname='anon') then create role anon; end if; end $$;
      create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
    await db.query(readFileSync('supabase/migrations/001_coach_os.sql', 'utf8'));
    await db.query(`grant usage on schema public, auth to authenticated; grant all on all tables in schema public to authenticated; grant execute on all functions in schema auth to authenticated;`);

    const clients = groupClients(parseCrm(rowsFromCsv(readFileSync(CSV!, 'utf8'))).programs);
    for (const c of clients) {
      const cr = clientRecord(c);
      const { rows: [{ id }] } = await db.query(`insert into clients (email,full_name,name_key,phone,status,success_case_url) values ($1,$2,$3,$4,$5,$6) returning id`,
        [cr.email, cr.full_name, cr.name_key, cr.phone, cr.status, cr.success_case_url]);
      for (const p of c.programs) {
        const r = programRecord(id, p, p === c.programs[c.programs.length - 1] ? c.issues : []);
        const cols = Object.keys(r);
        await db.query(`insert into programs (${cols.join(',')}) values (${cols.map((_, i) => '$' + (i + 1)).join(',')})`, Object.values(r));
      }
    }
    const { rows: [{ d }] } = await db.query(`select current_date::text d`);
    expect(d).toBe(todayISO()); // la vista usa la fecha del servidor

    const { rows } = await db.query(`select c.full_name, c.status, s.days_elapsed, s.days_remaining, s.effective_end_date::text end
      from clients c join lateral (select * from program_status where client_id=c.id order by start_date desc limit 1) s on true
      where c.status in ('active','upcoming') order by c.full_name`);
    console.table(rows);
    expect(rows.map((r) => r.full_name)).toEqual(['Camilo Rivera', 'Ilian Griñán', 'Lorena Gonzalez', 'Manel Clavel', 'Roberto Peirano']);
    const total = await db.query(`select count(*)::int n from clients`);
    expect(total.rows[0].n).toBe(21);
    const rob = await db.query(`select count(*)::int n from programs p join clients c on c.id=p.client_id where c.email='robertopeirano@adinet.com.uy'`);
    expect(rob.rows[0].n).toBe(2);

    // pausa de 10 días en Manel → +10 días restantes
    const m = rows.find((r) => r.full_name === 'Manel Clavel');
    await db.query(`insert into program_adjustments (program_id, kind, days) select p.id,'pause',10 from programs p join clients c on c.id=p.client_id where c.full_name='Manel Clavel'`);
    const { rows: [m2] } = await db.query(`select days_remaining from program_status s join clients c on c.id=s.client_id where c.full_name='Manel Clavel'`);
    expect(m2.days_remaining).toBe(m.days_remaining + 10);

    // RLS: usuario no autorizado no ve nada
    await db.query(`set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false)`);
    expect((await db.query(`select * from clients`)).rowCount).toBe(0);
    expect((await db.query(`select * from program_status`)).rowCount).toBe(0);
    await db.query(`reset role`);
    await db.end();
  });
});
