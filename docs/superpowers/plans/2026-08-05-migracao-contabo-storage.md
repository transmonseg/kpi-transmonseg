# Migração KPI pro Contabo — Storage Self-Hosted (Sub-projeto 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Storage-API oficial do Supabase (open source, `supabase/storage`) standalone no Contabo, backend de arquivo local, servindo o schema `storage` de `kpi_transmonseg`, com os 5 buckets ativos do KPI recriados e todo arquivo migrado da origem (verificado byte-a-byte via SHA-256) — testado com download/upload/signed-url/remove reais via HTTP antes de fechar.

**Architecture:** Clona e builda `supabase/storage` (tag `v1.60.4`, mesma versão que o docker-compose oficial da Supabase testa) direto do source (Node 24 já instalado no Contabo, sem Docker). Roda como processo systemd dedicado (`storage-api-kpi`, porta `127.0.0.1:5000`), schema `storage` criado pelas próprias migrations internas do software (não escritas à mão), reaproveitando o `GOTRUE_JWT_SECRET` já configurado no sub-projeto 2 — nenhum segredo novo de auth pra gerenciar. Migração de arquivo via API HTTP real do software novo (upload de verdade), nunca INSERT direto na tabela interna `storage.objects`.

**Tech Stack:** `supabase/storage` v1.60.4 (Node.js/TypeScript/Fastify, clonado e buildado do source), Node.js 24.18.0 (já instalado no Contabo), PostgreSQL 17.10, `pg` (já dependência do projeto, usado no script de migração de arquivos).

## Global Constraints

- Zero mudança no Monitoramento (portas 9999/3001/3000, banco `transmonseg`, PM2 `transmonseg-temp`/`transmonseg-definitivo`).
- Zero mudança no GoTrue/PostgREST do KPI já existentes (portas 9998/3002, sub-projetos 1/2) além de LER o `GOTRUE_JWT_SECRET` do vault.
- Zero mudança no app de produção (Vercel) e zero escrita na origem Supabase — a origem só é lida (download de arquivo pra migrar).
- Não migrar `kpi-manual-raw`/`kpis-gerados` (confirmado morto, zero referência no código dos dois repos).
- `STORAGE_BACKEND=file` sempre — sem S3/MinIO.
- `SERVER_HOST=127.0.0.1` sempre — nada exposto publicamente até o sub-projeto 4.
- Nenhum segredo (senha nova, `GOTRUE_JWT_SECRET` existente) é escrito neste plano nem em nenhum arquivo do repo KPI — só no vault (`~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md`), lido em tempo de execução. Toda credencial nova registrada no vault antes de considerar a task concluída.
- Comandos remotos via `ssh transmonseg-vps "..."`. Senhas novas geradas com `openssl rand -hex 24` (hex, sem caractere especial — evita o problema de percent-encoding de `/` já documentado no sub-projeto 1).
- Migração de arquivo (Task 4) sempre via API HTTP do Storage-API novo — nunca `INSERT`/`UPDATE` direto em `storage.objects`.

---

### Task 1: Clonar/buildar o Storage-API + criar schema `storage` e roles internos

**Files:**
- Nenhum arquivo de repo — build fica em `/opt/storage-api-kpi` no Contabo, fora de qualquer repo git.
- Atualizar: `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md` (Step 6).

**Interfaces:**
- Consumes: banco `kpi_transmonseg` (sub-projeto 1), roles `anon`/`authenticated`/`service_role` já existentes nesse banco (sub-projeto 2, Task 3) — a migration do Storage-API detecta que já existem e não recria (`IF NOT EXISTS`, confirmado lendo `migrations/tenant/0002-storage-schema.sql` do source).
- Produces: build em `/opt/storage-api-kpi/dist/start/server.js`; schema `storage` com tabelas `buckets`/`objects`/`migrations` em `kpi_transmonseg`; role `supabase_storage_admin` (login, dono do schema `storage`) — nome vem de dentro da própria migration (setting `storage.super_user`, default `supabase_storage_admin`), não é role que a gente inventa; Task 2 consome esse role pra configurar `DATABASE_URL`.

- [ ] **Step 1: Clonar a tag exata e buildar**

```bash
ssh transmonseg-vps "cd /opt && git clone --depth 1 --branch v1.60.4 https://github.com/supabase/storage.git storage-api-kpi"
ssh transmonseg-vps "cd /opt/storage-api-kpi && npm ci && npm run build"
```

Expected: `npm run build` termina sem erro; `ssh transmonseg-vps "test -f /opt/storage-api-kpi/dist/start/server.js && echo OK"` imprime `OK`.

Node 24.18.0 já instalado no Contabo (confirmado via `node --version`) — bate exatamente com o `engines.node >= 24.0.0` do `package.json` do projeto, sem precisar instalar/trocar versão.

- [ ] **Step 2: Confirmar diretório do socket Unix do Postgres**

Run: `ssh transmonseg-vps "sudo -u postgres psql -tAc 'show unix_socket_directories;'"`

Expected: `/var/run/postgresql` (já confirmado nesta investigação — usado no Step 3 pra rodar a migration via peer auth, sem senha de `postgres` por TCP).

- [ ] **Step 3: Rodar a migration do Storage-API como `postgres` (via socket, sem senha)**

A migration (`migrations/tenant/0002-storage-schema.sql`, lida do source) cria o schema `storage`, as tabelas, e os roles internos (`supabase_storage_admin`, `authenticator`) via `DO $$ ... CREATE ROLE/USER ... $$` — isso exige privilégio de superuser (CREATE ROLE, CREATE SCHEMA, ALTER TABLE ... OWNER TO), que só o `postgres` tem. Rodar como `postgres` local (peer auth via socket) evita precisar de senha do `postgres` por TCP.

```bash
ssh transmonseg-vps "cd /opt/storage-api-kpi && sudo -u postgres DATABASE_URL='postgres://postgres@/kpi_transmonseg?host=/var/run/postgresql' npm run migration:run"
```

Expected: log de migrations aplicadas (`0001-initialmigration`, `0002-storage-schema`, e as demais até a última do diretório `migrations/tenant/`), sem erro. Se der erro de env var faltando (o `getConfig()` do projeto pode exigir outras vars mesmo só pra migration) — ler a mensagem de erro exata e completar só a var que falta, sem adivinhar o resto; reportar como achado se for uma var não documentada em `.env.sample`.

- [ ] **Step 4: Confirmar schema/tabelas e roles criados**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c '\dn' -c '\dt storage.*' -c \"select rolname, rolcanlogin, rolbypassrls from pg_roles where rolname in ('supabase_storage_admin','authenticator');\""
```

Expected: schema `storage` listado; tabelas `storage.buckets`, `storage.objects`, `storage.migrations` existem; `supabase_storage_admin` existe (`rolcanlogin=t`), `authenticator` existe (`rolcanlogin=f` — só serve de agrupador de membership, não loga sozinho, mesmo padrão do PostgREST).

Confirmar também que os roles do sub-projeto 2 não foram duplicados/alterados: `ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"select rolname from pg_roles where rolname in ('anon','authenticated','service_role');\""` — deve continuar mostrando exatamente os mesmos 3, sem erro de "already exists" interrompendo a migration (a lógica `IF NOT EXISTS` do source deve ter pulado a criação).

- [ ] **Step 5: Definir senha do `supabase_storage_admin`**

```bash
ssh transmonseg-vps "openssl rand -hex 24"
```

Guardar o valor gerado (usado no Step 6 e no Task 2).

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"alter role supabase_storage_admin password '<SENHA_GERADA>';\""
```

Expected: `ALTER ROLE`.

- [ ] **Step 6: Registrar no vault**

Adicionar em `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md`:

```markdown
## Contabo — storage self-hosted (2026-08-05, sub-projeto 3)

Storage-API oficial do Supabase (`supabase/storage`, tag `v1.60.4`),
clonado/buildado do source em `/opt/storage-api-kpi` no Contabo (sem
Docker — Node 24.18.0 já instalado bate com o `engines` do projeto).
Schema `storage` criado pelas próprias migrations internas do software
em `kpi_transmonseg`. Role `supabase_storage_admin` (nome vem do próprio
software, setting `storage.super_user` — não é role inventado por nós,
é dono de todas as tabelas/funções do schema `storage`):

```
usuário do banco: supabase_storage_admin
senha: <SENHA_GERADA_STEP5>
```

Roles `anon`/`authenticated`/`service_role` (já existentes desde o
sub-projeto 2) reaproveitados sem duplicação — a migration do Storage-API
detecta que já existem e pula a criação.
```

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/chaves-apis-joaquim && git add sistema-kpi/chaves.md && git commit -m "docs(kpi): Storage-API buildado, schema storage criado no Contabo (sub-projeto 3, Task 1)"
```

---

### Task 2: Gerar chaves JWT + configurar env final + systemd + subir o serviço

**Files:**
- Nenhum arquivo de repo — config/systemd no Contabo via SSH.
- Atualizar: `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md`.

**Interfaces:**
- Consumes: `supabase_storage_admin`/senha (Task 1); `GOTRUE_JWT_SECRET` do KPI (já no vault, sub-projeto 2); PostgREST do KPI em `127.0.0.1:3002` (sub-projeto 1).
- Produces: processo `storage-api-kpi` respondendo em `127.0.0.1:5000`; `ANON_KEY`/`SERVICE_KEY` (JWTs long-lived) registrados no vault — consumidos pelos Tasks 3/4/5 como `Authorization: Bearer <SERVICE_KEY>` nas chamadas administrativas.

- [ ] **Step 1: Gerar `ANON_KEY`/`SERVICE_KEY` (JWTs assinados com o `GOTRUE_JWT_SECRET` existente)**

Ler o valor de `GOTRUE_JWT_SECRET` em `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md` (seção "Contabo — auth self-hosted / GoTrue"), depois rodar (localmente, não precisa ser no Contabo):

```bash
node -e '
const crypto = require("crypto");
function b64url(buf) {
  return buf.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function signJWT(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const data = b64url(Buffer.from(JSON.stringify(header))) + "." + b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(crypto.createHmac("sha256", secret).update(data).digest());
  return data + "." + sig;
}
const secret = "<GOTRUE_JWT_SECRET_DO_VAULT>";
const now = Math.floor(Date.now() / 1000);
const exp = now + 10 * 365 * 24 * 60 * 60;
console.log("ANON_KEY=" + signJWT({ role: "anon", iss: "supabase", iat: now, exp }, secret));
console.log("SERVICE_KEY=" + signJWT({ role: "service_role", iss: "supabase", iat: now, exp }, secret));
'
```

Expected: duas linhas `ANON_KEY=...`/`SERVICE_KEY=...`, cada uma um JWT de 3 partes separadas por `.`. Guardar os dois valores (usados no Step 2 e nos Tasks 3/4/5).

- [ ] **Step 2: Escrever `/etc/storage-api/kpi-env`**

```bash
ssh transmonseg-vps "mkdir -p /etc/storage-api && cat > /etc/storage-api/kpi-env << 'EOF'
SERVER_HOST=127.0.0.1
SERVER_PORT=5000
SERVER_REGION=local

AUTH_JWT_SECRET=<GOTRUE_JWT_SECRET_DO_VAULT>
AUTH_JWT_ALGORITHM=HS256
ANON_KEY=<ANON_KEY_GERADO_STEP1>
SERVICE_KEY=<SERVICE_KEY_GERADO_STEP1>

DATABASE_URL=postgres://supabase_storage_admin:<SENHA_TASK1_STEP5>@localhost:5432/kpi_transmonseg
DATABASE_SEARCH_PATH=

DB_INSTALL_ROLES=true
DB_ANON_ROLE=anon
DB_SERVICE_ROLE=service_role
DB_AUTHENTICATED_ROLE=authenticated
DB_SUPER_USER=supabase_storage_admin

# `DB_SUPER_USER` DEVE ser `supabase_storage_admin` (achado real da Task 1):
# o default do código pra essa var é `postgres`, mas o COALESCE do SQL da
# migration só usa o fallback correto quando a var não é passada. Como o
# processo em produção roda `runMigrationsOnTenant` toda vez que sobe
# (não só no `migration:run` manual), deixar `postgres` aqui reproduziria
# o mesmo bug silencioso (sem erro, mas sem transferir ownership de tabela
# nova) numa futura atualização do Storage-API com migrations novas.

POSTGREST_URL=http://127.0.0.1:3002

STORAGE_BACKEND=file
STORAGE_FILE_BACKEND_PATH=/srv/kpi-storage

UPLOAD_FILE_SIZE_LIMIT=104857600
UPLOAD_FILE_SIZE_LIMIT_STANDARD=52428800
UPLOAD_SIGNED_URL_EXPIRATION_TIME=60

IMAGE_TRANSFORMATION_ENABLED=false

RATE_LIMITER_ENABLED=false
PG_QUEUE_ENABLE=false

LOG_LEVEL=info
EOF"
ssh transmonseg-vps "chmod 600 /etc/storage-api/kpi-env && chown root:root /etc/storage-api/kpi-env"
```

`IMAGE_TRANSFORMATION_ENABLED=false` — os 5 buckets ativos guardam xlsx/pdf/json, nenhuma imagem; desliga a feature pra não precisar rodar `imgproxy` (menos um processo). `PG_QUEUE_ENABLE=false`/`RATE_LIMITER_ENABLED=false` — mesma lógica de menos peça rodando pro volume real do KPI (~1.6GB, uso interno).

Maior arquivo real medido nos 5 buckets ativos é ~9MB (`escalas-raw`) — `UPLOAD_FILE_SIZE_LIMIT_STANDARD=52428800` (50MB, default) sobra folga.

- [ ] **Step 3: Criar diretório do backend de arquivo**

```bash
ssh transmonseg-vps "mkdir -p /srv/kpi-storage && chown postgres:postgres /srv/kpi-storage && chmod 700 /srv/kpi-storage"
```

`chown postgres` — mesmo usuário Linux que roda o systemd do GoTrue/PostgREST do KPI (`User=postgres` nos dois, confirmado via `systemctl cat`); mantém a mesma convenção.

- [ ] **Step 4: Criar systemd unit e subir**

```bash
ssh transmonseg-vps "cat > /etc/systemd/system/storage-api-kpi.service << 'EOF'
[Unit]
Description=Supabase Storage API (KPI)
After=postgresql.service

[Service]
EnvironmentFile=/etc/storage-api/kpi-env
WorkingDirectory=/opt/storage-api-kpi
ExecStart=/usr/bin/node dist/start/server.js
Restart=always
User=postgres

[Install]
WantedBy=multi-user.target
EOF"
ssh transmonseg-vps "systemctl daemon-reload && systemctl enable --now storage-api-kpi"
```

- [ ] **Step 5: Verificar**

Run: `ssh transmonseg-vps "sleep 2 && curl -s http://127.0.0.1:5000/health"`

Expected: `{"healthy":true}`. Se der erro de conexão recusada ou 500, rodar `ssh transmonseg-vps "journalctl -u storage-api-kpi -n 50 --no-pager"` e ler o erro exato antes de tentar qualquer ajuste — não adivinhar a causa.

- [ ] **Step 6: Confirmar Monitoramento e KPI (banco/auth) não afetados**

```bash
ssh transmonseg-vps "curl -s http://127.0.0.1:9999/health && curl -s http://127.0.0.1:3001/ -o /dev/null -w '%{http_code}\n' && curl -s http://127.0.0.1:9998/health && curl -s http://127.0.0.1:3002/ -o /dev/null -w '%{http_code}\n'"
```

Expected: GoTrue Monitoramento (9999) e KPI (9998) saudáveis; PostgREST Monitoramento (3001) e KPI (3002) `200`.

- [ ] **Step 7: Registrar no vault**

Adicionar em `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md`, na seção criada no Task 1:

```markdown
Processo `storage-api-kpi` (systemd, `/etc/storage-api/kpi-env`, `chmod 600`)
em `127.0.0.1:5000`. Backend de arquivo em `/srv/kpi-storage/` (dono
`postgres`, `chmod 700`). `AUTH_JWT_SECRET` = mesmo `GOTRUE_JWT_SECRET`
do sub-projeto 2 — nenhum segredo de auth novo.

```
ANON_KEY: <ANON_KEY_GERADO>
SERVICE_KEY: <SERVICE_KEY_GERADO>
```

JWTs long-lived (10 anos), assinados manualmente com o secret acima —
mesmo formato que o `@supabase/supabase-js` do app espera pras chaves
`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`, mas isso só
importa no sub-projeto 4 (troca de env do app).
```

- [ ] **Step 8: Commit**

```bash
cd ~/Projects/chaves-apis-joaquim && git add sistema-kpi/chaves.md && git commit -m "docs(kpi): Storage-API no ar no Contabo, porta 5000 (sub-projeto 3, Task 2)"
```

---

### Task 3: Criar os 5 buckets ativos

**Files:**
- Nenhum arquivo de repo.

**Interfaces:**
- Consumes: `SERVICE_KEY` (Task 2); Storage-API em `127.0.0.1:5000` (Task 2).
- Produces: 5 buckets (`escalas-raw`, `unitrac-raw`, `kpi-outputs`, `kpi-api-dash`, `nutrimax-outputs`) existentes no Storage-API novo, todos privados — consumidos pelo Task 4 (upload dos arquivos).

- [ ] **Step 1: Criar os 5 buckets via API real**

Repetir pra cada um dos 5 nomes (`escalas-raw`, `unitrac-raw`, `kpi-outputs`, `kpi-api-dash`, `nutrimax-outputs`):

```bash
ssh transmonseg-vps "curl -s -X POST http://127.0.0.1:5000/bucket \
  -H 'Authorization: Bearer <SERVICE_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{\"name\":\"escalas-raw\",\"public\":false}'"
```

Expected: resposta JSON com o `name` do bucket criado (sem erro de autenticação/permissão). Repetir substituindo o `name` pros outros 4.

- [ ] **Step 2: Confirmar os 5 existem, nada a mais nem a menos**

```bash
ssh transmonseg-vps "curl -s http://127.0.0.1:5000/bucket -H 'Authorization: Bearer <SERVICE_KEY>' | node -e 'let d=\"\"; process.stdin.on(\"data\",c=>d+=c); process.stdin.on(\"end\",()=>{const b=JSON.parse(d); console.log(b.length, b.map(x=>x.name).sort())})'"
```

Expected: `5 [ 'escalas-raw', 'kpi-api-dash', 'kpi-outputs', 'nutrimax-outputs', 'unitrac-raw' ]` — exatamente os 5 ativos, sem `kpi-manual-raw`/`kpis-gerados`.

Também confirmar via banco direto (visão independente da API):

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c 'select id, public from storage.buckets order by id;'"
```

Expected: mesmos 5, `public = f` em todos.

---

### Task 4: Script de migração de arquivos (origem → novo, verificado por hash)

**Files:**
- Create: `scripts/migrar-storage-kpi.mjs`

**Interfaces:**
- Consumes: `SUPABASE_SERVICE_ROLE_KEY`/URL da origem (vault, seção "Obrigatórias"); `SERVICE_KEY`/`127.0.0.1:5000` do Storage-API novo (Task 2/3).
- Produces: todo arquivo dos 5 buckets ativos migrado, com log de resumo (contagem por bucket, mismatches de hash) — consumido pelo Task 5 como base pra validação HTTP independente.

- [ ] **Step 1: Escrever o script**

```javascript
// scripts/migrar-storage-kpi.mjs
// Migra todo arquivo dos 5 buckets ativos do Supabase Storage (origem) pro
// Storage-API self-hosted novo no Contabo, via API HTTP real dos dois lados
// (nunca lendo/escrevendo storage.objects direto). Idempotente: usa
// x-upsert=true, pode rodar de novo sem duplicar.

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

const ORIGEM_URL = process.env.ORIGEM_SUPABASE_URL
const ORIGEM_SERVICE_KEY = process.env.ORIGEM_SERVICE_ROLE_KEY
const NOVO_BASE_URL = process.env.STORAGE_API_URL ?? 'http://127.0.0.1:5000'
const NOVO_SERVICE_KEY = process.env.STORAGE_API_SERVICE_KEY

if (!ORIGEM_URL || !ORIGEM_SERVICE_KEY || !NOVO_SERVICE_KEY) {
  console.error('Faltam env vars: ORIGEM_SUPABASE_URL, ORIGEM_SERVICE_ROLE_KEY, STORAGE_API_SERVICE_KEY')
  process.exit(1)
}

const BUCKETS_ATIVOS = ['escalas-raw', 'unitrac-raw', 'kpi-outputs', 'kpi-api-dash', 'nutrimax-outputs']

const origem = createClient(ORIGEM_URL, ORIGEM_SERVICE_KEY)

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

/** Lista todo arquivo de um bucket na origem, recursivamente (a listagem do
 *  Supabase Storage é por pasta, não plana). */
async function listarTudo(bucket, prefixo = '') {
  const { data, error } = await origem.storage.from(bucket).list(prefixo, { limit: 1000 })
  if (error) throw new Error(`list ${bucket}/${prefixo}: ${error.message}`)
  let arquivos = []
  for (const item of data) {
    const caminho = prefixo ? `${prefixo}/${item.name}` : item.name
    if (item.id === null) {
      // pasta (sem "id" = não é arquivo) — desce recursivamente
      arquivos = arquivos.concat(await listarTudo(bucket, caminho))
    } else {
      arquivos.push({ path: caminho, mimetype: item.metadata?.mimetype ?? 'application/octet-stream' })
    }
  }
  return arquivos
}

async function migrarArquivo(bucket, arquivo) {
  const { data: blob, error: dlErr } = await origem.storage.from(bucket).download(arquivo.path)
  if (dlErr) throw new Error(`download ${bucket}/${arquivo.path}: ${dlErr.message}`)
  const bytes = Buffer.from(await blob.arrayBuffer())
  const hashOrigem = sha256(bytes)

  const uploadUrl = `${NOVO_BASE_URL}/object/${bucket}/${arquivo.path}`
  const resUpload = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOVO_SERVICE_KEY}`,
      'Content-Type': arquivo.mimetype,
      'x-upsert': 'true',
    },
    body: bytes,
  })
  if (!resUpload.ok) {
    throw new Error(`upload ${bucket}/${arquivo.path}: HTTP ${resUpload.status} ${await resUpload.text()}`)
  }

  const resDownload = await fetch(`${NOVO_BASE_URL}/object/${bucket}/${arquivo.path}`, {
    headers: { Authorization: `Bearer ${NOVO_SERVICE_KEY}` },
  })
  if (!resDownload.ok) {
    throw new Error(`re-download ${bucket}/${arquivo.path}: HTTP ${resDownload.status}`)
  }
  const bytesNovo = Buffer.from(await resDownload.arrayBuffer())
  const hashNovo = sha256(bytesNovo)

  if (hashOrigem !== hashNovo) {
    throw new Error(`HASH MISMATCH ${bucket}/${arquivo.path}: origem=${hashOrigem} novo=${hashNovo}`)
  }
  return hashOrigem
}

async function main() {
  const resumo = []
  for (const bucket of BUCKETS_ATIVOS) {
    const arquivos = await listarTudo(bucket)
    let ok = 0
    let falhas = []
    for (const arquivo of arquivos) {
      try {
        await migrarArquivo(bucket, arquivo)
        ok++
        if (ok % 50 === 0) console.log(`  ${bucket}: ${ok}/${arquivos.length}...`)
      } catch (e) {
        falhas.push({ path: arquivo.path, erro: e.message })
      }
    }
    resumo.push({ bucket, total: arquivos.length, ok, falhas })
    console.log(`${bucket}: ${ok}/${arquivos.length} migrados e verificados por hash. Falhas: ${falhas.length}`)
    if (falhas.length) console.log(JSON.stringify(falhas, null, 2))
  }
  console.log('\n=== RESUMO FINAL ===')
  console.log(JSON.stringify(resumo.map(r => ({ bucket: r.bucket, total: r.total, ok: r.ok, falhas: r.falhas.length })), null, 2))
  const totalFalhas = resumo.reduce((acc, r) => acc + r.falhas.length, 0)
  if (totalFalhas > 0) {
    console.error(`\n${totalFalhas} arquivo(s) com falha — ver detalhes acima.`)
    process.exit(1)
  }
}

main()
```

`@supabase/supabase-js` já é dependência do projeto (usado em todo o resto do app) — não precisa instalar nada novo.

- [ ] **Step 2: Rodar contra a origem e o Storage-API novo**

```bash
cd ~/Projects/Transmonseg/kpi/"KPI TEMP"
ORIGEM_SUPABASE_URL="https://luhwpsckvbctxynifryk.supabase.co" \
ORIGEM_SERVICE_ROLE_KEY="<SUPABASE_SERVICE_ROLE_KEY_DO_VAULT>" \
STORAGE_API_URL="http://<IP_DO_CONTABO>:5000" \
STORAGE_API_SERVICE_KEY="<SERVICE_KEY_DO_TASK2>" \
node scripts/migrar-storage-kpi.mjs
```

O Storage-API só escuta em `127.0.0.1:5000` no Contabo (não exposto), então rodar este script via túnel SSH: `ssh -L 5000:127.0.0.1:5000 transmonseg-vps` numa aba separada, e usar `STORAGE_API_URL=http://127.0.0.1:5000` localmente através do túnel.

Expected: resumo final com `ok` igual a `total` em cada um dos 5 buckets (`escalas-raw` 486, `unitrac-raw` 43, `kpi-outputs` 306, `kpi-api-dash` 58, `nutrimax-outputs` 35 — contagens medidas na investigação, conferir que batem exatamente), zero falhas. Se houver falha, ler o erro exato de cada arquivo listado — não re-rodar cegamente esperando que resolva sozinho.

- [ ] **Step 3: Confirmar contagem final via banco (visão independente do script)**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"select bucket_id, count(*) from storage.objects group by bucket_id order by bucket_id;\""
```

Expected: mesmas contagens do Step 2 (486/43/306/58/35), batendo com o que a origem tinha pros 5 buckets ativos.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrar-storage-kpi.mjs && git commit -m "feat(kpi): script de migração de storage pro Contabo (sub-projeto 3, Task 4)"
```

---

### Task 5: Validação HTTP completa + confirmação de não regressão + vault final

**Files:**
- Nenhum arquivo de repo.
- Atualizar: `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md`.

**Interfaces:**
- Consumes: tudo dos Tasks 1-4.
- Produces: nada consumido por task futura deste sub-projeto — encerra o sub-projeto 3. Sub-projeto 4 consome `ANON_KEY`/`SERVICE_KEY`/porta 5000 pra trocar as env vars do app.

- [ ] **Step 1: Download de arquivo migrado, verificado de forma independente do Task 4**

Escolher 1 arquivo real de cada um dos 5 buckets ativos (por exemplo, o mesmo listado no Step 3 do Task 3 ou qualquer um do log do Task 4). Baixar o mesmo arquivo dos DOIS lados via `curl` puro (não reusar o script do Task 4, que já fez essa mesma checagem durante o upload — este passo é uma segunda verificação, independente):

```bash
# Do lado novo (Storage-API self-hosted)
ssh transmonseg-vps "curl -s http://127.0.0.1:5000/object/escalas-raw/<PATH_REAL> \
  -H 'Authorization: Bearer <SERVICE_KEY>' -o /tmp/novo-escalas.bin && sha256sum /tmp/novo-escalas.bin"

# Do lado da origem (Supabase Storage REST API)
ssh transmonseg-vps "curl -s https://luhwpsckvbctxynifryk.supabase.co/storage/v1/object/escalas-raw/<PATH_REAL> \
  -H 'Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY_DO_VAULT>' \
  -H 'apikey: <SUPABASE_SERVICE_ROLE_KEY_DO_VAULT>' \
  -o /tmp/origem-escalas.bin && sha256sum /tmp/origem-escalas.bin"
```

Expected: os dois `sha256sum` idênticos. Repetir substituindo o bucket/path pros outros 4 (`unitrac-raw`, `kpi-outputs`, `kpi-api-dash`, `nutrimax-outputs`).

- [ ] **Step 2: Upload de teste (arquivo novo, não existente antes)**

```bash
ssh transmonseg-vps "echo 'teste sub-projeto 3' > /tmp/teste-upload.txt && curl -s -X POST http://127.0.0.1:5000/object/kpi-outputs/_teste/upload.txt \
  -H 'Authorization: Bearer <SERVICE_KEY>' -H 'Content-Type: text/plain' --data-binary @/tmp/teste-upload.txt"
```

Expected: resposta JSON com `Key` = `kpi-outputs/_teste/upload.txt`.

- [ ] **Step 3: Signed upload URL de teste**

```bash
ssh transmonseg-vps "curl -s -X POST http://127.0.0.1:5000/object/upload/sign/kpi-outputs/_teste/via-signed.txt \
  -H 'Authorization: Bearer <SERVICE_KEY>'"
```

Expected: JSON com uma `url` contendo `?token=...`. Usar essa URL pra de fato subir um arquivo (simulando o fluxo atual de `createSignedUploadUrl` que o app usa pra `escalas-raw`/`unitrac-raw`):

```bash
ssh transmonseg-vps "curl -s -X PUT 'http://127.0.0.1:5000<URL_RETORNADA_ACIMA>' -H 'Content-Type: text/plain' --data-binary @/tmp/teste-upload.txt"
```

Expected: sucesso (sem precisar de `Authorization` — o token na URL já autentica, mesmo padrão do Supabase Storage original).

- [ ] **Step 4: Remoção de teste**

```bash
ssh transmonseg-vps "curl -s -X DELETE http://127.0.0.1:5000/object/kpi-outputs/_teste/upload.txt -H 'Authorization: Bearer <SERVICE_KEY>'"
ssh transmonseg-vps "curl -s -X DELETE http://127.0.0.1:5000/object/kpi-outputs/_teste/via-signed.txt -H 'Authorization: Bearer <SERVICE_KEY>'"
```

Expected: os dois arquivos de teste removidos. Confirmar: `ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"select count(*) from storage.objects where name like '_teste/%';\""` retorna `0`.

- [ ] **Step 5: Confirmar contagem dos 5 buckets ainda bate (nenhum arquivo real afetado pelos testes)**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"select bucket_id, count(*) from storage.objects group by bucket_id order by bucket_id;\""
```

Expected: mesmas contagens do Task 4 Step 3 (486/43/306/58/35) — os arquivos de teste (criados em `_teste/`, já removidos no Step 4) não alteram esse total.

- [ ] **Step 6: Confirmar Monitoramento e demais serviços do KPI intactos**

```bash
ssh transmonseg-vps "systemctl status gotrue --no-pager | grep -E 'Active|Main PID'"
ssh transmonseg-vps "systemctl status postgrest --no-pager | grep -E 'Active|Main PID'"
ssh transmonseg-vps "pm2 jlist | node -e 'let d=\"\"; process.stdin.on(\"data\",c=>d+=c); process.stdin.on(\"end\",()=>{JSON.parse(d).forEach(p=>console.log(p.name, p.pid, p.pm2_env.restart_time))})'"
```

Expected: PIDs e `restart_time` do PM2 idênticos ao estado anterior a este sub-projeto (sem restart novo); `gotrue`/`postgrest` do Monitoramento `active (running)`.

- [ ] **Step 7: Registrar no vault (fechamento do sub-projeto 3)**

Adicionar em `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md`, na seção do sub-projeto 3:

```markdown
**Migração de dados (Task 4)**: os 5 buckets ativos migrados via
`scripts/migrar-storage-kpi.mjs` (API HTTP real dos dois lados, nunca
INSERT direto), cada arquivo verificado por SHA-256 origem vs. novo no
próprio momento do upload. Contagens finais batendo com a origem:
`escalas-raw` 486, `kpi-outputs` 306, `unitrac-raw` 43, `nutrimax-outputs`
35, `kpi-api-dash` 58 — total 928 arquivos, ~1.63GB. `kpi-manual-raw`
(322 arquivos) e `kpis-gerados` (31 arquivos) não migrados de propósito
— confirmado morto no código dos dois repos, dados continuam na origem
até o projeto Supabase ser desligado.

**Validação final (Task 5)**: download de arquivo real de cada um dos 5
buckets comparado por hash contra a origem (independente do Task 4);
upload direto de teste; signed upload URL de teste (mesmo fluxo que
`escalas-raw`/`unitrac-raw` usam hoje via `createSignedUploadUrl`);
remoção de teste — todos bem-sucedidos. Monitoramento (GoTrue/PostgREST/
PM2) e GoTrue/PostgREST do KPI (sub-projetos 1/2) confirmados intactos.

**Sub-projeto 3 (Storage self-hosted): COMPLETO.**
```

- [ ] **Step 8: Commit**

```bash
cd ~/Projects/chaves-apis-joaquim && git add sistema-kpi/chaves.md && git commit -m "docs(kpi): sub-projeto 3 (storage) completo, validação HTTP e migração de 928 arquivos confirmadas"
```
