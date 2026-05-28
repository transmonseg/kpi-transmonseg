import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync, writeFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const PDFS = [
  ['19', 'docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'],
  ['20', 'docs/conversas-tia-erica/dia-20/unitrac/relatorio_9522.pdf'],
  ['25', 'docs/conversas-tia-erica/dia-25/unitrac/relatorio_9652.pdf'],
]

async function main() {
  const sects: Record<string, string[]> = {
    base_loja: [],          // BASE + LOJA simultâneo
    duas_lojas: [],         // 2+ LOJAs no mesmo geofence
    rota_so: [],            // só ROTA, sem LOJA nem BASE
    rotas_unicas: [],       // lista de ROTAs
    naturcon: [],           // NATURCON GELADOS
    fora_base_longa: [],    // FORA_BASE > 60min
    lojas_estranhas: [],    // local_parada com nome que parece base mas é LOJA
  }
  const rotasSet = new Set<string>()
  const lojasUnicas = new Set<string>()

  for (const [dia, pdf] of PDFS) {
    const veiculos = await parseUnitracPdf(readFileSync(pdf), null)
    for (const v of veiculos) {
      for (const p of v.paradas) {
        const loc = (p.local_parada ?? '').replace(/\s+/g, ' ').trim()
        const hasBase = /BASE BENASSI/.test(loc)
        const codigos = [...loc.matchAll(/(\d{4,8})\s*-\s*([A-Z][^,]{2,40})/g)]
        const rotas = codigos.filter(m => /ROTA/i.test(m[2]))
        const lojas = codigos.filter(m => !/ROTA/i.test(m[2]) && !/BASE/i.test(m[2]))
        const ts = `${p.chegada.toISOString().slice(11,16)}-${p.saida.toISOString().slice(11,16)}`
        const tag = `d${dia} ${v.placa_norm} ${ts}`

        // 1. BASE + LOJA simultâneo
        if (hasBase && lojas.length > 0 && p.classificacao === 'LOJA') {
          sects.base_loja.push(`${tag} dur=${Math.round(p.duracao_seg/60)}min cod=${p.codigo_loja}  ${loc.slice(0, 130)}`)
        }
        // 2. 2+ LOJAs
        if (lojas.length >= 2) {
          sects.duas_lojas.push(`${tag} ${lojas.map(l=>l[1]).join(' / ')}  →  ${loc.slice(0, 130)}`)
        }
        // 3. só-ROTA (rotas presentes, sem LOJA cadastrada, sem BASE)
        if (rotas.length > 0 && lojas.length === 0 && !hasBase) {
          sects.rota_so.push(`${tag} dur=${Math.round(p.duracao_seg/60)}min ${rotas.map(r=>r[2]).join(',')}`)
        }
        // 4. ROTAs únicas
        for (const r of rotas) {
          rotasSet.add(`${r[1]} - ${r[2].trim()}`)
        }
        // Lojas únicas
        for (const l of lojas) {
          lojasUnicas.add(`${l[1]} - ${l[2].trim()}`)
        }
        // 5. NATURCON
        if (/NATURCON/i.test(loc)) {
          sects.naturcon.push(`${tag} cls=${p.classificacao} cod=${p.codigo_loja}  ${loc.slice(0, 100)}`)
        }
        // 6. FORA_BASE longa
        if (p.classificacao === 'FORA_BASE' && p.duracao_seg > 3600) {
          sects.fora_base_longa.push(`${tag} dur=${Math.round(p.duracao_seg/60)}min lat=${p.lat?.toFixed(4)} lng=${p.lng?.toFixed(4)}`)
        }
      }
    }
  }

  const out: string[] = ['# Padrões Unitrac dia 19+20+25\n']
  for (const [k, arr] of Object.entries(sects)) {
    out.push(`\n## ${k.toUpperCase()} (${arr.length} ocorrências)\n`)
    for (const ln of arr.slice(0, 80)) out.push(`- ${ln}`)
    if (arr.length > 80) out.push(`... (+${arr.length - 80})`)
  }
  out.push(`\n## ROTAs ÚNICAS (${rotasSet.size}):\n`)
  for (const r of [...rotasSet].sort()) out.push(`- ${r}`)
  out.push(`\n## LOJAs ÚNICAS (${lojasUnicas.size}):\n`)
  for (const l of [...lojasUnicas].sort()) out.push(`- ${l}`)

  writeFileSync('scripts/analise/_padroes_consolidado.md', out.join('\n'))
  console.log('OK scripts/analise/_padroes_consolidado.md')
  console.log(`base_loja=${sects.base_loja.length}  duas_lojas=${sects.duas_lojas.length}  rota_so=${sects.rota_so.length}  naturcon=${sects.naturcon.length}  fora_base_longa=${sects.fora_base_longa.length}`)
}
main().catch(e => { console.error(e); process.exit(1) })
