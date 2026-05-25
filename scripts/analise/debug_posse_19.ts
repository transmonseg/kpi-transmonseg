import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'

function fmt(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return String(dt.getUTCHours()).padStart(2,'0') + ':' + String(dt.getUTCMinutes()).padStart(2,'0')
}

;(async () => {
  const escala = await parseEscalaArmazemGrao(readFileSync(BASE + '/ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx'), '2026-05-19')
  const armazem = escala.filter(l => l.rede_id === 'ARMAZEM_GRAO')
  const xlsx = await parseUnitrac(readFileSync(BASE + '/relatorio_9391.xlsx'))
  const pdf = await parseUnitracPdf(readFileSync(BASE + '/relatorio_9572.pdf'), new Set()).catch(() => [])
  const veiculos = new Map<string, any>()
  for (const v of xlsx) veiculos.set(v.placa_norm, v)
  for (const v of pdf) if (!veiculos.has(v.placa_norm)) veiculos.set(v.placa_norm, v)
  const todas = Array.from(veiculos.values()).flatMap(v => v.paradas)

  const placaTML9I75 = todas.filter(p => p.placa_norm === 'TML9I75').sort((a, b) => +new Date(a.chegada) - +new Date(b.chegada))
  console.log('TML9I75 (ANTUNES — BOA VISTA + MATRIZ POSSE) — todas paradas:')
  for (const p of placaTML9I75) {
    const dur = p.duracao_seg ? Math.round(p.duracao_seg/60) + 'min' : '?'
    console.log(`  [${p.classificacao.padEnd(10)}] ${fmt(p.chegada)}-${fmt(p.saida)} (${dur.padStart(6)})  cod=${(p.codigo_loja ?? '-').padEnd(10)} lat=${p.lat ?? '?'} lng=${p.lng ?? '?'} | ${(p.local_parada ?? '').slice(0,55)}`)
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: lojas } = await sb.from('lojas').select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros').eq('ativo', true)

  const escRow = armazem.map((l, i) => ({
    id: 'e' + i, rede_id: l.rede_id, placa_norm: l.placa_norm,
    loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw,
    motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem,
    data_entrega: l.data_entrega, sub_rede: l.sub_rede ?? null,
  }))
  const pRow = todas.map((p, i) => ({
    id: 'p' + i, placa_norm: p.placa_norm,
    chegada: p.chegada instanceof Date ? p.chegada.toISOString() : String(p.chegada),
    saida: p.saida instanceof Date ? p.saida.toISOString() : (p.saida ? String(p.saida) : null),
    duracao_seg: p.duracao_seg ?? null,
    local_parada: p.local_parada ?? '',
    codigo_loja: p.codigo_loja ?? null, nome_loja: p.nome_loja ?? null,
    lat: p.lat ?? null, lng: p.lng ?? null,
    classificacao: p.classificacao, ordem: p.ordem,
  }))

  const rotas = await cruzaEscalaUnitrac(escRow, pRow, lojas ?? [])
  console.log('\nRotas TML9I75 (raw JSON):')
  for (const r of rotas) {
    const e = escRow.find(x => x.id === r.escala_linha_id)!
    if (e.placa_norm !== 'TML9I75') continue
    console.log(`\n${e.loja_nome_raw}:`)
    console.log(JSON.stringify(r, null, 2).slice(0, 2000))
    // Encontra parada original
    for (const p of r.paradas) {
      const raw = pRow.find(rp => rp.id === p.parada_id)
      console.log(`  parada_id=${p.parada_id}: placa=${raw?.placa_norm} cod=${raw?.codigo_loja} lat=${raw?.lat} lng=${raw?.lng} class=${raw?.classificacao}`)
      console.log(`    local_parada="${raw?.local_parada}"`)
    }
  }
})()
