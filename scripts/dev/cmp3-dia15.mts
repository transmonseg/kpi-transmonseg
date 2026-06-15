import { readFile } from 'fs/promises'
import { config } from 'dotenv'; config({ path: '.env.local' })
import { createServiceClient } from '../../src/lib/supabase/service.ts'
import { parseEscalaArquivo } from '../../src/lib/parsers/escala-arquivo.ts'
import { parseUnitracPdf } from '../../src/lib/parsers/unitrac-pdf.ts'
import { cruzaEscalaUnitrac, setSemGeo, resolverLojaEsperada, variantesPlaca, type UnitracParadaRow } from '../../src/lib/kpi/matcher.ts'
import { derivarStatus } from '../../src/lib/kpi/status-rota.ts'
import { buscarFrota } from '../../src/lib/unitrac-api/frota.ts'
import { buscarPontos } from '../../src/lib/unitrac-api/pontos.ts'
import { buscarStopsCru, consolidaParadasApi } from '../../src/lib/unitrac-api/consolida.ts'
import { buscarAlvos, confirmaPorAlvo } from '../../src/lib/unitrac-api/alvos.ts'
import { mesclarParadas } from '../../src/lib/kpi/merge-paradas.ts'
import { saidaBaseSeEmRota, JANELA_FIM } from '../../src/lib/kpi/gerar-kpi-local.ts'
import { situacaoViva } from '../../src/lib/kpi/situacao-viva.ts'

const ESC = 'C:/Users/media/Downloads/ESCALA GERAL DE JUNHO DIA 15.xlsx'
const PDF = 'C:/Users/media/Downloads/relatorio_10290.pdf'
const data = '2026-06-15'
const CUTOFF_HORA = Number(process.argv[2] ?? 6.5)
const cutoffMs = new Date(`${data}T00:00:00.000Z`).getTime() + CUTOFF_HORA * 3600_000

console.log(`Comparando 3 modos — dia ${data} · corte ${CUTOFF_HORA}h (geração de MANHÃ)\n`)

// ESCALA + PDF (uma vez)
let escalaLinhas = await parseEscalaArquivo(await readFile(ESC), ESC, data)
const redesComPlaca = new Set(escalaLinhas.filter(l => l.placa_norm).map(l => l.rede_id))
escalaLinhas = escalaLinhas.filter(l => l.placa_norm || !redesComPlaca.has(l.rede_id) || l.obs === 'SEM PEDIDO')
const cad = new Set<string>(); for (const l of escalaLinhas) if (l.placa_norm) cad.add(l.placa_norm)
const veic = await parseUnitracPdf(await readFile(PDF), cad)
const pdfRows: UnitracParadaRow[] = veic.flatMap((v, vi) => v.paradas.map((p, pi) => ({
  id: `pdf-${vi}-${pi}`, placa_norm: p.placa_norm, chegada: p.chegada.toISOString(), saida: p.saida.toISOString(),
  duracao_seg: p.duracao_seg, local_parada: p.local_parada, codigo_loja: p.codigo_loja, nome_loja: p.nome_loja,
  lat: p.lat, lng: p.lng, endereco: p.endereco, classificacao: p.classificacao, ordem: p.ordem,
})))

// API (uma vez, com corte de manhã)
const frota = await buscarFrota()
const pontos = await buscarPontos(frota.map(v => v.cv))
const alvosFull = await buscarAlvos(frota.map(v => v.cv))
const alvosCorte = alvosFull.filter(a => !a.feitoISO || new Date(a.feitoISO + 'Z').getTime() <= cutoffMs)
const placasEscala = new Set(escalaLinhas.map(l => l.placa_norm).filter(Boolean) as string[])
const apiRows: UnitracParadaRow[] = []
for (const v of frota) {
  if (!placasEscala.has(v.placaNorm)) continue
  const ev = (await buscarStopsCru(v.cv, 48)).filter(e => new Date(e._data).getTime() <= cutoffMs)
  apiRows.push(...consolidaParadasApi(ev, pontos, data, v.placaNorm))
}
// ground-truth: quem REALMENTE entregou até o fim do dia (alvo feito, sem corte)
const entregouNoDia = new Set(alvosFull.filter(a => a.situacao === 1 && a.feitoISO).map(a => a.placaNorm))

const svc = createServiceClient()
const [lr, cr] = await Promise.all([
  svc.from('lojas').select('id,rede_id,nome,nome_normalizado,codigo_escala,codigo_unitrac,nome_unitrac,lat,lng,raio_metros,endereco,bairro,municipio,numero').eq('ativo', true).order('id'),
  svc.from('canonical_loja').select('id,name,lat,lng,raio_metros').not('lat', 'is', null).not('lng', 'is', null),
])
const lojas = (lr.data ?? []).map((l: any) => ({ ...l, raio_metros: l.raio_metros ?? 150 }))
const geo = (cr.data ?? []).map((c: any) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, raio_metros: c.raio_metros ?? 150 }))
const escalaRows = escalaLinhas.map((l, i) => ({ id: `esc-${i}`, rede_id: l.rede_id, placa_norm: l.placa_norm || null, loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega }))
const escMap = new Map(escalaRows.map((e, i) => [e.id, escalaLinhas[i]]))

type Cat = 'entregue' | 'em_rota' | 'na_base' | 'sem_sinal' | 'VERMELHO'
async function rodarModo(modo: 'pdf' | 'pdf_api' | 'api') {
  let pr: UnitracParadaRow[]
  if (modo === 'pdf') pr = pdfRows
  else if (modo === 'api') pr = apiRows
  else pr = mesclarParadas(pdfRows, apiRows)

  const reportMaxHora = pr.reduce((mx, p) => { const d = new Date(p.saida ?? p.chegada); return Math.max(mx, d.getUTCHours() + d.getUTCMinutes() / 60) }, 0)
  const corteMs = pr.reduce((mx, p) => Math.max(mx, new Date(p.saida ?? p.chegada).getTime()), 0)
  const saiuSet = new Set(pr.filter(p => p.classificacao === 'LOJA' || p.classificacao === 'FORA_BASE').map(p => p.placa_norm))
  const relSet = new Set(pr.map(p => p.placa_norm))
  const saiu = (pl: string | null) => !!pl && (saiuSet.has(pl) || variantesPlaca(pl).some(v => saiuSet.has(v)))
  const rastreada = (pl: string | null) => !!pl && (relSet.has(pl) || variantesPlaca(pl).some(v => relSet.has(v)))

  setSemGeo(true)
  const idx = new Map<string, { classificacao: string; chegada: Date; saida: Date | null }[]>()
  for (const p of pr) { const a = idx.get(p.placa_norm) ?? []; a.push({ classificacao: p.classificacao, chegada: new Date(p.chegada), saida: p.saida ? new Date(p.saida) : null }); idx.set(p.placa_norm, a) }
  const rotas = await cruzaEscalaUnitrac(escalaRows as any, pr as any, lojas as any, svc, geo as any, { geoEndereco: true })

  if (modo !== 'pdf') {
    for (const rota of rotas) {
      const esc = escMap.get(rota.escala_linha_id); if (!esc || !rota.placa_norm) continue
      const esp = resolverLojaEsperada(esc as any, lojas as any); if (!esp?.codigo_unitrac) continue
      const c = confirmaPorAlvo(rota.placa_unitrac ?? rota.placa_norm, esp.codigo_unitrac, alvosCorte)
      if (c && !rota.paradas.some(p => p.loja_id === esp.id)) {
        const t = new Date(c.feitoISO + 'Z')
        rota.paradas = [{ parada_id: null, loja_id: esp.id, nome: esp.nome, chegada: t, saida: t, duracao_min: 0, classificacao: 'LOJA' } as any]
        rota.status = 'ok'
      }
    }
  }

  const cont: Record<Cat, number> = { entregue: 0, em_rota: 0, na_base: 0, sem_sinal: 0, VERMELHO: 0 }
  const vermelhosMasEntregou: string[] = []
  for (const rota of rotas) {
    const esc = escMap.get(rota.escala_linha_id)!
    const janelaFim = JANELA_FIM[esc.rede_id] ?? 12
    const relatorioCedo = reportMaxHora < janelaFim
    const temEntrega = rota.paradas.some(p => p.loja_id != null)
    const pu = rota.placa_unitrac ?? rota.placa_norm
    const st = derivarStatus({
      temGps: rota.paradas.length > 0 || rastreada(rota.placa_norm),
      ficouNaBase: rota.status === 'sem_entrega' && !!esc.placa_norm,
      paradas: rota.paradas.map(p => ({ classificacao: p.classificacao, loja_id: p.loja_id ?? null })),
      viaGeo: (rota as any)._matchMeta?.algorithm === 'geo', viaTroca: (rota as any)._matchMeta?.algorithm === 'troca',
      geoConfiavel: rota.geo_confiavel ?? false, placaFoiAlgumLugar: saiu(pu), placaSaiuDaBase: saiu(pu),
    } as any)
    const entregue = st.status === 'ENTREGUE' || st.status === 'ENTREGUE_GEO'
    const sv = relatorioCedo ? situacaoViva({ entregue, naApi: rastreada(rota.placa_norm), saiuDaBase: saiu(rota.placa_norm) }) : undefined
    let cat: Cat
    if (entregue) cat = 'entregue'
    else if (sv === 'EM_ROTA') cat = 'em_rota'
    else if (sv === 'NA_BASE') cat = 'na_base'
    else if (sv === 'SEM_SINAL' || !rastreada(rota.placa_norm)) cat = 'sem_sinal'
    else cat = 'VERMELHO'
    cont[cat]++
    // perigo: marcou vermelho/sem-sinal mas a placa REALMENTE entregou no dia
    if ((cat === 'VERMELHO') && rota.placa_norm && entregouNoDia.has(rota.placa_norm)) vermelhosMasEntregou.push(`${rota.placa_norm} ${String(esc.loja_nome_raw).slice(0,24)}`)
  }
  return { modo, cont, total: rotas.length, vermelhosMasEntregou }
}

const res = []
for (const m of ['pdf', 'pdf_api', 'api'] as const) res.push(await rodarModo(m))

console.log('MODO       entregue  em_rota  na_base  sem_sinal  VERMELHO(perigo)   total')
console.log('-'.repeat(78))
for (const r of res) {
  console.log(`${r.modo.padEnd(9)}  ${String(r.cont.entregue).padStart(7)}  ${String(r.cont.em_rota).padStart(7)}  ${String(r.cont.na_base).padStart(7)}  ${String(r.cont.sem_sinal).padStart(9)}  ${String(r.cont.VERMELHO).padStart(9)}        ${r.total}`)
}
console.log('\nVERMELHO indevido (marcou não-foi mas a placa ENTREGOU no dia, por modo):')
for (const r of res) {
  console.log(`  ${r.modo}: ${r.vermelhosMasEntregou.length} casos${r.vermelhosMasEntregou.length ? ' → ' + r.vermelhosMasEntregou.slice(0, 8).join(' | ') : ''}`)
}
