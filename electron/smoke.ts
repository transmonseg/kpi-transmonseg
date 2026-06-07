// Harness headless: roda o pipeline do MAIN process (cadastro + geração + fila)
// no runtime real do Electron, sem GUI. Valida o caminho PDF (pdf-parse), o
// download do cadastro e a fila. Uso: bundla e roda com electron.
import { app } from 'electron'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { atualizarCadastroSeOnline, carregarCadastroLocal, statusCadastro } from './cadastro'
import { enfileirarSaidas, listarFila } from './fila-upload'
import { gerarKpiLocal } from '@/lib/kpi/gerar-kpi-local'

// Lançado por caminho de script (electron dist/smoke.cjs), app.getAppPath() aponta
// pra electron/dist — então derivo a raiz do repo do __dirname (dist → repo).
const REPO = path.resolve(__dirname, '..', '..')
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: path.join(REPO, '.env.local') })
} catch {
  /* noop */
}
process.env.KPI_ASSETS_DIR = path.join(REPO, 'src', 'assets')

app.whenReady().then(async () => {
  const log = (...a: unknown[]) => console.log('[SMOKE]', ...a)
  try {
    log('cadastro update:', JSON.stringify(await atualizarCadastroSeOnline()))
    log('cadastro status:', JSON.stringify(await statusCadastro()))
    const cad = await carregarCadastroLocal()
    log('snapshot lojas:', cad.lojas.length, 'veiculos:', cad.veiculos.length)

    const dia = path.join(REPO, 'docs', 'conversas-tia-erica', 'dia-20')
    const escalas = [
      { nome: 'ESCALA GERAL DE MAIO 1 (7).xlsx', buffer: await readFile(path.join(dia, 'escalas', 'ESCALA GERAL DE MAIO 1 (7).xlsx')) },
    ]
    // PDF → exercita parseUnitracPdf (pdf-parse) no Electron real.
    const unitracs = [
      { nome: 'relatorio_9522.pdf', buffer: await readFile(path.join(dia, 'unitrac', 'relatorio_9522.pdf')) },
    ]
    const saidas = await gerarKpiLocal({ escalas, unitracs, cadastro: cad, data: '2026-05-20' })
    log('redes:', saidas.map((s) => `${s.rede_id}:${s.linhas}`).join(', '))
    log('xlsx0:', saidas[0]?.xlsx.length, 'pdf0:', saidas[0]?.pdf.length)

    await enfileirarSaidas('2026-05-20', saidas)
    const fila = await listarFila()
    log('fila itens:', fila.length, 'pendentes:', fila.filter((f) => f.status === 'pendente').length)
    log(saidas.length > 0 && saidas[0].xlsx.length > 0 ? 'OK_ALL' : 'FALHOU')
  } catch (e) {
    log('ERRO', e instanceof Error ? e.stack : String(e))
  }
  app.quit()
})
