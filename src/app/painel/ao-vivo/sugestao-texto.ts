// Texto e corpo do POST de uma sugestão de troca ("Carro trocado?"), usados
// no Ao vivo e na "Placas do dia" (F1-02/F1-03/F1-04). Funções puras.
import type { SugestaoTroca } from '@/lib/kpi-romaneio/sugerir-trocas'

const dias = (n: number) => `${n} dia${n === 1 ? '' : 's'}`

/** `nomeCarga`: 'Romaneio' na Rio Quality (24/11). */
export function textoSugestao(s: SugestaoTroca, nomeCarga = 'Carga'): string {
  const conta = `parou em ${s.enderecosVisitados} de ${s.enderecosDaCarga} endereços`
  const conf = s.recorrente ? ` (troca recorrente: já confirmada em ${dias(s.confirmadaAntes ?? 0)})`
    : s.confirmadaAntes ? ` (já confirmado em ${dias(s.confirmadaAntes)})` : ''
  if (s.modo === 'mutua') return `${nomeCarga} ${s.carga}: o ${s.placaEscala} e o ${s.placaSugerida} trocaram as cargas entre si; o ${s.placaSugerida} ${conta} do ${s.placaEscala}${conf}.`
  if (!s.placaEscala) return `${nomeCarga} ${s.carga} veio sem placa; o ${s.placaSugerida} ${conta}${conf}.`
  if (s.motivo === 'fora_da_frota') return `${nomeCarga} ${s.carga}: a placa ${s.placaEscala} não existe na frota; o ${s.placaSugerida} ${conta}${conf}.`
  // 25/11 (Ana): na RQ a placa vem do cadastro do romaneio na Fusion, não de escala.
  if (nomeCarga === 'Romaneio') return `${nomeCarga} ${s.carga}: na Fusion está no ${s.placaEscala}, mas ele não passou nos clientes; o ${s.placaSugerida} ${conta}${conf}.`
  return `${nomeCarga} ${s.carga}: o ${s.placaEscala} da escala não passou nos clientes; o ${s.placaSugerida} ${conta}${conf}.`
}

/** Corpo do POST /api/kpi/ao-vivo/troca. `data` vazio = hoje. `digitada`
 *  (opcional) vale no lugar da placa sugerida (redirecionar). */
export function corpoSugestao(s: SugestaoTroca, data?: string, digitada?: string) {
  const comData = data ? { data } : {}
  if (s.modo === 'mutua' && !digitada?.trim()) return { modo: 'mutua' as const, ...comData, placaEscala: s.placaEscala, placaB: s.placaSugerida }
  return { modo: 'redirecionar' as const, ...comData, carga: s.carga, placaEscala: s.placaEscala, placaReal: digitada?.trim() || s.placaSugerida }
}
