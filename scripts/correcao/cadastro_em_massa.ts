/**
 * Sprint A1 — Cadastro em massa das 234 LOJAS_INDIVIDUAIS extraídas do Unitrac.
 *
 * Estratégia:
 *   Pra cada código (loja individual) em lojas-no-unitrac.json:
 *     1. Busca por codigo_unitrac exato no cadastro → MATCH (atualiza lat/lng/nome_unitrac se faltarem)
 *     2. Busca por nome_normalizado similar (canonical) → CANDIDATO (atualiza codigo_unitrac)
 *     3. Busca por lat/lng < 150m → CANDIDATO_GEO (atualiza codigo_unitrac+nome_unitrac)
 *     4. Nenhuma das anteriores → CRIAR (cadastra nova loja com rede inferida pelo prefixo)
 *
 *   Dry-run gera docs/db-changes/<timestamp>-cadastro-em-massa-propostas.json com lista de ações.
 *   Apply (--apply) aplica as ações em ordem (atualizações primeiro, criações depois).
 *
 * Uso:
 *   npx tsx scripts/correcao/cadastro_em_massa.ts            # dry-run (default)
 *   npx tsx scripts/correcao/cadastro_em_massa.ts --apply    # aplica de verdade
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')

interface LojaUnitrac {
  codigo: string
  nome: string
  nomes_alternativos?: string[]
  classificacao: 'LOJA_INDIVIDUAL' | 'ROTA_GIGANTE'
  lat: number
  lng: number
  raio_metros: number
  paradas: number
  placas_distintas: number
  dias_distintos: number
}

interface LojaCadastro {
  id: string
  rede_id: string
  nome: string
  nome_normalizado: string
  codigo_escala: string | null
  codigo_unitrac: string | null
  nome_unitrac: string | null
  lat: number | null
  lng: number | null
  raio_metros: number | null
  ativo: boolean
}

interface Proposta {
  acao: 'UPDATE_CODIGO' | 'UPDATE_NOME' | 'UPDATE_GEO' | 'CRIAR' | 'IGNORAR'
  loja_unitrac: LojaUnitrac
  loja_cadastro?: LojaCadastro  // só quando UPDATE
  rede_inferida?: string
  motivo: string
  campos_a_alterar?: Partial<LojaCadastro>
}

// Mapa prefixo → rede_id no cadastro
function inferirRede(codigo: string, nome: string): string {
  if (codigo.startsWith('560')) return 'SENDAS'
  if (codigo.startsWith('9039')) return 'ZONA_SUL'
  if (codigo.startsWith('8590')) return 'PRINCESA'
  if (codigo.startsWith('7000')) return 'PREZUNIC'
  if (codigo.startsWith('579')) return 'FEIRA_NOVA'
  if (codigo.startsWith('202')) return 'SUPER_PAX'
  if (codigo.startsWith('71')) return 'GUANABARA'
  if (codigo.startsWith('9006')) return 'CARREFOUR'
  if (codigo.startsWith('3030')) return 'SUPERPRIX'
  if (codigo.startsWith('5353')) return 'ARMAZEM_GRAO'
  if (codigo.startsWith('11623')) return 'VIANENSE'
  if (codigo.startsWith('4568')) return 'SAMS_CLUB'
  if (codigo.startsWith('23843')) return 'ATACADAO'
  if (codigo.startsWith('17659') || codigo.startsWith('11139') || codigo.startsWith('25140') || codigo.startsWith('21468') || codigo.startsWith('21469')) return 'EMANUEL'
  // por nome
  const n = nome.toUpperCase()
  if (n.includes('PAX')) return 'SUPER_PAX'
  if (n.includes('SENDAS')) return 'SENDAS'
  if (n.includes('ZONA SUL') || n.startsWith('ZS')) return 'ZONA_SUL'
  if (n.includes('PRINCESA')) return 'PRINCESA'
  if (n.includes('PREZUNIC')) return 'PREZUNIC'
  if (n.includes('FEIRA NOVA')) return 'FEIRA_NOVA'
  if (n.includes('CARREFOUR')) return 'CARREFOUR'
  if (n.includes('SUPERPRIX')) return 'SUPERPRIX'
  if (n.includes('ARMAZEM') || n.includes('GRÃO') || n.includes('GRAO')) return 'ARMAZEM_GRAO'
  if (n.includes('VIANENSE')) return 'VIANENSE'
  if (n.includes('SAMS')) return 'SAMS_CLUB'
  if (n.includes('ATACAD')) return 'ATACADAO'
  if (n.includes('EMANUEL') || n.includes('O BOM')) return 'EMANUEL'
  if (n.includes('MUNDIAL')) return 'MUNDIAL'
  return 'DESCONHECIDO'
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
  console.log(`=== CADASTRO EM MASSA ${APPLY ? '(APPLY)' : '(DRY-RUN)'} ===\n`)

  // Carrega lojas Unitrac
  const todasLojas: LojaUnitrac[] = JSON.parse(readFileSync('docs/correcao-sistema/lojas-no-unitrac.json', 'utf8'))
  const individuais = todasLojas.filter(l => l.classificacao === 'LOJA_INDIVIDUAL')
  console.log(`Lojas Unitrac individuais: ${individuais.length}`)

  // Carrega cadastro
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data: cadastroAtual, error: errCad } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, ativo')
    .eq('ativo', true)
  if (errCad) throw errCad
  const cadastro = (cadastroAtual ?? []) as LojaCadastro[]
  console.log(`Cadastro atual (ativas): ${cadastro.length}`)

  // Indexes
  const byCodigoUnitrac = new Map<string, LojaCadastro>()
  for (const l of cadastro) if (l.codigo_unitrac) byCodigoUnitrac.set(l.codigo_unitrac, l)
  const byNomeNorm = new Map<string, LojaCadastro[]>()
  for (const l of cadastro) {
    const k = normalizar(l.nome_normalizado || l.nome)
    const arr = byNomeNorm.get(k) ?? []
    arr.push(l)
    byNomeNorm.set(k, arr)
  }

  const propostas: Proposta[] = []

  for (const u of individuais) {
    const redeInferida = inferirRede(u.codigo, u.nome)

    // (1) Match exato por codigo_unitrac
    const matchCodigo = byCodigoUnitrac.get(u.codigo)
    if (matchCodigo) {
      // Já tem código. Vê se falta lat/lng ou nome_unitrac
      const campos: Partial<LojaCadastro> = {}
      if (!matchCodigo.lat || !matchCodigo.lng) {
        campos.lat = u.lat
        campos.lng = u.lng
      }
      if (!matchCodigo.nome_unitrac) campos.nome_unitrac = u.nome
      if (matchCodigo.raio_metros == null || matchCodigo.raio_metros < 50) {
        campos.raio_metros = Math.max(150, Math.min(u.raio_metros + 50, 300))
      }
      if (Object.keys(campos).length > 0) {
        propostas.push({
          acao: 'UPDATE_GEO',
          loja_unitrac: u,
          loja_cadastro: matchCodigo,
          motivo: `codigo_unitrac já existe (${u.codigo}). Atualizando: ${Object.keys(campos).join(', ')}`,
          campos_a_alterar: campos,
        })
      } else {
        propostas.push({
          acao: 'IGNORAR',
          loja_unitrac: u,
          loja_cadastro: matchCodigo,
          motivo: `Já cadastrada com codigo_unitrac=${u.codigo}, lat/lng e nome_unitrac OK`,
        })
      }
      continue
    }

    // (2) Match por nome_normalizado (com validação de rede)
    const nomeNorm = normalizar(u.nome)
    const candidatosNome = (byNomeNorm.get(nomeNorm) ?? []).filter(l => l.rede_id === redeInferida)
    // Match fuzzy: nome contém o do unitrac ou vice-versa, MAS só dentro da mesma rede
    const candidatosFuzzy = cadastro.filter(l => {
      if (l.rede_id !== redeInferida) return false
      const ln = normalizar(l.nome_normalizado || l.nome)
      return ln !== nomeNorm && (ln.includes(nomeNorm) || nomeNorm.includes(ln)) && Math.abs(ln.length - nomeNorm.length) < 15
    })
    const candidatos = [...candidatosNome, ...candidatosFuzzy].filter((l, i, arr) => arr.findIndex(x => x.id === l.id) === i)

    // Se vários candidatos por nome, filtrar pelos sem codigo_unitrac OR lat/lng próximos
    const sem_codigo = candidatos.filter(l => !l.codigo_unitrac)
    if (sem_codigo.length === 1) {
      propostas.push({
        acao: 'UPDATE_CODIGO',
        loja_unitrac: u,
        loja_cadastro: sem_codigo[0],
        rede_inferida: redeInferida,
        motivo: `Match nome+rede (${redeInferida}), loja existente sem codigo_unitrac`,
        campos_a_alterar: {
          codigo_unitrac: u.codigo,
          nome_unitrac: u.nome,
          ...(sem_codigo[0].lat == null && { lat: u.lat, lng: u.lng }),
          ...(sem_codigo[0].raio_metros == null && { raio_metros: Math.max(150, u.raio_metros + 50) }),
        },
      })
      continue
    }
    if (sem_codigo.length > 1) {
      // Ambíguo, escolher por menor distância geo
      const comDist = sem_codigo
        .filter(l => l.lat != null && l.lng != null)
        .map(l => ({ l, dist: haversineMetros(l.lat!, l.lng!, u.lat, u.lng) }))
        .sort((a, b) => a.dist - b.dist)
      if (comDist.length > 0 && comDist[0].dist < 500) {
        propostas.push({
          acao: 'UPDATE_CODIGO',
          loja_unitrac: u,
          loja_cadastro: comDist[0].l,
          rede_inferida: redeInferida,
          motivo: `Nome+rede ambíguo (${sem_codigo.length} candidatos). Escolhido o de menor distância: ${Math.round(comDist[0].dist)}m`,
          campos_a_alterar: {
            codigo_unitrac: u.codigo,
            nome_unitrac: u.nome,
          },
        })
        continue
      }
    }

    // (3) Match geo (sem codigo, sem nome batendo, MAS só dentro da mesma rede)
    const proximos = cadastro
      .filter(l => l.lat != null && l.lng != null && !l.codigo_unitrac && l.rede_id === redeInferida)
      .map(l => ({ l, dist: haversineMetros(l.lat!, l.lng!, u.lat, u.lng) }))
      .filter(x => x.dist < 150)
      .sort((a, b) => a.dist - b.dist)
    if (proximos.length === 1) {
      propostas.push({
        acao: 'UPDATE_GEO',
        loja_unitrac: u,
        loja_cadastro: proximos[0].l,
        rede_inferida: redeInferida,
        motivo: `Match geo ${Math.round(proximos[0].dist)}m + rede=${redeInferida}, loja sem codigo_unitrac`,
        campos_a_alterar: {
          codigo_unitrac: u.codigo,
          nome_unitrac: u.nome,
        },
      })
      continue
    }

    // (4) Nada bate → criar (nome_normalizado é GENERATED, não settar)
    propostas.push({
      acao: 'CRIAR',
      loja_unitrac: u,
      rede_inferida: redeInferida,
      motivo: `Sem match no cadastro. Criar nova loja (rede=${redeInferida})`,
      campos_a_alterar: {
        rede_id: redeInferida,
        nome: u.nome,
        codigo_unitrac: u.codigo,
        nome_unitrac: u.nome,
        lat: u.lat,
        lng: u.lng,
        raio_metros: Math.max(150, Math.min(u.raio_metros + 50, 300)),
        ativo: true,
      },
    })
  }

  // Sumário
  const contagem: Record<string, number> = {}
  for (const p of propostas) contagem[p.acao] = (contagem[p.acao] ?? 0) + 1
  console.log('\n=== Sumário de ações ===')
  for (const [k, v] of Object.entries(contagem)) console.log(`  ${k}: ${v}`)

  const porRedeCriar = propostas.filter(p => p.acao === 'CRIAR').reduce((acc, p) => {
    const r = p.rede_inferida ?? 'DESCONHECIDO'
    acc[r] = (acc[r] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
  console.log('\n=== CRIAR por rede ===')
  for (const [k, v] of Object.entries(porRedeCriar).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`)

  // Salva propostas
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  mkdirSync('docs/db-changes', { recursive: true })
  const propPath = `docs/db-changes/${timestamp}-cadastro-em-massa-propostas.json`
  writeFileSync(propPath, JSON.stringify(propostas, null, 2), 'utf8')
  console.log(`\nPropostas salvas: ${propPath}`)

  if (!APPLY) {
    console.log('\n[DRY-RUN] Nenhuma ação foi aplicada. Use --apply pra executar.')
    return
  }

  // Apply
  console.log('\n=== APLICANDO ===')

  // Snapshot rollback
  const snapshotPath = `docs/db-changes/${timestamp}-cadastro-em-massa-rollback.json`
  const lojasAfetadas = propostas
    .filter(p => p.acao !== 'IGNORAR' && p.acao !== 'CRIAR' && p.loja_cadastro)
    .map(p => p.loja_cadastro!)
  writeFileSync(snapshotPath, JSON.stringify(lojasAfetadas, null, 2), 'utf8')
  console.log(`Snapshot rollback: ${snapshotPath}`)

  let sucesso = 0
  let falha = 0
  const erros: Array<{ acao: string; codigo: string; nome: string; erro: string }> = []

  // 1. UPDATEs primeiro
  for (const p of propostas) {
    if (p.acao === 'IGNORAR' || p.acao === 'CRIAR') continue
    if (!p.loja_cadastro || !p.campos_a_alterar) continue

    const { error } = await supabase.from('lojas').update(p.campos_a_alterar).eq('id', p.loja_cadastro.id)
    if (error) {
      falha++
      erros.push({ acao: p.acao, codigo: p.loja_unitrac.codigo, nome: p.loja_unitrac.nome, erro: error.message })
    } else {
      sucesso++
    }
  }

  // 2. CRIARs
  for (const p of propostas) {
    if (p.acao !== 'CRIAR' || !p.campos_a_alterar) continue
    const { error } = await supabase.from('lojas').insert(p.campos_a_alterar)
    if (error) {
      falha++
      erros.push({ acao: 'CRIAR', codigo: p.loja_unitrac.codigo, nome: p.loja_unitrac.nome, erro: error.message })
    } else {
      sucesso++
    }
  }

  console.log(`\n✓ Sucesso: ${sucesso}`)
  console.log(`✗ Falhas:  ${falha}`)
  if (erros.length > 0) {
    const errosPath = `docs/db-changes/${timestamp}-cadastro-em-massa-erros.json`
    writeFileSync(errosPath, JSON.stringify(erros, null, 2), 'utf8')
    console.log(`Erros salvos: ${errosPath}`)
  }

  // Re-auditoria
  console.log('\n=== AUDITORIA PÓS-APLICAÇÃO ===')
  const { count: total } = await supabase.from('lojas').select('*', { count: 'exact', head: true }).eq('ativo', true)
  const { count: semCodigo } = await supabase.from('lojas').select('*', { count: 'exact', head: true }).eq('ativo', true).is('codigo_unitrac', null)
  const { count: semNome } = await supabase.from('lojas').select('*', { count: 'exact', head: true }).eq('ativo', true).is('nome_unitrac', null)
  const { count: semLat } = await supabase.from('lojas').select('*', { count: 'exact', head: true }).eq('ativo', true).is('lat', null)
  console.log(`Total lojas ativas: ${total}`)
  console.log(`  Sem codigo_unitrac: ${semCodigo} (${((semCodigo! / total!) * 100).toFixed(0)}%)`)
  console.log(`  Sem nome_unitrac:   ${semNome} (${((semNome! / total!) * 100).toFixed(0)}%)`)
  console.log(`  Sem lat:            ${semLat}`)
}

main().catch(e => { console.error(e); process.exit(1) })
