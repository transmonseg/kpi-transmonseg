import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { parseEscalaGeral } from '../../src/lib/parsers/escala-geral.ts'
import { parseUnitrac } from '../../src/lib/parsers/unitrac.ts'
import { cruzaEscalaUnitrac } from '../../src/lib/kpi/matcher.ts'

const ROOT = 'C:/Users/media/Downloads/dia 19'
const geralBuf = await readFile(`${ROOT}/ESCALA GERAL DE MAIO 1 (6).xlsx`)
const unitracBuf = await readFile(`${ROOT}/relatorio_9521.xlsx`)

const linhas = await parseEscalaGeral(geralBuf.buffer.slice(geralBuf.byteOffset, geralBuf.byteOffset + geralBuf.byteLength), '2026-05-19')
const veiculos = await parseUnitrac(unitracBuf.buffer.slice(unitracBuf.byteOffset, unitracBuf.byteOffset + unitracBuf.byteLength))

const placa = 'AKZ2594'
const v = veiculos.find(x => x.placa_norm === placa)
console.log(`\nPlaca ${placa}: ${v?.paradas.length ?? 0} paradas`)
for (const p of v?.paradas ?? []) {
  console.log(`  ${p.classificacao.padEnd(10)} ${(p.nome_loja ?? p.local_parada ?? '').slice(0,50).padEnd(50)} cod=${p.codigo_loja ?? '—'}`)
}

const linhasAssaiP = linhas.filter(l => l.placa_norm === placa)
console.log(`\nEscala (linhas com essa placa): ${linhasAssaiP.length}`)
for (const l of linhasAssaiP) {
  console.log(`  ${l.rede_id.padEnd(15)} ${l.loja_nome_raw}`)
}

const escalaRows = linhas.map((l, i) => ({
  id: `esc-${i}`, rede_id: l.rede_id, placa_norm: l.placa_norm || null,
  loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw,
  motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega,
}))
const paradaRows = veiculos.flatMap((v, vi) => v.paradas.map((p, pi) => ({
  id: `par-${vi}-${pi}`, placa_norm: p.placa_norm,
  chegada: p.chegada.toISOString(), saida: p.saida.toISOString(),
  duracao_seg: p.duracao_seg, local_parada: p.local_parada,
  codigo_loja: p.codigo_loja, nome_loja: p.nome_loja,
  lat: p.lat, lng: p.lng, classificacao: p.classificacao, ordem: p.ordem,
})))

const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: lojasRaw } = await svc.from('lojas').select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros').eq('ativo', true)
const lojas = (lojasRaw ?? []).map(l => ({ ...l, raio_metros: l.raio_metros ?? 150 }))

const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas, svc, [])

console.log('\nResultado para essa placa:')
for (const rota of rotas) {
  const e = escalaRows.find(x => x.id === rota.escala_linha_id)
  if (!e || e.placa_norm !== placa) continue
  const p0 = rota.paradas[0]
  console.log(`  ${e.loja_nome_raw}`)
  console.log(`    Parada: ${p0 ? `${p0.nome.slice(0,50)} CHD=${p0.chegada.toISOString()} (tempo ${p0.duracao_min}min)` : 'SEM PARADA'}`)
  console.log(`    _matchMeta: ${JSON.stringify(rota._matchMeta)}`)
}
