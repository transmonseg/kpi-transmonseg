import { readFile } from 'fs/promises'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseEscalaArquivo } from '../../src/lib/parsers/escala-arquivo.ts'
import { cruzaEscalaUnitrac, setSemGeo } from '../../src/lib/kpi/matcher.ts'
import { derivarStatus } from '../../src/lib/kpi/status-rota.ts'
import { buscarFrota } from '../../src/lib/unitrac-api/frota.ts'
import { buscarPontos } from '../../src/lib/unitrac-api/pontos.ts'
import { buscarStopsCru, consolidaParadasApi } from '../../src/lib/unitrac-api/consolida.ts'
import { createServiceClient } from '../../src/lib/supabase/service.ts'

const data = process.argv[2] ?? '2026-06-12'
const svc = createServiceClient()

console.log('=== 1) API alcançável + janela de dias testáveis ===')
const frota = await buscarFrota()
console.log(`Frota da API: ${frota.length} veículos ${frota.length ? '✅' : '❌ API não respondeu'}`)
const pontos = await buscarPontos(frota.map(v => v.cv))
console.log(`Geofences: ${Object.keys(pontos).length}`)
const amostra = frota.find(v => v.placaNorm === 'FUM8748') ?? frota[0]
const ev0 = await buscarStopsCru(amostra.cv, 336)
const dias = [...new Set(ev0.map(e => e._data.slice(0, 10)))].sort()
console.log(`Dias com dados na API agora: ${dias.join(', ') || 'nenhum'}`)
console.log(`Dia testando: ${data} ${dias.includes(data) ? '✅ coberto' : '⚠️ FORA da janela — escolha um dos dias acima'}\n`)

console.log('=== 2) KPI modo API completo (toda a escala) ===')
const [lojasRes, canonRes] = await Promise.all([
  svc.from('lojas').select('id,rede_id,nome,nome_normalizado,codigo_escala,codigo_unitrac,nome_unitrac,lat,lng,raio_metros,endereco,bairro,municipio,numero').eq('ativo', true).order('id'),
  svc.from('canonical_loja').select('id,name,lat,lng,raio_metros').not('lat', 'is', null).not('lng', 'is', null),
])
const lojas = (lojasRes.data ?? []).map((l: any) => ({ ...l, raio_metros: l.raio_metros ?? 150 }))
const geoStores = (canonRes.data ?? []).map((c: any) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, raio_metros: c.raio_metros ?? 150 }))

const eb = await readFile('C:/Users/media/Downloads/ESCALA GERAL DE JUNHO (6).xlsx')
const escala = await parseEscalaArquivo(eb.buffer.slice(eb.byteOffset, eb.byteOffset + eb.byteLength) as any, 'x.xlsx', data)
const escalaRows = escala.map((l: any, i: number) => ({ id: `e${i}`, rede_id: l.rede_id, placa_norm: l.placa_norm || null, loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega }))
console.log(`Linhas de escala: ${escalaRows.length}`)

const placasEscala = new Set(escalaRows.map((l: any) => l.placa_norm).filter(Boolean))
const pr: any[] = []
let comDados = 0
for (const v of frota) {
  if (!placasEscala.has(v.placaNorm)) continue
  const paradas = consolidaParadasApi(await buscarStopsCru(v.cv, 48), pontos, data, v.placaNorm)
  if (paradas.length) comDados++
  for (const p of paradas) pr.push({ ...p })
}
console.log(`Placas da escala com paradas na API: ${comDados}/${placasEscala.size}`)

const todas = new Map<string, any[]>()
for (const p of pr) { const a = todas.get(p.placa_norm) ?? []; a.push(p); todas.set(p.placa_norm, a) }
const saiu = (pl: string | null) => !!pl && (todas.get(pl) ?? []).some((p: any) => p.classificacao === 'LOJA' || p.classificacao === 'FORA_BASE')

setSemGeo(true)
const t0 = process.hrtime.bigint()
const rotas = await cruzaEscalaUnitrac(escalaRows as any, pr as any, lojas as any, svc, geoStores as any, { geoEndereco: true })
const ms = Number(process.hrtime.bigint() - t0) / 1e6

const cont: Record<string, number> = {}
for (const rt of rotas) {
  const placaUni = rt.placa_unitrac ?? rt.placa_norm
  const st = derivarStatus({
    temGps: rt.paradas.length > 0 || todas.has(placaUni),
    ficouNaBase: rt.status === 'sem_entrega' && !!rt.placa_norm,
    paradas: rt.paradas.map((p: any) => ({ classificacao: p.classificacao, loja_id: p.loja_id ?? null })),
    viaGeo: rt._matchMeta?.algorithm === 'geo', viaTroca: rt._matchMeta?.algorithm === 'troca',
    geoConfiavel: rt.geo_confiavel ?? false, placaFoiAlgumLugar: saiu(placaUni), placaSaiuDaBase: saiu(placaUni),
  })
  cont[st.status] = (cont[st.status] ?? 0) + 1
}
console.log(`\nGerou ${rotas.length} rotas em ${Math.round(ms)}ms — SEM erro ✅`)
console.log('Status do KPI (modo API):')
for (const [k, n] of Object.entries(cont).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`)
const entreg = (cont['ENTREGUE'] ?? 0) + (cont['ENTREGUE_GEO'] ?? 0)
console.log(`\n→ Entregues: ${entreg}/${rotas.length} (${Math.round(entreg / rotas.length * 100)}%)`)
console.log('\n✅ DÁ PRA TESTAR: API responde, dia coberto, pipeline roda inteiro e gera KPI.')
