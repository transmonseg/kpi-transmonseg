# Romaneio Nutry Max com GPS real (3º arquivo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O "Gerar Romaneio" do Nutry Max passa a exigir 3 arquivos (Escala + Romaneio + Relatório Parada e Serviço) e cruza o GPS real (paradas, km, horários) com cada cliente do romaneio, casando pelo código da loja.

**Architecture:** `montaRelatorioPorPlaca` ganha um 3º parâmetro (`ResumoVeiculo[]`, saída de `parseUnitracPdf`) e casa paradas classificadas `LOJA` com clientes do romaneio pelo `codigo_loja`/`clienteCodigo`. O gerador XLSX ganha colunas de GPS na aba Resumo, no cabeçalho de cada aba de placa e na tabela de clientes, mais uma seção "paradas sem cliente identificado". A rota e a tela seguem o mesmo padrão já usado no "Gerar KPI" pro terceiro upload.

**Tech Stack:** Next.js 16 App Router, TypeScript, ExcelJS, Vitest, `parseUnitracPdf` (`src/lib/parsers/unitrac-pdf.ts`, já existente).

## Global Constraints

- Sem branches de feature — commits diretos na `main`, um por task, nos dois repos.
- `npx tsc --noEmit` e `npx vitest run` limpos antes de qualquer commit.
- Nunca `git push` sem confirmação explícita via `AskUserQuestion`.
- Nunca apagar/remover telas, rotas ou código existente sem permissão explícita — itens fora do fluxo continuam existindo, só não ficam visíveis.
- Credenciais do portal Unitrac e a senha do usuário de teste `teste@gmail.com` nunca vão pra memória nem pra arquivo — uso transitório, sempre rotacionadas de volta pra um valor aleatório logo após qualquer smoke test autenticado.
- Dois repos sincronizados a cada commit: `KPI TEMP` (`/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP`, remote `kpi-temporaria`) e `KPI transmonseg` (`/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg`, remote `kpi-transmonseg`) — mesmo projeto Supabase, sem migration nova nesta feature (não mexe em schema).

---

### Task A: Tipos + cruzamento por código de loja

**Files:**
- Modify: `src/lib/kpi-nutrimax/types.ts:99-127`
- Modify: `src/lib/kpi-nutrimax/romaneio-conferencia.ts` (arquivo inteiro)
- Modify: `src/lib/kpi-nutrimax/romaneio-conferencia.test.ts` (arquivo inteiro)
- Modify: `src/lib/kpi-nutrimax/gerador-romaneio-conferencia.test.ts` (só os fixtures `base`/`ausente`, pra continuar compilando — sem novas asserções, isso é o Task B)

**Interfaces:**
- Consumes: `ParadaUnitrac`, `ResumoVeiculo` de `@/lib/types/unitrac` (campos: `placa_norm`, `chegada: Date`, `saida: Date`, `distancia_km: number | null`, `local_parada: string`, `codigo_loja: string | null`, `nome_loja: string | null`, `classificacao`, `ordem`, `qtd_paradas`, `paradas`, `inicio_viagem: Date | null`, `fim_viagem: Date | null`).
- Produces: `montaRelatorioPorPlaca(escala: LinhaEscalaNutrimax[], romaneio: LinhaRomaneioNutrimax[], resumosVeiculo: ResumoVeiculo[]): RelatorioPlacaNutrimax[]` — usado pelo Task C (rota). Tipos `ParadaConferidaNutrimax` e `ClienteConferidoNutrimax` — usados pelo Task B (gerador).

- [ ] **Step 1: Atualizar `types.ts`**

Substituir o bloco de `ClienteRomaneioResumo` e `RelatorioPlacaNutrimax` (linhas 99-127) por:

```ts
/** Uma parada real do GPS (Relatório Parada e Serviço do Unitrac) casada com
 *  um cliente do romaneio pelo código da loja. */
export type ParadaConferidaNutrimax = {
  chegada: string // ISO
  saida: string // ISO
  distanciaKm: number | null
  localParada: string
  codigoLoja: string | null
  nomeLoja: string | null
}

/** Um cliente dentro da aba de uma placa, no relatório de conferência —
 *  com a confirmação física (GPS) além do documental (romaneio). */
export type ClienteConferidoNutrimax = {
  nf: string
  clienteNome: string
  endereco: string | null
  /** null = nenhuma parada GPS bateu o código de loja desse cliente. */
  parada: ParadaConferidaNutrimax | null
}

/** Uma linha do relatório "Romaneio Nutry" — uma carga/placa da escala, com o resultado
 *  da conferência contra o romaneio, os clientes encontrados, e o cruzamento com o
 *  GPS real (Relatório Parada e Serviço). */
export type RelatorioPlacaNutrimax = {
  carga: string
  placaRaw: string
  placaNorm: string
  destino: string
  motorista: string
  ajudante1: string | null
  ajudante2: string | null
  pesoKg: number | null
  nfPlanejado: number | null
  nfRecebido: number
  /** Clientes distintos planejados (ENT da escala) — diferente de NF: um cliente
   *  pode receber mais de uma nota fiscal na mesma carga. */
  entPlanejado: number | null
  /** Clientes distintos que de fato apareceram no romaneio pra essa carga. */
  entRecebido: number
  status: 'ok' | 'divergente' | 'ausente'
  clientes: ClienteConferidoNutrimax[]
  /** Soma da distância de todas as paradas do dia (GPS). null = placa não
   *  apareceu no Relatório Parada e Serviço (sem rastreador nesse dia). */
  kmPercorrido: number | null
  qtdParadasReal: number
  inicioViagem: string | null // ISO
  fimViagem: string | null // ISO
  /** Paradas do GPS classificadas como LOJA que não bateram nenhum cliente
   *  do romaneio dessa carga — evita esconder anomalias. */
  paradasSemCliente: ParadaConferidaNutrimax[]
}
```

- [ ] **Step 2: Reescrever `romaneio-conferencia.ts`**

```ts
import type { ParadaUnitrac, ResumoVeiculo } from '@/lib/types/unitrac'
import type {
  LinhaEscalaNutrimax,
  LinhaRomaneioNutrimax,
  RelatorioPlacaNutrimax,
  ClienteConferidoNutrimax,
  ParadaConferidaNutrimax,
} from './types'

function contaClientesDistintos(linhas: LinhaRomaneioNutrimax[]): number {
  return new Set(linhas.map(l => l.clienteCodigo || l.clienteNome)).size
}

function toParadaConferida(p: ParadaUnitrac): ParadaConferidaNutrimax {
  return {
    chegada: p.chegada.toISOString(),
    saida: p.saida.toISOString(),
    distanciaKm: p.distancia_km,
    localParada: p.local_parada,
    codigoLoja: p.codigo_loja,
    nomeLoja: p.nome_loja,
  }
}

export function montaRelatorioPorPlaca(
  escala: LinhaEscalaNutrimax[],
  romaneio: LinhaRomaneioNutrimax[],
  resumosVeiculo: ResumoVeiculo[],
): RelatorioPlacaNutrimax[] {
  const porCarga = new Map<string, LinhaRomaneioNutrimax[]>()
  for (const l of romaneio) {
    const arr = porCarga.get(l.carga) ?? []
    arr.push(l)
    porCarga.set(l.carga, arr)
  }
  const veiculoPorPlaca = new Map(resumosVeiculo.map(v => [v.placa_norm, v]))

  return escala.map((e): RelatorioPlacaNutrimax => {
    const linhas = porCarga.get(e.carga) ?? []
    const nfRecebido = linhas.length
    const entRecebido = contaClientesDistintos(linhas)

    let status: RelatorioPlacaNutrimax['status'] = 'ok'
    if (nfRecebido === 0) {
      status = 'ausente'
    } else {
      const placaRomaneio = linhas[0].placa
      const placaDivergente = !!e.placaNorm && !!placaRomaneio && e.placaNorm !== placaRomaneio
      const nfIncompleto = e.nfPlanejado != null && nfRecebido < e.nfPlanejado
      const entIncompleto = e.entPlanejado != null && entRecebido < e.entPlanejado
      if (placaDivergente || nfIncompleto || entIncompleto) status = 'divergente'
    }

    const veiculo = veiculoPorPlaca.get(e.placaNorm) ?? null

    const paradasLoja = (veiculo?.paradas ?? [])
      .filter((p): p is ParadaUnitrac & { codigo_loja: string } => p.classificacao === 'LOJA' && p.codigo_loja !== null)
      .sort((a, b) => a.ordem - b.ordem)
    const paradaPorCodigo = new Map<string, ParadaUnitrac & { codigo_loja: string }>()
    for (const p of paradasLoja) {
      if (!paradaPorCodigo.has(p.codigo_loja)) paradaPorCodigo.set(p.codigo_loja, p)
    }

    const usados = new Set<string>()
    const clientes: ClienteConferidoNutrimax[] = linhas.map(l => {
      const parada = l.clienteCodigo ? paradaPorCodigo.get(l.clienteCodigo) : undefined
      if (parada) usados.add(parada.codigo_loja)
      return {
        nf: l.nf,
        clienteNome: l.clienteNome,
        endereco: l.endereco,
        parada: parada ? toParadaConferida(parada) : null,
      }
    })
    const paradasSemCliente = paradasLoja.filter(p => !usados.has(p.codigo_loja)).map(toParadaConferida)

    const temDistancia = (veiculo?.paradas ?? []).some(p => p.distancia_km != null)
    const km = (veiculo?.paradas ?? []).reduce((acc, p) => acc + (p.distancia_km ?? 0), 0)

    return {
      carga: e.carga,
      placaRaw: e.placaRaw,
      placaNorm: e.placaNorm,
      destino: e.destino,
      motorista: e.motorista,
      ajudante1: e.ajudante1,
      ajudante2: e.ajudante2,
      pesoKg: e.pesoKg,
      nfPlanejado: e.nfPlanejado,
      nfRecebido,
      entPlanejado: e.entPlanejado,
      entRecebido,
      status,
      clientes,
      kmPercorrido: temDistancia ? Math.round(km * 10) / 10 : null,
      qtdParadasReal: veiculo?.qtd_paradas ?? 0,
      inicioViagem: veiculo?.inicio_viagem ? veiculo.inicio_viagem.toISOString() : null,
      fimViagem: veiculo?.fim_viagem ? veiculo.fim_viagem.toISOString() : null,
      paradasSemCliente,
    }
  })
}
```

- [ ] **Step 3: Reescrever `romaneio-conferencia.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { montaRelatorioPorPlaca } from './romaneio-conferencia'
import type { LinhaEscalaNutrimax, LinhaRomaneioNutrimax } from './types'
import type { ParadaUnitrac, ResumoVeiculo } from '@/lib/types/unitrac'

function escala(overrides: Partial<LinhaEscalaNutrimax> = {}): LinhaEscalaNutrimax {
  return {
    carga: '92593',
    placaRaw: 'TTL7D40',
    placaNorm: 'TTL7D40',
    destino: 'CAMPOS',
    motorista: 'LUAN VIANA AREAS RIBEIRO',
    ajudante1: 'LEANDRO DA HORA BATISTA',
    ajudante2: null,
    pesoKg: 2405,
    entPlanejado: null,
    nfPlanejado: null,
    ...overrides,
  }
}

function romaneio(overrides: Partial<LinhaRomaneioNutrimax> = {}): LinhaRomaneioNutrimax {
  return {
    carga: '92593',
    destino: 'CAMPOS',
    placa: 'TTL7D40',
    motorista: 'LUAN VIANA AREAS RIBEIRO',
    ajudantes: [],
    nf: '2270025',
    clienteCodigo: '165049',
    clienteNome: 'ANDRE LUIS SILVA VELASCO',
    endereco: 'RUA X, 1 - BAIRRO, CAMPOS - *',
    ...overrides,
  }
}

function parada(overrides: Partial<ParadaUnitrac> = {}): ParadaUnitrac {
  return {
    placa_norm: 'TTL7D40',
    chegada: new Date('2026-07-15T10:00:00.000Z'),
    saida: new Date('2026-07-15T10:15:00.000Z'),
    duracao_seg: 900,
    distancia_km: 12.5,
    endereco: null,
    lat: null,
    lng: null,
    local_parada: '165049 - ANDRE LUIS SILVA VELASCO',
    codigo_loja: '165049',
    nome_loja: 'ANDRE LUIS SILVA VELASCO',
    classificacao: 'LOJA',
    ordem: 1,
    ...overrides,
  }
}

function resumoVeiculo(overrides: Partial<ResumoVeiculo> = {}): ResumoVeiculo {
  return {
    placa_norm: 'TTL7D40',
    placa_raw: 'TTL7D40',
    inicio_viagem: new Date('2026-07-15T08:00:00.000Z'),
    fim_viagem: new Date('2026-07-15T16:00:00.000Z'),
    qtd_paradas: 1,
    paradas: [parada()],
    saida_cd: null,
    ...overrides,
  }
}

describe('montaRelatorioPorPlaca', () => {
  it('status ok: placa bate, recebeu todos os NFs e todos os clientes planejados', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 2, entPlanejado: 2 })],
      [
        romaneio({ nf: '1', clienteCodigo: 'C1' }),
        romaneio({ nf: '2', clienteCodigo: 'C2' }),
      ],
      [],
    )
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('ok')
    expect(r[0].nfRecebido).toBe(2)
    expect(r[0].entRecebido).toBe(2)
    expect(r[0].clientes).toHaveLength(2)
    expect(r[0].clientes[0]).toEqual({
      nf: '1', clienteNome: 'ANDRE LUIS SILVA VELASCO', endereco: 'RUA X, 1 - BAIRRO, CAMPOS - *', parada: null,
    })
  })

  it('status ausente: nenhuma linha do romaneio pra essa carga', () => {
    const r = montaRelatorioPorPlaca([escala({ carga: '99999' })], [romaneio({ carga: '92593' })], [])
    expect(r[0].status).toBe('ausente')
    expect(r[0].nfRecebido).toBe(0)
    expect(r[0].entRecebido).toBe(0)
    expect(r[0].clientes).toEqual([])
  })

  it('status divergente: placa da escala diferente da placa no romaneio', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ placaNorm: 'TTL7D40', nfPlanejado: 1 })],
      [romaneio({ placa: 'ABC1D23', nf: '1' })],
      [],
    )
    expect(r[0].status).toBe('divergente')
  })

  it('status divergente: recebeu menos NFs do que o planejado', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 5 })],
      [romaneio({ nf: '1', clienteCodigo: 'C1' }), romaneio({ nf: '2', clienteCodigo: 'C2' })],
      [],
    )
    expect(r[0].status).toBe('divergente')
    expect(r[0].nfRecebido).toBe(2)
  })

  it('status divergente: NF bate mas faltou cliente (ENT) — 2 notas pro mesmo cliente, outro cliente nunca apareceu', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 2, entPlanejado: 2 })],
      [
        romaneio({ nf: '1', clienteCodigo: 'C1' }),
        romaneio({ nf: '2', clienteCodigo: 'C1' }),
      ],
      [],
    )
    expect(r[0].nfRecebido).toBe(2)
    expect(r[0].entRecebido).toBe(1)
    expect(r[0].status).toBe('divergente')
  })

  it('sem nfPlanejado nem entPlanejado (null) não gera falso-divergente — só confere placa', () => {
    const r = montaRelatorioPorPlaca([escala({ nfPlanejado: null, entPlanejado: null })], [romaneio({ nf: '1' })], [])
    expect(r[0].status).toBe('ok')
  })

  it('preserva a ordem da escala e ignora cargas do romaneio sem escala correspondente', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ carga: 'A', nfPlanejado: 1 }), escala({ carga: 'B', nfPlanejado: 1 })],
      [romaneio({ carga: 'B', nf: '1' }), romaneio({ carga: 'A', nf: '1' }), romaneio({ carga: 'ORFA', nf: '1' })],
      [],
    )
    expect(r.map(x => x.carga)).toEqual(['A', 'B'])
  })

  it('cliente com código de loja batendo uma parada GPS fica confirmado, com chegada/saída/km', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 1, entPlanejado: 1 })],
      [romaneio({ nf: '1', clienteCodigo: '165049' })],
      [resumoVeiculo()],
    )
    expect(r[0].clientes[0].parada).toEqual({
      chegada: '2026-07-15T10:00:00.000Z',
      saida: '2026-07-15T10:15:00.000Z',
      distanciaKm: 12.5,
      localParada: '165049 - ANDRE LUIS SILVA VELASCO',
      codigoLoja: '165049',
      nomeLoja: 'ANDRE LUIS SILVA VELASCO',
    })
    expect(r[0].kmPercorrido).toBe(12.5)
    expect(r[0].qtdParadasReal).toBe(1)
    expect(r[0].inicioViagem).toBe('2026-07-15T08:00:00.000Z')
    expect(r[0].fimViagem).toBe('2026-07-15T16:00:00.000Z')
  })

  it('cliente sem parada correspondente fica com parada: null mesmo com o veículo rastreado', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 1, entPlanejado: 1 })],
      [romaneio({ nf: '1', clienteCodigo: '999999' })],
      [resumoVeiculo()], // só tem parada da loja 165049
    )
    expect(r[0].clientes[0].parada).toBeNull()
  })

  it('parada de loja sem cliente correspondente na carga vira paradasSemCliente', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 1, entPlanejado: 1 })],
      [romaneio({ nf: '1', clienteCodigo: '165049' })],
      [resumoVeiculo({ paradas: [parada(), parada({ codigo_loja: '999999', nome_loja: 'LOJA FANTASMA', local_parada: '999999 - LOJA FANTASMA', ordem: 2 })], qtd_paradas: 2 })],
    )
    expect(r[0].paradasSemCliente).toHaveLength(1)
    expect(r[0].paradasSemCliente[0].codigoLoja).toBe('999999')
  })

  it('placa sem ResumoVeiculo (sem rastreador) zera todos os campos de GPS', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 1, entPlanejado: 1 })],
      [romaneio({ nf: '1', clienteCodigo: '165049' })],
      [], // nenhum veículo no relatório
    )
    expect(r[0].kmPercorrido).toBeNull()
    expect(r[0].qtdParadasReal).toBe(0)
    expect(r[0].inicioViagem).toBeNull()
    expect(r[0].fimViagem).toBeNull()
    expect(r[0].clientes[0].parada).toBeNull()
    expect(r[0].paradasSemCliente).toEqual([])
  })

  it('parada repetida no mesmo código de loja usa a primeira por ordem', () => {
    const r = montaRelatorioPorPlaca(
      [escala({ nfPlanejado: 1, entPlanejado: 1 })],
      [romaneio({ nf: '1', clienteCodigo: '165049' })],
      [resumoVeiculo({
        paradas: [
          parada({ ordem: 2, chegada: new Date('2026-07-15T14:00:00.000Z') }),
          parada({ ordem: 1, chegada: new Date('2026-07-15T09:00:00.000Z') }),
        ],
        qtd_paradas: 2,
      })],
    )
    expect(r[0].clientes[0].parada?.chegada).toBe('2026-07-15T09:00:00.000Z')
  })
})
```

- [ ] **Step 4: Atualizar os fixtures de `gerador-romaneio-conferencia.test.ts` pra continuar compilando**

No topo do arquivo, trocar o objeto `base` (linhas 6-24) por:

```ts
const base: RelatorioPlacaNutrimax = {
  carga: '92593',
  placaRaw: 'TTL7D40',
  placaNorm: 'TTL7D40',
  destino: 'CAMPOS',
  motorista: 'LUAN VIANA AREAS RIBEIRO',
  ajudante1: 'LEANDRO DA HORA BATISTA',
  ajudante2: null,
  pesoKg: 2405,
  nfPlanejado: 2,
  nfRecebido: 2,
  entPlanejado: 2,
  entRecebido: 2,
  status: 'ok',
  clientes: [
    {
      nf: '1', clienteNome: 'ANDRE LUIS SILVA VELASCO', endereco: 'RUA X, 1 - BAIRRO, CAMPOS - *',
      parada: {
        chegada: '2026-07-15T10:00:00.000Z', saida: '2026-07-15T10:15:00.000Z', distanciaKm: 12.5,
        localParada: '165049 - ANDRE LUIS SILVA VELASCO', codigoLoja: '165049', nomeLoja: 'ANDRE LUIS SILVA VELASCO',
      },
    },
    { nf: '2', clienteNome: 'M A SARDINHA', endereco: 'RUA Y, 2 - BAIRRO, CAMPOS - *', parada: null },
  ],
  kmPercorrido: 93.5,
  qtdParadasReal: 2,
  inicioViagem: '2026-07-15T05:07:00.000Z',
  fimViagem: '2026-07-15T14:08:00.000Z',
  paradasSemCliente: [],
}
```

E o objeto `ausente` (linhas 26-36) por:

```ts
const ausente: RelatorioPlacaNutrimax = {
  ...base,
  carga: '92595',
  placaRaw: 'XXX0000',
  placaNorm: 'XXX0000',
  destino: 'DIRETA FRATELLI',
  nfRecebido: 0,
  entRecebido: 0,
  status: 'ausente',
  clientes: [],
  kmPercorrido: null,
  qtdParadasReal: 0,
  inicioViagem: null,
  fimViagem: null,
  paradasSemCliente: [],
}
```

Não mexer em mais nada nesse arquivo neste passo — as asserções sobre as novas colunas entram no Task B.

- [ ] **Step 5: Rodar os testes e o typecheck**

Run: `cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx vitest run src/lib/kpi-nutrimax/romaneio-conferencia.test.ts src/lib/kpi-nutrimax/gerador-romaneio-conferencia.test.ts`
Expected: todos os testes de `romaneio-conferencia.test.ts` passam (9 casos). `gerador-romaneio-conferencia.test.ts` continua passando com os fixtures novos (ainda sem as colunas de GPS no XLSX, isso é esperado — o gerador não foi tocado).

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git add src/lib/kpi-nutrimax/types.ts src/lib/kpi-nutrimax/romaneio-conferencia.ts src/lib/kpi-nutrimax/romaneio-conferencia.test.ts src/lib/kpi-nutrimax/gerador-romaneio-conferencia.test.ts
git commit -m "feat(nutrimax): cruza romaneio com GPS real por código de loja

montaRelatorioPorPlaca ganha um 3º parâmetro (ResumoVeiculo[], do Relatório
Parada e Serviço) e casa cada cliente do romaneio com a parada GPS do mesmo
código de loja — confirmação física além da documental."
```

---

### Task B: Gerador XLSX com colunas de GPS

**Files:**
- Modify: `src/lib/kpi-nutrimax/gerador-romaneio-conferencia.ts` (arquivo inteiro)
- Modify: `src/lib/kpi-nutrimax/gerador-romaneio-conferencia.test.ts` (novas asserções)

**Interfaces:**
- Consumes: `RelatorioPlacaNutrimax` com os campos de GPS do Task A (`kmPercorrido`, `qtdParadasReal`, `inicioViagem`, `fimViagem`, `paradasSemCliente`, `clientes[].parada`).
- Produces: `gerarRomaneioConferencia(relatorio: RelatorioPlacaNutrimax[]): Promise<Buffer>` — assinatura inalterada, usada pelo Task C.

- [ ] **Step 1: Reescrever `gerador-romaneio-conferencia.ts`**

```ts
import ExcelJS from 'exceljs'
import { getLogoBuffer } from '@/lib/kpi/template-loader'
import type { RelatorioPlacaNutrimax } from './types'

// Mesmas cores do template aprovado do KPI Benassi (src/assets/kpi-template.xlsx) —
// faixa de título FF153C6B, cabeçalho de tabela num azul mais claro.
const COR_TITULO = 'FF153C6B'
const COR_HEADER_TABELA = 'FF2E75B6'
const COR_BG_ALT = 'FFF8FAFC'
const COR_OK_BG = 'FFD1FAE5'
const COR_OK_TXT = 'FF065F46'
const COR_DIVERGENTE_BG = 'FFFEF3C7'
const COR_DIVERGENTE_TXT = 'FF92400E'
const COR_AUSENTE_BG = 'FFFEE2E2'
const COR_AUSENTE_TXT = 'FF991B1B'

const STATUS_LABEL: Record<RelatorioPlacaNutrimax['status'], string> = {
  ok: 'OK',
  divergente: 'DIVERGENTE',
  ausente: 'AUSENTE',
}

const STATUS_COR: Record<RelatorioPlacaNutrimax['status'], { bg: string; txt: string }> = {
  ok: { bg: COR_OK_BG, txt: COR_OK_TXT },
  divergente: { bg: COR_DIVERGENTE_BG, txt: COR_DIVERGENTE_TXT },
  ausente: { bg: COR_AUSENTE_BG, txt: COR_AUSENTE_TXT },
}

function sanitizaNomeAba(nome: string): string {
  return nome.replace(/[\\/?*[\]:]/g, '-').slice(0, 31)
}

function nomeUnicoAba(usados: Set<string>, base: string): string {
  let nome = sanitizaNomeAba(base)
  let i = 2
  while (usados.has(nome)) {
    nome = sanitizaNomeAba(`${base} (${i})`)
    i++
  }
  usados.add(nome)
  return nome
}

/** HH:MM a partir de um ISO. String vazia quando não há valor — fica em
 *  branco na célula em vez de poluir a planilha com "null"/"undefined". */
function fmtHora(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(11, 16)
}

/** Faixa de marca (logo + título navy + subtítulo) nas 2 primeiras linhas da aba —
 *  mesmo padrão visual do template aprovado do KPI Benassi. Conteúdo real da aba
 *  começa na linha 3. */
function aplicarCabecalhoDeMarca(
  ws: ExcelJS.Worksheet,
  imageId: number,
  titulo: string,
  subtitulo: string,
  ultimaColuna: number,
) {
  ws.mergeCells(1, 1, 1, ultimaColuna)
  const t = ws.getCell(1, 1)
  t.value = titulo
  t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TITULO } }
  t.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 34

  ws.addImage(imageId, { tl: { col: 0.05, row: 0.05 }, ext: { width: 60, height: 43 } })

  ws.mergeCells(2, 1, 2, ultimaColuna)
  const s = ws.getCell(2, 1)
  s.value = subtitulo
  s.font = { italic: true, size: 10, color: { argb: 'FF475569' } }
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BG_ALT } }
  s.alignment = { horizontal: 'center' }
  ws.getRow(2).height = 18
}

function estilizaHeaderTabela(row: ExcelJS.Row) {
  row.eachCell(cell => {
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_HEADER_TABELA } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  row.height = 22
}

function pintaStatusCell(cell: ExcelJS.Cell, status: RelatorioPlacaNutrimax['status']) {
  const cor = STATUS_COR[status]
  cell.font = { bold: true, size: 10, color: { argb: cor.txt } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor.bg } }
  cell.alignment = { horizontal: 'center' }
}

function pintaConfirmacaoCell(cell: ExcelJS.Cell, confirmado: boolean) {
  cell.font = { bold: true, size: 10, color: { argb: confirmado ? COR_OK_TXT : COR_DIVERGENTE_TXT } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: confirmado ? COR_OK_BG : COR_DIVERGENTE_BG } }
  cell.alignment = { horizontal: 'center' }
}

export async function gerarRomaneioConferencia(relatorio: RelatorioPlacaNutrimax[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()

  const logoBuf = await getLogoBuffer()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageId = wb.addImage({ buffer: logoBuf as any, extension: 'png' })

  // Nomes das abas decididos ANTES de desenhar o Resumo, pra poder linkar cada
  // linha direto pra aba da placa correspondente.
  const usados = new Set<string>(['Resumo'])
  const nomesAba = relatorio.map(r => nomeUnicoAba(usados, `${r.placaNorm} (${r.carga})`))

  const resumo = wb.addWorksheet('Resumo')
  resumo.views = [{ state: 'frozen', ySplit: 3 }]
  resumo.columns = [
    { width: 12 }, { width: 14 }, { width: 26 }, { width: 12 }, { width: 12 },
    { width: 10 }, { width: 10 }, { width: 13 }, { width: 14 },
  ]
  aplicarCabecalhoDeMarca(resumo, imageId, 'ROMANEIO NUTRY — CONFERÊNCIA', `${relatorio.length} carga(s) na escala`, 9)
  const headerResumo = resumo.addRow(['CARGA', 'PLACA', 'DESTINO', 'PESO (KG)', 'CLIENTES', 'NFS', 'KM', 'PARADAS GPS', 'STATUS'])
  estilizaHeaderTabela(headerResumo)
  let pesoTotal = 0
  let kmTotal = 0
  relatorio.forEach((r, i) => {
    pesoTotal += r.pesoKg ?? 0
    kmTotal += r.kmPercorrido ?? 0
    const row = resumo.addRow([
      r.carga,
      r.placaNorm,
      r.destino,
      r.pesoKg ?? '',
      `${r.entRecebido}/${r.entPlanejado ?? '—'}`,
      `${r.nfRecebido}/${r.nfPlanejado ?? '—'}`,
      r.kmPercorrido ?? '',
      r.qtdParadasReal,
      STATUS_LABEL[r.status],
    ])
    if (i % 2 === 1) {
      row.eachCell((cell, col) => { if (col < 9) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BG_ALT } } })
    }
    row.getCell(2).value = { text: r.placaNorm, hyperlink: `#'${nomesAba[i]}'!A1` }
    row.getCell(2).font = { color: { argb: 'FF1F4E78' }, underline: true }
    pintaStatusCell(row.getCell(9), r.status)
  })
  if (relatorio.length > 0) {
    const totalRow = resumo.addRow(['TOTAL', '', '', pesoTotal, '', '', Math.round(kmTotal * 10) / 10, '', ''])
    totalRow.font = { bold: true }
    totalRow.eachCell(cell => { cell.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } } })
  }

  relatorio.forEach((r, i) => {
    const ws = wb.addWorksheet(nomesAba[i])
    ws.properties.tabColor = { argb: STATUS_COR[r.status].txt }
    ws.columns = [{ width: 18 }, { width: 32 }, { width: 40 }, { width: 16 }, { width: 11 }, { width: 9 }]
    aplicarCabecalhoDeMarca(ws, imageId, `${r.placaNorm} — CARGA ${r.carga}`, r.destino, 6)

    ws.addRow(['CARGA', r.carga])
    ws.addRow(['PLACA', r.placaNorm])
    ws.addRow(['DESTINO', r.destino])
    ws.addRow(['MOTORISTA', r.motorista])
    ws.addRow(['AJUDANTE 1', r.ajudante1 ?? ''])
    ws.addRow(['AJUDANTE 2', r.ajudante2 ?? ''])
    ws.addRow(['PESO (KG)', r.pesoKg ?? ''])
    ws.addRow(['KM PERCORRIDO', r.kmPercorrido ?? ''])
    ws.addRow(['INÍCIO VIAGEM', fmtHora(r.inicioViagem)])
    ws.addRow(['FIM VIAGEM', fmtHora(r.fimViagem)])
    ws.addRow(['CLIENTES (ENT)', `${r.entRecebido} / ${r.entPlanejado ?? '—'}`])
    ws.addRow(['NF', `${r.nfRecebido} / ${r.nfPlanejado ?? '—'}`])
    const statusRow = ws.addRow(['STATUS', STATUS_LABEL[r.status]])
    pintaStatusCell(statusRow.getCell(2), r.status)
    ws.addRow([])

    const headerClientes = ws.addRow(['NF', 'CLIENTE', 'ENDEREÇO', 'CONFIRMADO GPS', 'CHEGADA', 'KM'])
    estilizaHeaderTabela(headerClientes)
    r.clientes.forEach((c, ci) => {
      const row = ws.addRow([
        c.nf,
        c.clienteNome,
        c.endereco ?? '',
        c.parada ? 'SIM' : 'NÃO',
        c.parada ? fmtHora(c.parada.chegada) : '',
        c.parada?.distanciaKm ?? '',
      ])
      if (ci % 2 === 1) {
        row.eachCell((cell, col) => { if (col < 4) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BG_ALT } } })
      }
      pintaConfirmacaoCell(row.getCell(4), c.parada !== null)
    })

    if (r.paradasSemCliente.length > 0) {
      ws.addRow([])
      const titulo = ws.addRow(['PARADAS SEM CLIENTE IDENTIFICADO'])
      titulo.font = { bold: true, size: 11, color: { argb: COR_DIVERGENTE_TXT } }
      const headerSemCliente = ws.addRow(['LOCAL', 'CHEGADA', 'KM'])
      estilizaHeaderTabela(headerSemCliente)
      r.paradasSemCliente.forEach((p, pi) => {
        const row = ws.addRow([p.localParada, fmtHora(p.chegada), p.distanciaKm ?? ''])
        if (pi % 2 === 1) {
          row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BG_ALT } } })
        }
      })
    }
  })

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
```

- [ ] **Step 2: Estender `gerador-romaneio-conferencia.test.ts` com as novas asserções**

Substituir o primeiro teste (`'gera aba Resumo + uma aba por placa...'`) por uma versão que também confere as colunas novas:

```ts
  it('gera aba Resumo + uma aba por placa, com cabeçalho de marca (logo + faixa azul)', async () => {
    const buf = await gerarRomaneioConferencia([base])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)

    const nomes = wb.worksheets.map(ws => ws.name)
    expect(nomes).toEqual(['Resumo', 'TTL7D40 (92593)'])

    expect(wb.model.media?.length).toBe(1)

    const resumo = wb.getWorksheet('Resumo')!
    const tituloResumo = resumo.getCell('A1')
    expect(String(tituloResumo.value)).toMatch(/ROMANEIO NUTRY/i)
    expect(tituloResumo.fill).toMatchObject({ fgColor: { argb: 'FF153C6B' } })
    expect(resumo.getImages()).toHaveLength(1)

    expect(resumo.getRow(3).values).toEqual([
      , 'CARGA', 'PLACA', 'DESTINO', 'PESO (KG)', 'CLIENTES', 'NFS', 'KM', 'PARADAS GPS', 'STATUS',
    ])
    const linha4 = resumo.getRow(4).values as unknown[]
    expect(linha4[1]).toBe('92593')
    expect((linha4[2] as { text: string }).text).toBe('TTL7D40')
    expect(linha4[3]).toBe('CAMPOS')
    expect(linha4[4]).toBe(2405)
    expect(linha4[5]).toBe('2/2')
    expect(linha4[6]).toBe('2/2')
    expect(linha4[7]).toBe(93.5)
    expect(linha4[8]).toBe(2)
    expect(linha4[9]).toBe('OK')

    const aba = wb.getWorksheet('TTL7D40 (92593)')!
    expect(aba.getImages()).toHaveLength(1)
    const linhas = aba.getSheetValues().filter(Boolean).map(r => (r as unknown[]).slice(1))
    expect(linhas).toContainEqual(['MOTORISTA', 'LUAN VIANA AREAS RIBEIRO'])
    expect(linhas).toContainEqual(['KM PERCORRIDO', 93.5])
    expect(linhas).toContainEqual(['INÍCIO VIAGEM', '05:07'])
    expect(linhas).toContainEqual(['FIM VIAGEM', '14:08'])
    expect(linhas).toContainEqual(['CLIENTES (ENT)', '2 / 2'])
    expect(linhas).toContainEqual(['NF', 'CLIENTE', 'ENDEREÇO', 'CONFIRMADO GPS', 'CHEGADA', 'KM'])
    expect(linhas).toContainEqual(['1', 'ANDRE LUIS SILVA VELASCO', 'RUA X, 1 - BAIRRO, CAMPOS - *', 'SIM', '10:00', 12.5])
    expect(linhas).toContainEqual(['2', 'M A SARDINHA', 'RUA Y, 2 - BAIRRO, CAMPOS - *', 'NÃO', '', ''])
  })
```

Adicionar 2 testes novos no fim do `describe`, antes do `})` final:

```ts
  it('cliente confirmado por GPS fica verde; sem confirmação fica âmbar', async () => {
    const buf = await gerarRomaneioConferencia([base])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const aba = wb.getWorksheet('TTL7D40 (92593)')!
    const rows = aba.getRows(1, aba.rowCount) ?? []
    const linhaConfirmada = rows.find(r => r.getCell(1).value === '1')!
    const linhaNaoConfirmada = rows.find(r => r.getCell(1).value === '2')!
    expect(linhaConfirmada.getCell(4).value).toBe('SIM')
    expect(linhaConfirmada.getCell(4).fill).toMatchObject({ fgColor: { argb: 'FFD1FAE5' } })
    expect(linhaNaoConfirmada.getCell(4).value).toBe('NÃO')
    expect(linhaNaoConfirmada.getCell(4).fill).toMatchObject({ fgColor: { argb: 'FFFEF3C7' } })
  })

  it('paradas sem cliente identificado aparecem numa seção à parte, só quando existem', async () => {
    const comSobra: RelatorioPlacaNutrimax = {
      ...base,
      paradasSemCliente: [{
        chegada: '2026-07-15T11:00:00.000Z', saida: '2026-07-15T11:10:00.000Z', distanciaKm: 5.2,
        localParada: '999999 - LOJA FANTASMA', codigoLoja: '999999', nomeLoja: 'LOJA FANTASMA',
      }],
    }
    const buf = await gerarRomaneioConferencia([comSobra])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const aba = wb.getWorksheet('TTL7D40 (92593)')!
    const linhas = aba.getSheetValues().filter(Boolean).map(r => (r as unknown[]).slice(1))
    expect(linhas).toContainEqual(['PARADAS SEM CLIENTE IDENTIFICADO'])
    expect(linhas).toContainEqual(['LOCAL', 'CHEGADA', 'KM'])
    expect(linhas).toContainEqual(['999999 - LOJA FANTASMA', '11:00', 5.2])

    const buf2 = await gerarRomaneioConferencia([base])
    const wb2 = new ExcelJS.Workbook()
    await wb2.xlsx.load(buf2 as unknown as ArrayBuffer)
    const aba2 = wb2.getWorksheet('TTL7D40 (92593)')!
    const linhas2 = aba2.getSheetValues().filter(Boolean).map(r => (r as unknown[]).slice(1))
    expect(linhas2).not.toContainEqual(['PARADAS SEM CLIENTE IDENTIFICADO'])
  })
```

O teste `'linha TOTAL no fim do Resumo soma o peso do dia'` (linhas 120-129 do arquivo original) continua válido sem alteração — o índice `totalRow[4]` (PESO) não mudou de posição. Os demais testes do arquivo original (`'duas cargas com a mesma placa...'`, `'relatório vazio...'`, `'Resumo tem cabeçalho travado...'`, `'aba de placa AUSENTE...'`) também ficam como estão — só o primeiro teste é substituído e 2 novos são adicionados no fim.

- [ ] **Step 3: Rodar os testes e o typecheck**

Run: `cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx vitest run src/lib/kpi-nutrimax/gerador-romaneio-conferencia.test.ts && npx tsc --noEmit`
Expected: todos os testes passam (7 casos), sem erros de tipo.

- [ ] **Step 4: Commit**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git add src/lib/kpi-nutrimax/gerador-romaneio-conferencia.ts src/lib/kpi-nutrimax/gerador-romaneio-conferencia.test.ts
git commit -m "feat(nutrimax): XLSX do romaneio ganha colunas de GPS (km, confirmação por cliente)

Aba Resumo com KM/PARADAS GPS, cabeçalho de cada placa com KM
PERCORRIDO/INÍCIO/FIM VIAGEM, tabela de clientes com CONFIRMADO GPS/
CHEGADA/KM (verde/âmbar), e seção de paradas sem cliente identificado."
```

---

### Task C: Rota exige e processa o 3º arquivo

**Files:**
- Modify: `src/app/api/kpi/nutrimax/romaneio/route.ts` (arquivo inteiro)

**Interfaces:**
- Consumes: `parseUnitracPdf(buf: Buffer): Promise<ResumoVeiculo[]>` de `@/lib/parsers/unitrac-pdf` (já usado em `src/app/api/kpi/nutrimax/gerar/route.ts`), `montaRelatorioPorPlaca` (assinatura de 3 parâmetros do Task A).
- Produces: resposta JSON `{ resumo, linhas, xlsxBase64, filename }` — `linhas[i]` agora inclui `kmPercorrido: number | null` e `qtdParadasReal: number`, consumidos pelo Task D.

- [ ] **Step 1: Reescrever `route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseEscalaNutrimax } from '@/lib/kpi-nutrimax/parse-escala'
import { parseRomaneioNutrimax } from '@/lib/kpi-nutrimax/parse-romaneio'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { montaRelatorioPorPlaca } from '@/lib/kpi-nutrimax/romaneio-conferencia'
import { gerarRomaneioConferencia } from '@/lib/kpi-nutrimax/gerador-romaneio-conferencia'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const form = await req.formData()
  const data = String(form.get('data') ?? '')
  const escalaFile = form.get('escala')
  const romaneioFile = form.get('romaneio')
  const relatorioFile = form.get('relatorio')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
  if (!(escalaFile instanceof File)) return new NextResponse('Escala de Rota (PDF) obrigatória', { status: 400 })
  if (!(romaneioFile instanceof File)) return new NextResponse('Romaneio de Entrega (PDF) obrigatório', { status: 400 })
  if (!(relatorioFile instanceof File)) return new NextResponse('Relatório Parada e Serviço (PDF) obrigatório', { status: 400 })

  const escalaBuf = Buffer.from(await escalaFile.arrayBuffer())
  const romaneioBuf = Buffer.from(await romaneioFile.arrayBuffer())
  const relatorioBuf = Buffer.from(await relatorioFile.arrayBuffer())

  const escala = await parseEscalaNutrimax(escalaBuf)
  if (escala.length === 0) {
    return new NextResponse('Nenhuma carga reconhecida na escala — confira se o PDF é a "Escala de Rota".', { status: 422 })
  }
  const romaneio = await parseRomaneioNutrimax(romaneioBuf)
  if (romaneio.length === 0) {
    return new NextResponse('Nenhum cliente reconhecido no romaneio — confira se o PDF é o "Romaneio de Entrega".', { status: 422 })
  }
  const resumosVeiculo = await parseUnitracPdf(relatorioBuf)
  if (resumosVeiculo.length === 0) {
    return new NextResponse('Nenhum veículo reconhecido no relatório — confira se o PDF é o "Relatório Parada e Serviço".', { status: 422 })
  }

  const relatorio = montaRelatorioPorPlaca(escala, romaneio, resumosVeiculo)
  const xlsxBuf = await gerarRomaneioConferencia(relatorio)

  const resumo = {
    total: relatorio.length,
    ok: relatorio.filter(r => r.status === 'ok').length,
    divergentes: relatorio.filter(r => r.status === 'divergente').length,
    ausentes: relatorio.filter(r => r.status === 'ausente').length,
    pesoTotalKg: relatorio.reduce((acc, r) => acc + (r.pesoKg ?? 0), 0),
  }

  // Prévia pra tela — sem a lista de clientes (isso fica só dentro do XLSX, evita
  // inflar o payload à toa).
  const linhas = relatorio.map(r => ({
    carga: r.carga,
    placa: r.placaNorm,
    destino: r.destino,
    motorista: r.motorista,
    pesoKg: r.pesoKg,
    nfPlanejado: r.nfPlanejado,
    nfRecebido: r.nfRecebido,
    entPlanejado: r.entPlanejado,
    entRecebido: r.entRecebido,
    kmPercorrido: r.kmPercorrido,
    qtdParadasReal: r.qtdParadasReal,
    status: r.status,
  }))

  return NextResponse.json({
    resumo,
    linhas,
    xlsxBase64: xlsxBuf.toString('base64'),
    filename: `Romaneio-Nutry-${data}.xlsx`,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx tsc --noEmit`
Expected: sem erros — nenhum teste de integração automatizado pra rota (mesmo padrão do resto do projeto; a cobertura de rota é o smoke test manual do Task E).

- [ ] **Step 3: Commit**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git add src/app/api/kpi/nutrimax/romaneio/route.ts
git commit -m "feat(nutrimax): rota do romaneio exige e processa o Relatório Parada e Serviço"
```

---

### Task D: Tela com o 3º upload e colunas de GPS na prévia

**Files:**
- Modify: `src/app/painel/nutrimax/romaneio/page.tsx` (arquivo inteiro)

**Interfaces:**
- Consumes: resposta da rota do Task C — `linhas[i].kmPercorrido: number | null`, `linhas[i].qtdParadasReal: number`.

- [ ] **Step 1: Reescrever `page.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, CalendarBlank, WarningCircle, FileArrowDown, Truck } from '@phosphor-icons/react/dist/ssr'
import { Badge, cn } from '@/components/ui'
import { FileDropzone } from '@/app/painel/file-dropzone'

type Resumo = { total: number; ok: number; divergentes: number; ausentes: number; pesoTotalKg: number }
type Tone = 'default' | 'success' | 'warning' | 'danger'
type StatusLinha = 'ok' | 'divergente' | 'ausente'
type Linha = {
  carga: string
  placa: string
  destino: string
  motorista: string
  pesoKg: number | null
  nfPlanejado: number | null
  nfRecebido: number
  entPlanejado: number | null
  entRecebido: number
  kmPercorrido: number | null
  qtdParadasReal: number
  status: StatusLinha
}
type Filtro = 'todas' | 'problemas' | 'ok'

function fmtKg(n: number): string {
  return `${n.toLocaleString('pt-BR')} kg`
}

export default function NutrimaxRomaneioPage() {
  const [escala, setEscala] = useState<File[]>([])
  const [romaneio, setRomaneio] = useState<File[]>([])
  const [relatorio, setRelatorio] = useState<File[]>([])
  const [data, setData] = useState('')
  const [pending, setPending] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [filtro, setFiltro] = useState<Filtro>('problemas')
  const [resultado, setResultado] = useState<{ xlsxBase64: string; filename: string } | null>(null)

  const pronto = escala.length > 0 && romaneio.length > 0 && relatorio.length > 0 && !!data

  async function processar() {
    if (!pronto) return
    setPending(true)
    setErro(null)
    setResumo(null)
    setLinhas([])
    setResultado(null)
    try {
      const fd = new FormData()
      fd.set('escala', escala[0])
      fd.set('romaneio', romaneio[0])
      fd.set('relatorio', relatorio[0])
      fd.set('data', data)
      const res = await fetch('/api/kpi/nutrimax/romaneio', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json() as { resumo: Resumo; linhas: Linha[]; xlsxBase64: string; filename: string }
      setResumo(json.resumo)
      setLinhas(json.linhas)
      setFiltro(json.resumo.divergentes + json.resumo.ausentes > 0 ? 'problemas' : 'todas')
      setResultado({ xlsxBase64: json.xlsxBase64, filename: json.filename })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado.')
    } finally {
      setPending(false)
    }
  }

  function baixar() {
    if (!resultado) return
    const bin = atob(resultado.xlsxBase64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = resultado.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const linhasFiltradas = useMemo(() => {
    if (filtro === 'todas') return linhas
    if (filtro === 'ok') return linhas.filter(l => l.status === 'ok')
    return linhas.filter(l => l.status !== 'ok')
  }, [linhas, filtro])

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <header className="mb-10 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          Nutry Max
        </span>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
          Gerar Romaneio
        </h1>
        <p className="mt-1 max-w-[60ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Suba a Escala de Rota, o Romaneio de Entrega e o Relatório Parada e Serviço do
          Unitrac. Confere cada placa da escala contra o romaneio e cruza com o GPS real
          (paradas, km, horários) — devolve um XLSX com uma aba de resumo e uma aba por placa.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="col-span-1 lg:col-span-7">
          <FileDropzone
            eyebrow="Passo 1"
            label="Escala de Rota"
            hint="PDF · o planejado (placa, destino, NFs previstos)"
            accept=".pdf"
            files={escala}
            onAdd={files => setEscala(files.slice(0, 1))}
            onRemove={() => setEscala([])}
          />
        </div>

        <div className="col-span-1 flex flex-col gap-4 lg:col-span-5">
          <FileDropzone
            eyebrow="Passo 2"
            label="Romaneio de Entrega"
            hint="PDF · o executado (cliente a cliente por carga)"
            accept=".pdf"
            files={romaneio}
            onAdd={files => setRomaneio(files.slice(0, 1))}
            onRemove={() => setRomaneio([])}
          />

          <FileDropzone
            eyebrow="Passo 3"
            label="Relatório Parada e Serviço"
            hint="PDF do Unitrac · paradas e km reais por placa"
            accept=".pdf"
            files={relatorio}
            onAdd={files => setRelatorio(files.slice(0, 1))}
            onRemove={() => setRelatorio([])}
          />

          <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
              <CalendarBlank size={12} weight="bold" />
              Passo 4 · Data de referência
            </div>
            <input
              id="data"
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              className="mt-1 w-full bg-transparent text-[24px] font-medium tracking-tight text-[var(--color-fg)] outline-none [color-scheme:light] dark:[color-scheme:dark]"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>
        </div>
      </section>

      {erro && (
        <div className="mt-6 flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-5 py-4">
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
          <p className="text-[13px] leading-relaxed text-[var(--color-danger-soft-fg)]">{erro}</p>
        </div>
      )}

      {resumo && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <CardResumo label="Total de cargas" valor={resumo.total} tone="default" />
          <CardResumo label="OK" valor={resumo.ok} tone="success" />
          <CardResumo label="Divergentes" valor={resumo.divergentes} tone="warning" />
          <CardResumo label="Ausentes" valor={resumo.ausentes} tone="danger" />
          <CardResumo label="Peso total" valor={fmtKg(resumo.pesoTotalKg)} tone="default" />
        </div>
      )}

      {resumo && (
        <div className="mt-6 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-3">
            <div className="flex items-center gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-fg)]">
                <Truck size={16} weight="fill" className="text-[var(--color-accent)]" />
                Cargas
              </h2>
              <FiltroChips filtro={filtro} setFiltro={setFiltro} resumo={resumo} />
            </div>
            {resultado && (
              <button
                type="button"
                onClick={baixar}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-navy-700)] px-4 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
              >
                <FileArrowDown size={14} weight="bold" />
                Baixar XLSX
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-left">
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Carga</th>
                  <th className="w-32 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Placa</th>
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Destino</th>
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Motorista</th>
                  <th className="w-24 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Peso</th>
                  <th className="w-24 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Clientes</th>
                  <th className="w-20 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">NFs</th>
                  <th className="w-20 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">KM</th>
                  <th className="w-24 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Paradas GPS</th>
                  <th className="w-32 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {linhasFiltradas.map(l => (
                  <tr
                    key={`${l.carga}-${l.placa}`}
                    className={cn(
                      'border-b border-[var(--color-border)] last:border-0',
                      l.status !== 'ok' && 'bg-[var(--color-warning-soft)]/20',
                    )}
                  >
                    <td className="px-4 py-1.5 text-numeric font-medium text-[var(--color-fg)]">{l.carga}</td>
                    <td className="px-4 py-1.5 text-numeric text-[var(--color-fg)]">{l.placa}</td>
                    <td className="px-4 py-1.5 text-[var(--color-fg)]">{l.destino}</td>
                    <td className="px-4 py-1.5 text-[var(--color-fg-muted)]">{l.motorista}</td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">
                      {l.pesoKg != null ? l.pesoKg.toLocaleString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">
                      {l.entRecebido}{l.entPlanejado != null ? `/${l.entPlanejado}` : ''}
                    </td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">
                      {l.nfRecebido}{l.nfPlanejado != null ? `/${l.nfPlanejado}` : ''}
                    </td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">
                      {l.kmPercorrido != null ? l.kmPercorrido.toLocaleString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-1.5 text-center text-numeric text-[var(--color-fg-muted)]">
                      {l.qtdParadasReal}
                    </td>
                    <td className="px-4 py-1.5 text-center">
                      <StatusBadge status={l.status} />
                    </td>
                  </tr>
                ))}
                {linhasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-[var(--color-fg-subtle)]">
                      Nenhuma carga nesse filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={processar}
        disabled={pending || !pronto}
        className={cn(
          'group relative mt-8 flex w-full items-center justify-between gap-4 overflow-hidden rounded-[var(--radius-card)] px-7 py-5 text-left transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.99]',
          pronto && !pending
            ? 'bg-[var(--color-navy-700)] text-white shadow-soft hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-10px_rgba(31,56,100,0.55)]'
            : pending
              ? 'bg-[var(--color-navy-700)] text-white'
              : 'cursor-not-allowed bg-[var(--color-bg-subtle)] border border-[var(--color-border)] text-[var(--color-fg-muted)]'
        )}
      >
        {pending && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 h-[3px] w-1/4 bg-white/80 animate-progress-sweep"
            style={{ filter: 'blur(0.3px)' }}
          />
        )}
        <div className="flex flex-col gap-1">
          <span className={cn('text-[11px] font-medium uppercase tracking-[0.18em]', pronto || pending ? 'text-white/60' : 'text-[var(--color-fg-muted)]')}>
            {pending ? 'Processando' : 'Conferir'}
          </span>
          <span className="text-[18px] font-semibold tracking-tight">
            {pending ? 'Cruzando escala, romaneio e GPS…' : pronto ? 'Gerar conferência' : 'Aguardando arquivos'}
          </span>
        </div>
        {!pending && pronto && (
          <ArrowRight size={22} weight="bold" className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
        )}
        {pending && (
          <span className="flex items-center gap-1.5" aria-hidden>
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" style={{ animationDelay: '0ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" style={{ animationDelay: '180ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" style={{ animationDelay: '360ms' }} />
          </span>
        )}
      </button>
    </div>
  )
}

function CardResumo({ label, valor, tone }: { label: string; valor: number | string; tone: Tone }) {
  const toneCls: Record<Tone, string> = {
    default: 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)]',
    success: 'border-transparent bg-[var(--color-success-soft)] text-[var(--color-success-soft-fg)]',
    warning: 'border-transparent bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-fg)]',
    danger: 'border-transparent bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-fg)]',
  }
  return (
    <div className={cn('rounded-xl border px-4 py-3 transition-colors', toneCls[tone])}>
      <div className="text-[22px] font-semibold leading-tight tracking-tight">{valor}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
    </div>
  )
}

function FiltroChips({ filtro, setFiltro, resumo }: { filtro: Filtro; setFiltro: (f: Filtro) => void; resumo: Resumo }) {
  const opts: { id: Filtro; label: string; count: number }[] = [
    { id: 'todas', label: 'Todas', count: resumo.total },
    { id: 'problemas', label: 'Com problema', count: resumo.divergentes + resumo.ausentes },
    { id: 'ok', label: 'OK', count: resumo.ok },
  ]
  return (
    <div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-0.5">
      {opts.map(o => {
        const active = filtro === o.id
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => setFiltro(o.id)}
            className={cn(
              'rounded-[4px] px-2 py-0.5 text-[11px] font-medium transition-colors',
              active
                ? 'bg-[var(--color-bg-elevated)] text-[var(--color-fg)] shadow-sm'
                : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
            )}
          >
            {o.label} <span className="text-[var(--color-fg-subtle)]">({o.count})</span>
          </button>
        )
      })}
    </div>
  )
}

function StatusBadge({ status }: { status: StatusLinha }) {
  const cfg: Record<StatusLinha, { label: string; variant: 'success' | 'warning' | 'danger' }> = {
    ok: { label: 'OK', variant: 'success' },
    divergente: { label: 'DIVERGENTE', variant: 'warning' },
    ausente: { label: 'AUSENTE', variant: 'danger' },
  }
  const c = cfg[status]
  return <Badge variant={c.variant}>{c.label}</Badge>
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git add src/app/painel/nutrimax/romaneio/page.tsx
git commit -m "feat(nutrimax): tela do romaneio ganha o 3º upload e colunas de KM/paradas GPS"
```

---

### Task E: Smoke test, sincronização e ship

**Files:** nenhum arquivo novo — validação end-to-end e sincronização com o repo `KPI transmonseg`.

- [ ] **Step 1: Rodar a suíte completa e o typecheck no `KPI TEMP`**

Run: `cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npx tsc --noEmit && npx vitest run`
Expected: typecheck limpo, todos os testes passando (o total sobe em relação aos 770 atuais, pelos casos novos do Task A e B).

- [ ] **Step 2: Smoke test autenticado via chrome-devtools-mcp**

1. Setar senha temporária de `teste@gmail.com` via API admin do Supabase (usar `SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_URL` de `.env.local`, mesmo script usado no smoke test do "Gerar KPI").
2. `npm run dev` em background.
3. Login como `teste@gmail.com`, navegar pra `/painel/nutrimax/romaneio`.
4. Confirmar via `take_snapshot` que a tela mostra Passo 1/2/3/4 (Escala, Romaneio, Relatório Parada e Serviço, Data), sem o botão de gerar habilitado.
5. Upload de `Escala 01-07.pdf`, `Romaneio 01-07.pdf` e `relatorio_50655.pdf` (mesmos arquivos usados no smoke test do Gerar KPI, em `~/Downloads/`), data `2026-07-01`.
6. Clicar em gerar, confirmar `200` via `list_network_requests`.
7. Conferir cards de resumo e a tabela de prévia (colunas KM/Paradas GPS aparecem e têm valores plausíveis).
8. Baixar o XLSX, inspecionar via script Node com ExcelJS (mesmo padrão do smoke test anterior): aba Resumo com 9 colunas, pelo menos uma aba de placa com as linhas `KM PERCORRIDO`/`INÍCIO VIAGEM`/`FIM VIAGEM` e a tabela de clientes com `CONFIRMADO GPS`/`CHEGADA`/`KM`.
9. Checar console por erros (`list_console_messages`).

- [ ] **Step 3: Limpar o ambiente**

```bash
rm -f ~/Downloads/Romaneio-Nutry-*.xlsx
pkill -f "next dev"
```

Rotacionar a senha de `teste@gmail.com` de volta pra um valor aleatório via o mesmo script do admin API (não printar a senha).

- [ ] **Step 4: Sincronizar com `KPI transmonseg`**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
git log --oneline -4   # os 4 commits das Tasks A-D
git diff <primeiro-commit-da-task-A>~1..HEAD > /tmp/nutrimax-romaneio-gps.patch

cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg"
git status --short     # confirmar working tree limpo antes de aplicar
git apply --check /tmp/nutrimax-romaneio-gps.patch && git apply /tmp/nutrimax-romaneio-gps.patch
npx tsc --noEmit && npx vitest run
git add -A
git commit -m "feat(nutrimax): romaneio cruza GPS real por código de loja (3º arquivo)

Escala + Romaneio + Relatório Parada e Serviço. Cada cliente do romaneio
casa com a parada GPS do mesmo código de loja — confirmação física além
da documental, com km, paradas reais e horários de viagem por carga."
rm -f /tmp/nutrimax-romaneio-gps.patch
```

- [ ] **Step 5: Confirmar e enviar**

Perguntar ao usuário via `AskUserQuestion` se pode dar `git push` nos dois repos, mostrando o resumo do smoke test (status HTTP, contagem de cargas, confirmações GPS encontradas). Só rodar `git push` em cada repo após confirmação explícita.
