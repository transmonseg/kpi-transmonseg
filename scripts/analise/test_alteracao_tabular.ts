import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseAlteracaoPdfTabular } from '@/lib/parsers/alteracao-pdf-tabular'

const PDF = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 22/alteracoes/ALTERACAO DE ESCALA GERAL 22.05.pdf'

async function main() {
  const buf = readFileSync(PDF)
  const alteracoes = await parseAlteracaoPdfTabular(buf)
  process.stdout.write(`Alterações extraídas: ${alteracoes.length}\n\n`)
  for (const a of alteracoes) {
    process.stdout.write(`[${a.tipo}] rede=${a.rede_id ?? '?'} | conf=${a.confianca}\n`)
    process.stdout.write(`  loja: ${a.loja_nome_raw}\n`)
    if (a.entra) {
      process.stdout.write(`  entra: mot="${a.entra.motorista_nome ?? '-'}" cod=${a.entra.motorista_codigo ?? '-'} placa=${a.entra.placa_raw ?? '-'}\n`)
    }
    process.stdout.write(`  motivo: ${a.motivo}\n\n`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
