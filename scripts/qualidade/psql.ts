// Leitura do Postgres do servidor para o placar de qualidade (F1-01) e o
// diagnostico das prioridades (F1-16). SO' LEITURA: toda sessao abre com
// default_transaction_read_only=on (qualquer INSERT/UPDATE/DDL falha) e
// statement_timeout de 2 min. No servidor roda como root via sudo -u postgres
// (igual a scripts/auditoria-diaria.sh); no Mac, PLACAR_SSH=<host> manda o
// mesmo comando pelo ssh.
import { execFileSync } from 'child_process'

const PGOPTIONS = 'PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=120000'

const aspasShell = (s: string) => `'${s.replace(/'/g, `'"'"'`)}'`

export function comandoPsql(db: string, sql: string, ssh?: string): [string, string[]] {
  const args = ['-n', '-u', 'postgres', 'env', PGOPTIONS, 'psql', '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-d', db, '-c', sql]
  if (!ssh) return ['sudo', args]
  return ['ssh', [ssh, ['sudo', ...args].map(aspasShell).join(' ')]]
}

/** Literal SQL de data (so' AAAA-MM-DD; nada de texto livre na SQL). */
export function sqlLiteral(dia: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error(`data invalida: ${dia}`)
  return `'${dia}'`
}

/** Roda a SQL (que deve devolver UM valor json) e devolve o JSON lido. */
export function consultarJson<T>(db: string, sql: string): T {
  const [cmd, args] = comandoPsql(db, sql, process.env.PLACAR_SSH || undefined)
  const saida = execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  // O servidor imprime avisos de locale no stderr; o stdout tem so' o json.
  return JSON.parse(saida.trim() || 'null') as T
}

/** Roda um comando do sistema (local ou pelo ssh) e devolve o stdout, mesmo com codigo != 0. */
export function rodarNoServidor(cmd: string, args: string[]): string {
  const ssh = process.env.PLACAR_SSH || undefined
  const [c, a] = ssh ? ['ssh', [ssh, [cmd, ...args].map(aspasShell).join(' ')]] : [cmd, args]
  try {
    return execFileSync(c, a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    const out = (e as { stdout?: string }).stdout
    if (typeof out === 'string') return out
    throw e
  }
}
