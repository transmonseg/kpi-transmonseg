/**
 * Compara dois snapshots; aplica thresholds do spec (seção 5):
 *   - ZONA_SUL: regressão >0 → BLOCK
 *   - Rede com total <10:  regressão >0 → BLOCK
 *   - Rede com total 10-30: regressão >1 → BLOCK
 *   - Rede com total >30:  regressão >2 → BLOCK
 *
 * Uso:
 *   npx tsx scripts/regression-check.ts <before.json> <after.json>
 *
 * Exit: 0 = OK, 1 = regressão detectada
 */
import { readFileSync } from 'fs'

interface ScoreEntry {
  ok: number | null
  diff: number | null
  total: number | null
  error?: string
}

interface Snapshot {
  timestamp: string
  git_sha: string
  redes: Record<string, Record<string, ScoreEntry>>
}

function threshold(rede: string, total: number | null): number {
  if (rede === 'ZONA_SUL') return 0
  if (total === null) return 0
  if (total < 10) return 0
  if (total <= 30) return 1
  return 2
}

function main() {
  const [, , beforePath, afterPath] = process.argv
  if (!beforePath || !afterPath) {
    console.error('Uso: npx tsx scripts/regression-check.ts <before.json> <after.json>')
    process.exit(2)
  }

  const before: Snapshot = JSON.parse(readFileSync(beforePath, 'utf-8'))
  const after: Snapshot = JSON.parse(readFileSync(afterPath, 'utf-8'))

  process.stdout.write(`Comparando:\n  before: ${beforePath} (${before.git_sha.slice(0, 8)})\n  after:  ${afterPath} (${after.git_sha.slice(0, 8)})\n\n`)

  let regressions = 0
  let improvements = 0
  let neutral = 0
  let blocked = false
  const lines: string[] = []

  const allRedes = new Set([...Object.keys(before.redes), ...Object.keys(after.redes)])
  for (const rede of [...allRedes].sort()) {
    const beforeDias = before.redes[rede] ?? {}
    const afterDias = after.redes[rede] ?? {}
    const allDias = new Set([...Object.keys(beforeDias), ...Object.keys(afterDias)])
    for (const dia of [...allDias].sort()) {
      const b = beforeDias[dia]
      const a = afterDias[dia]
      if (!b || !a) {
        lines.push(`  ${rede} ${dia}: missing (b=${!!b}, a=${!!a}) — SKIP`)
        continue
      }
      if (b.error || a.error) {
        lines.push(`  ${rede} ${dia}: error before=${b.error ?? '-'} after=${a.error ?? '-'}`)
        continue
      }
      const delta = (a.ok ?? 0) - (b.ok ?? 0)
      const total = a.total
      const thr = threshold(rede, total)
      let mark = '  '
      if (delta > 0) { improvements++; mark = '+ ' }
      else if (delta < 0) {
        regressions++
        if (-delta > thr) { mark = '!! '; blocked = true }
        else { mark = '- ' }
      } else neutral++
      lines.push(`${mark}${rede} ${dia}: ${b.ok}/${b.total} -> ${a.ok}/${a.total} (${delta >= 0 ? '+' : ''}${delta}) thr=${thr}`)
    }
  }

  process.stdout.write(lines.join('\n') + '\n\n')
  process.stdout.write(`Net: improvements=${improvements} regressions=${regressions} neutral=${neutral}\n`)

  if (blocked) {
    process.stdout.write('\nREGRESSION DETECTED beyond threshold. ROLLBACK REQUIRED.\n')
    process.exit(1)
  }
  process.stdout.write('\nNo regression beyond threshold.\n')
  process.exit(0)
}

main()
