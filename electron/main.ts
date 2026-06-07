import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gerarKpiLocal } from '@/lib/kpi/gerar-kpi-local'
import { carregarCadastroLocal, atualizarCadastroSeOnline, statusCadastro } from './cadastro'
import { enfileirarSaidas, listarFila, sincronizarFila } from './fila-upload'

// Em dev, carrega as variáveis do repo (.env.local) — Supabase URL/chave pro
// snapshot do cadastro e pra fila. Empacotado, as vars vêm do ambiente do operador.
if (!app.isPackaged) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('dotenv').config({ path: path.join(app.getAppPath(), '.env.local') })
  } catch {
    /* dotenv é devDep — ausência não quebra o app */
  }
}

// Assets do KPI (template xlsx + logo). Em dev ficam em src/assets do repo; quando
// empacotado, o electron-builder copia pra `resources/assets` (ver electron-builder.yml).
const ASSETS_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(app.getAppPath(), 'src', 'assets')
process.env.KPI_ASSETS_DIR = ASSETS_DIR

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    title: 'KPI TransMonSeg',
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.removeMenu()
  void win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
}

type GerarReq = {
  escalaPaths: string[]
  unitracPaths: string[]
  data: string
}

function registerIpc() {
  // Abre o seletor de arquivos (escala/Unitrac: xlsx ou pdf).
  ipcMain.handle('escolher-arquivos', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Escolher arquivos (escala / Unitrac)',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Planilhas e PDFs', extensions: ['xlsx', 'xls', 'pdf'] }],
    })
    return r.canceled ? [] : r.filePaths
  })

  // Status do snapshot do cadastro (data do último download + nº de lojas).
  ipcMain.handle('cadastro-status', async () => statusCadastro())

  // Força atualizar o snapshot do cadastro (se houver internet).
  ipcMain.handle('cadastro-atualizar', async () => atualizarCadastroSeOnline())

  // Lista a fila de upload (KPIs gerados aguardando subir).
  ipcMain.handle('fila-listar', async () => listarFila())

  // Sincroniza a fila com o Supabase (sobe os pendentes).
  ipcMain.handle('fila-sincronizar', async () => sincronizarFila())

  // Gera o KPI offline e salva os arquivos numa pasta escolhida.
  ipcMain.handle('gerar', async (_e, req: GerarReq) => {
    try {
      if (!req.escalaPaths?.length) return { ok: false, error: 'Escolha ao menos uma escala.' }
      if (!req.unitracPaths?.length) return { ok: false, error: 'Escolha ao menos um relatório Unitrac.' }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.data || '')) return { ok: false, error: 'Data inválida (use AAAA-MM-DD).' }

      const escalas = await Promise.all(
        req.escalaPaths.map(async (p) => ({ nome: path.basename(p), buffer: await readFile(p) })),
      )
      const unitracs = await Promise.all(
        req.unitracPaths.map(async (p) => ({ nome: path.basename(p), buffer: await readFile(p) })),
      )

      const cadastro = await carregarCadastroLocal()
      const saidas = await gerarKpiLocal({ escalas, unitracs, cadastro, data: req.data })
      if (saidas.length === 0) return { ok: false, error: 'Nada gerado (escala/Unitrac não casaram em nenhuma rede).' }

      // Pasta destino.
      const dest = await dialog.showOpenDialog(win!, {
        title: 'Onde salvar os KPIs?',
        properties: ['openDirectory', 'createDirectory'],
      })
      if (dest.canceled || !dest.filePaths[0]) return { ok: false, error: 'Salvamento cancelado.' }
      const outDir = dest.filePaths[0]

      const salvos: string[] = []
      for (const s of saidas) {
        const base = `KPI-${s.rede_id}-${req.data}`
        await writeFile(path.join(outDir, `${base}.xlsx`), s.xlsx)
        await writeFile(path.join(outDir, `${base}.pdf`), s.pdf)
        salvos.push(base)
      }

      // Enfileira pra subir ao Supabase quando houver internet.
      await enfileirarSaidas(req.data, saidas)

      return {
        ok: true,
        outDir,
        redes: saidas.map((s) => ({ rede_id: s.rede_id, rede_nome: s.rede_nome, linhas: s.linhas })),
        cadastro: await statusCadastro(),
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  // Best-effort: tenta atualizar o cadastro e subir a fila ao abrir (se online).
  void atualizarCadastroSeOnline()
  void sincronizarFila()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
