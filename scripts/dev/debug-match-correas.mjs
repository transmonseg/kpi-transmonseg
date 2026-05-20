import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { parseEscalaArmazemGrao } from '../../src/lib/parsers/escala-armazem-grao.ts'
import { parseUnitrac } from '../../src/lib/parsers/unitrac.ts'
import { cruzaEscalaUnitrac } from '../../src/lib/kpi/matcher.ts'

const armazemBuf = await readFile('C:/Users/media/Downloads/dia 19/ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx')
const unitracBuf = await readFile('C:/Users/media/Downloads/dia 19/relatorio_9521.xlsx')

const linhas = await parseEscalaArmazemGrao(armazemBuf.buffer.slice(armazemBuf.byteOffset, armazemBuf.byteOffset + armazemBuf.byteLength), '2026-05-19')
const veiculos = await parseUnitrac(unitracBuf.buffer.slice(unitracBuf.byteOffset, unitracBuf.byteOffset + unitracBuf.byteLength))

console.log('Linhas da escala Armazém:')
for (const l of linhas) {
  console.log(`  ${l.loja_nome_raw.padEnd(35)} ${l.placa_norm ?? '—'}`)
}

const fmtBRT = d => d ? `${String((d.getUTCHours()-3+24)%24).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}` : '—'

const escalaRows = linhas.map((l, i) => ({
  id: `esc-${i}`,
  rede_id: l.rede_id,
  placa_norm: l.placa_norm || null,
  loja_nome_raw: l.loja_nome_raw,
  loja_codigo_raw: l.loja_codigo_raw,
  motorista_nome: l.motorista_nome,
  carro_ordem: l.carro_ordem,
  data_entrega: l.data_entrega,
}))

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

const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const lojasRes = await svc.from('lojas').select('*').eq('ativo', true).eq('rede_id', 'ARMAZEM_GRAO')
const lojas = (lojasRes.data ?? []).map(l => ({
  id: l.id, rede_id: l.rede_id, nome: l.nome ?? '', nome_normalizado: l.nome_normalizado ?? '',
  codigo_escala: l.codigo_escala, codigo_unitrac: l.codigo_unitrac, nome_unitrac: l.nome_unitrac,
  lat: l.lat, lng: l.lng, raio_metros: l.raio_metros ?? 150,
}))

const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas, svc, [])

console.log('\nResultado do matcher:')
for (const rota of rotas) {
  const esc = linhas[escalaRows.findIndex(e => e.id === rota.escala_linha_id)]
  if (esc.rede_id !== 'ARMAZEM_GRAO') continue
  const p0 = rota.paradas[0]
  console.log(`  ${esc.loja_nome_raw.padEnd(35)} ${rota.placa_norm ?? '—'}`)
  console.log(`    SCD: ${fmtBRT(rota.saida_cd)}`)
  if (p0) console.log(`    Parada: ${p0.nome.slice(0, 40).padEnd(40)} CHD ${fmtBRT(p0.chegada)} SAI ${fmtBRT(p0.saida)} tempo ${p0.duracao_min}min`)
  else console.log(`    Parada: SEM PARADA`)
}
