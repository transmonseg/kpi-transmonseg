// D-03/D-04 (plano mestre 23/10, OK do dono 23/10 23:10): placa da escala
// que nao identifica um carro real da frota.
// - D-03: placa que nao existe na frota (RQO5E38 do carro 16, RQU8A12) continua
//   "sem rastreador = correta", com o rotulo "PLACA FORA DA FROTA" e a
//   sugestao do F1-04.
// - D-04: placa provisoria declarada (LLD4202, kpi_placa_sem_rastreador
//   "placa provisória: o Nelson põe nas cargas de RETIRADA...") e ficticia
//   (XXX0000 na Nutry, XXX5678 na Fusion) saem da taxa ate a operacao
//   informar o carro.
import { describe, it, expect } from 'vitest'
import { situacaoDaPlaca, marcarSituacaoPlaca, placaFicticia } from './placa-situacao'
import type { LinhaDetalheEntrega } from './types'

const d = (o: Partial<LinhaDetalheEntrega>): LinhaDetalheEntrega => ({
  carga: 'C1', placa: 'ABC1234', motorista: '', clienteCodigo: '', nf: '1', clienteNome: '', endereco: '',
  saidaCd: null, chegadaCd: null, tempoOperacaoMin: null, chegada: null, saida: null, tempoParadaMin: null,
  status: 'pendente', temRastreador: false, observacao: null, evidencia: 'sem_evidencia', distParadaM: null,
  motivo: '', confianca: 'NÃO CONFIRMADO', ...o,
})

describe('placaFicticia', () => {
  it('XXX0000 (Nutry) e XXX5678 (Fusion) sao ficticias; placa real nao', () => {
    expect(placaFicticia('XXX0000')).toBe(true)
    expect(placaFicticia('xxx-5678')).toBe(true)
    expect(placaFicticia('RQO5E38')).toBe(false)
    expect(placaFicticia('')).toBe(false)
  })
})

describe('situacaoDaPlaca', () => {
  it('ficticia pela propria placa, mesmo sem marca do chamador', () => {
    expect(situacaoDaPlaca(d({ placa: 'XXX0000' }))).toBe('ficticia')
  })
  it('a marca do chamador vale (provisoria, fora da frota); sem marca = null', () => {
    expect(situacaoDaPlaca(d({ placa: 'LLD4202', situacaoPlaca: 'provisoria' }))).toBe('provisoria')
    expect(situacaoDaPlaca(d({ placa: 'RQO5E38', situacaoPlaca: 'fora_da_frota' }))).toBe('fora_da_frota')
    expect(situacaoDaPlaca(d({ placa: 'LLD4202' }))).toBeNull()
  })
  it('carga sem placa nunca tem situacao de placa', () => {
    expect(situacaoDaPlaca(d({ placa: '', situacaoPlaca: 'provisoria' }))).toBeNull()
  })
})

describe('marcarSituacaoPlaca (Nutry 22/10 e 16/10)', () => {
  // Frota Unitrac 4096 (cv por placa): TOS5E38 e TTL5J17 existem; RQO5E38
  // (carro 16 digitado errado desde 15/10) e LLD4202 (provisoria) nao.
  const temCv = (p: string) => ['TOS5E38', 'TTL5J17', 'ABC1234'].includes(p)
  const detalhe = [
    d({ carga: '100689', placa: 'LLD4202', nf: '1' }),
    d({ carga: 'PAO-7', placa: 'RQO5E38', nf: '2' }),
    d({ carga: 'PAO-7', placa: 'RQO5E38', nf: '3' }),
    d({ carga: '99300', placa: 'TTL5J17', nf: '4' }),
    d({ carga: '100700', placa: 'ABC1234', nf: '5', temRastreador: true }),
    d({ carga: 'PAO-1', placa: '', nf: '6' }),
    d({ carga: '100800', placa: 'XXX0000', nf: '7' }),
  ]
  const marcado = marcarSituacaoPlaca(detalhe, {
    provisorias: new Set(['LLD4202']),
    temCv,
    sugestoes: [{ carga: 'PAO-7', placaEscala: 'RQO5E38', placaSugerida: 'TOS5E38' }],
  })
  const por = (nf: string) => marcado.find(x => x.nf === nf)!

  it('LLD4202 declarada provisoria', () => {
    expect(por('1').situacaoPlaca).toBe('provisoria')
  })
  it('RQO5E38 fora da frota com a sugestao do F1-04 (TOS5E38)', () => {
    expect(por('2')).toMatchObject({ situacaoPlaca: 'fora_da_frota', placaSugerida: 'TOS5E38' })
    expect(por('3').placaSugerida).toBe('TOS5E38')
  })
  it('TTL5J17 (na frota, declarada sem rastreador) e placa normal ficam sem marca', () => {
    expect(por('4').situacaoPlaca).toBeUndefined()
    expect(por('5').situacaoPlaca).toBeUndefined()
  })
  it('carga sem placa fica sem marca; XXX0000 vira ficticia', () => {
    expect(por('6').situacaoPlaca).toBeUndefined()
    expect(por('7').situacaoPlaca).toBe('ficticia')
  })
  it('sem sugestao, fora da frota sai sem placaSugerida', () => {
    const [x] = marcarSituacaoPlaca([d({ carga: 'PAO-2', placa: 'RQU8A12' })], { provisorias: new Set(), temCv })
    expect(x.situacaoPlaca).toBe('fora_da_frota')
    expect(x.placaSugerida).toBeUndefined()
  })
  it('nao altera o detalhe original', () => {
    expect(detalhe[0].situacaoPlaca).toBeUndefined()
  })
})
