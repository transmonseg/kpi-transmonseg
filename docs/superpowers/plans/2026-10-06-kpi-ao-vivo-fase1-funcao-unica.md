# KPI ao vivo — Fase 1: função única de geração Nutry Max — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um único código calcula o KPI da Nutry Max a partir dos dados já lidos (escala, romaneio, pão), usado pela rota de gerar, pelo script de regeração e, nas fases seguintes, pelo KPI ao vivo, com prova de que dados guardados geram o mesmo resultado que os PDFs.

**Architecture:** Mover o miolo de `POST /api/kpi/nutrimax/gerar` (linhas 195–648 de `src/app/api/kpi/nutrimax/gerar/route.ts`, do "Troca de placa" até `gerarKpiRomaneioXlsx`) pra `src/lib/kpi-romaneio/gerar-nutrimax.ts` sem mudar comportamento. A rota fica só com auth, leitura/parse dos PDFs, Storage e histórico. O script `scripts/gerar-nutrimax-real-arquivo.ts` passa a chamar a mesma função (os ganchos de experimento viram opções). Um script de verificação compara "parse dos PDFs → função" com "parse → JSON (como no banco) → função".

**Tech Stack:** Next.js (versão do repo — ler `node_modules/next/dist/docs/` antes de mexer em rota), TypeScript, Vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-10-06-kpi-ao-vivo-design.md` (seção "1. Função única de geração" e "Critério obrigatório: mesmo resultado").

## Global Constraints

- A **rota é a referência**: o resultado da rota não pode mudar em nada (testes de `route.test.ts` passam sem alterar nenhuma expectativa).
- O script adota o comportamento da rota onde hoje diverge (ver Task 3) — isso é intencional e fica registrado.
- Sem rastreador conta como correta; regras do KPI intocadas (nenhuma alteração em `agregacao.ts`, `gerador-xlsx.ts`, `visitas.ts`).
- Commits do KPI vão pro KPI TEMP (cherry-pick); deploy só via `scripts/deploy-sem-queda.sh`.
- Sem mensagens pra Ana/grupo.

## Review Focus

- Romaneio principal sem nenhuma linha reconhecida (só o pão veio) → rota continua devolvendo 422 com a mesma mensagem de hoje.
- Escala não enviada → nenhum aviso `sem_escala` (hoje controlado por `escalaBuf ?`); na função vira `escalaEnviada: false`.
- Pão não enviado → nenhum aviso de descasamento do pão (`paoEnviado: false`).
- Dados que passaram por JSON (campo `undefined` some, `null` fica) → mesma planilha (Task 4 prova).
- Falha da Unitrac em `buscarAlvosDoDia` / `buscarParadasDoDia` → a rota hoje propaga (500); o script engole e segue. A função adota o comportamento da rota (propaga); o script captura no `main` e sai com erro. Registrado como decisão.

---

### Task 1: `gerarKpiNutrimax` (extração sem mudança de comportamento)

**Files:**
- Create: `src/lib/kpi-romaneio/gerar-nutrimax.ts`
- Test: `src/lib/kpi-romaneio/gerar-nutrimax.test.ts`

**Interfaces:**
- Produces:
```ts
export class ErroEntradaKpi extends Error {}
export type EntradaKpiNutrimax = {
  data: string                                  // AAAA-MM-DD
  escala: LinhaEscala[]                         // [] quando não veio
  romaneio: LinhaRomaneio[]
  pao: { linhas: LinhaRomaneio[]; escala: LinhaEscala[] }
  escalaEnviada: boolean                        // substitui `escalaBuf ?` dos avisos
  paoEnviado: boolean                           // substitui `romaneioPaoBuf ?`
}
export type OpcoesKpiNutrimax = {
  // ganchos de experimento do script (nunca usados pela rota)
  sobreporGeo?: (geoPorEndereco: Map<string, ResultadoGeocode>) => void
  semCadastroUnitrac?: boolean
  aoMontarDetalhe?: (x: { romaneioGeo: LinhaGeocodificada[]; detalhe: LinhaDetalheEntrega[]; paradasPorPlaca: Map<string, UnitracParadaRow[]> }) => void
}
export type ResultadoKpiNutrimax = {
  xlsx: Buffer
  detalhe: LinhaDetalheEntrega[]                // já com resoluções manuais
  linhasKpi: LinhaKpiRomaneio[]                 // consistentes (paradasReais do detalhe)
  avisos: AvisoDescasamento[]
  qtdCargasNutry: number                        // linhasKpi sem PAO-*
}
export async function gerarKpiNutrimax(entrada: EntradaKpiNutrimax, opcoes?: OpcoesKpiNutrimax): Promise<ResultadoKpiNutrimax>
```
(`ResultadoGeocode` = `{ lat; lng; fonte?; confiavel; motivo? } | null`, exportado por `src/lib/kpi-romaneio/geocode.ts:54`.)

- [ ] **Step 1: Teste da guarda de entrada**

```ts
import { describe, it, expect } from 'vitest'
import { gerarKpiNutrimax, ErroEntradaKpi } from './gerar-nutrimax'

describe('gerarKpiNutrimax', () => {
  it('romaneio principal vazio: ErroEntradaKpi com a mensagem da rota (mesmo com pão)', async () => {
    const pao = { linhas: [{ carga: 'PAO-1', destino: '', placa: 'ABC1234', motorista: '', ajudantes: [], nf: '1', clienteCodigo: '', clienteNome: 'X', endereco: 'RUA A, 1' }], escala: [] }
    await expect(gerarKpiNutrimax({ data: '2026-10-03', escala: [], romaneio: [], pao, escalaEnviada: false, paoEnviado: true }))
      .rejects.toThrow(ErroEntradaKpi)
    await expect(gerarKpiNutrimax({ data: '2026-10-03', escala: [], romaneio: [], pao, escalaEnviada: false, paoEnviado: true }))
      .rejects.toThrow('Nenhuma linha reconhecida no Romaneio de Entrega — confira se o PDF é o "Romaneio de Entrega" da Nutry Max.')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/kpi-romaneio/gerar-nutrimax.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Criar o módulo movendo o código da rota**
  - Imports: os mesmos da rota, linhas 4–36, exceto `next/server`, `createClient`, `getPerfil/podeOperarEmpresa`, `parseEscala/parseRomaneio/parsePao`, `extrairResumoKpiXlsx`, `salvarGeracao/buscarGeracaoParaRegenerar`, `guardarXlsxGerado/novoPrefixoGeracao`, `createServiceClient`. Mover também `FONTES_VERIFICADAS`, `narrowGeoMotivo` (a rota passa a reexportar: `export { narrowGeoMotivo } from '@/lib/kpi-romaneio/gerar-nutrimax'`, porque `route.test.ts` importa da rota) e `agrupar`.
  - Corpo: as linhas 195–648 da rota, nesta ordem, com só estas trocas:
    1. `let { escala, romaneio } = entrada; let resultadoPao = entrada.pao; const data = entrada.data`.
    2. Linhas 211–216: `if (romaneio.length === 0) throw new ErroEntradaKpi('Nenhuma linha reconhecida no Romaneio de Entrega — confira se o PDF é o "Romaneio de Entrega" da Nutry Max.')`.
    3. `const foraDaJanelaUnitrac = foraDoAlcanceApi(data, hojeBR())` (linhas 173–176 da rota, com o `console.warn`) passa pra dentro da função.
    4. Logo após montar `geoPorEndereco` (linha 223): `opcoes?.sobreporGeo?.(geoPorEndereco)`.
    5. Linha 320: `opcoes?.semCadastroUnitrac ? pontosPorPlacaBridge : anexarCoordenadaCadastro(pontosPorPlacaBridge, alvos)`; linha 408: `agrupar(opcoes?.semCadastroUnitrac ? [] : alvos, a => a.placaNorm)`.
    6. Depois de montar `detalhe` (linha 569): `opcoes?.aoMontarDetalhe?.({ romaneioGeo, detalhe, paradasPorPlaca })`.
    7. Linhas 595–596: `escalaBuf ?` → `entrada.escalaEnviada ?`; `romaneioPaoBuf ?` → `entrada.paoEnviado ?`.
    8. Retorno: `{ xlsx: xlsxBuf, detalhe: detalheComResolucao, linhasKpi: linhasKpiConsistentes, avisos, qtdCargasNutry: linhasKpi.filter(l => !l.carga.startsWith(PAO_PREFIXO)).length }`.
  - Comentários do código movido vão junto (são a documentação das regras).

- [ ] **Step 4: Rodar** — `npx vitest run src/lib/kpi-romaneio/gerar-nutrimax.test.ts` → PASS; `npx tsc --noEmit -p . 2>&1 | grep -v "Buffer\|maxByteLength"` → vazio.

- [ ] **Step 5: Commit** — `git add src/lib/kpi-romaneio/gerar-nutrimax.ts src/lib/kpi-romaneio/gerar-nutrimax.test.ts && git commit -m "kpi: gerarKpiNutrimax (miolo da rota extraido, sem mudanca)"`

### Task 2: Rota usa a função

**Files:**
- Modify: `src/app/api/kpi/nutrimax/gerar/route.ts` (linhas 173–648 viram a chamada)

**Interfaces:**
- Consumes: `gerarKpiNutrimax`, `ErroEntradaKpi`, `narrowGeoMotivo` da Task 1.

- [ ] **Step 1: Trocar o miolo pela chamada**

```ts
  let resultado: Awaited<ReturnType<typeof gerarKpiNutrimax>>
  try {
    resultado = await gerarKpiNutrimax({
      data,
      escala,
      romaneio,
      pao: resultadoPao,
      escalaEnviada: escalaBuf != null,
      paoEnviado: romaneioPaoBuf != null,
    })
  } catch (err) {
    if (err instanceof ErroEntradaKpi) return new NextResponse(err.message, { status: 422 })
    throw err
  }
  const xlsxBuf = resultado.xlsx
```
  Mantém: parse dos PDFs (linhas 183–194, com o try/catch 422), bloco de Storage/histórico (650–712) usando `resultado.qtdCargasNutry` no lugar de `linhasKpi.filter(...)`, e a resposta (714–719). Remover imports que ficaram sem uso.

- [ ] **Step 2: Rodar os testes da rota sem mudar nenhum** — `npx vitest run src/app/api/kpi/nutrimax/gerar` → todos PASS (mesmo número de testes de antes: 33).

- [ ] **Step 3: Suíte inteira** — `npx vitest run` → 0 falhas.

- [ ] **Step 4: Commit** — `git commit -am "kpi: rota nutrimax/gerar usa gerarKpiNutrimax"`

### Task 3: Script usa a função (adota o comportamento da rota)

**Files:**
- Modify: `scripts/gerar-nutrimax-real-arquivo.ts` (o `main` inteiro)

**Interfaces:**
- Consumes: `gerarKpiNutrimax`, `OpcoesKpiNutrimax` da Task 1.

Divergências que o script passa a corrigir (eram bugs do script, a rota já fazia certo): `statusRastreador` da escala em `agregarPorCarga` e `placaSemRastriNaEscala` em `montarDetalheEntregas`; avisos `detectarMotoristaMultiplasPlacas`, `detectarCargaMultiRegiao` e `geocode_parcial`; `narrowGeoMotivo`; geocodificação com `geocodificarEnderecosComInfo`; busca por placa com `mapComLimite`.

- [ ] **Step 1: Reescrever o `main`**

```ts
async function main() {
  const [escalaPath, romaneioPath, data, saidaPath, romaneioPaoPath] = process.argv.slice(2)
  if (!escalaPath || !romaneioPath || !data || !saidaPath) {
    console.error('Uso: npx tsx --env-file=.env.production scripts/gerar-nutrimax-real-arquivo.ts <escala.pdf> <romaneio.pdf> <data:YYYY-MM-DD> <saida.xlsx> [romaneio-pao.pdf]')
    process.exit(1)
  }
  const escala = await parseEscala(Buffer.from(readFileSync(escalaPath)))
  const romaneio = await parseRomaneio(Buffer.from(readFileSync(romaneioPath)))
  const pao = romaneioPaoPath ? await parsePao(Buffer.from(readFileSync(romaneioPaoPath)), data) : { linhas: [], escala: [] }
  console.log(`Escala: ${escala.length + pao.escala.length} linhas, Romaneio: ${romaneio.length + pao.linhas.length} linhas (${pao.linhas.length} do pão)`)

  const opcoes: OpcoesKpiNutrimax = {
    semCadastroUnitrac: semCadastroUnitrac(),
    sobreporGeo: process.env.OVERRIDE_CACHE_CSV ? geo => aplicarOverrideCsv(geo, process.env.OVERRIDE_CACHE_CSV!) : undefined,
    aoMontarDetalhe: process.env.EXPORTAR_DUMP
      ? x => { writeFileSync(process.env.EXPORTAR_DUMP!, JSON.stringify(montarDumpExperimento({ data, ...x }))); console.log(`Dump de experimento salvo em: ${process.env.EXPORTAR_DUMP}`) }
      : undefined,
  }
  const r = await gerarKpiNutrimax({ data, escala, romaneio, pao, escalaEnviada: true, paoEnviado: romaneioPaoPath != null }, opcoes)
  console.log(`Total cargas: ${r.linhasKpi.length}, OK: ${r.linhasKpi.filter(l => l.status === 'OK').length}, avisos: ${r.avisos.length}`)
  writeFileSync(saidaPath, r.xlsx)
  console.log(`\nArquivo salvo em: ${saidaPath}`)
}
```
  `aplicarOverrideCsv(geo, caminho)`: o laço atual das linhas 93–102, recebendo o `Map`. O modo `SO_UNITRAC_OUT` (linhas 270–275) sai — conferido em 06/10: nenhum outro script/doc usa.

- [ ] **Step 2: Tipos** — `npx tsc --noEmit -p . 2>&1 | grep -v "Buffer\|maxByteLength"` → vazio.

- [ ] **Step 3: Rodar no servidor com o 03/10 e comparar com a saída de antes**
  Run (servidor, `/srv/kpi-transmonseg` depois do pull): `npx tsx --env-file=.env.production scripts/gerar-nutrimax-real-arquivo.ts /tmp/kpi-teste/in/03-escala.pdf /tmp/kpi-teste/in/03-romaneio.pdf 2026-10-03 /tmp/kpi-reg-out/fase1-03.xlsx`
  Expected: EXIT 0; diferenças em relação a `/tmp/kpi-reg-out/smoke-03.xlsx` só nas linhas/avisos ligados às divergências listadas acima (anotar quais NFs mudaram e por quê).

- [ ] **Step 4: Commit** — `git commit -am "script nutrimax usa gerarKpiNutrimax (adota a logica da rota)"`

### Task 4: Prova de equivalência (PDF vs dados guardados)

**Files:**
- Create: `src/lib/kpi-romaneio/comparar-kpi.ts`
- Test: `src/lib/kpi-romaneio/comparar-kpi.test.ts`
- Create: `scripts/verificar-equivalencia-ao-vivo.ts`

**Interfaces:**
- Produces: `compararDetalhes(a: LinhaDetalheEntrega[], b: LinhaDetalheEntrega[]): string[]` (lista de diferenças legíveis, vazia = igual), comparando por `carga::placa::nf` os campos `status`, `observacao`, `chegada`, `saida`, `tempoParadaMin`, `motivo`, e NF presente só de um lado.

- [ ] **Step 1: Teste do comparador**

```ts
import { describe, it, expect } from 'vitest'
import { compararDetalhes } from './comparar-kpi'

const d = (o: Record<string, unknown>) => ({ carga: '1', placa: 'AAA1A11', nf: '10', status: 'confirmado_gps', observacao: null, chegada: '2026-10-03T10:00:00', saida: '2026-10-03T10:10:00', tempoParadaMin: 10, motivo: 'm', ...o }) as never

describe('compararDetalhes', () => {
  it('iguais: sem diferença', () => {
    expect(compararDetalhes([d({})], [d({})])).toEqual([])
  })
  it('status diferente: aponta NF e campo', () => {
    expect(compararDetalhes([d({})], [d({ status: 'pendente' })])).toEqual(['1::AAA1A11::10 status: confirmado_gps ≠ pendente'])
  })
  it('NF só de um lado', () => {
    expect(compararDetalhes([d({}), d({ nf: '11' })], [d({})])).toEqual(['1::AAA1A11::11 só em A'])
  })
})
```

- [ ] **Step 2: Ver falhar** — `npx vitest run src/lib/kpi-romaneio/comparar-kpi.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
import type { LinhaDetalheEntrega } from './types'

const CAMPOS = ['status', 'observacao', 'chegada', 'saida', 'tempoParadaMin', 'motivo'] as const

export function compararDetalhes(a: LinhaDetalheEntrega[], b: LinhaDetalheEntrega[]): string[] {
  const chave = (x: LinhaDetalheEntrega) => `${x.carga}::${x.placa}::${x.nf}`
  const mb = new Map(b.map(x => [chave(x), x]))
  const ma = new Map(a.map(x => [chave(x), x]))
  const dif: string[] = []
  for (const [k, xa] of ma) {
    const xb = mb.get(k)
    if (!xb) { dif.push(`${k} só em A`); continue }
    for (const c of CAMPOS) if ((xa[c] ?? null) !== (xb[c] ?? null)) dif.push(`${k} ${c}: ${xa[c]} ≠ ${xb[c]}`)
  }
  for (const k of mb.keys()) if (!ma.has(k)) dif.push(`${k} só em B`)
  return dif
}
```

- [ ] **Step 4: Passar** — mesmo comando → PASS.

- [ ] **Step 5: Script de verificação**

```ts
// Prova da spec do KPI ao vivo: gerar a partir dos dados guardados (JSON,
// como fica no banco) dá o MESMO resultado que gerar a partir dos PDFs.
// Uso: npx tsx --env-file=.env.production scripts/verificar-equivalencia-ao-vivo.ts <escala.pdf> <romaneio.pdf> <data> [pao.pdf]
import { readFileSync } from 'fs'
import { parseEscala } from '../src/lib/kpi-romaneio/parse-escala'
import { parseRomaneio } from '../src/lib/kpi-romaneio/parse-romaneio'
import { parsePao } from '../src/lib/kpi-romaneio/parse-pao'
import { gerarKpiNutrimax } from '../src/lib/kpi-romaneio/gerar-nutrimax'
import { compararDetalhes } from '../src/lib/kpi-romaneio/comparar-kpi'
import { extrairResumoKpiXlsx } from '../src/lib/kpi-romaneio/resumo-dashboard'

async function main() {
  const [escalaPath, romaneioPath, data, paoPath] = process.argv.slice(2)
  const escala = await parseEscala(Buffer.from(readFileSync(escalaPath)))
  const romaneio = await parseRomaneio(Buffer.from(readFileSync(romaneioPath)))
  const pao = paoPath ? await parsePao(Buffer.from(readFileSync(paoPath)), data) : { linhas: [], escala: [] }
  const entrada = { data, escala, romaneio, pao, escalaEnviada: true, paoEnviado: paoPath != null }
  const a = await gerarKpiNutrimax(entrada)
  const guardado = JSON.parse(JSON.stringify({ escala, romaneio, pao }))
  const b = await gerarKpiNutrimax({ ...entrada, ...guardado })
  const dif = compararDetalhes(a.detalhe, b.detalhe)
  const [ra, rb] = await Promise.all([extrairResumoKpiXlsx(a.xlsx), extrairResumoKpiXlsx(b.xlsx)])
  console.log(`A: ${ra.taxa}% (${ra.entregues}/${ra.nfsNaConta})  B: ${rb.taxa}% (${rb.entregues}/${rb.nfsNaConta})  NFs: ${a.detalhe.length}/${b.detalhe.length}`)
  if (dif.length > 0 || ra.taxa !== rb.taxa || ra.entregues !== rb.entregues) {
    console.error(`DIFERENTE (${dif.length}):\n${dif.slice(0, 50).join('\n')}`)
    process.exit(1)
  }
  console.log('IGUAL')
}
main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 6: Rodar no servidor com 03/10** — `npx tsx --env-file=.env.production scripts/verificar-equivalencia-ao-vivo.ts /tmp/kpi-teste/in/03-escala.pdf /tmp/kpi-teste/in/03-romaneio.pdf 2026-10-03` → Expected: `IGUAL`, exit 0. Repetir com 02/10 + pão (`/tmp/kpi-teste/in/02-*.pdf`).

- [ ] **Step 7: Commit, espelhar no TEMP, deploy** — commit dos 3 arquivos; cherry-pick no KPI TEMP; `deploy-sem-queda.sh`; gerar 1 KPI pela tela normal (ou rodar o smoke do script) e conferir taxa igual à do script.
