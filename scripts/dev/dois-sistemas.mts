import { readFile } from 'fs/promises'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseUnitracPdfJs } from '../../src/lib/parsers/unitrac-pdf-pdfjs.ts'
import { parseEscalaArquivo } from '../../src/lib/parsers/escala-arquivo.ts'
import { cruzaEscalaUnitrac, setSemGeo } from '../../src/lib/kpi/matcher.ts'
import { derivarStatus } from '../../src/lib/kpi/status-rota.ts'
import { buscarFrota } from '../../src/lib/unitrac-api/frota.ts'
import { buscarPontos } from '../../src/lib/unitrac-api/pontos.ts'
import { buscarStopsCru, consolidaParadasApi } from '../../src/lib/unitrac-api/consolida.ts'
import { createServiceClient } from '../../src/lib/supabase/service.ts'

const data = '2026-06-12'
const svc = createServiceClient()
const [lojasRes, canonRes] = await Promise.all([
  svc.from('lojas').select('id,rede_id,nome,nome_normalizado,codigo_escala,codigo_unitrac,nome_unitrac,lat,lng,raio_metros,endereco,bairro,municipio,numero').eq('ativo', true).order('id'),
  svc.from('canonical_loja').select('id,name,lat,lng,raio_metros').not('lat', 'is', null).not('lng', 'is', null),
])
const lojas = (lojasRes.data ?? []).map((l: any) => ({ ...l, raio_metros: l.raio_metros ?? 150 }))
const geoStores = (canonRes.data ?? []).map((c: any) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, raio_metros: c.raio_metros ?? 150 }))

// Escala (12/06)
const eb = await readFile('C:/Users/media/Downloads/ESCALA GERAL DE JUNHO (6).xlsx')
const escala = await parseEscalaArquivo(eb.buffer.slice(eb.byteOffset, eb.byteOffset + eb.byteLength) as any, 'x.xlsx', data)
const escalaRows = escala.map((l: any, i: number) => ({ id: `e${i}`, rede_id: l.rede_id, placa_norm: l.placa_norm || null, loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega }))

// Paradas PDF
const buf = await readFile('C:/Users/media/Downloads/relatorio_10254.pdf')
const resumos = await parseUnitracPdfJs(buf, null)
const prPdf: any[] = []
for (const r of resumos) for (const p of r.paradas) prPdf.push({ ...p, id: `${r.placa_norm}-pdf-${p.ordem}`, placa_norm: r.placa_norm })

// Paradas API
const frota = await buscarFrota()
const pontos = await buscarPontos(frota.map(v => v.cv))
const placasEscala = new Set(escalaRows.map((l: any) => l.placa_norm).filter(Boolean))
const prApi: any[] = []
for (const v of frota) {
  if (!placasEscala.has(v.placaNorm)) continue
  const paradas = consolidaParadasApi(await buscarStopsCru(v.cv, 48), pontos, data, v.placaNorm)
  for (const p of paradas) prApi.push({ ...p })
}

function statusDe(rotas: any[], pr: any[]) {
  const todas = new Map<string, any[]>()
  for (const p of pr) { const a = todas.get(p.placa_norm) ?? []; a.push(p); todas.set(p.placa_norm, a) }
  const saiu = (pl: string | null) => !!pl && (todas.get(pl) ?? []).some((p: any) => p.classificacao === 'LOJA' || p.classificacao === 'FORA_BASE')
  const m = new Map<string, string>()
  for (const rt of rotas) {
    const placaUni = rt.placa_unitrac ?? rt.placa_norm
    const st = derivarStatus({
      temGps: rt.paradas.length > 0 || todas.has(placaUni),
      ficouNaBase: rt.status === 'sem_entrega' && !!rt.placa_norm,
      paradas: rt.paradas.map((p: any) => ({ classificacao: p.classificacao, loja_id: p.loja_id ?? null })),
      viaGeo: rt._matchMeta?.algorithm === 'geo', viaTroca: rt._matchMeta?.algorithm === 'troca',
      geoConfiavel: rt.geo_confiavel ?? false, placaFoiAlgumLugar: saiu(placaUni), placaSaiuDaBase: saiu(placaUni),
    })
    m.set(rt.escala_linha_id, st.status)
  }
  return m
}

setSemGeo(true)
const rotasPdf = await cruzaEscalaUnitrac(escalaRows as any, prPdf as any, lojas as any, svc, geoStores as any, { geoEndereco: true })
const stPdf = statusDe(rotasPdf, prPdf)
setSemGeo(true)
const rotasApi = await cruzaEscalaUnitrac(escalaRows as any, prApi as any, lojas as any, svc, geoStores as any, { geoEndereco: true })
const stApi = statusDe(rotasApi, prApi)

const ENT = (s?: string) => s === 'ENTREGUE' || s === 'ENTREGUE_GEO'
let iguais = 0, difStatus = 0, ambosEntreg = 0, soPdf = 0, soApi = 0, nenhum = 0
const divergencias: string[] = []
for (const e of escalaRows) {
  const a = stPdf.get(e.id), b = stApi.get(e.id)
  if (a === b) iguais++; else difStatus++
  if (ENT(a) && ENT(b)) ambosEntreg++
  else if (ENT(a) && !ENT(b)) { soPdf++; if (divergencias.length < 20) divergencias.push(`PDF=${a} API=${b}  ${e.placa_norm} "${e.loja_nome_raw}"`) }
  else if (!ENT(a) && ENT(b)) { soApi++; if (divergencias.length < 20) divergencias.push(`PDF=${a} API=${b}  ${e.placa_norm} "${e.loja_nome_raw}"`) }
  else nenhum++
}
const total = escalaRows.length
console.log(`\n=== DOIS SISTEMAS — dia ${data} (${total} linhas de escala) ===`)
console.log(`Status idêntico PDF vs API: ${iguais} (${Math.round(iguais/total*100)}%)`)
console.log(`Ambos ENTREGUE: ${ambosEntreg}`)
console.log(`Só PDF entregou (API não): ${soPdf}`)
console.log(`Só API entregou (PDF não): ${soApi}`)
console.log(`Ambos não-entrega: ${nenhum}`)
console.log(`\nDivergências de entrega (até 20):`)
for (const d of divergencias) console.log('  ' + d)
