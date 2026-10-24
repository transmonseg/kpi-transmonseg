// F2-13 (KRQ-12, plano mestre 23/10): a serie da RQ (82–86% -> 91–93%) e a da
// Nutry (97,0–98,1 em 01–05/10 x regras de 06/10) misturam versoes das regras.
// O resultado do Ao vivo guarda a versao (commit) e a tela avisa quando o dia
// foi calculado com outra versao.
import { describe, it, expect } from 'vitest'
import { versaoDasRegras, CAMINHOS_REGRAS } from './versao-regras'
import { avisoVersaoRegras } from './versao-regras-aviso'

describe('versaoDasRegras', () => {
  it('ultimo commit que mexeu nas regras (sem testes/fixtures), curto', () => {
    const chamadas: string[][] = []
    const v = versaoDasRegras({ env: {}, executar: args => { chamadas.push(args); return '0f495b4\n' } })
    expect(v).toBe('0f495b4')
    expect(chamadas[0].slice(0, 4)).toEqual(['log', '-1', '--format=%h', '--'])
    expect(chamadas[0]).toEqual(expect.arrayContaining(['src/lib/kpi-romaneio', 'src/lib/kpi-rioquality', ':!*.test.ts']))
    expect(CAMINHOS_REGRAS).toContain('src/lib/kpi')
  })
  it('KPI_REGRAS_VERSAO no ambiente vence o git', () => {
    expect(versaoDasRegras({ env: { KPI_REGRAS_VERSAO: 'abc1234' }, executar: () => { throw new Error('nao chama') } })).toBe('abc1234')
  })
  it('sem git (pasta do teste a seco, git ausente): null, nunca quebra o calculo', () => {
    expect(versaoDasRegras({ env: {}, executar: () => { throw new Error('not a git repository') } })).toBeNull()
    expect(versaoDasRegras({ env: {}, executar: () => '  \n' })).toBeNull()
  })
})

describe('avisoVersaoRegras', () => {
  it('mesma versao: sem aviso', () => {
    expect(avisoVersaoRegras('0f495b4', '0f495b4')).toBeNull()
  })
  it('versao diferente: avisa com as duas', () => {
    const a = avisoVersaoRegras('eb195c4', '0f495b4')!
    expect(a).toContain('eb195c4')
    expect(a).toContain('0f495b4')
    expect(a).toMatch(/não é comparável/i)
  })
  it('dia sem registro da versao (calculado antes do F2-13): avisa', () => {
    expect(avisoVersaoRegras(undefined, '0f495b4')).toMatch(/sem registro da versão/i)
  })
  it('versao atual desconhecida: nao da pra comparar, sem aviso', () => {
    expect(avisoVersaoRegras('eb195c4', null)).toBeNull()
  })
})
