/**
 * Snapshot de scores MATCHER vs MANUAL pra todas as redes×dias conhecidas.
 *
 * Uso:
 *   npx tsx scripts/snapshot.ts                                       # salva auto-named
 *   npx tsx scripts/snapshot.ts > docs/snapshots/custom-name.json     # stdout
 *
 * Saída: JSON com timestamp, git_sha, e mapa rede→dia→{ok,diff,total,error?}
 *
 * Concorrência limitada a 4 processos simultâneos. Erros não crasham — vão pro JSON
 * como `error: "..."` na entrada da rede×dia. Tempo: ~3-5min com paralelização.
 */
import { spawn, execSync } from 'child_process'
import { writeFileSync, mkdirSync } from 'fs'

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

interface Job {
  rede: string
  dia: string
  script: string
  args: string[]
}

const REDES_18 = ['SUPER_PAX','FEIRA_NOVA','MUNDIAL','SENDAS','CARREFOUR','ATACADAO','ASSAI','PREZUNIC','VIANENSE','PRINCESA','SUPERPRIX','SAMS_CLUB','ARMAZEM_GRAO']
const REDES_19 = ['SUPER_PAX','FEIRA_NOVA','MUNDIAL','SENDAS','CARREFOUR','ATACADAO','ASSAI','PREZUNIC','VIANENSE','PRINCESA','SUPERPRIX','SUPERCOMPRAS','SAMS_CLUB','CAB_PETROPOLIS','ARMAZEM_GRAO','GUANABARA']

const ZONA_SUL_DIAS = ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21']

const JOBS: Job[] = [
  ...ZONA_SUL_DIAS.map(dia => ({ rede: 'ZONA_SUL', dia, script: 'scripts/analise/analise_zonasul.ts', args: [dia] })),
  ...REDES_18.map(rede => ({ rede, dia: '2026-05-18', script: 'scripts/analise/analise_18_geral.ts', args: [rede] })),
  ...REDES_19.map(rede => ({ rede, dia: '2026-05-19', script: 'scripts/analise/analise_19_geral.ts', args: [rede] })),
]

function runJob(job: Job): Promise<ScoreEntry> {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['tsx', job.script, ...job.args], { shell: true })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ ok: null, diff: null, total: null, error: `exit ${code}: ${stderr.slice(-200)}` })
        return
      }
      const m = stdout.match(/RESUMO MATCHER.MANUAL:\s+OK=(\d+)\s+DIFF=(\d+)/)
      if (!m) {
        resolve({ ok: null, diff: null, total: null, error: 'no RESUMO line found' })
        return
      }
      const ok = parseInt(m[1], 10)
      const diff = parseInt(m[2], 10)
      resolve({ ok, diff, total: ok + diff })
    })
  })
}

async function main() {
  const CONCURRENCY = 2
  process.stderr.write(`Snapshot started, ${JOBS.length} jobs, concurrency=${CONCURRENCY}\n`)
  const startTime = Date.now()

  const snapshot: Snapshot = {
    timestamp: new Date().toISOString(),
    git_sha: execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim(),
    redes: {},
  }

  for (let i = 0; i < JOBS.length; i += CONCURRENCY) {
    const batch = JOBS.slice(i, i + CONCURRENCY)
    const batchNum = Math.floor(i / CONCURRENCY) + 1
    const totalBatches = Math.ceil(JOBS.length / CONCURRENCY)
    process.stderr.write(`  batch ${batchNum}/${totalBatches}: ${batch.map(j => `${j.rede}/${j.dia}`).join(', ')}\n`)
    const results = await Promise.all(batch.map(job => runJob(job).then(score => ({ job, score }))))
    for (const { job, score } of results) {
      if (!snapshot.redes[job.rede]) snapshot.redes[job.rede] = {}
      snapshot.redes[job.rede][job.dia] = score
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  process.stderr.write(`Snapshot done in ${elapsed}s\n`)

  const json = JSON.stringify(snapshot, null, 2)

  // Sempre salva em arquivo (TTY-independente; background runs também salvam)
  mkdirSync('docs/snapshots', { recursive: true })
  const fname = process.argv[2] ?? `docs/snapshots/${snapshot.timestamp.replace(/[:.]/g, '-')}-snapshot.json`
  writeFileSync(fname, json)
  process.stderr.write(`Saved: ${fname}\n`)
  process.stdout.write(fname + '\n')
}

main().catch(e => { console.error(e); process.exit(1) })
