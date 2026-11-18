import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('migración SQL', () => {
  it('se aplica y la vista calcula días con ajustes; RLS bloquea a no-coaches', async () => {
    const db = new PGlite();
    await db.exec(`create schema auth; create role authenticated; create role anon;
      create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
    await db.exec(readFileSync('supabase/migrations/001_coach_os.sql', 'utf8'));
    await db.exec(`grant usage on schema public, auth to authenticated; grant all on all tables in schema public to authenticated;`);
    await db.exec(`insert into clients (id,email,full_name,name_key) values ('00000000-0000-0000-0000-000000000001','a@b.c','A','a');
      insert into programs (id,client_id,crm_row,crm_row_hash,program_key,start_date,crm_end_date) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000001',2,'h','k',current_date-10,current_date+20);
      insert into program_adjustments (program_id,kind,days) values ('00000000-0000-0000-0000-0000000000a1','pause',7);`);
    const r = await db.query<any>(`select days_elapsed, days_remaining from program_status`);
    expect(r.rows[0]).toEqual({ days_elapsed: 10, days_remaining: 27 });

    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000dead',false);`);
    expect((await db.query(`select * from clients`)).rows).toHaveLength(0);
    await db.exec(`reset role; insert into coach_users (user_id,email) values ('00000000-0000-0000-0000-00000000dead','coach@x.com'); set role authenticated;`);
    expect((await db.query(`select * from clients`)).rows).toHaveLength(1);
    expect((await db.query(`select * from program_status`)).rows).toHaveLength(1);
  });
});
