// Monta o corpo do POST /api/kpi/ao-vivo/troca conforme o modo escolhido na
// tela. Função pura (testável) separada da UI.
import type { ModoTroca } from '@/lib/kpi-romaneio/trocas-placa'

export type EntradaTroca = { carga?: string; placaA?: string; placaB?: string }
export type PayloadTroca =
  | { modo: 'redirecionar'; carga: string; placaEscala: string; placaReal: string }
  | { modo: 'mutua' | 'substituir'; placaEscala: string; placaB: string }

export function montarPayloadTroca(modo: ModoTroca, e: EntradaTroca): PayloadTroca | { erro: string } {
  const carga = (e.carga ?? '').trim()
  const placaA = (e.placaA ?? '').trim()
  const placaB = (e.placaB ?? '').trim()
  if (modo === 'redirecionar') {
    if (!carga || !placaA || !placaB) return { erro: 'Escolha a carga e a placa.' }
    return { modo, carga, placaEscala: placaA, placaReal: placaB }
  }
  if (!placaA || !placaB) return { erro: 'Escolha as duas placas.' }
  return { modo, placaEscala: placaA, placaB }
}
