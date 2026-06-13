import { config } from 'dotenv'; config({ path: '.env.local' })
import { createServiceClient } from '../../src/lib/supabase/service.ts'
import { parseUnitracPdf } from '../../src/lib/parsers/unitrac-pdf.ts'
import { cruzaEscalaUnitrac, setSemGeo, resolverLojaEsperada } from '../../src/lib/kpi/matcher.ts'
import { derivarStatus } from '../../src/lib/kpi/status-rota.ts'
import { buscarFrota } from '../../src/lib/unitrac-api/frota.ts'
import { buscarPontos } from '../../src/lib/unitrac-api/pontos.ts'
import { buscarStopsCru, consolidaParadasApi } from '../../src/lib/unitrac-api/consolida.ts'
import { buscarAlvos, confirmaPorAlvo, inicioRotaPorAlvo } from '../../src/lib/unitrac-api/alvos.ts'
import { mesclarParadas } from '../../src/lib/kpi/merge-paradas.ts'

const data = process.argv[2] ?? '2026-06-13'
const svc = createServiceClient()
const [lr, cr, ups] = await Promise.all([
  svc.from('lojas').select('id,rede_id,nome,nome_normalizado,codigo_escala,codigo_unitrac,nome_unitrac,lat,lng,raio_metros,endereco,bairro,municipio,numero').eq('ativo', true).order('id'),
  svc.from('canonical_loja').select('id,name,lat,lng,raio_metros').not('lat', 'is', null).not('lng', 'is', null),
  svc.from('escala_uploads').select('id').eq('data_escala', data),
])
const lojas = (lr.data ?? []).map((l: any) => ({ ...l, raio_metros: l.raio_metros ?? 150 }))
const geo = (cr.data ?? []).map((c: any) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, raio_metros: c.raio_metros ?? 150 }))
const ids = (ups.data ?? []).map((u: any) => u.id)
const { data: rows } = await svc.from('escala_linhas').select('rede_id,loja_nome_raw,loja_codigo_raw,placa_norm,motorista_nome,carro_ordem,data_entrega').in('escala_upload_id', ids)
const escalaRows = (rows ?? []).map((l: any, i: number) => ({ id: `e${i}`, rede_id: l.rede_id, placa_norm: l.placa_norm || null, loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega }))
const escMap = new Map(escalaRows.map((e: any) => [e.id, e]))

// paradas PDF (do storage)
const { data: pdfBlob } = await svc.storage.from('unitrac-raw').download(`${data}/unitrac.pdf`)
const prPdf: any[] = []
if (pdfBlob) {
  const cad = new Set<string>(); for (const e of escalaRows) if (e.placa_norm) cad.add(e.placa_norm)
  const veic = await parseUnitracPdf(Buffer.from(await pdfBlob.arrayBuffer()), cad)
  for (const v of veic) for (const p of v.paradas) prPdf.push({ id: `${v.placa_norm}-${p.ordem}`, placa_norm: v.placa_norm, chegada: p.chegada.toISOString(), saida: p.saida.toISOString(), duracao_seg: p.duracao_seg, local_parada: p.local_parada, codigo_loja: p.codigo_loja, nome_loja: p.nome_loja, lat: p.lat, lng: p.lng, endereco: p.endereco, classificacao: p.classificacao, ordem: p.ordem })
}
// paradas API
const frota = await buscarFrota(); const pontos = await buscarPontos(frota.map(v => v.cv)); const alvos = await buscarAlvos(frota.map(v => v.cv))
const placas = new Set(escalaRows.map((e: any) => e.placa_norm).filter(Boolean))
const prApi: any[] = []
for (const v of frota) { if (!placas.has(v.placaNorm)) continue; prApi.push(...consolidaParadasApi(await buscarStopsCru(v.cv, 48), pontos, data, v.placaNorm)) }

function ENT(s: string) { return s === 'ENTREGUE' || s === 'ENTREGUE_GEO' }
async function rodar(pr: any[], enriquecer: boolean): Promise<Map<string, string>> {
  const todas = new Map<string, any[]>(); for (const p of pr) { const a = todas.get(p.placa_norm) ?? []; a.push(p); todas.set(p.placa_norm, a) }
  const saiu = (pl: string | null) => !!pl && (todas.get(pl) ?? []).some((p: any) => p.classificacao === 'LOJA' || p.classificacao === 'FORA_BASE')
  setSemGeo(true)
  const rotas = await cruzaEscalaUnitrac(escalaRows as any, pr as any, lojas as any, svc, geo as any, { geoEndereco: true })
  const m = new Map<string, string>()
  for (const rt of rotas) {
    const esc = escMap.get(rt.escala_linha_id) as any
    if (enriquecer && esc) {
      const esperada = resolverLojaEsperada({ rede_id: esc.rede_id, loja_codigo_raw: esc.loja_codigo_raw, loja_nome_raw: esc.loja_nome_raw } as any, lojas as any)
      if (esperada?.codigo_unitrac && rt.placa_norm) {
        const c = confirmaPorAlvo(rt.placa_unitrac ?? rt.placa_norm, esperada.codigo_unitrac, alvos)
        if (c && !rt.paradas.some((p: any) => p.loja_id === esperada.id)) { const t = new Date(c.feitoISO + 'Z'); rt.paradas = [{ parada_id: null, loja_id: esperada.id, nome: esperada.nome, chegada: t, saida: t, duracao_min: 0, classificacao: 'LOJA' }] }
        if (!rt.saida_cd) { const ini = inicioRotaPorAlvo(rt.placa_unitrac ?? rt.placa_norm, esperada.codigo_unitrac, alvos); if (ini) rt.saida_cd = new Date(ini + 'Z') }
      }
    }
    const pu = rt.placa_unitrac ?? rt.placa_norm
    const st = derivarStatus({ temGps: rt.paradas.length > 0 || todas.has(pu), ficouNaBase: rt.status === 'sem_entrega' && !!rt.placa_norm, paradas: rt.paradas.map((p: any) => ({ classificacao: p.classificacao, loja_id: p.loja_id ?? null })), viaGeo: rt._matchMeta?.algorithm === 'geo', viaTroca: rt._matchMeta?.algorithm === 'troca', geoConfiavel: rt.geo_confiavel ?? false, placaFoiAlgumLugar: saiu(pu), placaSaiuDaBase: saiu(pu) })
    m.set(rt.escala_linha_id, st.status)
  }
  return m
}

const pdf = await rodar(prPdf, false)
const prPdfApi = mesclarParadas(prPdf as any, prApi as any)
const pdfApi = await rodar(prPdfApi as any, true)
const api = await rodar(prApi, true)
const cont = (m: Map<string, string>) => [...m.values()].filter(ENT).length
console.log(`\n=== 3 MODOS — dia ${data} (${escalaRows.length} linhas) ===`)
console.log(`Entregues → Só PDF: ${cont(pdf)} | PDF+API: ${cont(pdfApi)} | Só API: ${cont(api)}`)
let div = 0
console.log('\nDivergências (onde os 3 não concordam):')
for (const e of escalaRows as any[]) {
  const a = pdf.get(e.id), b = pdfApi.get(e.id), c = api.get(e.id)
  if (a === b && b === c) continue
  div++
  if (div <= 25) console.log(`  ${e.placa_norm} "${String(e.loja_nome_raw).slice(0,28)}" → PDF:${a} | PDF+API:${b} | API:${c}`)
}
console.log(`\nTotal divergentes: ${div}/${escalaRows.length}`)
