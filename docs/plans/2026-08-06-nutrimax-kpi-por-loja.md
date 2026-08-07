# Nutry Max — "Gerar KPI" por loja Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Trocar o "Gerar KPI" da Nutry Max de um relatório agregado por carga/placa pra um relatório com uma linha por loja (Loja, Motorista, Placa, Saída da base, Chegada na loja, Saída da loja, Tempo na loja, Chegada na base, Tempo total da operação, Quilometragem), igual ao KPI do Benassi.

**Architecture:** A rota `/api/kpi/nutrimax/gerar` passa a chamar `buscarAlvos()` (endpoint `/mapa_servicos/alvos` da Unitrac — mesmo mecanismo que já sustenta o KPI do Benassi) além do que já busca hoje (Escala + GPS clusterizado via `buscarResumosViagemViaApi`). Uma nova função pura `montaKpiLojaNutrimax()` cruza os três: Escala dá motorista/placa, `alvos` dá nome da loja + hora de chegada confirmada, GPS clusterizado dá saída/chegada de base e saída da loja (via a próxima parada). Ver `docs/superpowers/specs/2026-08-06-nutrimax-kpi-por-loja-design.md` pro desenho completo e o porquê de cada escolha.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest, ExcelJS.

---

## Convenções deste plano

- Rode os comandos sempre a partir de `/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg` (repo "definitivo"). Um task no final replica tudo pro repo `KPI TEMP`.
- Depois de CADA task: `npx tsc --noEmit` sem erro é obrigatório antes de commitar.
- Não dar `git push` em nenhum task — só commit local. Push é sempre com confirmação explícita do usuário (padrão já estabelecido nesta sessão).

---

### Task 1: Tipo `LinhaKpiLojaNutrimax` + `AlvoApi` exportado do índice

**Files:**
- Modify: `src/lib/kpi-nutrimax/types.ts`
- Modify: `src/lib/unitrac-api/index.ts`

**Step 1: Adicionar o tipo novo em `types.ts`**

Adicionar ao final do arquivo (não remover nada existente ainda — `kpi-viagem.ts` e o tipo `KpiViagemNutrimax` só são removidos na Task 8):

```ts
/** Uma linha do KPI por loja (uma visita = uma linha, mesmo se teve mais de
 *  uma NF pro mesmo ponto naquele dia) — o que a rota /api/kpi/nutrimax/gerar
 *  produz agora, no mesmo espírito do KPI do Benassi (que também é por loja). */
export type LinhaKpiLojaNutrimax = {
  loja: string
  motorista: string
  placaNorm: string
  saidaBase: string | null // ISO
  chegadaLoja: string | null // ISO
  saidaLoja: string | null // ISO
  tempoNaLojaMin: number | null
  chegadaBase: string | null // ISO
  tempoOperacaoMin: number | null
  kmPercorrido: number | null
  /** 'confirmado' = a Unitrac marcou a entrega como feita (situacao=1) e deu
   *  hora; 'pendente' = a loja está nos alvos do dia mas ainda sem
   *  confirmação; 'sem_rastreador' = a placa da escala não apareceu em
   *  nenhum alvo (offline, sem sinal, ou fora da conta). */
  status: 'confirmado' | 'pendente' | 'sem_rastreador'
}
```

**Step 2: Confirmar que `AlvoApi` é exportado do índice**

Abra `src/lib/unitrac-api/index.ts` e confirme que ele reexporta `AlvoApi` e `buscarAlvos` de `./alvos` (o `kpi/simples/route.ts` já importa `buscarAlvos` de `@/lib/unitrac-api`, então isso já deve existir — só confirme, não deve precisar editar nada aqui).

**Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erro (é só um tipo novo, nada ainda usa ele).

**Step 4: Commit**

```bash
git add src/lib/kpi-nutrimax/types.ts
git commit -m "feat(nutrimax): tipo LinhaKpiLojaNutrimax pro novo KPI por loja"
```

---

### Task 2: `montaKpiLojaNutrimax` — caminho feliz (TDD)

**Files:**
- Create: `src/lib/kpi-nutrimax/kpi-loja.ts`
- Create: `src/lib/kpi-nutrimax/kpi-loja.test.ts`

**Step 1: Escrever o teste (caminho feliz — uma loja confirmada, com GPS batendo)**

```ts
import { describe, it, expect } from 'vitest'
import { montaKpiLojaNutrimax } from './kpi-loja'
import type { LinhaEscalaNutrimax } from './types'
import type { AlvoApi } from '@/lib/unitrac-api/alvos'
import type { ResumoVeiculo, ParadaUnitrac } from '@/lib/types/unitrac'

function escala(overrides: Partial<LinhaEscalaNutrimax> = {}): LinhaEscalaNutrimax {
  return {
    carga: '92593', placaRaw: 'TTL7D40', placaNorm: 'TTL7D40', destino: 'CAMPOS',
    motorista: 'LUAN VIANA AREAS RIBEIRO', ajudante1: null, ajudante2: null,
    pesoKg: 2405, entPlanejado: 1, nfPlanejado: 1, ...overrides,
  }
}

function alvo(overrides: Partial<AlvoApi> = {}): AlvoApi {
  return {
    placaNorm: 'TTL7D40', codigoUnitrac: '129145', nome: 'WW CARNES MERCEARIA EIRELI',
    situacao: 1, feitoISO: '2026-08-06T10:20:21.120', inicioISO: '2026-08-06T07:00:00',
    documento: '2310197', ordem: 0, rota: '95211', ...overrides,
  }
}

function parada(overrides: Partial<ParadaUnitrac> = {}): ParadaUnitrac {
  return {
    placa_norm: 'TTL7D40', chegada: new Date('2026-08-06T07:00:00Z'), saida: new Date('2026-08-06T07:05:00Z'),
    duracao_seg: 300, distancia_km: 10, endereco: null, lat: -22.8, lng: -43.2,
    local_parada: 'BASE - BASE GARAGEM', codigo_loja: null, nome_loja: null,
    classificacao: 'BASE', ordem: 1, ...overrides,
  }
}

function resumo(overrides: Partial<ResumoVeiculo> = {}): ResumoVeiculo {
  return {
    placa_norm: 'TTL7D40', placa_raw: 'TTL7D40', inicio_viagem: null, fim_viagem: null,
    qtd_paradas: 0, saida_cd: null, paradas: [], ...overrides,
  }
}

describe('montaKpiLojaNutrimax', () => {
  it('caminho feliz: loja confirmada com GPS batendo — todas as colunas preenchidas', () => {
    const paradaBase = parada({ classificacao: 'BASE', chegada: new Date('2026-08-06T07:00:00Z'), saida: new Date('2026-08-06T07:00:00Z'), ordem: 1 })
    const paradaLoja = parada({
      classificacao: 'LOJA', codigo_loja: '129145', nome_loja: 'WW CARNES MERCEARIA EIRELI',
      chegada: new Date('2026-08-06T10:20:00Z'), saida: new Date('2026-08-06T10:35:00Z'), ordem: 2,
    })
    const paradaVoltaBase = parada({ classificacao: 'BASE', chegada: new Date('2026-08-06T12:00:00Z'), saida: new Date('2026-08-06T12:00:00Z'), ordem: 3 })

    const r = montaKpiLojaNutrimax(
      [escala()],
      [alvo()],
      [resumo({ paradas: [paradaBase, paradaLoja, paradaVoltaBase] })],
    )

    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      loja: 'WW CARNES MERCEARIA EIRELI',
      motorista: 'LUAN VIANA AREAS RIBEIRO',
      placaNorm: 'TTL7D40',
      saidaBase: '2026-08-06T07:00:00.000Z',
      chegadaLoja: '2026-08-06T10:20:21.120',
      saidaLoja: '2026-08-06T10:35:00.000Z',
      chegadaBase: '2026-08-06T12:00:00.000Z',
      status: 'confirmado',
    })
    expect(r[0].tempoNaLojaMin).toBeGreaterThan(0)
    expect(r[0].tempoOperacaoMin).toBeGreaterThan(0)
  })
})
```

**Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/kpi-nutrimax/kpi-loja.test.ts`
Expected: FAIL — `Cannot find module './kpi-loja'` (o arquivo ainda não existe).

**Step 3: Implementar `kpi-loja.ts`**

```ts
import type { AlvoApi } from '@/lib/unitrac-api/alvos'
import type { ResumoVeiculo, ParadaUnitrac } from '@/lib/types/unitrac'
import type { LinhaEscalaNutrimax, LinhaKpiLojaNutrimax } from './types'
import { montaResumoViagemPorPlaca } from './resumo-viagem'

function acharSaidaBase(paradas: ParadaUnitrac[]): string | null {
  const bases = paradas.filter(p => p.classificacao === 'BASE')
  return bases.length > 0 ? bases[0].saida.toISOString() : null
}

// Só conta como "voltou" se existe uma 2ª permanência em base DEPOIS de ter
// saído — uma única parada BASE o dia inteiro não é ida-e-volta, é "nunca saiu".
function acharChegadaBase(paradas: ParadaUnitrac[]): string | null {
  const bases = paradas.filter(p => p.classificacao === 'BASE')
  return bases.length > 1 ? bases[bases.length - 1].chegada.toISOString() : null
}

function diffMin(inicioIso: string | null, fimIso: string | null): number | null {
  if (!inicioIso || !fimIso) return null
  const min = Math.round((new Date(fimIso).getTime() - new Date(inicioIso).getTime()) / 60000)
  return min >= 0 ? min : null
}

/** Cruza Escala (motorista/placa) + alvos da Unitrac (loja/NF/confirmação) +
 *  GPS clusterizado (saída/chegada de base, saída da loja) numa linha por
 *  loja visitada. `alvos` e `resumosVeiculo` já devem vir filtrados pras
 *  placas da escala (mesmo padrão de buscarResumosViagemViaApi). */
export function montaKpiLojaNutrimax(
  escala: LinhaEscalaNutrimax[],
  alvos: AlvoApi[],
  resumosVeiculo: ResumoVeiculo[],
): LinhaKpiLojaNutrimax[] {
  const motoristaPorPlaca = new Map(escala.map(e => [e.placaNorm, e.motorista]))
  const resumoPorPlaca = new Map(resumosVeiculo.map(r => [r.placa_norm, r]))
  const kmPorPlaca = new Map(montaResumoViagemPorPlaca(resumosVeiculo).map(r => [r.placaNorm, r.kmPercorrido]))

  const alvosPorPlaca = new Map<string, AlvoApi[]>()
  for (const a of alvos) {
    const arr = alvosPorPlaca.get(a.placaNorm) ?? []
    arr.push(a)
    alvosPorPlaca.set(a.placaNorm, arr)
  }

  const linhas: LinhaKpiLojaNutrimax[] = []

  for (const e of escala) {
    const placaNorm = e.placaNorm
    if (!placaNorm) continue
    const motorista = motoristaPorPlaca.get(placaNorm) ?? e.motorista
    const alvosDaPlaca = alvosPorPlaca.get(placaNorm)

    if (!alvosDaPlaca || alvosDaPlaca.length === 0) {
      linhas.push({
        loja: '—', motorista, placaNorm,
        saidaBase: null, chegadaLoja: null, saidaLoja: null, tempoNaLojaMin: null,
        chegadaBase: null, tempoOperacaoMin: null, kmPercorrido: null,
        status: 'sem_rastreador',
      })
      continue
    }

    const paradas = resumoPorPlaca.get(placaNorm)?.paradas ?? []
    const saidaBase = acharSaidaBase(paradas)
    const chegadaBase = acharChegadaBase(paradas)
    const km = kmPorPlaca.get(placaNorm) ?? null

    // Agrupa por loja (codigoUnitrac) — 2 NFs pro mesmo ponto viram 1 linha,
    // não 2 idênticas (visto em dado real: mesmo cliente, 2 documentos, 1 visita).
    const porLoja = new Map<string, AlvoApi[]>()
    for (const a of alvosDaPlaca) {
      const chave = a.codigoUnitrac || 'SEM_CODIGO'
      const arr = porLoja.get(chave) ?? []
      arr.push(a)
      porLoja.set(chave, arr)
    }

    const linhasDaPlaca: LinhaKpiLojaNutrimax[] = []
    for (const [codigoUnitrac, grupo] of porLoja) {
      const confirmados = grupo
        .filter(a => a.situacao === 1 && a.feitoISO)
        .sort((a, b) => a.feitoISO!.localeCompare(b.feitoISO!))
      // feitoISO cru da Unitrac não tem Z (ver alvos.ts) — normaliza via
      // toISOString pra comparar em pé de igualdade com saidaLoja/saidaBase/
      // chegadaBase, que já passam por esse mesmo tratamento. Correção real
      // achada na review da Task 2 (docs/plans deste arquivo, ledger).
      const chegadaLoja = confirmados[0]?.feitoISO ? new Date(confirmados[0].feitoISO).toISOString() : null

      const paradaGps = paradas.find(p => p.classificacao === 'LOJA' && p.codigo_loja === codigoUnitrac)
      const saidaLoja = paradaGps ? paradaGps.saida.toISOString() : null

      linhasDaPlaca.push({
        loja: grupo[0].nome, motorista, placaNorm,
        saidaBase, chegadaLoja, saidaLoja,
        tempoNaLojaMin: diffMin(chegadaLoja, saidaLoja),
        chegadaBase, tempoOperacaoMin: diffMin(saidaBase, chegadaBase),
        kmPercorrido: km,
        status: chegadaLoja ? 'confirmado' : 'pendente',
      })
    }

    // Ordena por horário de chegada — lojas ainda pendentes (sem horário) no final.
    linhasDaPlaca.sort((a, b) => {
      if (!a.chegadaLoja && !b.chegadaLoja) return 0
      if (!a.chegadaLoja) return 1
      if (!b.chegadaLoja) return -1
      return a.chegadaLoja.localeCompare(b.chegadaLoja)
    })
    linhas.push(...linhasDaPlaca)
  }

  return linhas
}
```

**Step 4: Rodar o teste de novo**

Run: `npx vitest run src/lib/kpi-nutrimax/kpi-loja.test.ts`
Expected: PASS (1 teste).

**Step 5: Commit**

```bash
git add src/lib/kpi-nutrimax/kpi-loja.ts src/lib/kpi-nutrimax/kpi-loja.test.ts
git commit -m "feat(nutrimax): montaKpiLojaNutrimax — caminho feliz"
```

---

### Task 3: `montaKpiLojaNutrimax` — casos de borda (TDD)

**Files:**
- Modify: `src/lib/kpi-nutrimax/kpi-loja.test.ts`

**Step 1: Adicionar os testes de borda**

Adicionar dentro do mesmo `describe('montaKpiLojaNutrimax', ...)`:

```ts
  it('loja pendente sem GPS correspondente: chegada/saída vazias, status pendente, não inventa horário', () => {
    const r = montaKpiLojaNutrimax(
      [escala()],
      [alvo({ situacao: 0, feitoISO: null })],
      [resumo({ paradas: [] })],
    )
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('pendente')
    expect(r[0].chegadaLoja).toBeNull()
    expect(r[0].saidaLoja).toBeNull()
    expect(r[0].tempoNaLojaMin).toBeNull()
  })

  it('placa da escala sem nenhum alvo: 1 linha "sem_rastreador", tudo nulo', () => {
    const r = montaKpiLojaNutrimax(
      [escala({ placaNorm: 'ZZZ9Z99', placaRaw: 'ZZZ9Z99' })],
      [alvo()], // alvo é de outra placa (TTL7D40) — não deve casar
      [resumo()],
    )
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ loja: '—', placaNorm: 'ZZZ9Z99', status: 'sem_rastreador' })
  })

  it('2 NFs pro mesmo ponto (mesmo codigoUnitrac) viram 1 linha, não 2', () => {
    const r = montaKpiLojaNutrimax(
      [escala()],
      [
        // feitoISO com Z (timestamp inequívoco) — mesma convenção do resto
        // dos testes deste arquivo; ver nota da Task 2 sobre por que raw
        // sem Z é frágil em máquina com timezone != UTC.
        alvo({ documento: '2308904', feitoISO: '2026-08-06T10:20:21.120Z' }),
        alvo({ documento: '2308905', feitoISO: '2026-08-06T10:20:21.130Z' }),
      ],
      [resumo()],
    )
    expect(r).toHaveLength(1)
    // usa a confirmação mais cedo das duas
    expect(r[0].chegadaLoja).toBe('2026-08-06T10:20:21.120Z')
  })

  it('duas lojas distintas confirmadas no mesmo instante exato (confirmação em lote) não quebram o cálculo — cada uma vira 1 linha', () => {
    const r = montaKpiLojaNutrimax(
      [escala()],
      [
        alvo({ codigoUnitrac: '129145', nome: 'LOJA A', documento: 'NF1', feitoISO: '2026-08-06T10:20:21.120' }),
        alvo({ codigoUnitrac: '129146', nome: 'LOJA B', documento: 'NF2', feitoISO: '2026-08-06T10:20:21.120' }),
      ],
      [resumo()],
    )
    expect(r).toHaveLength(2)
    expect(r.map(l => l.loja).sort()).toEqual(['LOJA A', 'LOJA B'])
  })

  it('só 1 permanência em base o dia inteiro: saída da base preenchida, chegada na base fica vazia (não "voltou" de verdade)', () => {
    const r = montaKpiLojaNutrimax(
      [escala()],
      [alvo({ situacao: 0, feitoISO: null })],
      [resumo({ paradas: [parada({ classificacao: 'BASE' })] })],
    )
    expect(r[0].saidaBase).not.toBeNull()
    expect(r[0].chegadaBase).toBeNull()
  })
```

**Step 2: Rodar e confirmar que passam (a implementação da Task 2 já cobre esses casos)**

Run: `npx vitest run src/lib/kpi-nutrimax/kpi-loja.test.ts`
Expected: PASS (6 testes no total). Se algum falhar, ajustar `kpi-loja.ts` até passar — a lógica já foi desenhada pra cobrir esses casos, então uma falha aqui indica um bug na implementação da Task 2, não um design errado.

**Step 3: Commit**

```bash
git add src/lib/kpi-nutrimax/kpi-loja.test.ts
git commit -m "test(nutrimax): casos de borda de montaKpiLojaNutrimax"
```

---

### Task 4: Gerador de Excel `gerarKpiLojaXlsx`

**Files:**
- Create: `src/lib/kpi-nutrimax/gerador-kpi-loja.ts`
- Create: `src/lib/kpi-nutrimax/gerador-kpi-loja.test.ts`

**Step 1: Escrever o teste**

Mesmo padrão de `gerador-kpi-viagem.test.ts` — só confirma que o arquivo é um XLSX válido com o número certo de linhas (o layout visual em si não é testado por unit test neste repo, ver `gerador-kpi-viagem.test.ts` como referência de estilo).

```ts
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarKpiLojaXlsx } from './gerador-kpi-loja'
import type { LinhaKpiLojaNutrimax } from './types'

function linha(overrides: Partial<LinhaKpiLojaNutrimax> = {}): LinhaKpiLojaNutrimax {
  return {
    loja: 'WW CARNES MERCEARIA EIRELI', motorista: 'LUAN VIANA', placaNorm: 'TTL7D40',
    saidaBase: '2026-08-06T07:00:00.000Z', chegadaLoja: '2026-08-06T10:20:00.000Z',
    saidaLoja: '2026-08-06T10:35:00.000Z', tempoNaLojaMin: 15,
    chegadaBase: '2026-08-06T12:00:00.000Z', tempoOperacaoMin: 300, kmPercorrido: 42.3,
    status: 'confirmado', ...overrides,
  }
}

describe('gerarKpiLojaXlsx', () => {
  it('gera um XLSX válido com uma linha de header + uma por loja', async () => {
    const buf = await gerarKpiLojaXlsx([linha(), linha({ loja: 'OUTRA LOJA', status: 'pendente', chegadaLoja: null })], '2026-08-06')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.worksheets[0]
    // linha 1 = título, linha 2 = subtítulo, linha 3 = header, 4+ = dados
    expect(ws.getRow(3).getCell(1).value).toBe('LOJA')
    expect(ws.getRow(4).getCell(1).value).toBe('WW CARNES MERCEARIA EIRELI')
    expect(ws.getRow(5).getCell(1).value).toBe('OUTRA LOJA')
  })
})
```

**Step 2: Rodar e confirmar falha**

Run: `npx vitest run src/lib/kpi-nutrimax/gerador-kpi-loja.test.ts`
Expected: FAIL — módulo não existe.

**Step 3: Implementar, adaptando o estilo visual de `gerador-kpi-viagem.ts`**

```ts
import ExcelJS from 'exceljs'
import { getLogoBuffer } from '@/lib/kpi/template-loader'
import { formataDataPtBr } from '@/lib/kpi/kpi-styles'
import type { LinhaKpiLojaNutrimax } from './types'

const COR_TITULO = 'FF153C6B'
const COR_HEADER_TABELA = 'FF2E75B6'
const COR_BG_ALT = 'FFF8FAFC'
const COR_CONFIRMADO_BG = 'FFD1FAE5'
const COR_CONFIRMADO_TXT = 'FF065F46'
const COR_PENDENTE_BG = 'FFFEF3C7'
const COR_PENDENTE_TXT = 'FF92400E'
const COR_SEM_RASTREADOR_BG = 'FFFEE2E2'
const COR_SEM_RASTREADOR_TXT = 'FF991B1B'

const STATUS_LABEL: Record<LinhaKpiLojaNutrimax['status'], string> = {
  confirmado: 'CONFIRMADO',
  pendente: 'PENDENTE',
  sem_rastreador: 'SEM RASTREADOR',
}
const STATUS_COR: Record<LinhaKpiLojaNutrimax['status'], { bg: string; txt: string }> = {
  confirmado: { bg: COR_CONFIRMADO_BG, txt: COR_CONFIRMADO_TXT },
  pendente: { bg: COR_PENDENTE_BG, txt: COR_PENDENTE_TXT },
  sem_rastreador: { bg: COR_SEM_RASTREADOR_BG, txt: COR_SEM_RASTREADOR_TXT },
}

const COLUNAS = [
  'LOJA', 'MOTORISTA', 'PLACA', 'SAÍDA DA BASE', 'CHEGADA NA LOJA', 'SAÍDA DA LOJA',
  'TEMPO NA LOJA', 'CHEGADA NA BASE', 'TEMPO TOTAL DA OPERAÇÃO', 'KM', 'STATUS',
] as const
const COL_SAIDA_BASE = 4
const COL_CHEGADA_LOJA = 5
const COL_SAIDA_LOJA = 6
const COL_TEMPO_LOJA = 7
const COL_CHEGADA_BASE = 8
const COL_TEMPO_OPERACAO = 9

function toExcelTime(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  return (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) / 86400
}

function minutosParaFracaoDia(min: number | null): number | null {
  return min == null ? null : min / 1440
}

export async function gerarKpiLojaXlsx(linhas: LinhaKpiLojaNutrimax[], data: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()

  const logoBuf = await getLogoBuffer()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageId = wb.addImage({ buffer: logoBuf as any, extension: 'png' })

  const [, mesIso, diaIso] = data.split('-')
  const ws = wb.addWorksheet(`${diaIso}.${mesIso}`)
  ws.columns = [
    { width: 34 }, { width: 24 }, { width: 12 }, { width: 12 }, { width: 13 }, { width: 13 },
    { width: 12 }, { width: 13 }, { width: 16 }, { width: 10 }, { width: 16 },
  ]

  ws.mergeCells(1, 1, 1, COLUNAS.length)
  const titulo = ws.getCell(1, 1)
  titulo.value = 'RELATÓRIO KPI - NUTRY MAX'
  titulo.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TITULO } }
  titulo.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 34
  ws.addImage(imageId, { tl: { col: 0.05, row: 0.05 }, ext: { width: 60, height: 43 } })

  ws.mergeCells(2, 1, 2, COLUNAS.length)
  const subtitulo = ws.getCell(2, 1)
  subtitulo.value = `${formataDataPtBr(data)} — ${linhas.length} loja(s) — via API Unitrac`
  subtitulo.font = { italic: true, size: 10, color: { argb: 'FF475569' } }
  subtitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BG_ALT } }
  subtitulo.alignment = { horizontal: 'center' }
  ws.getRow(2).height = 18

  const header = ws.addRow([...COLUNAS])
  header.eachCell(cell => {
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_HEADER_TABELA } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  header.height = 22

  let kmTotal = 0
  const kmJaContado = new Set<string>()
  linhas.forEach((l, i) => {
    // km é total por placa (repetido em cada linha da mesma placa) — só soma 1x.
    if (l.kmPercorrido != null && !kmJaContado.has(l.placaNorm)) {
      kmTotal += l.kmPercorrido
      kmJaContado.add(l.placaNorm)
    }
    const row = ws.addRow([
      l.loja, l.motorista, l.placaNorm,
      toExcelTime(l.saidaBase) ?? '', toExcelTime(l.chegadaLoja) ?? '', toExcelTime(l.saidaLoja) ?? '',
      minutosParaFracaoDia(l.tempoNaLojaMin) ?? '', toExcelTime(l.chegadaBase) ?? '',
      minutosParaFracaoDia(l.tempoOperacaoMin) ?? '', l.kmPercorrido ?? '', STATUS_LABEL[l.status],
    ])
    if (i % 2 === 1) {
      row.eachCell((cell, col) => { if (col < COLUNAS.length) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BG_ALT } } })
    }
    for (const col of [COL_SAIDA_BASE, COL_CHEGADA_LOJA, COL_SAIDA_LOJA, COL_TEMPO_LOJA, COL_CHEGADA_BASE, COL_TEMPO_OPERACAO]) {
      const cell = row.getCell(col)
      if (typeof cell.value === 'number') { cell.numFmt = 'h:mm'; cell.alignment = { horizontal: 'center' } }
    }
    const cor = STATUS_COR[l.status]
    const statusCell = row.getCell(COLUNAS.length)
    statusCell.font = { bold: true, size: 10, color: { argb: cor.txt } }
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor.bg } }
    statusCell.alignment = { horizontal: 'center' }
  })

  if (linhas.length > 0) {
    const totalRow = ws.addRow(['TOTAL', '', '', '', '', '', '', '', '', Math.round(kmTotal * 10) / 10, ''])
    totalRow.font = { bold: true }
    totalRow.eachCell(cell => { cell.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } } })
  }

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
```

**Step 4: Rodar de novo**

Run: `npx vitest run src/lib/kpi-nutrimax/gerador-kpi-loja.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/kpi-nutrimax/gerador-kpi-loja.ts src/lib/kpi-nutrimax/gerador-kpi-loja.test.ts
git commit -m "feat(nutrimax): gerador de XLSX do KPI por loja"
```

---

### Task 5: Ligar tudo na rota `/api/kpi/nutrimax/gerar`

**Files:**
- Modify: `src/app/api/kpi/nutrimax/gerar/route.ts`

**Step 1: Trocar os imports**

Trocar:
```ts
import { montaKpiViagemPorCarga } from '@/lib/kpi-nutrimax/kpi-viagem'
import { gerarKpiViagemXlsx } from '@/lib/kpi-nutrimax/gerador-kpi-viagem'
```
por:
```ts
import { buscarFrota } from '@/lib/unitrac-api/frota'
import { buscarAlvos } from '@/lib/unitrac-api/alvos'
import { COD_USER_NUTRIMAX } from '@/lib/unitrac-api/client'
import { montaKpiLojaNutrimax } from '@/lib/kpi-nutrimax/kpi-loja'
import { gerarKpiLojaXlsx } from '@/lib/kpi-nutrimax/gerador-kpi-loja'
```

**Step 2: Buscar os alvos em paralelo com os resumos de viagem, e trocar o miolo**

Trocar o trecho:
```ts
  let resumosVeiculo = await buscarResumosViagemViaApi(placasEscala, data)

  const orsKey = process.env.ORS_API_KEY
  if (orsKey) {
    try {
      resumosVeiculo = await enriquecerComKmReal(resumosVeiculo, orsKey)
    } catch (e) {
      console.warn('[/api/kpi/nutrimax/gerar] cálculo de KM via ORS falhou (segue sem km):', e instanceof Error ? e.message : e)
    }
  }

  const resumoViagem = montaResumoViagemPorPlaca(resumosVeiculo)
  const kpi = montaKpiViagemPorCarga(escala, resumoViagem)
  const xlsxBuf = await gerarKpiViagemXlsx(kpi, data)

  const resumo = {
    total: kpi.length,
    ok: kpi.filter(k => k.status === 'ok').length,
    incompletos: kpi.filter(k => k.status === 'incompleto').length,
    semRastreador: kpi.filter(k => k.status === 'sem_rastreador').length,
  }

  const linhas = kpi.map(k => ({
    carga: k.carga,
    placa: k.placaNorm,
    destino: k.destino,
    motorista: k.motorista,
    pesoKg: k.pesoKg,
    entPlanejado: k.entPlanejado,
    qtdParadasReal: k.qtdParadasReal,
    kmPercorrido: k.kmPercorrido,
    inicioViagem: k.inicioViagem,
    fimViagem: k.fimViagem,
    status: k.status,
  }))
```

por:
```ts
  const frota = await buscarFrota(COD_USER_NUTRIMAX)
  const cvsEscala = frota.filter(v => placasEscala.has(v.placaNorm)).map(v => v.cv)

  let [resumosVeiculo, alvos] = await Promise.all([
    buscarResumosViagemViaApi(placasEscala, data),
    cvsEscala.length > 0 ? buscarAlvos(cvsEscala) : Promise.resolve([]),
  ])

  const orsKey = process.env.ORS_API_KEY
  if (orsKey) {
    try {
      resumosVeiculo = await enriquecerComKmReal(resumosVeiculo, orsKey)
    } catch (e) {
      console.warn('[/api/kpi/nutrimax/gerar] cálculo de KM via ORS falhou (segue sem km):', e instanceof Error ? e.message : e)
    }
  }

  const kpi = montaKpiLojaNutrimax(escala, alvos, resumosVeiculo)

  const resumo = {
    total: kpi.length,
    ok: kpi.filter(k => k.status === 'confirmado').length,
    incompletos: kpi.filter(k => k.status === 'pendente').length,
    semRastreador: kpi.filter(k => k.status === 'sem_rastreador').length,
  }

  const linhas = kpi
```

Note: `resumo` mantém as MESMAS chaves (`total`/`ok`/`incompletos`/`semRastreador`) — `ok` agora conta "confirmado" e `incompletos` conta "pendente". Isso é proposital: o histórico (`historico/page.tsx`) já lê essas chaves por nome pra gerações antigas, e não precisa mudar.

**Step 3: Trocar a chamada do gerador de XLSX**

Trocar:
```ts
  const xlsxBuf = await gerarKpiViagemXlsx(kpi, data)
```
por (já deve estar logo antes do bloco de `resumo` — mover pra depois de `montaKpiLojaNutrimax`, antes de montar `resumo`, se necessário reordenar):
```ts
  const xlsxBuf = await gerarKpiLojaXlsx(kpi, data)
```

**Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erro. Se der erro de tipo em `linhas` (o `salvarGeracao`/`historico.ts` espera algum shape específico de `payload`), leia `src/lib/kpi-nutrimax/historico.ts` — `payload` é `unknown`/genérico lá, não deve quebrar.

**Step 5: Rodar a suíte inteira do nutrimax**

Run: `npx vitest run src/lib/kpi-nutrimax`
Expected: todos os testes passam, EXCETO `kpi-viagem.test.ts` e `gerador-kpi-viagem.test.ts` que ainda existem mas não são mais chamados por ninguém — eles continuam passando (testam a função isolada, que ainda existe até a Task 8), não é motivo de alarme.

**Step 6: Commit**

```bash
git add src/app/api/kpi/nutrimax/gerar/route.ts
git commit -m "feat(nutrimax): /gerar usa alvos da Unitrac pro KPI por loja"
```

---

### Task 6: Tela "Gerar KPI" — nova tabela de preview

**Files:**
- Modify: `src/app/painel/nutrimax/gerar/page.tsx`

**Step 1: Trocar o tipo `Linha` e os rótulos dos cards de resumo**

Trocar:
```ts
type StatusLinha = 'ok' | 'incompleto' | 'sem_rastreador'
type Linha = {
  carga: string
  placa: string
  destino: string
  motorista: string
  pesoKg: number | null
  entPlanejado: number | null
  qtdParadasReal: number
  kmPercorrido: number | null
  inicioViagem: string | null
  fimViagem: string | null
  status: StatusLinha
}
```
por:
```ts
type StatusLinha = 'ok' | 'incompleto' | 'sem_rastreador'
type Linha = {
  loja: string
  motorista: string
  placaNorm: string
  saidaBase: string | null
  chegadaLoja: string | null
  saidaLoja: string | null
  tempoNaLojaMin: number | null
  chegadaBase: string | null
  tempoOperacaoMin: number | null
  kmPercorrido: number | null
  status: StatusLinha
}
```

Nota: `status` continua usando os valores `'ok'|'incompleto'|'sem_rastreador'` (não `'confirmado'|'pendente'`) porque é isso que a rota devolve no JSON — o `resumo` e as chaves de `status` no payload HTTP não mudam de nome, só o que cada uma conta (ver Task 5).

**Step 2: Trocar o texto de descrição do topo**

Trocar:
```tsx
        <p className="mt-1 max-w-[55ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Suba a Escala de Rota. O sistema busca as paradas reais direto da API ao vivo do
          Unitrac (GPS, sem PDF de relatório) e cruza com o planejado pra gerar o KPI por
          carga/placa.
        </p>
```
por:
```tsx
        <p className="mt-1 max-w-[55ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Suba a Escala de Rota. O sistema busca as entregas confirmadas e o GPS direto da
          API ao vivo do Unitrac e monta o KPI por loja — chegada, saída, tempo de
          operação e km.
        </p>
```

**Step 3: Trocar os labels dos cards de resumo**

Trocar:
```tsx
          <CardResumo label="Total de cargas" valor={resumo.total} tone="default" />
          <CardResumo label="OK" valor={resumo.ok} tone="success" />
          <CardResumo label="Incompletos" valor={resumo.incompletos} tone="warning" />
          <CardResumo label="Sem rastreador" valor={resumo.semRastreador} tone="danger" />
```
por:
```tsx
          <CardResumo label="Total de lojas" valor={resumo.total} tone="default" />
          <CardResumo label="Confirmadas" valor={resumo.ok} tone="success" />
          <CardResumo label="Pendentes" valor={resumo.incompletos} tone="warning" />
          <CardResumo label="Sem rastreador" valor={resumo.semRastreador} tone="danger" />
```

**Step 4: Trocar o título "Cargas" por "Lojas" e o texto de filtro vazio**

Trocar `<h2 ...>Cargas</h2>` (linha ~221) por `<h2 ...>Lojas</h2>`, e `Nenhuma carga nesse filtro.` por `Nenhuma loja nesse filtro.`

**Step 5: Trocar a tabela inteira (thead + tbody)**

Trocar o bloco `<table>...</table>` (linhas ~238-294) por:

```tsx
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-left">
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Loja</th>
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Motorista</th>
                  <th className="w-28 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Placa</th>
                  <th className="w-24 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Saída base</th>
                  <th className="w-24 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Chegada loja</th>
                  <th className="w-24 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Saída loja</th>
                  <th className="w-20 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Tempo loja</th>
                  <th className="w-24 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Chegada base</th>
                  <th className="w-24 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Tempo op.</th>
                  <th className="w-20 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Km</th>
                  <th className="w-36 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {linhasFiltradas.map((l, i) => (
                  <tr
                    key={`${l.placaNorm}-${l.loja}-${i}`}
                    className={cn(
                      'border-b border-[var(--color-border)] last:border-0',
                      l.status !== 'ok' && 'bg-[var(--color-warning-soft)]/20',
                    )}
                  >
                    <td className="px-4 py-1.5 text-[var(--color-fg)]">{l.loja}</td>
                    <td className="px-4 py-1.5 text-[var(--color-fg-muted)]">{l.motorista}</td>
                    <td className="px-4 py-1.5 text-numeric text-[var(--color-fg)]">{l.placaNorm}</td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">{fmtHora(l.saidaBase)}</td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">{fmtHora(l.chegadaLoja)}</td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">{fmtHora(l.saidaLoja)}</td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">
                      {l.tempoNaLojaMin != null ? `${l.tempoNaLojaMin}min` : '—'}
                    </td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">{fmtHora(l.chegadaBase)}</td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">
                      {l.tempoOperacaoMin != null ? `${Math.floor(l.tempoOperacaoMin / 60)}h${String(l.tempoOperacaoMin % 60).padStart(2, '0')}` : '—'}
                    </td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">
                      {l.kmPercorrido != null ? l.kmPercorrido.toLocaleString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-1.5 text-center">
                      <StatusBadge status={l.status} />
                    </td>
                  </tr>
                ))}
                {linhasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-[var(--color-fg-subtle)]">
                      Nenhuma loja nesse filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
```

**Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erro.

**Step 7: Testar no navegador**

Suba o dev server (`npm run dev`), logue com a técnica de magic-link já usada nesta sessão (ver credenciais no `.env.local`), abra `/painel/nutrimax/gerar`, suba uma Escala real (ex. `~/Downloads/Escala 31-07.pdf` se ainda existir, ou peça uma nova ao usuário) com a data de hoje/ontem, gere, e confirme visualmente:
- Tabela mostra uma linha por loja (não por carga).
- Colunas na ordem certa.
- Horários fazem sentido (chegada < saída, saída da base < chegada na loja etc.).
- "Baixar XLSX" abre um arquivo com as mesmas colunas.

Tire um screenshot com o `chrome-devtools-mcp` e confira antes de prosseguir — regra da sessão: sempre validar mudança de UI ao vivo antes de reportar como pronta.

**Step 8: Commit**

```bash
git add src/app/painel/nutrimax/gerar/page.tsx
git commit -m "feat(nutrimax): tela Gerar KPI mostra a tabela por loja"
```

---

### Task 7: Texto do histórico ("carga" → "loja")

**Files:**
- Modify: `src/app/painel/nutrimax/historico/page.tsx`

**Step 1: Trocar o texto do resumo de KPI (só esse, o de Romaneio continua "carga")**

Em `resumoTexto()`, trocar:
```ts
    return `${r.total} carga(s) · ${r.ok} OK · ${r.incompletos} incompletos · ${r.semRastreador} sem rastreador${r.modoApi ? ' · via API' : ''}`
```
por:
```ts
    return `${r.total} loja(s) · ${r.ok} confirmadas · ${r.incompletos} pendentes · ${r.semRastreador} sem rastreador${r.modoApi ? ' · via API' : ''}`
```

**Step 2: Typecheck e commit**

```bash
npx tsc --noEmit
git add src/app/painel/nutrimax/historico/page.tsx
git commit -m "chore(nutrimax): texto do histórico reflete KPI por loja"
```

**Nota pro usuário (não é uma ação, é só documentar):** gerações de KPI salvas ANTES dessa mudança, se reabertas pelo histórico, vão mostrar a tabela antiga (por carga) só que tentando encaixar nas colunas novas — o formato de linha mudou de verdade, não dá pra manter compatibilidade sem inventar dado que não existe. Isso é esperado, não bug.

---

### Task 8: Remover o código morto (`kpi-viagem.ts` + `gerador-kpi-viagem.ts`)

**Files:**
- Delete: `src/lib/kpi-nutrimax/kpi-viagem.ts`
- Delete: `src/lib/kpi-nutrimax/kpi-viagem.test.ts`
- Delete: `src/lib/kpi-nutrimax/gerador-kpi-viagem.ts`
- Delete: `src/lib/kpi-nutrimax/gerador-kpi-viagem.test.ts`

**Step 1: Confirmar que ninguém mais importa esses dois módulos**

Run: `grep -rln "kpi-viagem\|gerador-kpi-viagem" src/ --include="*.ts" --include="*.tsx" | grep -v ".test.ts"`
Expected: nenhum resultado (a Task 5 já tirou o único caller, `gerar/route.ts`).

**Step 2: Remover os 4 arquivos**

```bash
git rm src/lib/kpi-nutrimax/kpi-viagem.ts src/lib/kpi-nutrimax/kpi-viagem.test.ts src/lib/kpi-nutrimax/gerador-kpi-viagem.ts src/lib/kpi-nutrimax/gerador-kpi-viagem.test.ts
```

**Step 3: Também remover o tipo `KpiViagemNutrimax` de `types.ts`** (só ele ficou sem uso — `LinhaEscalaNutrimax`/`ResumoViagemPlacaNutrimax` continuam usados por `kpi-loja.ts`/`resumo-viagem.ts`)

Run: `grep -rn "KpiViagemNutrimax" src/ --include="*.ts" --include="*.tsx"`
Expected: só aparece dentro de `types.ts` agora. Remova o bloco do tipo `KpiViagemNutrimax` de `types.ts`.

**Step 4: Typecheck + suíte inteira**

```bash
npx tsc --noEmit
npx vitest run
```
Expected: typecheck limpo, todos os testes passam (a suíte deve ter uns 4-6 testes a menos do que antes, pelos arquivos removidos, e uns 7 a mais pelos novos — confira o total no resumo do vitest).

**Step 5: Commit**

```bash
git add -A
git commit -m "chore(nutrimax): remove kpi-viagem/gerador-kpi-viagem (sem caller após KPI por loja)"
```

---

### Task 9: Portar tudo pro repo TEMP

**Files:** todos os arquivos tocados nas Tasks 1-8, espelhados de `KPI transmonseg` pra `KPI TEMP`.

**Step 1: Copiar os arquivos**

```bash
SRC="/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg"
DST="/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"

cp "$SRC/src/lib/kpi-nutrimax/types.ts" "$DST/src/lib/kpi-nutrimax/types.ts"
cp "$SRC/src/lib/kpi-nutrimax/kpi-loja.ts" "$DST/src/lib/kpi-nutrimax/kpi-loja.ts"
cp "$SRC/src/lib/kpi-nutrimax/kpi-loja.test.ts" "$DST/src/lib/kpi-nutrimax/kpi-loja.test.ts"
cp "$SRC/src/lib/kpi-nutrimax/gerador-kpi-loja.ts" "$DST/src/lib/kpi-nutrimax/gerador-kpi-loja.ts"
cp "$SRC/src/lib/kpi-nutrimax/gerador-kpi-loja.test.ts" "$DST/src/lib/kpi-nutrimax/gerador-kpi-loja.test.ts"
cp "$SRC/src/app/api/kpi/nutrimax/gerar/route.ts" "$DST/src/app/api/kpi/nutrimax/gerar/route.ts"
cp "$SRC/src/app/painel/nutrimax/gerar/page.tsx" "$DST/src/app/painel/nutrimax/gerar/page.tsx"
cp "$SRC/src/app/painel/nutrimax/historico/page.tsx" "$DST/src/app/painel/nutrimax/historico/page.tsx"
rm -f "$DST/src/lib/kpi-nutrimax/kpi-viagem.ts" "$DST/src/lib/kpi-nutrimax/kpi-viagem.test.ts" "$DST/src/lib/kpi-nutrimax/gerador-kpi-viagem.ts" "$DST/src/lib/kpi-nutrimax/gerador-kpi-viagem.test.ts"

diff -rq "$SRC/src" "$DST/src" | grep -v ".DS_Store"
```
Expected do `diff`: nenhuma saída (repos idênticos de novo).

**Step 2: Typecheck + suíte completa no TEMP**

```bash
cd "$DST"
rm -rf .next
npx tsc --noEmit
npx vitest run
```
Expected: mesmo resultado do repo definitivo (sem erro, todos os testes passam).

**Step 3: Commit no TEMP**

```bash
cd "$DST"
git add -A
git commit -m "feat(nutrimax): KPI por loja via alvos da Unitrac (mesma mudança do definitivo)"
```

**Step 4: Reportar ao usuário**

Resumo do que foi feito, screenshot da tela testada, e perguntar se pode dar `git push` nos dois repos (padrão desta sessão: nunca dar push sem confirmação explícita).

---

## Fora deste plano (mencionar ao usuário se perguntarem)

- "Gerar Romaneio" não muda.
- A planilha de 577 clientes (`Relação clientes.xlsx`) não é usada neste plano — o match funciona sem ela. Fica disponível pra um enriquecimento futuro (endereço no relatório) se o usuário pedir.
- Nenhuma tela nova tipo "Ver KPIs" (como foi feito pro Benassi) — a saída continua sendo XLSX.
