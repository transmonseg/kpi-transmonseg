// Bundla o main e o preload do Electron com esbuild.
// - Resolve os aliases `@/` (via tsconfig paths) → bundla `src/lib` no .cjs.
// - `packages: 'external'` mantém node_modules (exceljs/pdf-parse/pdf-lib/...) fora
//   do bundle (ficam no node_modules empacotado pelo electron-builder).
// - O site Next/Vercel NÃO usa nada disto — é build separado.
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const watch = process.argv.includes('--watch')

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  packages: 'external',
  tsconfig: path.join(root, 'electron', 'tsconfig.json'),
  logLevel: 'info',
}

const entries = [
  { in: path.join(root, 'electron', 'main.ts'), out: path.join(root, 'electron', 'dist', 'main.cjs') },
  { in: path.join(root, 'electron', 'preload.ts'), out: path.join(root, 'electron', 'dist', 'preload.cjs') },
]

for (const e of entries) {
  await build({ ...shared, entryPoints: [e.in], outfile: e.out })
}

if (watch) {
  console.log('[electron/build] watch não implementado no MVP; rode o script de novo após editar.')
}
console.log('[electron/build] OK → electron/dist/{main,preload}.cjs')
