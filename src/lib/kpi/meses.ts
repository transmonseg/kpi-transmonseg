import { hojeBR } from '@/lib/data-br'

// Não existe catálogo fixo de meses (diferente de REDES, lista fechada de 18
// valores): o sistema começou a operar em maio/2026, então a lista de meses
// "conhecidos" pra liberar acesso é [início, mês atual] — cresce sozinha todo mês.
const MES_INICIO_SISTEMA = '2026-05'

export function mesesConhecidos(): string[] {
  const hoje = hojeBR().slice(0, 7)
  const meses: string[] = []
  let [y, m] = MES_INICIO_SISTEMA.split('-').map(Number)
  while (`${y}-${String(m).padStart(2, '0')}` <= hoje) {
    meses.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return meses
}

const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function formatMes(m: string): string {
  const [ano, mes] = m.split('-')
  return `${NOMES_MES[Number(mes) - 1]}/${ano}`
}
