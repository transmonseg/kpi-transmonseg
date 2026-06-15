import { readFile } from 'fs/promises'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseUnitracPdf } from '../../src/lib/parsers/unitrac-pdf.ts'

// USO: npx tsx scripts/dev/diag-dia15.mts <pdf> <YYYY-MM-DD>
const [pdfPath, data] = process.argv.slice(2)
if (!pdfPath) { console.error('uso: diag-dia15.mts <pdf> [data]'); process.exit(1) }

// BRT mascarado como UTC → getUTCHours = hora BR direto (convenção do sistema)
const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
const dia = (d: Date) => d.toISOString().slice(0, 10)

const RECLAMADAS = ['FQN6J72', 'INW8A51', 'KRK3D12', 'KXB6E57', 'TML7D61', 'UBF5G36', 'KPB5I95', 'GAJ6H51', 'KNC1I34', 'EFU5H04', 'NTT4858', 'DBB8D19', 'MES7F27', 'JAJ6B36']
const cadastro = new Set(RECLAMADAS)

const buf = await readFile(pdfPath)
const resumos = await parseUnitracPdf(buf, cadastro)
console.log(`PDF parseado: ${resumos.length} veículos\n`)

// --- Janela global do PDF + reportMaxHora (como a rota calcula) ---
let minT = Infinity, maxT = -Infinity, reportMaxHora = 0
let countNoite = 0
const todasParadas: { placa: string; cls: string; chegada: Date; saida: Date | null }[] = []
for (const v of resumos) {
  for (const p of v.paradas) {
    const cheg = p.chegada instanceof Date ? p.chegada : new Date(p.chegada)
    const sai = p.saida ? (p.saida instanceof Date ? p.saida : new Date(p.saida)) : null
    todasParadas.push({ placa: v.placa_norm, cls: p.classificacao, chegada: cheg, saida: sai })
    const ref = sai ?? cheg
    minT = Math.min(minT, cheg.getTime())
    maxT = Math.max(maxT, ref.getTime())
    const h = ref.getUTCHours() + ref.getUTCMinutes() / 60
    reportMaxHora = Math.max(reportMaxHora, h)
    if (ref.getUTCHours() >= 20 || ref.getUTCHours() < 4) countNoite++
  }
}
console.log('=== JANELA DO PDF ===')
console.log(`min chegada : ${new Date(minT).toISOString().slice(0, 16).replace('T', ' ')} BRT`)
console.log(`max saída   : ${new Date(maxT).toISOString().slice(0, 16).replace('T', ' ')} BRT`)
console.log(`reportMaxHora (o que a rota usa p/ relatorioCedo): ${reportMaxHora.toFixed(2)}h`)
console.log(`relatorioCedo seria: ${reportMaxHora < 12 ? 'TRUE (protege)' : 'FALSE (NÃO protege!) <<<'}`)
console.log(`paradas em horário de madrugada/noite (>=20h ou <4h): ${countNoite} de ${todasParadas.length}\n`)

// distribuição por hora das saídas/refs
const porHora = new Array(24).fill(0)
for (const p of todasParadas) { const ref = p.saida ?? p.chegada; porHora[ref.getUTCHours()]++ }
console.log('=== DISTRIBUIÇÃO DE PARADAS POR HORA (ref=saída) ===')
console.log(porHora.map((n, h) => n ? `${String(h).padStart(2, '0')}h:${n}` : null).filter(Boolean).join('  '))
console.log()

// --- Detalhe das placas reclamadas ---
console.log('=== PLACAS RECLAMADAS ===')
for (const placa of RECLAMADAS) {
  const v = resumos.find(x => x.placa_norm === placa)
  if (!v) { console.log(`\n${placa}: NÃO ESTÁ NO PDF`); continue }
  console.log(`\n${placa}: ${v.paradas.length} paradas`)
  const sorted = [...v.paradas].sort((a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())
  for (const p of sorted) {
    const cheg = p.chegada instanceof Date ? p.chegada : new Date(p.chegada)
    const sai = p.saida ? (p.saida instanceof Date ? p.saida : new Date(p.saida)) : null
    const cod = p.codigo_loja ? ` cod=${p.codigo_loja}` : ''
    const nome = p.nome_loja ? ` ${p.nome_loja}` : ''
    console.log(`  [${p.classificacao.padEnd(9)}] ${dia(cheg)} ${hhmm(cheg)}→${sai ? hhmm(sai) : '—'}${cod}${nome}`)
  }
}
