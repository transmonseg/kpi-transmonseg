import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

async function main() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: cab } = await svc.from('lojas').select('*').eq('codigo_unitrac', '7012010')
  console.log('Cadastro cod_unitrac=7012010:')
  console.log(cab)
  const veiculos = await parseUnitracPdf(readFileSync('docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'), null)
  const knsv = veiculos.find(v => v.placa_norm === 'KNS8D26')
  if (knsv) {
    console.log('\nParadas KNS8D26 cod=7012010:')
    for (const p of knsv.paradas.filter(p => p.codigo_loja === '7012010')) {
      const cadLat = -22.68627, cadLng = -43.29147
      const dLat = (p.lat! - cadLat) * 111000
      const dLng = (p.lng! - cadLng) * 100000
      const dist = Math.sqrt(dLat*dLat + dLng*dLng)
      console.log(`  ${p.chegada.toISOString().slice(11,16)} lat=${p.lat} lng=${p.lng} dist=${Math.round(dist)}m`)
    }
    console.log('\nTODAS as paradas LOJA KNS8D26:')
    for (const p of knsv.paradas.filter(p => p.classificacao === 'LOJA')) {
      console.log(`  ${p.chegada.toISOString().slice(11,16)} → ${p.saida.toISOString().slice(11,16)} cod=${p.codigo_loja} nome=${p.nome_loja}`)
    }
  }
}
main()
