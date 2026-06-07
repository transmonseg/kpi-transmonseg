// Build do site Next em modo STANDALONE para empacotar no app desktop, de forma
// cross-platform (no Windows não dá pra prefixar `NEXT_OUTPUT=... next build`).
// Roda `next build` com NEXT_OUTPUT=standalone e, em seguida, copia static/public
// pra dentro do .next/standalone (prepare-standalone.mjs).
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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
console.log('[build-web] OK → .next/standalone pronto')
