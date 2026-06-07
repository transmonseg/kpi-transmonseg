// Hook afterPack do electron-builder.
//
// O electron-builder se RECUSA a copiar pastas `node_modules` via extraResources
// (mesmo com filter "**/*") — o standalone do Next ficava sem o `node_modules` e o
// server.js quebrava com "Cannot find module 'next'". Solução: copiar o
// `.next/standalone` INTEIRO (server.js + .next + node_modules + static/public)
// aqui, manualmente, depois do empacotamento — sem passar pelo filtro dele.
const path = require('node:path')
const fs = require('node:fs')

exports.default = async function afterPack(context) {
  const repo = path.resolve(__dirname, '..')
  const src = path.join(repo, '.next', 'standalone')
  const dest = path.join(context.appOutDir, 'resources', 'standalone')

  if (!fs.existsSync(path.join(src, 'server.js'))) {
    throw new Error(`afterPack: standalone ausente em ${src}. Rode o build-web antes.`)
  }
  // Recria do zero pra não deixar resíduo de builds anteriores.
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(src, dest, { recursive: true })

  const temNext = fs.existsSync(path.join(dest, 'node_modules', 'next', 'package.json'))
  console.log(`[afterPack] standalone copiado → ${dest} (node_modules/next: ${temNext ? 'OK' : 'FALTANDO!'})`)
  if (!temNext) throw new Error('afterPack: node_modules/next não foi copiado — server.js vai falhar.')
}
