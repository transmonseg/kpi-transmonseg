// F1-01 (plano mestre 23/10): placar de qualidade diario. Fixtures = o
// calculo final REAL do Ao vivo de 22/10 (kpi_ao_vivo_calculo, so' os campos
// que o placar le; status cortado em 60 caracteres). Os numeros esperados sao
// a baseline da secao 1.2 do plano, medida a mao pela auditoria de 23/10.
import { readFileSync } from 'fs'
import { gunzipSync } from 'zlib'
import path from 'path'
import { metricasDoAoVivo, contarTimeoutsDoDia, diaDoPlacar, montarPlacar, metricasAgregadas, type LinhaCalculo, type LinhaPlacar } from './placar'

function fixture(cliente: string): LinhaCalculo {
  const buf = readFileSync(path.join(__dirname, '__fixtures__', `aovivo-${cliente}-2026-10-22.json.gz`))
  return JSON.parse(gunzipSync(buf).toString('utf8'))
}
const valor = (linhas: LinhaPlacar[], metrica: string) => linhas.find(l => l.metrica === metrica)?.valor
const detalhe = (linhas: LinhaPlacar[], metrica: string) => linhas.find(l => l.metrica === metrica)?.detalhe

describe('metricasDoAoVivo -- Nutry 22/10 (baseline 1.1/1.2)', () => {
  const m = metricasDoAoVivo('2026-10-22', fixture('nutrimax'))

  it('taxa 96,9 = 2.183 / 2.253, 2.272 NFs', () => {
    expect(valor(m, 'taxa')).toBe(96.9)
    expect(valor(m, 'nfs_total')).toBe(2272)
    expect(valor(m, 'nfs_na_conta')).toBe(2253)
    expect(valor(m, 'entregues_na_taxa')).toBe(2183)
  })

  it('pendencias: 78 revisar (com as 19 sem placa), 11 nao foi, 1 sem rastreador', () => {
    expect(valor(m, 'revisar')).toBe(78)
    expect(valor(m, 'nao_foi')).toBe(11)
    expect(valor(m, 'sem_rastreador')).toBe(1)
  })

  it('carga do pao sem placa fora da conta = 19; escala divergente fora = 0', () => {
    expect(valor(m, 'carga_sem_placa_fora')).toBe(19)
    expect(valor(m, 'escala_divergente_fora')).toBe(0)
  })

  it('faltavam 3 NFs para 97% (2.186 - 2.183)', () => {
    expect(valor(m, 'faltam_para_meta')).toBe(3)
  })

  it('placas reais sem chegada no CD: RQV9B26 e RQU8D91', () => {
    expect(valor(m, 'placas_sem_chegada_cd')).toBe(2)
    expect(detalhe(m, 'placas_sem_chegada_cd')).toEqual({ placas: ['RQU8D91', 'RQV9B26'] })
  })

  it('o calculo guardado e o final do dia (00:30 do dia seguinte) e sem erro', () => {
    expect(valor(m, 'calculo_final')).toBe(1)
    expect(valor(m, 'calculo_com_erro')).toBe(0)
  })

  it('confere a propria conta com o resumo gravado (sem divergencia)', () => {
    expect(valor(m, 'divergencia_resumo')).toBe(0)
  })

  it('toda linha leva dia e cliente', () => {
    expect(m.every(l => l.dia === '2026-10-22' && l.cliente === 'nutrimax')).toBe(true)
  })
})

describe('metricasDoAoVivo -- Rio Quality 22/10', () => {
  const m = metricasDoAoVivo('2026-10-22', fixture('rioquality'))

  it('taxa 91,4 com 2.881 NFs na conta', () => {
    expect(valor(m, 'taxa')).toBe(91.4)
    expect(valor(m, 'nfs_na_conta')).toBe(2881)
    expect(valor(m, 'entregues_na_taxa')).toBe(2633)
  })

  it('NFs com ponto no Ao vivo: 0 de 2.881 (F2-03)', () => {
    expect(valor(m, 'nfs_com_ponto')).toBe(0)
    expect(valor(m, 'nfs_com_ponto_pct')).toBe(0)
  })

  it('investigacao "sem_coordenada" = 248 (todas as pendentes)', () => {
    expect(valor(m, 'investigacao_sem_coordenada')).toBe(248)
  })

  it('chegada no CD minutos depois da saida: 6 placas (KRQ-07), TUP1J16 e TTT1J28 entre elas', () => {
    expect(valor(m, 'chegada_cd_logo_apos_saida')).toBe(6)
    const placas = (detalhe(m, 'chegada_cd_logo_apos_saida') as { placas: string[] }).placas
    expect(placas).toContain('TUP1J16')
    expect(placas).toContain('TTT1J28')
  })

  it('RQ nao tem meta de 97% definida: sem "faltam_para_meta"', () => {
    expect(valor(m, 'faltam_para_meta')).toBeUndefined()
  })
})

describe('metricasDoAoVivo -- dia sem calculo', () => {
  it('devolve so\' "calculo_existe = 0", sem inventar taxa', () => {
    const m = metricasDoAoVivo('2026-10-19', { cliente: 'nutrimax', data: '2026-10-19', calculado_em: null, ultimo_erro: null, resultado: null })
    expect(valor(m, 'calculo_existe')).toBe(0)
    expect(valor(m, 'taxa')).toBeUndefined()
  })
})

describe('contarTimeoutsDoDia', () => {
  // Log do Postgres do servidor: horario de Berlim (CEST/CET). O dia do placar e' o de Brasilia.
  const log = [
    '2026-10-22 04:59:00.000 CEST [1] app_service@transmonseg ERROR:  canceling statement due to statement timeout', // 23:59 BRT do dia 21
    '2026-10-22 05:00:00.000 CEST [1] app_service@transmonseg ERROR:  canceling statement due to statement timeout', // 00:00 BRT do dia 22
    '2026-10-23 04:59:59.000 CEST [1] app_service@transmonseg ERROR:  canceling statement due to statement timeout', // 23:59 BRT do dia 22
    '2026-10-23 05:00:00.000 CEST [1] app_service@transmonseg ERROR:  canceling statement due to statement timeout', // dia 23
    '2026-10-22 12:00:00.000 CEST [1] app_service@transmonseg ERROR:  duplicate key value', // nao e' timeout
    '2026-10-26 04:00:00.000 CET [1] app_service@transmonseg ERROR:  canceling statement due to statement timeout', // 00:00 BRT do dia 26 (CET = +1)
  ]
  it('conta so\' os timeouts dentro do dia de Brasilia', () => {
    expect(contarTimeoutsDoDia(log, '2026-10-22')).toBe(2)
    expect(contarTimeoutsDoDia(log, '2026-10-26')).toBe(1)
    expect(contarTimeoutsDoDia(log, '2026-10-25')).toBe(0)
  })
})

describe('diaDoPlacar', () => {
  it('as 06:30 BRT de 24/10 o placar e\' de 23/10 (ontem em Brasilia)', () => {
    expect(diaDoPlacar(Date.parse('2026-10-24T06:30:00-03:00'))).toBe('2026-10-23')
  })
  it('as 23:50 BRT ainda e\' "ontem" do dia corrente', () => {
    expect(diaDoPlacar(Date.parse('2026-10-24T23:50:00-03:00'))).toBe('2026-10-23')
  })
})

describe('metricasAgregadas', () => {
  it('vira linhas por cliente; cliente desconhecido vai para "geral"', () => {
    const m = metricasAgregadas('2026-10-22', [
      { cliente: 'nutrimax', metrica: 'romaneio_ausente', valor: 127 },
      { cliente: 'Benassi', metrica: 'alertas_cliente_desativado', valor: 28400 },
    ])
    expect(m).toEqual([
      { dia: '2026-10-22', cliente: 'nutrimax', metrica: 'romaneio_ausente', valor: 127, detalhe: null },
      { dia: '2026-10-22', cliente: 'geral', metrica: 'alertas_cliente_desativado', valor: 28400, detalhe: { cliente: 'Benassi' } },
    ])
  })
})

describe('montarPlacar', () => {
  it('junta as linhas, guarda os erros de cada fonte e nunca perde o dia', () => {
    const p = montarPlacar('2026-10-22', '2026-10-23T09:30:00.000Z', [[{ dia: '2026-10-22', cliente: 'nutrimax', metrica: 'taxa', valor: 96.9, detalhe: null }]], [{ fonte: 'log_postgres', erro: 'sem permissao' }])
    expect(p.dia).toBe('2026-10-22')
    expect(p.versao).toBe(1)
    expect(p.linhas).toHaveLength(1)
    expect(p.erros).toEqual([{ fonte: 'log_postgres', erro: 'sem permissao' }])
  })
})

// D-04 (plano mestre 23/10): placa provisoria/ficticia fora da conta, como a
// carga sem placa. 22/10 depois do D-04: LLD4202 (1 NF) sai -> 2.182 / 2.252.
describe('metricasDoAoVivo -- D-04 placa provisoria fora da conta', () => {
  const STATUS_PROV = 'PLACA PROVISÓRIA - FORA DA CONTA ATÉ A OPERAÇÃO INFORMAR O CARRO'
  const row: LinhaCalculo = {
    cliente: 'nutrimax', data: '2026-10-22', calculado_em: '2026-10-23T03:31:00.000Z', ultimo_erro: null,
    resultado: {
      resumo: { taxa: 50, totalNfs: 3, nfsNaConta: 2, entregues: 1 },
      placas: [
        { placa: 'LLD4202', saidaBase: null, chegadaBase: null, nfs: [{ nf: '1', carga: '100689', status: STATUS_PROV, situacao: 'fora_da_conta', chegada: null, lat: null }] },
        { placa: 'ABC1234', saidaBase: null, chegadaBase: null, nfs: [
          { nf: '2', carga: '100700', status: 'ENTREGUE', situacao: 'entregue', chegada: '10:00', lat: null },
          { nf: '3', carga: '100700', status: 'NÃO FOI AO CLIENTE', situacao: 'nao_foi', chegada: null, lat: null },
        ] },
      ],
    },
  }
  const m = metricasDoAoVivo('2026-10-22', row)
  it('conta a provisoria fora da conta e nao acusa divergencia com o resumo', () => {
    expect(valor(m, 'placa_provisoria_fora')).toBe(1)
    expect(valor(m, 'divergencia_resumo')).toBe(0)
  })
})
