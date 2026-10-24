import type { RomaneioFusion, EntregaFusionRaw } from '../fusion/tipos'
import type { EntregaRioQualityCompleta, GabaritoEntregaRioQuality } from './parse-planilhas'
import { buscarEntregasDoDia, buscarRelatorioEntregasFusion, placaFicticia } from '../fusion/entregas'

const normPlaca = (p: string) => (p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

function gabaritoFusion(e: EntregaFusionRaw): GabaritoEntregaRioQuality {
  const entregue = !e.data_devolucao && !e.data_adiado && (!!e.data_entrega || e.t32_status === '7')
  const status = e.data_devolucao ? 'Devolvido' : e.data_adiado ? 'Entrega Em Andamento' : entregue ? 'Entregue' : 'Faturado'
  return {
    status,
    checkIn: !!e.data_chegada,
    checkOut: !!(e.data_entrega ?? e.t12_data_real_entrega),
    dataCheckIn: e.data_chegada ?? null,
    dataCheckOut: e.data_entrega ?? e.t12_data_real_entrega ?? null,
    motivoDevolucao: e.data_devolucao ? 'DEVOLUCAO' : null,
  }
}

// RQ-04 (placa de preenchimento) mora em fusion/entregas.ts: vale para a grade e para o relatorio de 55 colunas.
export { placaFicticia }

export function mapearEntregasFusion(romaneios: RomaneioFusion[], entregas: EntregaFusionRaw[]): EntregaRioQualityCompleta[] {
  const porId = new Map(romaneios.map(r => [r.t10_id, r]))
  return entregas.map(e => {
    const rom = porId.get(e.t10_id)
    return {
      placaNorm: placaFicticia(normPlaca(rom?.t06_placa ?? '')) ? '' : normPlaca(rom?.t06_placa ?? ''),
      clienteNome: e.t16_razSocial,
      cidade: e.t32_cidade,
      uf: 'RJ',
      destino: rom?.t10_destino ?? '',
      motorista: rom?.t05_nome ?? '',
      rua: e.t32_endereco,
      bairro: '',
      nf: e.t32_seq_pedido_erp,
      clienteCodigo: e.t32_seq_pedido_erp,
      pedidoErp: e.t32_seq_pedido_erp,
      romaneio: e.t10_id,
      rota: rom?.t10_destino ?? '',
      gabarito: gabaritoFusion(e),
    }
  })
}

export async function buscarDiaRioQualityFusion(data: string): Promise<EntregaRioQualityCompleta[]> {
  const { romaneios, entregas } = await buscarEntregasDoDia(data)
  if (romaneios.length === 0) return []
  return mapearEntregasFusion(romaneios, entregas)
}

/** F4-09: de onde veio o dia da Fusion. 'fusion55' = relatorio de 55 colunas
 *  (NF real, bairro, codigo do cliente; o mesmo arquivo que a Erica sobe);
 *  'fusion' = grade de entregas realizadas (pedido como NF, sem bairro). */
export type FonteDiaFusion = 'fusion55' | 'fusion'
export type DiaRioQualityFusion = { linhas: EntregaRioQualityCompleta[]; fonte: FonteDiaFusion; aviso: string | null }

/** Dia da RQ pela Fusion: primeiro o relatorio de 55 colunas; se ele falhar
 *  (ou vier vazio com a grade cheia), a grade com aviso. gradeComoReserva
 *  false = o dia guardado ja' e' de 55 colunas: trocar NF real e bairro pela
 *  grade pioraria o dia, entao a falha sobe (status 'erro', dia mantido). */
export async function buscarDiaRioQualityFusionCompleto(data: string, opcoes: { gradeComoReserva?: boolean } = {}): Promise<DiaRioQualityFusion> {
  const gradeComoReserva = opcoes.gradeComoReserva ?? true
  let motivo: string
  try {
    const linhas = await buscarRelatorioEntregasFusion(data)
    if (linhas.length > 0 || !gradeComoReserva) return { linhas, fonte: 'fusion55', aviso: null }
    motivo = 'veio sem linhas'
  } catch (e) {
    const msg = e instanceof Error ? `${e.name === 'Error' ? '' : `${e.name}: `}${e.message}` : String(e)
    if (!gradeComoReserva) throw new Error(`relatório de 55 colunas da Fusion falhou (${msg}); dia guardado mantido`)
    motivo = `falhou (${msg})`
  }
  const grade = await buscarDiaRioQualityFusion(data)
  if (grade.length === 0) return { linhas: [], fonte: 'fusion55', aviso: null }
  return {
    linhas: grade, fonte: 'fusion',
    aviso: `O relatório de 55 colunas da Fusion ${motivo}: o dia veio da grade, sem bairro e com o pedido no lugar da NF. O próximo tick tenta o relatório de novo.`,
  }
}
