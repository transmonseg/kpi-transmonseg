/**
 * Cadastra/corrige TODAS as lojas problemáticas identificadas na análise
 * de 3 dias (19/20/25) cruzando GPS Unitrac com cadastros do banco.
 *
 * 14 INSERTs (lojas não cadastradas) + 14 UPDATEs (cadastro distante/errado)
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

type Insert = {
  codigo_unitrac: string
  nome: string
  rede_id: string
  lat: number
  lng: number
  raio_metros?: number
  nome_unitrac?: string
}

type Update = {
  codigo_unitrac: string
  patch: Partial<{ lat: number; lng: number; raio_metros: number; rede_id: string; nome: string; ativo: boolean }>
  reason: string
}

// INSERTS — lojas não cadastradas (lat/lng do GPS médio Unitrac dos 3 dias)
const INSERTS: Insert[] = [
  { codigo_unitrac: '17659004', nome: 'EMANUEL REDE ECONOMIA SANTA MARIA', rede_id: 'EMANUEL', lat: -22.8289, lng: -43.4565, raio_metros: 5000, nome_unitrac: 'REDE ECONOMIA SANTA MARIA' },
  { codigo_unitrac: '13156084', nome: 'SENDAS MATRIZ CD DUQUE',           rede_id: 'SENDAS',  lat: -22.8088, lng: -43.3158, raio_metros: 1500, nome_unitrac: 'MATRIZ CD DUQUE' },
  { codigo_unitrac: '25414000', nome: 'NATURCON GELADOS',                 rede_id: 'SUPERPRIX', lat: -22.8229, lng: -43.2242, raio_metros: 5000, nome_unitrac: 'NATURCON GELADOS' },
  { codigo_unitrac: '131000',   nome: 'REAL DE EDEN BARROS FILHO',        rede_id: 'SENDAS',  lat: -22.8278, lng: -43.3392, raio_metros: 300, nome_unitrac: 'REAL DE ÉDEN BARROS FILHO' },
  { codigo_unitrac: '21468000', nome: 'EMANUEL JARDIM MARAVILHA',         rede_id: 'EMANUEL', lat: -22.8270, lng: -43.3063, raio_metros: 1000, nome_unitrac: 'EMANUEL JARDIM MARAVILHA' },
  { codigo_unitrac: '9039023',  nome: 'ZONA SUL LOJA 23 - BARRA DA TIJUCA', rede_id: 'ZONA_SUL', lat: -23.0124, lng: -43.3114, raio_metros: 200, nome_unitrac: '23 - ZONA SUL - BARRA DA TIJUCA' },
  { codigo_unitrac: '9039117',  nome: 'ZONA SUL LOJA 44 - BARRA OLEGARIO', rede_id: 'ZONA_SUL', lat: -23.0120, lng: -43.3054, raio_metros: 200, nome_unitrac: '44 - ZONA SUL - BARRA OLEGARIO' },
  { codigo_unitrac: '9039026',  nome: 'ZONA SUL LOJA 26 - COPACABANA',    rede_id: 'ZONA_SUL', lat: -22.9698, lng: -43.1853, raio_metros: 200, nome_unitrac: '26 - ZONA SUL - COPACABANA' },
  { codigo_unitrac: '9039114',  nome: 'ZONA SUL LOJA 34 - BARRA DA TIJUCA', rede_id: 'ZONA_SUL', lat: -22.9994, lng: -43.3997, raio_metros: 200, nome_unitrac: '34 - ZONA SUL - BARRA DA TIJUCA' },
  { codigo_unitrac: '71029',    nome: 'GUANABARA 29 - SAO JOAO DE MERITI', rede_id: 'GUANABARA', lat: -22.8030, lng: -43.3680, raio_metros: 200, nome_unitrac: 'GB 29 - SÃO JOÃO DE MERITI' },
  { codigo_unitrac: '113194',   nome: 'MUNDIAL RIACHUELO',                rede_id: 'MUNDIAL', lat: -22.9137, lng: -43.1875, raio_metros: 200, nome_unitrac: 'MUNDIAL RIACHUELO' },
  { codigo_unitrac: '113918',   nome: 'MUNDIAL ERICO VERISSIMO',          rede_id: 'MUNDIAL', lat: -23.0099, lng: -43.3064, raio_metros: 200, nome_unitrac: 'MUNDIAL ERICO VERISSIMO' },
  { codigo_unitrac: '2018023',  nome: 'ROTA JANEIRO',                     rede_id: 'DESCONHECIDO', lat: -22.8287, lng: -43.3421, raio_metros: 500, nome_unitrac: 'ROTA JANEIRO' },
  { codigo_unitrac: '2018007',  nome: 'ROTA CANTAGALO',                   rede_id: 'DESCONHECIDO', lat: -21.9121, lng: -42.2614, raio_metros: 1000, nome_unitrac: 'ROTA CANTAGALO' },
]

// UPDATES — cadastros com lat/lng errado, rede errada ou raio absurdo
const UPDATES: Update[] = [
  // Famílias com geofence em BASE Benassi — corrigir pra coords reais (GPS médio)
  { codigo_unitrac: '17659000', patch: { lat: -22.9119, lng: -43.6533, raio_metros: 5000 }, reason: 'O BOM ATACADISTA: cadastro estava em BASE Benassi, GPS spread 134km' },
  { codigo_unitrac: '17659001', patch: { lat: -22.9131, lng: -43.4420, raio_metros: 3000 }, reason: 'O BOM CAMPO GRANDE: cadastro distante 14km da realidade' },
  { codigo_unitrac: '17659002', patch: { lat: -22.8895, lng: -43.4737, raio_metros: 3000 }, reason: 'EMANUEL CACHAMORRA: cadastro distante 16km' },
  { codigo_unitrac: '17659003', patch: { lat: -22.8852, lng: -43.4370, raio_metros: 3000 }, reason: 'EMANUEL VARGEM GRANDE: cadastro distante 12km' },
  { codigo_unitrac: '25140000', patch: { lat: -22.8563, lng: -43.5011, raio_metros: 3000 }, reason: 'EMANUEL REDE ECONOMIA SANTA MARIA: cadastro distante 17km' },

  // Lojas isoladas com cadastro distante
  { codigo_unitrac: '6018000',  patch: { lat: -22.8365, lng: -43.2647, raio_metros: 500 }, reason: 'MEGA BOX OLARIA: cadastro distante 18km (corrigir pra Av Brasil 9561)' },
  { codigo_unitrac: '6018001',  patch: { lat: -23.0068, lng: -43.4438, raio_metros: 500 }, reason: 'MEGA BOX 2 RECREIO: cadastro distante 19km' },
  { codigo_unitrac: '4568001',  patch: { lat: -22.8570, lng: -43.1021, raio_metros: 500 }, reason: 'SAMS NITEROI: cadastro distante 26km' },
  { codigo_unitrac: '4568002',  patch: { lat: -22.8831, lng: -43.2800, raio_metros: 500 }, reason: 'SAMS LINHA AMARELA: cadastro distante 7km' },
  { codigo_unitrac: '9039124',  patch: { lat: -22.9145, lng: -43.3093, raio_metros: 300 }, reason: 'ZS L47: cadastro distante 14km' },

  // Família REGINA — cod compartilhado entre múltiplas lojas (cadastro Petrópolis, GPS RJ)
  { codigo_unitrac: '5353012',  patch: { lat: -22.7100, lng: -43.1700, raio_metros: 50000 }, reason: 'REGINA BARRA IMBUY: cod cobre N lojas REGINA da região (raio gigante temporário)' },
  { codigo_unitrac: '5353016',  patch: { lat: -22.8850, lng: -43.4031, raio_metros: 30000 }, reason: 'REGINA LUCIO MEIRA: cadastro 69km errado' },

  // Cadastros com rede errada
  { codigo_unitrac: '23080000', patch: { lat: -22.8851, lng: -43.4166, raio_metros: 3000, rede_id: 'FEIRA_NOVA', nome: 'FEIRA NOVA MERCADO SANTO AGOSTINHO' }, reason: 'Mercado Santo Agostinho: rede SENDAS errada (era FN), cadastro em BASE Benassi' },

  // CAB Petrópolis lat/lng aproximada
  { codigo_unitrac: '7012010',  patch: { lat: -22.6627, lng: -43.2512, raio_metros: 8000 }, reason: 'CAB PETROPOLIS: GPS spread 43km cobrindo região, ampliar raio' },
]

async function main() {
  console.log('=== INSERTs ===')
  for (const i of INSERTS) {
    // checa se já existe
    const { data: existing } = await sb.from('lojas').select('id').eq('codigo_unitrac', i.codigo_unitrac).maybeSingle()
    if (existing) {
      console.log(`  SKIP ${i.codigo_unitrac} ${i.nome} (já existe)`)
      continue
    }
    const row = {
      rede_id: i.rede_id,
      nome: i.nome,
      codigo_unitrac: i.codigo_unitrac,
      nome_unitrac: i.nome_unitrac ?? i.nome,
      lat: i.lat,
      lng: i.lng,
      raio_metros: i.raio_metros ?? 200,
      ativo: true,
    }
    const { error } = await sb.from('lojas').insert(row)
    if (error) console.log(`  ✗ ${i.codigo_unitrac} ${i.nome}: ${error.message}`)
    else console.log(`  ✓ INSERT ${i.codigo_unitrac} ${i.nome} [${i.rede_id}]`)
  }

  console.log('\n=== UPDATEs ===')
  for (const u of UPDATES) {
    const patch = { ...u.patch, updated_at: new Date().toISOString() }
    const { error, count } = await sb.from('lojas')
      .update(patch, { count: 'exact' })
      .eq('codigo_unitrac', u.codigo_unitrac)
    if (error) console.log(`  ✗ ${u.codigo_unitrac}: ${error.message}`)
    else if (count === 0) console.log(`  ⚠ ${u.codigo_unitrac}: nenhum registro alterado (${u.reason})`)
    else console.log(`  ✓ UPDATE ${u.codigo_unitrac} — ${u.reason}`)
  }

  console.log('\n=== Validação ===')
  const { data: lojas } = await sb.from('lojas').select('codigo_unitrac').not('codigo_unitrac', 'is', null)
  console.log(`  Total lojas cadastradas: ${lojas?.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
