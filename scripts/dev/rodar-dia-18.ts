// Pipeline pra dia 18/05 — mesma estrutura do rodar-dia-19 mas apontando
// pros arquivos do dia 18. Permite comparar a evolução dos fixes em
// múltiplos dias.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseEscalaGuanabaraPdf } from '@/lib/parsers/escala-guanabara-pdf'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'
import { detectaAnomalias } from '@/lib/kpi/anomalia'
import { gerarKpi, type LinhaParaKpi } from '@/lib/kpi/gerador-kpi'
import { REDE_NOMES_CANONICOS } from '@/lib/kpi/kpi-styles'
import type { LinhaEscala } from '@/lib/types/escala'
import type { RotaKpi } from '@/lib/types/kpi'

const DATA = '2026-05-18'
const ROOT = 'C:/Users/media/Downloads/dia 18'

const ESCALAS = [
  'ESCALA GERAL DE MAIO 1 (6).xlsx',
  'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (5).xlsx',
  'ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx',
  'ESCALA ZONA SUL - MAIO (6).xlsx',
  'ESCALA 18.04 (1).pdf',
]
const UNITRAC = 'relatorio_9402.xlsx'
const OUT_DIR = 'C:/Users/media/dev/kpi-transmonseg/out/dia-18'

async function main() {
  console.log(`\n━━━ Pipeline local — ${DATA} ━━━\n`)
  let escalaLinhas: LinhaEscala[] = []
  const MIN = 3
  for (const file of ESCALAS) {
    const buf = await readFile(`${ROOT}/${file}`)
    let linhas: LinhaEscala[] = []
    if (file.toLowerCase().endsWith('.pdf')) {
      try { linhas = await parseEscalaGuanabaraPdf(buf, DATA) } catch {}
    } else {
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
      for (const fn of [() => parseEscalaZonaSul(ab, DATA), () => parseEscalaArmazemGrao(ab, DATA), () => parseEscalaPax(ab, DATA), () => parseEscalaGeral(ab, DATA)]) {
        try { const r = await fn(); if (r.length >= MIN) { linhas = r; break } } catch {}
      }
    }
    console.log(`  [${file}] → ${linhas.length} linhas`)
    escalaLinhas.push(...linhas)
  }
  console.log(`→ Total brutas: ${escalaLinhas.length}`)
  const redesComPlaca = new Set(escalaLinhas.filter(l => l.placa_norm).map(l => l.rede_id))
  escalaLinhas = escalaLinhas.filter(l => l.placa_norm || !redesComPlaca.has(l.rede_id) || l.obs === 'SEM PEDIDO')
  console.log(`→ Após dedup: ${escalaLinhas.length}`)

  const unitracBuf = await readFile(`${ROOT}/${UNITRAC}`)
  const veiculos = await parseUnitrac(unitracBuf.buffer.slice(unitracBuf.byteOffset, unitracBuf.byteOffset + unitracBuf.byteLength) as ArrayBuffer)
  console.log(`→ Unitrac: ${veiculos.length} veículos\n`)

  const escalaMap = new Map<string, LinhaEscala>()
  const escalaRows = escalaLinhas.map((l, i) => { const id = `esc-${i}`; escalaMap.set(id, l); return { id, rede_id: l.rede_id, placa_norm: l.placa_norm || null, loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega } })
  const paradaRows = veiculos.flatMap((v, vi) => v.paradas.map((p, pi) => ({ id: `par-${vi}-${pi}`, placa_norm: p.placa_norm, chegada: p.chegada.toISOString(), saida: p.saida.toISOString(), duracao_seg: p.duracao_seg, local_parada: p.local_parada, codigo_loja: p.codigo_loja, nome_loja: p.nome_loja, lat: p.lat, lng: p.lng, classificacao: p.classificacao, ordem: p.ordem })))

  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const [lojasRes, canonicalRes] = await Promise.all([
    svc.from('lojas').select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros').eq('ativo', true),
    svc.from('canonical_loja').select('id, name, lat, lng, raio_metros').not('lat', 'is', null).not('lng', 'is', null),
  ])
  const lojas = (lojasRes.data ?? []).map(l => ({ id: l.id as string, rede_id: l.rede_id as string, nome: (l.nome as string) ?? '', nome_normalizado: (l.nome_normalizado as string) ?? '', codigo_escala: l.codigo_escala as string | null, codigo_unitrac: l.codigo_unitrac as string | null, nome_unitrac: l.nome_unitrac as string | null, lat: l.lat as number | null, lng: l.lng as number | null, raio_metros: (l.raio_metros as number | null) ?? 150 }))
  const geoStores = (canonicalRes.data ?? []).map(c => ({ id: c.id as string, name: c.name as string, lat: c.lat as number, lng: c.lng as number, raio_metros: (c.raio_metros as number | null) ?? 150 }))

  const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas, svc, geoStores)

  // Reporta por rede
  const porRede = new Map<string, { total: number; matched: number; high: number; low: number; unmatched: number }>()
  for (const rota of rotas) {
    if (!rota.placa_norm) continue
    const cur = porRede.get(rota.rede_id) ?? { total: 0, matched: 0, high: 0, low: 0, unmatched: 0 }
    cur.total++
    const conf = rota._matchMeta?.confidence ?? 'UNMATCHED'
    if (conf === 'HIGH') { cur.matched++; cur.high++ }
    else if (conf === 'LOW') { cur.matched++; cur.low++ }
    else cur.unmatched++
    porRede.set(rota.rede_id, cur)
  }
  const sorted = [...porRede.entries()].sort((a, b) => b[1].total - a[1].total)
  let totG = 0, matG = 0
  console.log('Rede                | Total | Match | %    | H    L    ?')
  console.log('--------------------|-------|-------|------|------------')
  for (const [r, s] of sorted) {
    const pct = s.total > 0 ? Math.round((s.matched / s.total) * 100) : 0
    console.log(`${(REDE_NOMES_CANONICOS[r] ?? r).padEnd(19)} | ${String(s.total).padStart(5)} | ${String(s.matched).padStart(5)} | ${String(pct).padStart(3)}% | ${String(s.high).padStart(3)}  ${String(s.low).padStart(3)}  ${String(s.unmatched).padStart(3)}`)
    totG += s.total; matG += s.matched
  }
  console.log('--------------------|-------|-------|------|------------')
  console.log(`TOTAL               | ${String(totG).padStart(5)} | ${String(matG).padStart(5)} | ${String(Math.round((matG / totG) * 100)).padStart(3)}% |`)
}

main().catch(e => { console.error(e); process.exit(1) })
