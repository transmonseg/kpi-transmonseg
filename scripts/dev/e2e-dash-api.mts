import { config } from 'dotenv'; config({ path: '.env.local' })
import { createServiceClient } from '../../src/lib/supabase/service.ts'
import { gerarDiaApi, salvarDiaApi, carregarEntradasApi } from '../../src/lib/kpi/dashboard-api-fonte.ts'
import { calcularMetricas } from '../../src/lib/kpi/dashboard-metricas.ts'
const svc = createServiceClient()
const data = process.argv[2] ?? '2026-06-12'
// escala persistida do dia
const { data: ups } = await svc.from('escala_uploads').select('id').eq('data_escala', data)
const ids = (ups ?? []).map((u: any) => u.id)
const { data: rows } = await svc.from('escala_linhas').select('rede_id,loja_nome_raw,loja_codigo_raw,placa_norm,motorista_nome,carro_ordem,data_entrega').in('escala_upload_id', ids)
const escala = (rows ?? []).map((r: any) => ({ ...r, placa_norm: r.placa_norm || null }))
console.log(`escala do dia: ${escala.length} linhas`)
const [lojasRes, canonRes] = await Promise.all([
  svc.from('lojas').select('id,rede_id,nome,nome_normalizado,codigo_escala,codigo_unitrac,nome_unitrac,lat,lng,raio_metros,endereco,bairro,municipio,numero').eq('ativo', true).order('id'),
  svc.from('canonical_loja').select('id,name,lat,lng,raio_metros').not('lat','is',null).not('lng','is',null),
])
const lojas = (lojasRes.data ?? []).map((l: any) => ({ ...l, raio_metros: l.raio_metros ?? 150 }))
const geo = (canonRes.data ?? []).map((c: any) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, raio_metros: c.raio_metros ?? 150 }))
const ent = await gerarDiaApi(svc as any, data, escala as any, lojas as any, geo as any)
await salvarDiaApi(svc as any, data, ent)
const lido = await carregarEntradasApi(svc as any, data, data)
console.log(`gerado: ${ent.length} | relido do bucket: ${lido.length}`)
console.log('métricas:', JSON.stringify(calcularMetricas(lido)).slice(0, 400))
