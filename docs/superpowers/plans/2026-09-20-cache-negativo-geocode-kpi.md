# Cache negativo do geocode + gravação por lote Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parar de reprocessar a cada geração os ~15 endereços rurais que nenhuma fonte resolve (~5 min/geração) e não perder o que já foi geocodificado quando um lote posterior falha ou a requisição morre.

**Architecture:** (1) Nova tabela `kpi_romaneio_geocode_negativo` guarda endereços que a ponte respondeu, com HTTP 200 e `resultados` válido, como `null` ("não resolvi"), com TTL de 48 h. (2) `geocodificarEnderecos` consulta esse cache negativo depois do positivo e não manda esses endereços à ponte. (3) `geocodificarLote` passa a informar se o `null` é confirmado (resposta OK) ou falha de transporte (nunca vai para o cache negativo). (4) Positivos e negativos são gravados por lote, não só no fim.

**Tech Stack:** TypeScript, Vitest, Supabase self-hosted (PostgREST `postgrest-kpi`, db `kpi_transmonseg`).

**Spec:** memória `project_kpi_confirmacao_e_geracao_2026-09-18.md` (seção "Por que a geração demora horas/falha", item 1) e o código de `src/lib/kpi-romaneio/geocode.ts`.

## Global Constraints

- Trailer de commit EXATO ao final: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` e `Claude-Session: https://claude.ai/code/session_01ATqZgryoxRsTeXXM3HR8M7`
- Espelhar em KPI TEMP (`/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP`) e push nos dois repos juntos.
- Fail-open: erro ao ler/gravar o cache negativo NUNCA bloqueia nem muda o resultado (segue como se não houvesse cache negativo).
- `null` por falha de transporte (rede, HTTP != 200, JSON inválido, `MOTOR_SECRET` ausente, timeout) NUNCA entra no cache negativo. Só `null` dentro de uma resposta 200 válida.
- Cache positivo tem prioridade sobre o negativo (cadastro manual em `scripts/cadastrar-endereco-manual.ts` continua vencendo).
- TTL do cache negativo: 48 h, constante `TTL_NEGATIVO_HORAS = 48`.
- Migration só aplicada em produção com OK do usuário (`sudo -u postgres psql kpi_transmonseg`, como `postgres`, + `NOTIFY pgrst, 'reload schema'`); deploy manual (`git pull`, `npm run build`, `pm2 restart kpi-transmonseg`) só com nenhuma geração em andamento.

---

## File Structure

- Create `supabase/migrations/20260920000000_geocode_cache_negativo.sql`
- Modify `src/lib/kpi-romaneio/geocode.ts` — leitura/gravação do negativo, `geocodificarLote` devolve `{ resultados, confirmado }`, gravação por lote.
- Modify `src/lib/kpi-romaneio/geocode.test.ts`

Interfaces:
- Tabela `kpi_romaneio_geocode_negativo(endereco text primary key, tentado_em timestamptz not null default now())`.
- `buscarNegativosRecentes(enderecos: string[]): Promise<Set<string>>` — endereços com `tentado_em > now() - 48h`; fail-open (erro → conjunto vazio); lê em lotes de `LOTE_CACHE_LEITURA`.
- `salvarNegativos(enderecos: string[]): Promise<void>` — upsert `{ endereco, tentado_em: now }` por `onConflict: 'endereco'`; best-effort.
- `geocodificarLote(...)`: `Promise<{ resultados: ResultadoGeocode[]; confirmado: boolean }>`; `confirmado` é `true` só no caminho de resposta 200 com `resultados` array válido.

---

### Task 1: Migration

**Files:** Create `supabase/migrations/20260920000000_geocode_cache_negativo.sql`

- [ ] **Step 1:** Escrever a migration (com 2–3 linhas de cabeçalho em pt-BR explicando o porquê):

```sql
-- Endereços que a ponte respondeu como "não resolvi" (HTTP 200, resultado null) ficam
-- aqui por 48h para a geração não reprocessá-los toda vez (~5 min/geração, medido 18/09).
create table if not exists kpi_romaneio_geocode_negativo (
  endereco text primary key,
  tentado_em timestamptz not null default now()
);
alter table kpi_romaneio_geocode_negativo enable row level security;
-- Sem policies: só service_role (mesmo padrão de kpi_romaneio_geocode_cache).
```

- [ ] **Step 2:** Commit `feat(kpi): tabela do cache negativo do geocode` (+ trailer).

---

### Task 2: Cache negativo + gravação por lote em `geocode.ts`

**Files:** Modify `src/lib/kpi-romaneio/geocode.ts`, `src/lib/kpi-romaneio/geocode.test.ts`

- [ ] **Step 1: Testes falhando** (seguir o estilo do mock `fromMock` existente, distinguindo por nome da tabela):
  1. endereço que a ponte devolve `null` numa resposta 200 → depois da chamada há upsert em `kpi_romaneio_geocode_negativo` com esse endereço e NÃO há upsert dele em `kpi_romaneio_geocode_cache`;
  2. falha de transporte (fetch rejeita) → nenhum upsert no negativo;
  3. HTTP 500 → nenhum upsert no negativo; JSON inválido → idem; `MOTOR_SECRET` ausente → idem;
  4. endereço presente no negativo recente → a ponte NÃO é chamada para ele e o resultado é `null`; os demais endereços seguem normalmente;
  5. endereço presente no cache POSITIVO e no negativo → devolve a coordenada (positivo vence);
  6. erro ao ler o negativo → segue e chama a ponte para todos (fail-open);
  7. gravação por lote: 30 endereços novos (2 lotes de 15), o 2º lote falha por transporte → o upsert positivo do 1º lote já aconteceu (a chamada de upsert ocorre antes da 2ª chamada de `fetch`).
- [ ] **Step 2:** `npx vitest run src/lib/kpi-romaneio/geocode.test.ts` → FAIL nos novos.
- [ ] **Step 3: Implementar.**
  - `const TTL_NEGATIVO_HORAS = 48`.
  - `buscarNegativosRecentes` (lotes de `LOTE_CACHE_LEITURA`, `.from('kpi_romaneio_geocode_negativo').select('endereco').in('endereco', lote).gt('tentado_em', limiteISO)`, try/catch fail-open com `console.error`).
  - `salvarNegativos` (upsert, best-effort).
  - `geocodificarLote` devolve `{ resultados, confirmado }`: `confirmado = true` apenas no final do caminho feliz; todos os `return resultadosVazios(...)` viram `{ resultados: resultadosVazios(n), confirmado: false }`.
  - `geocodificarPorLotes` passa a receber um callback `aoConcluirLote(lote, resultados, confirmado)` chamado após CADA lote; `geocodificarEnderecos` usa esse callback para `salvarNoCache(lote, resultados)` e, se `confirmado`, `salvarNegativos(lote.filter((_, i) => resultados[i] === null))`. Remover a gravação única no fim.
  - Em `geocodificarEnderecos`: depois de `buscarNoCache`, `const negativos = await buscarNegativosRecentes(enderecos.filter(e => !doCache.has(e)))`; `faltantes = enderecos.filter(e => !doCache.has(e) && !negativos.has(e))`; endereços negativos devolvem `null`. Logar uma linha: `[kpi-romaneio/geocode] N endereços pulados por cache negativo (48h)` quando N > 0.
- [ ] **Step 4:** Rodar `npx vitest run src/lib/kpi-romaneio` → PASS (todos os testes existentes do geocode continuam passando; ajustar somente o que dependia de gravar tudo no fim).
- [ ] **Step 5:** `npx tsc --noEmit` sem erros novos. Commit `feat(kpi): cache negativo do geocode (48h) e gravação por lote` (+ trailer).

---

### Task 3: Rollout (com OK do usuário)

- [ ] **Step 1:** Espelhar em KPI TEMP e push nos dois repos.
- [ ] **Step 2:** Aplicar a migration no Contabo como `postgres`, checar o grant do `service_role` em `information_schema.role_table_grants`, `NOTIFY pgrst, 'reload schema'`.
- [ ] **Step 3:** Sem geração em andamento: `git pull`, `npm run build`, `pm2 restart kpi-transmonseg`.
- [ ] **Step 4: Verificação** na próxima geração real: o log mostra `endereços pulados por cache negativo` na 2ª geração/regeneração do mesmo dia, o tempo cai (~5 min a menos) e a taxa identificada não muda (queda > 1 p.p. = reverter).

## Self-review

- Cobertura: negativo com TTL (T1+T2), distinção confirmado/transporte (T2), gravação por lote (T2), rollout e verificação (T3).
- Risco conhecido: um `null` dentro de resposta 200 causado por throttle do Nominatim congela o endereço por 48 h. Mitigação: TTL curto; o cache positivo e o cadastro manual sempre vencem.
