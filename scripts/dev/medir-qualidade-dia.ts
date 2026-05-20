// Mede qualidade do match pra QUALQUER dia. Aceita DATA via argv ou env.
// Uso: npx tsx --env-file=.env.local scripts/dev/medir-qualidade-dia.ts 2026-05-18

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

const DATA = process.argv[2] ?? process.env.DATA ?? '2026-05-19'
const DIA = DATA.slice(8, 10)
const DIRS = [
  `C:/Users/media/Downloads/dia ${DIA}`,
  `C:/Users/media/Downloads/dia ${Number(DIA)}`, // sem zero
]

function tokensNome(s: string): Set<string> {
  return new Set(s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/SENDAS|ASSA[IÍ]|PREZUNIC|CARREFOUR|SUPERPRIX|ATACAD[AÃ]O|VIANENSE|SAM'?S|EMANUEL|FEIRA|NOVA|PRINCESA|ARMAZEM|GR[AÃ]O|REGINA|MUNDIAL|GUANABARA|ZONA|SUL|LOJA|LJ\.?|REDE|MERCADO|SUPERMERCADO|PAX/g, ' ')
    .split(/[^A-Z0-9]+/).filter(t => t.length >= 3))
}

function nomeMatches(escalaNome: string, paradaNome: string | null): 'OK' | 'OK_PARCIAL' | 'DUVIDOSO' | 'ERRADO' {
  if (!paradaNome) return 'DUVIDOSO'
  const te = tokensNome(escalaNome), tp = tokensNome(paradaNome)
  if (te.size === 0 || tp.size === 0) return 'DUVIDOSO'
  let comuns = 0
  for (const t of te) if (tp.has(t)) comuns++
  if (comuns === 0) return 'ERRADO'
  if (comuns >= Math.min(te.size, tp.size)) return 'OK'
  return 'OK_PARCIAL'
}

async function findRoot(): Promise<string> {
  for (const d of DIRS) try { await readdir(d); return d } catch {}
  throw new Error(`pasta do dia ${DIA} não encontrada`)
}

async function main() {
  const ROOT = await findRoot()
  console.log(`\nDia ${DATA} (pasta: ${ROOT})\n`)
  const files = await readdir(ROOT)
  const escFiles = files.filter(f => /escala/i.test(f) && /\.(xlsx|pdf)$/i.test(f))
  const unitracFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  if (!unitracFile) throw new Error('unitrac xlsx não encontrado')

  let escalaLinhas: LinhaEscala[] = []
  const MIN = 3
  for (const file of escFiles) {
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
    escalaLinhas.push(...linhas)
  }
  const redesComPlaca = new Set(escalaLinhas.filter(l => l.placa_norm).map(l => l.rede_id))
  escalaLinhas = escalaLinhas.filter(l => l.placa_norm || !redesComPlaca.has(l.rede_id) || l.obs === 'SEM PEDIDO')

  const uBuf = await readFile(`${ROOT}/${unitracFile}`)
  const veiculos = await parseUnitrac(uBuf.buffer.slice(uBuf.byteOffset, uBuf.byteOffset + uBuf.byteLength) as ArrayBuffer)

  const escalaMap = new Map<string, LinhaEscala>()
  const escalaRows = escalaLinhas.map((l, i) => { const id = `esc-${i}`; escalaMap.set(id, l); return { id, rede_id: l.rede_id, placa_norm: l.placa_norm || null, loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega } })
  const paradaRows = veiculos.flatMap((v, vi) => v.paradas.map((p, pi) => ({ id: `par-${vi}-${pi}`, placa_norm: p.placa_norm, chegada: p.chegada.toISOString(), saida: p.saida.toISOString(), duracao_seg: p.duracao_seg, local_parada: p.local_parada, codigo_loja: p.codigo_loja, nome_loja: p.nome_loja, lat: p.lat, lng: p.lng, classificacao: p.classificacao, ordem: p.ordem })))

  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: lojasRaw } = await svc.from('lojas').select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros').eq('ativo', true)
  const lojas = (lojasRaw ?? []).map(l => ({ ...l, raio_metros: l.raio_metros ?? 150 }))
  const { data: canRaw } = await svc.from('canonical_loja').select('id, name, lat, lng, raio_metros').not('lat', 'is', null)
  const geoStores = (canRaw ?? []).map(c => ({ id: c.id as string, name: c.name as string, lat: c.lat as number, lng: c.lng as number, raio_metros: (c.raio_metros as number | null) ?? 150 }))

  const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas, svc, geoStores)

  const counts: Record<string, { OK: number; ERRADO: number; UNMATCHED: number; total: number }> = {}
  const erradosList: Array<{ rede: string; escala: string; parada: string }> = []
  for (const rota of rotas) {
    const esc = escalaRows.find(e => e.id === rota.escala_linha_id)
    if (!esc?.placa_norm) continue
    const rede = esc.rede_id
    if (!counts[rede]) counts[rede] = { OK: 0, ERRADO: 0, UNMATCHED: 0, total: 0 }
    counts[rede].total++
    if (rota.paradas.length === 0) { counts[rede].UNMATCHED++; continue }
    const alg = rota._matchMeta?.algorithm ?? ''
    if (alg === 'geo' || alg === 'trgm' || rota.paradas[0].loja_id) { counts[rede].OK++; continue }
    const q = nomeMatches(esc.loja_nome_raw, rota.paradas[0].nome)
    if (q === 'OK' || q === 'OK_PARCIAL') counts[rede].OK++
    else { counts[rede].ERRADO++; erradosList.push({ rede, escala: esc.loja_nome_raw, parada: rota.paradas[0].nome }) }
  }

  console.log(`Rede                | Total | OK    | Errado | Unmat | Qual%`)
  console.log('--------------------|-------|-------|--------|-------|------')
  let totG = 0, okG = 0
  for (const [r, c] of Object.entries(counts).sort((a, b) => b[1].total - a[1].total)) {
    const pct = c.total > 0 ? Math.round((c.OK / c.total) * 100) : 0
    console.log(`${r.padEnd(19)} | ${String(c.total).padStart(5)} | ${String(c.OK).padStart(5)} | ${String(c.ERRADO).padStart(6)} | ${String(c.UNMATCHED).padStart(5)} | ${String(pct).padStart(3)}%`)
    totG += c.total; okG += c.OK
  }
  console.log('--------------------|-------|-------|--------|-------|------')
  console.log(`TOTAL               | ${String(totG).padStart(5)} | ${String(okG).padStart(5)}  qual ${Math.round((okG / totG) * 100)}%`)
  if (erradosList.length > 0) {
    console.log(`\n${erradosList.length} ERRADOS:`)
    for (const e of erradosList.slice(0, 15)) console.log(`  [${e.rede}] ${e.escala} → ${e.parada}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
