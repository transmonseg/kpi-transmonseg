import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync, writeFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { createClient } from '@supabase/supabase-js'

async function processDia(dia: string, pdfPath: string) {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const veiculos = await parseUnitracPdf(readFileSync(pdfPath), null)
  const dataIso = `2026-05-${dia}`
  const { data: esc } = await svc.from('escala_linhas')
    .select('placa_norm, rede_id, loja_nome_raw')
    .eq('data_entrega', dataIso)
    .not('placa_norm', 'is', null)
  const escalaMap = new Map<string, Array<{ rede: string; loja: string }>>()
  for (const r of esc ?? []) {
    const arr = escalaMap.get(r.placa_norm as string) ?? []
    arr.push({ rede: r.rede_id as string, loja: r.loja_nome_raw as string })
    escalaMap.set(r.placa_norm as string, arr)
  }

  const out: string[] = [`# Análise placa por placa — Unitrac dia ${dia} (${veiculos.length} veículos)\n`]
  for (let i = 0; i < veiculos.length; i++) {
    const v = veiculos[i]
    const escala = escalaMap.get(v.placa_norm) ?? []
    const paradas = v.paradas
    const cnt = { BASE: 0, LOJA: 0, FORA_BASE: 0, FAKE_EXIT: 0 }
    const codsUnicos = new Set<string>()
    let baseLojaCombo = 0
    let multiLoja = 0
    for (const p of paradas) {
      cnt[p.classificacao as keyof typeof cnt] = (cnt[p.classificacao as keyof typeof cnt] ?? 0) + 1
      if (p.codigo_loja) codsUnicos.add(p.codigo_loja)
      const loc = p.local_parada ?? ''
      const lojas = [...loc.matchAll(/(\d{4,8})\s*-\s*([A-Z][^,]{2,40})/g)].filter(m => !/ROTA|BASE/i.test(m[2]))
      if (/BASE BENASSI/.test(loc) && lojas.length >= 1) baseLojaCombo++
      if (lojas.length >= 2) multiLoja++
    }
    let padrao = ''
    if (paradas.length === 1 && paradas[0].duracao_seg > 18 * 3600) padrao = 'SEM-RASTRE'
    else if (cnt.LOJA === 0 && cnt.BASE > 0) padrao = 'Só BASE'
    else if (cnt.LOJA === 0) padrao = 'Só FORA_BASE'
    else if (codsUnicos.size === 1) padrao = '1 cliente'
    else if (multiLoja > 0 && codsUnicos.size <= 3) padrao = `${codsUnicos.size} lojas sobrepostas`
    else if (codsUnicos.size >= 4) padrao = `Multi-loja (${codsUnicos.size})`
    else padrao = 'Mix'

    const escStr = escala.length === 0 ? '(sem escala)' : escala.map(e => `[${e.rede}]${e.loja.slice(0, 20)}`).join('|')
    out.push(`${String(i+1).padStart(3,'0')}. ${v.placa_norm} cls(B${cnt.BASE}/L${cnt.LOJA}/F${cnt.FORA_BASE}/X${cnt.FAKE_EXIT}) cods=[${[...codsUnicos].join(',')}] **${padrao}** — ${escStr}`)
  }
  return out.join('\n')
}

async function main() {
  const r20 = await processDia('20', 'docs/conversas-tia-erica/dia-20/unitrac/relatorio_9522.pdf')
  writeFileSync('docs/conversas-tia-erica/dia-20/ANALISE-TODAS-PLACAS.md', r20)
  console.log('OK dia 20')
  const r25 = await processDia('25', 'docs/conversas-tia-erica/dia-25/unitrac/relatorio_9652.pdf')
  writeFileSync('docs/conversas-tia-erica/dia-25/ANALISE-TODAS-PLACAS.md', r25)
  console.log('OK dia 25')
}
main().catch(e => { console.error(e); process.exit(1) })
