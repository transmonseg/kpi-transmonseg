import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // pdf-parse usa require dinâmico do pdfjs-dist; precisa ser externo pra
  // não passar pelo bundler (resolve "Cannot find module as expression is too dynamic")
  serverExternalPackages: ['pdf-parse'],
  // O gerador de KPI lê src/assets/kpi-template.xlsx em runtime via readFile —
  // força o Next a empacotar a pasta na função serverless dos endpoints de KPI.
  outputFileTracingIncludes: {
    '/api/kpi/simples': ['./src/assets/**'],
    '/api/kpi/preview': ['./src/assets/**'],
  },
}

export default nextConfig
