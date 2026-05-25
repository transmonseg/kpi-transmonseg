/**
 * Sprint A5 — Validação do cadastro pós-Sprint A1+A2.
 *
 * Métricas-alvo:
 *   - codigo_unitrac coverage ≥ 90%
 *   - nome_unitrac coverage ≥ 80%
 *   - 0 lojas ativas sem lat/lng
 *   - 0 lojas com raio_metros inválido (< 5 ou > 500)
 *   - 0 colisões: nenhum par de lojas a < 50m sem aliases configurados
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { ROTAS_GIGANTES_UNITRAC } from '../../src/lib/kpi/rotas-gigantes'
import { VEICULOS_INATIVOS } from '../../src/lib/kpi/veiculos-inativos'

interface Loja {
  id: string
  rede_id: string
  nome: string
  codigo_unitrac: string | null
  nome_unitrac: string | null
  lat: number | null
  lng: number | null
  raio_metros: number | null
  ativo: boolean
}

function haversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

async function main() {
  console.log('=== VALIDAÇÃO CADASTRO PÓS-SPRINT A ===\n')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data: lojas } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, ativo')
    .eq('ativo', true)
  const ativas = (lojas ?? []) as Loja[]

  const total = ativas.length
  const semCodigo = ativas.filter(l => !l.codigo_unitrac).length
  const semNome = ativas.filter(l => !l.nome_unitrac).length
  const semLat = ativas.filter(l => l.lat == null).length
  const raioRuim = ativas.filter(l => l.raio_metros == null || l.raio_metros < 5 || l.raio_metros > 500).length

  console.log(`Total lojas ativas: ${total}`)
  console.log(`  Sem codigo_unitrac: ${semCodigo} (${((semCodigo / total) * 100).toFixed(0)}%)`)
  console.log(`  Sem nome_unitrac:   ${semNome} (${((semNome / total) * 100).toFixed(0)}%)`)
  console.log(`  Sem lat:            ${semLat}`)
  console.log(`  Raio inválido:      ${raioRuim}`)

  // Detectar colisões (< 50m)
  const colisoes: Array<{ a: Loja; b: Loja; dist: number }> = []
  for (let i = 0; i < ativas.length; i++) {
    for (let j = i + 1; j < ativas.length; j++) {
      const a = ativas[i]
      const b = ativas[j]
      if (a.lat == null || b.lat == null) continue
      const d = haversineMetros(a.lat!, a.lng!, b.lat!, b.lng!)
      if (d < 50) colisoes.push({ a, b, dist: d })
    }
  }
  console.log(`\nColisões < 50m: ${colisoes.length}`)
  for (const c of colisoes.slice(0, 20)) {
    console.log(`  ${c.dist.toFixed(0)}m  ${c.a.rede_id} "${c.a.nome}" <-> ${c.b.rede_id} "${c.b.nome}"`)
  }

  // Cobertura ROTAS_GIGANTES (não deveriam estar como lojas)
  const lojasEmRotaGigante = ativas.filter(l => l.codigo_unitrac && ROTAS_GIGANTES_UNITRAC.has(l.codigo_unitrac))
  console.log(`\nLojas com codigo_unitrac que é ROTA GIGANTE: ${lojasEmRotaGigante.length}`)
  for (const l of lojasEmRotaGigante) console.log(`  ${l.codigo_unitrac} | ${l.rede_id} | ${l.nome}`)

  // Métricas-alvo
  console.log('\n=== Métricas-alvo ===')
  const covCodigo = ((total - semCodigo) / total) * 100
  const covNome = ((total - semNome) / total) * 100
  const status = (ok: boolean) => ok ? '✓' : '✗'
  console.log(`${status(covCodigo >= 90)} codigo_unitrac coverage: ${covCodigo.toFixed(1)}% (alvo ≥ 90%)`)
  console.log(`${status(covNome >= 80)} nome_unitrac coverage:   ${covNome.toFixed(1)}% (alvo ≥ 80%)`)
  console.log(`${status(semLat === 0)} 0 lojas sem lat/lng:     ${semLat}`)
  console.log(`${status(raioRuim === 0)} 0 lojas com raio ruim:   ${raioRuim}`)
  console.log(`${status(colisoes.length === 0)} 0 colisões < 50m:        ${colisoes.length}`)

  console.log('\n=== Listas auxiliares (V2.1) ===')
  console.log(`Rotas gigantes:    ${ROTAS_GIGANTES_UNITRAC.size}`)
  console.log(`Veículos inativos: ${VEICULOS_INATIVOS.size}`)

  // Salvar relatório
  mkdirSync('docs/correcao-sistema', { recursive: true })
  const md = [
    '# Validação cadastro pós-Sprint A',
    '',
    `Data: ${new Date().toISOString()}`,
    '',
    `## Métricas`,
    '',
    `- Total lojas ativas: **${total}**`,
    `- Sem codigo_unitrac: ${semCodigo} (${((semCodigo / total) * 100).toFixed(1)}%)`,
    `- Sem nome_unitrac:   ${semNome} (${((semNome / total) * 100).toFixed(1)}%)`,
    `- Sem lat/lng:        ${semLat}`,
    `- Raio inválido:      ${raioRuim}`,
    `- Colisões < 50m:     ${colisoes.length}`,
    `- Rotas gigantes (lib): ${ROTAS_GIGANTES_UNITRAC.size}`,
    `- Veículos inativos (lib): ${VEICULOS_INATIVOS.size}`,
    '',
    `## Cobertura`,
    '',
    `| Métrica | Atual | Alvo | OK |`,
    `|---------|-------|------|-----|`,
    `| codigo_unitrac | ${covCodigo.toFixed(1)}% | ≥ 90% | ${covCodigo >= 90 ? '✓' : '✗'} |`,
    `| nome_unitrac   | ${covNome.toFixed(1)}% | ≥ 80% | ${covNome >= 80 ? '✓' : '✗'} |`,
    `| sem lat/lng    | ${semLat}   | 0    | ${semLat === 0 ? '✓' : '✗'} |`,
    `| raio inválido  | ${raioRuim}   | 0    | ${raioRuim === 0 ? '✓' : '✗'} |`,
    `| colisões <50m  | ${colisoes.length}   | 0    | ${colisoes.length === 0 ? '✓' : '✗'} |`,
    '',
  ]
  if (colisoes.length > 0) {
    md.push('## Colisões detectadas')
    md.push('')
    md.push('| Distância | Loja A | Loja B |')
    md.push('|-----------|--------|--------|')
    for (const c of colisoes) {
      md.push(`| ${c.dist.toFixed(0)}m | ${c.a.rede_id} "${c.a.nome}" | ${c.b.rede_id} "${c.b.nome}" |`)
    }
  }
  writeFileSync('docs/correcao-sistema/validacao-pos-sprint-A.md', md.join('\n'), 'utf8')
  console.log('\nRelatório salvo: docs/correcao-sistema/validacao-pos-sprint-A.md')
}

main().catch(e => { console.error(e); process.exit(1) })
