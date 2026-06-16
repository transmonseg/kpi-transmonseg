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
import { confirmaEntregaViaApi } from '../../src/lib/unitrac-api/confirma.ts'
import { buscarPosicoes } from '../../src/lib/unitrac-api/posicoes.ts'
import { mesclarParadas } from '../../src/lib/kpi/merge-paradas.ts'
import { saidaBaseSeEmRota, JANELA_FIM } from '../../src/lib/kpi/gerar-kpi-local.ts'
import { situacaoViva } from '../../src/lib/kpi/situacao-viva.ts'
import { gerarKpi } from '../../src/lib/kpi/gerador-kpi.ts'
import { rotaToLinha } from '../../src/lib/kpi/gerar-kpi-local.ts'

const ESC = 'C:/Users/media/Downloads/ESCALA GERAL DE JUNHO DIA 15.xlsx'
const PDF = 'C:/Users/media/Downloads/relatorio_10290.pdf'
const data = '2026-06-15'
const API_DOWN = process.argv.includes('--apidown')
const CUTOFF = 6.5
const cutoffMs = new Date(`${data}T00:00:00.000Z`).getTime() + CUTOFF * 3600_000

console.log(`\n###### E2E ${API_DOWN ? '(API CAÍDA — simula fallback)' : '(API no ar)'} · dia ${data} ######`)

let escalaLinhas = await parseEscalaArquivo(await readFile(ESC), ESC, data)
const redesComPlaca = new Set(escalaLinhas.filter(l => l.placa_norm).map(l => l.rede_id))
escalaLinhas = escalaLinhas.filter(l => l.placa_norm || !redesComPlaca.has(l.rede_id) || l.obs === 'SEM PEDIDO')
const cad = new Set<string>(); for (const l of escalaLinhas) if (l.placa_norm) cad.add(l.placa_norm)
const veic = await parseUnitracPdf(await readFile(PDF), cad)
let paradaRows: UnitracParadaRow[] = veic.flatMap((v, vi) => v.paradas.map((p, pi) => ({
  id: `pdf-${vi}-${pi}`, placa_norm: p.placa_norm, chegada: p.chegada.toISOString(), saida: p.saida.toISOString(),
  duracao_seg: p.duracao_seg, local_parada: p.local_parada, codigo_loja: p.codigo_loja, nome_loja: p.nome_loja,
  lat: p.lat, lng: p.lng, endereco: p.endereco, classificacao: p.classificacao, ordem: p.ordem,
})))
console.log(`escala=${escalaLinhas.length} linhas · PDF=${paradaRows.length} paradas`)

// API (ou vazio quando --apidown, simulando a API fora do ar)
let pontosApi: Record<string, any> = {}, alvosApi: any[] = [], posicoesApi: Record<string, any> = {}
if (!API_DOWN) {
  const frota = await buscarFrota()
  const cvs = frota.map(v => v.cv)
  const [pts, alv, pos] = await Promise.all([buscarPontos(cvs), buscarAlvos(cvs), buscarPosicoes(cvs)])
  pontosApi = pts; alvosApi = alv.filter((a: any) => !a.feitoISO || new Date(a.feitoISO + 'Z').getTime() <= cutoffMs); posicoesApi = pos
  const placasEscala = new Set(escalaLinhas.map(l => l.placa_norm).filter(Boolean) as string[])
  const apiRows: UnitracParadaRow[] = []
  for (const v of frota) { if (!placasEscala.has(v.placaNorm)) continue; const ev = (await buscarStopsCru(v.cv, 48)).filter(e => new Date(e._data).getTime() <= cutoffMs); apiRows.push(...consolidaParadasApi(ev, pts, data, v.placaNorm)) }
  paradaRows = mesclarParadas(paradaRows, apiRows)
}
console.log(`pontosApi=${Object.keys(pontosApi).length} alvos=${alvosApi.length} posicoes=${Object.keys(posicoesApi).length} · paradas(merge)=${paradaRows.length}`)

const svc = createServiceClient()
const [lr, cr] = await Promise.all([
  svc.from('lojas').select('id,rede_id,nome,nome_normalizado,codigo_escala,codigo_unitrac,nome_unitrac,lat,lng,raio_metros,endereco,bairro,municipio,numero').eq('ativo', true).order('id'),
  svc.from('canonical_loja').select('id,name,lat,lng,raio_metros').not('lat', 'is', null).not('lng', 'is', null),
])
const lojas = (lr.data ?? []).map((l: any) => ({ ...l, raio_metros: l.raio_metros ?? 150 }))
const geo = (cr.data ?? []).map((c: any) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, raio_metros: c.raio_metros ?? 150 }))
const escalaRows = escalaLinhas.map((l, i) => ({ id: `esc-${i}`, rede_id: l.rede_id, placa_norm: l.placa_norm || null, loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega }))
const escMap = new Map(escalaRows.map((e, i) => [e.id, escalaLinhas[i]]))

const reportMaxHora = paradaRows.reduce((mx, p) => { const d = new Date(p.saida ?? p.chegada); return Math.max(mx, d.getUTCHours() + d.getUTCMinutes() / 60) }, 0)
const corteMs = paradaRows.reduce((mx, p) => Math.max(mx, new Date(p.saida ?? p.chegada).getTime()), 0)
const saiuSet = new Set(paradaRows.filter(p => p.classificacao === 'LOJA' || p.classificacao === 'FORA_BASE').map(p => p.placa_norm))
const relSet = new Set(paradaRows.map(p => p.placa_norm))
const saiu = (pl: string | null) => !!pl && (saiuSet.has(pl) || variantesPlaca(pl).some(v => saiuSet.has(v)))
const rastreada = (pl: string | null) => !!pl && (relSet.has(pl) || variantesPlaca(pl).some(v => relSet.has(v)))

setSemGeo(true)
const rotas = await cruzaEscalaUnitrac(escalaRows as any, paradaRows as any, lojas as any, svc, geo as any, { geoEndereco: true })

// enriquecimento via API (geo + alvo) — blindado igual ao route
let geoRescues = 0, alvoRescues = 0
try {
  if (Object.keys(pontosApi).length > 0) {
    const stopsPorPlaca = (placa: string | null) => { if (!placa) return []; const vars = new Set([placa, ...variantesPlaca(placa)]); return paradaRows.filter(p => vars.has(p.placa_norm)) }
    const usados = new Set<string>()
    for (const rota of rotas) {
      const esc = escMap.get(rota.escala_linha_id); if (!esc) continue
      const esp = resolverLojaEsperada(esc as any, lojas as any); if (!esp?.codigo_unitrac) continue
      if (rota.paradas.some(p => p.loja_id === esp.id)) continue
      const conf = confirmaEntregaViaApi(esp.codigo_unitrac, stopsPorPlaca(rota.placa_unitrac ?? rota.placa_norm) as any, pontosApi as any)
      if (!conf || usados.has(conf.stopId)) continue
      const sp = paradaRows.find(p => p.id === conf.stopId); if (!sp) continue
      const ch = new Date(sp.chegada), sa = sp.saida ? new Date(sp.saida) : ch
      rota.paradas = [{ parada_id: sp.id, loja_id: esp.id, nome: esp.nome, chegada: ch, saida: sa, duracao_min: Math.round((sa.getTime()-ch.getTime())/60000), classificacao: 'LOJA' } as any]
      rota.status = 'ok'; rota.geo_confiavel = true; (rota as any)._matchMeta = { algorithm: 'api' }; usados.add(sp.id); geoRescues++
    }
  }
  if (alvosApi.length > 0) {
    for (const rota of rotas) {
      const esc = escMap.get(rota.escala_linha_id); if (!esc || !rota.placa_norm) continue
      const esp = resolverLojaEsperada(esc as any, lojas as any); if (!esp?.codigo_unitrac) continue
      const c = confirmaPorAlvo(rota.placa_unitrac ?? rota.placa_norm, esp.codigo_unitrac, alvosApi)
      if (c && !rota.paradas.some(p => p.loja_id === esp.id)) { const t = new Date(c.feitoISO + 'Z'); rota.paradas = [{ parada_id: null, loja_id: esp.id, nome: esp.nome, chegada: t, saida: t, duracao_min: 0, classificacao: 'LOJA' } as any]; rota.status = 'ok'; alvoRescues++ }
    }
  }
} catch (e) { console.log('  enriquecimento falhou (esperado se API estranha), seguiu:', e) }

const idx = new Map<string, { classificacao: string; chegada: Date; saida: Date | null }[]>()
for (const p of paradaRows) { const a = idx.get(p.placa_norm) ?? []; a.push({ classificacao: p.classificacao, chegada: new Date(p.chegada), saida: p.saida ? new Date(p.saida) : null }); idx.set(p.placa_norm, a) }

const cont = { entregue: 0, em_rota: 0, na_base: 0, sem_sinal: 0, VERMELHO: 0 }
let semCom = 0
const grupos = new Map<string, { rotas: any[]; esc: any[] }>()
for (const rota of rotas) {
  const esc = escMap.get(rota.escala_linha_id)!
  const janelaFim = JANELA_FIM[esc.rede_id] ?? 12
  const relatorioCedo = reportMaxHora < janelaFim
  const temEntrega = rota.paradas.some(p => p.loja_id != null)
  const pu = rota.placa_unitrac ?? rota.placa_norm
  const st = derivarStatus({ temGps: rota.paradas.length > 0 || rastreada(rota.placa_norm), ficouNaBase: rota.status === 'sem_entrega' && !!esc.placa_norm, paradas: rota.paradas.map(p => ({ classificacao: p.classificacao, loja_id: p.loja_id ?? null })), viaGeo: (rota as any)._matchMeta?.algorithm === 'geo', viaTroca: false, geoConfiavel: rota.geo_confiavel ?? false, placaFoiAlgumLugar: saiu(pu), placaSaiuDaBase: saiu(pu) } as any)
  const ent = st.status === 'ENTREGUE' || st.status === 'ENTREGUE_GEO'
  const sv = relatorioCedo ? situacaoViva({ entregue: ent, naApi: rastreada(rota.placa_norm), saiuDaBase: saiu(rota.placa_norm) }) : undefined
  if (st.status === 'SEM_RASTREADOR' && (posicoesApi[rota.placa_norm ?? ''])) semCom++
  if (ent) cont.entregue++
  else if (sv === 'EM_ROTA') cont.em_rota++
  else if (sv === 'NA_BASE') cont.na_base++
  else if (sv === 'SEM_SINAL' || !rastreada(rota.placa_norm)) cont.sem_sinal++
  else cont.VERMELHO++
  const g = grupos.get(esc.rede_id) ?? { rotas: [], esc: [] }; g.rotas.push(rota); g.esc.push(esc); grupos.set(esc.rede_id, g)
}

// gera o XLSX de uma rede de verdade (prova que o gerador roda sem erro)
let xlsxOk = 0, xlsxErr = 0
for (const [rede_id, g] of grupos) {
  try {
    const linhas = g.rotas.map((r, i) => rotaToLinha(r, g.esc[i], i + 1))
    const buf = await gerarKpi({ rede_id, data, linhas })
    if (buf && buf.length > 0) xlsxOk++; else xlsxErr++
  } catch { xlsxErr++ }
}

console.log(`\nRESULTADO (${rotas.length} linhas, ${grupos.size} redes):`)
console.log(`  entregue=${cont.entregue} em_rota=${cont.em_rota} na_base=${cont.na_base} sem_sinal=${cont.sem_sinal} VERMELHO=${cont.VERMELHO}`)
console.log(`  geo-rescues=${geoRescues} alvo-rescues=${alvoRescues} sem-comunicacao=${semCom}`)
console.log(`  XLSX gerados OK: ${xlsxOk}/${grupos.size} (erros=${xlsxErr})`)
console.log(`  ${xlsxErr === 0 && rotas.length > 0 ? 'PASS: gerou tudo sem erro' : 'FALHOU'}`)
