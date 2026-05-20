import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { parseEscalaGeral } from '../../src/lib/parsers/escala-geral.ts'
import { parseUnitrac } from '../../src/lib/parsers/unitrac.ts'

const gBuf = await readFile('C:/Users/media/Downloads/dia 19/ESCALA GERAL DE MAIO 1 (6).xlsx')
const uBuf = await readFile('C:/Users/media/Downloads/dia 19/relatorio_9521.xlsx')

const linhas = await parseEscalaGeral(gBuf.buffer.slice(gBuf.byteOffset, gBuf.byteOffset + gBuf.byteLength), '2026-05-19')
const veiculos = await parseUnitrac(uBuf.buffer.slice(uBuf.byteOffset, uBuf.byteOffset + uBuf.byteLength))

// Encontra Prezunic Pechincha e descubre placa
const pech = linhas.find(l => l.rede_id === 'PREZUNIC' && l.loja_nome_raw.toLowerCase().includes('pechincha'))
console.log('Pechincha:', pech?.placa_norm, pech?.loja_nome_raw)

if (pech?.placa_norm) {
  // Outras linhas dessa placa
  const sameP = linhas.filter(l => l.placa_norm === pech.placa_norm)
  console.log(`\nOutras linhas com placa ${pech.placa_norm}:`)
  for (const l of sameP) console.log(`  [${l.rede_id}] ${l.loja_nome_raw}`)

  // Paradas Unitrac dessa placa
  const v = veiculos.find(x => x.placa_norm === pech.placa_norm)
  console.log(`\nParadas Unitrac ${pech.placa_norm}:`)
  for (const p of v?.paradas ?? []) {
    const h = d => d ? `${String((d.getUTCHours()-3+24)%24).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}` : '—'
    console.log(`  ${p.classificacao.padEnd(10)} ${h(p.chegada)}-${h(p.saida)} | cod=${p.codigo_loja ?? '—'} | ${(p.nome_loja ?? p.local_parada ?? '').slice(0,55)}`)
  }
}
