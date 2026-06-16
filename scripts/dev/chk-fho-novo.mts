import { readFile } from 'fs/promises'
import { config } from 'dotenv'; config({ path: '.env.local' })
import { parseUnitracPdf } from '../../src/lib/parsers/unitrac-pdf.ts'
import { saidaBaseConhecida } from '../../src/lib/kpi/gerar-kpi-local.ts'
import { horarioEntregaGabarito } from '../../src/lib/kpi/horario-gabarito.ts'
const hhmm = (d: Date | null) => d ? `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}` : '— (em branco)'

// FHO no relatório da MANHÃ (10351)
const veic = await parseUnitracPdf(await readFile('C:/Users/media/Downloads/relatorio_10351 (1).pdf'), new Set(['FHO5F88']))
const fho = veic.find(v => v.placa_norm === 'FHO5F88')!
const paradas = fho.paradas.map(p => ({ classificacao: p.classificacao, chegada: new Date(p.chegada), saida: p.saida ? new Date(p.saida) : null }))
console.log('FHO-5F88 (relatório da manhã):')
console.log('  saída CD que o sistema MOSTRA agora (saidaBaseConhecida):', hhmm(saidaBaseConhecida(paradas)))
console.log('  esperado (mapa/tarde): 08:20\n')

// horário-gabarito (caso BBH1C94: PDF 05:34 vs API 06:54)
const d = (h: number, m: number) => new Date(Date.UTC(2026, 5, 16, h, m))
console.log('Horário-gabarito BBH1C94: PDF 05:34, API 06:54 →', hhmm(horarioEntregaGabarito(d(5,34), d(6,54))), '(esperado 06:54)')
console.log('Horário-gabarito divergência pequena: PDF 07:25, API 07:18 →', hhmm(horarioEntregaGabarito(d(7,25), d(7,18))), '(esperado 07:25, mantém PDF)')
