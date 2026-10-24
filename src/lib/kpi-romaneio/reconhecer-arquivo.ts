// F3-06 (ING-10): área única "Solte os arquivos do dia". O tipo de cada
// arquivo sai da ASSINATURA do documento, não da caixa em que foi solto:
//  - "8012 - Romaneio de Entrega" (Nutry)
//  - "8081 - Escala de Rota" (Nutry)
//  - "PROGRAMAÇÃO JAC (CONGELADO)", cabeçalho DATA / ROMANEIO / CARRO (Nutry,
//    o "Romaneio do Pão" -- lido desde 15/09; em 23/10 a Érica mandou como
//    novidade porque a tela usava outro nome)
//  - cabeçalho Rota | Placa | Romaneio | Razão social (Porto Frio, "Escala de
//    rotas"): reconhecido, mas a Porto Frio ainda não entra no Ao vivo
//  - xlsx com Razão Social / Cidade / Placa (Relatório de Entregas da RQ; o de
//    55 colunas traz a Nota Fiscal)
// Só lê: nada é gravado aqui. Contagens com os MESMOS leitores do envio.
import * as XLSX from 'xlsx'
import { parseRomaneioTexto, extrairDataCabecalhoRomaneio } from './parse-romaneio'
import { parseEscala } from './parse-escala'
import { parsePaoTexto } from './parse-pao'
import { parseEntregasCompletas } from '@/lib/kpi-rioquality/parse-planilhas'

export type TipoArquivo = 'romaneio_entrega' | 'escala_rota' | 'pao_jac' | 'escala_portofrio' | 'rq_entregas' | 'desconhecido'
export type ClienteArquivo = 'nutrimax' | 'rioquality' | 'portofrio'
/** Campo do formulário do Ao vivo (/api/kpi/ao-vivo/romaneio) que recebe o arquivo. */
export type CampoEnvio = 'romaneio' | 'escala' | 'romaneioPao' | 'completo'

export type ArquivoReconhecido = {
  nome: string
  tipo: TipoArquivo
  cliente: ClienteArquivo | null
  campo: CampoEnvio | null
  /** YYYY-MM-DD do dia da operação no documento (null = sem data legível ou,
   *  na Escala 8081, só a data de impressão -- F3-R05). */
  data: string | null
  /** Escala 8081: data em que foi IMPRESSA (só informativa; não decide se serve). */
  impressaEm?: string
  contagens: { notas?: number; cargas?: number; carros?: number; entregas?: number; rotas?: number; placas?: number; romaneios?: number; colunas?: number }
  /** Uma linha para o recibo: "Romaneio de Entrega da Nutry de 23/10 — 2.327 notas, 76 cargas". */
  resumo: string
  /** Lido pela assinatura, mas o leitor do envio deu erro (ex.: PDF cortado). */
  erro?: string
}

/** Como o arquivo aparece no recibo do Ao vivo: serve = entra no envio. */
export type ArquivoNoRecibo = ArquivoReconhecido & { serve: boolean; motivo?: string }

export const ROTULO_TIPO: Record<TipoArquivo, string> = {
  romaneio_entrega: 'Romaneio de Entrega da Nutry',
  escala_rota: 'Escala de Rota da Nutry',
  pao_jac: 'Romaneio do Pão (Programação JAC)',
  escala_portofrio: 'Escala de rotas da Porto Frio',
  rq_entregas: 'Relatório de Entregas da Rio Quality',
  desconhecido: 'Não reconheci este arquivo',
}

const CLIENTE_DO_TIPO: Record<TipoArquivo, ClienteArquivo | null> = {
  romaneio_entrega: 'nutrimax', escala_rota: 'nutrimax', pao_jac: 'nutrimax',
  escala_portofrio: 'portofrio', rq_entregas: 'rioquality', desconhecido: null,
}
const CAMPO_DO_TIPO: Record<TipoArquivo, CampoEnvio | null> = {
  romaneio_entrega: 'romaneio', escala_rota: 'escala', pao_jac: 'romaneioPao',
  escala_portofrio: null, rq_entregas: 'completo', desconhecido: null,
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Tipo do PDF pelo texto extraído (pdf-parse). Pura. */
export function classificarTexto(texto: string): TipoArquivo {
  const t = semAcento(texto)
  if (/8012\s*-\s*Romaneio de Entrega/i.test(t) || (/PLACA\/MOTORISTA:/.test(t) && /CARGA\/DESTINO:/.test(t))) return 'romaneio_entrega'
  if (/8081\s*-\s*Escala de Rota/i.test(t) || /CARGA\s*VEICULO\s*DESTINO/i.test(t)) return 'escala_rota'
  if (/^\s*DATA\s*\d{2}\/\d{2}\/\d{4}/m.test(t) && /^\s*ROMANEIO\s*\d+\s*MOTORISTA/m.test(t) && /^\s*CARRO/m.test(t)) return 'pao_jac'
  if (/Rota\s*Placa\s*Romaneio\s*Razao social/i.test(t)) return 'escala_portofrio'
  return 'desconhecido'
}

/** Escala de rotas da Porto Frio: cada entrega começa por Rota + Placa +
 *  Romaneio colados ("42121TAM6J7442121..."). 21/10: 273 entregas, 14 rotas, 13 placas. */
export function contarPortoFrio(texto: string): { entregas: number; rotas: number; placas: number } {
  const linhas = [...texto.matchAll(/^(\d{4,6})([A-Z]{3}\d[A-Z0-9]\d{2})\d{4,6}/gm)]
  return { entregas: linhas.length, rotas: new Set(linhas.map(m => m[1])).size, placas: new Set(linhas.map(m => m[2])).size }
}

const n = (x: number) => x.toLocaleString('pt-BR')
const plural = (x: number, um: string, varios: string) => `${n(x)} ${x === 1 ? um : varios}`
const ddmm = (iso: string | null) => (iso ? ` de ${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')

/** Escala 8081: a 1ª dd/mm/aaaa do texto é a data/hora de IMPRESSÃO
 *  ("23/10/2026 03:38 Page 1 of 3"), não o dia da operação (F3-R05). */
export function dataImpressaDaEscala(texto: string): string | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(texto)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

export function resumoDoArquivo(tipo: TipoArquivo, data: string | null, c: ArquivoReconhecido['contagens'], impressaEm?: string | null): string {
  const base = montarResumo(tipo, data, c)
  if (!impressaEm) return base
  const rotulo = ROTULO_TIPO[tipo] + ddmm(data)
  return `${rotulo} (impressa em ${impressaEm.slice(8, 10)}/${impressaEm.slice(5, 7)})${base.slice(rotulo.length)}`
}

function montarResumo(tipo: TipoArquivo, data: string | null, c: ArquivoReconhecido['contagens']): string {
  const partes: string[] = []
  if (c.notas != null) partes.push(plural(c.notas, 'nota', 'notas'))
  if (c.entregas != null) partes.push(plural(c.entregas, 'entrega', 'entregas'))
  if (c.cargas != null) partes.push(plural(c.cargas, 'carga', 'cargas'))
  if (c.carros != null) partes.push(plural(c.carros, 'carro', 'carros'))
  if (c.rotas != null) partes.push(plural(c.rotas, 'rota', 'rotas'))
  if (c.romaneios != null) partes.push(plural(c.romaneios, 'romaneio', 'romaneios'))
  const rotulo = tipo === 'rq_entregas' && c.colunas === 55 ? `${ROTULO_TIPO.rq_entregas} (55 colunas)` : ROTULO_TIPO[tipo]
  return `${rotulo}${ddmm(data)}${partes.length ? ` — ${partes.join(', ')}` : ''}`
}

function desconhecido(nome: string): ArquivoReconhecido {
  return { nome, tipo: 'desconhecido', cliente: null, campo: null, data: null, contagens: {}, resumo: ROTULO_TIPO.desconhecido }
}

function reconhecido(nome: string, tipo: TipoArquivo, data: string | null, contagens: ArquivoReconhecido['contagens'], erro?: string, impressaEm?: string | null): ArquivoReconhecido {
  return {
    nome, tipo, cliente: CLIENTE_DO_TIPO[tipo], campo: CAMPO_DO_TIPO[tipo], data, contagens,
    resumo: resumoDoArquivo(tipo, data, contagens, impressaEm), ...(impressaEm ? { impressaEm } : {}), ...(erro ? { erro } : {}),
  }
}

function reconhecerPlanilha(buf: Buffer, nome: string): ArquivoReconhecido {
  let entregas: ReturnType<typeof parseEntregasCompletas>
  try { entregas = parseEntregasCompletas(buf) } catch { return desconhecido(nome) }
  if (entregas.length === 0) return desconhecido(nome)
  let colunas: number | undefined
  try {
    const wb = XLSX.read(buf, { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }) as unknown[][]
    const cab = rows.find(r => (r ?? []).some(c => semAcento(String(c ?? '')).trim().toUpperCase() === 'RAZAO SOCIAL'))
    if (cab) colunas = cab.filter(c => String(c ?? '').trim() !== '').length
  } catch { /* sem contagem de colunas */ }
  const comNf = entregas.some(e => e.nf)
  const contagens: ArquivoReconhecido['contagens'] = comNf
    ? { notas: entregas.length, romaneios: new Set(entregas.map(e => e.romaneio).filter(Boolean)).size }
    : { entregas: entregas.length, placas: new Set(entregas.map(e => e.placaNorm).filter(Boolean)).size }
  if (colunas != null) contagens.colunas = colunas
  return reconhecido(nome, 'rq_entregas', null, contagens)
}

async function textoDoPdf(buf: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>
  return (await pdfParse(buf)).text
}

/** Reconhece um arquivo solto na área do dia. Nunca lança. */
export async function reconhecerArquivo(buf: Buffer, nome: string): Promise<ArquivoReconhecido> {
  const cabeca = buf.subarray(0, 5).toString('latin1')
  if (cabeca.startsWith('PK')) return reconhecerPlanilha(buf, nome)
  if (!cabeca.startsWith('%PDF')) return desconhecido(nome)
  let texto: string
  try { texto = await textoDoPdf(buf) } catch { return desconhecido(nome) }
  const tipo = classificarTexto(texto)
  try {
    switch (tipo) {
      case 'romaneio_entrega': {
        const linhas = parseRomaneioTexto(texto)
        return reconhecido(nome, tipo, extrairDataCabecalhoRomaneio(texto), { notas: linhas.length, cargas: new Set(linhas.map(l => l.carga)).size })
      }
      case 'escala_rota': {
        const escala = await parseEscala(buf)
        // F3-R05: data impressa não decide se serve; a conferência é pelas
        // cargas do romaneio (conferirEscala, F1-13) no envio.
        return reconhecido(nome, tipo, null, { cargas: new Set(escala.map(e => e.carga)).size }, undefined, dataImpressaDaEscala(texto))
      }
      case 'pao_jac': {
        const m = /DATA\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(texto)
        const data = m ? `${m[3]}-${m[2]}-${m[1]}` : null
        const pao = parsePaoTexto(texto, data ?? '')
        return reconhecido(nome, tipo, data, { notas: pao.linhas.length, carros: new Set(pao.linhas.map(l => l.carga)).size })
      }
      case 'escala_portofrio': {
        const c = contarPortoFrio(texto)
        return reconhecido(nome, tipo, null, { entregas: c.entregas, rotas: c.rotas, placas: c.placas })
      }
      default:
        return desconhecido(nome)
    }
  } catch (err) {
    return reconhecido(nome, tipo, null, {}, err instanceof Error ? err.message : String(err))
  }
}

/** O arquivo entra no Ao vivo deste cliente? (Porto Frio e desconhecido: não.) */
export function cabeNoAoVivo(a: Pick<ArquivoReconhecido, 'cliente' | 'campo'>, cliente: 'nutrimax' | 'rioquality'): boolean {
  return a.cliente === cliente && a.campo != null
}
