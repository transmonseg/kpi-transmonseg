# Plan: KPI Cards — UI estilo Cozinha + bugfix anomalias_codigos

**Goal:** Reescrever o painel expandido dos cards de KPI em `/painel/kpi/dia` para ficar igual à Cozinha (stats bar, filter chips, tabela simplificada, XLSX/PDF, Salvar e Re-gerar). Corrigir os dois bugs que fazem `anomalias_codigos` ficar sempre vazio e a severidade nunca ser detectada.

**Architecture:**
- `anomalias_codigos` flui de `kpi_rotas` (preenchido pelo `processar`) para `KpiLinha` (via `[id]/route.ts`) para a UI (`KpisGerados.tsx`)
- O matcher (`cruzaEscalaUnitrac`) sempre retorna `anomalias_codigos: []` — os códigos reais ficam na tabela `anomalias` depois do insert. O fix é escrever de volta em `kpi_rotas` após inserir anomalias
- `kpi_linhas` não tem coluna `anomalias_codigos` — quando essa tabela já existe (pós-`gerar`), buscar os códigos via join de `kpi_rotas`

**Tech Stack:** Next.js App Router, TypeScript strict, Tailwind CSS, Supabase (service client), `npx tsc --noEmit` como verificador

**Ordem de dependência:**
1. Tipo `KpiLinha` (base para todos os outros)
2. `processar/route.ts` (popula o dado na DB)
3. `[id]/route.ts` (expõe o dado na API)
4. `KpisGerados.tsx` (consome e renderiza)

---

## Tarefa 1 — Adicionar `anomalias_codigos` ao tipo `KpiLinha`

**Arquivo:** `src/lib/types/kpi.ts`

O tipo `KpiLinha` não tem o campo `anomalias_codigos`. Todos os lugares que retornam `KpiLinha` satisfies precisarão do campo; o TypeScript alertará se algum ficar faltando.

**Diff exato:**

```typescript
// src/lib/types/kpi.ts — linha 38, após observacao
  observacao: string | null
  anomalias_codigos: string[]   // ← adicionar esta linha
}
```

**Tipo completo resultante** (para conferência):

```typescript
export type KpiLinha = {
  kpi_id: string
  escala_linha_id: string | null
  ordem: number
  loja_nome: string
  motorista: string | null
  placa: string | null
  carro_ordem: 1 | 2
  saida_cd: Date | null
  chd_loja_1: Date | null; saida_loja_1: Date | null; tempo_loja_1_min: number | null
  chd_loja_2: Date | null; saida_loja_2: Date | null; tempo_loja_2_min: number | null
  chd_loja_3: Date | null; saida_loja_3: Date | null; tempo_loja_3_min: number | null
  observacao: string | null
  anomalias_codigos: string[]
}
```

**Verificação:** `npx tsc --noEmit` vai quebrar em `consolidador.ts` (usa `satisfies KpiLinha`) e em `[id]/route.ts` — isso é esperado e será corrigido nas tarefas 3 e no consolidador (ver abaixo).

**Fix cascata em `consolidador.ts`:** O `return { ... } satisfies KpiLinha` no final do `.map()` precisará do campo. Adicionar `anomalias_codigos: codigos` (já temos `const codigos = rota.anomalias_codigos ?? []` na linha 78):

```typescript
// src/lib/kpi/consolidador.ts — no objeto retornado pelo .map(), após observacao:
        observacao,
        anomalias_codigos: codigos,
      } satisfies KpiLinha
```

**Fix cascata em `gerar/route.ts`:** O `consolidaKpi` já retorna `KpiLinha[]`, e o campo `anomalias_codigos` já é buscado separadamente via `anomMap` para passar ao gerador de XLSX/PDF. Nenhuma mudança necessária no `gerar/route.ts` — o `linhasBase` recebe `KpiLinha[]` correto, e o merge `{ ...l, anomalias_codigos: anomMap.get(...) }` sobrescreve com o valor do `anomMap` de qualquer forma.

**Commit após esta tarefa:**
```
git add src/lib/types/kpi.ts src/lib/kpi/consolidador.ts
git commit -m "feat(kpi): add anomalias_codigos to KpiLinha type and consolidador"
```

---

## Tarefa 2 — Popular `anomalias_codigos` em `kpi_rotas` após inserir anomalias

**Arquivo:** `src/app/api/kpi/processar/route.ts`

**Problema:** O matcher sempre retorna `anomalias_codigos: []`. Os códigos reais estão no array `anomalias` (cada item tem `.kpi_rota_id = escala_linha_id` e `.codigo`), mas nunca são escritos de volta em `kpi_rotas`.

**Localização:** Inserir o bloco logo após a linha `if (anomErr)` (após o insert de anomalias, linha ~247), antes de `totalAnomalias.HIGH +=`.

**Bloco a inserir:**

```typescript
    // Atualiza anomalias_codigos em kpi_rotas agrupando por escala_linha_id
    const codigosPorEscalaLinha = new Map<string, string[]>()
    for (const a of anomalias) {
      if (!a.kpi_rota_id) continue
      const list = codigosPorEscalaLinha.get(a.kpi_rota_id) ?? []
      list.push(a.codigo)
      codigosPorEscalaLinha.set(a.kpi_rota_id, list)
    }
    for (const [escalaLinhaId, codigos] of codigosPorEscalaLinha) {
      await svc
        .from('kpi_rotas')
        .update({ anomalias_codigos: [...new Set(codigos)] })
        .eq('escala_linha_id', escalaLinhaId)
    }
```

**Contexto para localização precisa** — o trecho completo da área modificada ficará assim:

```typescript
      const { error: anomErr } = await svc.from('anomalias').insert(anomaliaRows)
      if (anomErr)
        return new NextResponse(`Erro ao inserir anomalias: ${anomErr.message}`, { status: 500 })
    }

    // Atualiza anomalias_codigos em kpi_rotas agrupando por escala_linha_id
    const codigosPorEscalaLinha = new Map<string, string[]>()
    for (const a of anomalias) {
      if (!a.kpi_rota_id) continue
      const list = codigosPorEscalaLinha.get(a.kpi_rota_id) ?? []
      list.push(a.codigo)
      codigosPorEscalaLinha.set(a.kpi_rota_id, list)
    }
    for (const [escalaLinhaId, codigos] of codigosPorEscalaLinha) {
      await svc
        .from('kpi_rotas')
        .update({ anomalias_codigos: [...new Set(codigos)] })
        .eq('escala_linha_id', escalaLinhaId)
    }

    totalAnomalias.HIGH += anomalias.filter((a) => a.severidade === 'HIGH').length
```

**Nota:** O loop usa `a.kpi_rota_id` que neste ponto ainda contém o `escala_linha_id` (antes do resolve para o DB id), o que é correto: queremos fazer `.eq('escala_linha_id', ...)` na tabela `kpi_rotas`.

**Verificação:** `npx tsc --noEmit` (sem erros de tipo aqui — apenas lógica).

**Commit após esta tarefa:**
```
git add src/app/api/kpi/processar/route.ts
git commit -m "fix(kpi): populate anomalias_codigos in kpi_rotas after anomalia insert"
```

---

## Tarefa 3 — Incluir `anomalias_codigos` em cada `KpiLinha` no endpoint `GET /api/kpi/[id]`

**Arquivo:** `src/app/api/kpi/[id]/route.ts`

Há dois caminhos de construção de `linhas`:

**Caminho A (kpi_linhas já populado — pós-gerar):** O `kpi_linhas` não tem coluna `anomalias_codigos`. Precisamos buscá-la de `kpi_rotas` via mapa. Inserir após a query de `linhasRaw`, antes do `if ((linhasRaw ?? []).length > 0)`:

```typescript
  // Mapa escala_linha_id → anomalias_codigos para enriquecer kpi_linhas
  const escalaLinhaIdsForCodigos = (linhasRaw ?? [])
    .map((l) => l.escala_linha_id as string | null)
    .filter(Boolean) as string[]
  const { data: rotasParaCodigos } = await svc
    .from('kpi_rotas')
    .select('escala_linha_id, anomalias_codigos')
    .in(
      'escala_linha_id',
      escalaLinhaIdsForCodigos.length > 0 ? escalaLinhaIdsForCodigos : ['__none__'],
    )
  const codigosMap = new Map<string, string[]>(
    (rotasParaCodigos ?? []).map((r) => [
      r.escala_linha_id as string,
      (r.anomalias_codigos as string[]) ?? [],
    ]),
  )
```

No map do Caminho A, adicionar `anomalias_codigos`:

```typescript
      observacao: r.observacao,
      anomalias_codigos: codigosMap.get(r.escala_linha_id as string) ?? [],
    }))
```

**Caminho B (fallback kpi_rotas — antes do gerar):** O `codigos` já existe na linha 96 do código atual. Adicionar ao objeto retornado:

```typescript
          observacao: joinObsTexts(codigos) || null,
          anomalias_codigos: codigos,
        } satisfies KpiLinha
```

**Arquivo completo da função GET resultante** (trecho central após as mudanças):

```typescript
  // Mapa escala_linha_id → anomalias_codigos para enriquecer kpi_linhas
  const escalaLinhaIdsForCodigos = (linhasRaw ?? [])
    .map((l) => l.escala_linha_id as string | null)
    .filter(Boolean) as string[]
  const { data: rotasParaCodigos } = await svc
    .from('kpi_rotas')
    .select('escala_linha_id, anomalias_codigos')
    .in(
      'escala_linha_id',
      escalaLinhaIdsForCodigos.length > 0 ? escalaLinhaIdsForCodigos : ['__none__'],
    )
  const codigosMap = new Map<string, string[]>(
    (rotasParaCodigos ?? []).map((r) => [
      r.escala_linha_id as string,
      (r.anomalias_codigos as string[]) ?? [],
    ]),
  )

  let linhas: KpiLinha[]

  if ((linhasRaw ?? []).length > 0) {
    // kpi_linhas já populado (após gerar)
    linhas = (linhasRaw ?? []).map(r => ({
      kpi_id: r.kpi_id,
      escala_linha_id: r.escala_linha_id,
      ordem: r.ordem,
      loja_nome: r.loja_nome,
      motorista: r.motorista,
      placa: r.placa,
      carro_ordem: r.carro_ordem as 1 | 2,
      saida_cd: r.saida_cd ? new Date(r.saida_cd) : null,
      chd_loja_1: r.chd_loja_1 ? new Date(r.chd_loja_1) : null,
      saida_loja_1: r.saida_loja_1 ? new Date(r.saida_loja_1) : null,
      tempo_loja_1_min: r.tempo_loja_1_min,
      chd_loja_2: r.chd_loja_2 ? new Date(r.chd_loja_2) : null,
      saida_loja_2: r.saida_loja_2 ? new Date(r.saida_loja_2) : null,
      tempo_loja_2_min: r.tempo_loja_2_min,
      chd_loja_3: r.chd_loja_3 ? new Date(r.chd_loja_3) : null,
      saida_loja_3: r.saida_loja_3 ? new Date(r.saida_loja_3) : null,
      tempo_loja_3_min: r.tempo_loja_3_min,
      observacao: r.observacao,
      anomalias_codigos: codigosMap.get(r.escala_linha_id as string) ?? [],
    }))
  } else {
    // Fallback: monta linhas direto de kpi_rotas (antes do gerar)
    linhas = (rotasDoKpi ?? [])
      .sort((a, b) => {
        const nomeA = (a.escala_linhas as { loja_nome_raw?: string } | null)?.loja_nome_raw ?? ''
        const nomeB = (b.escala_linhas as { loja_nome_raw?: string } | null)?.loja_nome_raw ?? ''
        const cmp = nomeA.localeCompare(nomeB)
        if (cmp !== 0) return cmp
        const caA = (a.escala_linhas as { carro_ordem?: number } | null)?.carro_ordem ?? 1
        const caB = (b.escala_linhas as { carro_ordem?: number } | null)?.carro_ordem ?? 1
        return caA - caB
      })
      .map((rota, idx) => {
        const escala = rota.escala_linhas as { motorista_nome?: string | null; loja_nome_raw?: string; carro_ordem?: number } | null
        const paradas = (rota.paradas_json ?? []) as ParadaJson[]
        const carroOrdem = (escala?.carro_ordem ?? 1) as 1 | 2
        let motorista = escala?.motorista_nome ?? null
        if (carroOrdem === 2 && motorista) motorista = `(2º CARRO) ${motorista}`
        const p1 = paradas[0] ?? null
        const p2 = paradas[1] ?? null
        const p3 = paradas[2] ?? null
        const codigos = (rota.anomalias_codigos as string[] | null) ?? []
        return {
          kpi_id: id,
          escala_linha_id: rota.escala_linha_id as string,
          ordem: idx + 1,
          loja_nome: escala?.loja_nome_raw ?? '',
          motorista,
          placa: rota.placa_norm as string | null,
          carro_ordem: carroOrdem,
          saida_cd: rota.saida_cd ? new Date(rota.saida_cd as string) : null,
          chd_loja_1: p1 ? new Date(p1.chegada) : null,
          saida_loja_1: p1 ? new Date(p1.saida) : null,
          tempo_loja_1_min: p1?.duracao_min ?? null,
          chd_loja_2: p2 ? new Date(p2.chegada) : null,
          saida_loja_2: p2 ? new Date(p2.saida) : null,
          tempo_loja_2_min: p2?.duracao_min ?? null,
          chd_loja_3: p3 ? new Date(p3.chegada) : null,
          saida_loja_3: p3 ? new Date(p3.saida) : null,
          tempo_loja_3_min: p3?.duracao_min ?? null,
          observacao: joinObsTexts(codigos) || null,
          anomalias_codigos: codigos,
        } satisfies KpiLinha
      })
  }
```

**Verificação:** `npx tsc --noEmit` deve passar sem erros nos arquivos tocados até aqui.

**Commit após esta tarefa:**
```
git add src/app/api/kpi/[id]/route.ts
git commit -m "feat(kpi): expose anomalias_codigos per line in GET /api/kpi/[id]"
```

---

## Tarefa 4 — Reescrever `TabelaRevisao` no `KpisGerados.tsx` com UI estilo Cozinha

**Arquivo:** `src/app/painel/kpi/dia/KpisGerados.tsx`

Esta é a maior tarefa. Envolve:
1. Adicionar `anomalias_codigos: string[]` ao tipo local `KpiLinha`
2. Adicionar a função `severidadeLinha` (substitui `severidadeFromObs`)
3. Adicionar `StatsBar` (barra colorida de totais)
4. Manter `FiltroChips` (renomear `chips` locais) com contagens baseadas em `anomalias_codigos`
5. Simplificar a tabela: remover colunas Par. 1/2/3 e Saida CD, manter #, Loja, Motorista, Placa, Status
6. `StatusBadge` baseado em `anomalias_codigos` (não em `observacao`)

### 4.1 — Tipo local `KpiLinha`

Adicionar `anomalias_codigos: string[]` ao type local (linhas 26-45 do arquivo atual):

```typescript
type KpiLinha = {
  kpi_id: string
  escala_linha_id: string | null
  ordem: number
  loja_nome: string
  motorista: string | null
  placa: string | null
  carro_ordem: 1 | 2
  saida_cd: string | null
  chd_loja_1: string | null
  saida_loja_1: string | null
  tempo_loja_1_min: number | null
  chd_loja_2: string | null
  saida_loja_2: string | null
  tempo_loja_2_min: number | null
  chd_loja_3: string | null
  saida_loja_3: string | null
  tempo_loja_3_min: number | null
  observacao: string | null
  anomalias_codigos: string[]
}
```

### 4.2 — Substituir `severidadeFromObs` por `severidadeLinha`

Remover completamente a função `severidadeFromObs` (linhas 72-78). Adicionar no lugar:

```typescript
const ANOMALIAS_HIGH_SET = new Set(['ANOM-01', 'ANOM-04', 'ANOM-06', 'ANOM-07'])

function severidadeLinha(codigos: string[]): 'HIGH' | 'MEDIUM' | null {
  if (!codigos.length) return null
  if (codigos.some((c) => ANOMALIAS_HIGH_SET.has(c))) return 'HIGH'
  return 'MEDIUM'
}
```

Ajustar a função `linhaTemAnomalia` para usar `anomalias_codigos`:

```typescript
function linhaTemAnomalia(l: KpiLinha): boolean {
  return l.anomalias_codigos.length > 0
}
```

### 4.3 — Reescrever `TabelaRevisao` completo

Substituir a função `TabelaRevisao` inteira (linhas 391-612) pelo código abaixo:

```typescript
function TabelaRevisao({
  kpi,
  det,
  filtro,
  setFiltro,
  editMap,
  onEditarCelula,
  temEdits,
  salvando,
  onSalvar,
  onBaixar,
}: {
  kpi: KpiDoDia
  det: KpiDetalhe
  filtro: FiltroLinhas
  setFiltro: (f: FiltroLinhas) => void
  editMap: Record<string, { motorista?: string; placa?: string }>
  onEditarCelula: (linhaId: string, campo: 'motorista' | 'placa', valor: string) => void
  temEdits: boolean
  salvando: boolean
  onSalvar: () => void
  onBaixar: (tipo: 'xlsx' | 'pdf') => void
}) {
  const stats = useMemo(() => {
    const total = det.linhas.length
    const comAnom = det.linhas.filter(linhaTemAnomalia).length
    const alta = det.linhas.filter(
      (l) => severidadeLinha(l.anomalias_codigos) === 'HIGH',
    ).length
    const media = det.linhas.filter(
      (l) => severidadeLinha(l.anomalias_codigos) === 'MEDIUM',
    ).length
    return { total, comAnom, sem: total - comAnom, alta, media }
  }, [det.linhas])

  const linhasFiltradas = useMemo(() => {
    if (filtro === 'com_anomalia') return det.linhas.filter(linhaTemAnomalia)
    if (filtro === 'sem_anomalia') return det.linhas.filter((l) => !linhaTemAnomalia(l))
    return det.linhas
  }, [det.linhas, filtro])

  const chips: Array<{ id: FiltroLinhas; label: string; count: number }> = [
    { id: 'todas', label: 'Todas', count: stats.total },
    { id: 'com_anomalia', label: 'Com anomalia', count: stats.comAnom },
    { id: 'sem_anomalia', label: 'OK', count: stats.sem },
  ]

  return (
    <div>
      {/* Stats bar */}
      <div className="grid grid-cols-4 divide-x divide-[var(--color-border)] border-b border-[var(--color-border)]">
        <StatCell label="Total" value={stats.total} tone="default" />
        <StatCell label="OK" value={stats.sem} tone="success" />
        <StatCell label="Alta" value={stats.alta} tone="danger" />
        <StatCell label="Media" value={stats.media} tone="warning" />
      </div>

      {/* Barra de controles */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)]">
        {/* Filter chips */}
        <div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5">
          {chips.map((c) => (
            <button
              key={c.id}
              onClick={() => setFiltro(c.id)}
              className={cn(
                'rounded-[5px] px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer',
                filtro === c.id
                  ? 'bg-[var(--color-bg-elevated)] text-[var(--color-fg)] shadow-sm'
                  : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
              )}
            >
              {c.label} <span className="opacity-60">({c.count})</span>
            </button>
          ))}
        </div>

        {/* Acoes */}
        <div className="flex items-center gap-1.5">
          {temEdits && (
            <Button
              size="sm"
              onClick={onSalvar}
              disabled={salvando}
              className="bg-[var(--color-warning)] text-white hover:opacity-90"
            >
              {salvando ? (
                <>
                  <Spinner />
                  Salvando...
                </>
              ) : (
                <>
                  <IconSave />
                  Salvar e Re-gerar
                </>
              )}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => onBaixar('xlsx')}>
            <IconDownload />
            XLSX
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onBaixar('pdf')}>
            <IconDownload />
            PDF
          </Button>
        </div>
      </div>

      {temEdits && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-warning-soft)]/40 px-4 py-1.5 text-[11px] text-[var(--color-warning-soft-fg)] font-medium">
          Voce tem alteracoes nao salvas. Clique em "Salvar e Re-gerar" para aplicar.
        </div>
      )}

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="w-10 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-center">
                #
              </th>
              <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-left">
                Loja
              </th>
              <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-left">
                Motorista
              </th>
              <th className="w-28 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-center">
                Placa
              </th>
              <th className="w-28 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-center">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {linhasFiltradas.map((l) => {
              const sev = severidadeLinha(l.anomalias_codigos)
              const rowBg =
                sev === 'HIGH'
                  ? 'bg-[var(--color-danger-soft)]'
                  : sev === 'MEDIUM'
                    ? 'bg-[var(--color-warning-soft)]/60'
                    : ''
              const edits = l.escala_linha_id
                ? (editMap[l.escala_linha_id] ?? {})
                : {}
              const motoristaVal =
                edits.motorista !== undefined
                  ? edits.motorista
                  : (l.motorista ?? '')
              const placaVal =
                edits.placa !== undefined ? edits.placa : (l.placa ?? '')

              return (
                <tr
                  key={`${l.kpi_id}-${l.ordem}-${l.carro_ordem}`}
                  className={cn(
                    'border-b border-[var(--color-border)] last:border-0',
                    rowBg,
                    !rowBg && 'hover:bg-[var(--color-bg-hover)]',
                  )}
                >
                  <td className="px-3 py-1.5 text-center text-[var(--color-fg-muted)]">
                    {l.ordem}
                  </td>
                  <td className="px-3 py-1.5 font-medium text-[var(--color-fg)] max-w-[200px] truncate">
                    {l.loja_nome}
                  </td>
                  <td className="px-1 py-1 max-w-[180px]">
                    {l.escala_linha_id ? (
                      <CelulaEditavel
                        valor={motoristaVal}
                        onChange={(v) =>
                          onEditarCelula(l.escala_linha_id!, 'motorista', v)
                        }
                      />
                    ) : (
                      <span className="px-2 text-[var(--color-fg)]">
                        {l.motorista ?? SEM_VALOR}
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-1 w-28">
                    {l.escala_linha_id ? (
                      <CelulaEditavel
                        valor={placaVal}
                        onChange={(v) =>
                          onEditarCelula(l.escala_linha_id!, 'placa', v)
                        }
                        monospace
                      />
                    ) : (
                      <span className="font-mono text-[12px] px-2 text-[var(--color-fg)]">
                        {l.placa ?? SEM_VALOR}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <StatusBadgeKpi codigos={l.anomalias_codigos} />
                  </td>
                </tr>
              )
            })}
            {linhasFiltradas.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-[12px] text-[var(--color-fg-subtle)]"
                >
                  Nenhuma linha nesse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-1.5 text-[10px] text-[var(--color-fg-subtle)] border-t border-[var(--color-border)]">
        {linhasFiltradas.length} de {stats.total} linha
        {stats.total === 1 ? '' : 's'} · KPI {kpi.kpi_id.slice(0, 8)}
      </div>
    </div>
  )
}
```

### 4.4 — Novos componentes auxiliares

Adicionar após a funcao `TabelaRevisao` (e antes de `CelulaEditavel`):

```typescript
function StatCell({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'default' | 'success' | 'danger' | 'warning'
}) {
  const toneClass: Record<typeof tone, string> = {
    default:
      'bg-[var(--color-bg-subtle)] text-[var(--color-fg)]',
    success:
      'bg-[var(--color-success-soft)] text-[var(--color-success-soft-fg)]',
    danger:
      'bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)]',
    warning:
      'bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-fg)]',
  }
  return (
    <div className={cn('px-4 py-2.5 text-center', toneClass[tone])}>
      <div className="text-[20px] font-semibold leading-tight tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider opacity-75">
        {label}
      </div>
    </div>
  )
}

function StatusBadgeKpi({ codigos }: { codigos: string[] }) {
  if (!codigos.length)
    return <Badge variant="success">OK</Badge>
  if (codigos.some((c) => ANOMALIAS_HIGH_SET.has(c)))
    return <Badge variant="danger">ALTA</Badge>
  return <Badge variant="warning">ATENCAO</Badge>
}
```

### 4.5 — Remover funções obsoletas

Remover do arquivo:
- `function Th(...)` — não mais usada na nova tabela
- `function Td(...)` — não mais usada
- `function ParadaCell(...)` — não mais usada
- `fmtHora(...)` — não mais usada (remover somente se não for referenciada em nenhum outro lugar no arquivo; verificar com busca antes de remover)

Verificar antes de remover `fmtHora`:
```
grep -n "fmtHora" src/app/painel/kpi/dia/KpisGerados.tsx
```
Se aparecer apenas na declaração e nos `ParadaCell` calls (que serão removidos), pode remover com segurança.

**Verificação final:** `npx tsc --noEmit` deve passar limpo. Se houver erro de `ANOMALIAS_HIGH_SET` não definida, mover a constante para o topo do módulo (antes de qualquer function, após os imports).

**Commit após esta tarefa:**
```
git add src/app/painel/kpi/dia/KpisGerados.tsx
git commit -m "feat(kpi): rewrite TabelaRevisao with Cozinha-style UI and fix severity detection"
```

---

## Checklist de verificacao manual pos-implementacao

1. Processar KPI para uma data com dados — verificar no Supabase que `kpi_rotas.anomalias_codigos` esta populado (nao `[]`)
2. Abrir `/painel/kpi/dia`, expandir um card — ver stats bar colorida com os 4 counters
3. Filter chip "Com anomalia" filtra corretamente as linhas
4. Linhas HIGH aparecem com fundo vermelho e badge "ALTA"
5. Linhas MEDIUM aparecem com fundo amarelo e badge "ATENCAO"
6. Linhas sem anomalia aparecem com badge verde "OK"
7. Campos Motorista e Placa sao editaveis
8. Botao "Salvar e Re-gerar" aparece apos editar um campo
9. XLSX e PDF disparam download (via signed URLs existentes)
10. `npx tsc --noEmit` — zero erros
