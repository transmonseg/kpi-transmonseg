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
    pontoLat: null,
    pontoLng: null,
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
  // Achado 10/09 (pedido do usuario "so com romaneio da pra fazer o kpi?"):
  // Escala virou opcional -- escala=null cai pro proprio Romaneio pra tudo
  // exceto peso (que nao existe em nenhum outro lugar, nem na Unitrac).
  describe('sem Escala (escala=null, so Romaneio)', () => {
    it('motorista/destino/ajudantes vem do Romaneio; peso fica null (nao existe em outro lugar)', () => {
      const linhas = [linha('NF1', { motorista: 'MOTORISTA DO ROMANEIO', destino: 'MACAE', ajudantes: ['AJUDANTE A', 'AJUDANTE B'] })]
      const r = agregarPorCarga('93758', 'TTL7D40', linhas, null, [], new Map(), [], null)

      expect(r.motorista).toBe('MOTORISTA DO ROMANEIO')
      expect(r.destino).toBe('MACAE')
      expect(r.ajudante1).toBe('AJUDANTE A')
      expect(r.ajudante2).toBe('AJUDANTE B')
      expect(r.pesoKg).toBeNull()
    })

    it('clientesPlanejados cai pra contagem de clientes UNICOS do proprio Romaneio', () => {
      const linhas = [
        linha('NF1', { clienteCodigo: 'CLI1' }),
        linha('NF2', { clienteCodigo: 'CLI1' }), // mesmo cliente, 2 NFs
        linha('NF3', { clienteCodigo: 'CLI2' }),
      ]
      const r = agregarPorCarga('93758', 'TTL7D40', linhas, null, [], new Map(), [], null)
      expect(r.clientesPlanejados).toBe(2)
    })

    it('nfPlanejado cai pro tamanho do proprio Romaneio -- status INCOMPLETO continua funcionando sem Escala', () => {
      const linhas = [linha('NF1'), linha('NF2'), linha('NF3')]
      const alvos = [alvo('NF1', 1)] // so' 1 de 3 confirmada
      const r = agregarPorCarga('93758', 'TTL7D40', linhas, null, alvos, new Map(), [], null)
      expect(r.nfPlanejado).toBe(3)
      expect(r.paradasReais).toBe(1)
      expect(r.status).toBe('INCOMPLETO')
    })

    it('todas as NF do Romaneio confirmadas, sem Escala: status OK (nao fica falso INCOMPLETO)', () => {
      const linhas = [linha('NF1'), linha('NF2')]
      const alvos = [alvo('NF1', 1), alvo('NF2', 1)]
      const r = agregarPorCarga('93758', 'TTL7D40', linhas, null, alvos, new Map(), [], null)
      expect(r.status).toBe('OK')
    })
  })

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
      const ponte = { saidaBase: '2026-08-20T05:30:00.000Z', chegadaBase: '2026-08-20T19:00:00.000Z', kmPercorrido: 203.4 }

      const r = agregarPorCarga('93758', 'TTL7D40', [linha('NF1')], escala(), [], new Map(), paradas, 140.2, ponte)

      expect(r.saidaCd).toBe('2026-08-20T05:30:00.000Z')
      expect(r.chegadaCd).toBe('2026-08-20T19:00:00.000Z')
      // km da ponte (posicao continua) prevalece sobre o fallback (140.2,
      // so' reta entre paradas) -- mesmo raciocinio de saida/chegada.
      expect(r.kmPercorrido).toBe(203.4)
    })

    it('ponte presente mas com campo null (ex: dia ainda em andamento): confia no null dela, NAO cai pro eventosBase', () => {
      // eventosBase teria 2 permanencias e computaria algo -- a ponte diz que
      // ainda nao ha chegada confirmada (posicao real nunca voltou pra base).
      const paradas: UnitracParadaRow[] = [
        parada({ id: 'base1', classificacao: 'BASE', chegada: '2026-08-20T05:00:00.000Z', saida: '2026-08-20T06:00:00.000Z', fim_real: '2026-08-20T06:00:00.000Z' }),
        parada({ id: 'base2', classificacao: 'BASE', chegada: '2026-08-20T12:00:00.000Z', saida: '2026-08-20T12:05:00.000Z', fim_real: '2026-08-20T12:05:00.000Z' }),
      ]
      const ponte = { saidaBase: '2026-08-20T05:30:00.000Z', chegadaBase: null, kmPercorrido: null }

      const r = agregarPorCarga('93758', 'TTL7D40', [linha('NF1')], escala(), [], new Map(), paradas, 140.2, ponte)

      expect(r.saidaCd).toBe('2026-08-20T05:30:00.000Z')
      expect(r.chegadaCd).toBeNull()
      // km null da ponte tambem prevalece (menos de 2 posicoes no dia --
      // sinal real de "sem dado"), nao cai pro fallback de 140.2.
      expect(r.kmPercorrido).toBeNull()
    })

    it('ponte ausente (undefined -- offline ou placa nao rastreada la): cai pro calculo antigo via eventosBase', () => {
      const paradas: UnitracParadaRow[] = [
        parada({ id: 'base1', classificacao: 'BASE', chegada: '2026-08-20T05:00:00.000Z', saida: '2026-08-20T06:00:00.000Z', fim_real: '2026-08-20T06:00:00.000Z' }),
        parada({ id: 'base2', classificacao: 'BASE', chegada: '2026-08-20T18:00:00.000Z', saida: '2026-08-20T18:30:00.000Z', fim_real: '2026-08-20T18:30:00.000Z' }),
      ]

      const r = agregarPorCarga('93758', 'TTL7D40', [linha('NF1')], escala(), [], new Map(), paradas, 140.2, undefined)

      expect(r.saidaCd).toBe('2026-08-20T06:00:00.000Z')
      expect(r.chegadaCd).toBe('2026-08-20T18:00:00.000Z')
      // sem ponte nenhuma, km cai pro fallback (calcularKmPercorrido, ja
      // calculado pelo chamador).
      expect(r.kmPercorrido).toBe(140.2)
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

  // Achado 10/09 (pedido do usuario "so com romaneio da pra fazer o kpi?"):
  // Escala virou opcional de verdade -- so' pesoKg fica null pra sempre
  // (nao existe em nenhum outro lugar). O resto (ajudantes/clientesPlanejados/
  // nfPlanejado) agora cai pro proprio Romaneio, ver describe dedicado logo
  // acima ("sem Escala (escala=null, so Romaneio)") pra cada campo isolado.
  it('escala === null: so pesoKg fica null -- o resto (inclusive nfPlanejado/status) calcula do romaneio', () => {
    const linhas = [linha('NF1', { destino: 'DESTINO ROMANEIO', motorista: 'MOTORISTA ROMANEIO' }), linha('NF2')]
    const alvos = [alvo('NF1', 1)]

    const r = agregarPorCarga('93758', 'TTL7D40', linhas, null, alvos, new Map(), [], null)

    expect(r.carga).toBe('93758')
    expect(r.placa).toBe('TTL7D40')
    expect(r.paradasReais).toBe(1)
    expect(r.pesoKg).toBeNull()
    expect(r.nfPlanejado).toBe(2) // tamanho do romaneio, ja que nao veio escala
    expect(r.status).toBe('INCOMPLETO') // 1 confirmada de 2 -- continua detectando falta mesmo sem escala
    // sem escala, cai pro destino/motorista da primeira linha do romaneio
    expect(r.destino).toBe('DESTINO ROMANEIO')
    expect(r.motorista).toBe('MOTORISTA ROMANEIO')
  })

  it('temRastreador default true (compat com testes existentes) quando o chamador nao passa nada', () => {
    const r = agregarPorCarga('93758', 'TTL7D40', [linha('NF1')], escala(), [], new Map(), [], null)
    expect(r.temRastreador).toBe(true)
  })

  it('temRastreador=false repassado tal como veio do chamador (pedido do usuario 25/08, nivel Benassi)', () => {
    const r = agregarPorCarga('93758', 'TTL7D40', [linha('NF1')], escala(), [], new Map(), [], null, undefined, false)
    expect(r.temRastreador).toBe(false)
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

  it('temRastreador e observacao default (true/null, compat com testes existentes) quando o chamador nao passa nada', () => {
    const [d] = montarDetalheEntregas('93758', 'TTL7D40', [linha('NF1')], [], new Map(), resumoCargaVazio)
    expect(d.temRastreador).toBe(true)
    expect(d.observacao).toBeNull()
  })

  describe('coordenada nao confiavel (achado real 11-12/09: erros de 22km/27km/131km no cache de geocode)', () => {
    // Caso real da auditoria: a placa de origem entregou no lugar certo, mas
    // como o ponto cadastrado estava em outro municipio, o sistema (a) nao
    // confirmou e (b) creditou a entrega a outra placa qualquer que passou
    // perto do ponto errado, alem de acusar "NAO FOI AO CLIENTE".
    it('NAO atribui carga transferida quando o geocode nao e confiavel, mesmo com outra placa parada em cima do ponto', () => {
      const linhas = [linha('NF1', { geoConfiavel: false })]
      const paradaOutraPlaca = parada({ id: 'p2', placa_norm: 'RQV6I51', classificacao: 'FORA_BASE', lat: -22.9001, lng: -43.2001 })
      const paradasFrota = new Map([['TTL7D40', []], ['RQV6I51', [paradaOutraPlaca]]])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, true, paradasFrota)

      expect(d.status).toBe('pendente')
      expect(d.observacao ?? '').not.toContain('CARGA TRANSFERIDA')
    })

    it('NAO afirma "nao foi ao cliente" com geocode nao confiavel -- rotula o problema como cadastro', () => {
      const linhas = [linha('NF1', { geoConfiavel: false })]
      const paradaLonge = parada({ id: 'p1', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -23.5, lng: -44.5 })
      const paradasFrota = new Map([['TTL7D40', [paradaLonge]]])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, true, paradasFrota)

      expect(d.observacao ?? '').not.toContain('NÃO FOI AO CLIENTE')
      expect(d.observacao).toContain('COORDENADA IMPRECISA')
    })

    it('confirmacao POSITIVA continua valendo com geocode nao confiavel (parada real da propria placa e evidencia a favor)', () => {
      const linhas = [linha('NF1', { geoConfiavel: false })]
      const visitas = new Map<string, Visita>([
        ['NF1', { nf: 'NF1', chegada: '2026-09-11T10:00:00.000Z', saida: '2026-09-11T10:20:00.000Z', distanciaMetrosDoPonto: 40 }],
      ])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio)

      expect(d.status).toBe('confirmado_gps')
      expect(d.observacao).toBeNull()
    })

    it('diz o motivo quando a coordenada caiu em outro municipio', () => {
      const linhas = [linha('NF1', { geoConfiavel: false, geoMotivo: 'municipio_divergente' })]
      const paradaLonge = parada({ id: 'p1', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -23.5, lng: -44.5 })
      const paradasFrota = new Map([['TTL7D40', [paradaLonge]]])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, true, paradasFrota)

      expect(d.observacao).toBe(
        'ENDEREÇO COM COORDENADA IMPRECISA - COORDENADA CAIU EM OUTRO MUNICÍPIO - CONFERIR CADASTRO',
      )
    })

    it('diz o motivo quando a coordenada caiu em outro bairro', () => {
      const linhas = [linha('NF1', { geoConfiavel: false, geoMotivo: 'bairro_divergente' })]
      const paradaLonge = parada({ id: 'p1', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -23.5, lng: -44.5 })
      const paradasFrota = new Map([['TTL7D40', [paradaLonge]]])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, true, paradasFrota)

      expect(d.observacao).toBe(
        'ENDEREÇO COM COORDENADA IMPRECISA - COORDENADA CAIU EM OUTRO BAIRRO - CONFERIR CADASTRO',
      )
    })

    it('geocode confiavel (default): comportamento antigo intacto, carga transferida continua disparando', () => {
      const linhas = [linha('NF1')] // sem geoConfiavel -> tratado como confiavel
      const paradaOutraPlaca = parada({ id: 'p2', placa_norm: 'RQV6I51', classificacao: 'FORA_BASE', lat: -22.9001, lng: -43.2001 })
      const paradasFrota = new Map([['TTL7D40', []], ['RQV6I51', [paradaOutraPlaca]]])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, true, paradasFrota)

      expect(d.observacao).toBe('ENTREGUE POR OUTRA PLACA (RQV6I51) - CARGA TRANSFERIDA')
    })
  })

  describe('cliente sem acesso rodoviario (achado real 12/09: Vila do Abraao, Ilha Grande)', () => {
    it('marca cliente sem acesso rodoviario em vez de "nao foi ao cliente"', () => {
      const linhas = [
        linha('NF1', {
          endereco: 'RUA SANTANA, 58 - VILA DO ABRAAO ILHA GRANDE, ANGRA DOS REIS - PARTE',
          lat: -23.141789,
          lng: -44.167027,
          geoConfiavel: true,
        }),
      ]
      const paradaLonge = parada({ id: 'p1', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -23.0, lng: -44.3 })
      const paradasFrota = new Map([['TTL7D40', [paradaLonge]]])

      // verificarAcessoIlha=true: rotulo e' so' da Nutry Max (Finding 3, fix
      // 12/09) -- o chamador real (nutrimax/gerar/route.ts) passa true.
      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, true, paradasFrota, null, false, true)

      expect(d.observacao).toBe('CLIENTE SEM ACESSO RODOVIÁRIO (ILHA) - CONFERIR COM A OPERAÇÃO')
    })

    it('sem verificarAcessoIlha (default, comportamento da Rio Quality): nao rotula ilha, cai pro fluxo normal de pendente', () => {
      const linhas = [
        linha('NF1', {
          endereco: 'RUA SANTANA, 58 - VILA DO ABRAAO ILHA GRANDE, ANGRA DOS REIS - PARTE',
          lat: -23.141789,
          lng: -44.167027,
          geoConfiavel: true,
        }),
      ]
      const paradaLonge = parada({ id: 'p1', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -23.0, lng: -44.3 })
      const paradasFrota = new Map([['TTL7D40', [paradaLonge]]])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, true, paradasFrota)

      expect(d.observacao).not.toBe('CLIENTE SEM ACESSO RODOVIÁRIO (ILHA) - CONFERIR COM A OPERAÇÃO')
    })
  })

  describe('observacao (pedido do usuario 25/08, nivel Benassi)', () => {
    it('NF pendente + OUTRA placa da frota passou perto do ponto no dia: observacao de troca, com a placa suspeita', () => {
      const linhas = [linha('NF1')] // lat -22.9, lng -43.2, sem alvo nem visita -> pendente
      const paradaOutraPlaca = parada({ id: 'p2', placa_norm: 'RQV6I51', classificacao: 'FORA_BASE', lat: -22.9001, lng: -43.2001 })
      const paradasFrota = new Map([
        ['TTL7D40', []], // a propria placa escalada, sem paradas la
        ['RQV6I51', [paradaOutraPlaca]],
      ])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, true, paradasFrota)

      expect(d.status).toBe('confirmado_gps')
      expect(d.observacao).toBe('ENTREGUE POR OUTRA PLACA (RQV6I51) - CARGA TRANSFERIDA')
    })

    // Achado real 05/09 (diagnostico do KPI Nutry Max de 03/09, cruzando cada
    // pendente com o GPS bruto): dos 261 pendentes COM coordenada, 98 tinham
    // OUTRA placa da frota parada a <= 500m do ponto -- carga transferida
    // entre caminhoes. Caso mais claro: a placa TTJ9I18 tinha 19 pendentes,
    // TODOS em Itaperuna, e ela nunca chegou a menos de 55km de la -- quem
    // rodou Itaperuna foi a RQU-2G47 (chegou a 81m dos pontos). A entrega FOI
    // FEITA; marcar "pendente" e' errado. Vira confirmada, com o horario da
    // parada da outra placa e a observacao dizendo qual placa entregou (o
    // operador confere).
    it('a entrega confirmada por outra placa herda chegada/saida da parada dela', () => {
      const linhas = [linha('NF1')]
      const paradaOutraPlaca = parada({
        id: 'p2', placa_norm: 'RQU2G47', classificacao: 'FORA_BASE', lat: -22.9001, lng: -43.2001,
        chegada: '2026-09-03T13:00:00.000Z', fim_real: '2026-09-03T13:12:00.000Z',
      })
      const paradasFrota = new Map([['RQU2G47', [paradaOutraPlaca]]])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, true, paradasFrota)

      expect(d.status).toBe('confirmado_gps')
      expect(d.chegada).toBe('2026-09-03T13:00:00.000Z')
      expect(d.saida).toBe('2026-09-03T13:12:00.000Z')
      expect(d.tempoParadaMin).toBe(12)
    })

    // Achado real 06/09 (grupo KPI AJUSTES, placa 5F67): motorista confirmou
    // que NAO houve troca de carga com 4D17/9B98 -- "o fato de passar perto
    // o sistema ta identificando [como troca]". Rota urbana densa: a PROPRIA
    // placa tambem parou perto (so' nao dentro do raio de confirmacao de
    // 500m -- ex. 1,5km, mesma regiao/bairro), e o outra-placa disparava so'
    // por essa proximidade coincidente. So' deve confiar em "carga
    // transferida" quando a PROPRIA placa genuinamente nunca esteve perto
    // (>2km, mesmo teto de "nao foi ao cliente" -- caso real que motivou
    // essa logica, TTJ9I18 a 55km).
    it('achado real 06/09 (placa 5F67): PROPRIA placa tambem parou perto (1,5km) -- NAO rotula troca, mesmo sem confirmar', () => {
      const linhas = [linha('NF1')] // lat -22.9, lng -43.2
      const paradaPropria = parada({ id: 'p1', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -22.9135, lng: -43.2 }) // ~1,5km, fora do raio de confirmacao mas plausivelmente na regiao
      const paradaOutraPlaca = parada({ id: 'p2', placa_norm: 'RQV6I51', classificacao: 'FORA_BASE', lat: -22.9001, lng: -43.2001 }) // ~15m, dentro do raio
      const paradasFrota = new Map([
        ['TTL7D40', [paradaPropria]],
        ['RQV6I51', [paradaOutraPlaca]],
      ])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, true, paradasFrota)

      expect(d.observacao ?? '').not.toContain('CARGA TRANSFERIDA')
      expect(d.status).toBe('pendente')
    })

    it('a PROPRIA placa confirmando tem prioridade sobre outra placa (nao rotula troca a toa)', () => {
      const linhas = [linha('NF1')]
      const visitas = new Map<string, Visita>([
        ['NF1', { nf: 'NF1', chegada: '2026-09-03T10:00:00.000Z', saida: '2026-09-03T10:05:00.000Z', distanciaMetrosDoPonto: 20 }],
      ])
      const paradasFrota = new Map([['RQV6I51', [parada({ id: 'p2', placa_norm: 'RQV6I51', classificacao: 'FORA_BASE', lat: -22.9001, lng: -43.2001 })]]])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio, true, paradasFrota)

      expect(d.status).toBe('confirmado_gps')
      expect(d.chegada).toBe('2026-09-03T10:00:00.000Z')
      expect(d.observacao).toBeNull()
    })

    it("veiculo sem movimento no dia continua tendo prioridade na observacao (rastreador travado e outro problema)", () => {
      const linhas = [linha('NF1')]
      const paradasFrota = new Map([['RQV6I51', [parada({ id: 'p2', placa_norm: 'RQV6I51', classificacao: 'FORA_BASE', lat: -22.9001, lng: -43.2001 })]]])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, true, paradasFrota, 0.5)

      expect(d.observacao).toBe('VEÍCULO SEM MOVIMENTO NO DIA - CONFERIR RASTREADOR OU SE SAIU PRA RUA')
    })

    // Achado real 08/09 (auditoria completa dos 762 pendentes/confirmado_gps
    // do dia pedida pelo usuario): placa TTM2G01 passou o DIA INTEIRO em
    // paradas classificadas BASE (nunca registrou nenhuma FORA_BASE), mas o
    // km acumulado (deriva de GPS parado por ~13h) ficou por pouco ACIMA de
    // LIMITE_KM_SEM_MOVIMENTO (2,44km) -- so' km e' fragil demais aqui.
    // Resultado antes do fix: as 2 NFs dela foram erradamente atribuidas via
    // "carga transferida" a 2 OUTRAS placas so' porque semMovimento nao
    // disparava. "Nunca saiu da base" (toda parada classificada BASE) e'
    // evidencia mais forte e direta que km: fisicamente nao fez entrega
    // nenhuma, tem que virar "sem movimento", nunca "troca de carga".
    it('achado real 08/09 (placa TTM2G01): nunca saiu da base o dia inteiro -- vira SEM MOVIMENTO mesmo com km>2 (deriva de GPS parado), nunca CARGA TRANSFERIDA', () => {
      const linhas = [linha('NF1')]
      const paradasPropriasSoBase = [
        parada({ id: 'b1', placa_norm: 'TTM2G01', classificacao: 'BASE', lat: -22.8147, lng: -43.2783 }),
        parada({ id: 'b2', placa_norm: 'TTM2G01', classificacao: 'BASE', lat: -22.8171, lng: -43.2805 }),
        parada({ id: 'b3', placa_norm: 'TTM2G01', classificacao: 'BASE', lat: -22.8163, lng: -43.2780 }),
      ]
      const paradaOutraPlaca = parada({ id: 'p2', placa_norm: 'TUS1A47', classificacao: 'FORA_BASE', lat: -22.9001, lng: -43.2001 }) // dentro do raio
      const paradasFrota = new Map([
        ['TTM2G01', paradasPropriasSoBase],
        ['TUS1A47', [paradaOutraPlaca]],
      ])

      // km=2.44 (> LIMITE_KM_SEM_MOVIMENTO=2) -- so' o km NAO seria suficiente pra disparar sem-movimento
      const [d] = montarDetalheEntregas('93758', 'TTM2G01', linhas, [], new Map(), resumoCargaVazio, true, paradasFrota, 2.44)

      expect(d.observacao).toBe('VEÍCULO SEM MOVIMENTO NO DIA - CONFERIR RASTREADOR OU SE SAIU PRA RUA')
      expect(d.observacao ?? '').not.toContain('CARGA TRANSFERIDA')
      expect(d.status).toBe('pendente')
    })

    // Pedido do usuario 05/09 ("se a porra foi feita ... umas nomeclaturas
    // melhores"): "PENDENTE" soa como "o motorista nao entregou", mas na
    // maioria das vezes e' o nosso lado que nao conseguiu confirmar. O status
    // passa a dizer o que o GPS mostra, com criterio medido:
    //   caminhao esteve a <=500m mas sem parada  -> passou e nao parou
    //   caminhao nunca chegou a 2km              -> ai sim, nao foi ao cliente
    //   entre 500m e 2km                         -> CONFERIR (ver abaixo)
    describe('nomenclatura por evidencia de GPS (pedido 05/09)', () => {
      it('caminhao esteve a <=500m do ponto mas nao registrou parada: diz que passou sem parar', () => {
        const perto = parada({ id: 'p', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -22.9012, lng: -43.2012 }) // ~180m
        const paradasFrota = new Map([['TTL7D40', [perto]]])
        const [d] = montarDetalheEntregas('93758', 'TTL7D40', [linha('NF1')], [], new Map(), resumoCargaVazio, true, paradasFrota)
        expect(d.status).toBe('pendente')
        expect(d.observacao).toBe('PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR')
      })

      it('caminhao nunca chegou a 2km do ponto: NAO FOI AO CLIENTE', () => {
        const longe = parada({ id: 'p', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -22.95, lng: -43.30 }) // ~11km
        const paradasFrota = new Map([['TTL7D40', [longe]]])
        const [d] = montarDetalheEntregas('93758', 'TTL7D40', [linha('NF1')], [], new Map(), resumoCargaVazio, true, paradasFrota)
        expect(d.observacao).toBe('NÃO FOI AO CLIENTE (caminhão não esteve na região)')
      })

      // Achado real 10-09 (auditoria com a Ana, placa RQU2G47/NF 2364486):
      // parada real de 5min a 879m do endereco ficava com observacao em
      // branco -- nem confirma nem explica, o pior resultado possivel pro
      // operador. A decisao original de 05/09 ("nao afirma o que nao da pra
      // saber") deixava essa faixa muda por medo de afirmar demais, mas um
      // rotulo de CONFERIR nao afirma nada (nao diz "foi" nem "nao foi"),
      // so' levanta a bandeira -- mesmo espirito do rotulo de 500-800m
      // (RAIO_CONFIRMACAO_AMPLIADO_METROS/viaRaioAmpliado) e do de geoConfiavel
      // abaixo. Revertida a decisao de ficar em branco por pedido do usuario
      // apos essa auditoria.
      it('achado real 10-09 (RQU2G47): entre 500m e 2km vira CONFERIR, nao fica mais em branco', () => {
        const meio = parada({ id: 'p', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -22.910, lng: -43.200 }) // ~1,1km
        const paradasFrota = new Map([['TTL7D40', [meio]]])
        const [d] = montarDetalheEntregas('93758', 'TTL7D40', [linha('NF1')], [], new Map(), resumoCargaVazio, true, paradasFrota)
        expect(d.status).toBe('pendente')
        expect(d.observacao).toBe('PARADA PRÓXIMA (500m-2km) MAS FORA DO ENDEREÇO - CONFERIR')
      })

      it('entrega confirmada nao ganha rotulo de nao-entrega, mesmo com parada longe no dia', () => {
        const longe = parada({ id: 'p', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -22.95, lng: -43.30 })
        const visitas = new Map<string, Visita>([
          ['NF1', { nf: 'NF1', chegada: '2026-09-03T10:00:00.000Z', saida: '2026-09-03T10:05:00.000Z', distanciaMetrosDoPonto: 20 }],
        ])
        const [d] = montarDetalheEntregas('93758', 'TTL7D40', [linha('NF1')], [], visitas, resumoCargaVazio, true, new Map([['TTL7D40', [longe]]]))
        expect(d.status).toBe('confirmado_gps')
        expect(d.observacao).toBeNull()
      })

      it('sem coordenada ou sem parada nenhuma da propria placa: nao inventa rotulo', () => {
        const semCoord = [linha('NF1', { lat: null, lng: null })]
        const paradasFrota = new Map([['TTL7D40', [parada({ id: 'p', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -22.95, lng: -43.30 })]]])
        expect(montarDetalheEntregas('93758', 'TTL7D40', semCoord, [], new Map(), resumoCargaVazio, true, paradasFrota)[0].observacao).toBeNull()
        expect(montarDetalheEntregas('93758', 'TTL7D40', [linha('NF1')], [], new Map(), resumoCargaVazio, true, new Map())[0].observacao).toBeNull()
      })
    })

    // Achado real 10/09 (usuario pediu analise do KPI gerado no meio do dia,
    // placa RQV6G75/97481): com o relatorio de HOJE gerado antes da rota
    // terminar (CHEGADA CD ainda "EM ROTA"), entrega que o caminhao
    // simplesmente ainda nao chegou caia nos MESMOS observacao de falha
    // genuina (NAO FOI AO CLIENTE, SEM CONFIRMACAO) -- inflava a taxa de
    // falha artificialmente enquanto o dia ainda estava rolando.
    // `diaEmAndamento=true` substitui qualquer observacao negativa de
    // "pendente" por um status neutro de espera.
    describe('dia em andamento (achado real 10/09, nunca declara falha antes do dia terminar)', () => {
      it('rota ainda em andamento (chegadaCd null) + entrega sem evidencia nenhuma: vira AGUARDANDO, nao NAO FOI AO CLIENTE', () => {
        const longe = parada({ id: 'p', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -22.95, lng: -43.30 }) // ~11km, cairia em NAO FOI AO CLIENTE
        const paradasFrota = new Map([['TTL7D40', [longe]]])
        const [d] = montarDetalheEntregas('93758', 'TTL7D40', [linha('NF1')], [], new Map(), resumoCargaVazio, true, paradasFrota, null, true)
        expect(d.status).toBe('pendente')
        expect(d.observacao).toBe('AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO')
      })

      it('rota em andamento + passou perto sem parar: tambem vira AGUARDANDO (nao PASSOU NO ENDEREÇO)', () => {
        const perto = parada({ id: 'p', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -22.9012, lng: -43.2012 })
        const paradasFrota = new Map([['TTL7D40', [perto]]])
        const [d] = montarDetalheEntregas('93758', 'TTL7D40', [linha('NF1')], [], new Map(), resumoCargaVazio, true, paradasFrota, null, true)
        expect(d.observacao).toBe('AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO')
      })

      it('rota em andamento MAS entrega ja confirmada por GPS: mantem a confirmacao normal, nao vira AGUARDANDO', () => {
        const visitas = new Map<string, Visita>([
          ['NF1', { nf: 'NF1', chegada: '2026-09-10T10:00:00.000Z', saida: '2026-09-10T10:05:00.000Z', distanciaMetrosDoPonto: 20 }],
        ])
        const [d] = montarDetalheEntregas('93758', 'TTL7D40', [linha('NF1')], [], visitas, resumoCargaVazio, true, new Map(), null, true)
        expect(d.status).toBe('confirmado_gps')
        expect(d.observacao).toBeNull()
      })

      it('diaEmAndamento=false (default, dia passado ou rota ja finalizada): comportamento antigo preservado, declara NAO FOI AO CLIENTE normalmente', () => {
        const longe = parada({ id: 'p', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -22.95, lng: -43.30 })
        const paradasFrota = new Map([['TTL7D40', [longe]]])
        const [d] = montarDetalheEntregas('93758', 'TTL7D40', [linha('NF1')], [], new Map(), resumoCargaVazio, true, paradasFrota)
        expect(d.observacao).toBe('NÃO FOI AO CLIENTE (caminhão não esteve na região)')
      })
    })

    it('NF pendente mas nenhuma outra placa passou perto: observacao null (nao inventa suspeita)', () => {
      const linhas = [linha('NF1')]
      const paradaLonge = parada({ id: 'p2', placa_norm: 'RQV6I51', classificacao: 'FORA_BASE', lat: -23.5, lng: -44.5 })
      const paradasFrota = new Map([['RQV6I51', [paradaLonge]]])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, true, paradasFrota)

      expect(d.observacao).toBeNull()
    })

    it('NF CONFIRMADA (nao pendente) nunca ganha observacao de troca, mesmo com outra placa perto -- so pendente e suspeita', () => {
      const linhas = [linha('NF1')]
      const alvos = [alvo('NF1', 1)]
      const paradaOutraPlaca = parada({ id: 'p2', placa_norm: 'RQV6I51', classificacao: 'FORA_BASE', lat: -22.9001, lng: -43.2001 })
      const paradasFrota = new Map([['RQV6I51', [paradaOutraPlaca]]])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, alvos, new Map(), resumoCargaVazio, true, paradasFrota)

      expect(d.status).toBe('confirmado_unitrac')
      expect(d.observacao).toBeNull()
    })

    it('tempo em loja acima de 4h: observacao de tempo excessivo', () => {
      const linhas = [linha('NF1')]
      const visitas = new Map<string, Visita>([
        ['NF1', { nf: 'NF1', chegada: '2026-08-20T10:00:00.000Z', saida: '2026-08-20T14:30:00.000Z', distanciaMetrosDoPonto: 20 }], // 4h30
      ])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio)

      expect(d.status).toBe('confirmado_gps')
      expect(d.observacao).toBe('TEMPO EM LOJA ACIMA DE 4H - CONFERIR')
    })

    it('tempo em loja dentro do limite (exatamente 4h): observacao null', () => {
      const linhas = [linha('NF1')]
      const visitas = new Map<string, Visita>([
        ['NF1', { nf: 'NF1', chegada: '2026-08-20T10:00:00.000Z', saida: '2026-08-20T14:00:00.000Z', distanciaMetrosDoPonto: 20 }], // exatos 4h
      ])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio)

      expect(d.observacao).toBeNull()
    })

    it('achado real 30/08 (bucket 500m-2km, ex. TTM-2G02/Rocinha): visita viaVizinhanca marca observacao distinta, status continua confirmado_gps', () => {
      const linhas = [linha('NF1')]
      const visitas = new Map<string, Visita>([
        ['NF1', { nf: 'NF1', chegada: '2026-08-30T10:00:00.000Z', saida: '2026-08-30T10:15:00.000Z', distanciaMetrosDoPonto: 0, viaVizinhanca: true }],
      ])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio)

      expect(d.status).toBe('confirmado_gps')
      expect(d.observacao).toBe('ENTREGUE - PARADA COMPARTILHADA COM ENTREGA PRÓXIMA (horário aproximado)')
    })

    it('visita SEM viaVizinhanca (confirmacao direta normal): observacao null, sem marcacao', () => {
      const linhas = [linha('NF1')]
      const visitas = new Map<string, Visita>([
        ['NF1', { nf: 'NF1', chegada: '2026-08-30T10:00:00.000Z', saida: '2026-08-30T10:15:00.000Z', distanciaMetrosDoPonto: 40 }],
      ])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio)

      expect(d.observacao).toBeNull()
    })

    it('viaVizinhanca E tempo em loja acima de 4h ao mesmo tempo: tempo excessivo tem prioridade (mais critico de conferir)', () => {
      const linhas = [linha('NF1')]
      const visitas = new Map<string, Visita>([
        ['NF1', { nf: 'NF1', chegada: '2026-08-30T10:00:00.000Z', saida: '2026-08-30T14:30:00.000Z', distanciaMetrosDoPonto: 0, viaVizinhanca: true }],
      ])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio)

      expect(d.observacao).toBe('TEMPO EM LOJA ACIMA DE 4H - CONFERIR')
    })

    it('achado real 03/09 (TTL-5J17: 0km percorrido, 2622 leituras na mesma coordenada): pendente + veiculo sem movimento vira observacao dedicada', () => {
      const linhas = [linha('NF1')] // sem alvo nem visita -> pendente

      const [d] = montarDetalheEntregas(
        '93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio,
        true, new Map(), 0.3, // kmPercorrido = 300m, abaixo do limiar de 2km
      )

      expect(d.status).toBe('pendente')
      expect(d.observacao).toBe('VEÍCULO SEM MOVIMENTO NO DIA - CONFERIR RASTREADOR OU SE SAIU PRA RUA')
    })

    it('pendente com km percorrido normal: NAO marca sem movimento (rota real, so nao confirmou essa entrega)', () => {
      const linhas = [linha('NF1')]

      const [d] = montarDetalheEntregas(
        '93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio,
        true, new Map(), 180.5,
      )

      expect(d.observacao).toBeNull()
    })

    it('NF CONFIRMADA com km baixo: nao marca sem movimento (observacao so vale pra pendente -- carga pode ter terminado cedo)', () => {
      const linhas = [linha('NF1')]
      const alvos = [alvo('NF1', 1)]

      const [d] = montarDetalheEntregas(
        '93758', 'TTL7D40', linhas, alvos, new Map(), resumoCargaVazio,
        true, new Map(), 0.1,
      )

      expect(d.status).toBe('confirmado_unitrac')
      expect(d.observacao).toBeNull()
    })

    it('kmPercorrido null (sem dado da ponte nem fallback): nao marca sem movimento, so fica pendente comum', () => {
      const linhas = [linha('NF1')]

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, true, new Map(), null)

      expect(d.observacao).toBeNull()
    })

    // Achado real 08/09 (auditoria de todas as placas do dia, placa
    // RQO2C74): CV cadastrado (tem rastreador -- temRastreador=true), mas
    // ZERO eventos de GPS o dia inteiro -- paradasPorOutraPlaca.set(placa,
    // []) foi chamado (o produtor BUSCOU e nao achou nada), diferente do
    // teste acima (map nunca populado pra essa placa). Sem esta mensagem,
    // as 34 entregas reais dessa placa ficavam pendente com observacao em
    // branco -- pior caso pro operador, nem "sem movimento" nem "nao foi
    // ao cliente" dizem nada.
    it('rastreador cadastrado mas ZERO eventos de GPS no dia inteiro, dia JA ENCERRADO (produtor buscou e achou nada): marca SEM RASTREADOR/NAO CONTABILIZADO (Task 1, 24/09: unificado com o caso sem cv -- ambos saem da taxa)', () => {
      const linhas = [linha('NF1')]
      const paradasFrota = new Map<string, UnitracParadaRow[]>([['TTL7D40', []]])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, true, paradasFrota, null)

      expect(d.observacao).toBe('SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO')
      expect(d.status).toBe('pendente')
    })

    it('sem rastreador (temRastreador=false) e zero eventos: recebe o MESMO rotulo unificado (nao mais silencioso, nao mais o rotulo antigo de equipamento)', () => {
      const linhas = [linha('NF1')]
      const paradasFrota = new Map<string, UnitracParadaRow[]>([['TTL7D40', []]])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, false, paradasFrota, null)

      expect(d.observacao).toBe('SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO')
    })
  })

  // Task 1 (plano 2026-09-24, brief da Ana 23/09): TTL5J17 tinha 22 NFs em
  // 23/09 sem nenhum rastreador -- o relatorio saiu do MEIO DO DIA
  // (diaEmAndamento=true), e o ramo AGUARDANDO (que existe pra nunca acusar
  // falha antes do dia acabar) sobrescrevia CEGAMENTE qualquer observacao,
  // inclusive "sem rastreador" -- que e' um fato JA CONHECIDO (nao uma
  // espera por evidencia que ainda pode chegar) e nao devia esperar o dia
  // terminar pra aparecer. Distincao chave (Review Focus do plano): placa
  // SEM RASTREADOR (sabemos que nunca vai confirmar) sai na hora; placa COM
  // rastreador mas ainda sem posicao (pode ser so' atraso do equipamento)
  // continua esperando o dia acabar antes de acusar.
  describe('SEM RASTREADOR nao vira AGUARDANDO (Task 1, achado real TTL5J17 23/09)', () => {
    it('temRastreador=false, dia em andamento, sem nenhuma parada da frota: observacao vira SEM RASTREADOR, nunca AGUARDANDO', () => {
      const [d] = montarDetalheEntregas(
        '93758', 'TTL5J17', [linha('NF1')], [], new Map(), resumoCargaVazio,
        false, new Map(), null, true,
      )

      expect(d.observacao).toBe('SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO')
      expect(d.observacao).not.toBe('AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO')
    })

    it('temRastreador=true, dia em andamento, placa consultada mas zero paradas proprias ATE AGORA: continua AGUARDANDO (nao acusar equipamento cedo demais)', () => {
      const paradasFrota = new Map<string, UnitracParadaRow[]>([['TTL5J17', []]]) // buscou, zero ate agora
      const [d] = montarDetalheEntregas(
        '93758', 'TTL5J17', [linha('NF1')], [], new Map(), resumoCargaVazio,
        true, paradasFrota, null, true,
      )

      expect(d.observacao).toBe('AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO')
    })

    it('temRastreador=false, dia JA ENCERRADO (diaEmAndamento=false): observacao SEM RASTREADOR normalmente', () => {
      const [d] = montarDetalheEntregas(
        '93758', 'TTL5J17', [linha('NF1')], [], new Map(), resumoCargaVazio,
        false, new Map(), null, false,
      )

      expect(d.observacao).toBe('SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO')
    })
  })
})

// Item 3b (spec 2026-09-12, "Endurecimento da confirmacao"): medido no dia
// 11/09 pos-correcao de geocode -- 133 de 1.761 confirmacoes (7,6%) tem
// ≤3min de dwell; 20 paradas distintas confirmam mais de uma NF ao mesmo
// tempo, a pior confirmando 5 clientes diferentes de uma so' parada de
// 1min (Rodovia Amaral Peixoto, 4 KMs diferentes colapsados no mesmo ponto
// geocodificado). Opt-in (Nutry Max so') via 13o parametro posicional de
// montarDetalheEntregas, default false -- preserva Rio Quality intocada.
describe('montarDetalheEntregas -- 3b, parada curta compartilhada entre enderecos distintos', () => {
  const resumoCargaVazio = { motorista: '', saidaCd: null, chegadaCd: null, tempoOperacaoMin: null }
  const paradaCurta = { chegada: '2026-09-11T08:00:00.000Z', saida: '2026-09-11T08:01:00.000Z' } // 1min

  it('parada de 1min confirmando 5 enderecos distintos: TODAS as 5 NFs (inclusive a que "ganhou" a visita) levam o rotulo de conferencia, nao ENTREGUE', () => {
    const linhas = ['NF1', 'NF2', 'NF3', 'NF4', 'NF5'].map((nf, i) =>
      linha(nf, { endereco: `RODOVIA AMARAL PEIXOTO, KM ${i + 1}` }))
    const visitas = new Map<string, Visita>(
      linhas.map(l => [l.nf, { nf: l.nf, chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 10 }]),
    )

    const detalhes = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio,
      true, new Map(), null, false, false, true,
    )

    expect(detalhes).toHaveLength(5)
    for (const d of detalhes) {
      expect(d.status).toBe('confirmado_gps')
      expect(d.observacao).not.toBeNull()
      expect(d.observacao).not.toBe(null)
      expect(d.observacao).toMatch(/CONFERIR/)
      expect(d.observacao).toMatch(/PARADA CURTA/i)
    }
  })

  it('flag desligada (default): NAO aplica o rotulo, mesma parada de 1min confirmando 5 enderecos fica ENTREGUE normal', () => {
    const linhas = ['NF1', 'NF2'].map((nf, i) =>
      linha(nf, { endereco: `RODOVIA AMARAL PEIXOTO, KM ${i + 1}` }))
    const visitas = new Map<string, Visita>(
      linhas.map(l => [l.nf, { nf: l.nf, chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 10 }]),
    )

    const detalhes = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio)

    for (const d of detalhes) {
      expect(d.observacao).toBeNull()
    }
  })

  it('duas NFs com o MESMO endereco (multiplos itens pro mesmo cliente): nao e colapso, mantem confirmacao normal mesmo com parada curta', () => {
    const linhas = ['NF1', 'NF2'].map(nf => linha(nf, { endereco: 'RUA UNICA, 100 - BAIRRO' }))
    const visitas = new Map<string, Visita>(
      linhas.map(l => [l.nf, { nf: l.nf, chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 10 }]),
    )

    const detalhes = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio,
      true, new Map(), null, false, false, true,
    )

    for (const d of detalhes) {
      expect(d.observacao).toBeNull()
    }
  })

  it('parada compartilhada mas LONGA (>3min): nao rotula -- parada longa plausivelmente e uma visita real servindo enderecos adjacentes', () => {
    const paradaLonga = { chegada: '2026-09-11T08:00:00.000Z', saida: '2026-09-11T08:05:00.000Z' } // 5min
    const linhas = ['NF1', 'NF2'].map((nf, i) => linha(nf, { endereco: `RUA ADJACENTE ${i + 1}` }))
    const visitas = new Map<string, Visita>(
      linhas.map(l => [l.nf, { nf: l.nf, chegada: paradaLonga.chegada, saida: paradaLonga.saida, distanciaMetrosDoPonto: 10 }]),
    )

    const detalhes = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio,
      true, new Map(), null, false, false, true,
    )

    for (const d of detalhes) {
      expect(d.observacao).toBeNull()
    }
  })

  it('parada curta confirmando UMA UNICA NF: nao rotula (item 3a ja cobre parada nao genuina, isto e outra checagem)', () => {
    const linhas = [linha('NF1', { endereco: 'RUA SOLITARIA, 1' })]
    const visitas = new Map<string, Visita>([
      ['NF1', { nf: 'NF1', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 10 }],
    ])

    const detalhes = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio,
      true, new Map(), null, false, false, true,
    )

    expect(detalhes[0].observacao).toBeNull()
  })

  // Task 2 (plano 24/09, brief Ana -- RQQ5B81/NF 2386225 23/09): "confirma
  // TODO o grupo" era generoso demais -- quando um dos enderecos do grupo
  // esta genuinamente perto (30m) e os outros longe (600m), so' o perto
  // fisicamente pode ser a entrega real; os outros a equipe confirma que
  // "nao esteve no local". Limiar (medido contra o gabarito da Ana, ver
  // scripts/medir-contra-gabarito-ana.py e o relatorio da task): perde a
  // confirmacao quem esta a >300m da parada QUANDO existe outro endereco do
  // MESMO grupo a <=150m (a "vencedora" plausivel). Sem essa vencedora
  // proxima (todos >150m, ou todos <=150m), mantem o rotulo de conferencia
  // atual pro grupo inteiro -- nao ha' evidencia de qual endereco (se algum)
  // e' o certo.
  it('grupo de 3 com 1 endereco perto (~45m, vencedor) e 2 longe (>3km): so o perto mantem ENTREGUE, os outros dois viram pendente com rotulo proprio', () => {
    // Fix round 1 (revisao 24/09, item 2): distancia medida pela coordenada
    // REAL da parada (paradasPorOutraPlaca casada por horario), nunca por
    // Visita.distanciaMetrosDoPonto -- por isso o teste ja usa lat/lng+
    // parada propria desde o inicio, igual ao caso de aceite real.
    const paradaReal = parada({
      chegada: paradaCurta.chegada,
      saida: paradaCurta.saida,
      fim_real: paradaCurta.saida,
      classificacao: 'FORA_BASE',
      lat: -22.71,
      lng: -42.628,
    })
    const linhas = [
      linha('NF_A', { endereco: 'ENDERECO A - PERTO (~45m)', lat: -22.7104, lng: -42.628 }),
      linha('NF_B', { endereco: 'ENDERECO B - LONGE (~4.4km)', lat: -22.75, lng: -42.628 }),
      linha('NF_C', { endereco: 'ENDERECO C - LONGE (~3.3km)', lat: -22.71, lng: -42.66 }),
    ]
    const visitas = new Map<string, Visita>([
      ['NF_A', { nf: 'NF_A', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 999 }],
      ['NF_B', { nf: 'NF_B', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 999 }],
      ['NF_C', { nf: 'NF_C', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 999 }],
    ])
    const paradasPorOutraPlaca = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaReal]]])

    const detalhes = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio,
      true, paradasPorOutraPlaca, null, false, false, true,
    )

    const porNf = new Map(detalhes.map(d => [d.nf, d]))
    expect(porNf.get('NF_A')?.status).toBe('confirmado_gps')
    expect(porNf.get('NF_A')?.observacao).toBe('ENTREGUE - PARADA CURTA (ATÉ 3MIN) CONFIRMOU VÁRIOS ENDEREÇOS DIFERENTES AO MESMO TEMPO - CONFERIR')

    for (const nf of ['NF_B', 'NF_C']) {
      expect(porNf.get(nf)?.status).toBe('pendente')
      expect(porNf.get(nf)?.observacao).toBe('PARADA CURTA DE OUTRO ENDEREÇO - NÃO CONFIRMA ESTE CLIENTE - CONFERIR')
    }
  })

  it('grupo de 3 todos a <=150m da parada: mantem o rotulo de conferencia atual pros 3 (nenhum fica pendente)', () => {
    const linhas = [
      linha('NF_A', { endereco: 'ENDERECO A' }),
      linha('NF_B', { endereco: 'ENDERECO B' }),
      linha('NF_C', { endereco: 'ENDERECO C' }),
    ]
    const visitas = new Map<string, Visita>([
      ['NF_A', { nf: 'NF_A', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 20 }],
      ['NF_B', { nf: 'NF_B', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 80 }],
      ['NF_C', { nf: 'NF_C', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 150 }],
    ])

    const detalhes = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio,
      true, new Map(), null, false, false, true,
    )

    for (const d of detalhes) {
      expect(d.status).toBe('confirmado_gps')
      expect(d.observacao).toBe('ENTREGUE - PARADA CURTA (ATÉ 3MIN) CONFIRMOU VÁRIOS ENDEREÇOS DIFERENTES AO MESMO TEMPO - CONFERIR')
    }
  })

  // Achado real 24/09 (diagnostico com GPS bruto pro caso de aceite RQQ5B81/
  // NF 2386225, 23/09): visita vinda da PONTE do monitoramento grava
  // distanciaMetrosDoPonto=0 SEMPRE (nunca reflete a distancia real -- ver
  // comentario de acharCoordenadaDaParadaPropria em agregacao.ts), entao
  // confiar nela faria a regra nunca disparar pra esse tipo de visita. Este
  // teste simula exatamente esse cenario (as 3 NFs com distanciaMetrosDoPonto
  // 0 -- "todas empatadas perto" segundo o campo antigo) e prova que a
  // parada REAL (`paradasPorOutraPlaca`, casada por horario) desempata do
  // mesmo jeito que o teste acima com o campo antigo.
  it('visita da ponte (distanciaMetrosDoPonto sempre 0): usa a coordenada REAL da parada propria pra desempatar', () => {
    const paradaReal = parada({
      chegada: '2026-09-11T07:59:00.000Z',
      saida: '2026-09-11T08:02:00.000Z',
      fim_real: '2026-09-11T08:02:00.000Z',
      classificacao: 'FORA_BASE',
      lat: -22.71,
      lng: -42.628,
    })
    const linhas = [
      linha('NF_A', { endereco: 'ENDERECO A - PERTO (~45m)', lat: -22.7104, lng: -42.628 }),
      linha('NF_B', { endereco: 'ENDERECO B - LONGE (~4.4km)', lat: -22.75, lng: -42.628 }),
      linha('NF_C', { endereco: 'ENDERECO C - LONGE (~3.3km)', lat: -22.71, lng: -42.66 }),
    ]
    const visitas = new Map<string, Visita>([
      ['NF_A', { nf: 'NF_A', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 0 }],
      ['NF_B', { nf: 'NF_B', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 0 }],
      ['NF_C', { nf: 'NF_C', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 0 }],
    ])
    const paradasPorOutraPlaca = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaReal]]])

    const detalhes = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio,
      true, paradasPorOutraPlaca, null, false, false, true,
    )

    const porNf = new Map(detalhes.map(d => [d.nf, d]))
    expect(porNf.get('NF_A')?.status).toBe('confirmado_gps')
    expect(porNf.get('NF_A')?.observacao).toBe('ENTREGUE - PARADA CURTA (ATÉ 3MIN) CONFIRMOU VÁRIOS ENDEREÇOS DIFERENTES AO MESMO TEMPO - CONFERIR')
    for (const nf of ['NF_B', 'NF_C']) {
      expect(porNf.get(nf)?.status).toBe('pendente')
      expect(porNf.get(nf)?.observacao).toBe('PARADA CURTA DE OUTRO ENDEREÇO - NÃO CONFIRMA ESTE CLIENTE - CONFERIR')
    }
  })

  // Fix round 1 (revisao 24/09 do commit d9ad438, item 2): sem parada propria
  // casando o horario (nenhum dado real de GPS bruto disponivel), a
  // distancia e' DESCONHECIDA -- a primeira versao caia de volta em
  // `Visita.distanciaMetrosDoPonto`, que pode vir 0 mesmo sem relacao
  // nenhuma com a distancia real (ex. visita da ponte, ver teste acima).
  // Confiar nesse fallback faria NF_A "vencer" so' porque o campo antigo diz
  // 0 -- sem nenhuma coordenada real por tras, isso e' tao arbitrario quanto
  // usar B ou C. Distancia desconhecida = ninguem vence, ninguem e' rebaixado.
  it('sem parada propria casando o horario: distancia fica desconhecida, NAO usa distanciaMetrosDoPonto como substituto (grupo inteiro mantem o rotulo de conferencia)', () => {
    const linhas = [
      linha('NF_A', { endereco: 'ENDERECO A' }),
      linha('NF_B', { endereco: 'ENDERECO B' }),
      linha('NF_C', { endereco: 'ENDERECO C' }),
    ]
    // Se o campo antigo fosse usado, NF_A "venceria" (0<=150) e B/C seriam
    // rebaixados (999>300) -- exatamente o bug do item 2.
    const visitas = new Map<string, Visita>([
      ['NF_A', { nf: 'NF_A', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 0 }],
      ['NF_B', { nf: 'NF_B', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 999 }],
      ['NF_C', { nf: 'NF_C', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 999 }],
    ])

    const detalhes = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio,
      true, new Map(), null, false, false, true,
    )

    for (const d of detalhes) {
      expect(d.status).toBe('confirmado_gps')
      expect(d.observacao).toBe('ENTREGUE - PARADA CURTA (ATÉ 3MIN) CONFIRMOU VÁRIOS ENDEREÇOS DIFERENTES AO MESMO TEMPO - CONFERIR')
    }
  })

  // Fix round 1 (item 1): endereco com geoConfiavel=false nao pode decidir
  // NADA nesta regra -- nem ser o "vencedor" (coordenada pode estar em outro
  // municipio/bairro, ver comentario de geoConfiavel mais abaixo no arquivo),
  // nem ser rebaixado (mesma razao: nao da pra confiar na distancia medida a
  // partir de uma coordenada ja' sabida como ruim).
  it('geoConfiavel=false: endereco perto nao pode ser o vencedor -- grupo inteiro mantem o rotulo de conferencia', () => {
    const paradaReal = parada({
      chegada: paradaCurta.chegada,
      saida: paradaCurta.saida,
      fim_real: paradaCurta.saida,
      classificacao: 'FORA_BASE',
      lat: -22.71,
      lng: -42.628,
    })
    const linhas = [
      linha('NF_A', { endereco: 'PERTO MAS GEO NAO CONFIAVEL', lat: -22.7104, lng: -42.628, geoConfiavel: false }),
      linha('NF_B', { endereco: 'LONGE', lat: -22.75, lng: -42.628 }),
      linha('NF_C', { endereco: 'LONGE', lat: -22.71, lng: -42.66 }),
    ]
    const visitas = new Map<string, Visita>([
      ['NF_A', { nf: 'NF_A', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 0 }],
      ['NF_B', { nf: 'NF_B', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 0 }],
      ['NF_C', { nf: 'NF_C', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 0 }],
    ])
    const paradasPorOutraPlaca = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaReal]]])

    const detalhes = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio,
      true, paradasPorOutraPlaca, null, false, false, true,
    )

    for (const d of detalhes) {
      expect(d.status).toBe('confirmado_gps')
      expect(d.observacao).toBe('ENTREGUE - PARADA CURTA (ATÉ 3MIN) CONFIRMOU VÁRIOS ENDEREÇOS DIFERENTES AO MESMO TEMPO - CONFERIR')
    }
  })

  it('geoConfiavel=false: endereco longe NAO e rebaixado mesmo havendo vencedor claro no grupo', () => {
    const paradaReal = parada({
      chegada: paradaCurta.chegada,
      saida: paradaCurta.saida,
      fim_real: paradaCurta.saida,
      classificacao: 'FORA_BASE',
      lat: -22.71,
      lng: -42.628,
    })
    const linhas = [
      linha('NF_A', { endereco: 'PERTO (VENCEDOR CONFIAVEL)', lat: -22.7104, lng: -42.628 }),
      linha('NF_B', { endereco: 'LONGE MAS GEO NAO CONFIAVEL', lat: -22.75, lng: -42.628, geoConfiavel: false }),
      linha('NF_C', { endereco: 'LONGE CONFIAVEL', lat: -22.71, lng: -42.66 }),
    ]
    const visitas = new Map<string, Visita>([
      ['NF_A', { nf: 'NF_A', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 0 }],
      ['NF_B', { nf: 'NF_B', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 0 }],
      ['NF_C', { nf: 'NF_C', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 0 }],
    ])
    const paradasPorOutraPlaca = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaReal]]])

    const detalhes = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio,
      true, paradasPorOutraPlaca, null, false, false, true,
    )

    const porNf = new Map(detalhes.map(d => [d.nf, d]))
    expect(porNf.get('NF_A')?.observacao).toBe('ENTREGUE - PARADA CURTA (ATÉ 3MIN) CONFIRMOU VÁRIOS ENDEREÇOS DIFERENTES AO MESMO TEMPO - CONFERIR')
    // NF_B tem geo nao confiavel -- nao pode ser rebaixado, mesmo estando
    // "longe" pela coordenada (que ja' sabemos ser ruim).
    expect(porNf.get('NF_B')?.status).toBe('confirmado_gps')
    expect(porNf.get('NF_B')?.observacao).toBe('ENTREGUE - PARADA CURTA (ATÉ 3MIN) CONFIRMOU VÁRIOS ENDEREÇOS DIFERENTES AO MESMO TEMPO - CONFERIR')
    // NF_C tem geo confiavel e esta longe -- rebaixado normalmente.
    expect(porNf.get('NF_C')?.status).toBe('pendente')
    expect(porNf.get('NF_C')?.observacao).toBe('PARADA CURTA DE OUTRO ENDEREÇO - NÃO CONFIRMA ESTE CLIENTE - CONFERIR')
  })

  // Fix round 1 (item 3, mesmo espirito da Task 1 com SEM RASTREADOR): o
  // rotulo de "parada curta de outro endereco" e' evidencia JA RESOLVIDA
  // (sabemos que esse endereco nao foi confirmado por essa parada, dia
  // terminado ou nao) -- nao devia esperar o dia acabar pra aparecer, igual
  // SEM RASTREADOR nao espera (Task 1). `diaEmAndamento=true` nao pode
  // sobrescrever esse rotulo com AGUARDANDO.
  it('NF rebaixada por parada curta compartilhada mantem o rotulo mesmo com o dia em andamento (nao vira AGUARDANDO)', () => {
    const paradaReal = parada({
      chegada: paradaCurta.chegada,
      saida: paradaCurta.saida,
      fim_real: paradaCurta.saida,
      classificacao: 'FORA_BASE',
      lat: -22.71,
      lng: -42.628,
    })
    const linhas = [
      linha('NF_A', { endereco: 'PERTO', lat: -22.7104, lng: -42.628 }),
      linha('NF_B', { endereco: 'LONGE', lat: -22.75, lng: -42.628 }),
    ]
    const visitas = new Map<string, Visita>([
      ['NF_A', { nf: 'NF_A', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 0 }],
      ['NF_B', { nf: 'NF_B', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 0 }],
    ])
    const paradasPorOutraPlaca = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaReal]]])

    const detalhes = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio,
      true, paradasPorOutraPlaca, null, /* diaEmAndamento */ true, false, true,
    )

    const porNf = new Map(detalhes.map(d => [d.nf, d]))
    expect(porNf.get('NF_B')?.status).toBe('pendente')
    expect(porNf.get('NF_B')?.observacao).toBe('PARADA CURTA DE OUTRO ENDEREÇO - NÃO CONFIRMA ESTE CLIENTE - CONFERIR')
    expect(porNf.get('NF_B')?.observacao).not.toBe('AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO')
  })
})

// Achado Critical 2 da revisao FINAL de branch (15/09): o Romaneio do Pao
// pode trazer uma carga com a coluna CARRO em branco (placa ''). Sem placa
// nao ha' paradas proprias -> distanciaAteParadaPropria devolve null ->
// propriaPlacaPlausivelmentePerto false -> acharParadaDeOutraPlaca rodava SEM
// NENHUMA GUARDA, varria a frota inteira e casava qualquer parada a <=500m.
// A NF saia "ENTREGUE" com o rotulo "CARGA TRANSFERIDA" -- uma
// transferencia que nunca existiu -- e ainda contradizia agregarPorCarga, que
// so' olha a placa propria e devolvia INCOMPLETO/0 paradas pra mesma carga.
describe('montarDetalheEntregas -- carga SEM PLACA no romaneio (Critical 2)', () => {
  const resumoVazio = { motorista: 'MOTORISTA DO PAO', saidaCd: null, chegadaCd: null, tempoOperacaoMin: null }

  function paradaFrotaAoLadoDoPonto(placa: string): UnitracParadaRow {
    return parada({
      id: `p-${placa}`,
      placa_norm: placa,
      classificacao: 'FORA_BASE',
      // Mesma coordenada do ponto de `linha()` -- distancia ~0, dentro de
      // qualquer raio de confirmacao.
      lat: -22.9,
      lng: -43.2,
      chegada: '2026-09-15T12:00:00.000Z',
      saida: '2026-09-15T12:30:00.000Z',
      fim_real: '2026-09-15T12:30:00.000Z',
    })
  }

  it('nunca sai como confirmado_gps nem com rotulo de "CARGA TRANSFERIDA"', () => {
    const linhas = [linha('NF1', { carga: 'PAO-4', placa: '' }), linha('NF2', { carga: 'PAO-4', placa: '' })]
    // Frota inteira da Nutry Max parada em cima do ponto -- exatamente o
    // cenario que antes produzia a falsa transferencia.
    const paradasPorPlaca = new Map<string, UnitracParadaRow[]>([
      ['', []],
      ['TTI9B98', [paradaFrotaAoLadoDoPonto('TTI9B98')]],
      ['TTL5J17', [paradaFrotaAoLadoDoPonto('TTL5J17')]],
    ])

    const detalhes = montarDetalheEntregas(
      'PAO-4', '', linhas, [], new Map(), resumoVazio,
      true, paradasPorPlaca, null, false, true, true,
    )

    expect(detalhes).toHaveLength(2)
    for (const d of detalhes) {
      expect(d.status).toBe('pendente')
      expect(d.observacao).toBe('CARGA SEM PLACA NO ROMANEIO - CONFERIR COM A OPERAÇÃO')
      expect(d.observacao).not.toMatch(/CARGA TRANSFERIDA/)
      expect(d.chegada).toBeNull()
      expect(d.saida).toBeNull()
      expect(d.tempoParadaMin).toBeNull()
    }
  })

  it('coerente com agregarPorCarga: as duas funcoes concordam que nada foi confirmado', () => {
    const linhas = [linha('NF1', { carga: 'PAO-4', placa: '' })]
    const paradasPorPlaca = new Map<string, UnitracParadaRow[]>([
      ['', []],
      ['TTI9B98', [paradaFrotaAoLadoDoPonto('TTI9B98')]],
    ])

    const resumo = agregarPorCarga('PAO-4', '', linhas, null, [], new Map(), [], null, undefined, true)
    const [d] = montarDetalheEntregas(
      'PAO-4', '', linhas, [], new Map(), resumoVazio,
      true, paradasPorPlaca, null, false, true, true,
    )

    expect(resumo.paradasReais).toBe(0)
    expect(resumo.status).toBe('INCOMPLETO')
    expect(d.status).toBe('pendente')
  })

  it('placa preenchida continua com a deteccao de carga transferida intacta (nao regride)', () => {
    const linhas = [linha('NF1')]
    const paradasPorPlaca = new Map<string, UnitracParadaRow[]>([
      ['TTL7D40', []],
      ['TTI9B98', [paradaFrotaAoLadoDoPonto('TTI9B98')]],
    ])

    const [d] = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, [], new Map(), resumoVazio,
      true, paradasPorPlaca, null, false, true, true,
    )

    expect(d.status).toBe('confirmado_gps')
    expect(d.observacao).toMatch(/CARGA TRANSFERIDA/)
  })
})
