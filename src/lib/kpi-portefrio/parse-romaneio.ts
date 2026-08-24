import { getDocument } from 'pdfjs-serverless'
import type { LinhaRomaneioPortefrio } from './types'

export type ItemComPagina = { str: string; x: number; y: number; page: number }
type LinhaVisual = { y: number; page: number; items: ItemComPagina[] }
type Faixas = Record<ColunaChave, readonly [number, number]>
type ColunaChave =
  | 'placa'
  | 'codigo'
  | 'cnpj'
  | 'razaoSocial'
  | 'nomeInformal'
  | 'endereco'
  | 'numero'
  | 'cep'
  | 'bairro'
  | 'cidade'
  | 'uf'
  | 'ordem'

const PLACA_RE = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/

// Faixas "de fabrica", calibradas na pagina 1 de uma investigacao anterior.
// Servem de fallback quando uma pagina nao tem cabecalho legivel -- mas o
// PDF real usa colunas com largura auto-ajustavel por pagina/tabela
// (Numero/CEP/Bairro/Cidade podem comecar 10-25px mais a direita numa
// pagina do que na outra), entao o CAMINHO PRINCIPAL e calcular as faixas
// dinamicamente a partir do cabecalho de cada pagina (ver
// `calculaFaixasDaPagina`).
const FAIXAS_PADRAO: Faixas = {
  placa: [0, 25],
  codigo: [25, 57],
  cnpj: [57, 88],
  razaoSocial: [88, 148],
  nomeInformal: [148, 232],
  endereco: [232, 308],
  numero: [308, 358],
  cep: [358, 392],
  bairro: [392, 445],
  cidade: [445, 503],
  uf: [503, 532],
  ordem: [532, 9999],
}

// Rotulos de cabecalho (texto exato, apos trim) usados para: (1) achar a
// posicao x de cada coluna nesta pagina especifica, e (2) identificar e
// descartar as linhas de cabecalho antes de montar os registros (sem
// isso, o texto do rotulo -- ex. "Razão social" -- vaza pro primeiro
// registro da pagina, que nao tem "ancora anterior" que o limite por Y).
// Case EXATO de propósito (sem /i): o cabecalho real usa Title Case com
// acentos ("Razão social", "Número"...) enquanto os dados de cliente no
// documento sao sempre CAIXA ALTA sem acento -- casar so o case exato do
// cabecalho evita falso positivo quando um dado real (ex: um nome de
// empresa) coincide textualmente com o nome de uma coluna.
const ROTULOS_COLUNA: Record<ColunaChave, RegExp> = {
  placa: /^Placa$/,
  codigo: /^Código$/,
  cnpj: /^CNPJ$/,
  razaoSocial: /^Razão social$/,
  nomeInformal: /^Nome informal$/,
  endereco: /^Endereço$/,
  numero: /^Número$/,
  cep: /^CEP$/,
  bairro: /^Bairro$/,
  cidade: /^Cidade$/,
  uf: /^UF$/,
  ordem: /^Ordem(\s*de)?$/,
}
// Cabecalho tem 2 linhas extras ("Ordem de" / "atendimento", quebrado por
// causa da largura da coluna) que nao tem entrada propria em
// ROTULOS_COLUNA (ordem ja cobre "Ordem de"/"Ordem") -- precisa do rotulo
// solto aqui so pra identificar e descartar essa linha do cabecalho.
const ROTULO_ATENDIMENTO_RE = /^atendimento$/

function ehRotuloDeColuna(texto: string): boolean {
  return ROTULO_ATENDIMENTO_RE.test(texto) || Object.values(ROTULOS_COLUNA).some(re => re.test(texto))
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

function ehLinhaDeCabecalho(linha: LinhaVisual): boolean {
  return linha.items.some(it => ehRotuloDeColuna(it.str.trim()))
}

/** Calcula as faixas de coluna desta pagina a partir da posicao x dos
 *  rotulos do cabecalho (ex: celula "Cidade"). A tabela usa largura de
 *  coluna auto-ajustavel por pagina, entao a posicao x de
 *  Numero/CEP/Bairro/Cidade/UF/Ordem varia de pagina pra pagina -- usar
 *  o cabecalho da propria pagina evita que um valor vaze pra coluna
 *  vizinha. Cai no fallback (FAIXAS_PADRAO) pra qualquer coluna cujo
 *  rotulo nao foi encontrado nesta pagina. */
function calculaFaixasDaPagina(linhasCabecalho: LinhaVisual[]): Faixas {
  const posicoes: Partial<Record<ColunaChave, number>> = {}
  for (const linha of linhasCabecalho) {
    for (const item of linha.items) {
      const texto = item.str.trim()
      for (const [coluna, re] of Object.entries(ROTULOS_COLUNA) as [ColunaChave, RegExp][]) {
        if (posicoes[coluna] === undefined && re.test(texto)) {
          posicoes[coluna] = item.x
        }
      }
    }
  }

  const ORDEM_COLUNAS: ColunaChave[] = [
    'placa',
    'codigo',
    'cnpj',
    'razaoSocial',
    'nomeInformal',
    'endereco',
    'numero',
    'cep',
    'bairro',
    'cidade',
    'uf',
    'ordem',
  ]
  const encontradas = ORDEM_COLUNAS.filter(c => posicoes[c] !== undefined)
  // Sem cabecalho legivel o suficiente nesta pagina -- usa o fallback global.
  if (encontradas.length < ORDEM_COLUNAS.length - 2) return FAIXAS_PADRAO

  const faixas = { ...FAIXAS_PADRAO }
  for (let i = 0; i < ORDEM_COLUNAS.length; i++) {
    const coluna = ORDEM_COLUNAS[i]
    const x = posicoes[coluna]
    // Mantem o fallback (FAIXAS_PADRAO) so pra essa coluna especifica --
    // cabecalho parcial (algumas colunas achadas, outras nao) gera uma
    // pagina com faixas MISTAS (algumas calculadas aqui, outras vindas do
    // padrao global). Risco conhecido e NAO coberto por teste: como as
    // faixas dinamicas sao derivadas so das colunas encontradas nesta
    // pagina, elas nao sao garantidamente disjuntas das faixas padrao
    // (fixas) das colunas que ficaram faltando -- ou seja, um item pode,
    // em tese, cair dentro da faixa de DUAS colunas diferentes nesse
    // cenario misto. Isso nunca ocorreu nas 10 paginas do PDF real
    // validado (o cabecalho la sempre tem os 12 rotulos completos), mas
    // se um romaneio futuro tiver cabecalho truncado/OCR incompleto, va
    // la conferir a saida com o mesmo cuidado usado no Step 6 do brief.
    if (x === undefined) continue

    const anterior = ORDEM_COLUNAS.slice(0, i).reverse().find(c => posicoes[c] !== undefined)
    const proxima = ORDEM_COLUNAS.slice(i + 1).find(c => posicoes[c] !== undefined)
    const min = anterior !== undefined ? (x + (posicoes[anterior] as number)) / 2 : 0
    const max = proxima !== undefined ? (x + (posicoes[proxima] as number)) / 2 : 9999
    faixas[coluna] = [min, max]
  }
  return faixas
}

/** Pura -- recebe os itens ja extraidos (com coordenadas) e devolve as
 *  linhas do romaneio. Separada do I/O de PDF pra ser testavel sem PDF
 *  real. Cada registro se espalha por 1 a N linhas visuais (qualquer
 *  coluna de texto mais longa -- Razao social, Nome informal, Endereco,
 *  Bairro, Cidade -- pode quebrar linha) -- atribui cada linha ao
 *  registro cuja linha-ancora (a que tem Placa valida) esta mais
 *  proxima em Y, o que cobre quebra tanto acima quanto abaixo da
 *  ancora. As linhas de cabecalho (identificadas pelo texto do rotulo,
 *  ex. "Razão social") sao descartadas antes de montar os registros, e
 *  tambem usadas pra calibrar a posicao das colunas desta pagina. */
export function parseRomaneioPortefrioTexto(itens: ItemComPagina[]): LinhaRomaneioPortefrio[] {
  const linhasPorPagina = new Map<number, LinhaVisual[]>()
  for (const linha of agruparPorLinha(itens)) {
    const arr = linhasPorPagina.get(linha.page) ?? []
    arr.push(linha)
    linhasPorPagina.set(linha.page, arr)
  }

  const resultado: LinhaRomaneioPortefrio[] = []

  for (const todasLinhas of linhasPorPagina.values()) {
    // todasLinhas ja vem ordenado por Y decrescente (cima pra baixo) de agruparPorLinha
    const linhasCabecalho = todasLinhas.filter(ehLinhaDeCabecalho)
    const FAIXAS = calculaFaixasDaPagina(linhasCabecalho)
    const linhas = todasLinhas.filter(l => !ehLinhaDeCabecalho(l))

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

      // Toda linha da pagina (ja sem cabecalho) cuja distancia em Y ate
      // ESTA ancora e menor que ate qualquer outra ancora pertence a
      // este registro.
      const linhasDoRegistro = linhas.filter(l => {
        const dist = Math.abs(l.y - yAncora)
        const distAnterior = Math.abs(l.y - yAnteriorAncora)
        const distProxima = Math.abs(l.y - yProximaAncora)
        return dist <= distAnterior && dist <= distProxima
      })

      const placaItem = itensEmFaixa(ancora.items, FAIXAS.placa).find(it => PLACA_RE.test(it.str.trim()))
      if (!placaItem) continue

      // Codigo/CNPJ/Numero/CEP/UF/Ordem NUNCA quebram linha (confirmado no
      // brief e na validacao com o PDF real) -- ler so da linha-ancora.
      // Isso e deliberadamente mais restrito que razaoSocial/nomeInformal/
      // endereco/bairro/cidade (que leem o span inteiro via
      // textoEmFaixaOrdenado): pra ultima ancora da pagina,
      // `linhasDoRegistro` se estende ate a ULTIMA linha da pagina (sem
      // limite superior, ja que nao ha proxima ancora) -- se uma pagina
      // real algum dia tiver rodape/total apos o ultimo registro, ler so
      // a ancora evita que esse texto vaze pra dentro desses campos.
      const codigo = itensEmFaixa(ancora.items, FAIXAS.codigo)[0]?.str.trim() ?? ''
      const cnpj = itensEmFaixa(ancora.items, FAIXAS.cnpj)[0]?.str.trim() ?? ''
      const numero = itensEmFaixa(ancora.items, FAIXAS.numero)[0]?.str.trim() ?? ''
      const cep = itensEmFaixa(ancora.items, FAIXAS.cep)[0]?.str.trim() ?? ''
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
        bairro: textoEmFaixaOrdenado(linhasDoRegistro, FAIXAS.bairro),
        cidade: textoEmFaixaOrdenado(linhasDoRegistro, FAIXAS.cidade),
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
