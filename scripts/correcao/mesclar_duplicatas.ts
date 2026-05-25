/**
 * Mescla pares duplicados detectados em docs/db-changes/2026-05-24-duplicatas.json
 *
 * Regra de merge:
 *   - Mantém o ID com MAIS dados (codigo_unitrac > nome_unitrac > coordenadas)
 *   - Desativa o outro (ativo=false, NÃO deleta — preserva FKs)
 *   - Atualiza nome_normalizado da mantida pra cobrir ambas grafias
 *
 * Filtra automaticamente falsos positivos (lojas com mesmo nome geográfico mas
 * número diferente, ex: PRINCESA MARICÁ 1 vs MARICÁ 2).
 *
 * Snapshot + rollback SQL salvos antes de aplicar.
 *
 * Uso: npx tsx scripts/correcao/mesclar_duplicatas.ts [--dry-run]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.argv.includes('--dry-run')

interface ParDuplicata {
  sim: number
  motivo: string
  rede_id: string
  a: { id: string; nome: string; codigo_unitrac: string | null; nome_unitrac: string | null; ativo: boolean }
  b: { id: string; nome: string; codigo_unitrac: string | null; nome_unitrac: string | null; ativo: boolean }
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function nivelDados(loja: ParDuplicata['a']): number {
  let n = 0
  if (loja.codigo_unitrac) n += 100
  if (loja.nome_unitrac) n += 10
  if (loja.ativo) n += 1
  return n
}

function ehFalsoPositivo(par: ParDuplicata): boolean {
  // Falso positivo: lojas com mesmo nome geográfico mas NÚMEROS DE LOJA DIFERENTES
  // Ex: "PRINCESA MARICÁ 1" e "PRINCESA MARICÁ 2"
  // IMPORTANTE: normalizar pra ASCII primeiro (regex [A-Z] não pega Á É etc)
  const extrairNumLoja = (s: string): string | null => {
    // Normalizar: tirar acentos + parênteses + uppercase
    const sem = s
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\([^)]*\)/g, '')
      .toUpperCase()
    // "Loja 04", "Filial 30"
    let m = sem.match(/\b(?:LOJA|FILIAL)\s+(\d{1,3})\b/)
    if (m) return m[1]
    // Número final de "WORD N" tipo "CABO FRIO 1", "MARICA 2"
    m = sem.match(/[A-Z]\s+(\d)(?:\s|$|[^A-Z0-9 ])/)
    if (m) return m[1]
    return null
  }
  const numA = extrairNumLoja(par.a.nome)
  const numB = extrairNumLoja(par.b.nome)
  return numA !== null && numB !== null && numA !== numB
}

async function main() {
  console.log(`=== MESCLAR DUPLICATAS ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`)

  const pares: ParDuplicata[] = JSON.parse(
    readFileSync('docs/db-changes/2026-05-24-duplicatas.json', 'utf8')
  )
  console.log(`Total pares carregados: ${pares.length}`)

  // Filtrar falsos positivos
  const validos: ParDuplicata[] = []
  const falsosPositivos: ParDuplicata[] = []
  for (const p of pares) {
    if (ehFalsoPositivo(p)) falsosPositivos.push(p)
    else validos.push(p)
  }
  console.log(`  Falsos positivos descartados: ${falsosPositivos.length}`)
  console.log(`  Pares para mesclar: ${validos.length}\n`)

  if (falsosPositivos.length > 0) {
    console.log('Falsos positivos (não mesclar — números de loja diferentes):')
    for (const p of falsosPositivos) {
      console.log(`  - ${p.a.nome} ↔ ${p.b.nome}`)
    }
    console.log('')
  }

  // Pra cada par, decidir qual manter e qual desativar
  type Merge = {
    manter: { id: string; nome: string; nome_normalizado_novo: string }
    desativar: { id: string; nome: string }
    rede_id: string
  }
  const merges: Merge[] = []

  // Para evitar mesclar a mesma loja em múltiplos merges (ex: A↔B e A↔C), agrupar
  const grupos = new Map<string, Set<string>>()  // id raiz → ids associados
  const idToGrupo = new Map<string, string>()

  for (const p of validos) {
    const ga = idToGrupo.get(p.a.id)
    const gb = idToGrupo.get(p.b.id)
    if (ga && gb && ga !== gb) {
      // Mesclar grupos
      for (const id of grupos.get(gb)!) {
        grupos.get(ga)!.add(id)
        idToGrupo.set(id, ga)
      }
      grupos.delete(gb)
    } else if (ga) {
      grupos.get(ga)!.add(p.b.id)
      idToGrupo.set(p.b.id, ga)
    } else if (gb) {
      grupos.get(gb)!.add(p.a.id)
      idToGrupo.set(p.a.id, gb)
    } else {
      const novoGrupo = p.a.id
      grupos.set(novoGrupo, new Set([p.a.id, p.b.id]))
      idToGrupo.set(p.a.id, novoGrupo)
      idToGrupo.set(p.b.id, novoGrupo)
    }
  }

  // Pra cada grupo, escolher loja a manter
  const lojasInfo = new Map<string, ParDuplicata['a']>()
  for (const p of validos) {
    lojasInfo.set(p.a.id, p.a)
    lojasInfo.set(p.b.id, p.b)
  }

  for (const [_root, ids] of grupos) {
    const lojas = [...ids].map(id => lojasInfo.get(id)!).filter(Boolean)
    // Loja a manter: nível mais alto. Em empate, escolhe a primeira.
    lojas.sort((a, b) => nivelDados(b) - nivelDados(a))
    const manter = lojas[0]
    const outras = lojas.slice(1)
    // Nome normalizado coletivo
    const nomeNormalNovo = [...new Set(lojas.map(l => normalizar(l.nome)))].join(' | ')
    for (const desativar of outras) {
      merges.push({
        manter: { id: manter.id, nome: manter.nome, nome_normalizado_novo: nomeNormalNovo },
        desativar: { id: desativar.id, nome: desativar.nome },
        rede_id: validos.find(p => p.a.id === manter.id || p.b.id === manter.id)!.rede_id,
      })
    }
  }

  console.log(`Merges planejados: ${merges.length}\n`)
  for (const m of merges) {
    console.log(`  ${m.rede_id} | MANTER "${m.manter.nome}" ← DESATIVAR "${m.desativar.nome}"`)
  }
  console.log('')

  // Snapshot + rollback
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const idsAfetados = [...new Set(merges.flatMap(m => [m.manter.id, m.desativar.id]))]
  const { data: estadoAntes } = await supabase
    .from('lojas')
    .select('id, nome, nome_normalizado, ativo')
    .in('id', idsAfetados)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  mkdirSync('scripts/db-changes', { recursive: true })
  mkdirSync('docs/db-changes', { recursive: true })

  const snapshotPath = `docs/db-changes/${timestamp}-snapshot-merge-lojas.json`
  writeFileSync(snapshotPath, JSON.stringify(estadoAntes, null, 2), 'utf8')

  const rollbackSql = (estadoAntes ?? []).map(l =>
    `UPDATE lojas SET nome_normalizado = ${l.nome_normalizado ? `'${l.nome_normalizado.replace(/'/g, "''")}'` : 'NULL'}, ativo = ${l.ativo} WHERE id = '${l.id}';  -- ${l.nome}`
  ).join('\n')
  const rollbackPath = `scripts/db-changes/${timestamp}-rollback-merge.sql`
  writeFileSync(rollbackPath, rollbackSql + '\n', 'utf8')

  console.log(`Snapshot: ${snapshotPath}`)
  console.log(`Rollback: ${rollbackPath}\n`)

  if (DRY_RUN) {
    console.log('[DRY RUN] Nenhum UPDATE foi aplicado.')
    return
  }

  // Aplicar UPDATEs — só desativar duplicata (nome_normalizado é GENERATED)
  let sucessoDesativar = 0, falha = 0
  const erros: string[] = []
  for (const m of merges) {
    const { error: errDesativar } = await supabase
      .from('lojas')
      .update({ ativo: false })
      .eq('id', m.desativar.id)
    if (errDesativar) {
      falha++
      erros.push(`DESATIVAR ${m.desativar.id}: ${errDesativar.message}`)
    } else sucessoDesativar++
  }

  // Salvar aliases em JSON local — pra parser usar como fallback
  // Estrutura: nome_alias_normalizado → loja_id da mantida
  const aliases: Record<string, { loja_id: string; nome: string; rede_id: string }> = {}
  for (const m of merges) {
    const aliasKey = normalizar(m.desativar.nome)
    aliases[aliasKey] = { loja_id: m.manter.id, nome: m.manter.nome, rede_id: m.rede_id }
  }
  const aliasesPath = 'docs/db-changes/loja-aliases.json'
  writeFileSync(aliasesPath, JSON.stringify(aliases, null, 2), 'utf8')
  console.log(`\nAliases salvos: ${aliasesPath} (${Object.keys(aliases).length} mapeamentos)`)

  console.log(`\n=== RESULTADO ===`)
  console.log(`✓ Duplicatas desativadas: ${sucessoDesativar}`)
  console.log(`✗ Falhas: ${falha}`)

  if (erros.length > 0) {
    const errosPath = `docs/db-changes/${timestamp}-erros-merge.json`
    writeFileSync(errosPath, JSON.stringify(erros, null, 2), 'utf8')
    console.log(`Erros: ${errosPath}`)
  }

  // Auditoria pós
  const { data: depois } = await supabase
    .from('lojas')
    .select('id', { count: 'exact' })
    .eq('ativo', true)
  console.log(`\nLojas ativas pós-merge: ${depois?.length ?? 0}`)
}

main().catch(e => { console.error(e); process.exit(1) })
