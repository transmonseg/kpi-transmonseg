import type { LinhaRomaneioPortefrio } from './types'
import type { ItemComPagina } from './parse-romaneio'

// Formato novo do romaneio da Porte Frio (grupo KPI AJUSTES, 24-27/10:
// "PROGRAMAÇÃO JAC (CONGELADO)"). Um bloco por carro:
//   ROMANEIO n            MOTORISTA  AJUDANTE
//   CARRO 36  RBI-1J86    Luis Paulo -
//   ORDEM | NOTA FISCAL | CLIENTE | ENDEREÇO | BAIRRO | QTD CAIXAS | PESO... | VALOR
// Nao tem codigo de cliente, CNPJ, CEP, cidade nem UF -- as entregas sao
// todas no municipio do Rio; a NF vira a chave da linha (codigoCliente).
//
// Os rotulos do cabecalho sao centralizados e os dados alinhados a esquerda,
// entao as faixas sao as posicoes dos DADOS medidas no PDF real de 27/10,
// deslocadas pelo quanto o rotulo CLIENTE se mexer em cada pagina.

const CIDADE = 'RIO DE JANEIRO'
const UF = 'RJ'

const X_ROTULO_CLIENTE = 218
const FAIXAS = {
  ordem: [0, 65],
  nf: [65, 130],
  cliente: [130, 320],
  endereco: [320, 462],
  bairro: [462, 585],
} as const

const PLACA_RE = /^([A-Z]{3})-?(\d[A-Z0-9]\d{2})$/
const NF_RE = /^\d{6,}$/

type Linha = { y: number; page: number; items: ItemComPagina[] }

function agruparPorLinha(items: ItemComPagina[], tol = 2): Linha[] {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y)
  const linhas: Linha[] = []
  for (const it of sorted) {
    const last = linhas[linhas.length - 1]
    if (last && it.page === last.page && Math.abs(last.y - it.y) <= tol) last.items.push(it)
    else linhas.push({ y: it.y, page: it.page, items: [it] })
  }
  for (const l of linhas) l.items.sort((a, b) => a.x - b.x)
  return linhas
}

function texto(linha: Linha, faixa: readonly [number, number], desloc: number): string {
  return linha.items
    .filter(it => it.x >= faixa[0] + desloc && it.x < faixa[1] + desloc)
    .map(it => it.str.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "RUA DO HUMAITA,150" -> rua + numero. Só separa quando o que vem depois
 *  da ultima virgula comeca com numero; o que sobra depois do numero
 *  ("BARRA DA TIJUCA", "LOJA 13") volta em `resto` pra quem chama decidir. */
export function separarNumero(enderecoBruto: string): { endereco: string; numero: string; resto: string } {
  const s = enderecoBruto.replace(/\s+/g, ' ').trim()
  const i = s.lastIndexOf(',')
  if (i < 0) return { endereco: s, numero: '', resto: '' }
  const m = s.slice(i + 1).trim().match(/^(\d+)\s*(.*)$/)
  if (!m || s.slice(0, i).includes(',')) return { endereco: s, numero: '', resto: '' }
  return { endereco: s.slice(0, i).trim(), numero: m[1], resto: m[2].trim() }
}

export function parseProgramacaoPortefrioTexto(itens: ItemComPagina[]): LinhaRomaneioPortefrio[] {
  const resultado: LinhaRomaneioPortefrio[] = []
  let placa = ''
  let desloc = 0
  for (const linha of agruparPorLinha(itens)) {
    const strs = linha.items.map(it => it.str.trim())
    if (strs[0] === 'CARRO') {
      const m = strs.map(s => s.match(PLACA_RE)).find(Boolean)
      // Carro sem placa reconhecivel: as NFs dele ficam de fora (nunca
      // herdam a placa do bloco anterior).
      placa = m ? m[1] + m[2] : ''
      continue
    }
    const rotuloCliente = linha.items.find(it => it.str.trim() === 'CLIENTE')
    if (rotuloCliente && strs.includes('NOTA FISCAL')) {
      desloc = rotuloCliente.x - X_ROTULO_CLIENTE
      continue
    }
    const nf = texto(linha, FAIXAS.nf, desloc)
    if (!placa || !NF_RE.test(nf)) continue

    const bairroColuna = texto(linha, FAIXAS.bairro, desloc)
    const sep = separarNumero(texto(linha, FAIXAS.endereco, desloc))
    // Endereco longo empurra o bairro pra dentro da coluna ENDEREÇO (vem
    // "…,222 BARRA DA TIJUCA" e a coluna BAIRRO vazia).
    const bairro = bairroColuna || sep.resto
    const numero = bairroColuna && sep.resto ? `${sep.numero} ${sep.resto}` : sep.numero

    resultado.push({
      placa,
      codigoCliente: nf,
      cnpj: '',
      razaoSocial: texto(linha, FAIXAS.cliente, desloc),
      nomeInformal: '',
      endereco: sep.endereco,
      numero,
      cep: '',
      bairro,
      cidade: CIDADE,
      uf: UF,
      ordem: parseInt(texto(linha, FAIXAS.ordem, desloc), 10) || 0,
    })
  }
  return resultado
}
