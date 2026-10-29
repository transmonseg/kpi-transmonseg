import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { META_KPI_POR_CLIENTE, META_KPI_PADRAO, metaDoCliente, faltamParaMeta, textoFaltamMeta } from './metas'

// F3-02 (ACH-03, AC-06), D-01 (plano mestre 23/10): meta numa constante única
// por cliente -- Nutry 97 (o que a operação persegue), RQ 93 (provisória).
describe('metas do KPI por cliente (D-01)', () => {
  it('Nutry 97, RQ 93; cliente sem decisão (Porto Frio, D-21) fica no padrão antigo 95', () => {
    expect(META_KPI_POR_CLIENTE.nutrimax).toBe(97)
    expect(META_KPI_POR_CLIENTE.rioquality).toBe(93)
    expect(metaDoCliente('nutrimax')).toBe(97)
    expect(metaDoCliente('rioquality')).toBe(93)
    expect(metaDoCliente('portefrio')).toBe(META_KPI_PADRAO)
    expect(META_KPI_PADRAO).toBe(95)
  })
})

describe('faltamParaMeta = ceil(meta × na conta) − entregues', () => {
  it('Nutry 22/10 (gravado): 2.183/2.253, meta 97 -> faltam 3 (a IA da Érica disse 4)', () => {
    // ceil(0,97 × 2.253) = ceil(2.185,41) = 2.186; 2.186 − 2.183 = 3.
    expect(faltamParaMeta(97, 2253, 2183)).toBe(3)
  })
  it('Nutry 22/10 com a regra D-04 (LLD4202 fora da conta): 2.183/2.252 -> faltam 2', () => {
    expect(faltamParaMeta(97, 2252, 2183)).toBe(2)
  })
  it('RQ 22/10: 2.633/2.881, meta 93 -> faltam 47', () => {
    expect(faltamParaMeta(93, 2881, 2633)).toBe(47)
  })
  it('conta exata não arredonda para cima por erro de ponto flutuante (97 de 100 = meta batida)', () => {
    expect(faltamParaMeta(97, 100, 97)).toBe(0)
    expect(faltamParaMeta(93, 300, 279)).toBe(0)
    expect(faltamParaMeta(97, 100, 96)).toBe(1)
  })
  it('acima da meta e dia vazio dão 0, nunca negativo', () => {
    expect(faltamParaMeta(97, 2253, 2253)).toBe(0)
    expect(faltamParaMeta(97, 0, 0)).toBe(0)
  })
})

describe('Dashboard sem o 95 fixo (F3-02)', () => {
  const ler = (f: string) => readFileSync(path.resolve(__dirname, '../../app/painel/dashboard-kpi', f), 'utf8')
  it('visao-geral.tsx e graficos.tsx leem a meta do cliente', () => {
    const vg = ler('visao-geral.tsx'), gr = ler('graficos.tsx')
    expect(vg).not.toMatch(/const META = 95/)
    expect(vg).not.toMatch(/≥95%/)
    expect(vg).toMatch(/metaDoCliente\(cliente\)/)
    expect(gr).not.toMatch(/meta = 95/)
  })
})

describe('textoFaltamMeta', () => {
  it('dia em andamento: explica que conta as que ainda estão aguardando', () => {
    expect(textoFaltamMeta(884, 97, 941)).toBe('faltam 884 entregas no dia para a meta de 97% (contando as 941 que ainda estão aguardando)')
  })
  it('dia fechado: texto curto', () => {
    expect(textoFaltamMeta(3, 97, 0)).toBe('faltam 3 para a meta de 97%')
  })
})
