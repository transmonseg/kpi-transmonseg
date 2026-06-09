import { config } from 'dotenv'; config({ path: '.env.local' })
import { readFileSync } from 'node:fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { isRotaGigante } from '@/lib/kpi/rotas-gigantes'
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const r = await fetch(`${url}/rest/v1/lojas?select=codigo_unitrac&ativo=eq.true`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  const cad = new Set((await r.json() as any[]).map(l => l.codigo_unitrac).filter(Boolean))
  const vs = await parseUnitracPdf(readFileSync('C:/Users/media/Downloads/relatorio_10122.pdf'), new Set())
  const novas = new Map<string, { nome: string; vezes: number }>()
  let totalLoja = 0
  for (const v of vs) for (const p of v.paradas) {
    if (p.classificacao !== 'LOJA' || !p.codigo_loja) continue
    totalLoja++
    if (cad.has(p.codigo_loja) || isRotaGigante(p.codigo_loja)) continue
    const e = novas.get(p.codigo_loja); if (e) e.vezes++; else novas.set(p.codigo_loja, { nome: p.nome_loja ?? '', vezes: 1 })
  }
  console.log(`Cadastro: ${cad.size} códigos | paradas LOJA no relatório: ${totalLoja}`)
  console.log(`Códigos NOVOS (não cadastrados, fora rota gigante): ${novas.size}`)
  for (const [cod, x] of [...novas].sort((a,b)=>b[1].vezes-a[1].vezes).slice(0,25)) console.log(`   ${cod}  ${x.nome.slice(0,45)}  (${x.vezes}x)`)
}
main().catch(e=>{console.error(e);process.exit(1)})
