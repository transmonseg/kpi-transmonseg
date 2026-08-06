# Migração KPI pro Contabo — Auth Self-Hosted (Sub-projeto 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GoTrue standalone dedicado ao KPI (processo/porta/banco/role/JWT secret próprios, zero overlap com o GoTrue do Monitoramento) com os 11 usuários reais migrados (mesmo UUID, mesmo hash de senha), as 13 FKs pra `auth.users` e as 31 policies de RLS restauradas, e o PostgREST do KPI validando JWT de verdade — tudo testado com um login HTTP real antes de fechar.

**Architecture:** Reusa o binário `/usr/local/bin/gotrue` já instalado no Contabo (mesma versão do GoTrue do Monitoramento), sobe como processo systemd separado (`gotrue-kpi`, porta 9998) apontando pro schema `auth` de `kpi_transmonseg`. Usuários migrados via script Node (extrai do Supabase, insere direto no `auth.users` que o próprio GoTrue cria). FKs/policies restauradas extraindo só os trechos que faltam de um dump fresco do schema de origem (não escritas à mão — origem é a fonte de verdade exata).

**Tech Stack:** GoTrue v2.193.1 (binário já existente), Node.js (`pg` — já é dependência do projeto), PostgreSQL 17.10.

## Global Constraints

- Zero mudança no GoTrue do Monitoramento (porta 9999, banco `transmonseg`) — processo/config/role/JWT secret totalmente separados.
- Zero mudança no Supabase de origem — só leitura (`SELECT`/`pg_dump`).
- Zero mudança no app de produção (Vercel) — nada aponta pro GoTrue novo até o sub-projeto 4.
- `GOTRUE_DISABLE_SIGNUP=true` sempre (cadastro só via convite).
- Toda credencial nova registrada em `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md` antes de considerar a task concluída.
- Comandos remotos via `ssh transmonseg-vps "..."`.

---

### Task 1: Instalar e configurar o GoTrue do KPI

**Files:**
- Nenhum arquivo de repo — config/systemd no Contabo via SSH.
- Atualizar: `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md`.

**Interfaces:**
- Consumes: banco `kpi_transmonseg` (sub-projeto 1, completo), role `postgres` superuser no Contabo.
- Produces: schema `auth` populado pelas migrations internas do GoTrue em `kpi_transmonseg`; processo `gotrue-kpi` respondendo em `127.0.0.1:9998`; `GOTRUE_JWT_SECRET` novo, registrado no vault (vai ser consumido pelo Task 4).

- [ ] **Step 1: Confirmar o binário existe (não precisa baixar de novo)**

Run: `ssh transmonseg-vps "ls -la /usr/local/bin/gotrue /usr/local/bin/auth"`

Expected: os dois arquivos existem (um é symlink do outro, já instalado pro Monitoramento).

- [ ] **Step 2: Criar role de banco dedicado + schema `auth` em `kpi_transmonseg`**

Gerar senha: `openssl rand -base64 24` (guardar o valor — usado no Step 3).

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"
create role gotrue_service_kpi login password '<SENHA_GERADA>';
alter role gotrue_service_kpi set search_path = auth, public;
create schema if not exists auth;
grant all on schema auth to gotrue_service_kpi;
grant all on schema public to gotrue_service_kpi;
\""
```

Mesmo padrão exato do `gotrue_service` do Monitoramento (role de login, `search_path` setado pra `auth, public` — sem isso as migrations internas do GoTrue tentam criar `schema_migrations` em `public` e dão erro de permissão, achado real já documentado no Monitoramento).

Expected: `CREATE ROLE`, `ALTER ROLE`, `CREATE SCHEMA` (ou "already exists" se algum step anterior já tiver criado o schema — sem problema), dois `GRANT`.

- [ ] **Step 3: Gerar JWT secret dedicado + configurar `/etc/gotrue/kpi-env`**

Gerar: `openssl rand -base64 32` (guardar — usado aqui e no Task 4).

```bash
ssh transmonseg-vps "cat > /etc/gotrue/kpi-env << 'EOF'
GOTRUE_DB_DRIVER=postgres
DATABASE_URL=postgres://gotrue_service_kpi:<SENHA_GERADA_STEP2>@localhost:5432/kpi_transmonseg
GOTRUE_SITE_URL=http://localhost:3000
API_EXTERNAL_URL=http://localhost:9998
GOTRUE_JWT_SECRET=<JWT_SECRET_GERADO>
GOTRUE_JWT_EXP=3600
GOTRUE_DISABLE_SIGNUP=true
GOTRUE_API_HOST=127.0.0.1
PORT=9998
EOF"
ssh transmonseg-vps "chmod 600 /etc/gotrue/kpi-env && chown root:root /etc/gotrue/kpi-env"
```

`GOTRUE_SITE_URL`/`API_EXTERNAL_URL` como placeholder (`localhost:3000`/`localhost:9998`) — mesmo padrão do Monitoramento, domínio real só quando o sub-projeto 4 definir onde o app novo vai morar. `PORT=9998` (não 9999, que já é do Monitoramento).

- [ ] **Step 4: Criar systemd unit e subir**

```bash
ssh transmonseg-vps "cat > /etc/systemd/system/gotrue-kpi.service << 'EOF'
[Unit]
Description=GoTrue Auth (KPI)
After=postgresql.service

[Service]
EnvironmentFile=/etc/gotrue/kpi-env
ExecStart=/usr/local/bin/gotrue
Restart=always
User=postgres

[Install]
WantedBy=multi-user.target
EOF"
ssh transmonseg-vps "systemctl daemon-reload && systemctl enable --now gotrue-kpi"
```

- [ ] **Step 5: Verificar**

Run: `ssh transmonseg-vps "sleep 2 && curl -s http://127.0.0.1:9998/health"`

Expected: resposta JSON de health check (sem erro de conexão recusada).

Run: `ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c '\dn'"`

Expected: schema `auth` listado.

Run: `ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c 'select count(*) from auth.users;'"`

Expected: `0` (GoTrue criou as tabelas mas ainda sem usuário — migração é o Task 2).

- [ ] **Step 6: Confirmar o GoTrue do Monitoramento não foi afetado**

Run: `ssh transmonseg-vps "curl -s http://127.0.0.1:9999/health && systemctl status gotrue --no-pager | head -5"`

Expected: `active (running)`, health check OK, processo/porta intactos.

- [ ] **Step 7: Registrar no vault**

Adicionar em `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md`:

```markdown
## Contabo — auth self-hosted / GoTrue (2026-08-05, sub-projeto 2)

GoTrue dedicado ao KPI, mesmo binário do Monitoramento
(`/usr/local/bin/gotrue`), processo/porta/banco/role/JWT secret
totalmente separados. Porta `127.0.0.1:9998` (systemd `gotrue-kpi`,
config `/etc/gotrue/kpi-env`, `chmod 600`).

```
usuário do banco: gotrue_service_kpi
senha: <SENHA_GERADA_STEP2>
GOTRUE_JWT_SECRET: <JWT_SECRET_GERADO>
```

`GOTRUE_DISABLE_SIGNUP=true` (cadastro só via convite, tabela `convites`
já migrada no sub-projeto 1).
```

- [ ] **Step 8: Commit**

```bash
cd ~/Projects/chaves-apis-joaquim && git add sistema-kpi/chaves.md && git commit -m "docs(kpi): GoTrue dedicado no ar no Contabo (sub-projeto 2, Task 1)"
```

---

### Task 2: Migrar os 11 usuários reais

**Files:**
- Create: `scripts/migrar-usuarios-auth-kpi.mjs`

**Interfaces:**
- Consumes: `auth.users` do Supabase de origem (via `DATABASE_URL` do vault); `auth.users` vazio criado pelo GoTrue no Task 1.
- Produces: 11 linhas em `auth.users` de `kpi_transmonseg`, mesmo `id`/`email`/`encrypted_password` da origem.

- [ ] **Step 1: Confirmar a contagem na origem**

Run: `ssh transmonseg-vps "psql 'postgresql://postgres:<SENHA_SUPABASE_VER_VAULT>@db.luhwpsckvbctxynifryk.supabase.co:5432/postgres' -c 'select count(*) from auth.users;'"`

Expected: `11` (número já confirmado nesta sessão via `perfis`; `auth.users` deve bater ou ser ligeiramente maior se houver usuário sem perfil).

- [ ] **Step 2: Comparar colunas — origem vs. `auth.users` criado pelo GoTrue novo**

Run:
```bash
ssh transmonseg-vps "psql 'postgresql://postgres:<SENHA_SUPABASE_VER_VAULT>@db.luhwpsckvbctxynifryk.supabase.co:5432/postgres' -c '\d auth.users' > /tmp/auth_users_origem.txt"
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c '\d auth.users' > /tmp/auth_users_destino.txt"
ssh transmonseg-vps "diff /tmp/auth_users_origem.txt /tmp/auth_users_destino.txt"
```

Confirmar que existem, nos dois lados, pelo menos: `id` (uuid), `email` (text/varchar), `encrypted_password` (text/varchar), `email_confirmed_at` (timestamptz), `created_at` (timestamptz), `raw_user_meta_data` (jsonb). Se algum nome/tipo divergir, ajustar o script do Step 3 pra esse nome real — não assumir que são idênticos só porque é a mesma versão do GoTrue (Supabase pode ter colunas extras específicas dela).

- [ ] **Step 3: Escrever o script de migração**

```javascript
// scripts/migrar-usuarios-auth-kpi.mjs
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
```

Nota: se o Step 2 mostrar que `auth.users` do GoTrue novo não tem coluna `instance_id`, ou tem NOT NULL em alguma coluna não listada aqui, ajustar o INSERT pra bater com o schema real confirmado no Step 2 — este código assume a estrutura padrão do GoTrue v2.193.1, mas confirmar antes de rodar contra dado real.

- [ ] **Step 4: Rodar o script DE DENTRO do Contabo (não local)**

Confirmado nesta sessão via `pg_hba.conf`: só os roles `postgres` e `app_service` têm regra de conexão — `gotrue_service_kpi` só conecta de `127.0.0.1` (dentro do próprio VPS). Rodar local falharia na autenticação. Copiar o script pro VPS e rodar de lá:

```bash
scp scripts/migrar-usuarios-auth-kpi.mjs transmonseg-vps:/tmp/migrar-usuarios-auth-kpi.mjs
ssh transmonseg-vps "mkdir -p /tmp/migracao-kpi-auth && cd /tmp/migracao-kpi-auth && npm init -y --silent && npm install pg --silent"
ssh transmonseg-vps "cp /tmp/migrar-usuarios-auth-kpi.mjs /tmp/migracao-kpi-auth/ && cd /tmp/migracao-kpi-auth && \
  ORIGEM_DATABASE_URL='postgresql://postgres:<SENHA_SUPABASE_VER_VAULT>@db.luhwpsckvbctxynifryk.supabase.co:5432/postgres' \
  DESTINO_DATABASE_URL='postgresql://gotrue_service_kpi:<SENHA_STEP2_TASK1>@localhost:5432/kpi_transmonseg' \
  node migrar-usuarios-auth-kpi.mjs"
```

Depois de confirmar o resultado (Step 5), limpar: `ssh transmonseg-vps "rm -rf /tmp/migracao-kpi-auth /tmp/migrar-usuarios-auth-kpi.mjs"`.

Expected: "11 usuarios extraidos da origem", "11 usuarios inseridos no destino" (ou próximo, ver Step 1), "Contagem final no destino: 11".

- [ ] **Step 5: Verificar a contagem final e um usuário específico**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c 'select count(*) from auth.users;'"
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"select id, email, email_confirmed_at is not null as confirmado from auth.users order by created_at limit 5;\""
```

Expected: contagem bate com o Step 1; e-mails reais aparecem (confirma que não é lixo/vazio).

- [ ] **Step 6: Confirmar `perfis`/`convites` já apontam pros usuários certos (dado migrado no sub-projeto 1)**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"select p.email, p.papel, (u.id is not null) as tem_auth_user from perfis p left join auth.users u on u.id = p.user_id;\""
```

Expected: `tem_auth_user = true` pras 11 linhas — confirma que os UUIDs preservados no Step 3 batem exatamente com o que `perfis.user_id` já esperava desde o sub-projeto 1 (sem isso, a FK do Task 3 desta task não vai fechar).

- [ ] **Step 7: Teste real de login via HTTP**

Pegar um e-mail real do Step 5. Você NÃO tem a senha em texto puro (só o hash) — pedir ao usuário uma senha de teste conhecida, OU (mais simples, não depende de ninguém) usar o endpoint admin do GoTrue pra gerar um magic link/OTP de teste, OU testar só que o endpoint de login responde corretamente pra credenciais erradas (prova que o GoTrue está processando request de auth de verdade contra o `auth.users` migrado, sem precisar da senha real de ninguém):

```bash
ssh transmonseg-vps "curl -s -X POST http://127.0.0.1:9998/token?grant_type=password -H 'Content-Type: application/json' -d '{\"email\":\"<EMAIL_REAL_DO_STEP5>\",\"password\":\"senha-propositalmente-errada\"}'"
```

Expected: erro estruturado do GoTrue tipo `{"error":"invalid_grant","error_description":"Invalid login credentials"}` — **não** um erro de conexão/schema/tabela. Esse erro específico prova que o GoTrue achou o usuário pelo e-mail e validou a senha (errada) contra o hash migrado — o caminho todo (schema, tabela, coluna, comparação bcrypt) está funcionando; só falta a senha certa, que só o dono da conta tem.

- [ ] **Step 8: Commit**

```bash
cd ~/Projects/Transmonseg/kpi/"KPI TEMP"
git add scripts/migrar-usuarios-auth-kpi.mjs
git commit -m "feat(kpi): script de migracao de usuarios do Supabase Auth pro GoTrue do Contabo"
```

---

### Task 3: Restaurar as 13 FKs e as 31 policies de RLS pendentes

**Files:**
- Nenhum arquivo de repo — dump temporário em `/tmp` no Contabo.

**Interfaces:**
- Consumes: `auth.users` populado (Task 2); schema `public` de `kpi_transmonseg` (sub-projeto 1).
- Produces: as 13 FKs e as 31 policies existindo em `kpi_transmonseg`, idênticas à origem.

- [ ] **Step 1: Criar os roles que as policies/grants referenciam (não existem ainda em `kpi_transmonseg`)**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"
create role authenticated nologin noinherit;
create role anon nologin noinherit;
create role service_role nologin noinherit bypassrls;
grant authenticated to app_service_kpi;
grant anon to app_service_kpi;
grant service_role to app_service_kpi;
\""
```

`app_service_kpi` precisa poder `SET ROLE` pra qualquer um desses (é o role de conexão do PostgREST) — mesmo princípio do `GRANT web_anon_kpi TO app_service_kpi` já aplicado no sub-projeto 1.

- [ ] **Step 2: Dump do schema completo da origem de novo (só leitura, mesmo comando do sub-projeto 1)**

```bash
ssh transmonseg-vps "pg_dump 'postgresql://postgres:<SENHA_SUPABASE_VER_VAULT>@db.luhwpsckvbctxynifryk.supabase.co:5432/postgres' \
  --schema-only --schema=public --no-owner --no-privileges \
  -f /tmp/kpi_schema_auth.sql"
```

- [ ] **Step 3: Extrair só os `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ... REFERENCES auth.users` e `CREATE POLICY`**

```bash
ssh transmonseg-vps "grep -n 'REFERENCES auth.users' /tmp/kpi_schema_auth.sql"
ssh transmonseg-vps "grep -c 'CREATE POLICY' /tmp/kpi_schema_auth.sql"
```

Confirmar 13 ocorrências de `REFERENCES auth.users` e 31 de `CREATE POLICY` (números já confirmados na revisão final do sub-projeto 1) — se vier diferente, parar e investigar antes de aplicar (pode ter havido mudança na origem desde então, já que ela continua em produção recebendo alteração).

- [ ] **Step 4: Aplicar só esses trechos (não o dump inteiro — o resto do schema já está migrado)**

Extrair as linhas relevantes num arquivo à parte, preservando os blocos `ALTER TABLE ... ADD CONSTRAINT` e `CREATE POLICY` completos (não só a linha do grep — cada um pode ter várias linhas):

```bash
ssh transmonseg-vps "awk '/^ALTER TABLE.*ONLY/{buf=\$0; capturando=1; next} capturando && /REFERENCES auth.users/{print buf; print; capturando=0; next} capturando{buf=buf\"\\n\"\$0}' /tmp/kpi_schema_auth.sql > /tmp/kpi_fks_auth.sql"
ssh transmonseg-vps "awk '/^CREATE POLICY/{capturando=1} capturando{print} capturando && /;\$/{capturando=0}' /tmp/kpi_schema_auth.sql > /tmp/kpi_policies.sql"
ssh transmonseg-vps "wc -l /tmp/kpi_fks_auth.sql /tmp/kpi_policies.sql"
```

Revisar visualmente os dois arquivos extraídos (`cat`) antes de aplicar — confirmar que cada bloco está completo (começa em `ALTER TABLE`/`CREATE POLICY`, termina em `;`), já que extração por `awk` heurístico pode cortar errado se o formato do dump variar. Se algum bloco estiver truncado/incompleto, corrigir manualmente antes do Step 5 (não aplicar SQL incompleto).

- [ ] **Step 5: Aplicar as FKs primeiro, depois as policies**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -f /tmp/kpi_fks_auth.sql 2>&1 | tail -40"
```

Expected: 13 `ALTER TABLE` sem erro (agora que `auth.users` existe e está populado com os mesmos UUIDs que `perfis`/`convites`/etc já referenciam).

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -f /tmp/kpi_policies.sql 2>&1 | tail -60"
```

Expected: 31 `CREATE POLICY` sem erro (agora que os roles `authenticated`/`anon`/`service_role` existem).

- [ ] **Step 6: Verificar as contagens**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"
select count(*) from information_schema.table_constraints
where constraint_type='FOREIGN KEY' and constraint_schema='public'
  and constraint_name in (select conname from pg_constraint where confrelid = 'auth.users'::regclass);
\""
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"select count(*) from pg_policies where schemaname='public';\""
```

Expected: `13` e `31`.

- [ ] **Step 7: Limpar arquivos temporários**

```bash
ssh transmonseg-vps "rm -f /tmp/kpi_schema_auth.sql /tmp/kpi_fks_auth.sql /tmp/kpi_policies.sql /tmp/auth_users_origem.txt /tmp/auth_users_destino.txt"
```

- [ ] **Step 8: Commit**

Nada pra commitar nesta task (mudança só no banco remoto) — pular pra próxima.

---

### Task 4: Configurar `jwt-secret` no PostgREST do KPI e validar auth de ponta a ponta

**Files:**
- Modify (no Contabo, via SSH): `/etc/postgrest/kpi.conf`

**Interfaces:**
- Consumes: `GOTRUE_JWT_SECRET` gerado no Task 1; PostgREST do KPI já rodando (sub-projeto 1, porta 3002).
- Produces: PostgREST do KPI aceitando JWT real emitido pelo GoTrue do KPI, trocando de role (`anon`/`authenticated`) conforme o token.

- [ ] **Step 1: Adicionar `jwt-secret` ao config**

```bash
ssh transmonseg-vps "cat >> /etc/postgrest/kpi.conf << 'EOF'
jwt-secret = \"<JWT_SECRET_GERADO_TASK1>\"
EOF"
```

- [ ] **Step 2: Reiniciar o PostgREST do KPI**

```bash
ssh transmonseg-vps "systemctl restart postgrest-kpi && sleep 2 && systemctl status postgrest-kpi --no-pager | head -5"
```

Expected: `active (running)`.

- [ ] **Step 3: Confirmar que o Monitoramento (PostgREST 3001) não foi afetado**

```bash
ssh transmonseg-vps "curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/"
```

Expected: `200` (arquivo de config diferente, processo diferente — não deveria ter sido tocado, mas confirmar).

- [ ] **Step 4: Testar sem Authorization (comportamento `anon` deve continuar igual)**

```bash
ssh transmonseg-vps "curl -s http://127.0.0.1:3002/lojas?limit=1"
```

Expected: mesmo erro de antes (`permission denied for table lojas`, porque `web_anon_kpi`/`anon` não tem GRANT de tabela) — confirma que adicionar `jwt-secret` não quebrou o caminho sem token.

- [ ] **Step 5: Testar com um JWT malformado (deve dar 401 limpo, não 500)**

```bash
ssh transmonseg-vps "curl -s -H 'Authorization: Bearer lixo.nao.jwt' http://127.0.0.1:3002/lojas?limit=1"
```

Expected: erro `PGRST301` (JWT inválido) — **não** `PGRST300` ("Server lacks JWT secret", que seria o sintoma de o `jwt-secret` não ter sido aplicado de verdade).

- [ ] **Step 6: Gerar um JWT válido assinado com o secret do GoTrue do KPI e testar**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -tAc \"select id, email from auth.users limit 1;\""
```

Pegar o `id` retornado. Gerar um JWT HS256 válido com esse secret, claim mínimo `{\"role\":\"authenticated\",\"sub\":\"<ID_DO_USUARIO>\"}` (usar `node -e` com uma lib JWT simples, ou o próprio GoTrue via endpoint — mais simples: usar o resultado de um login real bem-sucedido se algum usuário quiser testar com senha de verdade; senão, montar manualmente via `node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({role:'authenticated',sub:'<ID>'}, '<JWT_SECRET>'))"` — confirmar que o pacote `jsonwebtoken` está disponível no repo (`grep jsonwebtoken package.json`) antes de assumir que dá pra rodar direto; se não estiver, `npx` resolve sem instalar permanente).

```bash
ssh transmonseg-vps "curl -s -H 'Authorization: Bearer <JWT_GERADO>' http://127.0.0.1:3002/lojas?limit=1"
```

Expected: **não** mais `permission denied to set role` nem erro de JWT — ou dado real (se `authenticated` tiver GRANT de tabela, o que não foi dado nesta task, só criado o role) ou `permission denied for table lojas` de novo (esperado, já que ninguém deu GRANT de tabela pro role `authenticated` ainda — isso fica pro sub-projeto 4, que decide o modelo de autorização final do app). O que NÃO pode acontecer é erro de JWT/role inválido — isso provaria que o `jwt-secret` está errado ou o role não existe.

- [ ] **Step 7: Registrar no vault**

Adicionar em `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md`, seção do PostgREST:

```markdown
`jwt-secret` configurado em `/etc/postgrest/kpi.conf` (2026-08-05, sub-projeto 2)
— mesmo valor de `GOTRUE_JWT_SECRET` do GoTrue dedicado do KPI (porta 9998).
Roles `authenticated`/`anon`/`service_role` criados em `kpi_transmonseg`
(sem GRANT de tabela ainda — modelo de autorização final é decisão do
sub-projeto 4). `app_service_kpi` pode `SET ROLE` pros três.
```

- [ ] **Step 8: Commit**

```bash
cd ~/Projects/chaves-apis-joaquim && git add sistema-kpi/chaves.md && git commit -m "docs(kpi): jwt-secret configurado no PostgREST, roles authenticated/anon/service_role criados (sub-projeto 2, Task 4)"
```

---

## Verificação final do sub-projeto 2

- [ ] GoTrue do KPI ativo em `127.0.0.1:9998`, GoTrue do Monitoramento (9999) intocado — Task 1, Steps 5/6.
- [ ] 11 usuários migrados, mesmo UUID/hash de senha, `perfis`/`convites` já batendo por FK — Task 2, Steps 5/6.
- [ ] Teste real de login (senha errada) confirma o caminho auth completo funcionando — Task 2, Step 7.
- [ ] 13 FKs + 31 policies restauradas e contadas — Task 3, Step 6.
- [ ] PostgREST do KPI validando JWT real (401 limpo pra token inválido, sem `PGRST300`) — Task 4, Steps 5/6.
- [ ] PostgREST do Monitoramento (3001) intocado — Task 4, Step 3.
- [ ] Nenhum arquivo temporário sobrando em `/tmp` no Contabo.
- [ ] Vault atualizado com tudo que foi criado nesta sessão.

Próximo passo (fora deste plano): sub-projeto 3, storage em disco — só começar depois do usuário revisar este sub-projeto concluído.
