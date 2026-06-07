// Pós-build do Next standalone: o `next build` (output:standalone) gera
// `.next/standalone/server.js` com um node_modules tracejado, MAS não copia
// os assets estáticos nem a pasta public — o server.js espera encontrá-los
// como irmãos (ele faz chdir pra própria pasta). Este script copia:
//   .next/static  -> .next/standalone/.next/static
//   public        -> .next/standalone/public
// Roda depois de `NEXT_OUTPUT=standalone next build`, tanto em dev quanto no
// empacotamento. Idempotente.
import { cp, access, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const standalone = path.join(repo, '.next', 'standalone')

async function exists(p) {
  try { await access(p, constants.F_OK); return true } catch { return false }
}

async function main() {
  if (!(await exists(path.join(standalone, 'server.js')))) {
    throw new Error(
      'Standalone não encontrado. Rode `NEXT_OUTPUT=standalone next build` antes.',
    )
  }

  // .next/static (chunks, css) → dentro do .next do standalone
  const staticSrc = path.join(repo, '.next', 'static')
  const staticDst = path.join(standalone, '.next', 'static')
  if (await exists(staticSrc)) {
    await rm(staticDst, { recursive: true, force: true })
    await cp(staticSrc, staticDst, { recursive: true })
    console.log('[prepare-standalone] copiado .next/static')
  }

  // public (favicon, imagens, etc.) → raiz do standalone
  const publicSrc = path.join(repo, 'public')
  const publicDst = path.join(standalone, 'public')
  if (await exists(publicSrc)) {
    await rm(publicDst, { recursive: true, force: true })
    await cp(publicSrc, publicDst, { recursive: true })
    console.log('[prepare-standalone] copiado public')
  }

  console.log('[prepare-standalone] OK')
}

main().catch((e) => {
  console.error('[prepare-standalone] FALHOU:', e.message)
  process.exit(1)
})
