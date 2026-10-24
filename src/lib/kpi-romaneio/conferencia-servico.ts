// F3-03: lado servidor da fila "Conferir" -- acha a NF no resultado do dia
// (o mesmo que a tela mostra) e guarda/lê o comprovante no bucket do KPI.
import { createServiceClient } from '@/lib/supabase/service'
import { BUCKET_KPI_ROMANEIO } from './xlsx-gerado'
import { lerEstadoAoVivo, type ClienteAoVivo } from './ao-vivo-servico'
import { lerDiaHistorico } from './ao-vivo-historico'
import type { NfAoVivo } from './ao-vivo'

/** NF do dia como a tela mostra (hoje: último cálculo; dia passado: o
 *  histórico). 'sem_dia' = nada calculado nem guardado do dia. */
export async function nfDoDia(cliente: ClienteAoVivo, data: string, hoje: string, nf: string): Promise<{ placa: string; nf: NfAoVivo } | null | 'sem_dia'> {
  const resultado = data === hoje ? (await lerEstadoAoVivo(cliente, data)).resultado : (await lerDiaHistorico(cliente, data))?.resultado ?? null
  if (!resultado) return 'sem_dia'
  for (const p of resultado.placas) {
    const n = p.nfs.find(x => x.nf === nf)
    if (n) return { placa: p.placa, nf: n }
  }
  return null
}

export async function guardarComprovante(caminho: string, conteudo: ArrayBuffer, tipo: string): Promise<void> {
  const { error } = await createServiceClient().storage.from(BUCKET_KPI_ROMANEIO).upload(caminho, Buffer.from(conteudo), { contentType: tipo, upsert: false })
  if (error) throw new Error(`comprovante não guardado: ${error.message}`)
}

/** Usado só para desfazer o upload quando a gravação da resolução falha. */
export async function apagarComprovante(caminho: string): Promise<void> {
  await createServiceClient().storage.from(BUCKET_KPI_ROMANEIO).remove([caminho])
}

export async function baixarComprovante(caminho: string): Promise<Buffer | null> {
  const { data, error } = await createServiceClient().storage.from(BUCKET_KPI_ROMANEIO).download(caminho)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}
