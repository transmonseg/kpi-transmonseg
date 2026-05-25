/**
 * Cadastra lojas faltantes detectadas na auditoria de unmatched.
 *
 * Lat/lng aproximadas por bairro (Google Maps). Raio 300m generoso pra
 * matching geo cobrir GPS drift. Tia preenche manual se nome divergir.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

interface NovaLoja {
  rede_id: string
  nome: string
  lat: number
  lng: number
  raio_metros: number
  codigo_escala?: string
}

// Coordenadas aproximadas por bairro RJ
const LOJAS: NovaLoja[] = [
  // Sam's Club Barra (Av. Ayrton Senna, 6505 - Barra da Tijuca)
  { rede_id: 'SAMS_CLUB', nome: "Sam's Club Barra Ayrton Senna", lat: -22.9854, lng: -43.3942, raio_metros: 300 },

  // Prezunic SPID (lojas pequenas/express em vários bairros)
  { rede_id: 'PREZUNIC', nome: 'Prezunic SPID Jacarepagua', lat: -22.9534, lng: -43.3608, raio_metros: 300 },
  { rede_id: 'PREZUNIC', nome: 'Prezunic SPID Parque das Rosas', lat: -22.9900, lng: -43.3608, raio_metros: 300 },
  { rede_id: 'PREZUNIC', nome: 'Prezunic SPID Freguesia', lat: -22.9450, lng: -43.3460, raio_metros: 300 },

  // Prezunic Botafogo Serra Azul (Rua General Severiano - Botafogo)
  { rede_id: 'PREZUNIC', nome: 'Prezunic Botafogo Serra Azul', lat: -22.9520, lng: -43.1898, raio_metros: 300 },
]

async function main() {
  console.log(`=== CADASTRAR LOJAS FALTANTES ${APPLY ? '(APPLY)' : '(DRY-RUN)'} ===\n`)
  for (const l of LOJAS) {
    // Verifica se já existe loja com nome similar na rede
    const { data: existentes } = await supabase
      .from('lojas')
      .select('id, nome, ativo')
      .eq('rede_id', l.rede_id)
      .ilike('nome', `%${l.nome.split(' ').slice(-1)[0]}%`)
    const jaTem = (existentes ?? []).find(e => e.nome.toUpperCase().includes(l.nome.toUpperCase().split(' ').slice(-2).join(' ')))
    if (jaTem) { console.log(`  ⊘ "${l.nome}" — já existe: "${jaTem.nome}"`); continue }
    console.log(`  + [${l.rede_id}] "${l.nome}" lat=${l.lat} lng=${l.lng} raio=${l.raio_metros}m`)
    if (!APPLY) continue
    const { error } = await supabase.from('lojas').insert({
      rede_id: l.rede_id,
      nome: l.nome,
      lat: l.lat,
      lng: l.lng,
      raio_metros: l.raio_metros,
      ativo: true,
      codigo_escala: l.codigo_escala ?? null,
    })
    if (error) console.error(`    ✗ ${error.message}`)
    else console.log(`    ✓ cadastrada`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
