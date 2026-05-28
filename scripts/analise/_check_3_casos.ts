import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

async function main() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // 1. Cadastros Sachinho + ZS Loja 7/48
  console.log('=== ZS Loja 07 / 48 cadastro ===')
  const { data: zs } = await svc.from('lojas').select('id, nome, nome_normalizado, codigo_escala, codigo_unitrac, lat, lng, raio_metros, ativo').eq('rede_id', 'ZONA_SUL').or('codigo_escala.eq.7,codigo_escala.eq.07,codigo_escala.eq.48,codigo_unitrac.eq.9039007,codigo_unitrac.eq.9039148,nome.ilike.%loja 07%,nome.ilike.%loja 48%,nome.ilike.%leblon%')
  for (const l of zs ?? []) console.log(`  ${l.nome.padEnd(40)} cod_esc=${(l.codigo_escala ?? '').padEnd(8)} cod_uni=${(l.codigo_unitrac ?? '').padEnd(10)} ativo=${l.ativo}`)

  // 2. MERCEARIA SACHINHO cadastro vs Unitrac
  console.log('\n=== Sachinho cadastro ===')
  const { data: sach } = await svc.from('lojas').select('*').or('nome.ilike.%sachinho%')
  for (const l of sach ?? []) console.log(`  [${l.rede_id}] ${l.nome.padEnd(40)} cod=${l.codigo_unitrac ?? ''} lat=${l.lat} lng=${l.lng} raio=${l.raio_metros}`)

  console.log('\n=== KXA5966 paradas LOJA (Sachinho candidato) ===')
  const veiculos = await parseUnitracPdf(readFileSync('docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'), null)
  const kxa = veiculos.find(v => v.placa_norm === 'KXA5966')
  if (kxa) {
    for (const p of kxa.paradas.filter(p => p.classificacao === 'LOJA')) {
      console.log(`  ${p.chegada.toISOString().slice(11,16)} → ${p.saida.toISOString().slice(11,16)} cod=${p.codigo_loja} nome=${p.nome_loja} lat=${p.lat} lng=${p.lng}`)
    }
  }

  // 3. KWK4593 paradas
  console.log('\n=== KWK4593 (ZS Loja 07 RODRIGO) paradas LOJA ===')
  const kwk = veiculos.find(v => v.placa_norm === 'KWK4593')
  if (kwk) {
    for (const p of kwk.paradas.filter(p => p.classificacao === 'LOJA')) {
      console.log(`  ${p.chegada.toISOString().slice(11,16)} → ${p.saida.toISOString().slice(11,16)} cod=${p.codigo_loja} nome=${p.nome_loja}`)
    }
  }

  // 4. BBH1C94 paradas
  console.log('\n=== BBH1C94 (ZS Loja 48 JOSUE) paradas LOJA ===')
  const bbh = veiculos.find(v => v.placa_norm === 'BBH1C94')
  if (bbh) {
    for (const p of bbh.paradas.filter(p => p.classificacao === 'LOJA')) {
      console.log(`  ${p.chegada.toISOString().slice(11,16)} → ${p.saida.toISOString().slice(11,16)} cod=${p.codigo_loja} nome=${p.nome_loja}`)
    }
  }
}
main()
