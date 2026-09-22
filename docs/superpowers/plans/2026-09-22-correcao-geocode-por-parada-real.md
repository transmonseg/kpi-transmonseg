# Correção de geocode pela parada real (alvo Unitrac × GPS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir automaticamente a coordenada de endereços do romaneio usando a parada GPS REAL do caminhão no momento em que a Unitrac marcou a entrega como feita, e gerar a lista de clientes cujo cadastro na Unitrac está longe de onde a entrega realmente acontece.

**Architecture:** Função pura `sugerirCorrecoesPorAlvo` casa cada alvo `situacao=1` (com `feitoISO`) com a parada `FORA_BASE` da mesma placa cuja janela [chegada, saída] contém o `feitoISO`; aplica travas (parada longa, ilha, endereço com paradas conflitantes, coordenada atual já boa). Um script CLI lê o romaneio do dia, o snapshot de alvos (`kpi_alvos_snapshot`), as paradas da ponte (`/api/kpi/base-horarios`, `incluirParadas`) e o cache de geocode; imprime 2 CSVs e, com `--aplicar`, grava a coordenada nova no `kpi_romaneio_geocode_cache`. A coordenada gravada é SEMPRE a da parada GPS, nunca o ponto cadastrado na Unitrac (que tem erro conhecido).

**Tech Stack:** TypeScript, Vitest, tsx, Supabase self-hosted (PostgREST `postgrest-kpi`).

**Spec:** decisão da conversa de 22/09/2026. Evidência: no dia 21/09, das 18 NFs com coordenada corrigida à mão (por nome do cliente/rua), o casamento por horário reproduziu 14 a <100 m; as 3 com `feitoISO` fora de qualquer parada (gap 9/19/57 min) são as que a regra rejeita; 1 divergente (NF 2382397, 663 m) é caso com dois candidatos.

## Global Constraints

- Trailer de commit EXATO ao final: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` e `Claude-Session: https://claude.ai/code/session_01ATqZgryoxRsTeXXM3HR8M7`
- Espelhar em KPI TEMP (`/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP`) e push nos dois repos juntos.
- A coordenada gravada no cache é a da PARADA GPS (`ParadaBridge.lat/lng`), nunca `pontoLat/pontoLng` da Unitrac.
- Chave do cache = `endereco` CRU do romaneio, sem normalizar espaço (geocode.ts lê a string crua; ver commit de91e19).
- `feitoISO` da Unitrac vem com os dígitos em horário de Brasília (sem fuso real); `ParadaBridge.chegada/saida` são ISO com fuso real. Converter `feitoISO` para instante somando `-03:00`.
- Trava de duração: parada com mais de `LIMITE_PARADA_ENTREGA_MIN = 120` minutos não serve de evidência.
- Trava de coordenada boa: se a coordenada atual é `confiavel=true` e está a ≤ `RAIO_CONFIRMACAO_AMPLIADO_METROS` (800 m, `constants.ts`) da parada, não troca.
- Endereço com acesso só por barco (`acessoSomentePorBarco`) nunca é corrigido (o caminhão para no píer).
- Cadastro Unitrac "divergente" = ponto cadastrado a mais de `LIMITE_CADASTRO_DIVERGENTE_M = 500` m da parada real.
- `--aplicar` escreve em produção: só rodar com OK explícito do usuário.

## Review Focus

- `feitoISO` sem fuso comparado com chegada/saída com fuso: sem a conversão BRT, o casamento erra por 3–5 h e casa a parada errada em silêncio. Teste com offset explícito na Task 1.
- Endereço com 2+ NFs cujos `feitoISO` caem em paradas a mais de 300 m uma da outra: não pode escolher uma. Rejeita como `paradas_conflitantes` (Task 1).
- Endereço com espaço duplo: a chave do upsert tem que manter a string idêntica ao romaneio (Task 3).
- Alvo `situacao=1` sem `documento` ou placa sem nenhuma parada na ponte: vira rejeição, nunca exceção (Task 1).
- Snapshot antigo sem `pontoLat/pontoLng` (dias antes desta mudança): o CSV de cadastros deixa a coluna vazia e o script não quebra (Tasks 2 e 3).

---

## File Structure

- Create `src/lib/kpi-romaneio/correcao-por-alvo.ts` — função pura de casamento + travas.
- Create `src/lib/kpi-romaneio/correcao-por-alvo.test.ts`.
- Modify `src/lib/unitrac-api/alvos.ts` — `AlvoApi` ganha `pontoLat`/`pontoLng` (ponto cadastrado da Unitrac, só pra relatório).
- Modify `src/lib/unitrac-api/alvos.test.ts`.
- Create `scripts/corrigir-geocode-por-alvo.ts` — CLI (lê dados, imprime CSVs, `--aplicar`).
- Create `scripts/corrigir-geocode-por-alvo.test.ts` — testa só as funções puras exportadas do script (montar upsert, montar CSV).

---

### Task 1: Função pura `sugerirCorrecoesPorAlvo`

**Files:**
- Create: `src/lib/kpi-romaneio/correcao-por-alvo.ts`
- Test: `src/lib/kpi-romaneio/correcao-por-alvo.test.ts`

**Interfaces:**
- Consumes: `AlvoApi` (`@/lib/unitrac-api`), `ParadaBridge` (`./base-horarios`), `acessoSomentePorBarco` (`./acesso-restrito`), `RAIO_CONFIRMACAO_AMPLIADO_METROS` (`./constants`), `haversine` (`@/lib/utils/geo`).
- Produces:
```ts
export const LIMITE_PARADA_ENTREGA_MIN = 120
export const LIMITE_CADASTRO_DIVERGENTE_M = 500
export const LIMITE_PARADAS_MESMO_ENDERECO_M = 300
export type EntregaParaCorrigir = { nf: string; placaNorm: string; endereco: string; latAtual: number | null; lngAtual: number | null; confiavelAtual: boolean }
export type SugestaoCorrecao = {
  endereco: string; nfs: string[]; placaNorm: string
  latAtual: number | null; lngAtual: number | null; distAtualM: number | null
  latNova: number; lngNova: number; duracaoParadaMin: number
  codigoUnitrac: string; cadastroLat: number | null; cadastroLng: number | null; distCadastroM: number | null
}
export type MotivoRejeicao = 'sem_alvo_feito' | 'feito_fora_de_parada' | 'parada_longa' | 'ilha' | 'coordenada_atual_ok' | 'paradas_conflitantes'
export type Rejeicao = { endereco: string; nf: string; placaNorm: string; motivo: MotivoRejeicao }
export function instanteDeFeitoISO(feitoISO: string): number
export function sugerirCorrecoesPorAlvo(
  entregas: EntregaParaCorrigir[],
  alvos: AlvoApi[],
  paradasPorPlaca: Map<string, ParadaBridge[]>,
): { sugestoes: SugestaoCorrecao[]; rejeicoes: Rejeicao[] }
```

- [ ] **Step 1: Testes falhando**

```ts
import { describe, it, expect } from 'vitest'
import { instanteDeFeitoISO, sugerirCorrecoesPorAlvo, type EntregaParaCorrigir } from './correcao-por-alvo'
import type { AlvoApi } from '@/lib/unitrac-api'
import type { ParadaBridge } from './base-horarios'

const alvo = (o: Partial<AlvoApi>): AlvoApi => ({
  placaNorm: 'AAA1A11', codigoUnitrac: '136118', nome: 'LOJA', situacao: 1,
  feitoISO: '2026-09-21T08:35:00', documento: '100', inicioISO: '2026-09-21T06:00:00',
  ordem: 1, rota: 'R1', pontoLat: null, pontoLng: null, ...o,
})
// chegada/saida com fuso REAL (+02:00, como a ponte devolve): 12:31+02 = 07:31 BRT
const parada = (o: Partial<ParadaBridge>): ParadaBridge => ({
  chegada: '2026-09-21T13:31:00+02:00', saida: '2026-09-21T13:36:00+02:00', duracaoSeg: 300,
  lat: -21.8434, lng: -41.4300, classificacao: 'FORA_BASE', ...o,
})
const entrega = (o: Partial<EntregaParaCorrigir>): EntregaParaCorrigir => ({
  nf: '100', placaNorm: 'AAA1A11', endereco: 'EST DORES DE MACABU, 286 - DORES DE MACABU, CAMPOS DOS GOYT',
  latAtual: -21.88, lngAtual: -41.46, confiavelAtual: false, ...o,
})

describe('instanteDeFeitoISO', () => {
  it('trata os digitos como horario de Brasilia (-03:00)', () => {
    expect(instanteDeFeitoISO('2026-09-21T08:35:00')).toBe(Date.parse('2026-09-21T11:35:00Z'))
  })
  it('ignora um Z mentiroso no fim (digitos continuam BRT)', () => {
    expect(instanteDeFeitoISO('2026-09-21T08:35:00Z')).toBe(Date.parse('2026-09-21T11:35:00Z'))
  })
})

describe('sugerirCorrecoesPorAlvo', () => {
  const paradas = new Map([['AAA1A11', [parada({})]]])

  it('feitoISO dentro da janela da parada (fusos diferentes) -> sugere a coordenada da PARADA', () => {
    const r = sugerirCorrecoesPorAlvo([entrega({})], [alvo({})], paradas)
    expect(r.rejeicoes).toEqual([])
    expect(r.sugestoes).toHaveLength(1)
    expect(r.sugestoes[0]).toMatchObject({ latNova: -21.8434, lngNova: -41.4300, nfs: ['100'], codigoUnitrac: '136118' })
    expect(r.sugestoes[0].distAtualM).toBeGreaterThan(800)
  })

  it('sem o ajuste de fuso a parada NAO casaria -- feito 08:35 BRT e parada 08:31-08:36 BRT', () => {
    const r = sugerirCorrecoesPorAlvo([entrega({})], [alvo({ feitoISO: '2026-09-21T13:33:00' })], paradas)
    expect(r.sugestoes).toEqual([])
    expect(r.rejeicoes[0].motivo).toBe('feito_fora_de_parada')
  })

  it('usa a parada, nunca o ponto cadastrado da Unitrac, mas reporta a distancia do cadastro', () => {
    const r = sugerirCorrecoesPorAlvo([entrega({})], [alvo({ pontoLat: -21.70, pontoLng: -41.30 })], paradas)
    expect(r.sugestoes[0].latNova).toBe(-21.8434)
    expect(r.sugestoes[0].cadastroLat).toBe(-21.70)
    expect(r.sugestoes[0].distCadastroM).toBeGreaterThan(500)
  })

  it('alvo nao feito, sem documento ou NF sem alvo -> sem_alvo_feito, sem excecao', () => {
    const r = sugerirCorrecoesPorAlvo(
      [entrega({}), entrega({ nf: '200' }), entrega({ nf: '300' })],
      [alvo({ situacao: 0, feitoISO: null }), alvo({ documento: null }), alvo({ documento: '300', feitoISO: null })],
      paradas,
    )
    expect(r.sugestoes).toEqual([])
    expect(r.rejeicoes.map(x => x.motivo)).toEqual(['sem_alvo_feito', 'sem_alvo_feito', 'sem_alvo_feito'])
  })

  it('placa sem nenhuma parada na ponte -> feito_fora_de_parada', () => {
    const r = sugerirCorrecoesPorAlvo([entrega({})], [alvo({})], new Map())
    expect(r.rejeicoes[0].motivo).toBe('feito_fora_de_parada')
  })

  it('parada BASE nao conta', () => {
    const r = sugerirCorrecoesPorAlvo([entrega({})], [alvo({})], new Map([['AAA1A11', [parada({ classificacao: 'BASE' })]]]))
    expect(r.rejeicoes[0].motivo).toBe('feito_fora_de_parada')
  })

  it('parada acima de 120 min -> parada_longa', () => {
    const longa = parada({ chegada: '2026-09-21T11:00:00+02:00', saida: '2026-09-21T15:00:00+02:00', duracaoSeg: 4 * 3600 })
    const r = sugerirCorrecoesPorAlvo([entrega({})], [alvo({})], new Map([['AAA1A11', [longa]]]))
    expect(r.rejeicoes[0].motivo).toBe('parada_longa')
  })

  it('endereco de ilha -> ilha', () => {
    const r = sugerirCorrecoesPorAlvo([entrega({ endereco: 'PR DO ABRAAO, 687 - ABRAAO, ANGRA DOS REIS - ILHA GRANDE' })], [alvo({})], paradas)
    expect(r.rejeicoes[0].motivo).toBe('ilha')
  })

  it('coordenada atual confiavel a <=800m da parada -> coordenada_atual_ok', () => {
    const r = sugerirCorrecoesPorAlvo([entrega({ latAtual: -21.8440, lngAtual: -41.4305, confiavelAtual: true })], [alvo({})], paradas)
    expect(r.rejeicoes[0].motivo).toBe('coordenada_atual_ok')
  })

  it('coordenada atual NAO confiavel perto da parada -> ainda corrige (vira confiavel)', () => {
    const r = sugerirCorrecoesPorAlvo([entrega({ latAtual: -21.8440, lngAtual: -41.4305, confiavelAtual: false })], [alvo({})], paradas)
    expect(r.sugestoes).toHaveLength(1)
  })

  it('3 NFs do mesmo endereco na mesma parada -> UMA sugestao com as 3 NFs', () => {
    const r = sugerirCorrecoesPorAlvo(
      [entrega({ nf: '1' }), entrega({ nf: '2' }), entrega({ nf: '3' })],
      [alvo({ documento: '1' }), alvo({ documento: '2' }), alvo({ documento: '3' })],
      paradas,
    )
    expect(r.sugestoes).toHaveLength(1)
    expect(r.sugestoes[0].nfs).toEqual(['1', '2', '3'])
  })

  it('mesmo endereco casado com duas paradas a mais de 300m -> paradas_conflitantes, sem sugestao', () => {
    const p2 = parada({ chegada: '2026-09-21T15:00:00+02:00', saida: '2026-09-21T15:10:00+02:00', lat: -21.90, lng: -41.50 })
    const r = sugerirCorrecoesPorAlvo(
      [entrega({ nf: '1' }), entrega({ nf: '2' })],
      [alvo({ documento: '1' }), alvo({ documento: '2', feitoISO: '2026-09-21T10:05:00' })],
      new Map([['AAA1A11', [parada({}), p2]]]),
    )
    expect(r.sugestoes).toEqual([])
    expect(r.rejeicoes.map(x => x.motivo)).toEqual(['paradas_conflitantes', 'paradas_conflitantes'])
  })
})
```

- [ ] **Step 2:** `npx vitest run src/lib/kpi-romaneio/correcao-por-alvo.test.ts` → FAIL (módulo não existe). Obs.: o teste usa `pontoLat/pontoLng` em `AlvoApi` — até a Task 2 isso dá erro de tipo no `tsc`, mas o Vitest roda (esbuild não checa tipo). Se preferir, faça a Task 2 antes.

- [ ] **Step 3: Implementar** `src/lib/kpi-romaneio/correcao-por-alvo.ts`

```ts
// Correcao de geocode pela parada REAL (decisao 22/09): quando a Unitrac marca
// uma entrega como FEITA (situacao=1, feitoISO), a parada GPS da mesma placa
// cuja janela contem esse horario e' onde a entrega aconteceu de verdade.
// Usa a coordenada da PARADA (GPS), nunca o ponto cadastrado da Unitrac
// (pontoLat/pontoLng), que tem erro conhecido -- esse so' entra no relatorio
// de "cadastro divergente". Validado em 21/09: 14 de 15 correcoes feitas a mao
// reproduzidas a <100m.
import { haversine } from '@/lib/utils/geo'
import type { AlvoApi } from '@/lib/unitrac-api'
import type { ParadaBridge } from './base-horarios'
import { acessoSomentePorBarco } from './acesso-restrito'
import { RAIO_CONFIRMACAO_AMPLIADO_METROS } from './constants'

export const LIMITE_PARADA_ENTREGA_MIN = 120
export const LIMITE_CADASTRO_DIVERGENTE_M = 500
export const LIMITE_PARADAS_MESMO_ENDERECO_M = 300

export type EntregaParaCorrigir = { nf: string; placaNorm: string; endereco: string; latAtual: number | null; lngAtual: number | null; confiavelAtual: boolean }
export type SugestaoCorrecao = {
  endereco: string; nfs: string[]; placaNorm: string
  latAtual: number | null; lngAtual: number | null; distAtualM: number | null
  latNova: number; lngNova: number; duracaoParadaMin: number
  codigoUnitrac: string; cadastroLat: number | null; cadastroLng: number | null; distCadastroM: number | null
}
export type MotivoRejeicao = 'sem_alvo_feito' | 'feito_fora_de_parada' | 'parada_longa' | 'ilha' | 'coordenada_atual_ok' | 'paradas_conflitantes'
export type Rejeicao = { endereco: string; nf: string; placaNorm: string; motivo: MotivoRejeicao }

/** feitoISO da Unitrac: digitos ja em horario de Brasilia, as vezes com um Z
 *  mentiroso no fim. Converte pra instante real somando -03:00. */
export function instanteDeFeitoISO(feitoISO: string): number {
  const semFuso = feitoISO.replace(/(Z|[+-]\d\d:?\d\d)$/, '')
  return Date.parse(`${semFuso}-03:00`)
}

type Casamento = { entrega: EntregaParaCorrigir; alvo: AlvoApi; parada: ParadaBridge }

export function sugerirCorrecoesPorAlvo(
  entregas: EntregaParaCorrigir[],
  alvos: AlvoApi[],
  paradasPorPlaca: Map<string, ParadaBridge[]>,
): { sugestoes: SugestaoCorrecao[]; rejeicoes: Rejeicao[] } {
  const rejeicoes: Rejeicao[] = []
  const rejeitar = (e: EntregaParaCorrigir, motivo: MotivoRejeicao) =>
    rejeicoes.push({ endereco: e.endereco, nf: e.nf, placaNorm: e.placaNorm, motivo })

  const alvoPorChave = new Map<string, AlvoApi>()
  for (const a of alvos) {
    if (a.situacao !== 1 || !a.feitoISO || !a.documento) continue
    alvoPorChave.set(`${a.placaNorm}|${a.documento}`, a)
  }

  const porEndereco = new Map<string, Casamento[]>()
  for (const e of entregas) {
    const a = alvoPorChave.get(`${e.placaNorm}|${e.nf}`)
    if (!a) { rejeitar(e, 'sem_alvo_feito'); continue }
    if (acessoSomentePorBarco(e.endereco)) { rejeitar(e, 'ilha'); continue }
    const t = instanteDeFeitoISO(a.feitoISO as string)
    const parada = (paradasPorPlaca.get(e.placaNorm) ?? []).find(p =>
      p.classificacao === 'FORA_BASE' && Date.parse(p.chegada) <= t && t <= Date.parse(p.saida))
    if (!parada) { rejeitar(e, 'feito_fora_de_parada'); continue }
    if (parada.duracaoSeg / 60 > LIMITE_PARADA_ENTREGA_MIN) { rejeitar(e, 'parada_longa'); continue }
    const lista = porEndereco.get(e.endereco) ?? []
    lista.push({ entrega: e, alvo: a, parada })
    porEndereco.set(e.endereco, lista)
  }

  const sugestoes: SugestaoCorrecao[] = []
  for (const [endereco, casamentos] of porEndereco) {
    const ref = casamentos[0]
    const conflito = casamentos.some(c =>
      haversine(c.parada.lat, c.parada.lng, ref.parada.lat, ref.parada.lng) > LIMITE_PARADAS_MESMO_ENDERECO_M)
    if (conflito) { for (const c of casamentos) rejeitar(c.entrega, 'paradas_conflitantes'); continue }
    const { entrega: e, alvo: a, parada: p } = ref
    const distAtualM = e.latAtual != null && e.lngAtual != null ? haversine(e.latAtual, e.lngAtual, p.lat, p.lng) : null
    if (e.confiavelAtual && distAtualM != null && distAtualM <= RAIO_CONFIRMACAO_AMPLIADO_METROS) {
      for (const c of casamentos) rejeitar(c.entrega, 'coordenada_atual_ok')
      continue
    }
    const cadastroLat = a.pontoLat ?? null
    const cadastroLng = a.pontoLng ?? null
    sugestoes.push({
      endereco, nfs: casamentos.map(c => c.entrega.nf), placaNorm: e.placaNorm,
      latAtual: e.latAtual, lngAtual: e.lngAtual, distAtualM,
      latNova: p.lat, lngNova: p.lng, duracaoParadaMin: Math.round(p.duracaoSeg / 60),
      codigoUnitrac: a.codigoUnitrac, cadastroLat, cadastroLng,
      distCadastroM: cadastroLat != null && cadastroLng != null ? haversine(cadastroLat, cadastroLng, p.lat, p.lng) : null,
    })
  }
  return { sugestoes, rejeicoes }
}
```

(Confira a assinatura de `haversine` em `src/lib/utils/geo.ts` — `visitas.ts` usa `haversine(lat1, lng1, lat2, lng2)` em metros.)

- [ ] **Step 4:** `npx vitest run src/lib/kpi-romaneio/correcao-por-alvo.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(kpi): casamento alvo Unitrac x parada GPS pra corrigir geocode` (+ trailer).

---

### Task 2: `AlvoApi` guarda o ponto cadastrado da Unitrac

**Files:**
- Modify: `src/lib/unitrac-api/alvos.ts` (`AlvoApi`, `AlvoRaw`, `parseAlvos`)
- Test: `src/lib/unitrac-api/alvos.test.ts`

**Interfaces:**
- Produces: `AlvoApi` com mais dois campos `pontoLat: number | null; pontoLng: number | null` (lidos de `pontolatitude`/`pontolongitude`; `null` quando ausente, não numérico, ou `|lat| < 1` — mesmo critério de `pontos.ts`). Só pra relatório; NUNCA usar pra gravar coordenada.

- [ ] **Step 1: Teste falhando** (adicionar em `alvos.test.ts`):

```ts
it('parseAlvos guarda o ponto cadastrado (pontolatitude/pontolongitude) e usa null quando ausente ou zerado', () => {
  const r = parseAlvos({ alvos: [
    { placa: 'AAA1A11', pontoidentificador: '1', pontolatitude: -21.84, pontolongitude: -41.43 },
    { placa: 'AAA1A11', pontoidentificador: '2' },
    { placa: 'AAA1A11', pontoidentificador: '3', pontolatitude: 0, pontolongitude: 0 },
  ] })
  expect(r.map(a => [a.pontoLat, a.pontoLng])).toEqual([[-21.84, -41.43], [null, null], [null, null]])
})
```

- [ ] **Step 2:** `npx vitest run src/lib/unitrac-api/alvos.test.ts` → FAIL.
- [ ] **Step 3: Implementar**: em `AlvoApi` adicionar `pontoLat: number | null` e `pontoLng: number | null` (com comentário: "ponto CADASTRADO na Unitrac -- erro conhecido; so' pra relatorio de cadastro divergente, nunca como coordenada de entrega"); em `AlvoRaw` adicionar `pontolatitude?: number | string` e `pontolongitude?: number | string`; em `parseAlvos`:

```ts
    const pLat = Number(a.pontolatitude)
    const pLng = Number(a.pontolongitude)
    const pontoValido = Number.isFinite(pLat) && Number.isFinite(pLng) && Math.abs(pLat) >= 1
    // ...no objeto retornado:
      pontoLat: pontoValido ? pLat : null,
      pontoLng: pontoValido ? pLng : null,
```

Atualizar os helpers de teste que montam `AlvoApi` literal (ex.: `src/lib/kpi-romaneio/alvos-snapshot.test.ts`, `alvos-data.test.ts`, `agregacao.test.ts`, `route.test.ts`) adicionando `pontoLat: null, pontoLng: null` onde o `tsc` reclamar.
- [ ] **Step 4:** `npx vitest run src/lib/unitrac-api src/lib/kpi-romaneio src/app/api/kpi/nutrimax/gerar` → PASS; `npx tsc --noEmit` só com os erros de Buffer conhecidos em `gerador-xlsx.test.ts`.
- [ ] **Step 5: Commit** `feat(kpi): alvo da Unitrac guarda o ponto cadastrado pro relatorio de divergencia` (+ trailer).

---

### Task 3: Script `corrigir-geocode-por-alvo`

**Files:**
- Create: `scripts/corrigir-geocode-por-alvo.ts`
- Test: `scripts/corrigir-geocode-por-alvo.test.ts`

**Interfaces:**
- Consumes: `sugerirCorrecoesPorAlvo`, `SugestaoCorrecao`, `Rejeicao`, `LIMITE_CADASTRO_DIVERGENTE_M` (Task 1); `parseRomaneio(buffer): Promise<LinhaRomaneio[]>` (`src/lib/kpi-romaneio/parse-romaneio.ts`); `lerSnapshotAlvos(cliente, data)` (`src/lib/kpi-romaneio/alvos-snapshot.ts`); `buscarAlvosDoDia(placas)` (`src/lib/kpi-romaneio/unitrac.ts`) + `alvosDaData` (`alvos-data.ts`); `buscarHorariosBase(placas, data, new Map(), true)` (`base-horarios.ts`, devolve `Map<placa, HorarioBase>` com `.paradas`); `normPlaca` (`src/lib/unitrac-api`); `createServiceClient` (`src/lib/supabase/service`).
- Produces (exportadas, puras, testadas):
```ts
export function montarUpsertCorrecao(s: SugestaoCorrecao): { endereco: string; lat: number; lng: number; confiavel: true; motivo: null; fonte: 'parada_alvo' }
export function csvCorrecoes(sugestoes: SugestaoCorrecao[], rejeicoes: Rejeicao[]): string
export function csvCadastrosDivergentes(sugestoes: SugestaoCorrecao[]): string
```

Uso: `npx tsx --env-file=.env.production scripts/corrigir-geocode-por-alvo.ts <romaneio.pdf> <AAAA-MM-DD> [--aplicar]`

- [ ] **Step 1: Testes falhando** (`scripts/corrigir-geocode-por-alvo.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import { montarUpsertCorrecao, csvCorrecoes, csvCadastrosDivergentes } from './corrigir-geocode-por-alvo'
import type { SugestaoCorrecao } from '../src/lib/kpi-romaneio/correcao-por-alvo'

const s = (o: Partial<SugestaoCorrecao>): SugestaoCorrecao => ({
  endereco: 'RUA X, 1 - LOTE  28  QUADRA  24', nfs: ['1', '2'], placaNorm: 'AAA1A11',
  latAtual: -22.67, lngAtual: -43.30, distAtualM: 1200, latNova: -22.68, lngNova: -43.29, duracaoParadaMin: 8,
  codigoUnitrac: '5904', cadastroLat: -22.70, cadastroLng: -43.31, distCadastroM: 2500, ...o,
})

describe('montarUpsertCorrecao', () => {
  it('chave = endereco CRU (espaco duplo preservado), coordenada da parada, confiavel e motivo limpo', () => {
    expect(montarUpsertCorrecao(s({}))).toEqual({
      endereco: 'RUA X, 1 - LOTE  28  QUADRA  24', lat: -22.68, lng: -43.29, confiavel: true, motivo: null, fonte: 'parada_alvo',
    })
  })
})

describe('csvCadastrosDivergentes', () => {
  it('so lista cadastro a mais de 500m da parada real; ignora sem cadastro', () => {
    const csv = csvCadastrosDivergentes([s({}), s({ codigoUnitrac: '9', distCadastroM: 100 }), s({ codigoUnitrac: '8', cadastroLat: null, cadastroLng: null, distCadastroM: null })])
    const linhas = csv.trim().split('\n')
    expect(linhas).toHaveLength(2)
    expect(linhas[1]).toContain('5904')
  })
})

describe('csvCorrecoes', () => {
  it('uma linha por sugestao e por rejeicao, separador ; e endereco sem ; quebrando coluna', () => {
    const csv = csvCorrecoes([s({ endereco: 'A; B' })], [{ endereco: 'C', nf: '9', placaNorm: 'P', motivo: 'ilha' }])
    const linhas = csv.trim().split('\n')
    expect(linhas).toHaveLength(3)
    expect(linhas[1].split(';').length).toBe(linhas[0].split(';').length)
    expect(linhas[2]).toContain('ilha')
  })
})
```

- [ ] **Step 2:** `npx vitest run scripts/corrigir-geocode-por-alvo.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `scripts/corrigir-geocode-por-alvo.ts` (siga o estilo de `scripts/snapshot-alvos-noturno.ts`: `main()` só roda fora do Vitest):

```ts
// Correcao de geocode pela parada real do dia (ver src/lib/kpi-romaneio/correcao-por-alvo.ts).
// Uso: npx tsx --env-file=.env.production scripts/corrigir-geocode-por-alvo.ts <romaneio.pdf> <AAAA-MM-DD> [--aplicar]
// Sem --aplicar: so' gera os CSVs. Com --aplicar: grava no kpi_romaneio_geocode_cache (PRODUCAO).
import { readFileSync, writeFileSync } from 'fs'
import { parseRomaneio } from '../src/lib/kpi-romaneio/parse-romaneio'
import { lerSnapshotAlvos } from '../src/lib/kpi-romaneio/alvos-snapshot'
import { alvosDaData } from '../src/lib/kpi-romaneio/alvos-data'
import { buscarAlvosDoDia } from '../src/lib/kpi-romaneio/unitrac'
import { buscarHorariosBase, type ParadaBridge } from '../src/lib/kpi-romaneio/base-horarios'
import { normPlaca } from '../src/lib/unitrac-api'
import { createServiceClient } from '../src/lib/supabase/service'
import {
  sugerirCorrecoesPorAlvo, LIMITE_CADASTRO_DIVERGENTE_M,
  type EntregaParaCorrigir, type Rejeicao, type SugestaoCorrecao,
} from '../src/lib/kpi-romaneio/correcao-por-alvo'

const limpa = (v: unknown) => String(v ?? '').replace(/[;\n\r]/g, ',')

export function montarUpsertCorrecao(s: SugestaoCorrecao) {
  return { endereco: s.endereco, lat: s.latNova, lng: s.lngNova, confiavel: true as const, motivo: null, fonte: 'parada_alvo' as const }
}

export function csvCorrecoes(sugestoes: SugestaoCorrecao[], rejeicoes: Rejeicao[]): string {
  const cab = 'acao;placa;nfs;endereco;lat_atual;lng_atual;dist_atual_m;lat_nova;lng_nova;duracao_parada_min;motivo'
  const linhas = [
    ...sugestoes.map(s => ['corrigir', s.placaNorm, s.nfs.join(' '), s.endereco, s.latAtual, s.lngAtual,
      s.distAtualM != null ? Math.round(s.distAtualM) : '', s.latNova, s.lngNova, s.duracaoParadaMin, ''].map(limpa).join(';')),
    ...rejeicoes.map(r => ['manter', r.placaNorm, r.nf, r.endereco, '', '', '', '', '', '', r.motivo].map(limpa).join(';')),
  ]
  return [cab, ...linhas].join('\n') + '\n'
}

export function csvCadastrosDivergentes(sugestoes: SugestaoCorrecao[]): string {
  const cab = 'codigo_unitrac;placa;nfs;endereco;cadastro_lat;cadastro_lng;parada_real_lat;parada_real_lng;distancia_m'
  const linhas = sugestoes
    .filter(s => s.distCadastroM != null && s.distCadastroM > LIMITE_CADASTRO_DIVERGENTE_M)
    .sort((a, b) => (b.distCadastroM ?? 0) - (a.distCadastroM ?? 0))
    .map(s => [s.codigoUnitrac, s.placaNorm, s.nfs.join(' '), s.endereco, s.cadastroLat, s.cadastroLng, s.latNova, s.lngNova, Math.round(s.distCadastroM as number)].map(limpa).join(';'))
  return [cab, ...linhas].join('\n') + '\n'
}

async function lerCache(enderecos: string[]) {
  const svc = createServiceClient()
  const mapa = new Map<string, { lat: number; lng: number; confiavel: boolean }>()
  for (let i = 0; i < enderecos.length; i += 20) {
    const { data, error } = await svc.from('kpi_romaneio_geocode_cache').select('endereco,lat,lng,confiavel').in('endereco', enderecos.slice(i, i + 20))
    if (error) throw new Error(`leitura do cache falhou: ${error.message}`)
    for (const r of data ?? []) mapa.set(r.endereco, { lat: r.lat, lng: r.lng, confiavel: r.confiavel })
  }
  return mapa
}

async function main() {
  const [romaneioPath, data] = process.argv.slice(2).filter(a => !a.startsWith('--'))
  const aplicar = process.argv.includes('--aplicar')
  if (!romaneioPath || !/^\d{4}-\d{2}-\d{2}$/.test(data ?? '')) {
    console.error('Uso: corrigir-geocode-por-alvo.ts <romaneio.pdf> <AAAA-MM-DD> [--aplicar]'); process.exit(1)
  }
  const romaneio = await parseRomaneio(Buffer.from(readFileSync(romaneioPath)))
  const placas = [...new Set(romaneio.map(l => normPlaca(l.placa)).filter(p => p !== ''))]
  const cache = await lerCache([...new Set(romaneio.map(l => l.endereco))])
  const entregas: EntregaParaCorrigir[] = romaneio.map(l => {
    const c = cache.get(l.endereco)
    return { nf: l.nf, placaNorm: normPlaca(l.placa), endereco: l.endereco, latAtual: c?.lat ?? null, lngAtual: c?.lng ?? null, confiavelAtual: c?.confiavel ?? false }
  })
  const alvos = (await lerSnapshotAlvos('nutrimax', data)) ?? alvosDaData(await buscarAlvosDoDia(placas), data)
  const horarios = await buscarHorariosBase(placas, data, new Map(), true)
  const paradasPorPlaca = new Map<string, ParadaBridge[]>([...horarios].map(([p, h]) => [p, h.paradas ?? []]))
  console.log(`romaneio=${romaneio.length} NFs, placas=${placas.length}, alvos=${alvos.length}, placas com paradas=${[...paradasPorPlaca.values()].filter(v => v.length).length}`)

  const { sugestoes, rejeicoes } = sugerirCorrecoesPorAlvo(entregas, alvos, paradasPorPlaca)
  const cont = rejeicoes.reduce<Record<string, number>>((m, r) => ({ ...m, [r.motivo]: (m[r.motivo] ?? 0) + 1 }), {})
  console.log(`sugestoes=${sugestoes.length} enderecos | rejeicoes:`, cont)
  writeFileSync(`correcoes-geocode-${data}.csv`, csvCorrecoes(sugestoes, rejeicoes))
  writeFileSync(`cadastros-unitrac-divergentes-${data}.csv`, csvCadastrosDivergentes(sugestoes))
  console.log(`CSVs: correcoes-geocode-${data}.csv, cadastros-unitrac-divergentes-${data}.csv`)

  if (!aplicar) { console.log('(sem --aplicar: nada gravado)'); return }
  const svc = createServiceClient()
  let ok = 0
  for (const s of sugestoes) {
    const { error } = await svc.from('kpi_romaneio_geocode_cache').upsert(montarUpsertCorrecao(s), { onConflict: 'endereco' })
    if (error) console.error(`falha ${s.endereco}: ${error.message}`); else ok++
  }
  console.log(`gravados ${ok}/${sugestoes.length}`)
  if (ok < sugestoes.length) process.exit(1)
}

if (process.env.VITEST !== 'true') main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 4:** `npx vitest run scripts/corrigir-geocode-por-alvo.test.ts` → PASS. Type-check do script (scripts/ fica fora do tsconfig): criar um tsconfig temporário no scratchpad que estende `./tsconfig.json` incluindo só esse arquivo, rodar `npx tsc --noEmit -p <tmp>`, apagar o temporário.
- [ ] **Step 5: Commit** `feat(kpi): script de correcao de geocode pela parada real + relatorio de cadastro divergente` (+ trailer). Espelhar em TEMP; push nos dois.

---

### Task 4: Validação com dado real (controller; `--aplicar` só com OK do usuário)

- [ ] **Step 1:** No transmonseg-vps, `git pull`; baixar o PDF do romaneio de 21/09 do bucket `kpi-romaneio-inputs` (path em `kpi_romaneio_geracoes.romaneio_storage_path`) ou usar o `Romaneio 21-09.pdf` do grupo; rodar SEM `--aplicar`.
- [ ] **Step 2: Critério de aceite** contra o gabarito das 18 correções manuais de 22/09: as NFs 2382403/04/05/06, 2382474, 2383077, 2382911, 2382977, 2382979, 2383018, 2383031, 2383095, 2382901/08 não aparecem como "corrigir" com coordenada a mais de 300 m da aplicada à mão (ou aparecem como `coordenada_atual_ok`, já que foram corrigidas); 2382410, 2382858, 2383107 aparecem como `feito_fora_de_parada`; 2382901/2382908/2382905 (ilha) aparecem como `ilha`. Qualquer violação = parar e investigar antes de aplicar.
- [ ] **Step 3:** Rodar também para 18/09, 19/09 e 22/09 (snapshots existem) sem `--aplicar`; conferir 10 sugestões aleatórias de cada no relatório de paradas da Unitrac ou no mapa.
- [ ] **Step 4:** Com OK do usuário, `--aplicar` para os dias validados. Depois regerar 21/09 e medir quantas NFs "CONFIRMADO (UNITRAC) sem hora" passaram a ter hora.
- [ ] **Step 5:** Entregar ao usuário o `cadastros-unitrac-divergentes-*.csv` (quem manda pra operação é o usuário).

## Self-review

- Cobertura: casamento + travas (T1), ponto cadastrado pra relatório (T2), CLI com CSVs e aplicação (T3), validação contra gabarito e aplicação com OK (T4).
- Review Focus coberto: fuso (T1 testes 1–2 e "sem ajuste"), paradas conflitantes (T1), espaço duplo na chave (T3 `montarUpsertCorrecao`), alvo sem documento / placa sem parada (T1), snapshot sem ponto cadastrado (T2 null + T3 filtro `distCadastroM != null`).
- Nomes consistentes entre tarefas: `sugerirCorrecoesPorAlvo`, `SugestaoCorrecao`, `Rejeicao`, `LIMITE_CADASTRO_DIVERGENTE_M`, `pontoLat/pontoLng`, `montarUpsertCorrecao`.
- Fora de escopo (fase 2): rodar isso automático no cron noturno depois do dia fechar.
