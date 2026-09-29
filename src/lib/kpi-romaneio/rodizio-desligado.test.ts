import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Decisao 29/09 (usuario/Ana): Nutry Max nao tem placa trocada/compartilhada,
// entao `reconhecerRodizio` (arg posicional de montarDetalheEntregas) fica
// DESLIGADO nos dois chamadores de producao.
function argRodizio(arquivo: string): string {
  const src = readFileSync(join(process.cwd(), arquivo), 'utf8')
  const marca = 'reconhecerRodizio em agregacao.ts.'
  const i = src.indexOf(marca)
  expect(i).toBeGreaterThan(-1)
  const resto = src.slice(i + marca.length)
  const linhas = resto.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'))
  return linhas[0].replace(/,$/, '')
}

describe('reconhecerRodizio desligado em producao', () => {
  it('route passa false', () => {
    expect(argRodizio('src/app/api/kpi/nutrimax/gerar/route.ts')).toBe('false')
  })
  it('CLI passa false', () => {
    expect(argRodizio('scripts/gerar-nutrimax-real-arquivo.ts')).toBe('false')
  })
})
