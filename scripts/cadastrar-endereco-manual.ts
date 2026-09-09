// Cadastro manual de coordenada pro cache do KPI (kpi_romaneio_geocode_cache)
// -- pedido do usuario 08/09: endereco que a cascata automatica (CNEFE/OSM/
// Nominatim) nunca vai achar (rua sem CNEFE, endereco corrompido no romaneio
// de origem, etc) precisa de um jeito de registrar a coordenada certa na mao,
// pra nao ficar "sem geocode" pra sempre. Chave EXATA (normalizarEndereco:
// trim+uppercase+colapsa espaco) -- mesma logica de buscarNoCache/
// salvarNoCache em geocode.ts, so' que escrito por fora da cascata.
//
// Uso:
//   npx tsx --env-file=.env.local scripts/cadastrar-endereco-manual.ts \
//     "ENDERECO EXATO COMO APARECE NO ROMANEIO" <lat> <lng>
import { createServiceClient } from '../src/lib/supabase/service'

function normalizarEndereco(enderecoBruto: string): string {
  return enderecoBruto.trim().toUpperCase().replace(/\s+/g, ' ')
}

async function main() {
  const [enderecoBruto, latStr, lngStr] = process.argv.slice(2)
  if (!enderecoBruto || !latStr || !lngStr) {
    console.error('Uso: npx tsx --env-file=.env.local scripts/cadastrar-endereco-manual.ts "ENDERECO" <lat> <lng>')
    process.exit(1)
  }
  const lat = Number(latStr)
  const lng = Number(lngStr)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.error('lat/lng invalidos')
    process.exit(1)
  }
  const endereco = normalizarEndereco(enderecoBruto)
  const supabase = createServiceClient()
  const { error } = await supabase.from('kpi_romaneio_geocode_cache').upsert({ endereco, lat, lng }, { onConflict: 'endereco' })
  if (error) {
    console.error('Erro ao gravar:', error.message)
    process.exit(1)
  }
  console.log(`Cadastrado: "${endereco}" -> ${lat},${lng}`)
}

main().catch(e => { console.error(e); process.exit(1) })
