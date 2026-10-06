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
  // 06/10: o calculo da rota mora em gerar-nutrimax.ts (funcao unica).
  it('gerarKpiNutrimax (usado pela rota) passa false', () => {
    expect(argRodizio('src/lib/kpi-romaneio/gerar-nutrimax.ts')).toBe('false')
  })
  it('a rota usa gerarKpiNutrimax (nao tem calculo proprio)', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/kpi/nutrimax/gerar/route.ts'), 'utf8')
    expect(src).toContain('gerarKpiNutrimax(')
    expect(src).not.toContain('montarDetalheEntregas(')
  })
  it('o script de regeracao tambem usa gerarKpiNutrimax (sem copia do calculo)', () => {
    const src = readFileSync(join(process.cwd(), 'scripts/gerar-nutrimax-real-arquivo.ts'), 'utf8')
    expect(src).toContain('gerarKpiNutrimax(')
    expect(src).not.toContain('montarDetalheEntregas(')
  })
})
