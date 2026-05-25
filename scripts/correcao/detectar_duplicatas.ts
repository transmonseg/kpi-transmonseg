/**
 * Detecta lojas potencialmente duplicadas no cadastro.
 *
 * Critérios:
 *   - Mesma rede + nomes muito similares (Levenshtein ≤ 30% da maior string)
 *   - Mesma rede + nomes contendo mesmas palavras significativas
 *
 * Output: docs/db-changes/2026-05-24-duplicatas-detectadas.md
 */
import { writeFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const TOKENS_GENERICOS = new Set([
  'LOJA', 'ENTREGA', 'CARRO', 'ARMAZEM', 'GRAO', 'GRÃO', 'DO', 'DA', 'DE', 'EM',
  'I', 'II', 'III', 'IV', 'V', '1', '2', '3', '4', '5',
  'ZONA', 'SUL', 'PREZUNIC', 'PRINCESA', 'CARREFOUR', 'ASSAI', 'ASSAÍ', 'ATACADAO',
  'SUPER', 'SUPERPRIX', 'SAMS', 'CLUB', 'VIANENSE', 'SENDAS', 'GUANABARA', 'GB',
  'PAX', 'FEIRA', 'NOVA', 'EMANUEL', 'MUNDIAL', 'CAB', 'PETROPOLIS', 'PETRÓPOLIS',
  'MEGA', 'BOX',
])

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
}

function tokens(s: string): Set<string> {
  return new Set(
    normalizar(s).replace(/[^A-Z0-9 ]/g, ' ').split(' ')
      .filter(t => t.length >= 3 && !TOKENS_GENERICOS.has(t) && !/^\d+$/.test(t))
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  const intersect = new Set([...a].filter(x => b.has(x)))
  const union = new Set([...a, ...b])
  return intersect.size / union.size
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data: lojas } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, codigo_unitrac, nome_unitrac, ativo')

  if (!lojas) return

  const md: string[] = []
  md.push('# Duplicatas Detectadas no Cadastro de Lojas')
  md.push('')
  md.push(`Gerado em: ${new Date().toISOString()}`)
  md.push(`Total lojas analisadas: ${lojas.length}`)
  md.push('')
  md.push('## Critério')
  md.push('Pares de lojas na mesma rede com Jaccard similaridade ≥ 0.5 nos tokens significativos.')
  md.push('')

  type Loja = typeof lojas[number]
  const lojasComToks = lojas.map(l => ({ ...l, toks: tokens(l.nome) }))

  // Grupos de duplicatas — critério rigoroso:
  // (a) Jaccard ≥ 100% (tokens textuais idênticos), OU
  // (b) Jaccard ≥ 80% E uma loja tem código/nome unitrac + outra não tem
  //    (indicando "versão antiga vs nova" cadastrada separadamente)
  const pares: Array<{ a: Loja & { toks: Set<string> }; b: Loja & { toks: Set<string> }; sim: number; motivo: string }> = []
  for (let i = 0; i < lojasComToks.length; i++) {
    for (let j = i + 1; j < lojasComToks.length; j++) {
      const a = lojasComToks[i]
      const b = lojasComToks[j]
      if (a.rede_id !== b.rede_id) continue
      if (a.toks.size === 0 || b.toks.size === 0) continue
      const sim = jaccard(a.toks, b.toks)
      // Para evitar lojas com 1 token único (ex: ambas só têm "LEBLON") falsamente identificadas como duplicatas
      if (a.toks.size < 1 || b.toks.size < 1) continue
      // Diferença de número discrimina lojas distintas
      // IGNORAR números dentro de parênteses (são número de entrega, não da loja)
      const extrairNums = (s: string): string[] => {
        const semParens = s.replace(/\([^)]*\)/g, '')
        const matches: string[] = []
        for (const m of semParens.matchAll(/\b(?:LOJA|FILIAL)\s+(\d{1,3})\b/gi)) matches.push(m[1])
        for (const m of semParens.matchAll(/\b(\d{2,3})\b/g)) matches.push(m[1])
        for (const m of semParens.matchAll(/[A-Z]\s+(\d)\b/gi)) matches.push(m[1])
        return [...new Set(matches)]
      }
      const numsA = extrairNums(a.nome)
      const numsB = extrairNums(b.nome)
      // Se ambos têm números e nenhum coincide → lojas diferentes
      if (numsA.length > 0 && numsB.length > 0) {
        const intersect = numsA.filter(n => numsB.includes(n))
        if (intersect.length === 0) continue
      }
      // Critério (a) tokens 100% idênticos
      if (sim === 1.0) {
        pares.push({ a, b, sim, motivo: '100% tokens idênticos' })
        continue
      }
      // Critério (b) ≥ 80% E uma tem dados unitrac, outra não
      if (sim >= 0.8) {
        const aTemDados = !!(a.codigo_unitrac || a.nome_unitrac)
        const bTemDados = !!(b.codigo_unitrac || b.nome_unitrac)
        if (aTemDados !== bTemDados) {
          pares.push({ a, b, sim, motivo: '≥80% tokens + uma sem dados unitrac' })
        }
      }
    }
  }

  // Agrupar por rede
  const porRede = new Map<string, typeof pares>()
  for (const p of pares) {
    const arr = porRede.get(p.a.rede_id) ?? []
    arr.push(p)
    porRede.set(p.a.rede_id, arr)
  }

  md.push(`## Resumo`)
  md.push('')
  md.push(`Total pares suspeitos: **${pares.length}**`)
  md.push('')
  md.push(`| Rede | Pares |`)
  md.push(`|------|-------|`)
  for (const [r, arr] of [...porRede.entries()].sort((a, b) => b[1].length - a[1].length)) {
    md.push(`| ${r} | ${arr.length} |`)
  }
  md.push('')

  // Listar pares
  for (const [rede, arr] of [...porRede.entries()].sort((a, b) => b[1].length - a[1].length)) {
    md.push(`## ${rede} (${arr.length} pares)`)
    md.push('')
    for (const { a, b, sim } of arr) {
      md.push(`### similaridade ${(sim * 100).toFixed(0)}%`)
      md.push(`- **A:** ${a.nome}`)
      md.push(`  - id: \`${a.id}\``)
      md.push(`  - codigo_unitrac: ${a.codigo_unitrac ?? '_(vazio)_'}`)
      md.push(`  - nome_unitrac: ${a.nome_unitrac ?? '_(vazio)_'}`)
      md.push(`  - ativo: ${a.ativo}`)
      md.push(`- **B:** ${b.nome}`)
      md.push(`  - id: \`${b.id}\``)
      md.push(`  - codigo_unitrac: ${b.codigo_unitrac ?? '_(vazio)_'}`)
      md.push(`  - nome_unitrac: ${b.nome_unitrac ?? '_(vazio)_'}`)
      md.push(`  - ativo: ${b.ativo}`)
      md.push('')
    }
  }

  const outPath = 'docs/db-changes/2026-05-24-duplicatas-detectadas.md'
  writeFileSync(outPath, md.join('\n'), 'utf8')

  // Também salva como JSON estruturado pro próximo passo (mesclar)
  const json = pares.map(({ a, b, sim, motivo }) => ({
    sim,
    motivo,
    rede_id: a.rede_id,
    a: {
      id: a.id,
      nome: a.nome,
      codigo_unitrac: a.codigo_unitrac,
      nome_unitrac: a.nome_unitrac,
      ativo: a.ativo,
    },
    b: {
      id: b.id,
      nome: b.nome,
      codigo_unitrac: b.codigo_unitrac,
      nome_unitrac: b.nome_unitrac,
      ativo: b.ativo,
    },
  }))
  const jsonPath = 'docs/db-changes/2026-05-24-duplicatas.json'
  writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8')

  console.log(`Detectadas ${pares.length} pares suspeitos.`)
  console.log(`  Relatório MD: ${outPath}`)
  console.log(`  JSON estruturado: ${jsonPath}`)
}

main().catch(e => { console.error(e); process.exit(1) })
