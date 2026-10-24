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

/** F2-REV-08: dentro das pastas das regras, o que NAO muda a classificacao de
 *  NF nenhuma -- testes, fixtures, textos e telas (busca/carga/historico do
 *  Ao vivo, investigacao, "Baixar pendentes", a propria versao). Um deploy so'
 *  disso nao separa dias com a mesma regra. */
export const EXCLUIDOS_REGRAS = [
  ':(exclude,glob)**/*.test.ts', ':(exclude,glob)**/*.fixture*', ':(exclude,glob)**/*.patch', ':(exclude,glob)**/__fixtures__/**',
  ':(exclude)src/lib/kpi-romaneio/experimentos',
  ...['relatorio-pendentes', 'investigacao', 'investigacao-rotulos', 'investigacao-resumo', 'versao-regras', 'versao-regras-aviso',
    'ao-vivo-busca', 'ao-vivo-carga', 'ao-vivo-historico', 'dry-guarda', 'comparar-kpi', 'auditoria-nf'].map(f => `:(exclude)src/lib/kpi-romaneio/${f}.ts`),
]

type Deps = { env?: Record<string, string | undefined>; executar?: (args: string[]) => string; avisar?: (m: string) => void }

// stderr capturado: a mensagem do erro traz o motivo (ex.: dubious ownership).
const executarGit = (args: string[]) => execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 })

let cache: string | null | undefined

/** Commit curto das regras, ou null (sem git: pasta do teste a seco). Nunca lança. */
export function versaoDasRegras(deps?: Deps): string | null {
  const env = deps?.env ?? process.env
  if (env.KPI_REGRAS_VERSAO?.trim()) return env.KPI_REGRAS_VERSAO.trim()
  if (!deps?.executar && cache !== undefined) return cache
  let v: string | null = null
  try {
    v = (deps?.executar ?? executarGit)(['log', '-1', '--format=%h', '--', ...CAMINHOS_REGRAS, ...EXCLUIDOS_REGRAS]).trim() || null
  } catch (err) {
    // F2-REV-08: git que falha (dubious ownership, git ausente, timeout) nao
    // e' mais silencioso -- o dia sai sem versao e o log diz por que. Uma vez
    // por processo (o resultado fica em cache).
    const motivo = (err instanceof Error ? err.message : String(err)).replace(/\s+/g, ' ').trim().slice(0, 300)
    ;(deps?.avisar ?? ((m: string) => console.warn(m)))(`AVISO versão das regras: git log falhou em ${process.cwd()} (${motivo}) -- o cálculo sai sem versão; defina KPI_REGRAS_VERSAO ou corrija o git`)
    v = null
  }
  if (!deps?.executar) cache = v
  return v
}
