// Revisao Fase 2 (F2-REV-02). Desde o F2-04 o dia da Fusion vai ao
// monitoramento em modo "substituir" a cada tick: romaneio que some do dia
// (resposta anomala da Fusion, sem rows ou com parte delas) tem os pontos
// apagados no mapa, com a presenca confirmada, e volta 10 min depois sem
// presenca. A trava do monitoramento (menos de 50% das NFs) nao pega um
// romaneio de ~40 NFs num dia de 2.450 (20/10).
//
// Regra: romaneio do dia guardado (fonte fusion) com NF que sumiu do dia novo
// (NF reatribuida a outro romaneio nao conta: continua no dia) =>
// a sincronizacao e' recusada (o dia guardado e o mapa ficam como estao) ate'
// a mesma leitura se repetir LEITURAS_PARA_ACEITAR_ENCOLHIMENTO vezes
// seguidas (~30 min): ai' e' cancelamento/troca de verdade e segue.
// Nos logs de 14 a 22/10 o total de NFs da RQ por tick so' cresceu.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EntregaRioQualityCompleta } from './parse-planilhas'

export const LEITURAS_PARA_ACEITAR_ENCOLHIMENTO = 3

export type RomaneioEncolhido = { romaneio: string; placa: string; antes: number; agora: number }
export type EstadoEncolhimento = { assinatura: string; vezes: number }

type Linha = Pick<EntregaRioQualityCompleta, 'romaneio' | 'placaNorm' | 'nf'>

/** Romaneios do dia guardado com NF que sumiu do dia novo (a NF que so' trocou
 *  de romaneio continua no dia e nao conta). agora = antes - sumidas. */
export function romaneiosQueEncolheram(guardado: Linha[], novo: Linha[]): RomaneioEncolhido[] {
  const nfsNovas = new Set(novo.map(l => l.nf))
  const porRomaneio = new Map<string, RomaneioEncolhido>()
  for (const l of guardado) {
    const r = (l.romaneio ?? '').trim()
    if (!r) continue
    const c = porRomaneio.get(r) ?? { romaneio: r, placa: l.placaNorm ?? '', antes: 0, agora: 0 }
    c.antes++
    if (nfsNovas.has(l.nf)) c.agora++
    porRomaneio.set(r, c)
  }
  return [...porRomaneio.values()].filter(c => c.agora < c.antes).sort((x, y) => x.romaneio.localeCompare(y.romaneio))
}

const descrever = (enc: RomaneioEncolhido[]) =>
  enc.map(e => `${e.romaneio} (${e.placa || 'sem placa'}) ${e.antes} -> ${e.agora}`).join(', ')

/** aceitar=false: nao guarda nem envia. estado: o que gravar para o proximo tick (null = limpar). */
export function decidirEncolhimentoFusion(enc: RomaneioEncolhido[], anterior: EstadoEncolhimento | null):
  { aceitar: boolean; estado: EstadoEncolhimento | null; mensagem: string | null } {
  if (enc.length === 0) return { aceitar: true, estado: null, mensagem: null }
  const assinatura = descrever(enc)
  const vezes = anterior?.assinatura === assinatura ? anterior.vezes + 1 : 1
  if (vezes >= LEITURAS_PARA_ACEITAR_ENCOLHIMENTO) {
    return { aceitar: true, estado: null, mensagem: `Fusion: romaneio(s) com menos NFs que o dia guardado em ${vezes} leituras seguidas -- aceito: ${assinatura}` }
  }
  return {
    aceitar: false, estado: { assinatura, vezes },
    mensagem: `Fusion devolveu romaneio(s) com menos NFs que o dia guardado (${vezes}/${LEITURAS_PARA_ACEITAR_ENCOLHIMENTO}): ${assinatura} -- dia guardado e mapa mantidos`,
  }
}

export const arquivoEstadoEncolhimentoFusion = (data: string) => join(tmpdir(), `kpi-fusion-encolheu-rq-${data}.json`)

export function lerEstadoEncolhimentoFusion(data: string): EstadoEncolhimento | null {
  try {
    const f = arquivoEstadoEncolhimentoFusion(data)
    if (!existsSync(f)) return null
    const j = JSON.parse(readFileSync(f, 'utf8')) as Partial<EstadoEncolhimento>
    return typeof j.assinatura === 'string' && typeof j.vezes === 'number' ? { assinatura: j.assinatura, vezes: j.vezes } : null
  } catch { return null }
}

export function gravarEstadoEncolhimentoFusion(data: string, estado: EstadoEncolhimento | null): void {
  try {
    const f = arquivoEstadoEncolhimentoFusion(data)
    if (estado) writeFileSync(f, JSON.stringify({ ...estado, em: new Date().toISOString() }))
    else rmSync(f, { force: true })
  } catch { /* sem estado: a contagem recomeca (so' atrasa o aceite) */ }
}
