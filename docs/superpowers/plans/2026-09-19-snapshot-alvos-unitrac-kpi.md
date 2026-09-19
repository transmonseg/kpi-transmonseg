# Snapshot dos alvos Unitrac Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar a "foto" dos alvos da Unitrac de cada dia, para que regenerar um dia passado (e rodar experimentos) mantenha os ~5,6 pontos de confirmação que hoje se perdem.

**Architecture:** `/mapa_servicos/alvos` só devolve o plano do dia corrente. (1) Toda geração real do KPI grava os `alvosDaData` que usou numa tabela `kpi_alvos_snapshot` (upsert por cliente+data, mantendo o snapshot mais completo). (2) Um cron noturno (23:50 BRT) captura o estado final do dia para a frota inteira e faz merge (uma NF "feita" nunca volta a pendente). (3) `regenerarDeId` / o script CLI, ao processar dia < hoje, leem o snapshot em vez da API. O dump de experimento NÃO precisa de storage próprio: os PDFs originais já ficam em `kpi-romaneio-inputs`, então regenerar com o snapshot reproduz o regime de produção.

**Tech Stack:** Next.js route handlers, Supabase self-hosted (PostgREST `postgrest-kpi`, db `kpi_transmonseg`), Vitest, crontab no transmonseg-vps.

**Spec:** conversa de 18–19/09/2026 (memória `project_kpi_confirmacao_e_geracao_2026-09-18.md`, seção "Alvos da Unitrac só existem no próprio dia").

## Global Constraints

- Trailer de commit EXATO ao final: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` e `Claude-Session: https://claude.ai/code/session_01ATqZgryoxRsTeXXM3HR8M7`
- Todo código espelhado em KPI TEMP (`/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP`) e push nos dois repos juntos.
- Falha ao salvar/ler snapshot NUNCA derruba a geração (best-effort, `console.error`), igual ao histórico.
- Escrita só via service role; sem policy de escrita para `authenticated`.
- Sem deploy em produção nem migration no banco de prod sem OK do usuário. Checar geração em andamento antes de `pm2 restart`.
- Retenção: 90 dias (limpeza no próprio cron).

---

## File Structure

- Create `supabase/migrations/20260919000000_kpi_alvos_snapshot.sql` — tabela.
- Create `src/lib/kpi-romaneio/alvos-snapshot.ts` — `mesclarAlvos` (pura), `salvarSnapshotAlvos`, `lerSnapshotAlvos`, `alvosEfetivos`.
- Create `src/lib/kpi-romaneio/alvos-snapshot.test.ts`.
- Modify `src/app/api/kpi/nutrimax/gerar/route.ts` (~l.284–291) — salva ao gerar dia de hoje; lê snapshot quando `data < hojeBR()`.
- Modify `scripts/gerar-nutrimax-real-arquivo.ts` (~l.158–164) — mesmo comportamento.
- Create `scripts/snapshot-alvos-noturno.ts` — cron: frota inteira → merge → limpeza.

Interfaces:
- `mesclarAlvos(antigos: AlvoApi[], novos: AlvoApi[]): AlvoApi[]` — chave `${placaNorm}|${codigoUnitrac}|${documento ?? ''}|${ordem}`; em conflito, o `situacao === 1` vence; empate → `novos`.
- `salvarSnapshotAlvos(cliente: string, data: string, alvos: AlvoApi[]): Promise<void>` — lê o existente, mescla, upsert.
- `lerSnapshotAlvos(cliente: string, data: string): Promise<AlvoApi[] | null>` — `null` se não há linha.
- `alvosEfetivos(cliente: string, data: string, hoje: string, daApi: AlvoApi[]): Promise<AlvoApi[]>` — best-effort, nunca lança.

---

### Task 1: Migration + módulo `alvos-snapshot`

**Files:**
- Create: `supabase/migrations/20260919000000_kpi_alvos_snapshot.sql`
- Create: `src/lib/kpi-romaneio/alvos-snapshot.ts`
- Test: `src/lib/kpi-romaneio/alvos-snapshot.test.ts`

- [ ] **Step 1: Migration**

```sql
create table if not exists kpi_alvos_snapshot (
  cliente text not null,
  data_referencia date not null,
  capturado_em timestamptz not null default now(),
  qtd_alvos int not null,
  alvos jsonb not null,
  primary key (cliente, data_referencia)
);
alter table kpi_alvos_snapshot enable row level security;
-- Sem policies: leitura/escrita só via service_role (mesmo padrão de kpi_nutrimax_geracoes).
```

- [ ] **Step 2: Teste falhando** (`alvos-snapshot.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { mesclarAlvos } from './alvos-snapshot'
import type { AlvoApi } from '@/lib/unitrac-api'

const alvo = (o: Partial<AlvoApi>): AlvoApi => ({
  placaNorm: 'AAA1A11', codigoUnitrac: 'L1', nome: 'Loja', situacao: 0,
  feitoISO: null, documento: '100', inicioISO: '2026-09-17T06:00:00', ordem: 1, rota: 'R1', ...o,
})

describe('mesclarAlvos', () => {
  it('feito nunca volta a pendente', () => {
    const r = mesclarAlvos([alvo({ situacao: 1, feitoISO: '2026-09-17T09:00:00' })], [alvo({ situacao: 0 })])
    expect(r).toHaveLength(1)
    expect(r[0].situacao).toBe(1)
  })
  it('pendente antigo vira feito quando o novo confirma', () => {
    const r = mesclarAlvos([alvo({ situacao: 0 })], [alvo({ situacao: 1, feitoISO: '2026-09-17T10:00:00' })])
    expect(r[0].situacao).toBe(1)
  })
  it('une alvos de chaves diferentes', () => {
    expect(mesclarAlvos([alvo({ documento: '1' })], [alvo({ documento: '2' })])).toHaveLength(2)
  })
})
```

- [ ] **Step 3:** `npx vitest run src/lib/kpi-romaneio/alvos-snapshot.test.ts` → FAIL (módulo não existe).

- [ ] **Step 4: Implementar** `alvos-snapshot.ts`

```ts
import { createServiceClient } from '@/lib/supabase/service'
import type { AlvoApi } from '@/lib/unitrac-api'

const chave = (a: AlvoApi) => `${a.placaNorm}|${a.codigoUnitrac}|${a.documento ?? ''}|${a.ordem}`

export function mesclarAlvos(antigos: AlvoApi[], novos: AlvoApi[]): AlvoApi[] {
  const mapa = new Map<string, AlvoApi>()
  for (const a of antigos) mapa.set(chave(a), a)
  for (const a of novos) {
    const atual = mapa.get(chave(a))
    if (atual && atual.situacao === 1 && a.situacao !== 1) continue
    mapa.set(chave(a), a)
  }
  return [...mapa.values()]
}

export async function lerSnapshotAlvos(cliente: string, data: string): Promise<AlvoApi[] | null> {
  const { data: row, error } = await createServiceClient()
    .from('kpi_alvos_snapshot').select('alvos')
    .eq('cliente', cliente).eq('data_referencia', data).maybeSingle()
  if (error) throw new Error(error.message)
  return row ? (row.alvos as AlvoApi[]) : null
}

export async function salvarSnapshotAlvos(cliente: string, data: string, alvos: AlvoApi[]): Promise<void> {
  const existente = await lerSnapshotAlvos(cliente, data)
  const final = mesclarAlvos(existente ?? [], alvos)
  const { error } = await createServiceClient().from('kpi_alvos_snapshot').upsert({
    cliente, data_referencia: data, capturado_em: new Date().toISOString(),
    qtd_alvos: final.length, alvos: final,
  })
  if (error) throw new Error(error.message)
}

/** Alvos efetivos do dia: hoje → grava a API no snapshot; dia passado → API mesclada com o snapshot. */
export async function alvosEfetivos(cliente: string, data: string, hoje: string, daApi: AlvoApi[]): Promise<AlvoApi[]> {
  try {
    if (data >= hoje) {
      if (daApi.length > 0) await salvarSnapshotAlvos(cliente, data, daApi)
      return daApi
    }
    return mesclarAlvos((await lerSnapshotAlvos(cliente, data)) ?? [], daApi)
  } catch (err) {
    console.error('snapshot de alvos indisponível:', err)
    return daApi
  }
}
```

- [ ] **Step 5:** Teste PASS; `npx tsc --noEmit` sem erros novos.
- [ ] **Step 6: Commit** `feat(kpi): tabela e merge de snapshot dos alvos Unitrac` (+ trailer). Espelhar em TEMP.

---

### Task 2: Gravar e usar o snapshot no gerador

**Files:**
- Modify: `src/app/api/kpi/nutrimax/gerar/route.ts` (~l.291)
- Modify: `scripts/gerar-nutrimax-real-arquivo.ts` (~l.164)
- Test: `src/lib/kpi-romaneio/alvos-snapshot.test.ts` (casos de `alvosEfetivos`)

- [ ] **Step 1: Testes falhando** (mock de `@/lib/supabase/service`): (a) `data >= hoje` com alvos → chama upsert e devolve `daApi`; (b) dia passado, snapshot existente e API vazia → devolve o snapshot; (c) erro do Supabase → devolve `daApi` sem lançar.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Trocar `const alvos = alvosDaData(alvosBrutos, data)` por `const alvos = await alvosEfetivos('nutrimax', data, hojeBR(), alvosDaData(alvosBrutos, data))` na route e no script (importar `alvosEfetivos` e `hojeBR`).
- [ ] **Step 4:** `npx vitest run src/lib/kpi-romaneio src/app/api/kpi/nutrimax/gerar` → PASS.
- [ ] **Step 5: Commit** `feat(kpi): gerador grava e reaproveita snapshot dos alvos` (+ trailer). Espelhar em TEMP; push nos dois.

---

### Task 3: Cron noturno + limpeza

**Files:**
- Create: `scripts/snapshot-alvos-noturno.ts`

- [ ] **Step 1: Script** — `buscarFrota(COD_USER_NUTRIMAX)` → todos os cvs → `buscarAlvos(cvs)`; agrupa por dia via `(feitoISO ?? inicioISO).slice(0,10)`; para cada dia chama `salvarSnapshotAlvos('nutrimax', dia, alvos)`; depois apaga `kpi_alvos_snapshot` com `data_referencia < hoje - 90d`. Flag `--dry` só imprime contagens. Loga contagens; sai com código ≠ 0 se a API falhar.
- [ ] **Step 2:** Rodar com `--dry` e conferir que o dia de hoje aparece com `qtd_alvos` > 0.
- [ ] **Step 3: Commit** `feat(kpi): cron noturno de snapshot dos alvos` (+ trailer). Espelhar em TEMP.

---

### Task 4: Rollout (precisa de OK explícito do usuário)

- [ ] **Step 1:** Aplicar a migration no banco `kpi_transmonseg` do Contabo (`sudo -u postgres psql kpi_transmonseg -f ...`) e `NOTIFY pgrst, 'reload schema'` no `postgrest-kpi` (:3002).
- [ ] **Step 2:** Confirmar que nenhuma geração está em andamento; `cd /srv/kpi-transmonseg && git pull origin main && npm run build && pm2 restart kpi-transmonseg`.
- [ ] **Step 3:** Crontab do transmonseg-vps: `CRON_TZ=America/Sao_Paulo` + `50 23 * * * cd /srv/kpi-transmonseg && nice -n 10 npx tsx --env-file=.env.production scripts/snapshot-alvos-noturno.ts >> /var/log/snapshot-alvos.log 2>&1`.
- [ ] **Step 4: Verificação** no dia seguinte: linha em `kpi_alvos_snapshot` para o dia anterior; regenerar esse dia pelo histórico e comparar a taxa com a original (esperado: diferença ≤ 0,5 p.p., contra os −5,6 p.p. de antes).

## Self-review

- Cobertura: snapshot na geração (T2), noturno (T3), regeneração usa snapshot (T2), retenção (T3), rollout (T4). Dump de experimento coberto por regenerar com snapshot (PDFs já guardados).
- Limite conhecido: confirmações após a meia-noite continuam filtradas por `alvosDaData` na data de `feitoISO` (documentado em `alvos-data.ts`); o snapshot não resolve isso, só evita perder o resto.
- Paradas Unitrac (48 h) NÃO entram: a ponte própria (`posicoes_historico`) é a fonte primária desde 14/09.
