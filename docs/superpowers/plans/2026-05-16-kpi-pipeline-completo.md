# KPI Pipeline Completo — Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o bug de anomalias_codigos, redesenhar o gerador XLSX para o formato de 15 colunas do KPI PRINCESA, reescrever o painel de revisão no estilo Cozinha, e adicionar suporte a alterações via upload de arquivo.

**Architecture:** O pipeline flui de `processar` (preenche kpi_rotas com anomalias_codigos) → `[id]/route.ts` (expõe KpiLinhas com codigos) → `KpisGerados.tsx` (exibe stats). O gerador XLSX é reescrito para agrupar por loja e colocar 1º/2º CARRO lado a lado em 15 colunas fixas com fórmulas MOD para TEMPO.

**Tech Stack:** Next.js App Router, TypeScript strict, ExcelJS, Supabase service client, Tailwind CSS, `npx tsc --noEmit` para verificação

**Spec:** `docs/superpowers/specs/2026-05-16-kpi-pipeline-completo.md`

---

## Tarefa 1 — Adicionar `anomalias_codigos` ao tipo `KpiLinha`

**Files:**
- Modify: `src/lib/types/kpi.ts`
- Modify: `src/lib/kpi/consolidador.ts`

- [ ] **Passo 1: Adicionar campo ao tipo**

Arquivo: `src/lib/types/kpi.ts`

Encontrar o tipo `KpiLinha`. Após `observacao: string | null`, adicionar:

```typescript
  observacao: string | null
  anomalias_codigos: string[]
}
```

- [ ] **Passo 2: Corrigir cascade em `consolidador.ts`**

Arquivo: `src/lib/kpi/consolidador.ts`

Ler o arquivo e encontrar o `return { ... } satisfies KpiLinha` no `.map()`. Adicionar `anomalias_codigos: codigos` antes do `satisfies`. Se `codigos` não existir como variável local, adicionar `const codigos = (rota.anomalias_codigos as string[] | null) ?? []` antes do return.

O resultado deve ser:
```typescript
const codigos = (rota.anomalias_codigos as string[] | null) ?? []
return {
  // ... campos existentes ...
  observacao,
  anomalias_codigos: codigos,
} satisfies KpiLinha
```

- [ ] **Passo 3: Verificar TypeScript**

```bash
cd C:\Users\media\dev\kpi-transmonseg && npx tsc --noEmit 2>&1 | head -30
```

Esperado: erros SOMENTE em `KpisGerados.tsx` (falta `anomalias_codigos` no tipo local) e em `[id]/route.ts` (falta o campo na linha retornada). Todos os outros arquivos que usam `satisfies KpiLinha` devem compilar.

- [ ] **Passo 4: Commit**

```bash
git add src/lib/types/kpi.ts src/lib/kpi/consolidador.ts
git commit -m "feat(kpi): add anomalias_codigos to KpiLinha type and consolidador"
```

---

## Tarefa 2 — Escrever anomalias_codigos de volta em kpi_rotas após processar

**Files:**
- Modify: `src/app/api/kpi/processar/route.ts`

O bug: `processar/route.ts` insere anomalias na tabela `anomalias` mas NUNCA atualiza `kpi_rotas.anomalias_codigos`. O campo fica sempre `[]`.

- [ ] **Passo 1: Localizar o trecho de insert de anomalias**

O trecho está após a linha `const { error: anomErr } = await svc.from('anomalias').insert(anomaliaRows)`. Logo depois do `if (anomErr)`, adicionar o código de writeback.

- [ ] **Passo 2: Adicionar writeback após insert de anomalias**

Após o bloco `if (anomErr)` que verifica o erro do insert, adicionar:

```typescript
    // Escrever anomalias_codigos de volta em kpi_rotas (para exibição no front-end)
    if (anomalias.length > 0) {
      const codigosByRotaId = new Map<string, string[]>()
      for (const a of anomalias) {
        const rotaId = a.kpi_rota_id
          ? rotaIdByEscalaLinhaId.get(a.kpi_rota_id) ?? null
          : null
        if (!rotaId) continue
        const list = codigosByRotaId.get(rotaId) ?? []
        list.push(a.codigo)
        codigosByRotaId.set(rotaId, list)
      }
      for (const [rotaId, codigos] of codigosByRotaId) {
        await svc
          .from('kpi_rotas')
          .update({ anomalias_codigos: codigos })
          .eq('id', rotaId)
      }
    }
```

- [ ] **Passo 3: Verificar TypeScript**

```bash
cd C:\Users\media\dev\kpi-transmonseg && npx tsc --noEmit 2>&1 | grep processar
```

Esperado: nenhum erro em `processar/route.ts`.

- [ ] **Passo 4: Commit**

```bash
git add src/app/api/kpi/processar/route.ts
git commit -m "fix(processar): write anomalias_codigos back to kpi_rotas after insert"
```

---

## Tarefa 3 — Incluir anomalias_codigos em GET /api/kpi/[id]

**Files:**
- Modify: `src/app/api/kpi/[id]/route.ts`

O endpoint busca `kpi_linhas` e monta `KpiLinha[]`, mas o campo `anomalias_codigos` falta em ambos os caminhos (linhasRaw e fallback rotasDoKpi).

- [ ] **Passo 1: Adicionar anomalias_codigos no caminho linhasRaw**

No trecho onde `linhas` é construído a partir de `linhasRaw` (bloco `if ((linhasRaw ?? []).length > 0)`), buscar os códigos via kpi_rotas:

Logo após `const svc = createServiceClient()` e antes do fetch de `rotasDoKpi`, adicionar nada. Em vez disso, dentro do bloco de processamento de linhasRaw, precisamos de um Map<escala_linha_id → codigos[]> vindo de kpi_rotas.

Adicionar após o select de `rotasDoKpi` (que já existe):

```typescript
  // Map de escala_linha_id → anomalias_codigos vindos de kpi_rotas
  const codigosMap = new Map<string, string[]>(
    (rotasDoKpi ?? []).map((r) => [
      r.escala_linha_id as string,
      (r.anomalias_codigos as string[] | null) ?? [],
    ])
  )
```

Depois, no `.map(r => ({...}))` do caminho linhasRaw, adicionar ao objeto retornado:
```typescript
      anomalias_codigos: codigosMap.get(r.escala_linha_id as string) ?? [],
```

E no caminho fallback (rotasDoKpi), o objeto `satisfies KpiLinha` já tem acesso a `rota.anomalias_codigos`:
```typescript
      anomalias_codigos: (rota.anomalias_codigos as string[] | null) ?? [],
```

- [ ] **Passo 2: Atualizar o select de rotasDoKpi para incluir anomalias_codigos**

O `.select()` atual de `kpi_rotas` deve já incluir `anomalias_codigos`. Verificar se está na lista de campos — se não estiver, adicionar:

```typescript
  const { data: rotasDoKpi } = await svc
    .from('kpi_rotas')
    .select('id, escala_linha_id, placa_norm, saida_cd, paradas_json, anomalias_codigos, escala_linhas(motorista_nome, loja_nome_raw, carro_ordem)')
    .eq('data', kpi.data)
    .eq('rede_id', kpi.rede_id)
```

(já estava assim — apenas confirmar)

- [ ] **Passo 3: Verificar TypeScript**

```bash
cd C:\Users\media\dev\kpi-transmonseg && npx tsc --noEmit 2>&1 | grep "\[id\]"
```

Esperado: nenhum erro no arquivo `[id]/route.ts`.

- [ ] **Passo 4: Commit**

```bash
git add "src/app/api/kpi/[id]/route.ts"
git commit -m "fix(kpi-api): include anomalias_codigos in KpiLinha from GET /kpi/[id]"
```

---

## Tarefa 4 — Reescrever KpisGerados.tsx estilo Cozinha

**Files:**
- Modify: `src/app/painel/kpi/dia/KpisGerados.tsx`

Reescrever o painel de revisão. Padrão: stats bar no topo, filter chips, tabela simplificada com StatusBadge real baseado em `anomalias_codigos`, botões XLSX/PDF, "Salvar edições" só quando há edições.

- [ ] **Passo 1: Atualizar tipos locais**

No topo do arquivo, atualizar o tipo local `KpiLinha` adicionando `anomalias_codigos: string[]`. Remover a função `severidadeFromObs` (não é mais necessária).

- [ ] **Passo 2: Adicionar função severidade baseada em codigos**

Substituir `severidadeFromObs` por:

```typescript
const HIGH_CODES = new Set(['ANOM-01', 'ANOM-04', 'ANOM-06', 'ANOM-07'])
const MEDIUM_CODES = new Set(['ANOM-03', 'ANOM-05', 'ANOM-08', 'ANOM-10', 'ANOM-11'])

function severidadeDaCodigos(codigos: string[]): 'HIGH' | 'MEDIUM' | 'LOW' | null {
  if (codigos.length === 0) return null
  if (codigos.some((c) => HIGH_CODES.has(c))) return 'HIGH'
  if (codigos.some((c) => MEDIUM_CODES.has(c))) return 'MEDIUM'
  return 'LOW'
}
```

- [ ] **Passo 3: Atualizar `linhaTemAnomalia`**

```typescript
function linhaTemAnomalia(l: KpiLinha): boolean {
  return l.anomalias_codigos.length > 0
}
```

- [ ] **Passo 4: Adicionar stats bar ao componente de detalhe**

Dentro do componente `TabelaRevisao` (ou onde as linhas são renderizadas após abrir o card), adicionar antes da tabela:

```typescript
// Calcular stats
const statsAltas = linhas.filter((l) => severidadeDaCodigos(l.anomalias_codigos) === 'HIGH').length
const statsMedias = linhas.filter((l) => severidadeDaCodigos(l.anomalias_codigos) === 'MEDIUM').length
const statsBaixas = linhas.filter((l) => severidadeDaCodigos(l.anomalias_codigos) === 'LOW').length
const statsSemAnomalia = linhas.filter((l) => l.anomalias_codigos.length === 0).length
```

Renderizar stats bar (modelo igual à Cozinha):

```tsx
<div className="flex gap-3 mb-4 flex-wrap">
  {[
    { label: 'Total', value: linhas.length, color: 'default' },
    { label: 'Alta', value: statsAltas, color: statsAltas > 0 ? 'danger' : 'default' },
    { label: 'Média', value: statsMedias, color: statsMedias > 0 ? 'warning' : 'default' },
    { label: 'Baixa', value: statsBaixas, color: 'default' },
    { label: 'OK', value: statsSemAnomalia, color: 'success' },
  ].map(({ label, value, color }) => (
    <Card key={label} className="px-3 py-1.5 min-w-[70px]">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('text-lg font-bold', color === 'danger' && value > 0 ? 'text-red-500' : color === 'warning' && value > 0 ? 'text-yellow-600' : color === 'success' ? 'text-green-600' : '')}>{value}</div>
    </Card>
  ))}
</div>
```

- [ ] **Passo 5: Adicionar filter chips**

```tsx
type FiltroLinhas = 'todas' | 'anomalia' | 'ok'
const [filtro, setFiltro] = useState<FiltroLinhas>('todas')

const linhasFiltradas = useMemo(() => {
  if (filtro === 'anomalia') return linhas.filter((l) => l.anomalias_codigos.length > 0)
  if (filtro === 'ok') return linhas.filter((l) => l.anomalias_codigos.length === 0)
  return linhas
}, [linhas, filtro])
```

Renderizar chips antes da tabela:

```tsx
<div className="flex gap-2 mb-3">
  {(['todas', 'anomalia', 'ok'] as const).map((f) => (
    <button
      key={f}
      onClick={() => setFiltro(f)}
      className={cn(
        'px-3 py-1 rounded-full text-xs border transition-colors',
        filtro === f ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:border-foreground/50'
      )}
    >
      {f === 'todas' ? 'Todas' : f === 'anomalia' ? 'Com anomalia' : 'Sem anomalia'}
    </button>
  ))}
</div>
```

- [ ] **Passo 6: Atualizar StatusBadge na tabela**

Na coluna de status da tabela, substituir o uso de `severidadeFromObs(l.observacao)` por `severidadeDaCodigos(l.anomalias_codigos)`:

```tsx
// Onde antes tinha severidadeFromObs(l.observacao), usar:
const sev = severidadeDaCodigos(l.anomalias_codigos)
// e renderizar badge baseado em sev
```

- [ ] **Passo 7: Verificar TypeScript**

```bash
cd C:\Users\media\dev\kpi-transmonseg && npx tsc --noEmit 2>&1 | grep -i kpisgerados
```

Esperado: nenhum erro.

- [ ] **Passo 8: Commit**

```bash
git add src/app/painel/kpi/dia/KpisGerados.tsx
git commit -m "feat(kpi-ui): rewrite KpisGerados with stats bar, filter chips, real anomaly codes"
```

---

## Tarefa 5 — Utilitário: agrupar KpiLinhas por loja (1º + 2º CARRO)

**Files:**
- Create: `src/lib/kpi/agrupar-por-loja.ts`

Esta função é o núcleo da mudança de formato: de "uma linha por carro" para "uma linha por loja com ambos os carros".

- [ ] **Passo 1: Criar o arquivo**

```typescript
// src/lib/kpi/agrupar-por-loja.ts
import type { LinhaParaKpi } from './gerador-kpi'

export type LinhaAgrupada = {
  loja_nome: string
  carro1: LinhaParaKpi | null
  carro2: LinhaParaKpi | null
}

/**
 * Agrupa LinhaParaKpi por loja_nome, separando carro_ordem=1 e carro_ordem=2.
 * Retorna uma entrada por loja na ordem da matriz.
 */
export function agruparPorLoja(linhas: LinhaParaKpi[]): LinhaAgrupada[] {
  const map = new Map<string, LinhaAgrupada>()
  for (const l of linhas) {
    const entry = map.get(l.loja_nome) ?? { loja_nome: l.loja_nome, carro1: null, carro2: null }
    if (l.carro_ordem === 1) entry.carro1 = l
    else entry.carro2 = l
    map.set(l.loja_nome, entry)
  }
  return [...map.values()]
}
```

- [ ] **Passo 2: Verificar TypeScript**

```bash
cd C:\Users\media\dev\kpi-transmonseg && npx tsc --noEmit 2>&1 | grep agrupar
```

Esperado: nenhum erro.

- [ ] **Passo 3: Commit**

```bash
git add src/lib/kpi/agrupar-por-loja.ts
git commit -m "feat(kpi): add agruparPorLoja utility for 15-col XLSX format"
```

---

## Tarefa 6 — Redesenhar gerador XLSX para 15 colunas (formato KPI PRINCESA)

**Files:**
- Modify: `src/lib/kpi/gerador-kpi.ts`

Reescrever `preencherAba` para o formato de 15 colunas fixas. A função `escreverLinhaDados` e `escreverLinhaPlaceholder` também mudam completamente.

- [ ] **Passo 1: Adicionar import do utilitário**

No topo de `gerador-kpi.ts`, adicionar:
```typescript
import { agruparPorLoja, type LinhaAgrupada } from './agrupar-por-loja'
```

- [ ] **Passo 2: Adicionar helper para converter Date em valor de tempo Excel**

Após as funções `fmt` e `colLetter` existentes, adicionar:

```typescript
/** Converte Date para fração de dia Excel (0.0 = meia-noite, 0.5 = 12h) */
function toExcelTime(d: Date | null | undefined): number | null {
  if (!d) return null
  const brt = new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return (brt.getHours() * 3600 + brt.getMinutes() * 60 + brt.getSeconds()) / 86400
}
```

- [ ] **Passo 3: Reescrever `preencherAba`**

Substituir completamente a função `preencherAba`:

```typescript
async function preencherAba(
  ws: ExcelJS.Worksheet,
  wb: ExcelJS.Workbook,
  ctx: { rede_id: string; redeNome: string; data: string; linhas: LinhaParaKpi[] },
) {
  const { rede_id, redeNome, data, linhas } = ctx
  const TOTAL_COLS = 15
  const lastCol = colLetter(TOTAL_COLS) // 'O'

  // Larguras fixas das 15 colunas
  ws.columns = [
    { width: 35 }, // A: loja
    { width: 28 }, // B: motorista 1º
    { width: 8 },  // C: código 1º
    { width: 10 }, // D: placa 1º
    { width: 8 },  // E: saída CD 1º
    { width: 8 },  // F: chd loja 1º
    { width: 8 },  // G: saída loja 1º
    { width: 8 },  // H: tempo 1º
    { width: 28 }, // I: motorista 2º
    { width: 8 },  // J: código 2º
    { width: 10 }, // K: placa 2º
    { width: 8 },  // L: chd loja 2º
    { width: 8 },  // M: saída loja 2º
    { width: 8 },  // N: tempo 2º
    { width: 30 }, // O: obs
  ]

  // Row 1: header amarelo + logo
  ws.mergeCells(`A1:${lastCol}1`)
  const c1 = ws.getCell('A1')
  c1.value = `RELATÓRIO KPI · ${redeNome}`
  c1.font = KPI_FONTS.TITLE
  c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.TRANSMONSEG_YELLOW } }
  c1.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 50

  try {
    const logoBuf = await getLogoBuffer()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logoId = wb.addImage({ buffer: logoBuf as any, extension: 'png' })
    ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 100, height: 50 }, editAs: 'oneCell' })
    ws.addImage(logoId, { tl: { col: 14, row: 0 }, ext: { width: 100, height: 50 }, editAs: 'oneCell' })
  } catch (e) {
    console.warn(`Logo não encontrada: ${(e as Error).message}`)
  }

  // Row 2: subtítulo + grupos de carro
  ws.mergeCells('A2:A2')
  ws.getCell('A2').value = `BENASSI · ${formataDataPtBr(data)}`
  ws.getCell('A2').font = KPI_FONTS.SUBTITLE
  ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' }

  ws.mergeCells('B2:H2')
  ws.getCell('B2').value = `${redeNome} — 1º CARRO`
  ws.getCell('B2').font = { ...KPI_FONTS.HEADER, color: { argb: 'FFFFFFFF' } }
  ws.getCell('B2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.BRAND_BLUE } }
  ws.getCell('B2').alignment = { horizontal: 'center', vertical: 'middle' }

  ws.mergeCells('I2:N2')
  ws.getCell('I2').value = `${redeNome} — 2º CARRO`
  ws.getCell('I2').font = { ...KPI_FONTS.HEADER, color: { argb: 'FFFFFFFF' } }
  ws.getCell('I2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3A5C' } }
  ws.getCell('I2').alignment = { horizontal: 'center', vertical: 'middle' }

  ws.getRow(2).height = 22

  // Row 3: separador
  ws.getRow(3).height = 8

  // Row 4: headers das colunas
  const headerRow = ws.getRow(4)
  headerRow.values = [
    'REDES / FILIAIS',
    'MOTORISTA', 'CÓD', 'PLACA', 'SAÍDA CD', 'CHD LOJA', 'SAÍDA LOJA', 'TEMPO',
    'MOTORISTA', 'CÓD', 'PLACA', 'CHD LOJA', 'SAÍDA LOJA', 'TEMPO',
    'OBS',
  ]
  headerRow.height = 30
  headerRow.eachCell((cell) => {
    cell.font = KPI_FONTS.HEADER
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.BRAND_BLUE } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })

  // Dados agrupados por loja
  const lojasNoDia = [...new Set(linhas.map((l) => l.loja_nome).filter(Boolean))]
  const ordemLojas = getMatrizLojas(rede_id, lojasNoDia)
  const agrupadas = agruparPorLoja(linhas)
  const agrupadasMap = new Map(agrupadas.map((a) => [a.loja_nome, a]))

  let rowIdx = 5
  for (const loja of ordemLojas) {
    const agrupada = agrupadasMap.get(loja) ?? { loja_nome: loja, carro1: null, carro2: null }
    if (!agrupada.carro1 && !agrupada.carro2) {
      escreverLinhaPlaceholder15(ws, rowIdx, loja)
    } else {
      escreverLinhaDados15(ws, rowIdx, agrupada)
    }
    rowIdx++
  }
}
```

- [ ] **Passo 4: Adicionar `escreverLinhaDados15`**

Adicionar nova função após `preencherAba`:

```typescript
function escreverLinhaDados15(ws: ExcelJS.Worksheet, row: number, ag: LinhaAgrupada) {
  const r = ws.getRow(row)
  r.height = 22

  const c1 = ag.carro1
  const c2 = ag.carro2

  // Células de tempo: valor numérico (fração de dia) + numFmt HH:MM
  const saida1 = toExcelTime(c1?.saida_cd)
  const chd1   = toExcelTime(c1?.chd_loja_1)
  const sai1   = toExcelTime(c1?.saida_loja_1)
  const chd2   = toExcelTime(c2?.chd_loja_1)
  const sai2   = toExcelTime(c2?.saida_loja_1)

  r.values = [
    ag.loja_nome,
    // 1º CARRO (B-H)
    c1?.motorista ?? '',
    c1?.motorista_codigo ?? '',
    c1?.placa ?? '',
    saida1 ?? '',
    chd1 ?? '',
    sai1 ?? '',
    '', // H: fórmula TEMPO (preenchida abaixo)
    // 2º CARRO (I-N)
    c2?.motorista ?? '',
    c2?.motorista_codigo ?? '',
    c2?.placa ?? '',
    chd2 ?? '',
    sai2 ?? '',
    '', // N: fórmula TEMPO (preenchida abaixo)
    // OBS
    joinObsTexts([
      ...((c1?.anomalias_codigos) ?? []),
      ...((c2?.anomalias_codigos) ?? []),
    ]) || '',
  ]

  // Aplicar fórmulas MOD nas colunas de TEMPO
  if (chd1 !== null && sai1 !== null) {
    ws.getCell(row, 8).value = { formula: `MOD(G${row}-F${row},1)` }
    ws.getCell(row, 8).numFmt = 'HH:MM'
  }
  if (chd2 !== null && sai2 !== null) {
    ws.getCell(row, 14).value = { formula: `MOD(M${row}-L${row},1)` }
    ws.getCell(row, 14).numFmt = 'HH:MM'
  }

  // numFmt para células de tempo
  for (const colIdx of [5, 6, 7, 12, 13]) {
    const cell = ws.getCell(row, colIdx)
    if (cell.value !== '') cell.numFmt = 'HH:MM'
  }

  const codigos = [...((c1?.anomalias_codigos) ?? []), ...((c2?.anomalias_codigos) ?? [])]
  const hasHigh = temAnomaliaHigh(codigos)
  const zebraColor = row % 2 === 0 ? KPI_COLORS.BG_ZEBRA : KPI_COLORS.BG_WHITE
  const bgColor = hasHigh ? KPI_COLORS.ANOMALIA_HIGH_BG : zebraColor

  r.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.font = KPI_FONTS.BODY
    cell.alignment = { horizontal: colNum === 1 ? 'left' : 'center', vertical: 'middle' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
    cell.border = KPI_BORDER_THIN
    // Colorir TEMPO por duração
    if ((colNum === 8 || colNum === 14) && typeof cell.value === 'object' && cell.value !== null) {
      // fórmula — não colorir aqui (ExcelJS não avalia fórmulas)
    }
  })
}
```

- [ ] **Passo 5: Adicionar `escreverLinhaPlaceholder15`**

```typescript
function escreverLinhaPlaceholder15(ws: ExcelJS.Worksheet, row: number, loja: string) {
  const r = ws.getRow(row)
  r.height = 22
  r.values = [loja, ...Array(14).fill('')]
  r.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.font = colNum === 1 ? KPI_FONTS.BODY_MUTED : KPI_FONTS.BODY
    cell.alignment = { horizontal: colNum === 1 ? 'left' : 'center', vertical: 'middle' }
    cell.border = KPI_BORDER_THIN
  })
}
```

- [ ] **Passo 6: Remover funções antigas**

Remover (ou marcar como unused) as funções `detectarMaxLojasPorRota`, `escreverLinhaDados` e `escreverLinhaPlaceholder` antigas. Remover o import `detectarMaxLojasPorRota` de `@/lib/lojas/catalogo-matriz` se não for mais usado.

- [ ] **Passo 7: Verificar TypeScript**

```bash
cd C:\Users\media\dev\kpi-transmonseg && npx tsc --noEmit 2>&1 | grep gerador
```

Esperado: nenhum erro.

- [ ] **Passo 8: Commit**

```bash
git add src/lib/kpi/gerador-kpi.ts
git commit -m "feat(kpi): redesign XLSX generator to 15-col fixed format matching KPI PRINCESA"
```

---

## Tarefa 7 — Ajustar `gerar/route.ts` para passar dados do 2º CARRO no merge

**Files:**
- Modify: `src/app/api/kpi/gerar/route.ts`

O `gerar/route.ts` já faz merge de `anomMap` para `anomalias_codigos`. Precisamos garantir que o `motorista_codigo` também está sendo passado (verificação).

- [ ] **Passo 1: Verificar se motorista_codigo está no fetch de escala_linhas**

Ler `src/app/api/kpi/gerar/route.ts` e confirmar que o select de `escala_linhas` inclui `motorista_codigo`. Se não incluir, adicionar.

- [ ] **Passo 2: Verificar o merge das linhasBase**

Confirmar que o merge `{ ...l, anomalias_codigos: anomMap.get(...) ?? [] }` preserva `motorista_codigo`. Se `motorista_codigo` vem de outro lookup e não está em `KpiLinha`, garantir que está em `LinhaParaKpi`.

- [ ] **Passo 3: TypeScript check**

```bash
cd C:\Users\media\dev\kpi-transmonseg && npx tsc --noEmit 2>&1 | grep gerar
```

- [ ] **Passo 4: Commit (apenas se houve mudanças)**

```bash
git add src/app/api/kpi/gerar/route.ts
git commit -m "fix(kpi-gerar): ensure motorista_codigo and anomalias_codigos flow to generator"
```

---

## Tarefa 8 — Endpoint `POST /api/escalas/preview` (validação antes de salvar)

**Files:**
- Create: `src/app/api/escalas/preview/route.ts`

Endpoint que parseia uma escala sem salvar, retornando linhas válidas e problemáticas.

- [ ] **Passo 1: Identificar o parser de escala atual**

```bash
find src -name "*.ts" | xargs grep -l "parseEscala\|parsear-escala\|escala.*parse" 2>/dev/null | head -5
```

Anotar o arquivo do parser para importar na rota de preview.

- [ ] **Passo 2: Criar a rota**

```typescript
// src/app/api/escalas/preview/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return new NextResponse('Arquivo obrigatório', { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())

  // Importar o parser de escala existente
  // Substituir pelo import real identificado no Passo 1
  const { parseEscalaXlsx } = await import('@/lib/escalas/parser')

  const { linhas, erros } = await parseEscalaXlsx(buffer, file.name)

  const linhas_validas = linhas.filter((l: { valida?: boolean }) => l.valida !== false)
  const linhas_problematicas = erros ?? linhas
    .filter((l: { valida?: boolean; motivo?: string }) => l.valida === false)
    .map((l: { numero_linha?: number; motivo?: string; raw?: string }) => ({
      linha: l.numero_linha,
      motivo: l.motivo ?? 'Linha inválida',
      conteudo: l.raw ?? '',
    }))

  return NextResponse.json({
    tipo_detectado: 'GERAL',
    total_linhas: linhas.length,
    linhas_validas,
    linhas_problematicas,
  })
}
```

**Nota:** O corpo exato depende da API do parser existente. Ler `src/lib/escalas/` para adaptar os tipos.

- [ ] **Passo 3: Verificar TypeScript**

```bash
cd C:\Users\media\dev\kpi-transmonseg && npx tsc --noEmit 2>&1 | grep preview
```

- [ ] **Passo 4: Commit**

```bash
git add src/app/api/escalas/preview/route.ts
git commit -m "feat(escalas): add preview endpoint for pre-upload validation"
```

---

## Tarefa 9 — Endpoint `POST /api/alteracoes/upload` (alterações via arquivo)

**Files:**
- Create: `src/app/api/alteracoes/upload/route.ts`

Novo endpoint que recebe XLSX ou PDF de alteração e retorna as alterações parsadas.

- [ ] **Passo 1: Criar a rota**

```typescript
// src/app/api/alteracoes/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const data_escala = formData.get('data_escala') as string | null
  if (!file) return new NextResponse('Arquivo obrigatório', { status: 400 })
  if (!data_escala || !/^\d{4}-\d{2}-\d{2}$/.test(data_escala))
    return new NextResponse('data_escala obrigatória (YYYY-MM-DD)', { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  let textoParaParsear: string

  if (ext === 'pdf') {
    // Extrair texto do PDF
    const { PDFDocument } = await import('pdf-lib')
    const buffer = Buffer.from(await file.arrayBuffer())
    const pdfDoc = await PDFDocument.load(buffer)
    // pdf-lib não faz extração de texto diretamente — usar abordagem alternativa
    // Se pdf-parse estiver disponível:
    const pdfParse = (await import('pdf-parse')).default
    const parsed = await pdfParse(buffer)
    textoParaParsear = parsed.text
  } else if (ext === 'xlsx' || ext === 'xls') {
    // Parsear como escala parcial e montar texto descritivo das diferenças
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const buffer = Buffer.from(await file.arrayBuffer())
    await wb.xlsx.load(buffer)
    const ws = wb.worksheets[0]
    const linhas: string[] = []
    ws.eachRow((row) => {
      const vals = (row.values as (string | null | undefined)[]).slice(1).map((v) => String(v ?? '').trim())
      if (vals.some((v) => v)) linhas.push(vals.join(' | '))
    })
    textoParaParsear = linhas.join('\n')
  } else {
    return new NextResponse('Formato não suportado. Use PDF ou XLSX.', { status: 400 })
  }

  // Chamar o endpoint de parsear (reutilizar lógica existente)
  const parseResponse = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/alteracoes/parsear`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: req.headers.get('cookie') ?? '' },
      body: JSON.stringify({ texto: textoParaParsear, data_escala }),
    }
  )

  if (!parseResponse.ok) {
    const err = await parseResponse.text()
    return new NextResponse(`Erro ao parsear: ${err}`, { status: 500 })
  }

  const resultado = await parseResponse.json()
  return NextResponse.json({ ...resultado, tipo_arquivo: ext, texto_extraido: textoParaParsear.slice(0, 500) })
}
```

- [ ] **Passo 2: Verificar dependências**

Confirmar que `pdf-parse` está no package.json. Se não estiver:
```bash
cd C:\Users\media\dev\kpi-transmonseg && npm install pdf-parse @types/pdf-parse
```

- [ ] **Passo 3: Verificar TypeScript**

```bash
cd C:\Users\media\dev\kpi-transmonseg && npx tsc --noEmit 2>&1 | grep upload
```

- [ ] **Passo 4: Commit**

```bash
git add src/app/api/alteracoes/upload/route.ts
git commit -m "feat(alteracoes): add upload endpoint for XLSX/PDF alteracoes"
```

---

## Tarefa 10 — Adicionar seção de upload de arquivo no formulário de alterações

**Files:**
- Modify: `src/app/painel/alteracoes/nova/form.tsx`

Adicionar uma seção "Upload de Arquivo" com dropzone para PDF/XLSX, ao lado/abaixo do campo de texto existente.

- [ ] **Passo 1: Adicionar estado para arquivo**

No componente (após os estados existentes), adicionar:

```typescript
const [arquivo, setArquivo] = useState<File | null>(null)
const [uploadPreview, setUploadPreview] = useState<AlteracaoParsed | null>(null)
const [uploadLoading, setUploadLoading] = useState(false)
```

- [ ] **Passo 2: Adicionar handler de upload**

```typescript
async function handleArquivo(file: File) {
  setArquivo(file)
  setUploadLoading(true)
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('data_escala', dataEscala) // prop ou state da data selecionada
    const res = await fetch('/api/alteracoes/upload', { method: 'POST', body: fd })
    if (!res.ok) throw new Error(await res.text())
    const resultado = await res.json()
    setUploadPreview(resultado.alteracoes?.[0] ?? null)
  } catch (e) {
    console.error(e)
  } finally {
    setUploadLoading(false)
  }
}
```

- [ ] **Passo 3: Renderizar seção de upload**

Adicionar após o campo de texto existente (ou em aba separada):

```tsx
{/* Seção Upload de Arquivo */}
<div className="mt-4 border rounded-lg p-4">
  <Label className="mb-2 block">Upload de Arquivo de Alteração</Label>
  <input
    type="file"
    accept=".pdf,.xlsx,.xls"
    className="block w-full text-sm text-muted-foreground"
    onChange={(e) => {
      const f = e.target.files?.[0]
      if (f) handleArquivo(f)
    }}
  />
  {arquivo && (
    <p className="mt-1 text-xs text-muted-foreground">
      Arquivo: {arquivo.name} ({(arquivo.size / 1024).toFixed(1)} KB)
    </p>
  )}
  {uploadLoading && <p className="mt-2 text-sm text-muted-foreground">Analisando arquivo...</p>}
  {uploadPreview && (
    <div className="mt-3 p-3 bg-muted rounded text-sm">
      <p className="font-medium">Alteração detectada:</p>
      <p>Tipo: {uploadPreview.tipo}</p>
      <p>Rede: {uploadPreview.rede_id ?? '—'}</p>
      <p>Loja: {uploadPreview.loja_nome_raw ?? '—'}</p>
      <Badge variant={confiancaVariant(uploadPreview.confianca)}>{uploadPreview.confianca}</Badge>
    </div>
  )}
</div>
```

- [ ] **Passo 4: Verificar TypeScript**

```bash
cd C:\Users\media\dev\kpi-transmonseg && npx tsc --noEmit 2>&1 | grep "form.tsx"
```

- [ ] **Passo 5: Commit**

```bash
git add src/app/painel/alteracoes/nova/form.tsx
git commit -m "feat(alteracoes-ui): add file upload section (PDF/XLSX) to nova form"
```

---

## Tarefa 11 — Auto-reprocessar após aplicar alteração

**Files:**
- Modify: `src/app/painel/alteracoes/nova/form.tsx` (ou action/server-action de aplicar)
- Verify: `src/app/api/alteracoes/route.ts`

Quando uma alteração é aplicada com sucesso, disparar automaticamente `POST /api/kpi/processar` com a data e rede afetada.

- [ ] **Passo 1: Localizar onde a alteração é aplicada**

```bash
grep -r "api/alteracoes" src/app/painel --include="*.tsx" -l
```

Ler o arquivo onde o POST para `/api/alteracoes` é feito e encontrar o callback de sucesso.

- [ ] **Passo 2: Adicionar auto-processar no callback de sucesso**

No callback após aplicar a alteração com sucesso, adicionar:

```typescript
// Auto-reprocessar após aplicar alteração
const reprocessar = async (dataEscala: string, redeId: string | null) => {
  const body: Record<string, string> = { data: dataEscala }
  if (redeId) body.rede_id = redeId
  await fetch('/api/kpi/processar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
// chamar após alteração aplicada com sucesso:
await reprocessar(dataEscala, resultado.rede_id ?? null)
```

- [ ] **Passo 3: Mostrar feedback visual**

Adicionar estado `reprocessando: boolean` e mostrar badge "Reprocessando KPI..." enquanto aguarda.

- [ ] **Passo 4: Verificar TypeScript**

```bash
cd C:\Users\media\dev\kpi-transmonseg && npx tsc --noEmit 2>&1 | head -20
```

Esperado: 0 erros.

- [ ] **Passo 5: Commit final**

```bash
git add -p
git commit -m "feat(alteracoes): auto-reprocess KPI after applying alteration"
```

---

## Tarefa 12 — Preview de escala na UI de upload

**Files:**
- Modify: `src/app/painel/escalas/` (arquivo de upload existente)

Antes de confirmar upload, chamar `/api/escalas/preview` e mostrar problemas.

- [ ] **Passo 1: Localizar o componente de upload de escala**

```bash
find src/app/painel/escalas -name "*.tsx" | head -10
```

Ler o arquivo para entender o flow atual.

- [ ] **Passo 2: Adicionar chamada de preview antes do submit**

No handler de seleção de arquivo, antes de fazer o upload final:

```typescript
const res = await fetch('/api/escalas/preview', { method: 'POST', body: formData })
const preview = await res.json()
setPreviewData(preview)
// Só permitir confirmar se sem problemas (ou mostrar aviso)
```

- [ ] **Passo 3: Renderizar preview**

```tsx
{previewData && previewData.linhas_problematicas.length > 0 && (
  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
    <p className="font-medium text-yellow-800">
      {previewData.linhas_problematicas.length} linha(s) problemática(s)
    </p>
    {previewData.linhas_problematicas.map((p, i) => (
      <p key={i} className="text-xs text-yellow-700 mt-1">
        Linha {p.linha}: {p.motivo}
      </p>
    ))}
    <p className="text-xs text-yellow-600 mt-2">Revise o arquivo antes de confirmar.</p>
  </div>
)}
{previewData && previewData.linhas_problematicas.length === 0 && (
  <p className="mt-2 text-sm text-green-600">
    Escala válida: {previewData.total_linhas} linha(s) sem problemas.
  </p>
)}
```

- [ ] **Passo 4: Verificar TypeScript e commit**

```bash
cd C:\Users\media\dev\kpi-transmonseg && npx tsc --noEmit 2>&1 | head -20
git add src/app/painel/escalas/
git commit -m "feat(escalas-ui): show preview with validation before confirming upload"
```

---

## Verificação Final

- [ ] `npx tsc --noEmit` → 0 erros
- [ ] Processar uma data: confirmar que `kpi_rotas.anomalias_codigos` é preenchido
- [ ] Abrir card KPI expandido: stats bar mostra contagens corretas, filter chips funcionam
- [ ] Gerar XLSX: verificar 15 colunas, TEMPO como fórmula MOD, 1º/2º CARRO lado a lado
- [ ] Upload de alteração (PDF/XLSX): preview aparece antes de aplicar
- [ ] Após aplicar alteração: KPI é reprocessado automaticamente

```bash
git log --oneline -12
```
