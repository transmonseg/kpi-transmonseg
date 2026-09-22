// Cadastro manual de coordenada pro cache do KPI (kpi_romaneio_geocode_cache)
// -- pedido do usuario 08/09: endereco que a cascata automatica (CNEFE/OSM/
// Nominatim) nunca vai achar (rua sem CNEFE, endereco corrompido no romaneio
// de origem, etc) precisa de um jeito de registrar a coordenada certa na mao,
// pra nao ficar "sem geocode" pra sempre. Chave EXATA (normalizarEndereco:
// so' trim+uppercase) -- geocode.ts (buscarNoCache/salvarNoCache) NAO
// normaliza nada, usa a string crua que parse-romaneio.ts produz (que as
// vezes tem espaco duplo, ex. campo vazio concatenado). Por isso aqui
// tambem nao pode colapsar espaco interno: colapsar geraria uma chave
// diferente da que a geracao real le, e a correcao manual viraria uma
// linha orfa nunca vista (achado real 22/09).
//
// Uso:
//   npx tsx --env-file=.env.local scripts/cadastrar-endereco-manual.ts \
//     "ENDERECO EXATO COMO APARECE NO ROMANEIO" <lat> <lng>
import { createServiceClient } from '../src/lib/supabase/service'

export function normalizarEndereco(enderecoBruto: string): string {
  return enderecoBruto.trim().toUpperCase()
}

/** Payload do upsert -- extraido pra funcao pura testavel sem rede.
 *  Fix 12/09 (revisao pos-guarda territorial): um humano digitando lat/lng
 *  na mao ESTA acima da guarda automatica (src/lib/territorio.ts, monitoramento)
 *  -- e' exatamente o sinal que a flag confiavel/motivo deveria respeitar.
 *  Sem isso, corrigir um endereco marcado bairro_divergente/municipio_divergente
 *  deixava confiavel=false e motivo preenchido pra sempre, e o relatorio
 *  continuava imprimindo "COORDENADA CAIU EM OUTRO BAIRRO - CONFERIR CADASTRO"
 *  sobre um ponto ja correto. */
export function montarPayloadCadastroManual(enderecoBruto: string, lat: number, lng: number) {
  return { endereco: normalizarEndereco(enderecoBruto), lat, lng, confiavel: true, motivo: null as null }
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
  const payload = montarPayloadCadastroManual(enderecoBruto, lat, lng)
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('kpi_romaneio_geocode_cache')
    .upsert(payload, { onConflict: 'endereco' })
  if (error) {
    console.error('Erro ao gravar:', error.message)
    process.exit(1)
  }
  console.log(`Cadastrado: "${payload.endereco}" -> ${lat},${lng}`)
}

if (process.env.VITEST !== 'true') {
  main().catch(e => { console.error(e); process.exit(1) })
}
