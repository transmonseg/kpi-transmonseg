/**
 * Testa se XLSX e PDF armazenam timestamps no mesmo formato (BR ou UTC).
 */
import { readFileSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'

;(async () => {
  const xlsx = await parseUnitrac(readFileSync(BASE + '/relatorio_9391.xlsx'))
  const pdf = await parseUnitracPdf(readFileSync(BASE + '/relatorio_9572.pdf'), new Set())

  const placa = 'LQU5546'
  const vx = xlsx.find(v => v.placa_norm === placa)!
  const vp = pdf.find(v => v.placa_norm === placa)!

  console.log('═══ Comparação raw das primeiras paradas ═══\n')
  console.log(`Parada 1 (00:02-02:35):`)
  console.log(`  XLSX: chegada=${vx.paradas[0].chegada.toISOString()} | getUTCHours=${vx.paradas[0].chegada.getUTCHours()}`)
  console.log(`  PDF:  chegada=${vp.paradas[0].chegada.toISOString()} | getUTCHours=${vp.paradas[0].chegada.getUTCHours()}`)

  // Pegar a parada LOJA IPANEMA 04:45
  const lojaIp = vx.paradas.find(p => p.classificacao === 'LOJA' && p.codigo_loja === '9039027')
  const lojaIpPdf = vp.paradas.find(p => p.classificacao === 'LOJA' && p.codigo_loja === '9039027')
  if (lojaIp && lojaIpPdf) {
    console.log(`\nParada Loja IPANEMA (esperado 04:45-05:03 BR):`)
    console.log(`  XLSX: chegada=${lojaIp.chegada.toISOString()} | getUTCHours=${lojaIp.chegada.getUTCHours()} | getHours=${lojaIp.chegada.getHours()}`)
    console.log(`  PDF:  chegada=${lojaIpPdf.chegada.toISOString()} | getUTCHours=${lojaIpPdf.chegada.getUTCHours()} | getHours=${lojaIpPdf.chegada.getHours()}`)
  }

  console.log('\n═══ Conclusão ═══')
  console.log('Se XLSX tem getUTCHours=4 e PDF também = ambos armazenam BR mascarado como UTC (correto)')
  console.log('Se XLSX tem getUTCHours=7 e PDF tem 4 = XLSX armazena UTC REAL, BUG!')
})()
