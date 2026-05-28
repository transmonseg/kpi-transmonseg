import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync, writeFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { createClient } from '@supabase/supabase-js'

async function main() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const veiculos = await parseUnitracPdf(readFileSync('docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'), null)

  // Cache escala dia 19
  const { data: esc } = await svc.from('escala_linhas')
    .select('placa_norm, rede_id, loja_nome_raw, motorista_nome')
    .eq('data_entrega', '2026-05-19')
    .not('placa_norm', 'is', null)
  const escalaMap = new Map<string, Array<{ rede: string; loja: string; mot: string }>>()
  for (const r of esc ?? []) {
    const arr = escalaMap.get(r.placa_norm as string) ?? []
    arr.push({ rede: r.rede_id as string, loja: r.loja_nome_raw as string, mot: r.motorista_nome as string })
    escalaMap.set(r.placa_norm as string, arr)
  }

  const out: string[] = [`# Análise placa por placa — Unitrac dia 19 (${veiculos.length} veículos)\n`]

  for (let i = 0; i < veiculos.length; i++) {
    const v = veiculos[i]
    const escala = escalaMap.get(v.placa_norm) ?? []
    const paradas = v.paradas
    const cnt = { BASE: 0, LOJA: 0, FORA_BASE: 0, FAKE_EXIT: 0 }
    const codsUnicos = new Set<string>()
    let paradasForaBase = 0  // GPS fora da faixa Av Brasil
    let paradasNaBase = 0
    let temROTA = false
    let baseLojaCombo = 0    // BASE + LOJA sobreposto
    let multiLoja = 0        // 2+ LOJAs no mesmo local_parada
    for (const p of paradas) {
      cnt[p.classificacao as keyof typeof cnt] = (cnt[p.classificacao as keyof typeof cnt] ?? 0) + 1
      if (p.codigo_loja) codsUnicos.add(p.codigo_loja)
      if (p.lat != null && p.lng != null) {
        const naBase = p.lat >= -22.84 && p.lat <= -22.81 && p.lng >= -43.35 && p.lng <= -43.32
        if (naBase) paradasNaBase++
        else paradasForaBase++
      }
      const loc = p.local_parada ?? ''
      if (/ROTA /.test(loc)) temROTA = true
      const lojas = [...loc.matchAll(/(\d{4,8})\s*-\s*([A-Z][^,]{2,40})/g)].filter(m => !/ROTA|BASE/i.test(m[2]))
      if (/BASE BENASSI/.test(loc) && lojas.length >= 1) baseLojaCombo++
      if (lojas.length >= 2) multiLoja++
    }
    const codStr = [...codsUnicos].slice(0, 6).join(',')
    const escStr = escala.length === 0 ? '(sem escala)' : escala.map(e => `[${e.rede}] ${e.loja.slice(0, 30)}`).join('; ')

    // Classificação automática
    let padrao = ''
    if (paradas.length === 1 && paradas[0].duracao_seg > 18 * 3600) padrao = 'SEM-RASTRE (1 parada o dia)'
    else if (cnt.LOJA === 0 && cnt.BASE > 0) padrao = 'Só BASE (não saiu)'
    else if (cnt.LOJA === 0 && cnt.BASE === 0) padrao = 'Só FORA_BASE/ROTA (sem cliente identificado)'
    else if (codsUnicos.size === 1 && cnt.LOJA <= 4) padrao = '1 cliente único'
    else if (codsUnicos.size === 1 && cnt.LOJA >= 5) padrao = '1 cliente fixo (ficou lá o dia)'
    else if (multiLoja > 0 && codsUnicos.size <= 3) padrao = `2-3 lojas sobrepostas (${codsUnicos.size} cods)`
    else if (codsUnicos.size >= 4) padrao = `Multi-loja (${codsUnicos.size} cods)`
    else padrao = 'Outro'

    out.push(`\n## ${String(i+1).padStart(3,'0')}. ${v.placa_norm}`)
    out.push(`- Paradas: ${paradas.length} (BASE=${cnt.BASE} LOJA=${cnt.LOJA} FORA_BASE=${cnt.FORA_BASE} FAKE_EXIT=${cnt.FAKE_EXIT})`)
    out.push(`- GPS: ${paradasNaBase} na BASE, ${paradasForaBase} fora`)
    out.push(`- Cods loja únicos (${codsUnicos.size}): ${codStr}${codsUnicos.size > 6 ? ' ...' : ''}`)
    out.push(`- BASE+LOJA sobreposto: ${baseLojaCombo}, Multi-LOJA: ${multiLoja}, ROTA: ${temROTA ? 'sim' : 'não'}`)
    out.push(`- Escala: ${escStr}`)
    out.push(`- **Padrão**: ${padrao}`)
  }

  writeFileSync('docs/conversas-tia-erica/dia-19/ANALISE-TODAS-PLACAS.md', out.join('\n'))
  console.log(`OK ${veiculos.length} placas → docs/conversas-tia-erica/dia-19/ANALISE-TODAS-PLACAS.md`)
}
main().catch(e => { console.error(e); process.exit(1) })
