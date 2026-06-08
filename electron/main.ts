import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { createServer } from 'node:net'
import http from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { carregarCadastroLocal, atualizarCadastroSeOnline, statusCadastro } from './cadastro'
import { enfileirarSaidas, listarFila, sincronizarFila } from './fila-upload'
import { gerarKpiLocalPreview, type GerarOfflineReq } from './gerar-offline'

// ─── Ambiente ────────────────────────────────────────────────────────────────
// Em dev, carrega o .env.local do repo (Supabase URL/chave). Empacotado, as vars
// vêm do ambiente do operador (ou de um .env ao lado do executável, se existir).
// Parser .env simples (KEY=VALUE por linha), SEM dependência — `dotenv` é devDep e
// não vai pro app empacotado. Não sobrescreve vars já definidas (ambiente do SO e
// arquivos carregados antes têm precedência).
function carregarArquivoEnv(p: string) {
  if (!existsSync(p)) return
  let txt: string
  try { txt = readFileSync(p, 'utf8') } catch { return }
  for (const linha of txt.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha)
    if (!m) continue
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val
  }
}

function carregarEnv() {
  // runtime.env (vars PÚBLICAS do Supabase) viaja junto do bundle — garante login
  // funcionando no app empacotado mesmo sem .env.local na máquina. .env.local (dev)
  // e o ambiente do SO têm precedência (carregados antes / não sobrescritos).
  if (!app.isPackaged) carregarArquivoEnv(path.join(app.getAppPath(), '.env.local'))
  else {
    carregarArquivoEnv(path.join(process.resourcesPath, '.env'))
    carregarArquivoEnv(path.join(path.dirname(app.getPath('exe')), '.env'))
  }
  // Fallback público (sempre por último — só preenche o que ainda falta).
  carregarArquivoEnv(path.join(__dirname, 'runtime.env'))
}

// Pasta do build standalone do Next (server.js + .next + node_modules + static/public).
function standaloneDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'standalone')
    : path.join(app.getAppPath(), '.next', 'standalone')
}

// Assets do KPI (template xlsx + logo) — usados pela geração offline.
function assetsDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(app.getAppPath(), 'src', 'assets')
}

let serverProc: ChildProcess | null = null
let serverPort = 0
let win: BrowserWindow | null = null

// Porta TCP livre no loopback.
function portaLivre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const porta = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => resolve(porta))
    })
  })
}

// Espera o servidor Next aceitar conexões (poll HTTP até responder ou timeout).
function esperarServidor(porta: number, timeoutMs = 30000): Promise<void> {
  const inicio = Date.now()
  return new Promise((resolve, reject) => {
    const tentar = () => {
      const req = http.get({ host: '127.0.0.1', port: porta, path: '/', timeout: 2000 }, (res) => {
        res.destroy()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() - inicio > timeoutMs) reject(new Error('Servidor Next não subiu a tempo.'))
        else setTimeout(tentar, 300)
      })
      req.on('timeout', () => { req.destroy(); setTimeout(tentar, 300) })
    }
    tentar()
  })
}

// Sobe o server.js standalone como processo Node (Electron rodando como node).
async function iniciarServidor(): Promise<number> {
  const dir = standaloneDir()
  const serverJs = path.join(dir, 'server.js')
  if (!existsSync(serverJs)) {
    throw new Error(
      `server.js não encontrado em ${dir}.\n` +
      'Rode `npm run app:bundle` (que faz o build standalone) antes de abrir o app.',
    )
  }

  const porta = await portaLivre()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    PORT: String(porta),
    HOSTNAME: '127.0.0.1',
    // Sinaliza pro código compartilhado (middleware/layout/rotas) o modo desktop.
    // Tudo que olha essa flag é no-op no site quando ela não está setada.
    DESKTOP_APP: '1',
    KPI_ASSETS_DIR: assetsDir(),
  }

  serverProc = spawn(process.execPath, [serverJs], { cwd: dir, env, stdio: 'inherit' })
  serverProc.on('exit', (code) => {
    if (code && code !== 0) console.error(`[next] servidor saiu com código ${code}`)
    serverProc = null
  })

  await esperarServidor(porta)
  return porta
}

function createWindow(porta: number) {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    title: 'KPI TransMonSeg',
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.removeMenu()

  // Links externos (mailto, http externo) abrem no navegador do SO, não na janela.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${porta}`)) {
      void shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // Abre direto na tela Gerar KPI (trabalho do dia, funciona offline). As telas de
  // nuvem (Dashboard/Histórico) ficam acessíveis pela navegação, mas dependem de
  // internet + chave — por isso não são a tela inicial.
  void win.loadURL(`http://127.0.0.1:${porta}/painel/kpi/simples`)
}

// ─── IPC: cadastro + fila + geração offline ──────────────────────────────────
function registerIpc() {
  ipcMain.handle('cadastro-status', async () => statusCadastro())
  ipcMain.handle('cadastro-atualizar', async () => atualizarCadastroSeOnline())
  ipcMain.handle('fila-listar', async () => listarFila())
  ipcMain.handle('fila-sincronizar', async () => sincronizarFila())

  // Geração OFFLINE: recebe os arquivos (buffers) + data + alterações da tela real,
  // roda o motor local (gerarKpiLocal) e devolve o MESMO formato RedeResult[] que a
  // UI já renderiza (base64 xlsx/pdf + preview por linha). Enfileira pra subir depois.
  ipcMain.handle('gerar-offline', async (_e, req: GerarOfflineReq) => {
    try {
      const cadastro = await carregarCadastroLocal()
      const redes = await gerarKpiLocalPreview(req, cadastro)
      if (redes.length > 0) {
        await enfileirarSaidas(
          req.data,
          redes.map((r) => ({
            rede_id: r.rede_id,
            rede_nome: r.rede_nome,
            xlsx: Buffer.from(r.xlsxBase64, 'base64'),
            xlsx_com_cd: r.xlsxComChegadaBase64 ? Buffer.from(r.xlsxComChegadaBase64, 'base64') : Buffer.alloc(0),
            pdf: Buffer.from(r.pdfBase64, 'base64'),
            pdf_com_cd: r.pdfComChegadaBase64 ? Buffer.from(r.pdfComChegadaBase64, 'base64') : Buffer.alloc(0),
            linhas: r.qtd_rotas,
          })),
        )
      }
      return { ok: true, redes }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}

app.whenReady().then(async () => {
  carregarEnv()
  registerIpc()
  try {
    serverPort = await iniciarServidor()
    createWindow(serverPort)
  } catch (e) {
    // Sem servidor não há app — mostra o erro numa janela mínima.
    win = new BrowserWindow({ width: 720, height: 420, title: 'KPI TransMonSeg — erro' })
    win.removeMenu()
    const msg = e instanceof Error ? e.message : String(e)
    void win.loadURL('data:text/html,' + encodeURIComponent(
      `<body style="font-family:system-ui;background:#0b1220;color:#e5e7eb;padding:40px">
       <h2>Não consegui iniciar o app</h2><pre style="white-space:pre-wrap">${msg}</pre></body>`,
    ))
  }

  // Best-effort: atualiza o cadastro e sobe a fila ao abrir (se online).
  void atualizarCadastroSeOnline()
  void sincronizarFila()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverPort) createWindow(serverPort)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (serverProc) { serverProc.kill(); serverProc = null }
})
