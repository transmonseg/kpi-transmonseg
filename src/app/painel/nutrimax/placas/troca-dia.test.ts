import { describe, it, expect } from 'vitest'
import { payloadTrocaDoDia, mensagemDaTroca } from './troca-dia'

describe('payloadTrocaDoDia (D-28: Placas do dia pela rota do Ao vivo)', () => {
  it('com carga: redirecionar só aquela carga, no dia escolhido', () => {
    expect(payloadTrocaDoDia('2026-10-16', { placaEscala: 'rqo-5e38', placaReal: '5E38', carga: 'pao-7' }))
      .toEqual({ modo: 'redirecionar', data: '2026-10-16', carga: 'PAO-7', placaEscala: 'rqo-5e38', placaReal: '5E38' })
  })
  it('carga sem placa (F1-03): placa da escala vazia + carga', () => {
    expect(payloadTrocaDoDia('2026-10-22', { placaEscala: '', placaReal: 'RQM4C16', carga: 'PAO-6' }))
      .toEqual({ modo: 'redirecionar', data: '2026-10-22', carga: 'PAO-6', placaEscala: '', placaReal: 'RQM4C16' })
  })
  it('sem carga: substitui a placa inteira no dia', () => {
    expect(payloadTrocaDoDia('2026-10-16', { placaEscala: 'RBG8J72', placaReal: 'RBG4F53', carga: ' ' }))
      .toEqual({ modo: 'substituir', data: '2026-10-16', placaEscala: 'RBG8J72', placaB: 'RBG4F53' })
  })
  it('sem placa da escala e sem carga: erro', () => {
    expect(payloadTrocaDoDia('2026-10-16', { placaEscala: '', placaReal: 'RBG4F53', carga: '' })).toEqual({ erro: 'Carga sem placa: informe o número da carga.' })
  })
  it('sem a placa que rodou: erro', () => {
    expect(payloadTrocaDoDia('2026-10-16', { placaEscala: 'RBG8J72', placaReal: ' ', carga: '' })).toEqual({ erro: 'Informe a placa que rodou.' })
  })
})

describe('mensagemDaTroca (F1-05: pontos=0 vira erro visível)', () => {
  it('monitoramento ok', () => {
    expect(mensagemDaTroca({ ok: true, monitoramento: { ok: true, pontos: 8 } })).toEqual({ ok: true, texto: 'Troca registrada e 8 pontos passaram de carro no monitoramento. O KPI do dia recalcula em instantes.' })
  })
  it('monitoramento não moveu nada: erro', () => {
    const m = mensagemDaTroca({ ok: true, monitoramento: { ok: false, erro: 'nenhum ponto mudou de carro no monitoramento (9 notas de RQO5E38)' } })
    expect(m.ok).toBe(false)
    expect(m.texto).toMatch(/Monitoramento NÃO foi atualizado: nenhum ponto/)
  })
  it('substituir com movimento sem notas e outro com erro', () => {
    const m = mensagemDaTroca({ ok: true, movimentos: [{ de: 'A', para: 'B', semNotas: true, monitoramento: { ok: true, pontos: 0 } }, { de: 'B', para: 'A', monitoramento: { ok: false, erro: 'x' } }] })
    expect(m).toEqual({ ok: false, texto: 'Troca registrada, mas o monitoramento NÃO foi atualizado: A→B (sem notas no romaneio), B→A (x). O KPI do dia recalcula em instantes.' })
  })
  it('desfeita', () => {
    expect(mensagemDaTroca({ ok: true, modo: 'desfazer', monitoramento: { ok: true, pontos: 3 } }).texto).toMatch(/^Troca desfeita/)
  })
})
