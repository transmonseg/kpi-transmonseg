import { describe, it, expect } from 'vitest'
import { avisosQueBloqueiamPublicacao, LIMITE_GEOCODE_PARCIAL_BLOQUEIA, precisaRepetirFechamentoProvisorio, PREFIXO_FECHAMENTO_PROVISORIO, textoFechamentoProvisorio } from './publicacao'
import type { AvisoDescasamento } from './types'

const a = (x: Partial<AvisoDescasamento> & { motivo: AvisoDescasamento['motivo'] }): AvisoDescasamento => ({ carga: '—', placa: '—', ...x })

// KPI-05 (auditoria 03/11): fechamento não publica como oficial com fonte incompleta.
describe('avisosQueBloqueiamPublicacao', () => {
  it('ponte sem resposta, coletor fora, consulta de posições suspeita e fonte que não leu bloqueiam', () => {
    const avisos = [
      a({ motivo: 'ponte_falhou', placasSemPonte: 2 }),
      a({ motivo: 'coletor_fora', intervalo: '08:00–09:30' }),
      a({ motivo: 'consulta_posicoes_suspeita', semSinal: 20, totalPlacas: 40 }),
      a({ motivo: 'fonte_indisponivel', fonte: 'trocas_placa' }),
    ]
    expect(avisosQueBloqueiamPublicacao(avisos, 2000).map(x => x.motivo)).toEqual(['ponte_falhou', 'coletor_fora', 'consulta_posicoes_suspeita', 'fonte_indisponivel'])
  })
  it('território indisponível não bloqueia (tem a reconferência das 05:30) e aviso operacional também não', () => {
    expect(avisosQueBloqueiamPublicacao([
      a({ motivo: 'fonte_indisponivel', fonte: 'territorio' }),
      a({ motivo: 'motorista_multiplas_placas', motorista: 'X', placas: ['A', 'B'] }),
      a({ motivo: 'linhas_repetidas', linhasRepetidas: 116 }),
    ], 2000)).toEqual([])
  })
  it(`geocode parcial: só bloqueia acima de ${LIMITE_GEOCODE_PARCIAL_BLOQUEIA * 100}% das NFs do dia (Photon tem ~130 timeouts/dia)`, () => {
    expect(LIMITE_GEOCODE_PARCIAL_BLOQUEIA).toBe(0.02)
    expect(avisosQueBloqueiamPublicacao([a({ motivo: 'geocode_parcial', enderecosParciais: 20 })], 2000)).toEqual([]) // 1%
    expect(avisosQueBloqueiamPublicacao([a({ motivo: 'geocode_parcial', enderecosParciais: 60 })], 2000)).toHaveLength(1) // 3%
  })
  it('geocode parcial com a ponte fora para tudo (parciais = todas as NFs) bloqueia', () => {
    expect(avisosQueBloqueiamPublicacao([a({ motivo: 'geocode_parcial', enderecosParciais: 30 })], 30)).toHaveLength(1)
  })
})

describe('fechamento provisório repete no próximo tick', () => {
  const calc = '2026-10-31T03:31:00Z' // 00:31 BRT de 31/10, fechamento de 30/10
  const row = (ultimo_erro: string | null, ultimo_erro_em: string | null = calc) => ({ calculado_em: calc, ultimo_erro, ultimo_erro_em })
  const texto = textoFechamentoProvisorio(['Monitoramento não respondeu para 2 placa(s)'])
  it('o texto começa pelo prefixo e diz o motivo', () => {
    expect(texto.startsWith(PREFIXO_FECHAMENTO_PROVISORIO)).toBe(true)
    expect(texto).toContain('Monitoramento não respondeu para 2 placa(s)')
  })
  it('provisório gravado pelo último cálculo: repete no próximo tick da manhã', () => {
    expect(precisaRepetirFechamentoProvisorio(row(texto), '2026-10-30', Date.parse('2026-10-31T03:41:00Z'))).toBe(true)
  })
  it('sem provisório, ou aviso de cálculo antigo: não repete', () => {
    expect(precisaRepetirFechamentoProvisorio(row(null), '2026-10-30', Date.parse('2026-10-31T03:41:00Z'))).toBe(false)
    expect(precisaRepetirFechamentoProvisorio(row(texto, '2026-10-31T03:00:00Z'), '2026-10-30', Date.parse('2026-10-31T03:41:00Z'))).toBe(false)
  })
  it('depois do meio-dia de D+1 para de repetir (fica provisório para a operação olhar)', () => {
    expect(precisaRepetirFechamentoProvisorio(row(texto), '2026-10-30', Date.parse('2026-10-31T15:01:00Z'))).toBe(false)
  })
})

describe('fechamento provisório junto com território fora', () => {
  it('o texto do território fica no início e o provisório também é achado', () => {
    const t = `Conferência de endereço indisponível: x | ${textoFechamentoProvisorio(['y'])}`
    const row = { calculado_em: '2026-10-31T03:31:00Z', ultimo_erro: t, ultimo_erro_em: '2026-10-31T03:31:00Z' }
    expect(precisaRepetirFechamentoProvisorio(row, '2026-10-30', Date.parse('2026-10-31T03:41:00Z'))).toBe(true)
  })
})
