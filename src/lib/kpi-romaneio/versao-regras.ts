// F2-13 (KRQ-12, plano mestre 23/10): versao das regras do KPI gravada no
// resultado do Ao vivo (kpi_ao_vivo_calculo.resultado.versaoRegras). Versao =
// ultimo commit que mexeu no codigo das regras (testes e fixtures fora), para
// um deploy so' de tela nao separar dias com a mesma regra. Le do git do
// checkout (o tick roda por tsx a partir do codigo de /srv/kpi-transmonseg; o
// deploy faz pull e build juntos). KPI_REGRAS_VERSAO no ambiente vence.
// Lado servidor apenas (child_process): a tela usa versao-regras-aviso.ts.
import { execFileSync } from 'child_process'

export const CAMINHOS_REGRAS = [
  'src/lib/kpi', 'src/lib/kpi-romaneio', 'src/lib/kpi-rioquality', 'src/lib/unitrac-api', 'src/lib/unitrac',
  'src/lib/fusion', 'src/lib/escalas', 'src/lib/parsers', 'src/lib/utils', 'src/lib/data-br.ts',
]

type Deps = { env?: Record<string, string | undefined>; executar?: (args: string[]) => string }

const executarGit = (args: string[]) => execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 })

let cache: string | null | undefined

/** Commit curto das regras, ou null (sem git: pasta do teste a seco). Nunca lança. */
export function versaoDasRegras(deps?: Deps): string | null {
  const env = deps?.env ?? process.env
  if (env.KPI_REGRAS_VERSAO?.trim()) return env.KPI_REGRAS_VERSAO.trim()
  if (!deps && cache !== undefined) return cache
  let v: string | null = null
  try {
    v = (deps?.executar ?? executarGit)(['log', '-1', '--format=%h', '--', ...CAMINHOS_REGRAS, ':!*.test.ts', ':!*.fixture*']).trim() || null
  } catch {
    v = null
  }
  if (!deps) cache = v
  return v
}
