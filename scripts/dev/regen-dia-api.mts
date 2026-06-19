// Regera UM dia pela fonte da API (gerarDiaApi), que agora computa e salva o resumo
// de risco (paradas indevidas). Uso: DIA=2026-06-16 npx tsx scripts/dev/regen-dia-api.mts
import { config } from 'dotenv'; config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { gerarDiaApi, salvarDiaApi, carregarResumosApi, type EscalaParaDia } from '@/lib/kpi/dashboard-api-fonte'
import type { LojaRow, GeoStore } from '@/lib/kpi/matcher'

const DIA = process.env.DIA || '2026-06-16'
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

// escala do dia (DB)
const { data: ups } = await svc.from('escala_uploads').select('id').eq('data_escala', DIA)
const ids = (ups ?? []).map((u: any) => u.id)
const { data: rows } = await svc.from('escala_linhas')
  .select('rede_id, loja_nome_raw, loja_codigo_raw, placa_norm, motorista_nome, carro_ordem, data_entrega')
  .in('escala_upload_id', ids)
const escala: EscalaParaDia[] = (rows ?? []).map((r: any) => ({
  rede_id: r.rede_id, placa_norm: r.placa_norm || null, loja_nome_raw: r.loja_nome_raw,
  loja_codigo_raw: r.loja_codigo_raw, motorista_nome: r.motorista_nome, carro_ordem: r.carro_ordem ?? 1,
  data_entrega: r.data_entrega ?? DIA,
}))
console.log(`escala ${DIA}: ${escala.length} linhas`)
if (!escala.length) { console.log('sem escala no DB pra esse dia'); process.exit(0) }

// cadastro
const [lojasRes, canonRes] = await Promise.all([
  svc.from('lojas').select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, endereco, bairro, municipio, numero').eq('ativo', true),
  svc.from('canonical_loja').select('id, name, lat, lng, raio_metros').not('lat', 'is', null).not('lng', 'is', null),
])
const lojas = (lojasRes.data ?? []).map((l: any) => ({ ...l, raio_metros: l.raio_metros ?? 150 })) as LojaRow[]
const geoStores = (canonRes.data ?? []).map((c: any) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, raio_metros: c.raio_metros ?? 150 })) as GeoStore[]

console.log('chamando gerarDiaApi (API ao vivo)...')
const entradas = await gerarDiaApi(svc, DIA, escala, lojas, geoStores)
await salvarDiaApi(svc, DIA, entradas)
const resumo = await carregarResumosApi(svc, DIA, DIA)
console.log(`OK: ${entradas.length} entradas, ${entradas.filter(e => e.status === 'entregue').length} entregues`)
console.log(`PARADAS INDEVIDAS: ${resumo.paradasIndevidas}`)
for (const p of resumo.topIndevidas.slice(0, 8)) console.log(`   ${p.placa}  ${p.hora}  ${p.duracaoMin}min  ${p.local}`)
process.exit(0)
