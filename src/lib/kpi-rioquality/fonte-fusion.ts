import type { RomaneioFusion, EntregaFusionRaw } from '../fusion/tipos'
import type { EntregaRioQualityCompleta, GabaritoEntregaRioQuality } from './parse-planilhas'
import { buscarEntregasDoDia } from '../fusion/entregas'

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

/** Auditoria 20/10 (RQ-04): a Fusion aceita placa de preenchimento (XXX5678,
 *  108 NFs em 15/10). Nao e' veiculo nenhum: a regra "sem rastreador conta
 *  como correto" (04/10) e' pra caminhao real sem rastreador. Vira carga sem
 *  placa -- fora da taxa, com aviso pra operacao. */
export function placaFicticia(placaNorm: string): boolean {
  return /^XXX/.test(placaNorm)
}

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
