import { describe, it, expect } from 'vitest'
import { agregarPorCarga, montarDetalheEntregas } from './agregacao'
import type { LinhaEscala, LinhaGeocodificada, Visita } from './types'
import type { AlvoApi } from '@/lib/unitrac-api'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

function linha(nf: string, overrides: Partial<LinhaGeocodificada> = {}): LinhaGeocodificada {
  return {
    carga: '93758',
    destino: 'CAMPOS',
    placa: 'TTL7D40',
    motorista: 'MOTORISTA TESTE',
    ajudantes: [],
    nf,
    clienteCodigo: 'CLI1',
    clienteNome: 'CLIENTE TESTE',
    endereco: 'ENDERECO TESTE',
    lat: -22.9,
    lng: -43.2,
    ...overrides,
  }
}

function escala(overrides: Partial<LinhaEscala> = {}): LinhaEscala {
  return {
    carga: '93758',
    placaRaw: 'TTL7D40',
    placaNorm: 'TTL7D40',
    destino: 'CAMPOS',
    motorista: 'MOTORISTA TESTE',
    ajudante1: 'AJUDANTE 1',
    ajudante2: null,
    pesoKg: 1200,
    entPlanejado: 2,
    nfPlanejado: 2,
    ...overrides,
  }
}

function alvo(documento: string, situacao: number, overrides: Partial<AlvoApi> = {}): AlvoApi {
  return {
    placaNorm: 'TTL7D40',
    codigoUnitrac: 'COD1',
    nome: 'LOJA TESTE',
    situacao,
    feitoISO: situacao === 1 ? '2026-08-20T12:00:00.000Z' : null,
    documento,
    inicioISO: null,
    ordem: 1,
    rota: 'ROTA1',
    ...overrides,
  }
}

function parada(overrides: Partial<UnitracParadaRow> = {}): UnitracParadaRow {
  return {
    id: 'p1',
    placa_norm: 'TTL7D40',
    chegada: '2026-08-20T06:00:00.000Z',
    saida: '2026-08-20T06:30:00.000Z',
    fim_real: '2026-08-20T06:30:00.000Z',
    duracao_seg: 1800,
    local_parada: 'BASE - BASE GARAGEM',
    codigo_loja: null,
    nome_loja: null,
    lat: -22.816007,
    lng: -43.277827,
    endereco: null,
    classificacao: 'BASE',
    ordem: 1,
    ...overrides,
  }
}

describe('agregarPorCarga', () => {
  it('todas as NF confirmadas via Unitrac -> status OK, paradasReais igual ao total', () => {
    const linhas = [linha('NF1'), linha('NF2')]
    const alvos = [alvo('NF1', 1), alvo('NF2', 1)]

    const r = agregarPorCarga('93758', 'TTL7D40', linhas, escala(), alvos, new Map(), [], null)

    expect(r.status).toBe('OK')
    expect(r.paradasReais).toBe(2)
  })

  it('NF pendente na Unitrac mas confirmada via Visita conta como confirmada', () => {
    const linhas = [linha('NF1'), linha('NF2')]
    const alvos = [alvo('NF1', 1), alvo('NF2', 0)]
    const visitas = new Map<string, Visita>([
      ['NF2', { nf: 'NF2', chegada: '2026-08-20T10:00:00.000Z', saida: '2026-08-20T10:10:00.000Z', distanciaMetrosDoPonto: 50 }],
    ])

    const r = agregarPorCarga('93758', 'TTL7D40', linhas, escala(), alvos, visitas, [], null)

    expect(r.paradasReais).toBe(2)
    expect(r.status).toBe('OK')
  })

  it('NF nem na Unitrac nem com Visita não conta, status INCOMPLETO se nfPlanejado exigir mais', () => {
    const linhas = [linha('NF1'), linha('NF2')]
    const alvos = [alvo('NF1', 1)] // NF2 nem aparece nos alvos
    const r = agregarPorCarga('93758', 'TTL7D40', linhas, escala({ nfPlanejado: 2 }), alvos, new Map(), [], null)

    expect(r.paradasReais).toBe(1)
    expect(r.status).toBe('INCOMPLETO')
  })

  it('múltiplos ciclos BASE->FORA_BASE->BASE: pega a PRIMEIRA saída e a ÚLTIMA chegada, não o meio', () => {
    const paradas: UnitracParadaRow[] = [
      parada({ id: 'base1', classificacao: 'BASE', chegada: '2026-08-20T05:00:00.000Z', saida: '2026-08-20T06:00:00.000Z', fim_real: '2026-08-20T06:00:00.000Z' }),
      parada({ id: 'fora1', classificacao: 'FORA_BASE', chegada: '2026-08-20T07:00:00.000Z', saida: '2026-08-20T08:00:00.000Z', fim_real: '2026-08-20T08:00:00.000Z' }),
      parada({ id: 'base2', classificacao: 'BASE', chegada: '2026-08-20T09:00:00.000Z', saida: '2026-08-20T09:30:00.000Z', fim_real: '2026-08-20T09:30:00.000Z' }),
      parada({ id: 'fora2', classificacao: 'FORA_BASE', chegada: '2026-08-20T10:00:00.000Z', saida: '2026-08-20T11:00:00.000Z', fim_real: '2026-08-20T11:00:00.000Z' }),
      parada({ id: 'base3', classificacao: 'BASE', chegada: '2026-08-20T18:00:00.000Z', saida: '2026-08-20T18:30:00.000Z', fim_real: '2026-08-20T18:30:00.000Z' }),
    ]

    const r = agregarPorCarga('93758', 'TTL7D40', [linha('NF1')], escala(), [], new Map(), paradas, null)

    // saida CD = fim da PRIMEIRA base (base1): fim_real 06:00
    expect(r.saidaCd).toBe('2026-08-20T06:00:00.000Z')
    // chegada CD = inicio da ULTIMA base (base3): chegada 18:00
    expect(r.chegadaCd).toBe('2026-08-20T18:00:00.000Z')
    expect(r.tempoOperacaoMin).toBe(12 * 60) // 06:00 -> 18:00
  })

  it('placa sem nenhum evento BASE no dia: saidaCd/chegadaCd/tempoOperacaoMin todos null, não zerados', () => {
    const paradas: UnitracParadaRow[] = [
      parada({ id: 'fora1', classificacao: 'FORA_BASE', chegada: '2026-08-20T07:00:00.000Z', saida: '2026-08-20T08:00:00.000Z', fim_real: '2026-08-20T08:00:00.000Z' }),
    ]

    const r = agregarPorCarga('93758', 'TTL7D40', [linha('NF1')], escala(), [], new Map(), paradas, null)

    expect(r.saidaCd).toBeNull()
    expect(r.chegadaCd).toBeNull()
    expect(r.tempoOperacaoMin).toBeNull()
  })

  it('achado real 24/08: placa com UMA SÓ permanência na base (ex. parada de meio-dia) -- saidaCd/chegadaCd/tempoOperacaoMin ficam null em vez de inverter ordem e gerar tempo negativo', () => {
    const paradas: UnitracParadaRow[] = [
      parada({ id: 'base1', classificacao: 'BASE', chegada: '2026-08-20T14:59:00.000Z', saida: '2026-08-20T17:07:00.000Z', fim_real: '2026-08-20T17:07:00.000Z' }),
    ]

    const r = agregarPorCarga('93758', 'TTL7D40', [linha('NF1')], escala(), [], new Map(), paradas, null)

    expect(r.saidaCd).toBeNull()
    expect(r.chegadaCd).toBeNull()
    expect(r.tempoOperacaoMin).toBeNull()
  })

  describe('horarioBaseBridge (achado real 25/08: posicao continua real via monitoramento)', () => {
    it('ponte presente: usa saida/chegada da ponte, IGNORA eventosBase mesmo quando eventosBase teria dado outra coisa', () => {
      const paradas: UnitracParadaRow[] = [
        parada({ id: 'base1', classificacao: 'BASE', chegada: '2026-08-20T05:00:00.000Z', saida: '2026-08-20T06:00:00.000Z', fim_real: '2026-08-20T06:00:00.000Z' }),
        parada({ id: 'base2', classificacao: 'BASE', chegada: '2026-08-20T18:00:00.000Z', saida: '2026-08-20T18:30:00.000Z', fim_real: '2026-08-20T18:30:00.000Z' }),
      ]
      const ponte = { saidaBase: '2026-08-20T05:30:00.000Z', chegadaBase: '2026-08-20T19:00:00.000Z' }

      const r = agregarPorCarga('93758', 'TTL7D40', [linha('NF1')], escala(), [], new Map(), paradas, null, ponte)

      expect(r.saidaCd).toBe('2026-08-20T05:30:00.000Z')
      expect(r.chegadaCd).toBe('2026-08-20T19:00:00.000Z')
    })

    it('ponte presente mas com campo null (ex: dia ainda em andamento): confia no null dela, NAO cai pro eventosBase', () => {
      // eventosBase teria 2 permanencias e computaria algo -- a ponte diz que
      // ainda nao ha chegada confirmada (posicao real nunca voltou pra base).
      const paradas: UnitracParadaRow[] = [
        parada({ id: 'base1', classificacao: 'BASE', chegada: '2026-08-20T05:00:00.000Z', saida: '2026-08-20T06:00:00.000Z', fim_real: '2026-08-20T06:00:00.000Z' }),
        parada({ id: 'base2', classificacao: 'BASE', chegada: '2026-08-20T12:00:00.000Z', saida: '2026-08-20T12:05:00.000Z', fim_real: '2026-08-20T12:05:00.000Z' }),
      ]
      const ponte = { saidaBase: '2026-08-20T05:30:00.000Z', chegadaBase: null }

      const r = agregarPorCarga('93758', 'TTL7D40', [linha('NF1')], escala(), [], new Map(), paradas, null, ponte)

      expect(r.saidaCd).toBe('2026-08-20T05:30:00.000Z')
      expect(r.chegadaCd).toBeNull()
    })

    it('ponte ausente (undefined -- offline ou placa nao rastreada la): cai pro calculo antigo via eventosBase', () => {
      const paradas: UnitracParadaRow[] = [
        parada({ id: 'base1', classificacao: 'BASE', chegada: '2026-08-20T05:00:00.000Z', saida: '2026-08-20T06:00:00.000Z', fim_real: '2026-08-20T06:00:00.000Z' }),
        parada({ id: 'base2', classificacao: 'BASE', chegada: '2026-08-20T18:00:00.000Z', saida: '2026-08-20T18:30:00.000Z', fim_real: '2026-08-20T18:30:00.000Z' }),
      ]

      const r = agregarPorCarga('93758', 'TTL7D40', [linha('NF1')], escala(), [], new Map(), paradas, null, undefined)

      expect(r.saidaCd).toBe('2026-08-20T06:00:00.000Z')
      expect(r.chegadaCd).toBe('2026-08-20T18:00:00.000Z')
    })
  })

  it('tempoMedioParadaMin: média das durações reais (Visita) das NF confirmadas por GPS nesta carga', () => {
    const linhas = [linha('NF1'), linha('NF2'), linha('NF3')]
    const visitas = new Map<string, Visita>([
      ['NF1', { nf: 'NF1', chegada: '2026-08-20T10:00:00.000Z', saida: '2026-08-20T10:10:00.000Z', distanciaMetrosDoPonto: 50 }],
      ['NF2', { nf: 'NF2', chegada: '2026-08-20T11:00:00.000Z', saida: '2026-08-20T11:20:00.000Z', distanciaMetrosDoPonto: 30 }],
      // NF3 sem Visita (só confirmada via Unitrac, se algum dia estiver) -- não entra na média.
    ])

    const r = agregarPorCarga('93758', 'TTL7D40', linhas, escala({ nfPlanejado: 3 }), [], visitas, [], null)

    expect(r.tempoMedioParadaMin).toBe(15) // média de 10 e 20 minutos
  })

  it('tempoMedioParadaMin null quando nenhuma NF da carga tem Visita', () => {
    const r = agregarPorCarga('93758', 'TTL7D40', [linha('NF1')], escala(), [], new Map(), [], null)

    expect(r.tempoMedioParadaMin).toBeNull()
  })

  it('escala === null: campos da escala ficam null, mas o resto continua calculável só do romaneio', () => {
    const linhas = [linha('NF1', { destino: 'DESTINO ROMANEIO', motorista: 'MOTORISTA ROMANEIO' }), linha('NF2')]
    const alvos = [alvo('NF1', 1)]

    const r = agregarPorCarga('93758', 'TTL7D40', linhas, null, alvos, new Map(), [], null)

    expect(r.carga).toBe('93758')
    expect(r.placa).toBe('TTL7D40')
    expect(r.paradasReais).toBe(1)
    expect(r.ajudante1).toBeNull()
    expect(r.ajudante2).toBeNull()
    expect(r.pesoKg).toBeNull()
    expect(r.clientesPlanejados).toBeNull()
    expect(r.nfPlanejado).toBeNull()
    expect(r.status).toBe('OK') // sem nfPlanejado, nunca INCOMPLETO
    // sem escala, cai pro destino/motorista da primeira linha do romaneio
    expect(r.destino).toBe('DESTINO ROMANEIO')
    expect(r.motorista).toBe('MOTORISTA ROMANEIO')
  })
})

describe('montarDetalheEntregas', () => {
  it('uma linha por NF, status confirmado_gps com chegada/saida/tempoParadaMin da Visita', () => {
    const linhas = [linha('NF1', { clienteCodigo: 'CLI42', clienteNome: 'CLIENTE A', endereco: 'RUA A, 1' })]
    const visitas = new Map<string, Visita>([
      ['NF1', { nf: 'NF1', chegada: '2026-08-20T10:00:00.000Z', saida: '2026-08-20T10:15:00.000Z', distanciaMetrosDoPonto: 40 }],
    ])

    const resumoCarga = { motorista: 'JOAO SILVA', saidaCd: '2026-08-20T08:00:00.000Z', chegadaCd: '2026-08-20T18:00:00.000Z', tempoOperacaoMin: 600 }
    const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], visitas, resumoCarga)

    expect(d.carga).toBe('93758')
    expect(d.placa).toBe('TTL7D40')
    expect(d.motorista).toBe('JOAO SILVA')
    expect(d.clienteCodigo).toBe('CLI42')
    expect(d.nf).toBe('NF1')
    expect(d.clienteNome).toBe('CLIENTE A')
    expect(d.endereco).toBe('RUA A, 1')
    expect(d.saidaCd).toBe('2026-08-20T08:00:00.000Z')
    expect(d.chegadaCd).toBe('2026-08-20T18:00:00.000Z')
    expect(d.tempoOperacaoMin).toBe(600)
    expect(d.chegada).toBe('2026-08-20T10:00:00.000Z')
    expect(d.saida).toBe('2026-08-20T10:15:00.000Z')
    expect(d.tempoParadaMin).toBe(15)
    expect(d.status).toBe('confirmado_gps')
  })

  const resumoCargaVazio = { motorista: '', saidaCd: null, chegadaCd: null, tempoOperacaoMin: null }

  it('confirmado só via Unitrac (sem Visita): status confirmado_unitrac, chegada/saida/tempoParadaMin null', () => {
    const linhas = [linha('NF1')]
    const alvos = [alvo('NF1', 1)]

    const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, alvos, new Map(), resumoCargaVazio)

    expect(d.status).toBe('confirmado_unitrac')
    expect(d.chegada).toBeNull()
    expect(d.saida).toBeNull()
    expect(d.tempoParadaMin).toBeNull()
  })

  it('nem Unitrac nem Visita: status pendente', () => {
    const linhas = [linha('NF1')]

    const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio)

    expect(d.status).toBe('pendente')
  })

  it('Unitrac E Visita ao mesmo tempo: confirmado_unitrac tem prioridade no status, mas horario ainda vem da Visita', () => {
    const linhas = [linha('NF1')]
    const alvos = [alvo('NF1', 1)]
    const visitas = new Map<string, Visita>([
      ['NF1', { nf: 'NF1', chegada: '2026-08-20T10:00:00.000Z', saida: '2026-08-20T10:05:00.000Z', distanciaMetrosDoPonto: 20 }],
    ])

    const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, alvos, visitas, resumoCargaVazio)

    expect(d.status).toBe('confirmado_unitrac')
    expect(d.chegada).toBe('2026-08-20T10:00:00.000Z')
    expect(d.tempoParadaMin).toBe(5)
  })
})
