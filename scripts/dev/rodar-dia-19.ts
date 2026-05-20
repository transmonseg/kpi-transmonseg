// Roda o pipeline completo do KPI Simples localmente pra os arquivos do dia 19.
// Replica a lógica de /api/kpi/simples sem precisar de upload para Storage.
//
// Uso: npx tsx --env-file=.env.local scripts/dev/rodar-dia-19.ts

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseEscalaGuanabaraPdf } from '@/lib/parsers/escala-guanabara-pdf'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'
import { detectaAnomalias } from '@/lib/kpi/anomalia'
import { gerarKpi, type LinhaParaKpi } from '@/lib/kpi/gerador-kpi'
import { REDE_NOMES_CANONICOS } from '@/lib/kpi/kpi-styles'
import type { LinhaEscala } from '@/lib/types/escala'
import type { KpiLinha, RotaKpi } from '@/lib/types/kpi'

const DATA = '2026-05-19'
const ROOT = 'C:/Users/media/Downloads/dia 19'

const ESCALAS = [
  'ESCALA GERAL DE MAIO 1 (6).xlsx',
  'ESCALA - PAX , FEIRA NOVA , EMANUEL.xlsx',
  'ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx',
  'ESCALA ZONA SUL - MAIO (6).xlsx',
  'ESCALA 19.05.pdf',
]
const UNITRAC = 'relatorio_9521.xlsx'  // XLSX dá melhor match rate que o PDF
const APLICAR_ALTERACOES = false  // pra rodar igual ao "KPI TESTE" sem alterações
const SAVE_XLSX = true
const OUT_DIR = 'C:/Users/media/dev/kpi-transmonseg/out/dia-19'

// Alterações coladas do WhatsApp (textos do user em 20/05)
const ALTERACOES = [
  // Assai Camil: Sai Luiz Ferreira → Entra Messias
  {
    tipo: 'SUBSTITUICAO' as const,
    sai: { motorista_nome: 'LUIZ FERREIRA', placa_norm: 'LAU1I64' },
    entra: { motorista_nome: 'MESSIAS', motorista_codigo: 141, placa_raw: 'AMW3424', placa_norm: 'AMW3424' },
  },
  // Assai Alcântara 1: Sai Simão → Entra Paulo Henrique
  {
    tipo: 'SUBSTITUICAO' as const,
    sai: { motorista_nome: 'SIMÃO', placa_norm: 'LSN6I72' },
    entra: { motorista_nome: 'PAULO HENRIQUE', motorista_codigo: 807, placa_raw: 'DBB8D19', placa_norm: 'DBB8D19' },
  },
  // Assai Barra 1: Troca de carro (motorista permanece)
  {
    tipo: 'SUBSTITUICAO' as const,
    sai: { motorista_nome: null, placa_norm: 'UGA1D55' },
    entra: { motorista_nome: null, motorista_codigo: null, placa_raw: 'UBO5E05', placa_norm: 'UBO5E05' },
  },
  // Carrefour Campo Grande: Sai John → Entra Simão
  {
    tipo: 'SUBSTITUICAO' as const,
    sai: { motorista_nome: 'JOHN', placa_norm: 'KVI9088' },
    entra: { motorista_nome: 'SIMÃO', motorista_codigo: 184846, placa_raw: 'LSN6I72', placa_norm: 'LSN6I72' },
  },
  // Assai Niterói Ponte: Sai Messias → Entra Luiz Ferreira
  {
    tipo: 'SUBSTITUICAO' as const,
    sai: { motorista_nome: 'MESSIAS', placa_norm: 'AMW3424' },
    entra: { motorista_nome: 'LUIZ FERREIRA', motorista_codigo: 789, placa_raw: 'LAU1I64', placa_norm: 'LAU1I64' },
  },
]

function aplicaAlteracoes(linhas: LinhaEscala[]): LinhaEscala[] {
  for (const alt of ALTERACOES) {
    if (!alt.entra) continue
    const idx = linhas.findIndex(l => {
      if (alt.sai?.placa_norm && l.placa_norm === alt.sai.placa_norm) return true
      if (alt.sai?.motorista_nome) {
        const needle = alt.sai.motorista_nome.toLowerCase().split(' ')[0]
        if (needle.length >= 3 && l.motorista_nome?.toLowerCase().includes(needle)) return true
      }
      return false
    })
    if (idx >= 0) {
      const l = { ...linhas[idx] }
      if (alt.entra.placa_norm) l.placa_norm = alt.entra.placa_norm
      if (alt.entra.placa_raw) l.placa_raw = alt.entra.placa_raw
      if (alt.entra.motorista_nome) l.motorista_nome = alt.entra.motorista_nome
      if (alt.entra.motorista_codigo != null)
        l.motorista_codigo = String(alt.entra.motorista_codigo)
      linhas[idx] = l
    }
  }
  return linhas
}

async function main() {
  console.log(`\n━━━ Pipeline local — ${DATA} ━━━\n`)

  // 1. Parseia escalas (replica a lógica detector do simples)
  let escalaLinhas: LinhaEscala[] = []
  const MIN = 3

  for (const file of ESCALAS) {
    const buf = await readFile(`${ROOT}/${file}`)
    let linhas: LinhaEscala[] = []

    if (file.toLowerCase().endsWith('.pdf')) {
      try {
        linhas = await parseEscalaGuanabaraPdf(buf, DATA)
      } catch (e) {
        console.log(`  [${file}] PDF parser falhou: ${(e as Error).message}`)
      }
    } else {
      const tentativas: Array<{ nome: string; fn: () => Promise<LinhaEscala[]> }> = [
        { nome: 'zona-sul', fn: () => parseEscalaZonaSul(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, DATA) },
        { nome: 'armazem-grao', fn: () => parseEscalaArmazemGrao(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, DATA) },
        { nome: 'pax', fn: () => parseEscalaPax(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, DATA) },
        { nome: 'geral', fn: () => parseEscalaGeral(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, DATA) },
      ]
      for (const t of tentativas) {
        try {
          const r = await t.fn()
          if (r.length >= MIN) {
            linhas = r
            console.log(`  [${file}] parser ${t.nome} → ${r.length} linhas`)
            break
          }
        } catch { /* próximo */ }
      }
    }

    if (linhas.length === 0) {
      console.log(`  [${file}] ZERO linhas parseadas`)
    } else if (file.toLowerCase().endsWith('.pdf')) {
      console.log(`  [${file}] parser guanabara-pdf → ${linhas.length} linhas`)
    }
    escalaLinhas.push(...linhas)
  }

  console.log(`\n→ Total escala_linhas brutas: ${escalaLinhas.length}`)

  // 2. Dedup multi-escala
  const redesComPlaca = new Set(escalaLinhas.filter(l => l.placa_norm).map(l => l.rede_id))
  escalaLinhas = escalaLinhas.filter(l =>
    l.placa_norm ||
    !redesComPlaca.has(l.rede_id) ||
    l.obs === 'SEM PEDIDO',
  )
  console.log(`→ Após dedup: ${escalaLinhas.length}`)

  // 3. Alterações
  if (APLICAR_ALTERACOES) {
    escalaLinhas = aplicaAlteracoes([...escalaLinhas])
    console.log(`→ Aplicadas ${ALTERACOES.length} alterações`)
  } else {
    console.log(`→ Alterações DESLIGADAS (modo igual ao 'KPI TESTE')`)
  }

  // 4. Unitrac
  const unitracBuf = await readFile(`${ROOT}/${UNITRAC}`)
  const veiculos = UNITRAC.endsWith('.pdf')
    ? await parseUnitracPdf(unitracBuf)
    : await parseUnitrac(unitracBuf.buffer.slice(unitracBuf.byteOffset, unitracBuf.byteOffset + unitracBuf.byteLength) as ArrayBuffer)
  console.log(`→ Unitrac (${UNITRAC.endsWith('.pdf') ? 'PDF' : 'XLSX'}): ${veiculos.length} veículos`)

  // 5. Build inputs do matcher
  const escalaMap = new Map<string, LinhaEscala>()
  const escalaRows = escalaLinhas.map((l, i) => {
    const id = `esc-${i}`
    escalaMap.set(id, l)
    return {
      id,
      rede_id: l.rede_id,
      placa_norm: l.placa_norm || null,
      loja_nome_raw: l.loja_nome_raw,
      loja_codigo_raw: l.loja_codigo_raw,
      motorista_nome: l.motorista_nome,
      carro_ordem: l.carro_ordem,
      data_entrega: l.data_entrega,
    }
  })

  const paradaRows = veiculos.flatMap((v, vi) =>
    v.paradas.map((p, pi) => ({
      id: `par-${vi}-${pi}`,
      placa_norm: p.placa_norm,
      chegada: p.chegada.toISOString(),
      saida: p.saida.toISOString(),
      duracao_seg: p.duracao_seg,
      local_parada: p.local_parada,
      codigo_loja: p.codigo_loja,
      nome_loja: p.nome_loja,
      lat: p.lat,
      lng: p.lng,
      classificacao: p.classificacao,
      ordem: p.ordem,
    })),
  )

  // 6. Carrega lojas + canonical_loja via Supabase
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const [lojasRes, canonicalRes] = await Promise.all([
    svc.from('lojas').select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros').eq('ativo', true),
    svc.from('canonical_loja').select('id, name, lat, lng, raio_metros').not('lat', 'is', null).not('lng', 'is', null),
  ])

  const lojas = (lojasRes.data ?? []).map(l => ({
    id: l.id as string,
    rede_id: l.rede_id as string,
    nome: (l.nome as string) ?? '',
    nome_normalizado: (l.nome_normalizado as string) ?? '',
    codigo_escala: l.codigo_escala as string | null,
    codigo_unitrac: l.codigo_unitrac as string | null,
    nome_unitrac: l.nome_unitrac as string | null,
    lat: l.lat as number | null,
    lng: l.lng as number | null,
    raio_metros: (l.raio_metros as number | null) ?? 150,
  }))

  const geoStores = (canonicalRes.data ?? []).map(c => ({
    id: c.id as string,
    name: c.name as string,
    lat: c.lat as number,
    lng: c.lng as number,
    raio_metros: (c.raio_metros as number | null) ?? 150,
  }))

  console.log(`→ Loaded: ${lojas.length} lojas operacionais, ${geoStores.length} canonical com geo`)

  // 7. Matcher
  const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas, svc, geoStores)

  // 8. Anomalias
  const paradasIndex = new Map<string, Array<{ id: string; classificacao: string; chegada: Date; saida: Date | null; duracao_seg: number | null; lat: number | null; lng: number | null }>>()
  for (const p of paradaRows) {
    const list = paradasIndex.get(p.placa_norm) ?? []
    list.push({
      id: p.id,
      classificacao: p.classificacao,
      chegada: new Date(p.chegada),
      saida: p.saida ? new Date(p.saida) : null,
      duracao_seg: p.duracao_seg,
      lat: p.lat,
      lng: p.lng,
    })
    paradasIndex.set(p.placa_norm, list)
  }
  const anomalias = detectaAnomalias({
    rotas,
    escalaLinhas: escalaRows.map(e => ({ id: e.id, placa_norm: e.placa_norm, rede_id: e.rede_id, data_entrega: e.data_entrega, loja_nome_raw: e.loja_nome_raw })),
    paradasIndex,
    janelasRede: new Map(),
    data: DATA,
  })

  // 9. Reporta match rate por rede
  console.log('\n━━━ RESULTADO POR REDE ━━━\n')
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
  let totalGeral = 0
  let matchedGeral = 0
  console.log('Rede                | Total | Match | %    | H    L    ?')
  console.log('--------------------|-------|-------|------|------------')
  for (const [rede, s] of sorted) {
    const pct = s.total > 0 ? Math.round((s.matched / s.total) * 100) : 0
    const nome = (REDE_NOMES_CANONICOS[rede] ?? rede).padEnd(19)
    console.log(`${nome} | ${String(s.total).padStart(5)} | ${String(s.matched).padStart(5)} | ${String(pct).padStart(3)}% | ${String(s.high).padStart(3)}  ${String(s.low).padStart(3)}  ${String(s.unmatched).padStart(3)}`)
    totalGeral += s.total
    matchedGeral += s.matched
  }
  console.log('--------------------|-------|-------|------|------------')
  const pctGeral = totalGeral > 0 ? Math.round((matchedGeral / totalGeral) * 100) : 0
  console.log(`TOTAL               | ${String(totalGeral).padStart(5)} | ${String(matchedGeral).padStart(5)} | ${String(pctGeral).padStart(3)}% |`)

  // 10. Anomalias
  console.log('\n━━━ ANOMALIAS ━━━\n')
  const anomCount: Record<string, number> = {}
  for (const a of anomalias) {
    anomCount[a.codigo] = (anomCount[a.codigo] ?? 0) + 1
  }
  for (const [codigo, count] of Object.entries(anomCount).sort()) {
    console.log(`  ${codigo}: ${count}`)
  }
  console.log(`  Total: ${anomalias.length}`)

  // 11. Algoritmo usado
  console.log('\n━━━ ALGORITMO DE MATCH ━━━\n')
  const algCount: Record<string, number> = {}
  for (const rota of rotas) {
    const alg = rota._matchMeta?.algorithm ?? 'none'
    algCount[alg] = (algCount[alg] ?? 0) + 1
  }
  for (const [alg, count] of Object.entries(algCount).sort()) {
    console.log(`  ${alg}: ${count}`)
  }

  // 12. Gera XLSX por rede pra comparação contra KPI TESTE
  if (SAVE_XLSX) {
    await mkdir(OUT_DIR, { recursive: true })
    const redeMap = new Map<string, { rotas: RotaKpi[]; escala: LinhaEscala[] }>()
    for (const rota of rotas) {
      const escala = escalaMap.get(rota.escala_linha_id)
      if (!escala) continue
      const rede_id = escala.rede_id
      if (!redeMap.has(rede_id)) redeMap.set(rede_id, { rotas: [], escala: [] })
      redeMap.get(rede_id)!.rotas.push(rota)
      redeMap.get(rede_id)!.escala.push(escala)
    }

    console.log('\n━━━ GERANDO XLSX ━━━\n')
    for (const [rede_id, { rotas: rs, escala: es }] of redeMap) {
      const sorted = rs
        .map((r, i) => ({ rota: r, esc: es[i] }))
        .sort((a, b) => {
          const cmp = a.esc.loja_nome_raw.localeCompare(b.esc.loja_nome_raw)
          return cmp !== 0 ? cmp : a.esc.carro_ordem - b.esc.carro_ordem
        })

      const linhas: LinhaParaKpi[] = sorted.map(({ rota, esc }, idx) => {
        const p1 = rota.paradas[0] ?? null
        return {
          kpi_id: 'simples',
          escala_linha_id: rota.escala_linha_id,
          ordem: idx + 1,
          loja_nome: esc.loja_nome_raw,
          motorista: esc.motorista_nome,
          placa: rota.placa_norm,
          carro_ordem: esc.carro_ordem as 1 | 2,
          saida_cd: rota.saida_cd,
          chd_loja_1: p1?.chegada ?? null,
          saida_loja_1: p1?.saida ?? null,
          tempo_loja_1_min: p1?.duracao_min ?? null,
          chd_loja_2: null, saida_loja_2: null, tempo_loja_2_min: null,
          chd_loja_3: null, saida_loja_3: null, tempo_loja_3_min: null,
          observacao: null,
          anomalias_codigos: rota.anomalias_codigos,
          motorista_codigo: esc.motorista_codigo,
        }
      })

      const xlsxBuf = await gerarKpi({ rede_id, data: DATA, linhas })
      const path = `${OUT_DIR}/KPI-${rede_id}-${DATA}.xlsx`
      await writeFile(path, xlsxBuf)
      console.log(`  ${path} (${linhas.length} linhas)`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
