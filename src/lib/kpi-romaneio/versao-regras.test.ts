// F2-13 (KRQ-12, plano mestre 23/10): a serie da RQ (82–86% -> 91–93%) e a da
// Nutry (97,0–98,1 em 01–05/10 x regras de 06/10) misturam versoes das regras.
// O resultado do Ao vivo guarda a versao (commit) e a tela avisa quando o dia
// foi calculado com outra versao.
import { describe, it, expect, vi } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { versaoDasRegras, CAMINHOS_REGRAS } from './versao-regras'
import { avisoVersaoRegras } from './versao-regras-aviso'

describe('versaoDasRegras', () => {
  it('ultimo commit que mexeu nas regras (sem testes/fixtures), curto', () => {
    const chamadas: string[][] = []
    const v = versaoDasRegras({ env: {}, executar: args => { chamadas.push(args); return '0f495b4\n' } })
    expect(v).toBe('0f495b4')
    expect(chamadas[0].slice(0, 4)).toEqual(['log', '-1', '--format=%h', '--'])
    expect(chamadas[0]).toEqual(expect.arrayContaining(['src/lib/kpi-romaneio', 'src/lib/kpi-rioquality', ':(exclude,glob)**/*.test.ts']))
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
  it('versao diferente: avisa em texto simples, sem hash', () => {
    expect(avisoVersaoRegras('eb195c4', '0f495b4')).toBe('Este dia foi calculado com regras anteriores às atuais. A taxa dele pode não bater com a dos dias mais novos.')
  })
  it('dia sem registro da versao (calculado antes do F2-13): avisa', () => {
    expect(avisoVersaoRegras(undefined, '0f495b4')).toBe('Este dia foi calculado antes da atualização das regras de 24/10. A taxa dele pode não bater com a dos dias mais novos.')
  })
  it('versao atual desconhecida: nao da pra comparar, sem aviso', () => {
    expect(avisoVersaoRegras('eb195c4', null)).toBeNull()
  })
})

// F2-REV-08 (revisao independente da Fase 2): o pathspec pegava as pastas
// inteiras -- commit so' de tela/texto (relatorio-pendentes, investigacao-
// rotulos, a propria versao-regras) ou de fixture em __fixtures__/ trocava a
// versao e a tela dizia "não é comparável" entre dias com a mesma regra. E o
// git que falha no servidor (dubious ownership) era engolido calado.
describe('F2-REV-08: versão só muda com o que mexe na classificação', () => {
  it('repositório real: commits de texto/tela/fixture/teste não mudam a versão', () => {
    const dir = mkdtempSync(join(tmpdir(), 'versao-regras-'))
    const git = (args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const commitar = (arq: string) => {
      mkdirSync(dirname(join(dir, arq)), { recursive: true })
      writeFileSync(join(dir, arq), String(Math.random()))
      git(['add', '.'])
      git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', arq])
      return git(['log', '-1', '--format=%h']).trim()
    }
    try {
      git(['init', '-q'])
      const regra = commitar('src/lib/kpi-romaneio/agregacao.ts')
      for (const arq of [
        'src/lib/kpi-romaneio/relatorio-pendentes.ts', 'src/lib/kpi-romaneio/investigacao-rotulos.ts',
        'src/lib/kpi-romaneio/versao-regras.ts', 'src/lib/kpi-romaneio/versao-regras-aviso.ts',
        'src/lib/kpi-romaneio/__fixtures__/leituras-por-faixa-nutrimax.json', 'src/lib/fusion/__fixtures__/grade.json',
        'src/lib/kpi-romaneio/agregacao.test.ts', 'src/lib/kpi-romaneio/ao-vivo-busca.ts', 'src/app/painel/ao-vivo/page.tsx',
      ]) commitar(arq)
      expect(versaoDasRegras({ env: {}, executar: git })).toBe(regra)
      const outra = commitar('src/lib/kpi-rioquality/pipeline.ts')
      expect(versaoDasRegras({ env: {}, executar: git })).toBe(outra)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('git que falha (dubious ownership no servidor) vira aviso explícito, não silêncio', () => {
    const avisar = vi.fn()
    const v = versaoDasRegras({ env: {}, avisar, executar: () => { throw new Error("fatal: detected dubious ownership in repository at '/srv/kpi-transmonseg'") } })
    expect(v).toBeNull()
    expect(avisar).toHaveBeenCalledTimes(1)
    expect(avisar.mock.calls[0][0]).toMatch(/versão das regras/i)
    expect(avisar.mock.calls[0][0]).toMatch(/dubious ownership/)
  })
})
