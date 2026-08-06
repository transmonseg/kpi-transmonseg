# Migração KPI pro Contabo — App + Deploy + Domínio (Sub-projeto 4, final) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App KPI Transmonseg rodando de verdade em `kpi.transmonseg.com.br` no Contabo (banco/auth/storage já migrados nos sub-projetos 1-3), com modelo de autorização final aplicado, Realtime substituído por polling, e validado ponta a ponta em paralelo com a produção atual (`kpi-transmonseg.vercel.app`, que continua no ar).

**Architecture:** Repo `transmonseg/kpi-transmonseg` (produção real) recebe os artefatos da migração vindos do `KPI TEMP`, é clonado no Contabo via deploy key dedicada, roda via PM2 (porta 3020) com `.env.production` apontando pros backends self-hosted (PostgREST/GoTrue/Storage-API dos sub-projetos 1-3). Caddy expõe tudo num único domínio (`kpi.transmonseg.com.br`): roteamento por path pros 3 backends + fallback pro app, TLS automático via Let's Encrypt. `/etc/hosts` no próprio Contabo faz chamada servidor-a-servidor (que usa a mesma `NEXT_PUBLIC_SUPABASE_URL` do browser) resolver local, sem sair pra internet.

**Tech Stack:** Next.js (já no projeto), PM2, Caddy (já rodando no Contabo), PostgreSQL 17.10 (GRANT), `@supabase/ssr`/`@supabase/supabase-js` (já dependências).

## Global Constraints

- Zero mudança no Monitoramento (banco `transmonseg`, GoTrue/PostgREST portas 9999/3001, PM2 `transmonseg-temp`/`transmonseg-definitivo`, domínio `monitoramento.transmonseg.com.br`).
- Zero desligamento do Vercel/Supabase atual — `kpi-transmonseg.vercel.app` continua 100% no ar durante todo este sub-projeto. Corte é decisão explícita do usuário, fora do escopo de execução automática deste plano.
- Toda credencial nova registrada em `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md` antes de considerar a task concluída — nenhum segredo novo escrito neste plano nem em nenhum arquivo do repo.
- `ANON_KEY`/`SERVICE_KEY` (JWTs) e `GOTRUE_JWT_SECRET` já existem (sub-projetos 2/3) — reaproveitar os valores do vault, não gerar novos.
- Comandos remotos via `ssh transmonseg-vps "..."`.
- GRANT de autorização deve replicar fielmente o modelo real da ORIGEM (Supabase), nunca um `GRANT ALL` genérico pra `anon`/`authenticated` — só `service_role` recebe grant amplo (confirmado que a origem já faz isso: 29/29 tabelas, 43/44 rotinas).

---

### Task 1: Sincronizar `KPI TEMP` → `KPI transmonseg` (repo de produção)

**Files:**
- Copiar pro repo `~/Projects/Transmonseg/kpi/KPI transmonseg`:
  - `docs/superpowers/specs/2026-08-04-migracao-contabo-banco-design.md`
  - `docs/superpowers/specs/2026-08-05-migracao-contabo-auth-design.md`
  - `docs/superpowers/specs/2026-08-05-migracao-contabo-storage-design.md`
  - `docs/superpowers/specs/2026-08-05-migracao-contabo-app-design.md`
  - `docs/superpowers/plans/2026-08-04-migracao-contabo-banco.md`
  - `docs/superpowers/plans/2026-08-05-migracao-contabo-auth.md`
  - `docs/superpowers/plans/2026-08-05-migracao-contabo-storage.md`
  - `docs/superpowers/plans/2026-08-05-migracao-contabo-app.md` (este arquivo)
  - `scripts/migrar-usuarios-auth-kpi.mjs`
  - `scripts/migrar-storage-kpi.mjs`

**Interfaces:**
- Consumes: nada de tasks anteriores (primeira task do sub-projeto).
- Produces: repo `transmonseg/kpi-transmonseg` no GitHub com histórico completo da migração, pronto pra ser clonado no Contabo (Task 4 consome via `git clone`).

- [ ] **Step 1: Confirmar os dois repos têm o mesmo código-fonte antes de copiar**

```bash
diff -rq --exclude=.git --exclude=node_modules --exclude=.next --exclude=.superpowers --exclude=.env.local --exclude=.vercel --exclude=.DS_Store --exclude=tsconfig.tsbuildinfo /Users/joaquimsalles/Projects/Transmonseg/kpi/"KPI TEMP" /Users/joaquimsalles/Projects/Transmonseg/kpi/"KPI transmonseg"
```

Expected: nenhuma saída (ou só diferenças já esperadas/documentadas — se aparecer algo em `src/` não esperado, PARE e reporte antes de continuar, é sinal de que os repos divergiram de verdade e a escolha de qual vira produção precisa ser revista).

- [ ] **Step 2: Copiar os arquivos**

```bash
cd /Users/joaquimsalles/Projects/Transmonseg/kpi
mkdir -p "KPI transmonseg/docs/superpowers/specs" "KPI transmonseg/docs/superpowers/plans"
cp "KPI TEMP/docs/superpowers/specs/2026-08-04-migracao-contabo-banco-design.md" "KPI transmonseg/docs/superpowers/specs/"
cp "KPI TEMP/docs/superpowers/specs/2026-08-05-migracao-contabo-auth-design.md" "KPI transmonseg/docs/superpowers/specs/"
cp "KPI TEMP/docs/superpowers/specs/2026-08-05-migracao-contabo-storage-design.md" "KPI transmonseg/docs/superpowers/specs/"
cp "KPI TEMP/docs/superpowers/specs/2026-08-05-migracao-contabo-app-design.md" "KPI transmonseg/docs/superpowers/specs/"
cp "KPI TEMP/docs/superpowers/plans/2026-08-04-migracao-contabo-banco.md" "KPI transmonseg/docs/superpowers/plans/"
cp "KPI TEMP/docs/superpowers/plans/2026-08-05-migracao-contabo-auth.md" "KPI transmonseg/docs/superpowers/plans/"
cp "KPI TEMP/docs/superpowers/plans/2026-08-05-migracao-contabo-storage.md" "KPI transmonseg/docs/superpowers/plans/"
cp "KPI TEMP/docs/superpowers/plans/2026-08-05-migracao-contabo-app.md" "KPI transmonseg/docs/superpowers/plans/"
cp "KPI TEMP/scripts/migrar-usuarios-auth-kpi.mjs" "KPI transmonseg/scripts/"
cp "KPI TEMP/scripts/migrar-storage-kpi.mjs" "KPI transmonseg/scripts/"
```

- [ ] **Step 3: Commit e push**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg"
git add docs/superpowers/specs/2026-08-0{4,5}-migracao-contabo-*.md docs/superpowers/plans/2026-08-0{4,5}-migracao-contabo-*.md scripts/migrar-usuarios-auth-kpi.mjs scripts/migrar-storage-kpi.mjs
git commit -m "docs: sincroniza artefatos da migração pro Contabo (sub-projetos 1-4, vindos do KPI TEMP)"
git push origin main
```

Expected: push aceito sem conflito (confirme com `git status` antes — se a branch `main` deste repo estiver atrás do remoto, rode `git pull --rebase origin main` primeiro e resolva qualquer conflito antes do push).

- [ ] **Step 4: Confirmar no GitHub**

```bash
gh repo view transmonseg/kpi-transmonseg --json defaultBranchRef,pushedAt
```

Expected: `pushedAt` reflete o commit recém feito.

---

### Task 2: Modelo de autorização final no Postgres (`kpi_transmonseg`)

**Files:**
- Nenhum arquivo de repo — mudança só no banco remoto via SSH/SQL.
- Atualizar: `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md`.

**Interfaces:**
- Consumes: banco `kpi_transmonseg` (sub-projeto 1), roles `anon`/`authenticated`/`service_role` (sub-projeto 2), `bypassrls=true` em `service_role` (fix do sub-projeto 3).
- Produces: `service_role` com GRANT completo (schema `public`); `anon`/`authenticated` com GRANT específico em `review_queue` — consumido pelo app (Task 4/5) e pela validação final (Task 6).

- [ ] **Step 1: `GRANT` amplo pra `service_role`, replicando a origem (confirmado: 29/29 tabelas, 43/44 rotinas)**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on functions to service_role;
\""
```

Expected: `GRANT`/`ALTER DEFAULT PRIVILEGES` sem erro.

- [ ] **Step 2: Confirmar que bate exatamente com a origem (29 tabelas, e a RPC destrutiva `replace_kpi_manual_mes` incluída — origem grant isso pra `service_role` também, confirmado)**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"
select count(distinct table_name) from information_schema.role_table_grants where table_schema='public' and grantee='service_role';
\" -c \"
select grantee from information_schema.role_routine_grants where routine_schema='public' and routine_name='replace_kpi_manual_mes' and grantee='service_role';
\""
```

Expected: `29`, e uma linha com `service_role` na segunda query.

- [ ] **Step 2b: Confirmar que `anon`/`authenticated` NÃO ganharam nada nesta migração (só `service_role` foi tocado)**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"
select grantee, count(*) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') group by grantee;
\""
```

Expected: `0 rows` (nenhum grant ainda pros dois — o Step 3 abaixo que adiciona só o de `review_queue`).

- [ ] **Step 3: `GRANT` específico pra `review_queue` em `anon`/`authenticated`, replicando a origem exatamente (14 grants confirmados na origem: DELETE/INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE × 2 roles — RLS já restaurada no sub-projeto 2 é o gate real, a policy "authenticated read" já existe em `kpi_transmonseg`)**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"
grant delete, insert, references, select, trigger, truncate, update on review_queue to anon, authenticated;
\""
```

Expected: `GRANT`.

- [ ] **Step 4: Confirmar `find_similar_pending`/`bulk_approve_rows` já funcionam pra `anon`/`authenticated` via `PUBLIC` (achado: já grantado, `PUBLIC` cobre todo mundo — não precisa de `GRANT` novo, só confirmar)**

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"
select routine_name, grantee from information_schema.role_routine_grants where routine_schema='public' and routine_name in ('find_similar_pending','bulk_approve_rows') and grantee='PUBLIC';
\""
```

Expected: 2 linhas (`find_similar_pending`/`PUBLIC`, `bulk_approve_rows`/`PUBLIC`).

- [ ] **Step 5: Teste real via PostgREST — JWT de cada role, contra `review_queue` e as 2 RPCs**

Gerar 3 JWTs de teste (localmente, usando o `GOTRUE_JWT_SECRET` do vault — mesmo script de assinatura já usado nos sub-projetos 2/3):

```bash
node -e '
const crypto = require("crypto");
function b64url(buf) { return buf.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function signJWT(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const data = b64url(Buffer.from(JSON.stringify(header))) + "." + b64url(Buffer.from(JSON.stringify(payload)));
  return data + "." + b64url(crypto.createHmac("sha256", secret).update(data).digest());
}
const secret = "<GOTRUE_JWT_SECRET_DO_VAULT>";
const now = Math.floor(Date.now()/1000);
for (const role of ["anon","authenticated","service_role"]) {
  console.log(role + "=" + signJWT({ role, iss: "supabase", iat: now, exp: now + 3600 }, secret));
}
'
```

Testar cada um contra PostgREST KPI (porta 3002):

```bash
ssh transmonseg-vps "curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3002/review_queue?status=eq.pending -H 'Authorization: Bearer <JWT_ANON>'"
ssh transmonseg-vps "curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3002/review_queue?status=eq.pending -H 'Authorization: Bearer <JWT_AUTHENTICATED>'"
ssh transmonseg-vps "curl -s http://127.0.0.1:3002/lojas -H 'Authorization: Bearer <JWT_SERVICE_ROLE>' | head -c 200"
```

Expected: `anon` → `200` com `[]` (RLS bloqueia SELECT pra anon, sem policy — resposta vazia, não erro); `authenticated` → `200` com dado real (policy "authenticated read" permite); `service_role` → `200` com dado real de `lojas` (bypassrls + grant amplo).

- [ ] **Step 6: Registrar no vault**

Adicionar em `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md`:

```markdown
## Contabo — modelo de autorização final (2026-08-05, sub-projeto 4)

`service_role` recebeu GRANT completo em `kpi_transmonseg` (schema
`public`, todas as tabelas/funções + default privileges pra objetos
futuros), replicando exatamente o que a origem já fazia (confirmado:
29/29 tabelas, incluindo a RPC destrutiva `replace_kpi_manual_mes` que
tem ACL restrita desde o achado de segurança do sub-projeto 1 — a
origem já grantava isso pra `service_role`, então bate).

`anon`/`authenticated` receberam GRANT só em `review_queue` (DELETE/
INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE, réplica exata da
origem) — a única tabela que o app toca via browser (`useRealtimeQueue`/
`FilaRevisao`). RLS (já restaurada no sub-projeto 2, policy
"authenticated read") é o gate real: testado com JWT de cada role
contra PostgREST — `anon` recebe `[]`, `authenticated` recebe dado real.
Nenhum outro `GRANT` novo pra `anon`/`authenticated` — as 2 RPCs que o
browser chama (`find_similar_pending`/`bulk_approve_rows`) já tinham
`EXECUTE` via `PUBLIC` desde a migração do schema (sub-projeto 1).
```

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/chaves-apis-joaquim && git add sistema-kpi/chaves.md && git commit -m "docs(kpi): modelo de autorização final aplicado no Contabo (sub-projeto 4, Task 2)"
```

---

### Task 3: Trocar Supabase Realtime por polling em `useRealtimeQueue`

**Files:**
- Modify: `src/lib/hooks/useRealtimeQueue.ts` (repo `KPI transmonseg` — trabalhar já no repo de produção, não no TEMP, já que é ele que vai pro Contabo).
- Test: nenhum teste automatizado novo (o hook não tem suite hoje) — validação é manual, feita na Task 6.

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `useRealtimeQueue()` continua retornando `{ rows: ReviewQueueRow[], setRows, loading: boolean }` — mesma assinatura exata, `FilaRevisao.tsx` (`src/components/FilaRevisao.tsx:17`) não muda nada.

- [ ] **Step 1: Substituir o conteúdo do arquivo**

```typescript
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ReviewQueueRow {
  id: string
  raw_name: string
  matched_name: string | null
  match_score: number | null
  algorithm: string | null
  rede_id: string
  data: string
  status: string
  version: number
}

const POLL_INTERVAL_MS = 5000

export function useRealtimeQueue() {
  const [rows, setRows] = useState<ReviewQueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false

    async function fetchRows() {
      const { data } = await supabase
        .from('review_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      if (!cancelled) {
        setRows(data ?? [])
        setLoading(false)
      }
    }

    fetchRows()
    const interval = setInterval(fetchRows, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { rows, setRows, loading }
}
```

`cancelled` evita `setState` depois do unmount (a versão antiga não tinha esse problema porque a subscrição do Realtime cuidava do cleanup via `removeChannel`; o polling com `setInterval` precisa do guard manual). `POLL_INTERVAL_MS = 5000` — refetch a cada 5s enquanto a tela `/revisao` está aberta, mesmo espírito de atualização "quase em tempo real" sem WebSocket.

- [ ] **Step 2: Rodar o typecheck do projeto**

Run: `cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg" && npx tsc --noEmit`

Expected: sem erro novo relacionado a `useRealtimeQueue.ts` ou `FilaRevisao.tsx` (erros pré-existentes em outros arquivos, se houver, não são desta task).

- [ ] **Step 3: Confirmar visualmente com o dev server local**

Run: `cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg" && npm run dev` (porta 3000 local)

Abrir `/revisao` no browser (precisa de login — usar um usuário migrado real ou o ambiente local, dependendo de qual banco o `.env.local` deste repo aponta hoje). Confirmar que a lista carrega e que não há erro no console do browser relacionado a `channel`/`removeChannel`/Realtime. Parar o dev server depois.

- [ ] **Step 4: Commit**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg"
git add src/lib/hooks/useRealtimeQueue.ts
git commit -m "refactor(revisao): troca Supabase Realtime por polling (5s) — self-hosted não roda o serviço Realtime"
git push origin main
```

---

### Task 4: Deploy key + clone + `.env.production` + systemd/PM2 no Contabo

**Files:**
- Nenhum arquivo de repo — infra no Contabo via SSH.
- Atualizar: `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md`.

**Interfaces:**
- Consumes: repo `transmonseg/kpi-transmonseg` (Task 1, já com o fix da Task 3 commitado); `ANON_KEY`/`SERVICE_KEY` (vault, sub-projeto 3); `GOTRUE_JWT_SECRET` (vault, sub-projeto 2).
- Produces: processo PM2 `kpi-transmonseg` rodando em `127.0.0.1:3020` — consumido pela Task 5 (Caddy) e Task 6 (validação).

- [ ] **Step 1: Gerar deploy key dedicada no próprio Contabo**

```bash
ssh transmonseg-vps "ssh-keygen -t ed25519 -f /root/.ssh/deploy_kpi_transmonseg -N '' -C 'contabo-vps-deploy-kpi-transmonseg-readonly'"
ssh transmonseg-vps "cat /root/.ssh/deploy_kpi_transmonseg.pub" > /tmp/deploy_kpi_transmonseg.pub
```

- [ ] **Step 2: Registrar a chave pública no GitHub (read-only)**

```bash
gh repo deploy-key add /tmp/deploy_kpi_transmonseg.pub --repo transmonseg/kpi-transmonseg --title "contabo-vps-kpi-transmonseg-readonly"
rm /tmp/deploy_kpi_transmonseg.pub
```

Expected: chave listada em `gh repo deploy-key list --repo transmonseg/kpi-transmonseg`.

- [ ] **Step 3: Configurar SSH alias no Contabo e clonar**

```bash
ssh transmonseg-vps "cat >> /root/.ssh/config << 'EOF'

Host github-kpi-transmonseg
  HostName github.com
  IdentityFile /root/.ssh/deploy_kpi_transmonseg
  IdentitiesOnly yes
EOF"
ssh transmonseg-vps "chmod 600 /root/.ssh/config"
ssh transmonseg-vps "git clone git@github-kpi-transmonseg:transmonseg/kpi-transmonseg.git /srv/kpi-transmonseg"
```

Expected: clone completo, `/srv/kpi-transmonseg` com o código (incluindo o fix da Task 3).

- [ ] **Step 4: Escrever `.env.production`**

```bash
ssh transmonseg-vps "cat > /srv/kpi-transmonseg/.env.production << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://kpi.transmonseg.com.br
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY_DO_VAULT_SUBPROJETO_3>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_KEY_DO_VAULT_SUBPROJETO_3>
EOF"
ssh transmonseg-vps "chmod 600 /srv/kpi-transmonseg/.env.production && chown root:root /srv/kpi-transmonseg/.env.production"
```

Ler `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md` (seção "Obrigatórias" tem a lista completa de env vars que o app usa — conferir se alguma outra variável opcional, ex. `ORS_API_KEY`, precisa ser copiada também pra não perder a feature de KM real do Nutry Max; se sim, adicionar ao arquivo acima com o valor real do vault).

- [ ] **Step 5: Build e subir via PM2**

```bash
ssh transmonseg-vps "cd /srv/kpi-transmonseg && npm ci && npm run build"
ssh transmonseg-vps "cd /srv/kpi-transmonseg && pm2 start node_modules/.bin/next --name kpi-transmonseg --interpreter node -- start -H 127.0.0.1 -p 3020"
ssh transmonseg-vps "pm2 save"
```

Mesmo padrão exato já comprovado pro Monitoramento (`pm2 describe transmonseg-temp` confirma: `script path node_modules/.bin/next`, `script args start -H 127.0.0.1 -p 3000`, `interpreter /usr/bin/node`) — invoca o binário do Next diretamente, não `npm start`, e já bind só em `127.0.0.1` (nada público exceto via Caddy).

Expected: `pm2 list` mostra `kpi-transmonseg` `online`. Se o `npm run build` falhar, ler o erro exato (pode faltar alguma env var obrigatória em tempo de build) antes de qualquer ajuste.

- [ ] **Step 6: Verificar localmente no Contabo (antes do Caddy)**

```bash
ssh transmonseg-vps "curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3020/login"
```

Expected: `200`.

- [ ] **Step 7: Registrar no vault**

```markdown
## Contabo — app KPI (2026-08-05, sub-projeto 4)

Deploy key dedicada (`/root/.ssh/deploy_kpi_transmonseg`, read-only,
título `contabo-vps-kpi-transmonseg-readonly`), repo clonado em
`/srv/kpi-transmonseg`, processo PM2 `kpi-transmonseg` porta `3020`.
`.env.production` (`chmod 600`) com `NEXT_PUBLIC_SUPABASE_URL=https://
kpi.transmonseg.com.br` e as chaves já existentes do sub-projeto 3
(`ANON_KEY`/`SERVICE_KEY`) — nenhum JWT novo.
```

- [ ] **Step 8: Commit**

```bash
cd ~/Projects/chaves-apis-joaquim && git add sistema-kpi/chaves.md && git commit -m "docs(kpi): app deployado no Contabo via PM2, porta 3020 (sub-projeto 4, Task 4)"
```

---

### Task 5: Caddy + `/etc/hosts` + DNS

**Files:**
- Nenhum arquivo de repo — config no Contabo via SSH.
- Atualizar: `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md`.

**Interfaces:**
- Consumes: PM2 `kpi-transmonseg` (Task 4, porta 3020); PostgREST KPI (`127.0.0.1:3002`, sub-projeto 1); GoTrue KPI (`127.0.0.1:9998`, sub-projeto 2); Storage-API KPI (`127.0.0.1:5000`, sub-projeto 3).
- Produces: `https://kpi.transmonseg.com.br` respondendo publicamente — consumido pela Task 6 (validação).

- [ ] **Step 1: Adicionar o bloco no Caddyfile**

```bash
ssh transmonseg-vps "cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-app-kpi-\$(date +%Y%m%d%H%M%S)"
ssh transmonseg-vps "cat >> /etc/caddy/Caddyfile << 'EOF'

kpi.transmonseg.com.br {
  handle_path /rest/v1/* {
    reverse_proxy 127.0.0.1:3002
  }
  handle_path /auth/v1/* {
    reverse_proxy 127.0.0.1:9998
  }
  handle_path /storage/v1/* {
    reverse_proxy 127.0.0.1:5000
  }
  reverse_proxy 127.0.0.1:3020
}
EOF"
ssh transmonseg-vps "caddy validate --config /etc/caddy/Caddyfile"
```

Expected: `Valid configuration`. Se inválido, ler o erro exato antes de recarregar.

- [ ] **Step 2: Pedir o registro DNS ao usuário (ação manual, fora do Contabo)**

Confirmar com o usuário: registro `A`, nome `kpi`, valor `169.58.73.94` (IP público do Contabo, já usado por `monitoramento.transmonseg.com.br`), criado no hPanel da Hostinger — mesmo processo já feito pro Monitoramento. Não prosseguir pro Step 3 sem confirmação de que o registro foi criado (propagação de DNS pode levar minutos).

- [ ] **Step 3: Recarregar o Caddy e confirmar TLS**

```bash
ssh transmonseg-vps "systemctl reload caddy"
ssh transmonseg-vps "sleep 5 && journalctl -u caddy -n 30 --no-pager | grep -i 'certificate obtained\|kpi.transmonseg'"
```

Expected: log mostrando certificado obtido pra `kpi.transmonseg.com.br` (pode levar até alguns minutos se o DNS acabou de propagar — se não aparecer, aguardar e checar de novo antes de assumir falha).

- [ ] **Step 4: Adicionar `/etc/hosts` no Contabo**

```bash
ssh transmonseg-vps "grep -q 'kpi.transmonseg.com.br' /etc/hosts || echo '127.0.0.1 kpi.transmonseg.com.br' >> /etc/hosts"
```

- [ ] **Step 5: Confirmar de fora e de dentro**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://kpi.transmonseg.com.br/login
ssh transmonseg-vps "curl -s -o /dev/null -w '%{http_code}\n' https://kpi.transmonseg.com.br/login"
ssh transmonseg-vps "curl -s -o /dev/null -w '%{http_code}\n' https://kpi.transmonseg.com.br/rest/v1/lojas -H 'Authorization: Bearer <JWT_SERVICE_ROLE_DO_TASK2>'"
```

Expected: `200` nos 3 (o terceiro confirma que o roteamento `/rest/v1` chega no PostgREST através do domínio público, não só via porta direta).

- [ ] **Step 6: Confirmar Monitoramento intocado**

```bash
ssh transmonseg-vps "curl -s -o /dev/null -w '%{http_code}\n' https://monitoramento.transmonseg.com.br"
ssh transmonseg-vps "pm2 jlist | node -e 'let d=\"\"; process.stdin.on(\"data\",c=>d+=c); process.stdin.on(\"end\",()=>{JSON.parse(d).forEach(p=>console.log(p.name, p.pid, p.pm2_env.restart_time))})'"
```

Expected: `200`, PIDs/`restart_time` de `transmonseg-temp`/`transmonseg-definitivo` inalterados.

- [ ] **Step 7: Registrar no vault**

```markdown
Caddy: bloco `kpi.transmonseg.com.br` (roteia `/rest/v1`→3002,
`/auth/v1`→9998, `/storage/v1`→5000, resto→3020), TLS automático via
Let's Encrypt. DNS: registro A `kpi`→`169.58.73.94` (Hostinger hPanel,
manual). `/etc/hosts` do Contabo resolve o próprio domínio pra
`127.0.0.1` — chamada servidor-a-servidor do app (mesma
`NEXT_PUBLIC_SUPABASE_URL` usada pelo browser) fica local.
```

- [ ] **Step 8: Commit**

```bash
cd ~/Projects/chaves-apis-joaquim && git add sistema-kpi/chaves.md && git commit -m "docs(kpi): kpi.transmonseg.com.br no ar via Caddy/Let's Encrypt (sub-projeto 4, Task 5)"
```

---

### Task 6: Validação completa ponta a ponta

**Files:**
- Nenhum arquivo de repo — validação manual + registrada no vault.

**Interfaces:**
- Consumes: tudo das Tasks 1-5.
- Produces: nada consumido por task futura — encerra o sub-projeto 4 e a migração inteira. Fica pro usuário decidir o corte.

- [ ] **Step 1: Login real com um dos 11 usuários migrados**

Acessar `https://kpi.transmonseg.com.br/login` num browser real, logar com um usuário real (senha real — os hashes bcrypt são idênticos à origem, sub-projeto 2). Confirmar sessão ativa (não cair de volta pro login).

- [ ] **Step 2: RBAC por rede**

Confirmar que o usuário logado só vê as redes que o perfil permite (mesma lógica de `redesEfetivas`/`getPerfil` já testada nos sub-projetos anteriores, agora rodando contra o banco/auth novos).

- [ ] **Step 3: Geração de KPI/Romaneio**

Rodar uma geração real (`/painel/kpi/simples`) com dado de uma rede/data que já tenha escala e Unitrac migrados (sub-projeto 3 tem os arquivos reais). Confirmar que baixa/processa sem erro 500 e sem erro de storage.

- [ ] **Step 4: Upload de escala/Unitrac via signed URL**

Fazer upload de um arquivo de teste (xlsx pequeno) pela tela real, confirmando que o fluxo `createSignedUploadUrl` → PUT direto no Storage-API novo funciona pelo domínio público (não só via porta direta, já confirmado na Task 5 Step 5). Apagar o arquivo de teste depois via SQL direto se necessário (`delete from storage.objects where name like '%teste%'`).

- [ ] **Step 5: Fila de revisão com polling**

Abrir `/revisao`, confirmar que a lista carrega (mesmo sem WebSocket) e que aprovar uma linha (`bulk_approve_rows`) reflete na tela dentro do intervalo de polling (5s).

- [ ] **Step 6: Export XLSX**

Confirmar que a geração de romaneio/KPI consegue exportar XLSX sem erro (exercita o `gerar-xlsx-manual.ts`/pipeline de geração contra o banco novo).

- [ ] **Step 7: Confirmar Vercel continua no ar, intocado**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://kpi-transmonseg.vercel.app
```

Expected: `200` — produção atual segue funcionando normalmente, nada foi desligado.

- [ ] **Step 8: Registrar no vault o fechamento do sub-projeto 4 e da migração inteira**

```markdown
## Contabo — validação final do app (2026-08-05, sub-projeto 4) — MIGRAÇÃO COMPLETA

Login real, RBAC, geração de KPI, upload via signed URL, fila de revisão
(polling), export XLSX — todos testados manualmente em
`https://kpi.transmonseg.com.br`, rodando contra banco/auth/storage
self-hosted no Contabo (sub-projetos 1-3). `kpi-transmonseg.vercel.app`
continua no ar, intocado — corte é decisão explícita do usuário, pra
quando ele decidir.

**Sub-projeto 4 (App + deploy + domínio): COMPLETO.** Migração do KPI
Transmonseg pro Contabo (4 sub-projetos: banco, auth, storage, app) está
com todas as peças rodando e validadas. Pendências que sobrevivem ao
corte (não bloqueiam, ficam pra depois): `kpi_manual_links_publicos` sem
RLS na origem, timezone `Europe/Berlin` vs. UTC, 2 buckets órfãos não
migrados, `DB_INSTALL_ROLES=false` recomendado antes de qualquer
re-migração futura do Storage-API, re-sync final de dado (banco+storage)
antes do corte real (scripts já existentes, idempotentes).
```

- [ ] **Step 9: Commit**

```bash
cd ~/Projects/chaves-apis-joaquim && git add sistema-kpi/chaves.md && git commit -m "docs(kpi): sub-projeto 4 completo, migração inteira validada ponta a ponta no Contabo"
```
