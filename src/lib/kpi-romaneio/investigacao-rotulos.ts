// Textos da investigação das não entregues (usados pela tela; sem imports de servidor).
import type { CategoriaInvestigacao, Investigacao } from './investigacao'

/** Ordem de exibição: do mais acionável (carro esteve lá) ao menos. */
export const CATEGORIAS_INVESTIGACAO: CategoriaInvestigacao[] = ['parou_no_cliente', 'parou_perto', 'parou_na_regiao', 'nao_chegou_perto', 'sem_gps', 'sem_coordenada']

export const ROTULO_INVESTIGACAO: Record<CategoriaInvestigacao, { titulo: string; dica: string }> = {
  parou_no_cliente: { titulo: 'Parou no cliente (até 150 m)', dica: 'Pode ser entrega que o KPI não contou. Conferir.' },
  parou_perto: { titulo: 'Parou perto (150 a 500 m)', dica: 'Endereço ou ponto do cliente pode estar errado.' },
  parou_na_regiao: { titulo: 'Parou na região (500 m a 2 km)', dica: 'Coordenada do cliente pode estar errada, ou o carro não foi.' },
  nao_chegou_perto: { titulo: 'Não chegou perto (mais de 2 km)', dica: 'O carro não passou no cliente.' },
  sem_gps: { titulo: 'Sem GPS no dia', dica: 'Rastreador sem paradas registradas.' },
  sem_coordenada: { titulo: 'Cliente sem coordenada', dica: 'Endereço não localizado no mapa.' },
}

/** "Parada mais perto: 120 m do cliente às 14:32 (8 min)." */
export function fraseInvestigacao(i: Investigacao): string {
  if (i.distM == null) return ROTULO_INVESTIGACAO[i.categoria].dica
  const dist = i.distM >= 1000 ? `${(i.distM / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `${i.distM} m`
  return `Parada mais perto: ${dist} do cliente${i.hora ? ` às ${i.hora}` : ''}${i.minutos != null ? ` (${i.minutos} min)` : ''}.`
}
