// "Placas do dia" (D-28, F1-05): a troca de placa vai pela MESMA rota do Ao
// vivo (/api/kpi/ao-vivo/troca, com a data escolhida), que grava em
// kpi_troca_placa, move as NFs no monitoramento e recalcula o dia. Funções
// puras (testáveis) separadas da página.

export type FormTrocaDia = { placaEscala: string; placaReal: string; carga: string }
export type PayloadTrocaDia =
  | { modo: 'redirecionar'; data: string; carga: string; placaEscala: string; placaReal: string }
  | { modo: 'substituir'; data: string; placaEscala: string; placaB: string }

/** Com carga: redireciona só ela (placa da escala vazia = carga que veio sem
 *  placa, F1-03). Sem carga: a placa inteira do dia passa pra outra. */
export function payloadTrocaDoDia(data: string, f: FormTrocaDia): PayloadTrocaDia | { erro: string } {
  const carga = f.carga.trim().toUpperCase()
  const placaEscala = f.placaEscala.trim()
  const placaReal = f.placaReal.trim()
  if (!placaReal) return { erro: 'Informe a placa que rodou.' }
  if (carga) return { modo: 'redirecionar', data, carga, placaEscala, placaReal }
  if (!placaEscala) return { erro: 'Carga sem placa: informe o número da carga.' }
  return { modo: 'substituir', data, placaEscala, placaB: placaReal }
}

type Monit = { ok: boolean; pontos?: number; erro?: string }
export type RespostaTroca = {
  ok?: boolean
  modo?: string
  monitoramento?: Monit
  movimentos?: { de: string; para: string; semNotas?: boolean; monitoramento: Monit }[]
}

/** Texto da tela. Monitoramento que não moveu nada (pontos=0 com NFs) é
 *  ERRO visível (F1-05), não "Salvo". */
export function mensagemDaTroca(j: RespostaTroca): { ok: boolean; texto: string } {
  const fim = ' O KPI do dia recalcula em instantes.'
  const feito = j.modo === 'desfazer' ? 'Troca desfeita' : 'Troca registrada'
  if (j.movimentos) {
    const falhas = j.movimentos.filter(m => !m.monitoramento.ok || m.semNotas)
    if (falhas.length === 0) return { ok: true, texto: `${feito} e o monitoramento atualizado.${fim}` }
    return { ok: false, texto: `${feito}, mas o monitoramento NÃO foi atualizado: ${falhas.map(m => `${m.de}→${m.para} (${m.semNotas ? 'sem notas no romaneio' : m.monitoramento.erro})`).join(', ')}.${fim}` }
  }
  const m = j.monitoramento
  if (m && !m.ok) return { ok: false, texto: `${feito}. Monitoramento NÃO foi atualizado: ${m.erro ?? 'erro desconhecido'}.${fim}` }
  const pontos = m?.pontos ?? 0
  return { ok: true, texto: `${feito}${pontos > 0 ? ` e ${pontos} ponto${pontos === 1 ? '' : 's'} passa${pontos === 1 ? '' : 'ram'} de carro no monitoramento` : ''}.${fim}` }
}
