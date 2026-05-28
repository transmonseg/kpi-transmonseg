import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

// Placas que tinham 2+ lojas simultâneas no Unitrac dia 19
const PLACAS = ['EYL8B91', 'KNC5J75', 'KNS8D26', 'KVI9088', 'KVT5427', 'KWH2J02', 'LNU7H38', 'QSW3B65', 'TML7D61', 'TML6D96', 'UBO5E01']

async function main() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  for (const placa of PLACAS) {
    const { data } = await svc.from('escala_linhas')
      .select('rede_id, loja_nome_raw, motorista_nome, carro_ordem')
      .eq('data_entrega', '2026-05-19')
      .eq('placa_norm', placa)
      .order('carro_ordem')
    console.log(`\n========= ${placa} =========`)
    console.log('ESCALA dia 19:')
    for (const l of data ?? []) console.log(`  [${l.rede_id}] ${l.loja_nome_raw}  mot=${l.motorista_nome} carro=${l.carro_ordem}`)
  }
}
main()
