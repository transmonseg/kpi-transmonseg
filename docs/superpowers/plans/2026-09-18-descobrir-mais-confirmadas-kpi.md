# Descobrir como aumentar as NFs confirmadas do KPI Nutry Max — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Descobrir, com medição offline e sem mexer no comportamento de produção, se a regra de "parada órfã" (parada real do caminhão que nenhuma NF confirmada reivindicou) consegue elevar a taxa de NFs confirmadas de ~92,5% para ≥94% sem aumentar as falsas confirmações — e, em paralelo, reduzir as falhas de geração limitando a concorrência por placa.

**Architecture:** Trilha A (descoberta): um dump JSON por dia reprocessado (linhas + paradas por placa), analisado por funções puras e testadas (`experimentos/`), avaliadas contra o gabarito manual da Ana e contra uma amostra que a própria Ana valida; termina num portão de decisão GO/NO-GO por escrito. Trilha B (confiabilidade): um helper `mapComLimite` que limita a concorrência das consultas por placa no gerador, com métrica de antes/depois no log do PostgREST.

**Tech Stack:** TypeScript, Vitest, tsx, `ssh transmonseg-vps` (rodar o gerador com o `.env.production`), WhatsApp bridge (`contabo-joaquim`) para baixar os PDFs dos dias.

**Spec:** não há spec de brainstorming — o plano nasce da análise de 18/09/2026 (bloco "Diagnóstico de partida" abaixo). Decisões tomadas sem spec são provisórias.

## Global Constraints

- As Tasks 1–4 NÃO mudam o comportamento de produção: só criam arquivos novos, mais um bloco opcional (`EXPORTAR_DUMP`) no script `scripts/gerar-nutrimax-real-arquivo.ts`, que roda offline. Nenhum build/restart do app na Trilha A.
- Só a Task 5 muda produção. Só deployar (`git pull && npm run build && pm2 restart kpi-transmonseg` no `transmonseg-vps`) com o OK do usuário.
- Métrica de sucesso = taxa identificada, definição da Ana: `(NFs com status ≠ pendente) / total`, isto é, CONFIRMADO (UNITRAC) + CONFIRMADO (GPS) + ENTREGUE-com-ressalva.
- Guardrail anti-Goodhart: subir o número não vale se subir a falsa confirmação. Toda regra nova é medida contra o gabarito da Ana (`sem_evidencia` com órfã = falso confirmado) e contra uma amostra validada por ela.
- Nunca mandar nada para o grupo do WhatsApp sem o usuário confirmar o texto exato. Quem envia o CSV para a Ana é o usuário.
- Todo commit de código no repo `KPI transmonseg` é espelhado no `KPI TEMP` (`/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP`), e os dois são pushados juntos.
- Toda mensagem de commit termina com estas duas linhas:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01ATqZgryoxRsTeXXM3HR8M7
  ```
- Baseline de testes no início: 1100 passando. Nenhum teste existente pode regredir.

## Diagnóstico de partida (dados de 18/09)

**Série da taxa identificada** (definição da Ana; 10/09 e 11/09 recalculei e bati exatamente com a planilha dela):

| Dia | NFs | Taxa | Obs |
|---|---|---|---|
| 01/09 | 2235 | 79,8% | base |
| 09/09 | 2361 | 90,3% | |
| 10/09 | 2180 | 89,2% | |
| 11/09 | 2224 | 84,3% | |
| 14/09 | 825 | 82,4% | volume pequeno, 37 NFs sem GPS |
| 15/09 | 2293 | 86,1% | |
| 16/09 | 1978 | 91,4% | |
| 17/09 | 2058 | 92,5% | |

**Onde está a perda (17/09, 154 pendentes = 7,5%):** coordenada imprecisa 75 (48,7%), parada 500m–2km fora do endereço 33 (21,4%), não foi ao cliente + sem confirmação 28 (18,2%), passou sem parar 15 (9,7%), ilha 3 (1,9%).

**Gabarito manual da Ana (31 linhas auditadas em 10–17/09, amostra pequena, não estatística):** 19 eram entregas reais que o sistema não casou (16 com a parada na rua/esquina/lateral, fora do endereço cadastrado; 3 com coordenada errada/ambígua), 8 sem evidência de parada, 2 indeterminadas, 1 rótulo já correto, 1 sem observação. Teto plausível de ganho: ~2/3 dos pendentes, ou seja, +4 a +5 pontos.

**Efeito dos alvos da Unitrac (medido):** reprocessar o dia 17 hoje, sem os alvos (a Unitrac só os serve no próprio dia), dá 86,9% contra 92,5% da produção. Regerar um dia passado perde ~5,6 pontos. Nosso GPS sozinho (ponte, sem alvos nem paradas da Unitrac) dá 86,4%.

**Hipótese central desta trilha:** as 33 "parada 500m–2km" e boa parte das "coordenada imprecisa" são entregas reais cuja parada ficou "órfã" (nenhuma NF confirmada a reivindicou). Se uma parada real, sem dono, está perto de uma NF pendente da mesma placa, a chance de ser a entrega dela é alta. Esta trilha mede quanto e com que precisão.

**Limitação assumida:** reprocessar dias passados não tem os alvos da Unitrac, então todos os dias reprocessados estão no cenário "sem alvos" (mais pendentes que a produção). A análise mede "dos pendentes do GPS-só, quantos têm uma parada órfã por perto", que é também o cenário das regerações. Os dias >48 h (09/09 e 11/09) usam só a ponte de GPS.

## Estrutura de arquivos

- Create: `src/lib/kpi-romaneio/experimentos/tipos.ts` — tipos do dump.
- Create: `src/lib/kpi-romaneio/experimentos/dump.ts` (+ `dump.test.ts`) — monta o dump a partir dos objetos do pipeline.
- Create: `src/lib/kpi-romaneio/experimentos/paradas-orfas.ts` (+ `paradas-orfas.test.ts`) — acha paradas órfãs e mede quantos pendentes têm uma por perto.
- Create: `src/lib/kpi-romaneio/experimentos/gabarito.ts` (+ `gabarito.test.ts`) — avalia contra o gabarito da Ana.
- Create: `docs/superpowers/experimentos/gabarito-ana-2026-09.json` — rótulos da Ana.
- Create: `scripts/exp-paradas-orfas.ts` — CLI que imprime a análise e gera o CSV de candidatas.
- Modify: `scripts/gerar-nutrimax-real-arquivo.ts` — exporta o dump quando `EXPORTAR_DUMP` está definida.
- Create: `src/lib/kpi-romaneio/concorrencia.ts` (+ `concorrencia.test.ts`) — `mapComLimite`.
- Modify: `src/lib/kpi-romaneio/constants.ts` — `LIMITE_CONCORRENCIA_PLACAS`.
- Modify: `src/app/api/kpi/nutrimax/gerar/route.ts:307` e `:332` — troca os dois `Promise.all` por placa.

---

### Task 1: Dump de experimento (tipos + montagem + export no script)

**Files:**
- Create: `src/lib/kpi-romaneio/experimentos/tipos.ts`
- Create: `src/lib/kpi-romaneio/experimentos/dump.ts`
- Test: `src/lib/kpi-romaneio/experimentos/dump.test.ts`
- Modify: `scripts/gerar-nutrimax-real-arquivo.ts` (import + bloco depois da linha 254, o `.sort(...)` de `detalhe`)

**Interfaces:**
- Consome: `LinhaGeocodificada`, `LinhaDetalheEntrega` de `../types`; `UnitracParadaRow` de `@/lib/kpi/matcher`.
- Produz: `LinhaDump`, `DumpExperimento` (tipos) e `montarDumpExperimento(params: { data: string; romaneioGeo: LinhaGeocodificada[]; detalhe: LinhaDetalheEntrega[]; paradasPorPlaca: Map<string, UnitracParadaRow[]> }): DumpExperimento`.

- [ ] **Step 1: Criar os tipos**

`src/lib/kpi-romaneio/experimentos/tipos.ts`:

```ts
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { LinhaDetalheEntrega } from '../types'

export type LinhaDump = {
  nf: string
  carga: string
  placa: string
  clienteNome: string
  endereco: string
  lat: number | null
  lng: number | null
  geoConfiavel: boolean
  geoMotivo: string | null
  status: LinhaDetalheEntrega['status']
  observacao: string | null
}

export type DumpExperimento = {
  data: string
  linhas: LinhaDump[]
  paradasPorPlaca: Record<string, UnitracParadaRow[]>
}
```

- [ ] **Step 2: Escrever o teste que falha**

`src/lib/kpi-romaneio/experimentos/dump.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { LinhaDetalheEntrega, LinhaGeocodificada } from '../types'
import { montarDumpExperimento } from './dump'

function geo(o: Partial<LinhaGeocodificada>): LinhaGeocodificada {
  return {
    carga: '100', destino: 'X', placa: 'ABC-1234', motorista: 'M', ajudantes: [],
    nf: 'NF1', clienteCodigo: 'C1', clienteNome: 'CLIENTE 1', endereco: 'RUA A, 1 - RJ',
    lat: -22.9, lng: -43.2, ...o,
  }
}

function det(o: Partial<LinhaDetalheEntrega>): LinhaDetalheEntrega {
  return {
    carga: '100', placa: 'ABC1234', motorista: 'M', clienteCodigo: 'C1', nf: 'NF1',
    clienteNome: 'CLIENTE 1', endereco: 'RUA A, 1 - RJ', saidaCd: null, chegadaCd: null,
    tempoOperacaoMin: null, chegada: null, saida: null, tempoParadaMin: null,
    status: 'pendente', temRastreador: true, observacao: null, ...o,
  }
}

function parada(id: string): UnitracParadaRow {
  return {
    id, placa_norm: 'ABC1234', chegada: '2026-09-17T13:00:00.000Z', saida: '2026-09-17T13:10:00.000Z',
    fim_real: '2026-09-17T13:10:00.000Z', duracao_seg: 600, local_parada: 'RUA', codigo_loja: null,
    nome_loja: null, lat: -22.9, lng: -43.2, endereco: null, classificacao: 'FORA_BASE', ordem: 1,
  }
}

describe('montarDumpExperimento', () => {
  it('junta a linha geocodificada com o veredito do detalhe, pela chave carga+NF, usando a placa normalizada do detalhe', () => {
    const dump = montarDumpExperimento({
      data: '2026-09-17',
      romaneioGeo: [geo({ nf: 'NF1', placa: 'ABC-1234' })],
      detalhe: [det({ nf: 'NF1', status: 'confirmado_gps', observacao: 'x' })],
      paradasPorPlaca: new Map([['ABC1234', [parada('p1')]]]),
    })
    expect(dump.data).toBe('2026-09-17')
    expect(dump.linhas).toHaveLength(1)
    expect(dump.linhas[0]).toMatchObject({ nf: 'NF1', placa: 'ABC1234', status: 'confirmado_gps', observacao: 'x', lat: -22.9, geoConfiavel: true, geoMotivo: null })
    expect(dump.paradasPorPlaca['ABC1234']).toHaveLength(1)
  })

  it('descarta linha do romaneio sem detalhe correspondente e só leva as paradas das placas presentes', () => {
    const dump = montarDumpExperimento({
      data: '2026-09-17',
      romaneioGeo: [geo({ nf: 'NF1' }), geo({ nf: 'NF2', carga: '999' })],
      detalhe: [det({ nf: 'NF1' })],
      paradasPorPlaca: new Map([['ABC1234', [parada('p1')]], ['OUTRA99', [parada('p2')]]]),
    })
    expect(dump.linhas.map(l => l.nf)).toEqual(['NF1'])
    expect(Object.keys(dump.paradasPorPlaca)).toEqual(['ABC1234'])
  })

  it('preserva geoConfiavel=false e o motivo', () => {
    const dump = montarDumpExperimento({
      data: '2026-09-17',
      romaneioGeo: [geo({ nf: 'NF1', geoConfiavel: false, geoMotivo: 'bairro_divergente' })],
      detalhe: [det({ nf: 'NF1' })],
      paradasPorPlaca: new Map(),
    })
    expect(dump.linhas[0].geoConfiavel).toBe(false)
    expect(dump.linhas[0].geoMotivo).toBe('bairro_divergente')
    expect(dump.paradasPorPlaca['ABC1234']).toEqual([])
  })
})
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `npx vitest run src/lib/kpi-romaneio/experimentos/dump.test.ts`
Expected: FAIL (`Failed to resolve import "./dump"`).

- [ ] **Step 4: Implementar**

`src/lib/kpi-romaneio/experimentos/dump.ts`:

```ts
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { LinhaDetalheEntrega, LinhaGeocodificada } from '../types'
import type { DumpExperimento, LinhaDump } from './tipos'

/** Foto do dia depois do pipeline: uma linha por NF (coordenada + veredito) e as
 *  paradas de cada placa do romaneio. E' a entrada das analises offline de
 *  `experimentos/` -- nao muda nada do relatorio. */
export function montarDumpExperimento(params: {
  data: string
  romaneioGeo: LinhaGeocodificada[]
  detalhe: LinhaDetalheEntrega[]
  paradasPorPlaca: Map<string, UnitracParadaRow[]>
}): DumpExperimento {
  const detalhePorChave = new Map(params.detalhe.map(d => [`${d.carga}::${d.nf}`, d]))
  const linhas: LinhaDump[] = []
  for (const l of params.romaneioGeo) {
    const d = detalhePorChave.get(`${l.carga}::${l.nf}`)
    if (!d) continue
    linhas.push({
      nf: l.nf,
      carga: l.carga,
      placa: d.placa,
      clienteNome: l.clienteNome,
      endereco: l.endereco,
      lat: l.lat,
      lng: l.lng,
      geoConfiavel: l.geoConfiavel !== false,
      geoMotivo: l.geoMotivo ?? null,
      status: d.status,
      observacao: d.observacao,
    })
  }
  const paradasPorPlaca: Record<string, UnitracParadaRow[]> = {}
  for (const placa of new Set(linhas.map(l => l.placa))) {
    paradasPorPlaca[placa] = params.paradasPorPlaca.get(placa) ?? []
  }
  return { data: params.data, linhas, paradasPorPlaca }
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `npx vitest run src/lib/kpi-romaneio/experimentos/dump.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 6: Exportar o dump no script do gerador**

Em `scripts/gerar-nutrimax-real-arquivo.ts`, adicionar o import junto dos outros (perto da linha 24):

```ts
import { montarDumpExperimento } from '../src/lib/kpi-romaneio/experimentos/dump'
```

E logo depois do `.sort(...)` que fecha `const detalhe` (linha 254), antes de `const cargasRomaneioList`:

```ts
  if (process.env.EXPORTAR_DUMP) {
    writeFileSync(process.env.EXPORTAR_DUMP, JSON.stringify(montarDumpExperimento({ data, romaneioGeo, detalhe, paradasPorPlaca })))
    console.log(`Dump de experimento salvo em: ${process.env.EXPORTAR_DUMP}`)
  }
```

- [ ] **Step 7: Conferir tipos e suíte**

Run: `npx tsc --noEmit 2>&1 | grep -E "experimentos|gerar-nutrimax-real-arquivo"` (Expected: sem saída) e `npm test` (Expected: tudo passando, 1103 testes).

- [ ] **Step 8: Commit (e espelhar no KPI TEMP)**

```bash
git add src/lib/kpi-romaneio/experimentos/tipos.ts src/lib/kpi-romaneio/experimentos/dump.ts src/lib/kpi-romaneio/experimentos/dump.test.ts scripts/gerar-nutrimax-real-arquivo.ts
git commit -m "$(cat <<'EOF'
feat(kpi-experimentos): dump do dia (linhas + paradas) exportável pelo script do gerador

Base das análises offline pra descobrir como aumentar as NFs confirmadas.
Não muda o relatório nem a produção.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ATqZgryoxRsTeXXM3HR8M7
EOF
)"
```

---

### Task 2: Análise de paradas órfãs

**Files:**
- Create: `src/lib/kpi-romaneio/experimentos/paradas-orfas.ts`
- Test: `src/lib/kpi-romaneio/experimentos/paradas-orfas.test.ts`

**Interfaces:**
- Consome: `DumpExperimento`, `LinhaDump` (Task 1); `haversine(lat1, lng1, lat2, lng2): number` (metros) de `@/lib/utils/geo`; `UnitracParadaRow` de `@/lib/kpi/matcher`.
- Produz: `ParametrosOrfas = { duracaoMinSeg: number; raioReivindicadaM: number }`; `categoriaPendente(observacao: string | null): string`; `paradasOrfasDaPlaca(dump, placa, p): UnitracParadaRow[]`; `orfasProximasDoPendente(dump, linha, p, raioM): { parada: UnitracParadaRow; distanciaM: number }[]` (ordenado por distância); `analisarParadasOrfas(dump, raiosM: number[], p): AnaliseOrfas`.

Definição: uma parada é **órfã** quando é FORA_BASE, tem duração ≥ `duracaoMinSeg` e nenhuma NF confirmada (status ≠ pendente) da mesma placa está a ≤ `raioReivindicadaM` dela.

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/kpi-romaneio/experimentos/paradas-orfas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { DumpExperimento, LinhaDump } from './tipos'
import { analisarParadasOrfas, categoriaPendente, orfasProximasDoPendente, paradasOrfasDaPlaca } from './paradas-orfas'

const P = { duracaoMinSeg: 120, raioReivindicadaM: 800 }

function linha(o: Partial<LinhaDump>): LinhaDump {
  return {
    nf: 'NF', carga: '100', placa: 'ABC1234', clienteNome: 'C', endereco: 'RUA', lat: -22.9, lng: -43.2,
    geoConfiavel: true, geoMotivo: null, status: 'pendente', observacao: null, ...o,
  }
}

function parada(id: string, lat: number, lng: number, duracaoSeg = 600): UnitracParadaRow {
  return {
    id, placa_norm: 'ABC1234', chegada: '2026-09-17T13:00:00.000Z', saida: '2026-09-17T13:10:00.000Z',
    fim_real: '2026-09-17T13:10:00.000Z', duracao_seg: duracaoSeg, local_parada: 'RUA', codigo_loja: null,
    nome_loja: null, lat, lng, endereco: null, classificacao: 'FORA_BASE', ordem: 1,
  }
}

// 0,001 grau de latitude ~ 111 m.
const CONFIRMADA = linha({ nf: 'C1', status: 'confirmado_gps', lat: -22.9, lng: -43.2 })
const S_DA_CONFIRMADA = parada('S1', -22.9, -43.2)        // reivindicada pela C1
const S_ORFA = parada('S2', -22.91, -43.2)                // ~1112 m da C1 -> orfa
const S_CURTA = parada('S3', -22.9105, -43.2, 60)         // orfa mas curta demais
const PEND_PERTO = linha({ nf: 'P1', lat: -22.9108, lng: -43.2, observacao: 'PARADA PRÓXIMA (500m-2km) MAS FORA DO ENDEREÇO - CONFERIR' }) // ~89 m de S2
const PEND_LONGE = linha({ nf: 'P2', lat: -22.95, lng: -43.2 })                                                                               // ~4,4 km de S2

function dump(linhas: LinhaDump[], paradas: UnitracParadaRow[]): DumpExperimento {
  return { data: '2026-09-17', linhas, paradasPorPlaca: { ABC1234: paradas } }
}

describe('paradasOrfasDaPlaca', () => {
  it('só devolve parada FORA_BASE, longa o bastante e sem NF confirmada por perto', () => {
    const base = { ...parada('B', -22.95, -43.25), classificacao: 'BASE' as const }
    const d = dump([CONFIRMADA, PEND_PERTO], [S_DA_CONFIRMADA, S_ORFA, S_CURTA, base])
    expect(paradasOrfasDaPlaca(d, 'ABC1234', P).map(s => s.id)).toEqual(['S2'])
  })
})

describe('orfasProximasDoPendente', () => {
  it('respeita o raio e ordena por distância', () => {
    const d = dump([CONFIRMADA, PEND_PERTO], [S_ORFA])
    expect(orfasProximasDoPendente(d, PEND_PERTO, P, 500).map(x => x.parada.id)).toEqual(['S2'])
    expect(orfasProximasDoPendente(d, PEND_LONGE, P, 500)).toEqual([])
  })

  it('pendente sem coordenada nunca tem órfã', () => {
    const d = dump([CONFIRMADA], [S_ORFA])
    expect(orfasProximasDoPendente(d, linha({ nf: 'PX', lat: null, lng: null }), P, 5000)).toEqual([])
  })
})

describe('analisarParadasOrfas', () => {
  it('conta pendentes com órfã por raio e agrupa por categoria', () => {
    const d = dump([CONFIRMADA, PEND_PERTO, PEND_LONGE], [S_DA_CONFIRMADA, S_ORFA])
    const a = analisarParadasOrfas(d, [500, 5000], P)
    expect(a.totalNfs).toBe(3)
    expect(a.identificadas).toBe(1)
    expect(a.taxaIdentificada).toBeCloseTo(1 / 3)
    expect(a.pendentes).toBe(2)
    expect(a.orfasTotal).toBe(1)
    expect(a.porRaio[0].raioM).toBe(500)
    expect(a.porRaio[0].comOrfa).toBe(1)
    expect(a.porRaio[0].porCategoria['parada 500m-2km']).toEqual({ pendentes: 1, comOrfa: 1 })
    expect(a.porRaio[0].porCategoria['sem confirmação']).toEqual({ pendentes: 1, comOrfa: 0 })
    expect(a.porRaio[1].comOrfa).toBe(2)
  })

  it('exclusiva = a órfã mais próxima do pendente também tem ele como pendente mais próximo', () => {
    const outro = linha({ nf: 'P1b', lat: -22.9125, lng: -43.2 }) // ~167 m de S2, mais longe que P1
    const d = dump([CONFIRMADA, PEND_PERTO, outro], [S_ORFA])
    const r = analisarParadasOrfas(d, [500], P).porRaio[0]
    expect(r.comOrfa).toBe(2)
    expect(r.comOrfaExclusiva).toBe(1)
  })

  it('pendente sem coordenada entra em pendentesSemCoordenada e nunca em comOrfa', () => {
    const d = dump([CONFIRMADA, linha({ nf: 'PX', lat: null, lng: null })], [S_ORFA])
    const a = analisarParadasOrfas(d, [5000], P)
    expect(a.pendentesSemCoordenada).toBe(1)
    expect(a.porRaio[0].comOrfa).toBe(0)
  })
})

describe('categoriaPendente', () => {
  it('mapeia as observações do relatório', () => {
    expect(categoriaPendente(null)).toBe('sem confirmação')
    expect(categoriaPendente('ENDEREÇO COM COORDENADA IMPRECISA - CONFERIR CADASTRO')).toBe('coordenada imprecisa')
    expect(categoriaPendente('PARADA PRÓXIMA (500m-2km) MAS FORA DO ENDEREÇO - CONFERIR')).toBe('parada 500m-2km')
    expect(categoriaPendente('NÃO FOI AO CLIENTE (caminhão não esteve na região)')).toBe('não foi ao cliente')
    expect(categoriaPendente('PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR')).toBe('passou sem parar')
    expect(categoriaPendente('CLIENTE SEM ACESSO RODOVIÁRIO (ILHA) - CONFERIR COM A OPERAÇÃO')).toBe('ilha')
    expect(categoriaPendente('OUTRA COISA')).toBe('outra')
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/lib/kpi-romaneio/experimentos/paradas-orfas.test.ts`
Expected: FAIL (`Failed to resolve import "./paradas-orfas"`).

- [ ] **Step 3: Implementar**

`src/lib/kpi-romaneio/experimentos/paradas-orfas.ts`:

```ts
import { haversine } from '@/lib/utils/geo'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { DumpExperimento, LinhaDump } from './tipos'

export type ParametrosOrfas = {
  /** parada mais curta que isso (segundos) nao conta */
  duracaoMinSeg: number
  /** parada a ate' esta distancia (m) de uma NF confirmada da mesma placa ja' tem dono */
  raioReivindicadaM: number
}

export type ResultadoRaio = {
  raioM: number
  comOrfa: number
  comOrfaExclusiva: number
  porCategoria: Record<string, { pendentes: number; comOrfa: number }>
}

export type AnaliseOrfas = {
  data: string
  totalNfs: number
  identificadas: number
  taxaIdentificada: number
  pendentes: number
  pendentesSemCoordenada: number
  orfasTotal: number
  porRaio: ResultadoRaio[]
}

export function categoriaPendente(observacao: string | null): string {
  if (observacao == null) return 'sem confirmação'
  if (observacao.startsWith('ENDEREÇO COM COORDENADA IMPRECISA')) return 'coordenada imprecisa'
  if (observacao.startsWith('PARADA PRÓXIMA (500m-2km)')) return 'parada 500m-2km'
  if (observacao.startsWith('NÃO FOI AO CLIENTE')) return 'não foi ao cliente'
  if (observacao.startsWith('PASSOU NO ENDEREÇO')) return 'passou sem parar'
  if (observacao.startsWith('CLIENTE SEM ACESSO')) return 'ilha'
  return 'outra'
}

export function paradasOrfasDaPlaca(dump: DumpExperimento, placa: string, p: ParametrosOrfas): UnitracParadaRow[] {
  const confirmadas = dump.linhas.filter(
    (l): l is LinhaDump & { lat: number; lng: number } => l.placa === placa && l.status !== 'pendente' && l.lat != null && l.lng != null,
  )
  return (dump.paradasPorPlaca[placa] ?? []).filter(s =>
    s.classificacao === 'FORA_BASE' &&
    s.lat != null && s.lng != null &&
    (s.duracao_seg ?? 0) >= p.duracaoMinSeg &&
    !confirmadas.some(c => haversine(s.lat as number, s.lng as number, c.lat, c.lng) <= p.raioReivindicadaM),
  )
}

export function orfasProximasDoPendente(
  dump: DumpExperimento, linha: LinhaDump, p: ParametrosOrfas, raioM: number,
): { parada: UnitracParadaRow; distanciaM: number }[] {
  if (linha.lat == null || linha.lng == null) return []
  const { lat, lng } = linha
  return paradasOrfasDaPlaca(dump, linha.placa, p)
    .map(parada => ({ parada, distanciaM: haversine(parada.lat as number, parada.lng as number, lat, lng) }))
    .filter(x => x.distanciaM <= raioM)
    .sort((a, b) => a.distanciaM - b.distanciaM)
}

export function analisarParadasOrfas(dump: DumpExperimento, raiosM: number[], p: ParametrosOrfas): AnaliseOrfas {
  const pendentes = dump.linhas.filter(l => l.status === 'pendente')
  const comCoord = pendentes.filter(l => l.lat != null && l.lng != null)
  let orfasTotal = 0
  for (const placa of new Set(dump.linhas.map(l => l.placa))) orfasTotal += paradasOrfasDaPlaca(dump, placa, p).length

  const porRaio = raiosM.map((raioM): ResultadoRaio => {
    // pendente mais proximo de cada parada orfa, pra medir exclusividade
    const melhorDist = new Map<string, number>()
    const donoDaOrfa = new Map<string, string>()
    for (const l of comCoord) {
      for (const { parada, distanciaM } of orfasProximasDoPendente(dump, l, p, raioM)) {
        const k = `${l.placa}|${parada.id}`
        const atual = melhorDist.get(k)
        if (atual === undefined || distanciaM < atual) {
          melhorDist.set(k, distanciaM)
          donoDaOrfa.set(k, l.nf)
        }
      }
    }
    const porCategoria: ResultadoRaio['porCategoria'] = {}
    let comOrfa = 0
    let comOrfaExclusiva = 0
    for (const l of pendentes) {
      const cat = categoriaPendente(l.observacao)
      const c = (porCategoria[cat] ??= { pendentes: 0, comOrfa: 0 })
      c.pendentes++
      const proximas = orfasProximasDoPendente(dump, l, p, raioM)
      if (proximas.length === 0) continue
      comOrfa++
      c.comOrfa++
      if (donoDaOrfa.get(`${l.placa}|${proximas[0].parada.id}`) === l.nf) comOrfaExclusiva++
    }
    return { raioM, comOrfa, comOrfaExclusiva, porCategoria }
  })

  const identificadas = dump.linhas.filter(l => l.status !== 'pendente').length
  return {
    data: dump.data,
    totalNfs: dump.linhas.length,
    identificadas,
    taxaIdentificada: dump.linhas.length === 0 ? 0 : identificadas / dump.linhas.length,
    pendentes: pendentes.length,
    pendentesSemCoordenada: pendentes.length - comCoord.length,
    orfasTotal,
    porRaio,
  }
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/lib/kpi-romaneio/experimentos/paradas-orfas.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit (e espelhar no KPI TEMP)**

```bash
git add src/lib/kpi-romaneio/experimentos/paradas-orfas.ts src/lib/kpi-romaneio/experimentos/paradas-orfas.test.ts
git commit -m "$(cat <<'EOF'
feat(kpi-experimentos): análise de paradas órfãs (parada real sem NF confirmada por perto)

Mede quantos pendentes têm uma parada órfã da mesma placa por perto, por raio
e por categoria. Análise offline, não muda a produção.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ATqZgryoxRsTeXXM3HR8M7
EOF
)"
```

---

### Task 3: Gabarito da Ana + avaliação + CLI

**Files:**
- Create: `docs/superpowers/experimentos/gabarito-ana-2026-09.json`
- Create: `src/lib/kpi-romaneio/experimentos/gabarito.ts`
- Test: `src/lib/kpi-romaneio/experimentos/gabarito.test.ts`
- Create: `scripts/exp-paradas-orfas.ts`

**Interfaces:**
- Consome: `analisarParadasOrfas`, `orfasProximasDoPendente`, `categoriaPendente`, `ParametrosOrfas` (Task 2); `DumpExperimento` (Task 1); `RAIO_CONFIRMACAO_AMPLIADO_METROS` de `../src/lib/kpi-romaneio/constants` (800).
- Produz: `RotuloGabarito = { data: string; nf: string; veredito: 'entregue' | 'sem_evidencia'; fonte: string }`; `avaliarContraGabarito(dumps, gabarito, p, raioM): AvaliacaoGabarito`.

- [ ] **Step 1: Criar o gabarito**

`docs/superpowers/experimentos/gabarito-ana-2026-09.json` (rótulos extraídos das planilhas de análise da Ana enviadas no grupo KPI AJUSTES; `entregue` = ela confirmou a entrega, `sem_evidencia` = ela não achou parada/passagem):

```json
[
  { "data": "2026-09-10", "nf": "2364486", "veredito": "entregue", "fonte": "stop na rua com 5 minutos" },
  { "data": "2026-09-10", "nf": "2364489", "veredito": "entregue", "fonte": "stop na esquina com 3 minutos" },
  { "data": "2026-09-10", "nf": "2364544", "veredito": "entregue", "fonte": "stop de 10 minutos na rua" },
  { "data": "2026-09-10", "nf": "2364545", "veredito": "entregue", "fonte": "stop de 4 minutos na rua" },
  { "data": "2026-09-10", "nf": "2364546", "veredito": "entregue", "fonte": "stop de 4 minutos na rua" },
  { "data": "2026-09-10", "nf": "2364547", "veredito": "entregue", "fonte": "stop 4 minutos na rua lateral" },
  { "data": "2026-09-10", "nf": "2365031", "veredito": "entregue", "fonte": "stop na rua com 3 minutos" },
  { "data": "2026-09-10", "nf": "2364509", "veredito": "sem_evidencia", "fonte": "sem stop no sistema" },
  { "data": "2026-09-10", "nf": "2364543", "veredito": "sem_evidencia", "fonte": "sem stop no sistema" },
  { "data": "2026-09-10", "nf": "2364574", "veredito": "sem_evidencia", "fonte": "sem stop no sistema" },
  { "data": "2026-09-10", "nf": "2364575", "veredito": "sem_evidencia", "fonte": "sem stop no sistema" },
  { "data": "2026-09-10", "nf": "2364576", "veredito": "sem_evidencia", "fonte": "sem stop no sistema" },
  { "data": "2026-09-15", "nf": "2371610", "veredito": "entregue", "fonte": "parada de 9 minutos na rua da frente" },
  { "data": "2026-09-15", "nf": "2371612", "veredito": "entregue", "fonte": "parada de 9 minutos na rua do cliente" },
  { "data": "2026-09-15", "nf": "2371617", "veredito": "entregue", "fonte": "clientes no mesmo local, parada de 12 minutos" },
  { "data": "2026-09-16", "nf": "2371780", "veredito": "entregue", "fonte": "duas paradas na mesma rua, 6 e 13 minutos" },
  { "data": "2026-09-16", "nf": "2372504", "veredito": "entregue", "fonte": "parada de 3 minutos na rua" },
  { "data": "2026-09-16", "nf": "2374272", "veredito": "entregue", "fonte": "entregue, stop fora do endereço" },
  { "data": "2026-09-16", "nf": "2374452", "veredito": "entregue", "fonte": "entregue, stop fora do endereço" },
  { "data": "2026-09-16", "nf": "2374324", "veredito": "entregue", "fonte": "entregue, coordenada mostra 3 pontos" },
  { "data": "2026-09-16", "nf": "2374699", "veredito": "entregue", "fonte": "entregue, coordenada mostra 3 pontos" },
  { "data": "2026-09-16", "nf": "2371776", "veredito": "sem_evidencia", "fonte": "não foi no endereço" },
  { "data": "2026-09-16", "nf": "2372384", "veredito": "sem_evidencia", "fonte": "não há paradas na rua" },
  { "data": "2026-09-17", "nf": "2376270", "veredito": "entregue", "fonte": "entregue, stop fora do endereço" },
  { "data": "2026-09-17", "nf": "2376302", "veredito": "entregue", "fonte": "entregue, duas ruas com o mesmo nome no mesmo bairro" },
  { "data": "2026-09-17", "nf": "2376365", "veredito": "entregue", "fonte": "entregue, stop fora do endereço" },
  { "data": "2026-09-17", "nf": "2376325", "veredito": "sem_evidencia", "fonte": "não passou nem próximo ao endereço" }
]
```

- [ ] **Step 2: Escrever o teste que falha**

`src/lib/kpi-romaneio/experimentos/gabarito.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { DumpExperimento, LinhaDump } from './tipos'
import { avaliarContraGabarito, type RotuloGabarito } from './gabarito'

const P = { duracaoMinSeg: 120, raioReivindicadaM: 800 }

function linha(o: Partial<LinhaDump>): LinhaDump {
  return {
    nf: 'NF', carga: '100', placa: 'ABC1234', clienteNome: 'C', endereco: 'RUA', lat: -22.9, lng: -43.2,
    geoConfiavel: true, geoMotivo: null, status: 'pendente', observacao: null, ...o,
  }
}

const ORFA: UnitracParadaRow = {
  id: 'S2', placa_norm: 'ABC1234', chegada: '2026-09-17T13:00:00.000Z', saida: '2026-09-17T13:10:00.000Z',
  fim_real: '2026-09-17T13:10:00.000Z', duracao_seg: 600, local_parada: 'RUA', codigo_loja: null,
  nome_loja: null, lat: -22.91, lng: -43.2, endereco: null, classificacao: 'FORA_BASE', ordem: 1,
}

const dump: DumpExperimento = {
  data: '2026-09-17',
  linhas: [
    linha({ nf: 'C1', status: 'confirmado_gps' }),
    linha({ nf: 'E1', lat: -22.9108 }),          // pendente, entregue no gabarito, com orfa por perto
    linha({ nf: 'S1', lat: -22.9109 }),          // pendente, sem_evidencia no gabarito, com orfa por perto (falso confirmado)
    linha({ nf: 'E2', lat: -22.99 }),            // pendente, entregue, sem orfa por perto
  ],
  paradasPorPlaca: { ABC1234: [ORFA] },
}

const gab = (nf: string, veredito: RotuloGabarito['veredito'], data = '2026-09-17'): RotuloGabarito => ({ data, nf, veredito, fonte: 't' })

describe('avaliarContraGabarito', () => {
  it('mede recall das entregues e falso-confirmado das sem evidência', () => {
    const r = avaliarContraGabarito([dump], [gab('E1', 'entregue'), gab('E2', 'entregue'), gab('S1', 'sem_evidencia')], P, 500)
    expect(r).toEqual({
      raioM: 500, entregueTotal: 2, entregueComOrfa: 1, semEvidenciaTotal: 1, semEvidenciaComOrfa: 1,
      jaConfirmadas: 0, naoEncontradas: 0,
    })
  })

  it('separa já confirmadas e NFs não encontradas, e ignora rótulo de dia sem dump', () => {
    const r = avaliarContraGabarito([dump], [gab('C1', 'entregue'), gab('NAO-EXISTE', 'entregue'), gab('E1', 'entregue', '2026-09-10')], P, 500)
    expect(r.jaConfirmadas).toBe(1)
    expect(r.naoEncontradas).toBe(1)
    expect(r.entregueTotal).toBe(0)
  })
})
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `npx vitest run src/lib/kpi-romaneio/experimentos/gabarito.test.ts`
Expected: FAIL (`Failed to resolve import "./gabarito"`).

- [ ] **Step 4: Implementar**

`src/lib/kpi-romaneio/experimentos/gabarito.ts`:

```ts
import { orfasProximasDoPendente, type ParametrosOrfas } from './paradas-orfas'
import type { DumpExperimento } from './tipos'

export type RotuloGabarito = { data: string; nf: string; veredito: 'entregue' | 'sem_evidencia'; fonte: string }

export type AvaliacaoGabarito = {
  raioM: number
  entregueTotal: number
  entregueComOrfa: number
  semEvidenciaTotal: number
  semEvidenciaComOrfa: number
  jaConfirmadas: number
  naoEncontradas: number
}

/** So' avalia rotulo de dia que tem dump. NF ja' confirmada no dump nao entra
 *  na conta (a regra nova so' age em pendente); NF ausente do dump e' contada a parte. */
export function avaliarContraGabarito(
  dumps: DumpExperimento[], gabarito: RotuloGabarito[], p: ParametrosOrfas, raioM: number,
): AvaliacaoGabarito {
  const dumpPorData = new Map(dumps.map(d => [d.data, d]))
  const r = { entregueTotal: 0, entregueComOrfa: 0, semEvidenciaTotal: 0, semEvidenciaComOrfa: 0, jaConfirmadas: 0, naoEncontradas: 0 }
  for (const rotulo of gabarito) {
    const dump = dumpPorData.get(rotulo.data)
    if (!dump) continue
    const linha = dump.linhas.find(l => l.nf === rotulo.nf)
    if (!linha) { r.naoEncontradas++; continue }
    if (linha.status !== 'pendente') { r.jaConfirmadas++; continue }
    const temOrfa = orfasProximasDoPendente(dump, linha, p, raioM).length > 0
    if (rotulo.veredito === 'entregue') { r.entregueTotal++; if (temOrfa) r.entregueComOrfa++ }
    else { r.semEvidenciaTotal++; if (temOrfa) r.semEvidenciaComOrfa++ }
  }
  return { raioM, ...r }
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `npx vitest run src/lib/kpi-romaneio/experimentos/gabarito.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 6: Criar o CLI**

`scripts/exp-paradas-orfas.ts`:

```ts
// Analise offline de "paradas orfas" sobre dumps gerados por
// EXPORTAR_DUMP=... scripts/gerar-nutrimax-real-arquivo.ts
//
// Uso: npx tsx scripts/exp-paradas-orfas.ts <gabarito.json> <dump1.json> [dump2.json ...]
// Saida: tabela no terminal + candidatas-orfas.csv (ou $CSV_SAIDA) pra a Ana validar.

import { readFileSync, writeFileSync } from 'fs'
import { RAIO_CONFIRMACAO_AMPLIADO_METROS } from '../src/lib/kpi-romaneio/constants'
import { analisarParadasOrfas, categoriaPendente, orfasProximasDoPendente } from '../src/lib/kpi-romaneio/experimentos/paradas-orfas'
import { avaliarContraGabarito, type RotuloGabarito } from '../src/lib/kpi-romaneio/experimentos/gabarito'
import type { DumpExperimento } from '../src/lib/kpi-romaneio/experimentos/tipos'

const RAIOS = [500, 1000, 1500, 2000, 3000]
const RAIO_CSV = 1500
const PARAMS = { duracaoMinSeg: 120, raioReivindicadaM: RAIO_CONFIRMACAO_AMPLIADO_METROS }

function pct(n: number, d: number): string {
  return d === 0 ? '   - ' : `${((100 * n) / d).toFixed(1)}%`
}

function limpa(s: string): string {
  return s.replace(/[;\n\r]/g, ',')
}

function main() {
  const [gabaritoPath, ...dumpPaths] = process.argv.slice(2)
  if (!gabaritoPath || dumpPaths.length === 0) {
    console.error('Uso: npx tsx scripts/exp-paradas-orfas.ts <gabarito.json> <dump1.json> [dump2.json ...]')
    process.exit(1)
  }
  const gabarito: RotuloGabarito[] = JSON.parse(readFileSync(gabaritoPath, 'utf-8'))
  const dumps: DumpExperimento[] = dumpPaths.map(p => JSON.parse(readFileSync(p, 'utf-8')))

  for (const dump of dumps) {
    const a = analisarParadasOrfas(dump, RAIOS, PARAMS)
    console.log(`\n=== ${a.data}: ${a.totalNfs} NFs | identificadas ${pct(a.identificadas, a.totalNfs)} | pendentes ${a.pendentes} (${a.pendentesSemCoordenada} sem coordenada) | paradas orfas ${a.orfasTotal}`)
    for (const r of a.porRaio) {
      console.log(`  raio ${String(r.raioM).padStart(4)}m: pendentes com orfa ${String(r.comOrfa).padStart(3)} (${pct(r.comOrfa, a.pendentes)}) | exclusivas ${String(r.comOrfaExclusiva).padStart(3)} (${pct(r.comOrfaExclusiva, a.pendentes)})`)
    }
    const cat = a.porRaio.find(r => r.raioM === RAIO_CSV)!.porCategoria
    for (const [nome, v] of Object.entries(cat)) {
      console.log(`     [${RAIO_CSV}m] ${nome.padEnd(22)} pendentes ${String(v.pendentes).padStart(3)} | com orfa ${String(v.comOrfa).padStart(3)} (${pct(v.comOrfa, v.pendentes)})`)
    }
  }

  console.log('\n=== Gabarito da Ana (so dias com dump) ===')
  for (const raio of RAIOS) {
    const g = avaliarContraGabarito(dumps, gabarito, PARAMS, raio)
    console.log(`  raio ${String(raio).padStart(4)}m: recall entregue ${g.entregueComOrfa}/${g.entregueTotal} (${pct(g.entregueComOrfa, g.entregueTotal)}) | falso-confirmado ${g.semEvidenciaComOrfa}/${g.semEvidenciaTotal} (${pct(g.semEvidenciaComOrfa, g.semEvidenciaTotal)}) | ja confirmadas ${g.jaConfirmadas} | nao encontradas ${g.naoEncontradas}`)
  }

  const csv = ['data;placa;carga;nf;cliente;endereco;categoria;distancia_m;parada_chegada;parada_saida;duracao_min']
  for (const dump of dumps) {
    for (const l of dump.linhas.filter(x => x.status === 'pendente')) {
      const prox = orfasProximasDoPendente(dump, l, PARAMS, RAIO_CSV)[0]
      if (!prox) continue
      csv.push([
        dump.data, l.placa, l.carga, l.nf, limpa(l.clienteNome), limpa(l.endereco), categoriaPendente(l.observacao),
        Math.round(prox.distanciaM), prox.parada.chegada, prox.parada.saida, Math.round((prox.parada.duracao_seg ?? 0) / 60),
      ].join(';'))
    }
  }
  const saida = process.env.CSV_SAIDA ?? 'candidatas-orfas.csv'
  writeFileSync(saida, csv.join('\n'))
  console.log(`\nCSV de candidatas (raio ${RAIO_CSV}m): ${saida} (${csv.length - 1} linhas)`)
}

main()
```

- [ ] **Step 7: Conferir tipos e suíte**

Run: `npx tsc --noEmit 2>&1 | grep -E "experimentos|exp-paradas-orfas"` (Expected: sem saída) e `npm test` (Expected: tudo passando).

- [ ] **Step 8: Commit (e espelhar no KPI TEMP)**

```bash
git add docs/superpowers/experimentos/gabarito-ana-2026-09.json src/lib/kpi-romaneio/experimentos/gabarito.ts src/lib/kpi-romaneio/experimentos/gabarito.test.ts scripts/exp-paradas-orfas.ts
git commit -m "$(cat <<'EOF'
feat(kpi-experimentos): gabarito da Ana + avaliação e CLI de paradas órfãs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ATqZgryoxRsTeXXM3HR8M7
EOF
)"
```

---

### Task 4: Rodar nos dias reais e decidir (portão GO/NO-GO)

**Files:**
- Create: `docs/superpowers/experimentos/2026-09-18-paradas-orfas-resultado.md` (resultado + decisão)

Sem código novo. Os dumps ficam fora do repositório (scratchpad da sessão).

- [ ] **Step 1: Baixar os PDFs dos 5 dias reprocessáveis (09, 11, 15, 16, 17/09) e levar ao VPS**

```bash
D=/private/tmp/claude-501/-Users-joaquimsalles/43f3d9c2-79a4-4525-b647-10dd95cc3a2d/scratchpad/exp
mkdir -p "$D"
ssh transmonseg-vps "mkdir -p /root/exp"
baixar() { # $1=nome-local  $2=id da mensagem
  local p; p=$(ssh contabo-joaquim "cd /opt/whatsapp-bridge/wrapper && set -a; . ./.env; set +a; PYTHONPATH=. venv/bin/python -m wa_bridge.cli media 'KPI AJUSTES' '$2'" | tail -1)
  scp -q "contabo-joaquim:$p" "$D/$1" && scp -q "$D/$1" "transmonseg-vps:/root/exp/$1"
}
baixar escala-09.pdf   3EB0CACF63631E7910F7C5
baixar romaneio-09.pdf 3EB07FB9F69E17357F9A27
baixar escala-11.pdf   AC6C085257E9B194ED0A39F283A5DB06
baixar romaneio-11.pdf AC178F2E85588D76D5C773C625C6B5C1
baixar escala-15.pdf   AC98304D7A152CC8324C85C3D77B5885
baixar romaneio-15.pdf ACCA01C5F25E4E9091D407314B19F061
baixar escala-16.pdf   3EB0FE1246757E35B4728D
baixar romaneio-16.pdf 3EB0B5FDB23FB6F11C0A41
baixar escala-17.pdf   AC852A4F653CED206D15AAC9A5919F4E
baixar romaneio-17.pdf ACFE6038C873CCA194A06A64CE7807E7
ssh transmonseg-vps "ls -la /root/exp/*.pdf | wc -l"
```
Expected: `10`.

- [ ] **Step 2: Atualizar o código no VPS SEM buildar e rodar os 5 dias em segundo plano**

O `git pull` só traz o script novo para o checkout; o app em execução continua com o `.next` atual. NÃO rodar `npm run build` nem `pm2 restart`.

```bash
ssh transmonseg-vps 'cd /srv/kpi-transmonseg && git pull origin main 2>&1 | tail -2'
ssh transmonseg-vps 'cat > /root/exp/rodar.sh <<"EOF"
#!/bin/bash
cd /srv/kpi-transmonseg
for d in 09 11 15 16 17; do
  EXPORTAR_DUMP=/root/exp/dump-$d.json npx tsx --env-file=.env.production scripts/gerar-nutrimax-real-arquivo.ts /root/exp/escala-$d.pdf /root/exp/romaneio-$d.pdf 2026-09-$d /root/exp/kpi-$d.xlsx > /root/exp/log-$d.txt 2>&1
done
echo FIM > /root/exp/fim.txt
EOF
chmod +x /root/exp/rodar.sh; rm -f /root/exp/fim.txt; nohup /root/exp/rodar.sh > /dev/null 2>&1 < /dev/null & disown; echo iniciado'
```
Expected: `iniciado`. Cada dia leva ~6–8 min (um lote de geocode de ~15 endereços irresolvíveis estoura 300 s), então ~35 min no total.

- [ ] **Step 3: Esperar o fim e trazer os dumps**

```bash
until ssh -o ConnectTimeout=10 transmonseg-vps "test -f /root/exp/fim.txt" 2>/dev/null; do sleep 30; done
D=/private/tmp/claude-501/-Users-joaquimsalles/43f3d9c2-79a4-4525-b647-10dd95cc3a2d/scratchpad/exp
scp -q "transmonseg-vps:/root/exp/dump-*.json" "$D/"
ls -la "$D"/dump-*.json
```
Expected: 5 arquivos `dump-09.json ... dump-17.json`, cada um com alguns MB. Se algum faltar, ler `/root/exp/log-DD.txt` no VPS.

- [ ] **Step 4: Rodar a análise**

```bash
D=/private/tmp/claude-501/-Users-joaquimsalles/43f3d9c2-79a4-4525-b647-10dd95cc3a2d/scratchpad/exp
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg"
CSV_SAIDA="$D/candidatas-orfas.csv" npx tsx scripts/exp-paradas-orfas.ts docs/superpowers/experimentos/gabarito-ana-2026-09.json "$D"/dump-09.json "$D"/dump-11.json "$D"/dump-15.json "$D"/dump-16.json "$D"/dump-17.json
```
Expected: por dia, a linha `=== data: N NFs | identificadas X% | pendentes ...`, a tabela por raio e por categoria, o bloco do gabarito e o caminho do CSV.

- [ ] **Step 5: Amostra para a Ana validar (o usuário envia)**

Sortear 30 linhas do CSV (10 por dia de 15, 16 e 17/09, misturando categorias) e mostrar ao usuário o arquivo e o texto sugerido para a Ana ("essas paradas do caminhão não casaram com nenhuma entrega; a NF X foi entregue nessa parada? sim/não"). Quem envia é o usuário; não enviar nada ao grupo. Precisão medida = sim / (sim + não).

- [ ] **Step 6: Escrever o resultado e a decisão**

Criar `docs/superpowers/experimentos/2026-09-18-paradas-orfas-resultado.md` com: a tabela por dia e raio (copiada da saída do Step 4), o bloco do gabarito, a precisão da amostra da Ana (quando ela responder) e a decisão pela regra abaixo.

Regra de decisão, no raio de 1500 m:
- **GO** (vale escrever um plano de implementação da regra "ENTREGUE - PARADA ÓRFÃ NA ROTA - CONFERIR", contada como entregue-com-ressalva) se as quatro condições valerem:
  1. mediana dos dias 15–17/09: pendentes com órfã exclusiva ≥ 30% dos pendentes;
  2. gabarito: recall das entregues (`entregueComOrfa/entregueTotal`) ≥ 70%;
  3. gabarito: falso-confirmado (`semEvidenciaComOrfa/semEvidenciaTotal`) ≤ 15%;
  4. amostra da Ana: precisão ≥ 80% em ≥ 30 pares.
- **NO-GO** se qualquer uma falhar. Nesse caso registrar qual falhou e passar para a próxima hipótese (coordenada aprendida a partir de paradas confirmadas; desambiguação de ruas homônimas no mesmo bairro), cada uma com plano próprio.
- Ganho esperado, para registrar: `pendentes × %órfã exclusiva × precisão da amostra`, em pontos percentuais.

- [ ] **Step 7: Commit do resultado (e espelhar no KPI TEMP)**

```bash
git add docs/superpowers/experimentos/2026-09-18-paradas-orfas-resultado.md
git commit -m "$(cat <<'EOF'
docs(kpi-experimentos): resultado do experimento de paradas órfãs e decisão GO/NO-GO

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ATqZgryoxRsTeXXM3HR8M7
EOF
)"
```

- [ ] **Step 8: Limpar o VPS**

```bash
ssh transmonseg-vps "rm -rf /root/exp"
```

---

### Task 5 (Trilha B): limitar a concorrência das consultas por placa no gerador

**Motivo (medido em 18/09):** o PostgREST do banco `transmonseg` roda com o pool padrão de 10 conexões e esgotou 258 vezes em 24 h, com pico (55/117/70 por hora) na janela da geração de ~2 h da Ana. O gerador dispara uma consulta por placa em paralelo (`Promise.all` sobre ~75 placas do romaneio e depois sobre a frota extra), o que gera os HTTP 500 em `velocidade-parada` (a checagem então é pulada em silêncio).

**Files:**
- Create: `src/lib/kpi-romaneio/concorrencia.ts`
- Test: `src/lib/kpi-romaneio/concorrencia.test.ts`
- Modify: `src/lib/kpi-romaneio/constants.ts` (nova constante no fim do arquivo)
- Modify: `src/app/api/kpi/nutrimax/gerar/route.ts:22` (import), `:307` e `:332` (os dois `Promise.all` por placa)

**Interfaces:**
- Produz: `mapComLimite<T, R>(itens: T[], limite: number, fn: (item: T, indice: number) => Promise<R>): Promise<R[]>` (mantém a ordem dos resultados; nunca roda mais de `limite` chamadas ao mesmo tempo) e `LIMITE_CONCORRENCIA_PLACAS = 6`.

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/kpi-romaneio/concorrencia.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapComLimite } from './concorrencia'

const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('mapComLimite', () => {
  it('nunca passa do limite de chamadas simultâneas e mantém a ordem dos resultados', async () => {
    let ativas = 0
    let pico = 0
    const r = await mapComLimite([1, 2, 3, 4, 5, 6, 7, 8], 3, async n => {
      ativas++
      pico = Math.max(pico, ativas)
      await espera(5 * (9 - n))
      ativas--
      return n * 10
    })
    expect(r).toEqual([10, 20, 30, 40, 50, 60, 70, 80])
    expect(pico).toBe(3)
  })

  it('lista vazia devolve lista vazia', async () => {
    expect(await mapComLimite([], 4, async () => 1)).toEqual([])
  })

  it('limite maior que a lista roda tudo e passa o índice', async () => {
    expect(await mapComLimite(['a', 'b'], 10, async (x, i) => `${x}${i}`)).toEqual(['a0', 'b1'])
  })

  it('propaga o erro de uma tarefa', async () => {
    await expect(mapComLimite([1, 2, 3], 2, async n => { if (n === 2) throw new Error('boom'); return n })).rejects.toThrow('boom')
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/lib/kpi-romaneio/concorrencia.test.ts`
Expected: FAIL (`Failed to resolve import "./concorrencia"`).

- [ ] **Step 3: Implementar o helper e a constante**

`src/lib/kpi-romaneio/concorrencia.ts`:

```ts
/** Igual a `Promise.all(itens.map(fn))`, mas com no maximo `limite` chamadas
 *  em andamento ao mesmo tempo. Mantem a ordem dos resultados. */
export async function mapComLimite<T, R>(
  itens: T[], limite: number, fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(itens.length)
  let proximo = 0
  async function trabalhador(): Promise<void> {
    while (true) {
      const i = proximo++
      if (i >= itens.length) return
      resultados[i] = await fn(itens[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador))
  return resultados
}
```

Acrescentar no fim de `src/lib/kpi-romaneio/constants.ts`:

```ts
/** Quantas placas o gerador consulta ao mesmo tempo (paradas da Unitrac + cruzamento
 *  de velocidade na ponte). O PostgREST do banco `transmonseg` tem pool de 10 conexoes
 *  e divide com o poller do monitoramento; medido em 18/09: sem limite, ~75 placas em
 *  paralelo esgotaram o pool 258 vezes em 24h (HTTP 500 em velocidade-parada). */
export const LIMITE_CONCORRENCIA_PLACAS = 6
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/lib/kpi-romaneio/concorrencia.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Aplicar no gerador**

Em `src/app/api/kpi/nutrimax/gerar/route.ts`:

1. Linha 22, trocar
   `import { COD_USER_NUTRIMAX, foraDoAlcanceApi, PAO_PREFIXO } from '@/lib/kpi-romaneio/constants'`
   por
   `import { COD_USER_NUTRIMAX, foraDoAlcanceApi, LIMITE_CONCORRENCIA_PLACAS, PAO_PREFIXO } from '@/lib/kpi-romaneio/constants'`
   e acrescentar logo abaixo `import { mapComLimite } from '@/lib/kpi-romaneio/concorrencia'`.
2. Linha 307: trocar `await Promise.all(placasNorm.map(async placaNorm => {` por `await mapComLimite(placasNorm, LIMITE_CONCORRENCIA_PLACAS, async placaNorm => {`, e o fechamento desse bloco (a linha `  }))` logo depois de `kmPorPlaca.set(placaNorm, calcularKmPercorrido(paradas))`) por `  })`.
3. Linha 332: trocar `await Promise.all(placasFrotaExtra.map(async placaNorm => {` por `await mapComLimite(placasFrotaExtra, LIMITE_CONCORRENCIA_PLACAS, async placaNorm => {`, e o fechamento (a linha `  }))` logo depois de `paradasPorPlaca.set(placaNorm, resolverParadas(daUnitrac, daPonte, ...))`) por `  })`.

- [ ] **Step 6: Conferir tipos e suíte**

Run: `npx tsc --noEmit 2>&1 | grep -E "route.ts|concorrencia"` (Expected: sem saída) e `npm test` (Expected: tudo passando; o `route.test.ts` existente cobre o gerador inteiro com mocks e não pode regredir).

- [ ] **Step 7: Commit (e espelhar no KPI TEMP), push dos dois repos**

```bash
git add src/lib/kpi-romaneio/concorrencia.ts src/lib/kpi-romaneio/concorrencia.test.ts src/lib/kpi-romaneio/constants.ts src/app/api/kpi/nutrimax/gerar/route.ts
git commit -m "$(cat <<'EOF'
fix(kpi-nutrimax): limita a concorrência das consultas por placa (pool do PostgREST)

O gerador disparava ~75 placas em paralelo contra um pool de 10 conexões:
258 esgotamentos em 24h, HTTP 500 em velocidade-parada e geração de ~2h.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ATqZgryoxRsTeXXM3HR8M7
EOF
)"
```

- [ ] **Step 8: Deploy (só com o OK do usuário) e medir**

Baseline já medido: 258 esgotamentos/24 h (`journalctl -u postgrest`), pico de 117/h.

```bash
ssh transmonseg-vps "cd /srv/kpi-transmonseg && git pull origin main && npm run build" 2>&1 | tail -3
ssh transmonseg-vps "pm2 restart kpi-transmonseg && sleep 2 && pm2 describe kpi-transmonseg | grep -E 'status|uptime'"
```

Depois de UMA geração real feita pela equipe (pedir ao usuário para avisar a hora), medir a janela dela:

```bash
ssh transmonseg-vps 'journalctl -u postgrest --since "<hora de início>" --until "<hora de fim>" --no-pager 2>/dev/null | grep -ciE "acquiring connection|PGRST003"; grep -c "velocidade-parada" ~/.pm2/logs/kpi-transmonseg-error.log'
```
Critério: esgotamentos do pool na janela da geração ≈ 0 (baseline: dezenas a centenas por hora) e a geração não pode demorar mais de ~20% que antes. Se o tempo piorar sem melhorar o pool, subir `LIMITE_CONCORRENCIA_PLACAS` para 10 e medir de novo.

Terceiro critério (efeito colateral na taxa): sem os HTTP 500 da ponte de velocidade, a guarda `validarParadasContraGpsProprio` (em `src/lib/kpi-romaneio/unitrac.ts`), que descarta paradas da Unitrac que o GPS próprio contradiz e hoje é PULADA (fail-open) nas placas em que a ponte responde 500, passa a agir em todas as placas. Isso pode reduzir NFs confirmadas (mais correto, mas muda o número). Comparar a taxa identificada e a distribuição de status da primeira geração real pós-deploy com a série da Ana (e com o KPI do mesmo dia gerado antes, se existir). Queda de mais de 1 ponto percentual bloqueia: reverter o deploy (`git revert` do commit da Task 5, build, restart) e tratar como decisão de produto, não de infra.

Medição offline da guarda (controlador, dia 17/09, mesmo romaneio, script sequencial com a guarda ligada contra desligada por uma variável `SEM_GUARDA_VELOCIDADE` numa cópia temporária no VPS, depois restaurada): taxa identificada 86,88% nos dois casos, 0 NFs mudaram de status e a guarda descartou 4 de 2254 paradas. Ou seja, o efeito máximo de religar a guarda na taxa foi ~0 nesse dia — a guarda só age nas paradas da Unitrac, que só são usadas em placas sem paradas da ponte ou em apagão de sinal. O critério 3 continua valendo como salvaguarda.

---

## Fora do escopo deste plano (com o motivo)

Cada item abaixo tem evidência própria, mas depende de resultado ou de decisão anterior, então ganha plano separado:

- **Regra "parada órfã" em produção:** só depois do GO da Task 4.
- **Coordenada aprendida** (usar a parada de NFs já confirmadas como coordenada real do cliente nos dias seguintes) e **desambiguação de ruas homônimas no mesmo bairro** (casos 17/09: Av. Boa Vista em Campos, Pirapetinga em Bom Jesus do Itabapoana): próximas hipóteses se a Task 4 der NO-GO, ou em complemento se der GO.
- **Foto diária dos alvos da Unitrac** (às ~23:50, para as regerações não perderem ~5,6 pontos): exige tabela nova e cron.
- **Cache de falha de geocode com prazo + resultado parcial por lote:** cada geração perde ~5 min com ~15 endereços irresolvíveis; exige migration. Plano próprio.
- **Geração assíncrona com fila:** a mudança estrutural maior; só se as correções pontuais não bastarem.
- **Pool do PostgREST (`db-pool`) e correção do cast inteiro de `posicoes_atuais` no monitoramento:** infra compartilhada / outro repositório, precisam de decisão do usuário.
