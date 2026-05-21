import { parseAlteracaoText } from '@/lib/parsers/alteracao-text'

const casos: [string, string][] = [
  ['Mega Box estruturado', 'Rede: ZONA_SUL\nLoja: Mega Box\nSai: FABRICIO\nPlaca sai: QSW3B65\nEntra: JAIRO\nPlaca entra: TJQ6J26'],
  ['ASSAI Caxias SWAP', 'Loja: Caxias\nSai: -\nPlaca sai: EZU9J51\nEntra: -\nPlaca entra: UBO5E05\nObs: Troca carro (motorista mesmo)'],
  ['ASSAI Tijuca', 'Rede: ASSAI\nLoja: Tijuca\nSai: VALDIR\nPlaca sai: DDI6J90\nEntra: PAULO HENRIQUE\nPlaca entra: DBB8D19'],
  ['Zona Sul Filial 43', 'Loja: Filial 43\nSai: DOUGLAS\nPlaca sai: LTE0A64\nEntra: EDUARDO\nPlaca entra: LQA5883'],
  ['Zona Sul raw', 'Alteracao zona sul\nFilial 10\nSai: Everton cyb3b90\nEntra: Rafael lkv5067'],
  ['PRINCESA Flamengo', 'Loja: Flamengo\nSai: KANU\nPlaca sai: KQR2J11\nEntra: RAFAEL\nPlaca entra: EYL8B91\nObs: Carro quebrou'],
  ['CARREFOUR Campos', 'Loja: Campos / Macae\nSai: AGENOR\nPlaca sai: KPN4F36\nEntra: VANOR\nPlaca entra: KZJ0E14\nObs: Caminhao quebrou'],
]

for (const [label, texto] of casos) {
  const r = parseAlteracaoText(texto)
  console.log(`[${label}]`)
  console.log(`  rede=${r.rede_id} loja=${r.loja_nome_raw} tipo=${r.tipo} conf=${r.confianca}`)
  console.log(`  sai=${r.sai?.placa_norm ?? '-'} entra=${r.entra?.placa_norm ?? '-'}`)
}
