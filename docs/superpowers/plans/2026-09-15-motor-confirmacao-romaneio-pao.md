# Incluir romaneio do pão (PROGRAMAÇÃO JAC CONGELADO) no KPI Nutry Max — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer as entregas do romaneio "PROGRAMAÇÃO JAC (CONGELADO)" (a "escala do pão") aparecerem no relatório KPI Nutry Max, na aba da placa correspondente, confirmadas pelo mesmo GPS que já é buscado para o resto do dia dela.

**Architecture:** Um parser novo (`parse-pao.ts`) lê o PDF do pão e devolve `LinhaRomaneio[]` — o mesmo tipo que o parser da Nutry Max já produz — mais uma `LinhaEscala[]` sintética (evita falso aviso de "sem escala"). As duas listas são concatenadas às do romaneio/escala principal ANTES do resto do pipeline rodar; como `agregarPorCarga`/`montarDetalheEntregas`/busca de GPS já operam por `(carga, placaNorm)` de forma genérica, nenhuma outra mudança estrutural é necessária.

**Tech Stack:** TypeScript, Next.js API routes, `pdf-parse`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-motor-confirmacao-romaneio-pao-design.md`

## Global Constraints

- Carga sintética do pão sempre tem prefixo `PAO-` (ex.: `PAO-1`) — nunca pode colidir com um número de carga real da Nutry Max (formato ~97000-98000).
- Upload do romaneio do pão é sempre **opcional** — sem ele, o comportamento e a saída do relatório devem ficar bit-a-bit iguais ao que já existe hoje.
- Nunca inventar um número de endereço ambíguo (ver "Risco técnico" na spec) — passar o valor cru extraído do PDF adiante, mesmo se estranho, em vez de tentar adivinhar onde cortar.
- Toda mudança em `KPI transmonseg` (repo principal) precisa ser espelhada em `KPI TEMP` (mesmo conteúdo, commit separado) — ver `feedback_monitoramento_push_both_repos` / disciplina já usada no resto desta sessão.

---

### Task 1: Parser puro do romaneio do pão

**Files:**
- Create: `src/lib/kpi-romaneio/parse-pao.ts`
- Test: `src/lib/kpi-romaneio/parse-pao.test.ts`

**Interfaces:**
- Consumes: tipos `LinhaRomaneio`, `LinhaEscala` de `./types` (já existem, sem mudança); `normPlaca` de `@/lib/unitrac-api`.
- Produces: `export type ResultadoParsePao = { linhas: LinhaRomaneio[]; escala: LinhaEscala[] }`; `export function parsePaoTexto(texto: string, data: string): ResultadoParsePao` (lança `Error` se a data do cabeçalho do PDF não bater com `data`, ou se não achar nenhum cabeçalho `DATA`); `export async function parsePao(buffer: Buffer, data: string): Promise<ResultadoParsePao>`. Essas três exports são consumidas nas Tasks 2 e 3.

O formato do PDF, extraído via `pdf-parse` (mesma lib que `parse-romaneio.ts` já usa — sem opção de layout), vem com colunas coladas por falta de separador em alguns pontos. Confirmado contra as duas amostras reais do dia:

```
DATA15/09/2026
ROMANEIO1MOTORISTAAJUDANTE
CARRO36TTI-9B98
Luis Paulo-
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
5
215602HORTIFRUTI PASSAGEM                                                   RUA DA PASSAGEM ,133135                                                         BOTAFOGO                                38277,42662.741,04R$                  
4
215609HORTIFRUTI VOLUNTARIOS DA PATRIA                                      RUA VOLUNTARIOS DA PATRIA,323                                                   BOTAFOGO                                52382,63674.436,98R$                  
3002162,92073 R$ 20.241,71 
ROMANEIO2MOTORISTAAJUDANTE
CARRO73TTL-5J17
```

- `DATA` vem sempre uma vez, no topo, glued: `DATAdd/mm/aaaa`.
- `ROMANEIO<N>MOTORISTAAJUDANTE` abre um bloco — `N` é 1, 2, 3... reinicia todo dia, sem relação com carga da Nutry Max.
- `CARRO<código><PLACA>` — código é só dígitos (tamanho variável), placa começa na primeira letra.
- A linha seguinte é motorista+ajudante, sem separador confiável entre os dois quando ambos vêm preenchidos: `"Luis Paulo-"` (motorista + ajudante vazio), `"--"` (os dois vazios), `"Ednilson RicaldoniLucas Rafael"` (os dois preenchidos, colados).
- Depois vem a linha de cabeçalho de coluna (`ORDEMNOTA FISCAL...`), ignorar.
- Cada entrega é DUAS linhas: uma só com o número de ORDEM (ignorar), e uma com `<NF 6 dígitos><CLIENTE>  <ENDEREÇO>  <BAIRRO>  <números colados>` — os campos de texto (cliente/endereço/bairro) são sempre separados por 2+ espaços; os números do fim (QTD/PESO/VALOR) vêm colados sem separador confiável e não são usados por este KPI.
- Cada bloco `ROMANEIO` termina com uma linha de totais (só números colados + `R$` no fim, sem NF) — ignorar.

- [ ] **Step 1: Escrever os testes (todos falhando ainda) usando texto real extraído dos PDFs de amostra**

```ts
import { describe, it, expect } from 'vitest'
import { parsePaoTexto } from './parse-pao'

// Texto real extraido via pdf-parse de "PROGRAMAÇÃO JAC (CONGELADO) 15-09.pdf"
// (grupo WhatsApp KPI AJUSTES, 15/09) -- ROMANEIO 1 completo.
const ROMANEIO_1 = `
DATA15/09/2026
ROMANEIO1MOTORISTAAJUDANTE
CARRO36TTI-9B98
Luis Paulo-
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
5
215602HORTIFRUTI PASSAGEM                                                   RUA DA PASSAGEM ,133135                                                         BOTAFOGO                                38277,42662.741,04R$                  
4
215609HORTIFRUTI VOLUNTARIOS DA PATRIA                                      RUA VOLUNTARIOS DA PATRIA,323                                                   BOTAFOGO                                52382,63674.436,98R$                  
3002162,92073 R$ 20.241,71 
`

describe('parsePaoTexto', () => {
  it('extrai as duas entregas do ROMANEIO 1, com carga prefixada PAO- e endereco no formato da cascata de geocode', () => {
    const { linhas } = parsePaoTexto(ROMANEIO_1, '2026-09-15')
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toEqual({
      carga: 'PAO-1',
      destino: 'BOTAFOGO',
      placa: 'TTI-9B98',
      motorista: 'Luis Paulo',
      ajudantes: [],
      nf: '215602',
      clienteCodigo: '215602',
      clienteNome: 'HORTIFRUTI PASSAGEM',
      endereco: 'RUA DA PASSAGEM ,133135 - BOTAFOGO, RIO DE JANEIRO - *',
    })
    expect(linhas[1].nf).toBe('215609')
    expect(linhas[1].endereco).toBe('RUA VOLUNTARIOS DA PATRIA,323 - BOTAFOGO, RIO DE JANEIRO - *')
  })

  it('sintetiza uma LinhaEscala pro ROMANEIO, evitando falso aviso de "sem escala"', () => {
    const { escala } = parsePaoTexto(ROMANEIO_1, '2026-09-15')
    expect(escala).toHaveLength(1)
    expect(escala[0]).toEqual({
      carga: 'PAO-1',
      placaRaw: 'TTI-9B98',
      placaNorm: 'TTI9B98',
      destino: 'BOTAFOGO',
      motorista: 'Luis Paulo',
      ajudante1: null,
      ajudante2: null,
      pesoKg: null,
      entPlanejado: null,
      nfPlanejado: null,
    })
  })

  it('linha de motorista+ajudante ambos vazios ("--"): motorista e ajudante ficam vazios, nao quebra', () => {
    const texto = `
DATA15/09/2026
ROMANEIO3MOTORISTAAJUDANTE
CARRO74TTK-8A87
--
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
7
215585HORTIFRUTI ATAULFO DE PAIVA                                           AVENIDA ATAUFO DE PAIVA,80                                                      LEBLON                                  604394214.869,48R$                  
5063687,5353647.408,36R$
`
    const { linhas, escala } = parsePaoTexto(texto, '2026-09-15')
    expect(linhas[0].motorista).toBe('')
    expect(linhas[0].ajudantes).toEqual([])
    expect(escala[0].motorista).toBe('')
    expect(escala[0].ajudante1).toBeNull()
  })

  it('linha de motorista+ajudante ambos preenchidos e colados: separa na transicao minuscula->maiuscula (melhor esforco, nao afeta confirmacao de entrega)', () => {
    const texto = `
DATA15/09/2026
ROMANEIO5MOTORISTAAJUDANTE
CARRO43TTI-6E49
Ednilson RicaldoniLucas Rafael
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
7
215629MERCADO ADONAI DE VARGEM                                              RUA PECEGUEIRO DO AMARAL 01                                                     VARGEM PEQUENA                          133970,99317.799,61R$
133970,99317.799,61R$
`
    const { linhas, escala } = parsePaoTexto(texto, '2026-09-15')
    expect(linhas[0].motorista).toBe('Ednilson Ricaldoni')
    expect(linhas[0].ajudantes).toEqual(['Lucas Rafael'])
    expect(escala[0].ajudante1).toBe('Lucas Rafael')
  })

  it('bairro conhecido de Niteroi vira municipio Niteroi no endereco geocodificavel (nao assume sempre Rio de Janeiro)', () => {
    // Texto real extraido de "PROGRAMAÇÃO JAC (CONGELADO) 14-09.pdf"
    const texto = `
DATA14/09/2026
ROMANEIO1MOTORISTAAJUDANTE
CARRO36TTI-9B98
Luis Paulo-
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
6
215551PEROLA DE PENDOTIBA                                                   EST. CAETANO MONTEIRO,922                                                       BADU                                    643,8421.182,60R$
643,8421.182,60R$
`
    const { linhas } = parsePaoTexto(texto, '2026-09-14')
    expect(linhas[0].endereco).toBe('EST. CAETANO MONTEIRO,922 - BADU, NITEROI - *')
  })

  it('dois ROMANEIOs no mesmo arquivo nao vazam placa/motorista um pro outro', () => {
    const texto = `
DATA15/09/2026
ROMANEIO1MOTORISTAAJUDANTE
CARRO36TTI-9B98
Luis Paulo-
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
5
215602HORTIFRUTI PASSAGEM                                                   RUA DA PASSAGEM ,133                                                            BOTAFOGO                                38277,42662.741,04R$
38277,42662.741,04R$
ROMANEIO2MOTORISTAAJUDANTE
CARRO73TTL-5J17
Jorge Paiva-
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
4
215624PREZUNIC LARANJEIRAS                                                  R DAS LARANJEIRAS,139                                                           LARANJEIRAS                             40292280 1.960,00R$
40292280 1.960,00R$
`
    const { linhas } = parsePaoTexto(texto, '2026-09-15')
    expect(linhas).toHaveLength(2)
    expect(linhas[0].placa).toBe('TTI-9B98')
    expect(linhas[0].carga).toBe('PAO-1')
    expect(linhas[1].placa).toBe('TTL-5J17')
    expect(linhas[1].carga).toBe('PAO-2')
    expect(linhas[1].motorista).toBe('Jorge Paiva')
  })

  it('data do cabecalho do PDF diferente da data pedida: lanca erro claro', () => {
    expect(() => parsePaoTexto(ROMANEIO_1, '2026-09-16')).toThrow(/15\/09\/2026.*2026-09-16|dia 2026-09-15.*2026-09-16/)
  })

  it('sem cabecalho DATA nenhum: lanca erro claro (PDF errado)', () => {
    expect(() => parsePaoTexto('ROMANEIO1MOTORISTAAJUDANTE\nCARRO36TTI-9B98\n--\n', '2026-09-15')).toThrow(/DATA/)
  })

  it('romaneio sem nenhuma entrega valida (so cabecalho): nao gera linha nem escala, nao quebra', () => {
    const texto = `
DATA15/09/2026
ROMANEIO9MOTORISTAAJUDANTE
CARRO56RQO-1B27
--
ORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO
`
    const { linhas, escala } = parsePaoTexto(texto, '2026-09-15')
    expect(linhas).toEqual([])
    expect(escala).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar os testes pra confirmar que falham (o módulo ainda não existe)**

Run: `npx vitest run src/lib/kpi-romaneio/parse-pao.test.ts`
Expected: FAIL com "Cannot find module './parse-pao'".

- [ ] **Step 3: Implementar o parser**

```ts
import type { LinhaRomaneio, LinhaEscala } from './types'
import { normPlaca } from '@/lib/unitrac-api'

// Formato "PROGRAMAÇÃO JAC (CONGELADO)" (romaneio do pão, pedido da Erica
// 15/09 no grupo KPI AJUSTES) -- extraido via pdf-parse (mesma lib que
// parse-romaneio.ts, sem opcao de layout), o que cola varias colunas sem
// separador confiavel. Ver spec 2026-09-15-motor-confirmacao-romaneio-pao-design.md,
// secao "Risco tecnico", pras amostras reais que motivaram cada regex.
const DATA_RE = /^DATA(\d{2})\/(\d{2})\/(\d{4})$/
const ROMANEIO_RE = /^ROMANEIO(\d+)MOTORISTAAJUDANTE$/
const CARRO_RE = /^CARRO\d+([A-Z].*)$/
// NF sempre 6 digitos nas duas amostras reais (14 e 15/09) -- lookahead
// negativo evita casar com a linha de totais do fim de cada ROMANEIO
// (numeros de QTD/PESO/VALOR colados, ex. "3002162,92073 R$..." tem uma
// sequencia de 7+ digitos antes da virgula, nunca exatamente 6 seguidos
// de letra).
const NF_LINHA_RE = /^(\d{6})(?!\d)(.*)$/

// Bairros que sabidamente ficam fora do municipio do Rio de Janeiro --
// lista curta (so' os vistos nas duas amostras reais). Ampliar sob demanda
// quando aparecer bairro de outro municipio (ver spec, "Fora do escopo").
const BAIRROS_NITEROI = new Set(['BADU', 'PENDOTIBA', 'PIRATININGA', 'ITAIPU'])

function municipioPorBairro(bairro: string): string {
  return BAIRROS_NITEROI.has(bairro.toUpperCase().trim()) ? 'NITEROI' : 'RIO DE JANEIRO'
}

// A linha de motorista+ajudante nunca tem separador confiavel quando os
// dois vem preenchidos ("Ednilson RicaldoniLucas Rafael") -- so' "-"
// isolado (vazio) tem delimitador claro. Ajudante e' informacao de apoio
// no relatorio, nunca entra em nenhuma confirmacao de entrega -- a
// heuristica de transicao minuscula->maiuscula e' melhor esforco
// deliberado (spec, "Fora do escopo"), nao uma garantia.
function splitMotoristaAjudante(linha: string): { motorista: string; ajudante: string } {
  if (linha === '--') return { motorista: '', ajudante: '' }
  if (linha.startsWith('-')) return { motorista: '', ajudante: linha.slice(1).trim() }
  if (linha.endsWith('-')) return { motorista: linha.slice(0, -1).trim(), ajudante: '' }
  const m = linha.match(/^(.+?[a-zà-ÿ])([A-ZÀ-Ÿ].*)$/)
  if (m) return { motorista: m[1].trim(), ajudante: m[2].trim() }
  return { motorista: linha.trim(), ajudante: '' }
}

type ContextoPao = {
  carga: string
  placaRaw: string
  placaNorm: string
  motorista: string
  ajudante: string
  motoristaLido: boolean
}

export type ResultadoParsePao = { linhas: LinhaRomaneio[]; escala: LinhaEscala[] }

function fecharContexto(ctx: ContextoPao | null, destino: string | null, escala: LinhaEscala[]): void {
  if (!ctx || !destino) return
  escala.push({
    carga: ctx.carga,
    placaRaw: ctx.placaRaw,
    placaNorm: ctx.placaNorm,
    destino,
    motorista: ctx.motorista,
    ajudante1: ctx.ajudante || null,
    ajudante2: null,
    pesoKg: null,
    entPlanejado: null,
    nfPlanejado: null,
  })
}

/** Pura -- recebe o texto ja' extraido (pdf-parse) e a data esperada
 *  (YYYY-MM-DD), devolve as entregas no MESMO formato do romaneio Nutry Max
 *  (LinhaRomaneio) mais uma LinhaEscala sintetica por ROMANEIO (evita falso
 *  aviso de "sem escala" -- ver spec, secao 3). Lanca erro claro se a data
 *  do cabecalho do PDF nao bater com `data`, ou se nao achar cabecalho
 *  nenhum de DATA (PDF errado). */
export function parsePaoTexto(texto: string, data: string): ResultadoParsePao {
  const linhas: LinhaRomaneio[] = []
  const escala: LinhaEscala[] = []
  let ctx: ContextoPao | null = null
  let destinoPrimeiraEntrega: string | null = null
  let dataConfirmada = false

  for (const raw of texto.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    const d = line.match(DATA_RE)
    if (d) {
      const dataArquivo = `${d[3]}-${d[2]}-${d[1]}`
      if (dataArquivo !== data) {
        throw new Error(`Romaneio do Pão é do dia ${dataArquivo}, mas o relatório pedido é de ${data}. Confira se subiu o arquivo certo.`)
      }
      dataConfirmada = true
      continue
    }

    const r = line.match(ROMANEIO_RE)
    if (r) {
      fecharContexto(ctx, destinoPrimeiraEntrega, escala)
      ctx = { carga: `PAO-${r[1]}`, placaRaw: '', placaNorm: '', motorista: '', ajudante: '', motoristaLido: false }
      destinoPrimeiraEntrega = null
      continue
    }
    if (!ctx) continue

    const c = line.match(CARRO_RE)
    if (c) {
      ctx.placaRaw = c[1].trim()
      ctx.placaNorm = normPlaca(c[1])
      continue
    }

    if (ctx.placaRaw && !ctx.motoristaLido) {
      const ma = splitMotoristaAjudante(line)
      ctx.motorista = ma.motorista
      ctx.ajudante = ma.ajudante
      ctx.motoristaLido = true
      continue
    }

    const nf = line.match(NF_LINHA_RE)
    if (!nf) continue // ORDEM isolado, cabecalho de coluna, linha de total -- ignora sem erro

    const partes = nf[2].split(/\s{2,}/).map(s => s.trim()).filter(Boolean)
    // Menos de 3 pedacos, ou primeiro pedaco sem nenhuma letra: e' a linha
    // de total (numeros colados), nao uma entrega de verdade -- ignora.
    if (partes.length < 3 || !/[A-Za-zÀ-ÿ]/.test(partes[0])) continue

    const [clienteNome, enderecoRua, bairro] = partes
    const municipio = municipioPorBairro(bairro)
    if (destinoPrimeiraEntrega === null) destinoPrimeiraEntrega = bairro

    linhas.push({
      carga: ctx.carga,
      destino: destinoPrimeiraEntrega,
      placa: ctx.placaRaw,
      motorista: ctx.motorista,
      ajudantes: ctx.ajudante ? [ctx.ajudante] : [],
      nf: nf[1],
      clienteCodigo: nf[1],
      clienteNome,
      // Formato compativel com a cascata de geocode/guarda territorial ja'
      // existente (mesmo formato de kpi_romaneio_geocode_cache): "RUA/NUM
      // - BAIRRO, CIDADE - COMPLEMENTO". `enderecoRua` ja' vem com rua e
      // numero juntos do proprio documento (as vezes colados de forma
      // estranha, ver spec "Risco tecnico") -- passa adiante como veio,
      // nunca tenta adivinhar onde cortar um numero ambiguo.
      endereco: `${enderecoRua} - ${bairro}, ${municipio} - *`,
    })
  }
  fecharContexto(ctx, destinoPrimeiraEntrega, escala)

  if (!dataConfirmada) {
    throw new Error('Romaneio do Pão sem cabeçalho de data (linha "DATA dd/mm/aaaa") -- confira se é o PDF certo.')
  }

  return { linhas, escala }
}

export async function parsePao(buffer: Buffer, data: string): Promise<ResultadoParsePao> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
  const { text } = await pdfParse(buffer)
  return parsePaoTexto(text, data)
}
```

- [ ] **Step 4: Rodar os testes de novo, confirmar que passam**

Run: `npx vitest run src/lib/kpi-romaneio/parse-pao.test.ts`
Expected: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-romaneio/parse-pao.ts src/lib/kpi-romaneio/parse-pao.test.ts
git commit -m "feat(kpi-romaneio): parser do romaneio do pão (PROGRAMAÇÃO JAC CONGELADO)"
```

---

### Task 2: Integrar no endpoint de produção (`nutrimax/gerar/route.ts`) + campo no painel

**Files:**
- Modify: `src/app/api/kpi/nutrimax/gerar/route.ts`
- Modify: `src/app/painel/nutrimax/gerar/page.tsx`
- Test: `src/app/api/kpi/nutrimax/gerar/route.test.ts`

**Interfaces:**
- Consumes: `parsePao`, `ResultadoParsePao` de `@/lib/kpi-romaneio/parse-pao` (Task 1).
- Produces: nada novo pra outras tasks -- esta e' a integração de produção.

O upload é opcional; sem ele, tudo deve continuar bit-a-bit igual ao que já
existe. `route.test.ts` já testa esse endpoint mockando os módulos de
parsing/geocode/GPS — ler os mocks existentes lá antes de escrever o teste
novo, pra usar o MESMO padrão de mock (não reinventar).

- [ ] **Step 1: Ler `route.test.ts` atual pra entender o padrão de mock usado**

```bash
grep -n "vi.mock\|vi.hoisted" "src/app/api/kpi/nutrimax/gerar/route.test.ts"
```

- [ ] **Step 2: Escrever o teste que falha primeiro — carga do pão aparece misturada com a Nutry Max, mesma placa**

Adicionar ao arquivo de teste existente (seguindo o padrão de mock já usado
lá — mock de `parsePao` retornando uma linha + uma escala sintética pra uma
placa que também tem carga normal da Nutry Max no mesmo teste; fazer o
`POST` com um terceiro campo de form `romaneioPao` preenchido; verificar no
xlsx resultante que a aba daquela placa tem AS DUAS cargas, `97900` (Nutry
Max) e `PAO-1`).

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/app/api/kpi/nutrimax/gerar/route.test.ts`
Expected: FAIL (campo `romaneioPao` ainda não é lido, `PAO-1` não aparece).

- [ ] **Step 4: Implementar — ler o campo, parsear se veio, concatenar antes do resto do pipeline**

Import novo no topo do arquivo:

```ts
import { parsePao } from '@/lib/kpi-romaneio/parse-pao'
```

Onde hoje está (dentro do bloco `else` que lê o form, achado pelo texto
`const escalaFile = form.get('escala')`):

```ts
    data = String(form.get('data') ?? '')
    const escalaFile = form.get('escala')
    const romaneioFile = form.get('romaneio')

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
    }
    if (!(romaneioFile instanceof File)) {
      return new NextResponse('Romaneio de Entrega (PDF) obrigatório', { status: 400 })
    }

    ;[escalaBuf, romaneioBuf] = await Promise.all([
      escalaFile instanceof File ? escalaFile.arrayBuffer().then(b => Buffer.from(b)) : Promise.resolve(null),
      romaneioFile.arrayBuffer().then(b => Buffer.from(b)),
    ])
```

Adicionar logo abaixo (ainda dentro do mesmo bloco `else`, depois do
`Promise.all` acima):

```ts
    const romaneioPaoFile = form.get('romaneioPao')
    romaneioPaoBuf = romaneioPaoFile instanceof File ? Buffer.from(await romaneioPaoFile.arrayBuffer()) : null
```

E declarar a variável junto das outras (`let escalaBuf: Buffer | null` etc.,
no topo da função):

```ts
  let romaneioPaoBuf: Buffer | null = null
```

`regenerarDeId` (o outro branch, que baixa PDFs antigos do Storage) NÃO
guarda o romaneio do pão — regeneração de uma geração antiga sai igual a
antes, sem o pão (fora do escopo desta fase, ver spec — o pão só entra em
gerações NOVAS a partir de agora).

Onde hoje está:

```ts
  const [escala, romaneio] = await Promise.all([
    escalaBuf ? parseEscala(escalaBuf) : Promise.resolve([]),
    parseRomaneio(romaneioBuf),
  ])
```

trocar para:

```ts
  const [escala, romaneio, resultadoPao] = await Promise.all([
    escalaBuf ? parseEscala(escalaBuf) : Promise.resolve([]),
    parseRomaneio(romaneioBuf),
    romaneioPaoBuf ? parsePao(romaneioPaoBuf, data) : Promise.resolve({ linhas: [], escala: [] }),
  ])
  const escalaCompleta = [...escala, ...resultadoPao.escala]
  const romaneioCompleto = [...romaneio, ...resultadoPao.linhas]
```

E a partir daqui, todo uso de `romaneio` (não `romaneioGeo`, que já deriva
de `romaneio`) e `escala` nesta função passa a usar `romaneioCompleto` e
`escalaCompleta`. Os pontos exatos (achar pelo texto):

```ts
  if (romaneio.length === 0) {
```
vira
```ts
  if (romaneioCompleto.length === 0) {
```

```ts
  const enderecosUnicos = [...new Set(romaneio.map(l => l.endereco))]
```
vira
```ts
  const enderecosUnicos = [...new Set(romaneioCompleto.map(l => l.endereco))]
```

```ts
  const romaneioGeo: LinhaGeocodificada[] = romaneio.map(l => {
```
vira
```ts
  const romaneioGeo: LinhaGeocodificada[] = romaneioCompleto.map(l => {
```

```ts
  const escalaPorChave = new Map(escala.map(e => [`${e.carga}::${e.placaNorm}`, e]))
```
vira
```ts
  const escalaPorChave = new Map(escalaCompleta.map(e => [`${e.carga}::${e.placaNorm}`, e]))
```

```ts
  const avisos = escalaBuf ? detectarDescasamentos(escala, cargasRomaneioList) : []
```
vira
```ts
  const avisos = (escalaBuf || romaneioPaoBuf) ? detectarDescasamentos(escalaCompleta, cargasRomaneioList) : []
```

(o `||` é necessário porque agora pode haver aviso relevante mesmo sem
Escala Nutry Max, se só o romaneio do pão vier — sem isso, a escala
sintética do pão nunca seria comparada contra nada e um `PAO-N` que por
algum motivo não tem NF nenhuma sobrevivendo no romaneio geocodificado
ficaria silenciosamente sem aviso.)

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/app/api/kpi/nutrimax/gerar/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Rodar a suíte inteira e o build, confirmar zero regressão**

Run: `npm test && npm run build`
Expected: todos os testes já existentes continuam passando (nenhum usa `romaneioPao`, então o comportamento sem ele tem que ficar idêntico); build limpo.

- [ ] **Step 7: Campo de upload no painel**

Em `src/app/painel/nutrimax/gerar/page.tsx`, adicionar estado:

```ts
  const [romaneioPao, setRomaneioPao] = useState<File[]>([])
```

Adicionar ao `FormData` dentro de `gerar()`, logo depois de `fd.set('romaneio', romaneio[0])`:

```ts
      if (romaneioPao[0]) fd.set('romaneioPao', romaneioPao[0])
```

Adicionar um quarto card de upload na grid (a grid já é `lg:grid-cols-12` com 3 colunas de `lg:col-span-4` — trocar pra 4 colunas de `lg:col-span-3`, ajustando as 3 existentes de `col-span-4` pra `col-span-3`, e inserir o quarto):

```tsx
        <div className="col-span-1 lg:col-span-3">
          <FileDropzone
            eyebrow="Passo 4 · opcional"
            label="Romaneio do Pão"
            hint="PDF · PROGRAMAÇÃO JAC (CONGELADO) — serve como escala e romaneio juntos"
            accept=".pdf"
            files={romaneioPao}
            onAdd={files => setRomaneioPao(files.slice(0, 1))}
            onRemove={() => setRomaneioPao([])}
          />
        </div>
```

- [ ] **Step 8: Testar manualmente no navegador**

Rodar `npm run dev`, abrir `/painel/nutrimax/gerar`, confirmar que os 4
cards aparecem sem quebrar o layout em telas estreitas (~400px) e largas, e
que gerar SEM o quarto arquivo continua funcionando normal.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/kpi/nutrimax/gerar/route.ts src/app/api/kpi/nutrimax/gerar/route.test.ts src/app/painel/nutrimax/gerar/page.tsx
git commit -m "feat(kpi-nutrimax): aceita romaneio do pão opcional no endpoint e no painel"
```

- [ ] **Step 10: Espelhar em KPI TEMP**

```bash
ls -d "../KPI TEMP" 2>/dev/null || echo "confira o caminho do repo TEMP antes de prosseguir"
```

Copiar os MESMOS três arquivos modificados/criados nesta task e na Task 1
(`parse-pao.ts`, `parse-pao.test.ts`, `route.ts`, `route.test.ts`,
`page.tsx`) para o repo `KPI TEMP` nos mesmos caminhos relativos, rodar
`npm test && npm run build` lá, e commitar com a mesma mensagem + sufixo
"Espelho do commit <hash> no repo principal" (ver disciplina já usada em
todos os commits anteriores desta sessão). **Antes de assumir que o
arquivo não existe no TEMP, rodar `ls -d` — não confiar de olho, achado
real desta mesma sessão foi um implementador afirmar que um arquivo "não
existe no TEMP" por um `find` mal-sucedido, quando existia.**

---

### Task 3: Integrar no script de regeneração (`gerar-nutrimax-real-arquivo.ts`)

**Files:**
- Modify: `scripts/gerar-nutrimax-real-arquivo.ts`

**Interfaces:**
- Consumes: `parsePao` de `@/lib/kpi-romaneio/parse-pao` (Task 1), mesma interface da Task 2.
- Produces: nada novo.

Este script espelha manualmente a lógica de `route.ts` (ver comentário no
topo do arquivo) pra poder rodar a pipeline sem HTTP/auth — mesma mudança
da Task 2, adaptada pro formato de CLI (arquivo de caminho, não upload).

- [ ] **Step 1: Atualizar a mensagem de uso e a leitura de argumentos**

Onde hoje está:

```ts
  const [escalaPath, romaneioPath, data, saidaPath] = process.argv.slice(2)
  if (!escalaPath || !romaneioPath || !data || !saidaPath) {
    console.error('Uso: npx tsx --env-file=.env.production scripts/gerar-nutrimax-real-arquivo.ts <escala.pdf> <romaneio.pdf> <data:YYYY-MM-DD> <saida.xlsx>')
    process.exit(1)
  }

  const escalaBuf = Buffer.from(readFileSync(escalaPath))
  const romaneioBuf = Buffer.from(readFileSync(romaneioPath))

  const escala = await parseEscala(escalaBuf)
  const romaneio = await parseRomaneio(romaneioBuf)
  console.log(`Escala: ${escala.length} linhas, Romaneio: ${romaneio.length} linhas`)
```

trocar para:

```ts
  const [escalaPath, romaneioPath, data, saidaPath, romaneioPaoPath] = process.argv.slice(2)
  if (!escalaPath || !romaneioPath || !data || !saidaPath) {
    console.error('Uso: npx tsx --env-file=.env.production scripts/gerar-nutrimax-real-arquivo.ts <escala.pdf> <romaneio.pdf> <data:YYYY-MM-DD> <saida.xlsx> [romaneio-pao.pdf]')
    process.exit(1)
  }

  const escalaBuf = Buffer.from(readFileSync(escalaPath))
  const romaneioBuf = Buffer.from(readFileSync(romaneioPath))
  const romaneioPaoBuf = romaneioPaoPath ? Buffer.from(readFileSync(romaneioPaoPath)) : null

  const escala = await parseEscala(escalaBuf)
  const romaneio = await parseRomaneio(romaneioBuf)
  const resultadoPao = romaneioPaoBuf ? await parsePao(romaneioPaoBuf, data) : { linhas: [], escala: [] }
  const escalaCompleta = [...escala, ...resultadoPao.escala]
  const romaneioCompleto = [...romaneio, ...resultadoPao.linhas]
  console.log(`Escala: ${escalaCompleta.length} linhas, Romaneio: ${romaneioCompleto.length} linhas (${resultadoPao.linhas.length} do pão)`)
```

Adicionar o import no topo, junto dos outros de `kpi-romaneio`:

```ts
import { parsePao } from '../src/lib/kpi-romaneio/parse-pao'
```

- [ ] **Step 2: Trocar todo uso de `romaneio`/`escala` (não `romaneioGeo`) pra `romaneioCompleto`/`escalaCompleta` no resto do arquivo**

Mesmos três pontos da Task 2, adaptados pra este arquivo (achar pelo
texto exato, os nomes de variável são idênticos aos de `route.ts` porque
o script foi escrito espelhando ele):

```ts
  const enderecosUnicos = [...new Set(romaneio.map(l => l.endereco))]
```
vira
```ts
  const enderecosUnicos = [...new Set(romaneioCompleto.map(l => l.endereco))]
```

```ts
  const romaneioGeo: LinhaGeocodificada[] = romaneio.map(l => {
```
vira
```ts
  const romaneioGeo: LinhaGeocodificada[] = romaneioCompleto.map(l => {
```

Buscar por `escalaPorChave = new Map(escala.map` mais adiante no arquivo
(monta a partir de `escala`, não de `romaneio`) e trocar `escala.map` por
`escalaCompleta.map`.

Buscar por `detectarDescasamentos(escala,` e trocar `escala` por
`escalaCompleta` na chamada.

- [ ] **Step 3: Rodar contra os PDFs reais dos dois dias já disponíveis (14 e 15/09) e conferir manualmente**

```bash
npx tsx --env-file=.env.production scripts/gerar-nutrimax-real-arquivo.ts /tmp/escala-14.pdf /tmp/romaneio-14.pdf 2026-09-14 /tmp/kpi-14-com-pao.xlsx /tmp/pao-14-09.pdf
```

(os PDFs `/tmp/escala-14.pdf`/`/tmp/romaneio-14.pdf` já estão no VPS de uma
verificação anterior desta mesma sessão; o PDF do pão precisa ser baixado
de novo do WhatsApp -- grupo "KPI AJUSTES", mensagens de hoje com os
arquivos "PROGRAMAÇÃO JAC (CONGELADO) 14-09.pdf"/"...15-09.pdf" -- e
copiado pro VPS antes de rodar.)

Abrir o xlsx resultante e conferir, pra pelo menos uma das 10 placas que
aparecem tanto no romaneio Nutry Max quanto no do pão nesse dia (ver spec:
TTI-9B98, TTL-5J17, TTK-8A87, RQO-9H37, TTI-6E49, RQU-5J45, TOS-5E38,
TUM-1C79, RQO-1B27, RQV-8A12), que a aba dela agora tem cargas `PAO-N`
junto das cargas normais da Nutry Max, com STATUS calculado (confirmado ou
não pelo mesmo GPS que já confirma o resto do dia dela).

- [ ] **Step 4: Commit**

```bash
git add scripts/gerar-nutrimax-real-arquivo.ts
git commit -m "feat(kpi-nutrimax): script de regeneração aceita romaneio do pão opcional"
```

- [ ] **Step 5: Espelhar em KPI TEMP**

Mesma disciplina do Step 10 da Task 2 -- copiar o arquivo modificado,
rodar `npm run build` no TEMP (o script não tem teste próprio, mas
precisa compilar), commitar com "Espelho do commit `<hash>`".

---

## Fora do escopo desta fase

- Suporte a QTD CAIXAS/PESO BRUTO/PESO LÍQUIDO/VALOR BRUTO no relatório.
- Regenerar uma geração ANTIGA (via `regenerarDeId`) incluindo romaneio do
  pão -- só entra em gerações novas a partir de agora.
- Detecção automática de município além da lista curta hardcoded
  (Rio de Janeiro / Niterói).
- Separação precisa de motorista/ajudante quando os dois vêm colados sem
  separador -- heurística de melhor esforço, documentada como tal.
