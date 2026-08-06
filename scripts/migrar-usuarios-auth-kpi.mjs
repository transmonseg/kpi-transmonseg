// scripts/migrar-usuarios-auth-kpi.mjs
//
// Migra os usuarios reais de auth.users do Supabase de origem pro
// auth.users que o GoTrue dedicado do KPI (Contabo) criou.
//
// Precisa rodar DE DENTRO do Contabo (gotrue_service_kpi so aceita
// conexao de 127.0.0.1, ver pg_hba.conf). Nao roda local.
//
// Uso:
//   ORIGEM_DATABASE_URL=... DESTINO_DATABASE_URL=... node migrar-usuarios-auth-kpi.mjs
import pg from "pg";

const ORIGEM_URL = process.env.ORIGEM_DATABASE_URL;
const DESTINO_URL = process.env.DESTINO_DATABASE_URL;

if (!ORIGEM_URL || !DESTINO_URL) {
  console.error("Defina ORIGEM_DATABASE_URL e DESTINO_DATABASE_URL no ambiente antes de rodar.");
  process.exit(1);
}

const origem = new pg.Pool({ connectionString: ORIGEM_URL, statement_timeout: 15000, max: 1 });
const destino = new pg.Pool({ connectionString: DESTINO_URL, statement_timeout: 15000, max: 1 });

const { rows } = await origem.query(`
  select id, email, encrypted_password, email_confirmed_at, created_at, raw_user_meta_data, aud, role
  from auth.users
`);
console.log(`${rows.length} usuarios extraidos da origem`);

let inseridos = 0;
for (const u of rows) {
  await destino.query(
    `insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, aud, role, instance_id)
     values ($1, $2, $3, $4, $5, now(), $6, $7, $8, '00000000-0000-0000-0000-000000000000')
     on conflict (id) do nothing`,
    [u.id, u.email, u.encrypted_password, u.email_confirmed_at, u.created_at, u.raw_user_meta_data ?? {}, u.aud ?? "authenticated", u.role ?? "authenticated"]
  );
  inseridos++;
}
console.log(`${inseridos} usuarios inseridos no destino`);

const { rows: contagem } = await destino.query("select count(*) from auth.users");
console.log(`Contagem final no destino: ${contagem[0].count}`);

await origem.end();
await destino.end();
