// F3-05 (AC-13): uma porta só para o romaneio de hoje. Em 20 e 21/10 a Nutry
// entrou só pelo "Gerar KPI" (16:02 e 15:25 CEST) e o Ao vivo e o
// monitoramento só receberam pelo reparo automático (16:10 e 15:30): até lá o
// Ao vivo ficou vazio. Em 21/10 a RQ teve 3 envios do mesmo dia em 12 min
// (2 gerações + a subida no Ao vivo). Agora o "Gerar KPI" de HOJE grava também
// no Ao vivo e no monitoramento na mesma requisição, com o e-mail de quem
// gerou -- e não manda de novo o que já está lá (mesmo romaneio = nada a fazer).
// Dia passado: nada muda (o Gerar fica para dias passados).
import { mesclarEnvio, type DiaGuardado, type EnvioNovo } from './mesclar-envio'
import type { ArquivoMonitoramento, EnvioMonitoramento } from './enviar-monitoramento'
import type { EntregaRioQualityCompleta } from '@/lib/kpi-rioquality/parse-planilhas'
import type { ResultadoEnvioRQ } from '@/lib/kpi-rioquality/enviar-monitoramento-rq'

/** gravado = o Ao vivo recebeu o dia agora; igual = o Ao vivo já tinha
 *  exatamente isso (nada reenviado); nao = dia passado ou sem linhas;
 *  falhou = erro ao gravar (a geração segue, o reparo do tick cobre). */
export type SituacaoAoVivo = 'gravado' | 'igual' | 'nao' | 'falhou'
export type ResultadoPorta = { aoVivo: SituacaoAoVivo; monitoramento: EnvioMonitoramento[]; erro?: string }

/** Comparação que não depende da ordem das chaves: o jsonb do Postgres devolve
 *  as chaves reordenadas, então JSON.stringify direto acharia diferença onde
 *  não há. undefined some dos dois lados, como no JSON gravado. */
export function canonico(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    : x))
}
const mesmo = (a: unknown, b: unknown) => canonico(a) === canonico(b)

export type DepsPortaNutry = {
  lerDia(data: string): Promise<DiaGuardado | null>
  guardar(p: DiaGuardado & { data: string; enviadoPor: string | null }): Promise<void>
  enviarMonitoramento(arquivos: ArquivoMonitoramento[], enviadoPor: string | null): Promise<EnvioMonitoramento[]>
}

/** Nutry Max: o que a geração de hoje leu dos PDFs vai ao Ao vivo (mesma
 *  mesclagem do envio pelo Ao vivo: só o que veio troca) e os PDFs do romaneio
 *  e do pão que mudaram vão ao monitoramento. Nunca lança. */
export async function gravarHojeNutry(deps: DepsPortaNutry, p: {
  data: string; hoje: string; enviadoPor: string | null
  novo: EnvioNovo
  pdfs: { romaneio?: ArquivoMonitoramento | null; pao?: ArquivoMonitoramento | null }
}): Promise<ResultadoPorta> {
  if (p.data !== p.hoje || !p.novo.romaneio || p.novo.romaneio.length === 0) return { aoVivo: 'nao', monitoramento: [] }
  try {
    const guardado = await deps.lerDia(p.data)
    const dia = mesclarEnvio(guardado, p.novo)
    if ('erro' in dia) return { aoVivo: 'falhou', monitoramento: [], erro: dia.erro }
    const romaneioIgual = !!guardado && mesmo(guardado.romaneio, dia.romaneio)
    const paoIgual = !p.novo.pao || (!!guardado && guardado.paoEnviado && mesmo(guardado.pao, dia.pao))
    const tudoIgual = !!guardado && romaneioIgual && paoIgual && mesmo(guardado.escala, dia.escala)
      && guardado.escalaEnviada === dia.escalaEnviada && guardado.paoEnviado === dia.paoEnviado
    if (tudoIgual) return { aoVivo: 'igual', monitoramento: [] }
    await deps.guardar({ ...dia, data: p.data, enviadoPor: p.enviadoPor })
    const arquivos: ArquivoMonitoramento[] = [
      ...(!romaneioIgual && p.pdfs.romaneio ? [p.pdfs.romaneio] : []),
      ...(!paoIgual && p.pdfs.pao ? [p.pdfs.pao] : []),
    ]
    const monitoramento = arquivos.length > 0 ? await deps.enviarMonitoramento(arquivos, p.enviadoPor) : []
    return { aoVivo: 'gravado', monitoramento }
  } catch (err) {
    return { aoVivo: 'falhou', monitoramento: [], erro: err instanceof Error ? err.message : String(err) }
  }
}

export type DepsPortaRQ = {
  lerEntregas(data: string): Promise<EntregaRioQualityCompleta[] | null>
  guardar(data: string, entregas: EntregaRioQualityCompleta[], enviadoPor: string | null): Promise<void>
  enviarMonitoramento(data: string, entregas: EntregaRioQualityCompleta[], enviadoPor: string | null): Promise<ResultadoEnvioRQ>
}

/** Rio Quality: a planilha (Relatório de Entregas) da geração de hoje vira o
 *  dia do Ao vivo (fonte manual, como a subida pelo Ao vivo) e vai ao
 *  monitoramento no modo substituir. Mesma planilha já no Ao vivo = nada. */
export async function gravarHojeRQ(deps: DepsPortaRQ, p: {
  data: string; hoje: string; enviadoPor: string | null; entregas: EntregaRioQualityCompleta[]
}): Promise<ResultadoPorta> {
  if (p.data !== p.hoje || p.entregas.length === 0) return { aoVivo: 'nao', monitoramento: [] }
  try {
    const guardadas = await deps.lerEntregas(p.data)
    if (guardadas && mesmo(guardadas, p.entregas)) return { aoVivo: 'igual', monitoramento: [] }
    await deps.guardar(p.data, p.entregas, p.enviadoPor)
    const r = await deps.enviarMonitoramento(p.data, p.entregas, p.enviadoPor)
    return {
      aoVivo: 'gravado',
      monitoramento: [{ origem: 'romaneio', ok: r.ok, ...(r.linhasDoDia != null ? { linhas: r.linhasDoDia } : {}), ...(r.erro ? { erro: r.erro } : {}) }],
    }
  } catch (err) {
    return { aoVivo: 'falhou', monitoramento: [], erro: err instanceof Error ? err.message : String(err) }
  }
}

/** Cabeçalhos da resposta do Gerar (o corpo é o xlsx): a tela diz se o dia
 *  também foi ao Ao vivo e ao monitoramento. Só ASCII. */
export function cabecalhosPorta(r: ResultadoPorta): Record<string, string> {
  const mon = r.monitoramento.length === 0 ? 'nao' : r.monitoramento.every(m => m.ok) ? 'ok' : 'falhou'
  return { 'x-ao-vivo': r.aoVivo, 'x-monitoramento': mon }
}
