import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  // Build standalone (server.js auto-contido) APENAS para empacotar o app desktop
  // (Electron). Inerte na Vercel — só liga quando NEXT_OUTPUT=standalone.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  turbopack: {
    root: path.resolve(__dirname),
  },
  // pdf-parse usa require dinâmico do pdfjs-dist; precisa ser externo pra
  // não passar pelo bundler (resolve "Cannot find module as expression is too dynamic")
  serverExternalPackages: ['pdf-parse', '@react-pdf/renderer'],
  // O gerador de KPI lê src/assets/kpi-template.xlsx em runtime via readFile —
  // força o Next a empacotar a pasta na função serverless dos endpoints de KPI.
  outputFileTracingIncludes: {
    '/api/kpi/simples': ['./src/assets/**'],
    '/api/kpi/preview': ['./src/assets/**'],
  },
}

export default nextConfig
