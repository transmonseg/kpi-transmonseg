import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { lerKpi, normLoja } from './_lib/ler-kpi'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 21'
const MAN = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/INTENSIVA/KPIS_MANUAIS_REFERENCIA/KPI-ARMAZEM_GRAO-MANUAL.xlsx'
const GER = 'C:/Users/media/Downloads/KPI-ARMAZEM_GRAO-2026-05-21.xlsx'

function fmt(d: Date | null | undefined): string {
  if (!d) return '---'
  return String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0')
}

;(async () => {
  console.log('═══ ESCALA ═══')
  const escala = await parseEscalaArmazemGrao(
    readFileSync(BASE + '/ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx'),
    '2026-05-21',
  )
  const armazem = escala.filter(l => l.rede_id === 'ARMAZEM_GRAO')
  for (const l of armazem) console.log(`  ${l.loja_nome_raw.padEnd(45)} placa=${(l.placa_norm ?? '?').padEnd(10)} motorista=${l.motorista_nome ?? '?'}`)

  console.log('\n═══ MANUAL aba 21.05 ═══')
  const manual = await lerKpi(MAN, '21.05')
  for (const l of manual) console.log(`  ${l.loja.padEnd(45)} placa=${l.placa1.padEnd(10)} SC=${l.sc1} CHD=${l.chd1} SL=${l.sl1}`)

  console.log('\n═══ GERADO ═══')
  const gerado = await lerKpi(GER)
  for (const l of gerado) console.log(`  ${l.loja.padEnd(45)} placa=${l.placa1.padEnd(10)} SC=${l.sc1} CHD=${l.chd1} SL=${l.sl1}`)

  console.log('\n═══ COMPARAÇÃO ═══')
  const mByLoja = new Map(manual.map(l => [normLoja(l.loja), l]))
  const gByLoja = new Map(gerado.map(l => [normLoja(l.loja), l]))
  for (const [k, m] of mByLoja) {
    const g = gByLoja.get(k)
    if (!g) { console.log(`  ❓ SÓ MANUAL: ${m.loja}`); continue }
    const same = m.sc1 === g.sc1 && m.chd1 === g.chd1 && m.sl1 === g.sl1
    if (same) console.log(`  ✅ ${m.loja.slice(0, 40).padEnd(40)} ${m.sc1}/${m.chd1}/${m.sl1}`)
    else console.log(`  ❌ ${m.loja.slice(0, 40).padEnd(40)} man=${m.sc1}/${m.chd1}/${m.sl1}  ger=${g.sc1}/${g.chd1}/${g.sl1}`)
  }
  for (const [k, g] of gByLoja) if (!mByLoja.has(k)) console.log(`  ❓ SÓ GERADO: ${g.loja}`)

  console.log('\n═══ UNITRAC PDF dia 21 — placas do ARMAZEM ═══')
  const pdf = await parseUnitracPdf(readFileSync('C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 21/relatorio_9553.pdf'), new Set())
  const placas = new Set(armazem.map(l => l.placa_norm).filter(Boolean) as string[])
  for (const placa of placas) {
    const v = pdf.find(x => x.placa_norm === placa)
    if (!v) { console.log(`\n${placa}: PLACA NÃO ESTÁ NO UNITRAC`); continue }
    console.log(`\n${placa} — ${v.paradas.length} paradas:`)
    const sorted = [...v.paradas].sort((a, b) => +new Date(a.chegada) - +new Date(b.chegada))
    for (const p of sorted) {
      const dur = p.duracao_seg ? Math.round(p.duracao_seg/60) + 'min' : '?'
      console.log(`  [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)} (${dur.padStart(6)})  cod=${(p.codigo_loja ?? '-').padEnd(10)} ${(p.nome_loja ?? p.local_parada ?? '').slice(0,55)}`)
    }
  }
})()
