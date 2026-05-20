// Pra cada linha UNMATCHED do dia, categoriza por causa:
//   A) Placa não existe no Unitrac (terceirizado)
//   B) Placa no Unitrac mas sem parada LOJA (todas FORA_BASE)
//   C) Placa fez paradas LOJA mas só de OUTRAS redes (cross-docking)
//   D) Placa fez paradas LOJA da própria rede mas score ficou Infinity
//   E) Tem paradas LOJA mas matcher rejeitou todas (debug needed)

import { readFile, readdir } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseEscalaGuanabaraPdf } from '@/lib/parsers/escala-guanabara-pdf'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'
import type { LinhaEscala } from '@/lib/types/escala'

const DATA = process.argv[2] ?? '2026-05-19'
const DIA = DATA.slice(8, 10)
const REDE_FILTER = process.argv[3]  // opcional: rede específica

async function main() {
  const ROOT = `C:/Users/media/Downloads/dia ${DIA}`
  const files = await readdir(ROOT)
  const escFiles = files.filter(f => /escala/i.test(f) && /\.(xlsx|pdf)$/i.test(f))
  const unitracFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))!

  let escalaLinhas: LinhaEscala[] = []
  for (const file of escFiles) {
    const buf = await readFile(`${ROOT}/${file}`)
    let linhas: LinhaEscala[] = []
    if (file.toLowerCase().endsWith('.pdf')) {
      try { linhas = await parseEscalaGuanabaraPdf(buf, DATA) } catch {}
    } else {
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
      for (const fn of [() => parseEscalaZonaSul(ab, DATA), () => parseEscalaArmazemGrao(ab, DATA), () => parseEscalaPax(ab, DATA), () => parseEscalaGeral(ab, DATA)]) {
        try { const r = await fn(); if (r.length >= 3) { linhas = r; break } } catch {}
      }
    }
    escalaLinhas.push(...linhas)
  }
  const redesComPlaca = new Set(escalaLinhas.filter(l => l.placa_norm).map(l => l.rede_id))
  escalaLinhas = escalaLinhas.filter(l => l.placa_norm || !redesComPlaca.has(l.rede_id) || l.obs === 'SEM PEDIDO')

  const uBuf = await readFile(`${ROOT}/${unitracFile}`)
  const veiculos = await parseUnitrac(uBuf.buffer.slice(uBuf.byteOffset, uBuf.byteOffset + uBuf.byteLength) as ArrayBuffer)
  const porPlaca = new Map(veiculos.map(v => [v.placa_norm, v]))

  const escalaRows = escalaLinhas.map((l, i) => ({ id: `esc-${i}`, rede_id: l.rede_id, placa_norm: l.placa_norm || null, loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega }))
  const paradaRows = veiculos.flatMap((v, vi) => v.paradas.map((p, pi) => ({ id: `par-${vi}-${pi}`, placa_norm: p.placa_norm, chegada: p.chegada.toISOString(), saida: p.saida.toISOString(), duracao_seg: p.duracao_seg, local_parada: p.local_parada, codigo_loja: p.codigo_loja, nome_loja: p.nome_loja, lat: p.lat, lng: p.lng, classificacao: p.classificacao, ordem: p.ordem })))

  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: lojasRaw } = await svc.from('lojas').select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros').eq('ativo', true)
  const lojas = (lojasRaw ?? []).map(l => ({ ...l, raio_metros: l.raio_metros ?? 150 }))
  const { data: canRaw } = await svc.from('canonical_loja').select('id, name, lat, lng, raio_metros').not('lat', 'is', null)
  const geoStores = (canRaw ?? []).map(c => ({ id: c.id as string, name: c.name as string, lat: c.lat as number, lng: c.lng as number, raio_metros: (c.raio_metros as number | null) ?? 150 }))

  const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas, svc, geoStores)
  const lojasPorRede = new Map<string, typeof lojas>()
  for (const l of lojas) { const x = lojasPorRede.get(l.rede_id) ?? []; x.push(l); lojasPorRede.set(l.rede_id, x) }

  const cats: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 }
  const exemplos: Record<string, string[]> = { A: [], B: [], C: [], D: [], E: [] }

  for (const rota of rotas) {
    if (rota.paradas.length > 0) continue  // matched
    const esc = escalaRows.find(e => e.id === rota.escala_linha_id)
    if (!esc?.placa_norm) continue
    if (REDE_FILTER && esc.rede_id !== REDE_FILTER) continue

    const v = porPlaca.get(esc.placa_norm)
    const label = `[${esc.rede_id}] ${esc.placa_norm} ${esc.loja_nome_raw}`

    if (!v) { cats.A++; if (exemplos.A.length < 5) exemplos.A.push(label); continue }
    const paradasLoja = v.paradas.filter(p => p.classificacao === 'LOJA')
    const paradasForaLongas = v.paradas.filter(p => p.classificacao === 'FORA_BASE' && (p.duracao_seg ?? 0) > 900)
    if (paradasLoja.length === 0) {
      cats.B++
      if (exemplos.B.length < 5) exemplos.B.push(`${label}  (${paradasForaLongas.length} FORA_BASE longas)`)
      continue
    }
    // Lojas da rede da escala
    const lojasDaRede = lojasPorRede.get(esc.rede_id) ?? []
    const paradasNaRede = paradasLoja.filter(p =>
      (p.codigo_loja && lojasDaRede.some(l => l.codigo_unitrac === p.codigo_loja)) ||
      (p.nome_loja && lojasDaRede.some(l => l.nome_unitrac?.trim() === p.nome_loja!.trim()))
    )
    if (paradasNaRede.length === 0) {
      cats.C++
      const sample = paradasLoja.slice(0, 2).map(p => p.nome_loja ?? p.local_parada).join(' | ')
      if (exemplos.C.length < 5) exemplos.C.push(`${label}  → cross: ${sample}`)
      continue
    }
    cats.D++
    if (exemplos.D.length < 5) exemplos.D.push(`${label}  (${paradasNaRede.length} parada(s) certa(s), matcher rejeitou)`)
  }

  console.log(`\nUNMATCHED dia ${DATA}${REDE_FILTER ? ` rede ${REDE_FILTER}` : ''}:`)
  console.log(`  A) Placa não no Unitrac:                ${cats.A}`)
  console.log(`  B) Sem parada LOJA (todas FORA_BASE):   ${cats.B}`)
  console.log(`  C) Paradas LOJA só de outras redes:     ${cats.C}`)
  console.log(`  D) Tem parada certa mas matcher pulou:  ${cats.D}`)
  for (const [c, ex] of Object.entries(exemplos)) {
    if (ex.length === 0) continue
    console.log(`\n  Exemplos categoria ${c}:`)
    for (const e of ex) console.log(`    ${e}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
