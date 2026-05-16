import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // pdf-parse usa require dinâmico do pdfjs-dist; precisa ser externo pra
  // não passar pelo bundler (resolve "Cannot find module as expression is too dynamic")
  serverExternalPackages: ['pdf-parse'],
}

export default nextConfig
