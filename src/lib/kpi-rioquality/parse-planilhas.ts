import * as XLSX from 'xlsx'
import { normPlaca } from '@/lib/unitrac-api'
import type { LinhaRomaneio } from '@/lib/kpi-romaneio/types'

// Parser das duas planilhas que a Rio Quality exporta (achado real 05/09):
//   - "Relatório de Custos":   Veículo | Rota      (placa -> nome da rota/zona)
//   - "Relatório de Entregas": Placa   | Endereço  (placa -> NOME DA RUA, so')
// Layout real: linha 1 = titulo, linha 2 = cabecalho, as vezes uma linha em
// branco antes dos dados. Nao tem numero, bairro, cidade, NF, cliente nem
// data -- a geocodificacao vai pela ponte de coerencia de grupo (ver
// geocode-coerencia.ts) e a data vem do formulario.
//
// A ordem das linhas de Entregas NAO e' a ordem da rota (confirmado contra o
// alvoordem da Unitrac em 04/09) -- preservamos a ordem so' pra numerar as
// NFs sinteticas de forma estavel.

export type EntregaRioQuality = { placaNorm: string; rua: string }

function linhas(buf: Buffer): unknown[][] {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as unknown[][]
}

function norm(v: unknown): string {
  return String(v ?? '').trim()
}

function semAcentoMaiusculo(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}

/** Indice da linha de cabecalho: a primeira cujas duas primeiras celulas
 *  batem (sem acento, maiusculo) com os nomes esperados. -1 se nao achar. */
function acharCabecalho(rows: unknown[][], col0: string[], col1: string[]): number {
  return rows.findIndex(r => {
    const a = semAcentoMaiusculo(norm(r?.[0]))
    const b = semAcentoMaiusculo(norm(r?.[1]))
    return col0.includes(a) && col1.includes(b)
  })
}

export function parseCustos(buf: Buffer): Map<string, string> {
  const rows = linhas(buf)
  const h = acharCabecalho(rows, ['VEICULO', 'PLACA'], ['ROTA'])
  const out = new Map<string, string>()
  if (h < 0) return out
  for (const r of rows.slice(h + 1)) {
    const placa = normPlaca(norm(r?.[0]))
    const rota = norm(r?.[1])
    // Achado real 06/09: a propria Rio Quality manda "--" na coluna Rota
    // quando o veiculo nao tem rota atribuida (1 de 100 placas em 04/09,
    // PUT3E37) -- sem isso o relatorio saia com "CARGA: --" (confuso, parece
    // erro nosso) e a placa perdia o prior de zona na geocodificacao por
    // coerencia (rotaParaZona('--') ja' dava null, mas o valor cru poluia o
    // relatorio). Tratado igual a "sem rota": cai no fallback CARGA_SEM_ROTA.
    if (!placa || !rota || /^-+$/.test(rota)) continue
    out.set(placa, rota)
  }
  return out
}

export function parseEntregas(buf: Buffer): EntregaRioQuality[] {
  const rows = linhas(buf)
  const h = acharCabecalho(rows, ['PLACA', 'VEICULO'], ['ENDERECO', 'RUA'])
  if (h < 0) return []
  const out: EntregaRioQuality[] = []
  for (const r of rows.slice(h + 1)) {
    const placaNorm = normPlaca(norm(r?.[0]))
    const rua = norm(r?.[1]).toUpperCase()
    if (!placaNorm || !rua) continue
    out.push({ placaNorm, rua })
  }
  return out
}

// Nome da rota da Rio Quality -> zona GENERICA da ponte de coerencia
// (monitoramento/src/lib/romaneio-geocode-coerencia.ts). Prefixo mais longo
// primeiro: "SUL FLU" nao pode cair em "SUL". "R. SERRRANA" e' o typo real do
// arquivo -- casa por prefixo "R. SERR".
const ROTA_PARA_ZONA: [string, string][] = [
  ['SUL FLU', 'SUL_FLUMINENSE'],
  ['NORTE FLU', 'NORTE_FLUMINENSE'],
  ['SUDOESTE', 'CAPITAL'],
  ['CENTRO', 'CAPITAL'],
  ['NORTE', 'CAPITAL'],
  ['OESTE', 'CAPITAL'],
  ['SUL', 'CAPITAL'],
  ['BAIXADA', 'BAIXADA'],
  ['NIT', 'LESTE'],
  ['SG', 'LESTE'],
  ['LAGOS', 'LAGOS'],
  ['R. SERR', 'SERRANA'],
  ['R SERR', 'SERRANA'],
  ['SERR', 'SERRANA'],
  ['C. VERDE', 'COSTA_VERDE'],
  ['C VERDE', 'COSTA_VERDE'],
  ['COSTA VERDE', 'COSTA_VERDE'],
]

export function rotaParaZona(rota: string | null | undefined): string | null {
  if (!rota) return null
  const r = semAcentoMaiusculo(rota)
  for (const [prefixo, zona] of ROTA_PARA_ZONA) {
    if (r.startsWith(prefixo)) return zona
  }
  return null
}

export const CARGA_SEM_ROTA = 'SEM ROTA'

/** Vira o formato que o pipeline da Nutry Max ja' consome (LinhaRomaneio).
 *  carga/destino = rota; nf sintetica "<placa>-<seq>" (a Rio Quality nao
 *  manda NF); clienteNome = rua (nao ha nome de cliente). */
export function montarLinhasRomaneio(custos: Map<string, string>, entregas: EntregaRioQuality[]): LinhaRomaneio[] {
  const seq = new Map<string, number>()
  return entregas.map(e => {
    const n = (seq.get(e.placaNorm) ?? 0) + 1
    seq.set(e.placaNorm, n)
    const rota = custos.get(e.placaNorm) ?? CARGA_SEM_ROTA
    return {
      carga: rota,
      destino: rota,
      placa: e.placaNorm,
      motorista: '',
      ajudantes: [],
      nf: `${e.placaNorm}-${n}`,
      clienteCodigo: '',
      clienteNome: e.rua,
      endereco: e.rua,
    }
  })
}

// Formato NOVO, achado real 06/09: um UNICO arquivo "Relatório de Entregas"
// com Razão Social | Cidade | UF | Destino | Motorista | Placa | Endereço |
// Bairro -- substitui as duas planilhas (Custos + Entregas) de cima. Bem
// mais rico: tem CIDADE (usa a cascata PRECISA de geocodificacao da Nutry
// Max em vez da coerencia de grupo -- sem numero ainda, mas rua+bairro+
// cidade+UF ja' descarta rua homonima em municipio errado sem precisar de
// ancora de outra parada), CLIENTE de verdade (Razao Social) e MOTORISTA de
// verdade. Destino ja' vem por linha (evento/rota do dia), sem precisar de
// planilha de Custos separada.
export type EntregaRioQualityCompleta = {
  placaNorm: string
  clienteNome: string
  cidade: string
  uf: string
  destino: string
  motorista: string
  rua: string
  bairro: string
}

export function parseEntregasCompletas(buf: Buffer): EntregaRioQualityCompleta[] {
  const rows = linhas(buf)
  const h = rows.findIndex(r => {
    const cols = (r ?? []).map(c => semAcentoMaiusculo(norm(c)))
    return cols.includes('RAZAO SOCIAL') && cols.includes('CIDADE') && cols.includes('PLACA')
  })
  if (h < 0) return []
  const header = (rows[h] ?? []).map(c => semAcentoMaiusculo(norm(c)))
  const idx = (nomes: string[]) => header.findIndex(c => nomes.includes(c))
  const iRazao = idx(['RAZAO SOCIAL'])
  const iCidade = idx(['CIDADE'])
  const iUf = idx(['UF'])
  const iDestino = idx(['DESTINO'])
  const iMotorista = idx(['MOTORISTA'])
  const iPlaca = idx(['PLACA'])
  const iEndereco = idx(['ENDERECO'])
  const iBairro = idx(['BAIRRO'])
  if (iPlaca < 0 || iEndereco < 0) return []
  const out: EntregaRioQualityCompleta[] = []
  for (const r of rows.slice(h + 1)) {
    const placaNorm = normPlaca(norm(r?.[iPlaca]))
    const rua = norm(r?.[iEndereco]).toUpperCase()
    if (!placaNorm || !rua) continue
    out.push({
      placaNorm,
      clienteNome: iRazao >= 0 ? norm(r?.[iRazao]) : '',
      cidade: iCidade >= 0 ? norm(r?.[iCidade]) : '',
      uf: iUf >= 0 ? norm(r?.[iUf]) : '',
      destino: iDestino >= 0 ? norm(r?.[iDestino]) : '',
      motorista: iMotorista >= 0 ? norm(r?.[iMotorista]) : '',
      rua,
      bairro: iBairro >= 0 ? norm(r?.[iBairro]).toUpperCase() : '',
    })
  }
  return out
}

/** String no formato bruto que a cascata de geocodificacao do monitoramento
 *  espera pra extrair cidade/bairro (extrairCidadeDoEndereco/
 *  extrairBairroDoEndereco em romaneio-geocode-local.ts): "RUA, NUMERO -
 *  BAIRRO, CIDADE - UF". Sem numero (Rio Quality nao manda) -- fica vazio
 *  entre a virgula e o traco, extrairNumeroDoEndereco ja trata como null. */
export function montarEnderecoBrutoCompleto(rua: string, bairro: string, cidade: string, uf: string): string {
  return `${rua}, - ${bairro}, ${cidade} - ${uf}`
}

/** Endereco pra EXIBIR no relatorio -- diferente do bruto de cima (esse e'
 *  so' pra geocodificar), legivel: "RUA X - BAIRRO, CIDADE". */
function enderecoParaExibir(e: EntregaRioQualityCompleta): string {
  const ruaBairro = e.bairro ? `${e.rua} - ${e.bairro}` : e.rua
  return e.cidade ? `${ruaBairro}, ${e.cidade}` : ruaBairro
}

/** Mesmo formato de saida de montarLinhasRomaneio, mas pro layout novo de
 *  arquivo unico: carga/destino = Destino (ja' vem por linha, sem precisar
 *  de planilha de Custos); motorista e clienteNome sao os de verdade. O
 *  endereco bruto pra geocodificar fica FORA da LinhaRomaneio (so' o texto
 *  de exibicao entra) -- ver enderecoBrutoPorNf em pipeline.ts. */
export function montarLinhasRomaneioCompleto(entregas: EntregaRioQualityCompleta[]): { linhas: LinhaRomaneio[]; enderecoBrutoPorNf: Map<string, string>; ruaPorNf: Map<string, string> } {
  const seq = new Map<string, number>()
  const enderecoBrutoPorNf = new Map<string, string>()
  const ruaPorNf = new Map<string, string>()
  const linhas = entregas.map(e => {
    const n = (seq.get(e.placaNorm) ?? 0) + 1
    seq.set(e.placaNorm, n)
    const nf = `${e.placaNorm}-${n}`
    enderecoBrutoPorNf.set(nf, montarEnderecoBrutoCompleto(e.rua, e.bairro, e.cidade, e.uf))
    ruaPorNf.set(nf, e.rua)
    const rota = e.destino || CARGA_SEM_ROTA
    return {
      carga: rota,
      destino: rota,
      placa: e.placaNorm,
      motorista: e.motorista,
      ajudantes: [],
      nf,
      clienteCodigo: '',
      clienteNome: e.clienteNome || e.rua,
      endereco: enderecoParaExibir(e),
    }
  })
  return { linhas, enderecoBrutoPorNf, ruaPorNf }
}
