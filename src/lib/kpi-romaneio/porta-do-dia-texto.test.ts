import { describe, it, expect } from 'vitest'
import { textoPortaDoDia, diaAnterior } from './porta-do-dia-texto'

describe('textoPortaDoDia (F3-05)', () => {
  it('gravado e monitoramento ok', () => {
    expect(textoPortaDoDia('gravado', 'ok', 'nutrimax')).toBe('O dia também foi para o Ao vivo e o monitoramento.')
  })
  it('gravado sem PDF novo para o monitoramento (só escala mudou) conta como ok', () => {
    expect(textoPortaDoDia('gravado', 'nao', 'nutrimax')).toBe('O dia também foi para o Ao vivo e o monitoramento.')
  })
  it('monitoramento falhou: Nutry tem reparo no tick, RQ manda subir no Ao vivo', () => {
    expect(textoPortaDoDia('gravado', 'falhou', 'nutrimax')).toMatch(/10 minutos/)
    expect(textoPortaDoDia('gravado', 'falhou', 'rioquality')).toMatch(/suba a planilha de novo no Ao vivo/)
  })
  it('igual: nada reenviado', () => {
    expect(textoPortaDoDia('igual', 'nao', 'rioquality')).toMatch(/já tinha/)
  })
  it('dia passado ou rota antiga sem cabeçalho: nada', () => {
    expect(textoPortaDoDia('nao', 'nao', 'nutrimax')).toBeNull()
    expect(textoPortaDoDia(null, null, 'nutrimax')).toBeNull()
  })
})

describe('diaAnterior', () => {
  it('vira o mês', () => {
    expect(diaAnterior('2026-11-01')).toBe('2026-10-31')
    expect(diaAnterior('2026-10-24')).toBe('2026-10-23')
  })
})
