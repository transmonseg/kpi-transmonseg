// Identifica lojas que aparecem como parada LOJA no Unitrac do dia 19
// mas não estão cadastradas na tabela `lojas`.
//
// Estratégia:
//   1. Carrega todas as paradas LOJA do Unitrac (têm nome_loja + lat + lng)
//   2. Agrega por (nome_loja, lat aproximado) — múltiplas paradas no mesmo
//      lugar viram 1 candidato
//   3. Pra cada candidato, tenta resolveLojaId em todas as redes
//   4. Lista os que NÃO casaram → candidatos a cadastro novo
//   5. Tenta inferir rede pelo PREFIXO do nome (ASSAI, PREZUNIC, etc)

import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { levenshtein, normalizaNome } from '@/lib/utils/texto'

const UNITRAC = 'C:/Users/media/Downloads/dia 19/relatorio_9521.xlsx'

// Mapeia prefixos do nome no Unitrac pra rede_id
const PREFIXOS: Array<[RegExp, string]> = [
  [/(?:^|\s|-)ASSA[IÍ](?:\s|-|$)/i, 'ASSAI'],
  [/(?:^|\s|-)PREZUNIC(?:\s|-|$)/i, 'PREZUNIC'],
  [/(?:^|\s|-)CARREFOUR(?:\s|-|$)/i, 'CARREFOUR'],
  [/(?:^|\s|-)SUPERPRIX(?:\s|-|$)/i, 'SUPERPRIX'],
  [/(?:^|\s|-)SAM'?S?\s*CLUB(?:\s|-|$)/i, 'SAMS_CLUB'],
  [/(?:^|\s|-)ATACAD[ÃA]O(?:\s|-|$)/i, 'ATACADAO'],
  [/(?:^|\s|-)SENDAS(?:\s|-|$)/i, 'SENDAS'],
  [/(?:^|\s|-)MUNDIAL(?:\s|-|$)/i, 'MUNDIAL'],
  [/(?:^|\s|-)VIANENSE(?:\s|-|$)/i, 'VIANENSE'],
  [/(?:^|\s|-)CAB[\s_-]/i, 'CAB_PETROPOLIS'],
  [/(?:^|\s|-)PRINCESA(?:\s|-|$)/i, 'PRINCESA'],
  [/(?:^|\s|-)(?:ARMAZ[EÉ]M\s+DO\s+GR[AÃ]O|ABASTECEDORA|REGINA)/i, 'ARMAZEM_GRAO'],
  [/(?:^|\s|-)EMANUEL(?:\s|-|$)/i, 'EMANUEL'],
  [/(?:^|\s|-)FEIRA\s*NOVA(?:\s|-|$)/i, 'FEIRA_NOVA'],
  [/(?:^|\s|-)(?:SUPER\s*PAX|PAX)(?:\s|-|$)/i, 'SUPER_PAX'],
  [/(?:^|\s|-)(?:GUANABARA|GB)(?:\s|-|$)/i, 'GUANABARA'],
  [/(?:^|\s|-)ZONA\s*SUL(?:\s|-|$)/i, 'ZONA_SUL'],
]

const NOMES_GENERICOS = /^ROTA\s|^FORA\s+DE\s+BASE|^BASE\s+BENASSI/i

function inferirRede(nome: string): string | null {
  if (NOMES_GENERICOS.test(nome)) return null
  for (const [re, rede] of PREFIXOS) if (re.test(nome)) return rede
  return null
}

async function main() {
  console.log('Lendo Unitrac...')
  const buf = await readFile(UNITRAC)
  const veiculos = await parseUnitrac(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
  const paradas = veiculos.flatMap(v => v.paradas.filter(p => p.classificacao === 'LOJA'))
  console.log(`  ${paradas.length} paradas LOJA totais`)

  // Agrega por nome+latRound
  type Candidato = {
    nome: string
    rede: string | null
    lat: number
    lng: number
    codigo_unitrac: string | null
    n_paradas: number
  }
  const map = new Map<string, Candidato>()
  for (const p of paradas) {
    const nome = (p.nome_loja ?? '').trim()
    if (!nome || p.lat === null || p.lng === null) continue
    const latR = Math.round(p.lat * 1000) / 1000
    const lngR = Math.round(p.lng * 1000) / 1000
    const key = `${nome}|${latR}|${lngR}`
    const ex = map.get(key)
    if (ex) {
      ex.n_paradas++
    } else {
      map.set(key, {
        nome,
        rede: inferirRede(nome),
        lat: p.lat,
        lng: p.lng,
        codigo_unitrac: p.codigo_loja ?? null,
        n_paradas: 1,
      })
    }
  }
  const candidatos = [...map.values()]
  console.log(`  ${candidatos.length} lojas únicas (nome + coords)`)

  // Carrega lojas cadastradas
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data: lojasRaw } = await svc.from('lojas').select('id, nome, nome_normalizado, codigo_unitrac, nome_unitrac, rede_id, lat, lng').eq('ativo', true)
  const lojas = (lojasRaw ?? []) as Array<{ id: string; nome: string; nome_normalizado: string; codigo_unitrac: string | null; nome_unitrac: string | null; rede_id: string; lat: number | null; lng: number | null }>
  console.log(`  ${lojas.length} lojas cadastradas no Supabase`)

  // Tenta achar cada candidato no catálogo
  function jaCadastrada(c: Candidato): { id: string; rede: string } | null {
    if (c.codigo_unitrac) {
      const m = lojas.find(l => l.codigo_unitrac === c.codigo_unitrac)
      if (m) return { id: m.id, rede: m.rede_id }
    }
    const normC = normalizaNome(c.nome)
    const m = lojas.find(l => l.nome_unitrac?.trim() === c.nome.trim() || levenshtein(normC, l.nome_normalizado) <= 2)
    if (m) return { id: m.id, rede: m.rede_id }
    return null
  }

  const naoCadastradas: Candidato[] = []
  const semRede: Candidato[] = []
  const vistos = new Set<string>()
  for (const c of candidatos) {
    const found = jaCadastrada(c)
    if (found) continue
    if (!c.rede) {
      semRede.push(c)
      continue
    }
    // Dedup por (rede + codigo_unitrac OR nome)
    const dedupKey = c.codigo_unitrac
      ? `${c.rede}|${c.codigo_unitrac}`
      : `${c.rede}|${normalizaNome(c.nome)}`
    if (vistos.has(dedupKey)) continue
    vistos.add(dedupKey)
    naoCadastradas.push(c)
  }

  console.log(`\n  ${naoCadastradas.length} candidatos com rede inferida — prontos pra cadastrar`)
  console.log(`  ${semRede.length} sem rede inferível — manuais`)

  console.log('\n━━━ PRONTOS PRA CADASTRAR ━━━')
  for (const c of naoCadastradas.sort((a, b) => (a.rede ?? '').localeCompare(b.rede ?? ''))) {
    console.log(`  [${c.rede}] ${c.nome.padEnd(48)} ${c.codigo_unitrac ?? '—'.padStart(7)} (${c.lat.toFixed(5)}, ${c.lng.toFixed(5)})`)
  }

  console.log('\n━━━ SEM REDE (revisar manualmente) ━━━')
  for (const c of semRede.slice(0, 40)) {
    console.log(`  ${c.nome.padEnd(50)} (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)})`)
  }
  if (semRede.length > 40) console.log(`  ... +${semRede.length - 40}`)

  // Lojas cadastradas SEM lat/lng — pode preencher se encontrarmos parada com nome similar
  const semGeo = lojas.filter(l => l.lat === null || l.lng === null)
  console.log(`\n━━━ LOJAS CADASTRADAS SEM GEO (${semGeo.length}) ━━━`)
  const updates: Array<{ id: string; nome: string; lat: number; lng: number; via: string }> = []
  for (const l of semGeo) {
    const normL = normalizaNome(l.nome)
    const match = candidatos.find(c => {
      const normC = normalizaNome(c.nome)
      return normC === normL || levenshtein(normC, normL) <= 3
    })
    if (match) {
      updates.push({ id: l.id, nome: l.nome, lat: match.lat, lng: match.lng, via: match.nome })
    }
  }
  for (const u of updates) console.log(`  [${u.id.slice(0, 8)}] ${u.nome.padEnd(45)} ← (${u.lat.toFixed(5)}, ${u.lng.toFixed(5)}) via "${u.via}"`)

  // Salva pra próxima fase
  const { writeFile } = await import('node:fs/promises')
  await writeFile(
    'C:/Users/media/dev/kpi-transmonseg/out/lojas-cadastrar.json',
    JSON.stringify({ naoCadastradas, semRede, updates }, null, 2),
  )
  console.log('\n→ Salvo em out/lojas-cadastrar.json')
}

main().catch(e => { console.error(e); process.exit(1) })
