# Migração KPI Transmonseg pro Contabo — Sub-projeto 4 (final): App + deploy + domínio + corte

Data: 2026-08-05
Status: aprovado em conversa

## Contexto

Sub-projetos 1 (banco self-hosted), 2 (auth self-hosted/GoTrue) e 3
(storage self-hosted/Storage-API) estão completos e revisados, todos
rodando em paralelo no Contabo — nada aponta produção pra lá ainda,
Vercel+Supabase continua 100% no ar. Este é o último sub-projeto: trocar
o código do app pros backends novos, subir de verdade no Contabo, expor
num domínio real, e deixar pronto pro corte.

## Descoberta feita durante o brainstorm (não assumida — checada no código e no Contabo)

- **As chaves JWT já existem.** `ANON_KEY`/`SERVICE_KEY` gerados no
  sub-projeto 3 (assinados com o `GOTRUE_JWT_SECRET` do sub-projeto 2)
  validam contra GoTrue e PostgREST do KPI também, não só o Storage-API —
  mesmo secret compartilhado pelos 3 serviços. Zero JWT novo pro app.
- **Produção atual é `kpi-transmonseg.vercel.app`** (subdomínio da
  própria Vercel, não um domínio próprio apontado lá) — confirmado no
  `README.md`. O corte não depende de nenhuma manobra de DNS arriscada:
  a URL nova entra no ar em paralelo, migrar os usuários é só trocar o
  link que eles acessam.
- **Os dois repos do KPI têm código-fonte (`src/`) idêntico hoje**
  (`diff -rq` confirmou — só diferem em `.DS_Store`/`.env.local`/
  `.vercel`). `KPI transmonseg` (`transmonseg/kpi-transmonseg.git`) é o
  repo que o `README.md` aponta como produção — os artefatos desta
  migração (specs/plans/scripts dos sub-projetos 1-3) existem só no
  `KPI TEMP` porque foi onde o trabalho aconteceu, não porque o código
  divergiu.
- **O app usa Realtime de verdade** (WebSocket, `.channel().on('postgres_changes', ...)`),
  não só REST/Auth — achado que não estava em nenhuma investigação
  anterior. Uso confirmado em 3 arquivos: `src/lib/hooks/useRealtimeQueue.ts`
  (a subscrição em si), `src/components/FilaRevisao.tsx` (único
  consumidor, montado só em `src/app/revisao/page.tsx`), e
  `src/components/ApplyToSimilarSheet.tsx` (chama `.rpc('find_similar_pending', ...)`
  via REST browser-side, não usa Realtime mas usa o mesmo client
  browser-side `createClient()` de `src/lib/supabase/client.ts`). Rodar
  o Supabase Realtime self-hosted de verdade exigiria um serviço bem mais
  pesado (Elixir/Phoenix + replicação lógica configurada no Postgres) só
  pra uma tela interna — decisão do usuário: substituir por polling.
- **Chamadas browser-side existem e são reais** (`createClient()` de
  `@/lib/supabase/client`, usa `NEXT_PUBLIC_SUPABASE_URL`/
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`) — confirmado grep: 3 arquivos
  importam esse client. Isso significa que o domínio novo precisa expor
  `/rest/v1`/`/auth/v1`/`/storage/v1` publicamente (não só pro app
  server-side), porque o browser não alcança `127.0.0.1` do Contabo.
- **Servidor e cliente usam a MESMA env var** (`NEXT_PUBLIC_SUPABASE_URL`)
  — `src/lib/supabase/server.ts` e `src/lib/supabase/service.ts` não têm
  URL interna separada. Diferente do Monitoramento (que criou um gateway
  interno em `127.0.0.1:8000` porque não tinha domínio real quando foi
  montado), o KPI já nasce com domínio real — um único bloco Caddy no
  domínio público resolve os dois casos, e uma linha em `/etc/hosts` no
  próprio Contabo (`kpi.transmonseg.com.br` → `127.0.0.1`) faz chamada
  servidor-a-servidor nunca sair pra internet de verdade, sem precisar
  de um segundo gateway interno nem mudar nenhuma env var do app.
- **`service_role` já tem `bypassrls=true`** (corrigido no fix round do
  sub-projeto 3), mas isso não substitui `GRANT` de tabela — `bypassrls`
  só pula policy de RLS, uma role ainda precisa de `GRANT SELECT/INSERT/
  UPDATE/DELETE` explícito pra tocar numa tabela. Sem esse `GRANT`, as
  37/38 rotas de API que usam a service key (achado do sub-projeto 1)
  não funcionariam contra o banco novo.

## Escopo

**Dentro:**
- Sincronizar `KPI TEMP` → `KPI transmonseg`: copiar os artefatos da
  migração (`docs/superpowers/specs/2026-08-0{4,5}-migracao-contabo-*`,
  `docs/superpowers/plans/2026-08-0{4,5}-migracao-contabo-*`,
  `scripts/migrar-usuarios-auth-kpi.mjs`, `scripts/migrar-storage-kpi.mjs`)
  pro repo real da org, commitados lá.
- **Modelo de autorização final no Postgres** (`kpi_transmonseg`):
  - `GRANT ALL` nas tabelas do app pra `service_role` (cobre as 37/38
    rotas que usam a service key hoje).
  - Auditoria completa de TODO uso browser-side (`grep` por
    `lib/supabase/client` em todo `src/`, não só os 3 arquivos já
    encontrados) pra levantar a lista exata de tabelas/RPCs que `anon`/
    `authenticated` precisam tocar, e replicar fielmente os `GRANT`s que
    a ORIGEM já dá a esses dois roles nessas tabelas específicas — nunca
    um `GRANT ALL` genérico pra `anon`/`authenticated`, letra por letra
    igual à origem, apoiado nas 31 RLS policies já restauradas no
    sub-projeto 2 como a defesa real.
- **Trocar Realtime por polling**: `useRealtimeQueue.ts` perde a
  subscrição `.channel()`, ganha um intervalo de refetch (ex: a cada 5s
  enquanto a tela `/revisao` está aberta, `setInterval` + cleanup no
  `useEffect`, mesmo padrão de outros hooks de polling que já existirem
  no projeto se houver — senão, implementação simples e testada).
- **Deploy no Contabo**: PM2, mesmo padrão do Monitoramento — deploy key
  SSH dedicada (read-only, gerada no próprio VPS, escopada só ao repo
  `transmonseg/kpi-transmonseg`), clone em `/srv/kpi-transmonseg`,
  `.env.production` (`chmod 600`) com os valores novos
  (`NEXT_PUBLIC_SUPABASE_URL=https://kpi.transmonseg.com.br`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` = os JWTs
  já existentes do sub-projeto 3), processo PM2 rodando `next start`.
- **Caddy**: um único bloco pra `kpi.transmonseg.com.br` — `handle_path
  /rest/v1/*` → PostgREST KPI (`127.0.0.1:3002`), `handle_path /auth/v1/*`
  → GoTrue KPI (`127.0.0.1:9998`), `handle_path /storage/v1/*` →
  Storage-API KPI (`127.0.0.1:5000`), resto → `reverse_proxy` pro
  processo PM2 do app. TLS automático via Let's Encrypt (mesmo padrão
  já provado no Monitoramento).
- **`/etc/hosts` no Contabo**: `127.0.0.1 kpi.transmonseg.com.br` — só
  no próprio VPS, não afeta resolução pública/DNS real (que aponta pro
  IP público de verdade, como o Monitoramento já tem).
- **DNS**: registro A `kpi` → IP do Contabo, criado manualmente pelo
  usuário no hPanel (mesmo processo já feito pro Monitoramento).
- **Validação completa** rodando de verdade em `kpi.transmonseg.com.br`,
  Vercel continua 100% no ar em paralelo: login real (11 usuários
  migrados no sub-projeto 2), RBAC por rede, geração de KPI/Romaneio,
  upload de escala/Unitrac (fluxo de `createSignedUploadUrl` contra o
  Storage-API novo), fila de revisão com polling, exportação de XLSX.
- Zero mudança no Monitoramento e zero desligamento do Vercel/Supabase
  atual — corte fica pra decisão explícita do usuário, depois de validar.

**Fora:**
- Desligar o projeto Supabase de verdade — só depois do usuário validar
  tudo rodando estável no Contabo por um tempo.
- Migrar os 2 buckets órfãos (`kpi-manual-raw`/`kpis-gerados`) ou
  corrigir os 2 scripts que os referenciam (achado do sub-projeto 3,
  candidatos a `DROP`/deprecação, não bloqueiam este sub-projeto).
- `kpi_manual_links_publicos` sem RLS na origem (achado do sub-projeto 1)
  — mesma classe do achado já corrigido em `perfis`/`convites`, mas essa
  tabela ficou de fora por decisão explícita do usuário; pode ser tratada
  separadamente, não bloqueia o corte.
- Timezone (destino `Europe/Berlin` vs. origem UTC) — divergência
  conhecida, não corrigida ainda; avaliar se afeta algo visível antes do
  corte, mas não é parte do escopo deste sub-projeto por si.
- Re-sync final de dado (banco + storage) logo antes do corte real —
  como o corte em si é decisão do usuário pra depois desta validação,
  o timing exato do re-sync fica fora do escopo deste spec (roda de novo
  os scripts já existentes, idempotentes, quando o usuário decidir a
  data do corte).

## Arquitetura

```
Browser do usuário
  │
  ▼
kpi.transmonseg.com.br (Caddy, TLS automático Let's Encrypt)
  ├─ /rest/v1/*    → 127.0.0.1:3002 (PostgREST KPI, sub-projeto 1)
  ├─ /auth/v1/*    → 127.0.0.1:9998 (GoTrue KPI, sub-projeto 2)
  ├─ /storage/v1/* → 127.0.0.1:5000 (Storage-API KPI, sub-projeto 3)
  └─ /* (resto)    → 127.0.0.1:<porta PM2> (app Next.js)

Servidor (chamadas internas do próprio Next.js, mesma env var
NEXT_PUBLIC_SUPABASE_URL) resolve kpi.transmonseg.com.br → 127.0.0.1
via /etc/hosts do Contabo — nunca sai pra internet de verdade.
```

## Riscos e mitigação

- **Auditoria de GRANT incompleta pra `anon`/`authenticated`** → grep
  sistemático de TODO uso de `lib/supabase/client` (browser-side) em
  `src/`, não confiar só nos 3 arquivos já encontrados neste brainstorm.
- **Polling introduzindo comportamento diferente do Realtime** (ex:
  delay de até o intervalo do poll pra ver mudança de outro usuário) →
  aceito pelo usuário, tela interna de baixo tráfego.
- **Zero risco ao Monitoramento**: porta/processo/banco/domínio
  inteiramente separados, nenhum comando deste sub-projeto toca
  `transmonseg`/GoTrue 9999/PostgREST 3001/PM2 do Monitoramento.
- **Zero risco de "queima de navio"**: produção atual é subdomínio da
  própria Vercel, não domínio próprio — corte é aditivo (nova URL
  entra no ar), não destrutivo.
