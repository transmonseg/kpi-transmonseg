# KPI Portefrio (romaneio + Ravex) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o pipeline completo de geração de KPI da Portefrio: parser do romaneio (PDF tabular), integração com a API Ravex (autenticação, resolução de placa, histórico de GPS + temperatura), clusterização de visita, agregação por cliente e geração de XLSX, com as telas reais de Gerar KPI e Histórico.

**Architecture:** Mesmo formato de pipeline já usado pela Nutry Max (parse → geocodifica → confirma via GPS externo → agrega → gera XLSX), com dois componentes trocados pela fonte de dado ser diferente: parser tabular (coordenadas x/y, não texto livre) e adaptador Ravex (não Unitrac) — incluindo autenticação por Bearer token que a Unitrac não precisa.

**Tech Stack:** Next.js 16 App Router, TypeScript, `pdfjs-serverless` (extração de PDF por coordenada), ExcelJS, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-kpi-portefrio-design.md`

## Global Constraints

- `RAIO_ENTREGA_METROS = 300` — mesmo valor já validado do lado Nutry Max, declarado localmente em `src/lib/kpi-portefrio/constants.ts` (não cross-importar de `kpi-romaneio/constants.ts`).
- Geração de KPI é **admin-only** em todo o sistema — `/api/kpi/portefrio/gerar` deve checar `perfil.papel !== 'admin' || !empresaLiberada(perfil, 'portefrio')` → 403, mesmo padrão de `/api/kpi/nutrimax/gerar`.
- Falha ao autenticar na Ravex (credencial inválida, conta bloqueada) propaga como erro explícito — NUNCA fail-open (diferente de erro de rede pontual, que É fail-open). Ver seção "Tratamento de erro" da spec.
- Placa sem correspondência na Ravex fica sem GPS mas não bloqueia a carga (fail-open por placa, mesmo princípio da Nutry Max com frota Unitrac).
- Reusar sem modificar: `src/lib/kpi-romaneio/geocode.ts` (`geocodificarEnderecos`) e `haversine` de `@/lib/utils/geo`.
- Reusar tabela `kpi_romaneio_geracoes` existente com `cliente='portefrio'` — **sem migration nova**.
- Nenhuma migration, nenhum deploy em produção nesta plano sem perguntar ao usuário explicitamente.
- Repositório de trabalho: `/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg` (branch main), espelhado byte-a-byte em `/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP` (branch main) — toda mudança replicada nos 2, verificada com `diff` E `git status --short`, commit e push nos 2 sempre.
- Comandos: `npm test`, `npm run lint`, `npm run build`.

---

### Task 1: Parser do romaneio Portefrio

**Files:**
- Create: `src/lib/kpi-portefrio/types.ts`
- Create: `src/lib/kpi-portefrio/parse-romaneio.ts`
- Test: `src/lib/kpi-portefrio/parse-romaneio.test.ts`

**Interfaces:**
- Produces: `LinhaRomaneioPortefrio` (tipo), `parseRomaneioPortefrioTexto(itensPorPagina)` (pura, testável), `parseRomaneioPortefrio(buffer: Buffer): Promise<LinhaRomaneioPortefrio[]>` (async, faz a extração real). Tasks 4, 5, 6, 7 consomem `LinhaRomaneioPortefrio`.

**Contexto (investigação já feita, não repetir):** O romaneio real (`ROMANEIO PORTEFRIO.pdf`, dado de cliente, não commitar) é uma tabela por placa. Diferente do parser da Nutry Max (`kpi-romaneio/parse-escala.ts`, onde cada registro é UMA linha visual), aqui **cada registro se espalha por 3 a 5 linhas visuais** — texto de "Razão social", "Nome informal" e "Endereço" quebra em múltiplas linhas ACIMA e ABAIXO de uma "linha âncora" central, dependendo do tamanho do texto. Investigação real (`pdfjs-serverless`, página 1) confirmou o padrão exato:

```
y=807: [x=106]"L SCHUINDT"                                    <- Razão social, linha 1 (acima da âncora)
y=802: [x=191]"GOSTOSURAS DE" [x=273]"AVENIDA"                 <- Nome informal + Endereço, linha 1 (acima)
y=798: [x=7]"RKM0I23" [x=44]"729176" [x=71]"01284101"          <- ÂNCORA: tem Placa (x<25) e Ordem (x>530)
       [x=106]"RIBEIRO SALGADOS" [x=343]"418" [x=374]"27936520"
       [x=410]"BELA VISTA" [x=481]"MACAE" [x=526]"RJ" [x=539]"1"
y=793: [x=191]"SALGADOS" [x=273]"ALFREDO LYRIO"                <- Nome informal + Endereço, cont. (abaixo)
y=789: [x=106]"- ME"                                           <- Razão social, cont. (abaixo)
```

Cabeçalho da tabela (`y≈822`): `Placa(15) Código(44) CNPJ(77) Razão social(126) Nome informal(204) Endereço(290) Número(343) CEP(383) Bairro(433) Cidade(490) UF(526)`, mais "Ordem de atendimento" (quebrado em 2 linhas no cabeçalho, valor de dado aparece em `x≈539`).

Faixas de coluna calibradas pelos dados reais observados (início de cada coluna nos dados, não no cabeçalho — ligeiramente deslocado):

```ts
const FAIXAS = {
  placa:        [0, 25],
  codigo:       [25, 57],
  cnpj:         [57, 88],
  razaoSocial:  [88, 148],
  nomeInformal: [148, 232],
  endereco:     [232, 308],
  numero:       [308, 358],
  cep:          [358, 392],
  bairro:       [392, 445],
  cidade:       [445, 503],
  uf:           [503, 532],
  ordem:        [532, 9999],
}
```

Placa segue o padrão Mercosul sem separador: `/^[A-Z]{3}\d[A-Z0-9]\d{2}$/` (ex: `RKM0I23`, `LUE5C42`).

**Algoritmo (linha-âncora + atribuição por proximidade em Y — generaliza o problema de célula multi-linha):**

1. Extrai todos os itens de texto com coordenadas x/y de TODAS as páginas, exatamente como `kpi-romaneio/parse-escala.ts` já faz (`getDocument`/`getPage`/`getTextContent`, iterando `content.items`, coletando `{ str, x: transform[4], y: transform[5], page }`).
2. Agrupa itens em "linhas visuais" por Y (mesma função `agruparPorLinha` de `parse-escala.ts`, tolerância 2-3) — mas SEPARADO POR PÁGINA (`page` no agrupamento).
3. Dentro de cada página, identifica as "linhas-âncora": toda linha visual que tem pelo menos um item na faixa `placa` (x < 25) cujo texto bate com o regex de placa.
4. Para cada linha-âncora, define o "span" do registro: a linha pertence ao registro da âncora mais próxima em Y (distância mínima) — isso atribui corretamente as linhas de continuação acima E abaixo de uma âncora ao registro certo, e separa corretamente onde termina o registro anterior e começa o próximo. Linhas antes da primeira âncora da página (cabeçalho) são descartadas.
5. Dentro do span de um registro, para cada coluna (faixa de x), concatena os itens daquela faixa em TODAS as linhas do span, ordenados por Y decrescente (de cima pra baixo — ordem de leitura), unidos por espaço, e usa o valor da linha-âncora pra `codigo`/`cnpj`/`numero`/`cep`/`bairro`/`cidade`/`uf`/`ordem` (essas colunas nunca quebram linha, só aparecem na âncora).

**Interfaces:**
```ts
// src/lib/kpi-portefrio/types.ts
export type LinhaRomaneioPortefrio = {
  placa: string
  codigoCliente: string
  cnpj: string
  razaoSocial: string
  nomeInformal: string
  endereco: string // rua/avenida (coluna Endereço, sem número/bairro/cidade)
  numero: string
  cep: string
  bairro: string
  cidade: string
  uf: string
  ordem: number
}
```

- [ ] **Step 1: Escrever o teste com fixture sintética**

Fixture inventada, no MESMO formato/estrutura observado no PDF real (nomes de cliente, CNPJ e endereço fictícios — nunca os dados reais vistos na investigação). Construa a fixture como um array de itens `{ str, x, y, page }`, simulando o que `content.items` devolveria pra 2 registros de uma placa (um registro simples, sem quebra de linha extra; um registro com "Razão social" longa quebrando em 2 linhas).

```ts
// src/lib/kpi-portefrio/parse-romaneio.test.ts
import { describe, it, expect } from 'vitest'
import { parseRomaneioPortefrioTexto, type ItemComPagina } from './parse-romaneio'

const ITENS_EXEMPLO: ItemComPagina[] = [
  // cabeçalho (deve ser ignorado -- nenhum item tem placa valida em x<25)
  { str: 'Placa', x: 15, y: 822, page: 1 },
  { str: 'Ordem de', x: 546, y: 827, page: 1 },
  { str: 'atendimento', x: 542, y: 818, page: 1 },

  // registro 1: sem quebra de linha extra, tudo numa linha so
  { str: 'AAA1B23', x: 7, y: 700, page: 1 },
  { str: '111111', x: 44, y: 700, page: 1 },
  { str: '11111111', x: 71, y: 700, page: 1 },
  { str: 'EMPRESA TESTE LTDA', x: 106, y: 700, page: 1 },
  { str: 'LOJA TESTE', x: 191, y: 700, page: 1 },
  { str: 'RUA TESTE', x: 273, y: 700, page: 1 },
  { str: '10', x: 343, y: 700, page: 1 },
  { str: '20000000', x: 374, y: 700, page: 1 },
  { str: 'CENTRO', x: 410, y: 700, page: 1 },
  { str: 'CIDADE X', x: 481, y: 700, page: 1 },
  { str: 'RJ', x: 526, y: 700, page: 1 },
  { str: '1', x: 539, y: 700, page: 1 },

  // registro 2: razao social quebra em 2 linhas (acima E abaixo da ancora)
  { str: 'RAZAO SOCIAL', x: 106, y: 685, page: 1 }, // continuacao ACIMA
  { str: 'BBB4C56', x: 7, y: 680, page: 1 }, // ANCORA
  { str: '222222', x: 44, y: 680, page: 1 },
  { str: '22222222', x: 71, y: 680, page: 1 },
  { str: 'PARTE 1 DA', x: 106, y: 680, page: 1 },
  { str: 'LOJA DOIS', x: 191, y: 680, page: 1 },
  { str: 'AVENIDA TESTE', x: 273, y: 680, page: 1 },
  { str: '20', x: 343, y: 680, page: 1 },
  { str: '30000000', x: 374, y: 680, page: 1 },
  { str: 'JARDIM', x: 410, y: 680, page: 1 },
  { str: 'CIDADE Y', x: 481, y: 680, page: 1 },
  { str: 'RJ', x: 526, y: 680, page: 1 },
  { str: '2', x: 539, y: 680, page: 1 },
  { str: 'EXTENSA LTDA', x: 106, y: 675, page: 1 }, // continuacao ABAIXO
]

describe('parseRomaneioPortefrioTexto', () => {
  it('ignora o cabecalho (nenhuma linha-ancora antes do primeiro registro)', () => {
    const linhas = parseRomaneioPortefrioTexto(ITENS_EXEMPLO)
    expect(linhas).toHaveLength(2)
  })

  it('registro sem quebra de linha extrai todos os campos da ancora', () => {
    const linhas = parseRomaneioPortefrioTexto(ITENS_EXEMPLO)
    expect(linhas[0]).toEqual({
      placa: 'AAA1B23',
      codigoCliente: '111111',
      cnpj: '11111111',
      razaoSocial: 'EMPRESA TESTE LTDA',
      nomeInformal: 'LOJA TESTE',
      endereco: 'RUA TESTE',
      numero: '10',
      cep: '20000000',
      bairro: 'CENTRO',
      cidade: 'CIDADE X',
      uf: 'RJ',
      ordem: 1,
    })
  })

  it('registro com razao social quebrada em 2 linhas concatena na ordem de leitura (cima pra baixo)', () => {
    const linhas = parseRomaneioPortefrioTexto(ITENS_EXEMPLO)
    expect(linhas[1].razaoSocial).toBe('RAZAO SOCIAL PARTE 1 DA EXTENSA LTDA')
    expect(linhas[1].placa).toBe('BBB4C56')
    expect(linhas[1].ordem).toBe(2)
  })
})
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `npm test -- parse-romaneio.test.ts` (dentro de `src/lib/kpi-portefrio/`)
Expected: FAIL — módulo `./parse-romaneio` não existe ainda.

- [ ] **Step 3: Criar `src/lib/kpi-portefrio/types.ts`**

Com o tipo `LinhaRomaneioPortefrio` mostrado acima.

- [ ] **Step 4: Implementar `src/lib/kpi-portefrio/parse-romaneio.ts`**

```ts
import { getDocument } from 'pdfjs-serverless'
import type { LinhaRomaneioPortefrio } from './types'

export type ItemComPagina = { str: string; x: number; y: number; page: number }
type LinhaVisual = { y: number; page: number; items: ItemComPagina[] }

const PLACA_RE = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/

const FAIXAS = {
  placa: [0, 25] as const,
  codigo: [25, 57] as const,
  cnpj: [57, 88] as const,
  razaoSocial: [88, 148] as const,
  nomeInformal: [148, 232] as const,
  endereco: [232, 308] as const,
  numero: [308, 358] as const,
  cep: [358, 392] as const,
  bairro: [392, 445] as const,
  cidade: [445, 503] as const,
  uf: [503, 532] as const,
  ordem: [532, 9999] as const,
}

function itensEmFaixa(items: ItemComPagina[], faixa: readonly [number, number]): ItemComPagina[] {
  return items.filter(it => it.x >= faixa[0] && it.x < faixa[1])
}

function textoEmFaixaOrdenado(linhasDoRegistro: LinhaVisual[], faixa: readonly [number, number]): string {
  // linhasDoRegistro ja vem ordenado por Y decrescente (cima pra baixo)
  const partes: string[] = []
  for (const linha of linhasDoRegistro) {
    const texto = itensEmFaixa(linha.items, faixa)
      .sort((a, b) => a.x - b.x)
      .map(it => it.str.trim())
      .filter(Boolean)
      .join(' ')
    if (texto) partes.push(texto)
  }
  return partes.join(' ').trim()
}

function agruparPorLinha(items: ItemComPagina[], tol = 2): LinhaVisual[] {
  const sorted = [...items].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page
    if (Math.abs(a.y - b.y) > tol) return b.y - a.y
    return a.x - b.x
  })
  const linhas: LinhaVisual[] = []
  for (const it of sorted) {
    const last = linhas[linhas.length - 1]
    if (last && it.page === last.page && Math.abs(last.y - it.y) <= tol) {
      last.items.push(it)
    } else {
      linhas.push({ y: it.y, page: it.page, items: [it] })
    }
  }
  return linhas
}

/** Pura -- recebe os itens ja extraidos (com coordenadas) e devolve as
 *  linhas do romaneio. Separada do I/O de PDF pra ser testavel sem PDF
 *  real. Cada registro se espalha por 1 a N linhas visuais (Razao
 *  social/Nome informal/Endereco podem quebrar linha) -- atribui cada
 *  linha ao registro cuja linha-ancora (a que tem Placa valida) esta
 *  mais proxima em Y, o que cobre quebra tanto acima quanto abaixo da
 *  ancora. */
export function parseRomaneioPortefrioTexto(itens: ItemComPagina[]): LinhaRomaneioPortefrio[] {
  const linhasPorPagina = new Map<number, LinhaVisual[]>()
  for (const linha of agruparPorLinha(itens)) {
    const arr = linhasPorPagina.get(linha.page) ?? []
    arr.push(linha)
    linhasPorPagina.set(linha.page, arr)
  }

  const resultado: LinhaRomaneioPortefrio[] = []

  for (const linhas of linhasPorPagina.values()) {
    // linhas ja vem ordenado por Y decrescente (cima pra baixo) de agruparPorLinha
    const ancoras: { indice: number; linha: LinhaVisual }[] = []
    linhas.forEach((linha, indice) => {
      const temPlacaValida = itensEmFaixa(linha.items, FAIXAS.placa).some(it => PLACA_RE.test(it.str.trim()))
      if (temPlacaValida) ancoras.push({ indice, linha })
    })

    for (let i = 0; i < ancoras.length; i++) {
      const { linha: ancora } = ancoras[i]
      const yAncora = ancora.y
      const yAnteriorAncora = i > 0 ? ancoras[i - 1].linha.y : Infinity
      const yProximaAncora = i < ancoras.length - 1 ? ancoras[i + 1].linha.y : -Infinity

      // Toda linha da pagina cuja distancia em Y ate ESTA ancora e menor
      // que ate qualquer outra ancora pertence a este registro.
      const linhasDoRegistro = linhas.filter(l => {
        const dist = Math.abs(l.y - yAncora)
        const distAnterior = Math.abs(l.y - yAnteriorAncora)
        const distProxima = Math.abs(l.y - yProximaAncora)
        return dist <= distAnterior && dist <= distProxima
      })

      const placaItem = itensEmFaixa(ancora.items, FAIXAS.placa).find(it => PLACA_RE.test(it.str.trim()))
      if (!placaItem) continue

      const codigo = itensEmFaixa(ancora.items, FAIXAS.codigo)[0]?.str.trim() ?? ''
      const cnpj = itensEmFaixa(ancora.items, FAIXAS.cnpj)[0]?.str.trim() ?? ''
      const numero = itensEmFaixa(ancora.items, FAIXAS.numero)[0]?.str.trim() ?? ''
      const cep = itensEmFaixa(ancora.items, FAIXAS.cep)[0]?.str.trim() ?? ''
      const bairro = itensEmFaixa(ancora.items, FAIXAS.bairro).map(it => it.str.trim()).join(' ')
      const cidade = itensEmFaixa(ancora.items, FAIXAS.cidade).map(it => it.str.trim()).join(' ')
      const uf = itensEmFaixa(ancora.items, FAIXAS.uf)[0]?.str.trim() ?? ''
      const ordemStr = itensEmFaixa(ancora.items, FAIXAS.ordem)[0]?.str.trim() ?? ''

      resultado.push({
        placa: placaItem.str.trim(),
        codigoCliente: codigo,
        cnpj,
        razaoSocial: textoEmFaixaOrdenado(linhasDoRegistro, FAIXAS.razaoSocial),
        nomeInformal: textoEmFaixaOrdenado(linhasDoRegistro, FAIXAS.nomeInformal),
        endereco: textoEmFaixaOrdenado(linhasDoRegistro, FAIXAS.endereco),
        numero,
        cep,
        bairro,
        cidade,
        uf,
        ordem: parseInt(ordemStr, 10) || 0,
      })
    }
  }

  return resultado
}

export async function parseRomaneioPortefrio(buffer: Buffer): Promise<LinhaRomaneioPortefrio[]> {
  const pdf = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise
  const itens: ItemComPagina[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    for (const item of content.items) {
      if (!('str' in item)) continue
      const it = item as { str: string; transform: number[] }
      if (!it.str.trim()) continue
      itens.push({ str: it.str, x: it.transform[4], y: it.transform[5], page: p })
    }
  }
  return parseRomaneioPortefrioTexto(itens)
}
```

- [ ] **Step 5: Rodar o teste, confirmar que passa**

Run: `npm test -- parse-romaneio.test.ts`
Expected: PASS, 3/3 testes.

- [ ] **Step 6: Validar contra o PDF real (não commitar nada disso)**

Rode manualmente (script de uso único, não faz parte do código do app):

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg"
cat > /tmp/checar-parser-portefrio.mjs << 'SCRIPT'
import { parseRomaneioPortefrio } from './src/lib/kpi-portefrio/parse-romaneio.ts'
import { readFileSync } from 'fs'
const buf = readFileSync('/Users/joaquimsalles/Downloads/ROMANEIO PORTEFRIO.pdf')
const linhas = await parseRomaneioPortefrio(buf)
console.log(`Total: ${linhas.length} linhas`)
console.log(JSON.stringify(linhas.slice(0, 3), null, 2))
console.log(JSON.stringify(linhas.slice(-3), null, 2))
SCRIPT
npx tsx /tmp/checar-parser-portefrio.mjs
rm /tmp/checar-parser-portefrio.mjs
```

Expected: número de linhas bate com a contagem visual do PDF (10 placas, entre 1 e 22 clientes cada — o total deve ficar na casa de 150-200 linhas). Confira que `razaoSocial`/`nomeInformal`/`endereco` de registros com nome longo saem completos (sem truncar), e que `placa`/`ordem` batem com o que está no PDF. Se as faixas de coluna (`FAIXAS`) não baterem exatamente pra alguma cidade/bairro mais longo, ajuste os limites e re-rode até o resultado ficar correto — os valores acima são calibrados só pelas 2 primeiras linhas de uma investigação anterior, não é garantido que cubram 100% dos casos do arquivo inteiro.

- [ ] **Step 7: Commit**

```bash
git add src/lib/kpi-portefrio/types.ts src/lib/kpi-portefrio/parse-romaneio.ts src/lib/kpi-portefrio/parse-romaneio.test.ts
git commit -m "feat(kpi-portefrio): parser do romaneio (PDF tabular, multi-linha por registro)"
```

---

### Task 2: Autenticação Ravex

**Files:**
- Create: `src/lib/kpi-portefrio/ravex-auth.ts`
- Test: `src/lib/kpi-portefrio/ravex-auth.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `obterTokenRavex(): Promise<string>`. Task 3 consome isso.

**Contexto:** Login via `POST https://sistema.ravex.com.br/Token`, corpo `application/x-www-form-urlencoded`: `grant_type=password&username=<RAVEX_USUARIO>&password=<MD5 hex minúsculo da RAVEX_SENHA>`. Já testado com credencial real (23/08/2026) — funciona sem browser. Sucesso: `200` com `{ access_token, expires_in }` (`expires_in` em segundos, ~14 dias). Falha (credencial errada, conta bloqueada): `400` com `{ error, error_description }` — isso DEVE propagar como exceção explícita, nunca fail-open (autenticação quebrada não pode virar silenciosamente "sem GPS pra tudo").

Variáveis de ambiente novas: `RAVEX_USUARIO`, `RAVEX_SENHA` (senha em texto plano — o hash é calculado em runtime). Usar o módulo `crypto` nativo do Node pro MD5 (`createHash('md5')`), não precisa de dependência nova.

Cache em memória do processo (module-level `let`): guarda o token e o instante em que expira (calculado a partir de `expires_in` no momento do login, com uma margem de segurança de 5 minutos antes do expires_in real, pra nunca usar um token expirado por uma corrida de tempo). Se o token guardado ainda for válido, reusa sem chamar a rede de novo.

- [ ] **Step 1: Escrever o teste**

```ts
// src/lib/kpi-portefrio/ravex-auth.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { obterTokenRavex } from './ravex-auth'

beforeEach(() => {
  process.env.RAVEX_USUARIO = 'teste@exemplo.com'
  process.env.RAVEX_SENHA = 'senha-teste'
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.RAVEX_USUARIO
  delete process.env.RAVEX_SENHA
  vi.resetModules()
})

describe('obterTokenRavex', () => {
  it('faz login e devolve o access_token', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'token-abc', expires_in: 1209599 }), { status: 200 }),
    )
    const token = await obterTokenRavex()
    expect(token).toBe('token-abc')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toBe('https://sistema.ravex.com.br/Token')
    expect(init?.method).toBe('POST')
    const corpo = String(init?.body)
    expect(corpo).toContain('grant_type=password')
    expect(corpo).toContain('username=teste%40exemplo.com')
    // senha vai em MD5, nunca em texto plano no corpo da requisicao
    expect(corpo).not.toContain('senha-teste')
  })

  it('login falho (conta bloqueada) lanca erro explicito, nao fail-open', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'acesso_bloqueado', error_description: 'bloqueado' }), { status: 400 }),
    )
    await expect(obterTokenRavex()).rejects.toThrow(/acesso_bloqueado|bloqueado/)
  })

  it('reusa o token em memoria enquanto valido, sem chamar fetch de novo', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'token-1', expires_in: 1209599 }), { status: 200 }),
    )
    const t1 = await obterTokenRavex()
    const t2 = await obterTokenRavex()
    expect(t1).toBe('token-1')
    expect(t2).toBe('token-1')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Rodar teste, confirmar falha**

Run: `npm test -- ravex-auth.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/lib/kpi-portefrio/ravex-auth.ts`**

```ts
import { createHash } from 'crypto'

const RAVEX_TOKEN_URL = 'https://sistema.ravex.com.br/Token'
// Margem de seguranca antes do expires_in real -- nunca usa um token
// que esta prestes a expirar no meio de uma geracao longa.
const MARGEM_SEGURANCA_MS = 5 * 60 * 1000

let tokenCache: { token: string; expiraEm: number } | null = null

function md5(texto: string): string {
  return createHash('md5').update(texto).digest('hex')
}

/** Devolve um Bearer token valido da Ravex, reusando o cache em memoria
 *  do processo enquanto nao expirar. Login falho (credencial invalida,
 *  conta bloqueada) lanca erro explicito -- autenticacao quebrada precisa
 *  aparecer, nunca virar "sem GPS" silencioso pra frota inteira. */
export async function obterTokenRavex(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiraEm) {
    return tokenCache.token
  }

  const usuario = process.env.RAVEX_USUARIO
  const senha = process.env.RAVEX_SENHA
  if (!usuario || !senha) {
    throw new Error('RAVEX_USUARIO/RAVEX_SENHA não configuradas')
  }

  const corpo = new URLSearchParams({
    grant_type: 'password',
    username: usuario,
    password: md5(senha),
  })

  const res = await fetch(RAVEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: corpo.toString(),
  })

  const data = await res.json().catch(() => null) as
    | { access_token: string; expires_in: number }
    | { error: string; error_description?: string }
    | null

  if (!res.ok || !data || !('access_token' in data)) {
    const msg = data && 'error_description' in data && data.error_description
      ? data.error_description
      : data && 'error' in data
        ? data.error
        : `login Ravex falhou (HTTP ${res.status})`
    throw new Error(`Falha ao autenticar na Ravex: ${msg}`)
  }

  tokenCache = {
    token: data.access_token,
    expiraEm: Date.now() + data.expires_in * 1000 - MARGEM_SEGURANCA_MS,
  }
  return tokenCache.token
}
```

- [ ] **Step 4: Rodar teste, confirmar que passa**

Run: `npm test -- ravex-auth.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-portefrio/ravex-auth.ts src/lib/kpi-portefrio/ravex-auth.test.ts
git commit -m "feat(kpi-portefrio): autenticacao Ravex (login via MD5, cache de token em memoria)"
```

---

### Task 3: Cliente da API Ravex (resolução de placa + histórico)

**Files:**
- Create: `src/lib/kpi-portefrio/ravex-api.ts`
- Modify: `src/lib/kpi-portefrio/types.ts` (adiciona `EventoRavex`)
- Test: `src/lib/kpi-portefrio/ravex-api.test.ts`

**Interfaces:**
- Consumes: `obterTokenRavex()` de `./ravex-auth` (Task 2).
- Produces: `resolverIdVeiculo(placa: string): Promise<number | null>`, `buscarHistoricoVeiculo(idVeiculo: number, dataInicioUnix: number, dataFimUnix: number): Promise<EventoRavex[]>`, tipo `EventoRavex`. Task 4 consome `EventoRavex[]`.

**Contexto:** `resolverIdVeiculo` chama `GET /odata1/Veiculo?$filter=contains(tolower(PlacaNome),'<placa minúscula>')` com `Authorization: Bearer <token>` — devolve `{value: [{Id, PlacaNome, ...}]}`; array vazio = placa não visível nessa conta, devolve `null` (fail-open, não lança). `buscarHistoricoVeiculo` chama `GET /odata1/GetHistoricoVeiculoV2(idItem=<id>,veiculoOuEquipamento=false,dataInicial=<unix>,dataFinal=<unix>)?$orderby=EventoDatahora&$top=5000` (top alto — não sabemos o volume real de eventos/dia de um veículo ativo, a frota testada não tinha atividade recente; 5000 é uma estimativa segura de teto, sem paginação por agora) — devolve `{value: [...]}` com campos `EventoDatahora` (string ISO com offset), `GPSLatitude`/`GPSLongitude` (podem vir como `number` ou `string` dependendo do serializer OData — tratar os dois com `Number(...)`), `CanRefrigeracao_CabineTemperatura` (pode ser `null`). Qualquer erro de rede/HTTP/JSON inválido nos dois métodos devolve fail-open (`null` ou `[]`, respectivamente) — só a falha de LOGIN (Task 2) lança.

**Interfaces:**
```ts
// adicionar em src/lib/kpi-portefrio/types.ts
export type EventoRavex = {
  dataHora: string // ISO
  lat: number
  lng: number
  temperatura: number | null
}
```

- [ ] **Step 1: Escrever o teste**

```ts
// src/lib/kpi-portefrio/ravex-api.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./ravex-auth', () => ({ obterTokenRavex: vi.fn() }))
import { obterTokenRavex } from './ravex-auth'
import { resolverIdVeiculo, buscarHistoricoVeiculo } from './ravex-api'

beforeEach(() => {
  vi.mocked(obterTokenRavex).mockResolvedValue('token-teste')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolverIdVeiculo', () => {
  it('placa encontrada devolve o Id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ value: [{ Id: 14296, PlacaNome: 'LUE5C42' }] }), { status: 200 }),
    )
    expect(await resolverIdVeiculo('LUE5C42')).toBe(14296)
  })

  it('placa nao encontrada (value vazio) devolve null, nao lanca', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ value: [] }), { status: 200 }),
    )
    expect(await resolverIdVeiculo('ZZZ0000')).toBeNull()
  })

  it('erro de rede devolve null, nao lanca', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'))
    expect(await resolverIdVeiculo('LUE5C42')).toBeNull()
  })
})

describe('buscarHistoricoVeiculo', () => {
  it('devolve os eventos mapeados', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        value: [
          { EventoDatahora: '2026-08-24T10:00:00-03:00', GPSLatitude: -22.8, GPSLongitude: -43.2, CanRefrigeracao_CabineTemperatura: -18.5 },
          { EventoDatahora: '2026-08-24T10:05:00-03:00', GPSLatitude: '-22.81', GPSLongitude: '-43.21', CanRefrigeracao_CabineTemperatura: null },
        ],
      }), { status: 200 }),
    )
    const eventos = await buscarHistoricoVeiculo(14296, 1000, 2000)
    expect(eventos).toEqual([
      { dataHora: '2026-08-24T10:00:00-03:00', lat: -22.8, lng: -43.2, temperatura: -18.5 },
      { dataHora: '2026-08-24T10:05:00-03:00', lat: -22.81, lng: -43.21, temperatura: null },
    ])
  })

  it('erro de rede devolve array vazio, nao lanca', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'))
    expect(await buscarHistoricoVeiculo(14296, 1000, 2000)).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar teste, confirmar falha**

Run: `npm test -- ravex-api.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/lib/kpi-portefrio/ravex-api.ts`**

```ts
import { obterTokenRavex } from './ravex-auth'
import type { EventoRavex } from './types'

const BASE_URL = 'https://sistema.ravex.com.br/odata1'
const TOP_HISTORICO = 5000

async function chamarRavex(path: string): Promise<unknown | null> {
  try {
    const token = await obterTokenRavex()
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      console.error(`[kpi-portefrio/ravex-api] Ravex respondeu ${res.status} pra ${path}`)
      return null
    }
    return await res.json()
  } catch (e) {
    console.error('[kpi-portefrio/ravex-api] chamada falhou:', e instanceof Error ? e.message : String(e))
    return null
  }
}

/** Fail-open: placa nao encontrada ou qualquer erro devolve null, nunca
 *  lanca (autenticacao quebrada e' a UNICA excecao que propaga, e isso
 *  acontece dentro de obterTokenRavex, nao aqui). */
export async function resolverIdVeiculo(placa: string): Promise<number | null> {
  const filtro = encodeURIComponent(`contains(tolower(PlacaNome),'${placa.toLowerCase()}')`)
  const data = await chamarRavex(`/Veiculo?$filter=${filtro}`) as { value?: Array<{ Id: number }> } | null
  return data?.value?.[0]?.Id ?? null
}

export async function buscarHistoricoVeiculo(
  idVeiculo: number,
  dataInicioUnix: number,
  dataFimUnix: number,
): Promise<EventoRavex[]> {
  const path = `/GetHistoricoVeiculoV2(idItem=${idVeiculo},veiculoOuEquipamento=false,dataInicial=${dataInicioUnix},dataFinal=${dataFimUnix})?$orderby=EventoDatahora&$top=${TOP_HISTORICO}`
  const data = await chamarRavex(path) as { value?: Array<{
    EventoDatahora: string
    GPSLatitude: number | string
    GPSLongitude: number | string
    CanRefrigeracao_CabineTemperatura: number | null
  }> } | null

  if (!data?.value) return []

  return data.value.map(ev => ({
    dataHora: ev.EventoDatahora,
    lat: Number(ev.GPSLatitude),
    lng: Number(ev.GPSLongitude),
    temperatura: ev.CanRefrigeracao_CabineTemperatura ?? null,
  }))
}
```

- [ ] **Step 4: Rodar teste, confirmar que passa**

Run: `npm test -- ravex-api.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-portefrio/ravex-api.ts src/lib/kpi-portefrio/ravex-api.test.ts src/lib/kpi-portefrio/types.ts
git commit -m "feat(kpi-portefrio): cliente Ravex (resolucao de placa + historico de GPS/temperatura)"
```

---

### Task 4: Constantes + clusterização de visita

**Files:**
- Create: `src/lib/kpi-portefrio/constants.ts`
- Create: `src/lib/kpi-portefrio/visitas.ts`
- Modify: `src/lib/kpi-portefrio/types.ts` (adiciona `LinhaGeocodificada`, `Visita`)
- Test: `src/lib/kpi-portefrio/visitas.test.ts`

**Interfaces:**
- Consumes: `EventoRavex` (Task 3), `LinhaGeocodificada` (definido nesta task, ver abaixo).
- Produces: `montarVisitas(eventos: EventoRavex[], clientes: ClienteParaVisita[]): Map<string, Visita>`. Task 5 consome `Visita`.

**Contexto:** Diferente da Nutry Max (`kpi-romaneio/visitas.ts`, que recebe PARADAS já pré-processadas da Unitrac com `chegada`/`saida`/`classificacao`), a Ravex devolve um STREAM DE EVENTO CRU (um ponto de GPS por evento, sem clusterização nenhuma). Esta função faz a clusterização do zero: agrupa eventos consecutivos (na ordem cronológica) que estão dentro do raio de um mesmo cliente numa única visita.

**Interfaces:**
```ts
// adicionar em src/lib/kpi-portefrio/types.ts
export type LinhaGeocodificada = LinhaRomaneioPortefrio & {
  lat: number | null
  lng: number | null
}

export type Visita = {
  codigoCliente: string
  chegada: string // ISO, dataHora do primeiro evento do cluster
  saida: string // ISO, dataHora do ultimo evento do cluster
  distanciaMetrosDoPonto: number
  temperaturas: number[] // todas as leituras nao-null dentro do cluster
}
```

- [ ] **Step 1: Criar `src/lib/kpi-portefrio/constants.ts`**

```ts
// Mesmo valor ja validado do lado Nutry Max (kpi-romaneio/constants.ts) --
// duplicado aqui de proposito, nao cross-importado, pra nao acoplar duas
// pipelines de clientes diferentes por um arquivo de constantes que tem
// outros valores especificos da Nutry Max (COD_USER_NUTRIMAX etc).
export const RAIO_ENTREGA_METROS = 300
```

- [ ] **Step 2: Escrever o teste de `visitas.ts`**

```ts
// src/lib/kpi-portefrio/visitas.test.ts
import { describe, it, expect } from 'vitest'
import { montarVisitas } from './visitas'
import type { EventoRavex } from './types'

const CLIENTE_A = { codigoCliente: 'C1', lat: -22.8, lng: -43.2 }
const CLIENTE_B = { codigoCliente: 'C2', lat: -22.9, lng: -43.3 }

function evento(dataHora: string, lat: number, lng: number, temperatura: number | null = null): EventoRavex {
  return { dataHora, lat, lng, temperatura }
}

describe('montarVisitas', () => {
  it('evento dentro do raio de um cliente vira visita', () => {
    const eventos = [evento('2026-08-24T10:00:00Z', -22.8, -43.2, -18)]
    const visitas = montarVisitas(eventos, [CLIENTE_A, CLIENTE_B])
    expect(visitas.has('C1')).toBe(true)
    expect(visitas.get('C1')?.chegada).toBe('2026-08-24T10:00:00Z')
    expect(visitas.get('C1')?.saida).toBe('2026-08-24T10:00:00Z')
    expect(visitas.get('C1')?.temperaturas).toEqual([-18])
  })

  it('eventos consecutivos do MESMO cliente agrupam numa unica visita (chegada=primeiro, saida=ultimo)', () => {
    const eventos = [
      evento('2026-08-24T10:00:00Z', -22.8, -43.2, -18),
      evento('2026-08-24T10:05:00Z', -22.8, -43.2, -17.5),
      evento('2026-08-24T10:10:00Z', -22.8, -43.2, -17),
    ]
    const visitas = montarVisitas(eventos, [CLIENTE_A])
    expect(visitas.size).toBe(1)
    const v = visitas.get('C1')!
    expect(v.chegada).toBe('2026-08-24T10:00:00Z')
    expect(v.saida).toBe('2026-08-24T10:10:00Z')
    expect(v.temperaturas).toEqual([-18, -17.5, -17])
  })

  it('evento fora do raio de qualquer cliente nao gera visita', () => {
    const eventos = [evento('2026-08-24T10:00:00Z', 0, 0)]
    const visitas = montarVisitas(eventos, [CLIENTE_A, CLIENTE_B])
    expect(visitas.size).toBe(0)
  })

  it('cliente sem coordenada (geocodificacao falhou) nunca gera visita', () => {
    const eventos = [evento('2026-08-24T10:00:00Z', -22.8, -43.2)]
    const clienteSemGeo = { codigoCliente: 'C3', lat: null, lng: null }
    const visitas = montarVisitas(eventos, [clienteSemGeo])
    expect(visitas.size).toBe(0)
  })

  it('visita a dois clientes diferentes em sequencia gera duas visitas separadas', () => {
    const eventos = [
      evento('2026-08-24T10:00:00Z', -22.8, -43.2),
      evento('2026-08-24T11:00:00Z', -22.9, -43.3),
    ]
    const visitas = montarVisitas(eventos, [CLIENTE_A, CLIENTE_B])
    expect(visitas.size).toBe(2)
    expect(visitas.has('C1')).toBe(true)
    expect(visitas.has('C2')).toBe(true)
  })
})
```

- [ ] **Step 3: Rodar teste, confirmar falha**

Run: `npm test -- visitas.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar `src/lib/kpi-portefrio/visitas.ts`**

```ts
import { haversine } from '@/lib/utils/geo'
import type { EventoRavex, Visita } from './types'
import { RAIO_ENTREGA_METROS } from './constants'

type ClienteParaVisita = { codigoCliente: string; lat: number | null; lng: number | null }

/** Clusteriza o stream de evento cru da Ravex em visitas por cliente.
 *  Pra cada evento (em ordem cronologica), acha o cliente geocodificado
 *  mais proximo dentro do raio; eventos consecutivos que caem no MESMO
 *  cliente estendem a visita corrente (saida = evento mais recente);
 *  evento que cai num cliente diferente fecha a visita anterior e abre
 *  uma nova. Evento fora do raio de qualquer cliente e ignorado. */
export function montarVisitas(eventos: EventoRavex[], clientes: ClienteParaVisita[]): Map<string, Visita> {
  const clientesComCoord = clientes.filter(
    (c): c is ClienteParaVisita & { lat: number; lng: number } => c.lat != null && c.lng != null,
  )
  const visitas = new Map<string, Visita>()
  const eventosOrdenados = [...eventos].sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime())

  for (const evento of eventosOrdenados) {
    let melhor: { cliente: ClienteParaVisita & { lat: number; lng: number }; dist: number } | null = null
    for (const cliente of clientesComCoord) {
      const dist = haversine(evento.lat, evento.lng, cliente.lat, cliente.lng)
      if (dist > RAIO_ENTREGA_METROS) continue
      if (!melhor || dist < melhor.dist) melhor = { cliente, dist }
    }
    if (!melhor) continue

    const existente = visitas.get(melhor.cliente.codigoCliente)
    if (existente) {
      existente.saida = evento.dataHora
      if (evento.temperatura != null) existente.temperaturas.push(evento.temperatura)
    } else {
      visitas.set(melhor.cliente.codigoCliente, {
        codigoCliente: melhor.cliente.codigoCliente,
        chegada: evento.dataHora,
        saida: evento.dataHora,
        distanciaMetrosDoPonto: melhor.dist,
        temperaturas: evento.temperatura != null ? [evento.temperatura] : [],
      })
    }
  }

  return visitas
}
```

- [ ] **Step 5: Rodar teste, confirmar que passa**

Run: `npm test -- visitas.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kpi-portefrio/constants.ts src/lib/kpi-portefrio/visitas.ts src/lib/kpi-portefrio/visitas.test.ts src/lib/kpi-portefrio/types.ts
git commit -m "feat(kpi-portefrio): clusterizacao de evento cru Ravex em visita por cliente"
```

---

### Task 5: Agregação por cliente

**Files:**
- Create: `src/lib/kpi-portefrio/agregacao.ts`
- Modify: `src/lib/kpi-portefrio/types.ts` (adiciona `LinhaKpiPortefrio`)
- Test: `src/lib/kpi-portefrio/agregacao.test.ts`

**Interfaces:**
- Consumes: `LinhaGeocodificada`, `Visita` (Task 4).
- Produces: `agregarPorCliente(linha: LinhaGeocodificada, visita: Visita | undefined, ordemReal: number | null): LinhaKpiPortefrio`. Task 6 e 7 consomem `LinhaKpiPortefrio`.

**Interfaces:**
```ts
// adicionar em src/lib/kpi-portefrio/types.ts
export type LinhaKpiPortefrio = {
  placa: string
  ordemPlanejada: number
  ordemReal: number | null
  cliente: string // nomeInformal, ou razaoSocial se nomeInformal vazio
  endereco: string // endereco+numero - bairro, cidade - uf, concatenado
  visitado: boolean
  horarioChegada: string | null // ISO
  tempMin: number | null
  tempMax: number | null
  tempMedia: number | null
}
```

- [ ] **Step 1: Escrever o teste**

```ts
// src/lib/kpi-portefrio/agregacao.test.ts
import { describe, it, expect } from 'vitest'
import { agregarPorCliente } from './agregacao'
import type { LinhaGeocodificada, Visita } from './types'

const LINHA: LinhaGeocodificada = {
  placa: 'LUE5C42', codigoCliente: 'C1', cnpj: '123', razaoSocial: 'EMPRESA LTDA',
  nomeInformal: 'LOJA TESTE', endereco: 'RUA X', numero: '10', cep: '20000000',
  bairro: 'CENTRO', cidade: 'CIDADE X', uf: 'RJ', ordem: 3, lat: -22.8, lng: -43.2,
}

describe('agregarPorCliente', () => {
  it('cliente nao visitado (sem Visita) fica com todos os campos de confirmacao null', () => {
    const linha = agregarPorCliente(LINHA, undefined, null)
    expect(linha).toEqual({
      placa: 'LUE5C42',
      ordemPlanejada: 3,
      ordemReal: null,
      cliente: 'LOJA TESTE',
      endereco: 'RUA X, 10 - CENTRO, CIDADE X - RJ',
      visitado: false,
      horarioChegada: null,
      tempMin: null,
      tempMax: null,
      tempMedia: null,
    })
  })

  it('cliente visitado com temperatura calcula min/max/media', () => {
    const visita: Visita = {
      codigoCliente: 'C1', chegada: '2026-08-24T10:00:00Z', saida: '2026-08-24T10:10:00Z',
      distanciaMetrosDoPonto: 50, temperaturas: [-18, -16, -20],
    }
    const linha = agregarPorCliente(LINHA, visita, 2)
    expect(linha.visitado).toBe(true)
    expect(linha.ordemReal).toBe(2)
    expect(linha.horarioChegada).toBe('2026-08-24T10:00:00Z')
    expect(linha.tempMin).toBe(-20)
    expect(linha.tempMax).toBe(-16)
    expect(linha.tempMedia).toBeCloseTo(-18, 5)
  })

  it('cliente visitado SEM leitura de temperatura fica com temp null (nao trava a linha)', () => {
    const visita: Visita = {
      codigoCliente: 'C1', chegada: '2026-08-24T10:00:00Z', saida: '2026-08-24T10:00:00Z',
      distanciaMetrosDoPonto: 50, temperaturas: [],
    }
    const linha = agregarPorCliente(LINHA, visita, 1)
    expect(linha.visitado).toBe(true)
    expect(linha.tempMin).toBeNull()
    expect(linha.tempMax).toBeNull()
    expect(linha.tempMedia).toBeNull()
  })

  it('usa razaoSocial como nome do cliente quando nomeInformal esta vazio', () => {
    const linha = agregarPorCliente({ ...LINHA, nomeInformal: '' }, undefined, null)
    expect(linha.cliente).toBe('EMPRESA LTDA')
  })
})
```

- [ ] **Step 2: Rodar teste, confirmar falha**

Run: `npm test -- agregacao.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/lib/kpi-portefrio/agregacao.ts`**

```ts
import type { LinhaGeocodificada, LinhaKpiPortefrio, Visita } from './types'

function enderecoCompleto(l: LinhaGeocodificada): string {
  return `${l.endereco}, ${l.numero} - ${l.bairro}, ${l.cidade} - ${l.uf}`
}

/** Uma linha do romaneio ja vira uma linha do KPI (nao ha agrupamento
 *  por carga como na Nutry Max -- cada cliente e sua propria unidade). */
export function agregarPorCliente(
  linha: LinhaGeocodificada,
  visita: Visita | undefined,
  ordemReal: number | null,
): LinhaKpiPortefrio {
  const temperaturas = visita?.temperaturas ?? []
  const temMedia = temperaturas.length > 0
    ? temperaturas.reduce((s, t) => s + t, 0) / temperaturas.length
    : null

  return {
    placa: linha.placa,
    ordemPlanejada: linha.ordem,
    ordemReal,
    cliente: linha.nomeInformal || linha.razaoSocial,
    endereco: enderecoCompleto(linha),
    visitado: visita !== undefined,
    horarioChegada: visita?.chegada ?? null,
    tempMin: temperaturas.length > 0 ? Math.min(...temperaturas) : null,
    tempMax: temperaturas.length > 0 ? Math.max(...temperaturas) : null,
    tempMedia: temMedia,
  }
}
```

- [ ] **Step 4: Rodar teste, confirmar que passa**

Run: `npm test -- agregacao.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-portefrio/agregacao.ts src/lib/kpi-portefrio/agregacao.test.ts src/lib/kpi-portefrio/types.ts
git commit -m "feat(kpi-portefrio): agregacao por cliente (ordem real, temperatura min/max/media)"
```

---

### Task 6: Gerador de XLSX

**Files:**
- Create: `src/lib/kpi-portefrio/gerador-xlsx.ts`
- Test: `src/lib/kpi-portefrio/gerador-xlsx.test.ts`

**Interfaces:**
- Consumes: `LinhaKpiPortefrio` (Task 5).
- Produces: `gerarKpiPortefrioXlsx(linhas: LinhaKpiPortefrio[], data: string): Promise<Buffer>`. Task 7 consome isso.

- [ ] **Step 1: Escrever o teste**

```ts
// src/lib/kpi-portefrio/gerador-xlsx.test.ts
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarKpiPortefrioXlsx, COLUNAS_KPI_PORTEFRIO } from './gerador-xlsx'
import type { LinhaKpiPortefrio } from './types'

const LINHA: LinhaKpiPortefrio = {
  placa: 'LUE5C42', ordemPlanejada: 1, ordemReal: 1, cliente: 'LOJA TESTE',
  endereco: 'RUA X, 10 - CENTRO, CIDADE X - RJ', visitado: true,
  horarioChegada: '2026-08-24T10:00:00-03:00', tempMin: -20, tempMax: -16, tempMedia: -18,
}

describe('gerarKpiPortefrioXlsx', () => {
  it('gera um XLSX valido com cabecalho e uma linha de dado', async () => {
    const buf = await gerarKpiPortefrioXlsx([LINHA], '2026-08-24')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.getWorksheet('KPI 2026-08-24')
    expect(ws).toBeDefined()
    const header = ws!.getRow(1).values as unknown[]
    expect(header.slice(1)).toEqual([...COLUNAS_KPI_PORTEFRIO])
    const linha = ws!.getRow(2).values as unknown[]
    expect(linha[1]).toBe('LUE5C42')
    expect(linha[2]).toBe(1)
  })

  it('cliente nao visitado mostra "Não" e campos de temperatura vazios', async () => {
    const naoVisitado: LinhaKpiPortefrio = { ...LINHA, visitado: false, horarioChegada: null, tempMin: null, tempMax: null, tempMedia: null }
    const buf = await gerarKpiPortefrioXlsx([naoVisitado], '2026-08-24')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.getWorksheet('KPI 2026-08-24')
    const linha = ws!.getRow(2).values as unknown[]
    expect(linha[6]).toBe('Não') // coluna Visitado
  })
})
```

- [ ] **Step 2: Rodar teste, confirmar falha**

Run: `npm test -- gerador-xlsx.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/lib/kpi-portefrio/gerador-xlsx.ts`**

```ts
import ExcelJS from 'exceljs'
import type { LinhaKpiPortefrio } from './types'

export const COLUNAS_KPI_PORTEFRIO = [
  'PLACA', 'ORDEM PLANEJADA', 'ORDEM REAL', 'CLIENTE', 'ENDEREÇO', 'VISITADO',
  'HORÁRIO CHEGADA', 'TEMP MÍN (°C)', 'TEMP MÁX (°C)', 'TEMP MÉDIA (°C)',
] as const

function formatarHora(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

function formatarTemp(t: number | null): string | number {
  return t == null ? '' : Math.round(t * 10) / 10
}

export async function gerarKpiPortefrioXlsx(linhas: LinhaKpiPortefrio[], data: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()
  const ws = wb.addWorksheet(`KPI ${data}`)
  ws.addRow([...COLUNAS_KPI_PORTEFRIO])
  for (const l of linhas) {
    ws.addRow([
      l.placa, l.ordemPlanejada, l.ordemReal ?? '', l.cliente, l.endereco,
      l.visitado ? 'Sim' : 'Não', formatarHora(l.horarioChegada),
      formatarTemp(l.tempMin), formatarTemp(l.tempMax), formatarTemp(l.tempMedia),
    ])
  }
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
```

- [ ] **Step 4: Rodar teste, confirmar que passa**

Run: `npm test -- gerador-xlsx.test.ts`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-portefrio/gerador-xlsx.ts src/lib/kpi-portefrio/gerador-xlsx.test.ts
git commit -m "feat(kpi-portefrio): geracao do XLSX final"
```

---

### Task 7: Rota + páginas (integração final)

**Files:**
- Create: `src/app/api/kpi/portefrio/gerar/route.ts`
- Modify: `src/app/painel/portefrio/gerar/page.tsx` (troca o placeholder pela tela real)
- Modify: `src/app/painel/portefrio/historico/page.tsx` (troca o placeholder pela listagem real)

**Interfaces:**
- Consumes: tudo das Tasks 1-6 (`parseRomaneioPortefrio`, `geocodificarEnderecos` de `@/lib/kpi-romaneio/geocode`, `resolverIdVeiculo`/`buscarHistoricoVeiculo`, `montarVisitas`, `agregarPorCliente`, `gerarKpiPortefrioXlsx`), `salvarGeracao` de `@/lib/kpi-romaneio/historico`.

- [ ] **Step 1: Implementar `src/app/api/kpi/portefrio/gerar/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPerfil, empresaLiberada } from '@/lib/perfil'
import { geocodificarEnderecos } from '@/lib/kpi-romaneio/geocode'
import { salvarGeracao } from '@/lib/kpi-romaneio/historico'
import { parseRomaneioPortefrio } from '@/lib/kpi-portefrio/parse-romaneio'
import { resolverIdVeiculo, buscarHistoricoVeiculo } from '@/lib/kpi-portefrio/ravex-api'
import { montarVisitas } from '@/lib/kpi-portefrio/visitas'
import { agregarPorCliente } from '@/lib/kpi-portefrio/agregacao'
import { gerarKpiPortefrioXlsx } from '@/lib/kpi-portefrio/gerador-xlsx'
import type { LinhaGeocodificada, LinhaKpiPortefrio } from '@/lib/kpi-portefrio/types'

export const runtime = 'nodejs'
export const maxDuration = 60

function agrupar<T>(itens: T[], chave: (item: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>()
  for (const item of itens) {
    const k = chave(item)
    const arr = mapa.get(k)
    if (arr) arr.push(item)
    else mapa.set(k, [item])
  }
  return mapa
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const perfil = await getPerfil(user.id)
  if (perfil.papel !== 'admin' || !empresaLiberada(perfil, 'portefrio')) {
    return new NextResponse('Sem permissão.', { status: 403 })
  }

  const form = await req.formData()
  const data = String(form.get('data') ?? '')
  const romaneioFile = form.get('romaneio')

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
  }
  if (!(romaneioFile instanceof File)) {
    return new NextResponse('Romaneio (PDF) obrigatório', { status: 400 })
  }

  const romaneioBuf = Buffer.from(await romaneioFile.arrayBuffer())
  const romaneio = await parseRomaneioPortefrio(romaneioBuf)

  if (romaneio.length === 0) {
    return new NextResponse(
      'Nenhuma linha reconhecida no romaneio — confira se o PDF é o romaneio da Portefrio.',
      { status: 422 },
    )
  }

  const enderecosUnicos = [...new Set(romaneio.map(l => `${l.endereco}, ${l.numero} - ${l.bairro}, ${l.cidade} - ${l.uf}`))]
  const resultadosGeo = await geocodificarEnderecos(enderecosUnicos)
  const geoPorEndereco = new Map(enderecosUnicos.map((e, i) => [e, resultadosGeo[i]]))

  const romaneioGeo: LinhaGeocodificada[] = romaneio.map(l => {
    const chave = `${l.endereco}, ${l.numero} - ${l.bairro}, ${l.cidade} - ${l.uf}`
    const g = geoPorEndereco.get(chave) ?? null
    return { ...l, lat: g?.lat ?? null, lng: g?.lng ?? null }
  })

  const linhasPorPlaca = agrupar(romaneioGeo, l => l.placa)

  // Auth Ravex acontece via obterTokenRavex, chamado dentro de
  // resolverIdVeiculo/buscarHistoricoVeiculo -- se a credencial estiver
  // quebrada, a chamada abaixo lanca e a geracao inteira falha com 500
  // (nunca fail-open pra autenticacao, ver Global Constraints do plano).
  const inicioDoDia = Math.floor(new Date(`${data}T00:00:00-03:00`).getTime() / 1000)
  const fimDoDia = Math.floor(new Date(`${data}T23:59:59-03:00`).getTime() / 1000)

  const linhasKpi: LinhaKpiPortefrio[] = []
  try {
    for (const [placa, linhasDaPlaca] of linhasPorPlaca) {
      const idVeiculo = await resolverIdVeiculo(placa)
      const eventos = idVeiculo ? await buscarHistoricoVeiculo(idVeiculo, inicioDoDia, fimDoDia) : []
      const clientesParaVisita = linhasDaPlaca.map(l => ({ codigoCliente: l.codigoCliente, lat: l.lat, lng: l.lng }))
      const visitas = montarVisitas(eventos, clientesParaVisita)

      const linhasOrdenadas = [...linhasDaPlaca].sort((a, b) => a.ordem - b.ordem)
      // ordemReal = posicao do cliente na sequencia de visitas confirmadas,
      // ordenadas por horario de chegada real (nao pela ordem planejada).
      const visitasOrdenadas = [...visitas.values()].sort((a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())
      const ordemRealPorCliente = new Map(visitasOrdenadas.map((v, i) => [v.codigoCliente, i + 1]))

      for (const linha of linhasOrdenadas) {
        const visita = visitas.get(linha.codigoCliente)
        const ordemReal = ordemRealPorCliente.get(linha.codigoCliente) ?? null
        linhasKpi.push(agregarPorCliente(linha, visita, ordemReal))
      }
    }
  } catch (e) {
    return new NextResponse(
      e instanceof Error ? e.message : 'Erro ao consultar a Ravex.',
      { status: 500 },
    )
  }

  const xlsxBuf = await gerarKpiPortefrioXlsx(linhasKpi, data)

  try {
    await salvarGeracao({
      cliente: 'portefrio',
      dataReferencia: data,
      geradoPor: user.email ?? null,
      qtdCargas: linhasKpi.length,
      arquivoStoragePath: null,
    })
  } catch (err) {
    console.error('Erro ao salvar histórico de geração:', err)
  }

  return new NextResponse(xlsxBuf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="KPI-Portefrio-${data}.xlsx"`,
    },
  })
}
```

- [ ] **Step 2: Substituir o conteúdo de `src/app/painel/portefrio/gerar/page.tsx`**

Mesma estrutura visual de `src/app/painel/nutrimax/gerar/page.tsx` (já lido, reusar o mesmo componente `FileDropzone` e o mesmo layout), com as diferenças: só UM arquivo (`romaneio`, não `escala`+`romaneio`), sem checagem de `foraDoAlcanceApi` (essa função é específica do alcance de 48h da API Unitrac — a Ravex não tem essa mesma limitação documentada, então não bloquear data por isso), texto/labels trocados pra Portefrio:

```tsx
'use client'

import { useState } from 'react'
import { ArrowRight, CalendarBlank, WarningCircle, FileArrowDown, CheckCircle } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/components/ui'
import { FileDropzone } from '@/app/painel/file-dropzone'

function hoje(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export default function PortefrioGerarPage() {
  const [romaneio, setRomaneio] = useState<File[]>([])
  const [data, setData] = useState(hoje())
  const [pending, setPending] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [baixado, setBaixado] = useState<string | null>(null)

  const pronto = romaneio.length > 0 && !!data

  async function gerar() {
    if (!pronto) return
    setPending(true)
    setErro(null)
    setBaixado(null)
    try {
      const fd = new FormData()
      fd.set('romaneio', romaneio[0])
      fd.set('data', data)
      const res = await fetch('/api/kpi/portefrio/gerar', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())

      const blob = await res.blob()
      const filename = `KPI-Portefrio-${data}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setBaixado(filename)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <header className="mb-10 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          KPI Portefrio
        </span>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-fg)] md:text-[34px]">
          Gerar KPI
        </h1>
        <p className="mt-1 max-w-[65ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Suba o romaneio do dia. O sistema geocodifica os endereços, cruza com o GPS e a
          temperatura do baú refrigerado da Ravex, e monta o KPI por cliente — ordem
          planejada x real, horário de chegada e temperatura durante a parada.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="col-span-1 lg:col-span-6">
          <FileDropzone
            eyebrow="Passo 1"
            label="Romaneio"
            hint="PDF · placas, clientes, endereços e ordem de atendimento"
            accept=".pdf"
            files={romaneio}
            onAdd={files => setRomaneio(files.slice(0, 1))}
            onRemove={() => setRomaneio([])}
          />
        </div>

        <div className="col-span-1 lg:col-span-6">
          <div className="flex h-full flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
              <CalendarBlank size={12} weight="bold" />
              Passo 2 · Data de referência
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

      {baixado && !erro && (
        <div className="mt-6 flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] px-5 py-4">
          <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-success)]" />
          <p className="flex items-center gap-2 text-[13px] leading-relaxed text-[var(--color-success-soft-fg)]">
            <FileArrowDown size={14} weight="bold" />
            {baixado} baixado.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={gerar}
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
        <div className="flex flex-col gap-1">
          <span className={cn('text-[11px] font-medium uppercase tracking-[0.18em]', pronto || pending ? 'text-white/60' : 'text-[var(--color-fg-muted)]')}>
            {pending ? 'Processando' : 'Gerar KPI'}
          </span>
          <span className="text-[18px] font-semibold tracking-tight">
            {pending ? 'Geocodificando e cruzando com a Ravex…' : pronto ? 'Gerar agora' : 'Aguardando arquivo'}
          </span>
        </div>
        {!pending && pronto && (
          <ArrowRight size={22} weight="bold" className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
        )}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Substituir o conteúdo de `src/app/painel/portefrio/historico/page.tsx`**

Mirror exato de `src/app/painel/nutrimax/historico/page.tsx` (já lido), trocando `cliente: 'nutrimax'` por `cliente: 'portefrio'` e os textos:

```tsx
import { ClockCounterClockwise, FileMagnifyingGlass } from '@phosphor-icons/react/dist/ssr'
import { createServiceClient } from '@/lib/supabase/service'
import { fmtInstanteBR } from '@/lib/data-br'

type GeracaoRow = {
  id: string
  data_referencia: string
  gerado_em: string
  gerado_por: string | null
  qtd_cargas: number
}

const PER_PAGE = 30

function formatarData(iso: string): string {
  const [a, m, d] = iso.split('-')
  if (!a || !m || !d) return iso
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const mi = Number.parseInt(m, 10) - 1
  return `${Number.parseInt(d, 10)} ${meses[mi] ?? m} ${a}`
}

export default async function PortefrioHistoricoPage() {
  const svc = createServiceClient()
  const { data: rows, error } = await svc
    .from('kpi_romaneio_geracoes')
    .select('id, data_referencia, gerado_em, gerado_por, qtd_cargas')
    .eq('cliente', 'portefrio')
    .order('gerado_em', { ascending: false })
    .limit(PER_PAGE)

  if (error) throw new Error(error.message)
  const geracoes = (rows ?? []) as GeracaoRow[]

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <header className="mb-10 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          <ClockCounterClockwise size={11} weight="bold" className="inline mr-1" />
          Portefrio · Histórico
        </span>
        <h1 className="text-display text-[36px] leading-[1.02] tracking-[-0.025em] text-[var(--color-fg)] md:text-[44px]">
          Gerações salvas
        </h1>
        <p className="mt-1 max-w-[55ch] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Registro simples de auditoria — quem gerou, quando e quantos clientes. Ainda não
          guarda o arquivo XLSX pra reabrir; baixe de novo gerando o KPI do mesmo dia se
          precisar.
        </p>
      </header>

      {geracoes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-6 py-16 text-center">
          <FileMagnifyingGlass size={28} weight="bold" className="text-[var(--color-fg-subtle)]" />
          <p className="text-[14px] text-[var(--color-fg-muted)]">Nenhuma geração registrada ainda.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border-y border-[var(--color-border)]">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left">
                <Th>Data</Th>
                <Th align="right">Clientes</Th>
                <Th>Gerado por</Th>
                <Th>Gerado em</Th>
              </tr>
            </thead>
            <tbody>
              {geracoes.map(g => (
                <tr key={g.id} className="border-t border-[var(--color-border)]">
                  <Td>
                    <span className="font-medium text-[var(--color-fg)]">{formatarData(g.data_referencia)}</span>
                    <span className="ml-2 text-numeric text-[11px] text-[var(--color-fg-subtle)]">{g.data_referencia}</span>
                  </Td>
                  <Td align="right">
                    <span className="text-numeric text-[14px] font-medium text-[var(--color-fg)]">{g.qtd_cargas}</span>
                  </Td>
                  <Td>{g.gerado_por ?? '—'}</Td>
                  <Td>
                    <span className="text-numeric text-[12px] text-[var(--color-fg-muted)]">{fmtInstanteBR(g.gerado_em)}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)] ${align === 'right' ? 'text-right' : ''}`}>
      {children}
    </th>
  )
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <td className={`whitespace-nowrap px-4 py-4 ${align === 'right' ? 'text-right' : ''}`}>{children}</td>
}
```

- [ ] **Step 4: Rodar lint e build**

Run: `npm run lint && npm run build`
Expected: sem erros novos.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS, incluindo todos os testes novos das Tasks 1-6.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/kpi/portefrio/gerar/route.ts src/app/painel/portefrio/gerar/page.tsx src/app/painel/portefrio/historico/page.tsx
git commit -m "feat(kpi-portefrio): integra pipeline completo (rota + telas de gerar/historico)"
```

---

## Validação manual end-to-end (gate humano, fora das tasks numeradas)

1. **Variáveis de ambiente**: adicionar `RAVEX_USUARIO=ana@portefrio.com` e `RAVEX_SENHA=<senha real do cofre>` no `.env.production` do servidor (perguntar ao usuário antes de tocar em produção, mesma disciplina de sempre).
2. Rodar contra o romaneio real (`ROMANEIO PORTEFRIO.pdf`) com uma data em que `LUE5C42` ou `RKT3A93` estejam de fato em rota (nenhuma das duas tinha atividade recente na investigação de 23/08/2026 — pendente até uma dessas placas rodar, ou até o usuário resolver o acesso a mais veículos da Ravex).
3. Confirmar visualmente: placas sem correspondência na Ravex aparecem como "Não" visitado em todas as linhas, sem travar a geração; placas com GPS real mostram `ordemReal`, horário e temperatura coerentes com o que a Ravex realmente registrou naquele dia.
4. Não aplicar nenhuma migration (não há nenhuma nova) nem fazer deploy até o usuário validar este checklist.
