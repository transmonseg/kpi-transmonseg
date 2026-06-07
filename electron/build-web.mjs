// Build do site Next em modo STANDALONE para empacotar no app desktop, de forma
// cross-platform (no Windows não dá pra prefixar `NEXT_OUTPUT=... next build`).
// Roda `next build` com NEXT_OUTPUT=standalone e, em seguida, copia static/public
// pra dentro do .next/standalone (prepare-standalone.mjs).
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Grava as vars PÚBLICAS do Supabase (URL + anon) num runtime.env que vai dentro
// do app empacotado (electron/dist é incluído no asar). O servidor Next embutido
// lê isso em runtime — sem elas, login/auth não funcionam numa máquina sem
// .env.local. São públicas (já vão no bundle do cliente); a SERVICE key NUNCA é
// gravada aqui (fica como variável de ambiente da máquina — ver README).
function escreverRuntimeEnv() {
  const envLocal = path.join(repo, '.env.local')
  if (!existsSync(envLocal)) {
    console.warn('[build-web] .env.local ausente — runtime.env não gerado (app empacotado precisará das vars no ambiente).')
    return
  }
  const linhas = readFileSync(envLocal, 'utf8').split(/\r?\n/)
  const publicas = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']
  const out = []
  for (const l of linhas) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l)
    if (m && publicas.includes(m[1])) out.push(`${m[1]}=${m[2]}`)
  }
  const distDir = path.join(repo, 'electron', 'dist')
  if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true })
  writeFileSync(path.join(distDir, 'runtime.env'), out.join('\n') + '\n', 'utf8')
  console.log(`[build-web] runtime.env gravado (${out.length} vars públicas)`)
}

// `useShell` resolve o `next.cmd` no Windows. NÃO usar shell quando o cmd é um
// caminho absoluto com espaço (ex.: C:\Program Files\nodejs\node.exe) — o shell
// quebraria no espaço. Por isso o prepare roda sem shell.
function run(cmd, args, { env, useShell } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      cwd: repo,
      stdio: 'inherit',
      shell: !!useShell && process.platform === 'win32',
      env: { ...process.env, ...env },
    })
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} saiu com código ${code}`))))
    p.on('error', reject)
  })
}

await run('next', ['build'], { env: { NEXT_OUTPUT: 'standalone' }, useShell: true })
await run(process.execPath, [path.join(repo, 'electron', 'prepare-standalone.mjs')])
escreverRuntimeEnv()
console.log('[build-web] OK → .next/standalone pronto')
