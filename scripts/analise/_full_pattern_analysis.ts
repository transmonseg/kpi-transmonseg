import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync, writeFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { createClient } from '@supabase/supabase-js'

const PDFS = [
  ['19', 'docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'],
  ['20', 'docs/conversas-tia-erica/dia-20/unitrac/relatorio_9522.pdf'],
  ['25', 'docs/conversas-tia-erica/dia-25/unitrac/relatorio_9652.pdf'],
]

async function main() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  // Cache escalas por dia/placa
  const escalaCache = new Map<string, Array<{ rede_id: string; loja: string }>>()
  for (const [dia] of PDFS) {
    const data = `2026-05-${dia}`
    const { data: rows } = await svc.from('escala_linhas')
      .select('placa_norm, rede_id, loja_nome_raw')
      .eq('data_entrega', data)
      .not('placa_norm', 'is', null)
    for (const r of rows ?? []) {
      const k = `${dia}|${r.placa_norm}`
      const arr = escalaCache.get(k) ?? []
      arr.push({ rede_id: r.rede_id as string, loja: r.loja_nome_raw as string })
      escalaCache.set(k, arr)
    }
  }
  // Cache lojas com cod_unitrac
  const { data: lojas } = await svc.from('lojas').select('rede_id, nome, codigo_unitrac')
  const codToRede = new Map<string, { rede: string; nome: string }>()
  for (const l of lojas ?? []) {
    if (l.codigo_unitrac) codToRede.set(l.codigo_unitrac as string, { rede: l.rede_id as string, nome: l.nome as string })
  }

  // Para cada placa, identifica padrões e classifica
  type Padrao = {
    dia: string; placa: string; ts: string; dur: number
    has_base: boolean
    has_rota: string[]
    lojas_cod: { cod: string; nome: string }[]
    escala: { rede_id: string; loja: string }[]
  }
  const padroes: Padrao[] = []

  for (const [dia, pdf] of PDFS) {
    const veiculos = await parseUnitracPdf(readFileSync(pdf), null)
    for (const v of veiculos) {
      const escala = escalaCache.get(`${dia}|${v.placa_norm}`) ?? []
      for (const p of v.paradas) {
        const loc = (p.local_parada ?? '').replace(/\s+/g, ' ').trim()
        const has_base = /BASE BENASSI/.test(loc)
        const codigos = [...loc.matchAll(/(\d{4,8})\s*-\s*([A-Z][^,]{2,40})/g)]
        const rotas = codigos.filter(m => /ROTA/i.test(m[2])).map(m => m[2].trim())
        const lojas_cod = codigos.filter(m => !/ROTA/i.test(m[2]) && !/BASE/i.test(m[2]))
          .map(m => ({ cod: m[1], nome: m[2].trim() }))
        const interesse = has_base || rotas.length > 0 || lojas_cod.length >= 2
        if (!interesse) continue
        padroes.push({
          dia, placa: v.placa_norm,
          ts: `${p.chegada.toISOString().slice(11,16)}-${p.saida.toISOString().slice(11,16)}`,
          dur: Math.round(p.duracao_seg/60),
          has_base, has_rota: rotas, lojas_cod, escala,
        })
      }
    }
  }

  // Agrupa por placa+dia
  const porPlaca = new Map<string, Padrao[]>()
  for (const x of padroes) {
    const k = `${x.dia}|${x.placa}`
    const arr = porPlaca.get(k) ?? []
    arr.push(x)
    porPlaca.set(k, arr)
  }

  // Pra cada placa, classifica:
  // A) BASE+LOJA + a loja ESTÁ na escala da placa → entrega real (cliente cobre base)
  // B) BASE+LOJA + a loja NÃO está na escala → ruído cadastral
  // C) 2+ lojas sobrepostas + AMBAS na escala → multi-rede legítimo
  // D) 2+ lojas sobrepostas + 0 ou 1 na escala → ruído ou multi-cliente parcial

  const out: string[] = ['# Análise completa de padrões — dias 19/20/25\n']
  const stats = { A: 0, B: 0, C: 0, D: 0, rota_so: 0 }
  const exemplos: Record<string, string[]> = { A: [], B: [], C: [], D: [], rota_so: [] }

  for (const [chave, arr] of porPlaca) {
    const [dia, placa] = chave.split('|')
    const escala = arr[0].escala
    const lojasEscaladas = new Set(escala.map(e => e.rede_id))
    let multiRedeEscalada = false
    if (escala.length > 1) {
      const redes = new Set(escala.map(e => e.rede_id))
      if (redes.size > 1) multiRedeEscalada = true
    }

    for (const p of arr) {
      // Identifica rede de cada cod
      const redesParada = new Set<string>()
      const codInfos = p.lojas_cod.map(l => {
        const info = codToRede.get(l.cod)
        if (info) redesParada.add(info.rede)
        return { ...l, rede: info?.rede ?? null }
      })

      const escaladasNaParada = codInfos.filter(c => c.rede && lojasEscaladas.has(c.rede))

      let categoria = ''
      if (p.has_rota.length > 0 && p.lojas_cod.length === 0 && !p.has_base) {
        categoria = 'rota_so'
      } else if (p.has_base && p.lojas_cod.length >= 1) {
        // A: a loja é escalada / B: não é
        if (escaladasNaParada.length > 0) categoria = 'A'
        else categoria = 'B'
      } else if (p.lojas_cod.length >= 2) {
        if (escaladasNaParada.length >= 2) categoria = 'C'
        else categoria = 'D'
      }
      if (!categoria) continue
      stats[categoria as keyof typeof stats]++
      if (exemplos[categoria].length < 30) {
        const lojasStr = codInfos.map(c => `${c.cod}=${c.nome.slice(0,25)}[${c.rede ?? '?'}]`).join(' / ')
        const escStr = escala.map(e => `${e.rede_id}:${e.loja.slice(0, 25)}`).join(' | ')
        exemplos[categoria].push(`d${dia} ${placa} ${p.ts} dur=${p.dur} BASE=${p.has_base} ROTA=[${p.has_rota.join(',')}] LOJAS={${lojasStr}}\n    ESCALA=${escStr || '(sem escala)'}`)
      }
    }
  }

  out.push(`\n## ESTATÍSTICAS\n`)
  out.push(`- A (BASE+LOJA escalada — possível entrega real OR cliente cobre base): **${stats.A}**`)
  out.push(`- B (BASE+LOJA não-escalada — RUÍDO de cadastro Unitrac): **${stats.B}**`)
  out.push(`- C (2+ LOJAs, AMBAS escaladas — multi-rede LEGÍTIMO): **${stats.C}**`)
  out.push(`- D (2+ LOJAs, ≤1 escalada — ruído/sobreposição): **${stats.D}**`)
  out.push(`- rota_só (sem LOJA/BASE — placas de outro contrato): **${stats.rota_so}**`)

  for (const cat of ['A', 'B', 'C', 'D', 'rota_so']) {
    out.push(`\n## Categoria ${cat} — exemplos\n`)
    for (const ex of exemplos[cat]) out.push(`- ${ex}`)
  }

  writeFileSync('scripts/analise/_padroes_classificados.md', out.join('\n'))
  console.log(`OK scripts/analise/_padroes_classificados.md`)
  console.log(JSON.stringify(stats, null, 2))
}
main().catch(e => { console.error(e); process.exit(1) })
