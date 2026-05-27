/**
 * Usa o parser unitrac-pdf.ts do PROPRIO projeto pra extrair paradas
 * (mesma logica que o sistema em producao usa). Salva em md+json.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync, writeFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const PDF = process.argv[2] ?? 'docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'
const OUT = process.argv[3] ?? 'docs/conversas-tia-erica/dia-19/unitrac-pdf'

async function main() {
  const buf = readFileSync(PDF)
  // cadastroPlacas vazio (vai usar OCR padrao)
  const veiculos = await parseUnitracPdf(buf, new Set())
  console.log(`Veiculos extraidos: ${veiculos.length}`)
  const semParadas = veiculos.filter(v => v.paradas.length === 0).length
  const totalParadas = veiculos.reduce((s, v) => s + v.paradas.length, 0)
  console.log(`Total paradas: ${totalParadas}`)
  console.log(`Veiculos sem paradas: ${semParadas}`)

  // MD
  const out: string[] = [`# Unitrac PDF — dia 19/05/2026 (via parser projeto)`, '', `Total veiculos: ${veiculos.length}`, '']
  const json: Record<string, unknown[]> = {}
  for (const v of veiculos) {
    const placa = v.placa_norm
    out.push(`## ${placa}`, '', `${v.paradas.length} paradas`, '')
    out.push(`| Tipo | Chegada-Saida | Duracao | cod_loja | Nome/Local |`)
    out.push(`|---|---|---|---|---|`)
    const ps: unknown[] = []
    for (const p of v.paradas) {
      const ch = p.chegada instanceof Date ? p.chegada : new Date(p.chegada)
      const sa = p.saida instanceof Date ? p.saida : new Date(p.saida)
      const fmt = (d: Date) => `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`
      const dur = Math.round((p.duracao_seg ?? 0) / 60)
      out.push(`| ${p.classificacao} | ${fmt(ch)}-${fmt(sa)} | ${dur}min | ${p.codigo_loja ?? '-'} | ${(p.nome_loja ?? '').slice(0,50)} |`)
      ps.push({
        tipo: p.classificacao, chd: fmt(ch), sai: fmt(sa),
        dur_min: dur, cod_loja: p.codigo_loja ?? null,
        nome: p.nome_loja ?? null, local: p.local_parada ?? null,
      })
    }
    out.push('')
    json[placa] = ps
  }
  writeFileSync(OUT + '.md', out.join('\n'), 'utf-8')
  writeFileSync(OUT + '.json', JSON.stringify(json, null, 2), 'utf-8')
  console.log(`\n>> ${OUT}.md + .json salvos`)
}
main().catch(e => { console.error(e); process.exit(1) })
