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
    // Task 2 (plano 2026-09-30): linha com rua e SEM placa e' mantida com
    // placaNorm '' (vira CARGA SEM PLACA, fora da taxa) -- antes era
    // descartada e a entrega sumia calada do relatorio.
    if (!rua) continue
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
//
// TERCEIRO formato, achado real 30/09 ("Relatório de Entregas (14)", 55
// colunas): mesmo cabecalho-base (Razão Social/Cidade/Placa) + Nota Fiscal,
// Cod ERP Cliente, Romaneio, Rota, Check-In/Check-Out, Data Check-In/Out e
// Status da Entrega. Detectado pela coluna Nota Fiscal: NF REAL, carga =
// Romaneio, destino = Rota; check-in/status vao pra `gabarito` (nao mexem
// no KPI). Endereco continua SEM numero (so' logradouro) nesse formato.
export type EntregaRioQualityCompleta = {
  placaNorm: string
  clienteNome: string
  cidade: string
  uf: string
  destino: string
  motorista: string
  rua: string
  bairro: string
  // TERCEIRO formato (achado real 30/09, "Relatório de Entregas (14)", 55
  // colunas): so' preenchidos quando o arquivo tem a coluna -- ausentes no
  // formato de 8 colunas (ai' a NF continua sintetica).
  /** Nota Fiscal REAL */
  nf?: string
  /** Cod ERP Cliente */
  clienteCodigo?: string
  /** Romaneio (1 por placa no dia, 92/92 em 30/09) -> carga */
  romaneio?: string
  /** Rota (zona, ex. "SUDOESTE 1") -> destino */
  rota?: string
  /** O que a propria RQ registrou (app do motorista). NAO entra no KPI --
   *  so' gabarito pra medir o KPI (scripts/medir-rioquality-gabarito.ts). */
  gabarito?: GabaritoEntregaRioQuality
}

export type GabaritoEntregaRioQuality = {
  /** "Status da Entrega": Entregue | Faturado | Devolvido | Devolvido Parcial | Entrega Em Andamento */
  status: string
  checkIn: boolean
  checkOut: boolean
  /** "Data Check-In" cru, "DD/MM/AAAA HH:MM:SS" (horario local) */
  dataCheckIn: string | null
  dataCheckOut: string | null
  motivoDevolucao: string | null
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
  // Terceiro formato: detectado pela coluna Nota Fiscal (o de 8 colunas nao tem).
  const iNf = idx(['NOTA FISCAL'])
  const iCodCliente = idx(['COD ERP CLIENTE'])
  const iRomaneio = idx(['ROMANEIO'])
  const iRota = idx(['ROTA'])
  const iStatus = idx(['STATUS DA ENTREGA'])
  const iCheckIn = idx(['CHECK-IN'])
  const iCheckOut = idx(['CHECK-OUT'])
  const iDataCheckIn = idx(['DATA CHECK-IN'])
  const iDataCheckOut = idx(['DATA CHECK-OUT'])
  const iMotivo = idx(['MOTIVO DEVOLUCAO/REENTREGA'])
  const celula = (r: unknown[], i: number) => (i >= 0 ? norm(r?.[i]) : '')
  const simNao = (r: unknown[], i: number) => semAcentoMaiusculo(celula(r, i)) === 'SIM'
  const out: EntregaRioQualityCompleta[] = []
  for (const r of rows.slice(h + 1)) {
    const placaNorm = normPlaca(norm(r?.[iPlaca]))
    const rua = norm(r?.[iEndereco]).toUpperCase()
    // Task 2: sem placa fica com placaNorm '' (CARGA SEM PLACA), ver parseEntregas.
    if (!rua) continue
    out.push({
      placaNorm,
      clienteNome: iRazao >= 0 ? norm(r?.[iRazao]) : '',
      cidade: iCidade >= 0 ? norm(r?.[iCidade]) : '',
      uf: iUf >= 0 ? norm(r?.[iUf]) : '',
      destino: iDestino >= 0 ? norm(r?.[iDestino]) : '',
      motorista: iMotorista >= 0 ? norm(r?.[iMotorista]) : '',
      rua,
      bairro: iBairro >= 0 ? norm(r?.[iBairro]).toUpperCase() : '',
      ...(iNf >= 0 && celula(r, iNf) ? { nf: celula(r, iNf) } : {}),
      ...(iCodCliente >= 0 ? { clienteCodigo: celula(r, iCodCliente) } : {}),
      ...(iNf >= 0 && iRomaneio >= 0 && celula(r, iRomaneio) ? { romaneio: celula(r, iRomaneio) } : {}),
      ...(iNf >= 0 && iRota >= 0 && celula(r, iRota) ? { rota: celula(r, iRota) } : {}),
      ...(iStatus >= 0
        ? {
            gabarito: {
              status: celula(r, iStatus),
              checkIn: simNao(r, iCheckIn),
              checkOut: simNao(r, iCheckOut),
              dataCheckIn: celula(r, iDataCheckIn) || null,
              dataCheckOut: celula(r, iDataCheckOut) || null,
              motivoDevolucao: celula(r, iMotivo) || null,
            },
          }
        : {}),
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
  const nfsUsadas = new Map<string, number>()
  const linhas = entregas.map(e => {
    const n = (seq.get(e.placaNorm) ?? 0) + 1
    seq.set(e.placaNorm, n)
    // Terceiro formato: NF REAL. Repetida (nao aconteceu em 30/09, mas um
    // pedido partido em duas linhas seria isso) ganha sufixo -- visitas e
    // confianca sao indexadas por NF, colisao fundiria duas entregas.
    let nf = `${e.placaNorm}-${n}`
    if (e.nf) {
      const k = (nfsUsadas.get(e.nf) ?? 0) + 1
      nfsUsadas.set(e.nf, k)
      nf = k === 1 ? e.nf : `${e.nf}-${k}`
    }
    enderecoBrutoPorNf.set(nf, montarEnderecoBrutoCompleto(e.rua, e.bairro, e.cidade, e.uf))
    ruaPorNf.set(nf, e.rua)
    const rota = e.destino || CARGA_SEM_ROTA
    // Terceiro formato: carga = Romaneio (1 por placa), destino = Rota (zona).
    return {
      carga: e.romaneio || rota,
      destino: e.rota || rota,
      placa: e.placaNorm,
      motorista: e.motorista,
      ajudantes: [],
      nf,
      clienteCodigo: e.clienteCodigo ?? '',
      clienteNome: e.clienteNome || e.rua,
      endereco: enderecoParaExibir(e),
    }
  })
  return { linhas, enderecoBrutoPorNf, ruaPorNf }
}
