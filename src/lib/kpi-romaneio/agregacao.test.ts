import { describe, it, expect } from 'vitest'
import { agregarPorCarga, montarDetalheEntregas } from './agregacao'
import { resolverParadas } from './unitrac'
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

  // Task 9 (plano 24/09, achado da Ana: "PARADAS REAIS" contava NF, não
  // parada física -- "KPI 3 x relatório 4"). "NF CONFIRMADAS" (paradasReais)
  // continua contando NOTA; "PARADAS FORA DA BASE" (paradasForaBase) conta
  // PARADA FÍSICA classificada FORA_BASE -- uma parada só pode confirmar
  // várias NFs de uma vez (condomínio, cliente com múltiplas notas).
  it('3 NFs confirmadas em 2 paradas físicas FORA_BASE: NF CONFIRMADAS=3, PARADAS FORA DA BASE=2', () => {
    const linhas = [linha('NF1'), linha('NF2'), linha('NF3')]
    const alvos = [alvo('NF1', 1), alvo('NF2', 1), alvo('NF3', 1)]
    const paradas: UnitracParadaRow[] = [
      parada({ id: 'fora1', classificacao: 'FORA_BASE' }),
      parada({ id: 'fora2', classificacao: 'FORA_BASE' }),
      parada({ id: 'base1', classificacao: 'BASE' }),
    ]
    const r = agregarPorCarga('93758', 'TTL7D40', linhas, escala(), alvos, new Map(), paradas, null)

    expect(r.paradasReais).toBe(3)
    expect(r.paradasForaBase).toBe(2)
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

    // Task 7 (24/09, plano 2026-09-24): achado real 22-23/09 -- placas com
    // paradas classificadas so' BASE mas que RODARAM de verdade (>50km,
    // porque a janela de 48h da Unitrac ficou incompleta num dia
    // reprocessado depois) saiam "VEICULO SEM MOVIMENTO" indevidamente. km do
    // GPS continuo (independente das paradas) acima do limite desmente
    // nuncaSaiuDaBase.
    it('achado real Task 7 (22-23/09): todas as paradas BASE mas km=80 (rodou de verdade) -- NAO e sem movimento', () => {
      const linhas = [linha('NF1')]
      const paradasPropriasSoBase = [
        parada({ id: 'b1', placa_norm: 'TTL7D40', classificacao: 'BASE', lat: -22.8147, lng: -43.2783 }),
        parada({ id: 'b2', placa_norm: 'TTL7D40', classificacao: 'BASE', lat: -22.8171, lng: -43.2805 }),
      ]
      const paradasFrota = new Map([['TTL7D40', paradasPropriasSoBase]])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, true, paradasFrota, 80)

      expect(d.observacao ?? '').not.toBe('VEÍCULO SEM MOVIMENTO NO DIA - CONFERIR RASTREADOR OU SE SAIU PRA RUA')
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
        // Task 9 (plano 24/09): evidencia/distParadaM expostos pro mesmo caso.
        expect(d.evidencia).toBe('passagem_sem_parada')
        expect(d.distParadaM).not.toBeNull()
        expect(d.distParadaM as number).toBeLessThanOrEqual(500)
      })

      it('caminhao nunca chegou a 2km do ponto: NAO FOI AO CLIENTE', () => {
        const longe = parada({ id: 'p', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -22.95, lng: -43.30 }) // ~11km
        const paradasFrota = new Map([['TTL7D40', [longe]]])
        const [d] = montarDetalheEntregas('93758', 'TTL7D40', [linha('NF1')], [], new Map(), resumoCargaVazio, true, paradasFrota)
        expect(d.observacao).toBe('NÃO FOI AO CLIENTE (caminhão não esteve na região)')
        // Task 9: continua 'sem_evidencia' (Global Constraint: nao muda
        // precedencia), mas agora com a distancia exposta.
        expect(d.evidencia).toBe('sem_evidencia')
        expect(d.distParadaM as number).toBeGreaterThan(2_000)
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
        // Task 9: nova evidencia dedicada a essa faixa, com distancia.
        expect(d.evidencia).toBe('parada_proxima_fora_raio')
        expect(d.distParadaM as number).toBeGreaterThan(500)
        expect(d.distParadaM as number).toBeLessThanOrEqual(2_000)
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

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, true, paradasFrota, null, false, false, false, new Map(), /* tratarSemRastreadorNoDia */ true)

      expect(d.observacao).toBe('SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO')
      expect(d.status).toBe('pendente')
    })

    it('sem rastreador (temRastreador=false) e zero eventos: recebe o MESMO rotulo unificado (nao mais silencioso, nao mais o rotulo antigo de equipamento)', () => {
      const linhas = [linha('NF1')]
      const paradasFrota = new Map<string, UnitracParadaRow[]>([['TTL7D40', []]])

      const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, false, paradasFrota, null, false, false, false, new Map(), /* tratarSemRastreadorNoDia */ true)

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
        false, new Map(), null, true, false, false, new Map(), /* tratarSemRastreadorNoDia */ true,
      )

      expect(d.observacao).toBe('SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO')
      expect(d.observacao).not.toBe('AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO')
    })

    it('temRastreador=true, dia em andamento, placa consultada mas zero paradas proprias ATE AGORA: continua AGUARDANDO (nao acusar equipamento cedo demais)', () => {
      const paradasFrota = new Map<string, UnitracParadaRow[]>([['TTL5J17', []]]) // buscou, zero ate agora
      const [d] = montarDetalheEntregas(
        '93758', 'TTL5J17', [linha('NF1')], [], new Map(), resumoCargaVazio,
        true, paradasFrota, null, true, false, false, new Map(), /* tratarSemRastreadorNoDia */ true,
      )

      expect(d.observacao).toBe('AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO')
    })

    it('temRastreador=false, dia JA ENCERRADO (diaEmAndamento=false): observacao SEM RASTREADOR normalmente', () => {
      const [d] = montarDetalheEntregas(
        '93758', 'TTL5J17', [linha('NF1')], [], new Map(), resumoCargaVazio,
        false, new Map(), null, false, false, false, new Map(), /* tratarSemRastreadorNoDia */ true,
      )

      expect(d.observacao).toBe('SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO')
    })
  })

  // Correcao pontual (achado real 23/09, placa TTL5J17, 23 NFs, pedido da
  // Ana): temRastreador=false E as paradas da propria placa sao todas BASE
  // com km baixo (nuncaSaiuDaBase/semMovimento tambem disparam) -- o ramo de
  // semMovimento (linha ~729, na epoca) rodava ANTES do de semRastreadorNoDia
  // e travava a observacao com "VEICULO SEM MOVIMENTO", que gerador-xlsx.ts
  // NAO reconhece como prefixo de exclusao da taxa (so' reconhece o prefixo
  // "SEM RASTREADOR") -- so' 1 das 23 NFs (a que por algum motivo nao batia
  // semMovimento) saia corretamente como sem rastreador; as outras 22
  // ficavam DENTRO da taxa de falha, contando contra a operacao por um
  // problema de CADASTRO (placa sem rastreador), nao de entrega. Pedido da
  // operacao: "sem rastreador" e' fato conhecido e deve prevalecer sobre
  // "sem movimento" (evidencia mais fraca, so' descreve o SINTOMA) e sobre
  // AGUARDANDO -- excecao unica: se OUTRA placa comprovadamente entregou
  // (porOutraPlaca), isso e' evidencia POSITIVA de entrega e continua
  // vencendo (o dado nao mente so' porque o cadastro da placa esta errado).
  describe('SEM RASTREADOR prevalece sobre SEM MOVIMENTO (achado real TTL5J17 23/09)', () => {
    it('temRastreador=false + paradas so BASE + km<2 (caso exato TTL5J17): TODAS as NFs saem SEM RASTREADOR, nunca SEM MOVIMENTO, fora da taxa', () => {
      const linhas = [linha('NF1'), linha('NF2')]
      const paradasFrota = new Map([['TTL5J17', [parada({ placa_norm: 'TTL5J17', classificacao: 'BASE' })]]])

      const detalhes = montarDetalheEntregas(
        '93758', 'TTL5J17', linhas, [], new Map(), resumoCargaVazio,
        false, paradasFrota, 0.5, false, false, false, new Map(), /* tratarSemRastreadorNoDia */ true,
      )

      for (const d of detalhes) {
        expect(d.observacao).toBe('SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO')
        expect(d.observacao ?? '').not.toContain('SEM MOVIMENTO')
        expect(d.evidencia).toBe('sem_rastreador')
        expect(d.status).toBe('pendente')
      }
    })

    it('temRastreador=false mas OUTRA placa comprovadamente entregou (porOutraPlaca): mantem ENTREGUE POR OUTRA PLACA, nao cede pra SEM RASTREADOR', () => {
      const linhas = [linha('NF1')]
      const paradaOutraPlaca = parada({ id: 'p2', placa_norm: 'RQV6I51', classificacao: 'FORA_BASE', lat: -22.9001, lng: -43.2001 })
      const paradasFrota = new Map([
        ['TTL5J17', []],
        ['RQV6I51', [paradaOutraPlaca]],
      ])

      const [d] = montarDetalheEntregas(
        '93758', 'TTL5J17', linhas, [], new Map(), resumoCargaVazio,
        false, paradasFrota, null, false, false, false, new Map(), /* tratarSemRastreadorNoDia */ true,
      )

      expect(d.status).toBe('confirmado_gps')
      expect(d.observacao).toBe('ENTREGUE POR OUTRA PLACA (RQV6I51) - CARGA TRANSFERIDA')
    })

    it('placa COM rastreador (temRastreador=true), mesmo cenario de paradas so BASE + km<2: continua VEICULO SEM MOVIMENTO normalmente', () => {
      const linhas = [linha('NF1')]
      const paradasFrota = new Map([['TTL7D40', [parada({ classificacao: 'BASE' })]]])

      const [d] = montarDetalheEntregas(
        '93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio,
        true, paradasFrota, 0.5,
      )

      expect(d.observacao).toBe('VEÍCULO SEM MOVIMENTO NO DIA - CONFERIR RASTREADOR OU SE SAIU PRA RUA')
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

// Task 5 (plano 24/09, requisito P0 da Ana: "expor origem, método e
// distância; não equiparar parada em rua semelhante a entrega") -- um teste
// por valor do enum EvidenciaNf (ver comentário completo em types.ts),
// nunca lendo `Visita.distanciaMetrosDoPonto` (sempre 0 quando a Visita
// vem da ponte do monitoramento, ver acharCoordenadaDaParadaPropria em
// agregacao.ts) -- distParadaM sempre vem de casar a janela [chegada,saida]
// da Visita contra `paradasPorOutraPlaca` (coordenada real).
describe('montarDetalheEntregas -- EvidenciaNf e distParadaM (Task 5, plano 24/09)', () => {
  const resumoCargaVazio = { motorista: '', saidaCd: null, chegadaCd: null, tempoOperacaoMin: null }

  it('sem_rastreador: placa sem nenhuma fonte de GPS no dia -- distParadaM null (nunca medido)', () => {
    const [d] = montarDetalheEntregas('93758', 'TTL5J17', [linha('NF1')], [], new Map(), resumoCargaVazio, false, new Map(), null, false, false, false, new Map(), /* tratarSemRastreadorNoDia */ true)

    expect(d.evidencia).toBe('sem_rastreador')
    expect(d.distParadaM).toBeNull()
  })

  it('outra_placa: confirmada pela parada de outro veiculo da frota -- distParadaM = distancia real ate essa parada', () => {
    const linhas = [linha('NF1')] // lat -22.9, lng -43.2
    const paradaOutraPlaca = parada({ id: 'p2', placa_norm: 'RQV6I51', classificacao: 'FORA_BASE', lat: -22.9001, lng: -43.2001 })
    const paradasFrota = new Map([['TTL7D40', []], ['RQV6I51', [paradaOutraPlaca]]])

    const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, true, paradasFrota)

    expect(d.status).toBe('confirmado_gps')
    expect(d.evidencia).toBe('outra_placa')
    expect(d.distParadaM).not.toBeNull()
    expect(d.distParadaM as number).toBeLessThan(50)
  })

  it('alvo_feito_unitrac: confirmado so pelo alvo da Unitrac, sem Visita de GPS -- distParadaM null (nada pra comparar)', () => {
    const alvos = [alvo('NF1', 1)]

    const [d] = montarDetalheEntregas('93758', 'TTL7D40', [linha('NF1')], alvos, new Map(), resumoCargaVazio)

    expect(d.status).toBe('confirmado_unitrac')
    expect(d.evidencia).toBe('alvo_feito_unitrac')
    expect(d.distParadaM).toBeNull()
  })

  // Mesmo caso de aceite RQQ5B81/NF 2386225 (23/09, Task 2): grupo de 3
  // enderecos confirmados pela MESMA parada curta (1min), 1 genuinamente
  // perto (~45m, vencedor) e 2 longe (>3km, perdedores).
  it('parada_curta_compartilhada: NF vencedora do grupo (ENTREGUE - PARADA CURTA...) -- distParadaM = distancia real ate a parada, dentro do raio vencedor', () => {
    const paradaCurta = { chegada: '2026-09-11T08:00:00.000Z', saida: '2026-09-11T08:01:00.000Z' }
    const paradaReal = parada({
      chegada: paradaCurta.chegada, saida: paradaCurta.saida, fim_real: paradaCurta.saida,
      classificacao: 'FORA_BASE', lat: -22.71, lng: -42.628,
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
    const nfA = detalhes.find(d => d.nf === 'NF_A')!

    expect(nfA.status).toBe('confirmado_gps')
    expect(nfA.evidencia).toBe('parada_curta_compartilhada')
    expect(nfA.distParadaM).not.toBeNull()
    expect(nfA.distParadaM as number).toBeLessThan(150)
  })

  it('sem_evidencia: NF que PERDEU a parada curta compartilhada pra outro endereco -- distancia real ainda medida (foi ela quem decidiu a perda), so nao vira evidencia positiva', () => {
    const paradaCurta = { chegada: '2026-09-11T08:00:00.000Z', saida: '2026-09-11T08:01:00.000Z' }
    const paradaReal = parada({
      chegada: paradaCurta.chegada, saida: paradaCurta.saida, fim_real: paradaCurta.saida,
      classificacao: 'FORA_BASE', lat: -22.71, lng: -42.628,
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
    const nfB = detalhes.find(d => d.nf === 'NF_B')!

    expect(nfB.status).toBe('pendente')
    expect(nfB.evidencia).toBe('sem_evidencia')
    expect(nfB.distParadaM).not.toBeNull()
    expect(nfB.distParadaM as number).toBeGreaterThan(300)
  })

  it('vizinhanca: emprestou horario de outro ponto do romaneio a <=800m -- distancia real ate a parada fisica, nunca 0 (valor antigo da ponte)', () => {
    const linhas = [linha('NF1')] // lat -22.9, lng -43.2
    const visitas = new Map<string, Visita>([
      ['NF1', { nf: 'NF1', chegada: '2026-08-30T10:00:00.000Z', saida: '2026-08-30T10:15:00.000Z', distanciaMetrosDoPonto: 0, viaVizinhanca: true }],
    ])
    const paradaReal = parada({
      chegada: '2026-08-30T10:00:00.000Z', saida: '2026-08-30T10:15:00.000Z', fim_real: '2026-08-30T10:15:00.000Z',
      classificacao: 'FORA_BASE', lat: -22.905, lng: -43.205,
    })
    const paradasPorOutraPlaca = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaReal]]])

    const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio, true, paradasPorOutraPlaca)

    expect(d.evidencia).toBe('vizinhanca')
    expect(d.distParadaM).not.toBeNull()
    expect(d.distParadaM as number).toBeGreaterThan(500)
  })

  it('raio_ampliado: confirmada por dwell no proprio endereco no raio ampliado (500-800m) -- distancia real medida', () => {
    const linhas = [linha('NF1')] // lat -22.9, lng -43.2
    const visitas = new Map<string, Visita>([
      ['NF1', { nf: 'NF1', chegada: '2026-09-06T10:00:00.000Z', saida: '2026-09-06T10:27:00.000Z', distanciaMetrosDoPonto: 501, viaRaioAmpliado: true }],
    ])
    const paradaReal = parada({
      chegada: '2026-09-06T10:00:00.000Z', saida: '2026-09-06T10:27:00.000Z', fim_real: '2026-09-06T10:27:00.000Z',
      classificacao: 'FORA_BASE', lat: -22.9045, lng: -43.2,
    })
    const paradasPorOutraPlaca = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaReal]]])

    const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio, true, paradasPorOutraPlaca)

    expect(d.evidencia).toBe('raio_ampliado')
    expect(d.distParadaM).not.toBeNull()
  })

  it('parada_no_endereco: confirmacao normal sem cadastro Unitrac pra comparar -- vence o geocode do endereco', () => {
    const linhas = [linha('NF1', { lat: -22.9, lng: -43.2 })]
    const visitas = new Map<string, Visita>([
      ['NF1', { nf: 'NF1', chegada: '2026-09-20T10:00:00.000Z', saida: '2026-09-20T10:10:00.000Z', distanciaMetrosDoPonto: 0 }],
    ])
    const paradaReal = parada({
      chegada: '2026-09-20T10:00:00.000Z', saida: '2026-09-20T10:10:00.000Z', fim_real: '2026-09-20T10:10:00.000Z',
      classificacao: 'FORA_BASE', lat: -22.9005, lng: -43.2005,
    })
    const paradasPorOutraPlaca = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaReal]]])

    // sem alvo -- nenhum cadastro Unitrac pra comparar
    const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio, true, paradasPorOutraPlaca)

    expect(d.status).toBe('confirmado_gps')
    expect(d.evidencia).toBe('parada_no_endereco')
    expect(d.distParadaM).not.toBeNull()
    expect(d.distParadaM as number).toBeLessThan(150)
  })

  // Step 2 do brief da Task 5: a ponte ja' escolhe entre geocode e latAlt;
  // aqui o KPI distingue comparando as duas distancias -- a mais perto
  // vence. Cadastro (AlvoApi.pontoLat/pontoLng) bem mais perto da parada
  // real do que o geocode do endereco (proposital, geocode ruim).
  it('parada_no_cadastro_unitrac: a parada real esta mais perto do cadastro Unitrac do que do nosso geocode -- vence o cadastro', () => {
    const linhas = [linha('NF1', { lat: -22.9, lng: -43.2 })] // geocode longe da parada real
    const visitas = new Map<string, Visita>([
      ['NF1', { nf: 'NF1', chegada: '2026-09-20T10:00:00.000Z', saida: '2026-09-20T10:10:00.000Z', distanciaMetrosDoPonto: 0 }],
    ])
    const paradaReal = parada({
      chegada: '2026-09-20T10:00:00.000Z', saida: '2026-09-20T10:10:00.000Z', fim_real: '2026-09-20T10:10:00.000Z',
      classificacao: 'FORA_BASE', lat: -22.905, lng: -43.205,
    })
    const paradasPorOutraPlaca = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaReal]]])
    const alvos = [alvo('NF1', 0, { pontoLat: -22.9051, pontoLng: -43.2051 })] // cadastro bem perto da parada real

    const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, alvos, visitas, resumoCargaVazio, true, paradasPorOutraPlaca)

    expect(d.status).toBe('confirmado_gps') // situacao=0 -- nao confirma via Unitrac, so' via GPS
    expect(d.evidencia).toBe('parada_no_cadastro_unitrac')
    expect(d.distParadaM).not.toBeNull()
    expect(d.distParadaM as number).toBeLessThan(50)
  })

  // Fix round 1 (revisao 24/09 da Task 5, achado 1): duas paradas cruas
  // podem se sobrepor a MESMA janela [chegada,saida] da Visita (ex. um blip
  // de transito perto do fim de uma parada de verdade, seguido de outra
  // parada de verdade logo depois) -- devolver a PRIMEIRA por ordem de
  // array (comportamento antigo) pegava o blip (30s de sobreposicao, longe
  // do endereco) em vez da parada de verdade (sobreposicao total, perto do
  // endereco). Critério novo: maior sobreposição temporal vence.
  it('acharCoordenadaDaParadaPropria escolhe a parada com MAIOR sobreposicao temporal, nao a primeira do array', () => {
    const linhas = [linha('NF1', { lat: -22.9, lng: -43.2 })]
    const visitas = new Map<string, Visita>([
      ['NF1', { nf: 'NF1', chegada: '2026-09-25T10:00:00.000Z', saida: '2026-09-25T10:10:00.000Z', distanciaMetrosDoPonto: 0 }],
    ])
    // Blip listado PRIMEIRO: so' 30s de sobreposicao com a janela da Visita
    // ([10:00,10:10]), longe do endereco (~5km).
    const blip = parada({
      id: 'blip', chegada: '2026-09-25T09:59:00.000Z', saida: '2026-09-25T10:00:30.000Z', fim_real: '2026-09-25T10:00:30.000Z',
      classificacao: 'FORA_BASE', lat: -22.945, lng: -43.2,
    })
    // Parada real listada DEPOIS: sobreposicao TOTAL (600s), perto do
    // endereco (~50m).
    const paradaReal = parada({
      id: 'real', chegada: '2026-09-25T10:00:00.000Z', saida: '2026-09-25T10:10:00.000Z', fim_real: '2026-09-25T10:10:00.000Z',
      classificacao: 'FORA_BASE', lat: -22.9004, lng: -43.2,
    })
    const paradasPorOutraPlaca = new Map<string, UnitracParadaRow[]>([['TTL7D40', [blip, paradaReal]]])

    const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio, true, paradasPorOutraPlaca)

    expect(d.evidencia).toBe('parada_no_endereco')
    expect(d.distParadaM).not.toBeNull()
    expect(d.distParadaM as number).toBeLessThan(100) // pegou a parada real (~44m), nao o blip (~5km)
  })

  it('acharCoordenadaDaParadaPropria em empate de sobreposicao desempata pela mais proxima da referencia (geocode)', () => {
    const linhas = [linha('NF1', { lat: -22.9, lng: -43.2 })]
    const visitas = new Map<string, Visita>([
      ['NF1', { nf: 'NF1', chegada: '2026-09-25T11:00:00.000Z', saida: '2026-09-25T11:10:00.000Z', distanciaMetrosDoPonto: 0 }],
    ])
    // As duas cobrem a janela INTEIRA (mesma sobreposicao, 600s) -- so' a
    // distancia ate o geocode desempata.
    const longe = parada({
      id: 'longe', chegada: '2026-09-25T11:00:00.000Z', saida: '2026-09-25T11:10:00.000Z', fim_real: '2026-09-25T11:10:00.000Z',
      classificacao: 'FORA_BASE', lat: -22.92, lng: -43.2,
    })
    const perto = parada({
      id: 'perto', chegada: '2026-09-25T11:00:00.000Z', saida: '2026-09-25T11:10:00.000Z', fim_real: '2026-09-25T11:10:00.000Z',
      classificacao: 'FORA_BASE', lat: -22.9002, lng: -43.2,
    })
    const paradasPorOutraPlaca = new Map<string, UnitracParadaRow[]>([['TTL7D40', [longe, perto]]])

    const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio, true, paradasPorOutraPlaca)

    expect(d.evidencia).toBe('parada_no_endereco')
    expect(d.distParadaM).not.toBeNull()
    expect(d.distParadaM as number).toBeLessThan(50) // pegou "perto" (~22m), nao "longe" (~2,2km)
  })

  // Fix round 1 (revisao 24/09 da Task 5, achado 2): casamento por horario e'
  // independente do raio que a ponte ja validou -- quando a parada achada
  // fica longe de QUALQUER referencia conhecida, e' coincidencia de
  // horario, nao a mesma parada fisica. Evidencia continua a mesma; so' a
  // distancia exposta vira null (nunca mostra um numero que nao bate).
  it('parada casada por horario a >800m de QUALQUER referencia (geocode e cadastro): distParadaM null, evidencia mantida', () => {
    const linhas = [linha('NF1', { lat: -22.9, lng: -43.2 })]
    const visitas = new Map<string, Visita>([
      ['NF1', { nf: 'NF1', chegada: '2026-09-20T10:00:00.000Z', saida: '2026-09-20T10:10:00.000Z', distanciaMetrosDoPonto: 0 }],
    ])
    // ~3km do geocode -- casamento por horario bateu, mas a coordenada nao
    // bate com o endereco nem com nenhum cadastro (nenhum alvo passado).
    const paradaLonge = parada({
      chegada: '2026-09-20T10:00:00.000Z', saida: '2026-09-20T10:10:00.000Z', fim_real: '2026-09-20T10:10:00.000Z',
      classificacao: 'FORA_BASE', lat: -22.927, lng: -43.2,
    })
    const paradasPorOutraPlaca = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaLonge]]])

    const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio, true, paradasPorOutraPlaca)

    expect(d.status).toBe('confirmado_gps')
    expect(d.evidencia).toBe('parada_no_endereco') // evidencia nao muda
    expect(d.distParadaM).toBeNull() // mas a distancia nao confiavel some
  })
})

// Task 10 (plano 24/09): ~27 NFs de 22/09 que a Ana vincula por codigo do
// cliente saiam "ENTREGUE" (confirmado_unitrac) SEM HORARIO nenhum, porque o
// feed GPS continuo travou/sumiu bem na parada -- so' o alvo da Unitrac
// (situacao=1) confirmou. 24 dessas 27 estao no /stops da Unitrac (apos a
// Task 7, ja mescladas com o snapshot). Quando a parada da PROPRIA placa
// contem o `feitoISO` do alvo (tolerancia de 10min antes da chegada / depois
// da saida da parada) E o centro da parada esta a <=500m do cadastro Unitrac
// (alvo.pontoLat/pontoLng) OU do geocode confiavel (linha.lat/lng,
// geoConfiavel !== false), a parada empresta chegada/saida/distParadaM pra
// essa NF -- evidencia continua 'alvo_feito_unitrac' (nunca vira
// 'confirmado_gps', a confirmacao em si segue sendo o alvo, so' o
// horario/distancia passam a vir preenchidos).
//
// Fix round 1 (revisao 24/09, achado da revisao de codigo): a busca usa o
// parametro DEDICADO `paradasUnitracCruasPropriaPlaca` (ultimo argumento),
// NUNCA `paradasPorOutraPlaca` -- esse ja' passou por `resolverParadas`
// (unitrac.ts), que descarta as paradas cruas da Unitrac inteiras sempre
// que a ponte do monitoramento respondeu e nao houve apagao de sinal
// detectado (mesmo quando a ponte tambem congelou sem disparar esse flag --
// o caso exato que a Task 10 resolve). Os testes abaixo passam a parada do
// feito SO' no parametro novo, e `paradasPorOutraPlaca` com uma parada
// DIFERENTE (ou vazio) -- provando que a busca nunca olha pro lugar errado.
describe('montarDetalheEntregas -- alvo_feito_unitrac herda horario da parada Unitrac quando o GPS continuo falhou (Task 10, plano 24/09)', () => {
  const resumoCargaVazio = { motorista: '', saidaCd: null, chegadaCd: null, tempoOperacaoMin: null }

  it('parada contem o feito e esta a ~100m do geocode -- chegada/saida/distParadaM preenchidos, evidencia continua alvo_feito_unitrac', () => {
    const alvos = [alvo('NF1', 1, { feitoISO: '2026-09-22T10:05:00.000Z' })] // linha() default: lat -22.9, lng -43.2
    const paradaPropria = parada({
      chegada: '2026-09-22T10:00:00.000Z', saida: '2026-09-22T10:20:00.000Z', fim_real: '2026-09-22T10:20:00.000Z',
      classificacao: 'FORA_BASE', lat: -22.9009, lng: -43.2, // ~100m ao sul do geocode
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

    const [d] = montarDetalheEntregas(
      '93758', 'TTL7D40', [linha('NF1')], alvos, new Map(), resumoCargaVazio, true,
      new Map(), null, false, false, false, paradasCruas,
    )

    expect(d.status).toBe('confirmado_unitrac')
    expect(d.evidencia).toBe('alvo_feito_unitrac')
    expect(d.chegada).toBe('2026-09-22T10:00:00.000Z')
    expect(d.saida).toBe('2026-09-22T10:20:00.000Z')
    expect(d.distParadaM).not.toBeNull()
    expect(d.distParadaM as number).toBeLessThan(150)
  })

  it('parada contem o feito mas esta a ~2km de qualquer referencia -- sem horario (comportamento atual preservado)', () => {
    const alvos = [alvo('NF1', 1, { feitoISO: '2026-09-22T10:05:00.000Z' })]
    const paradaLonge = parada({
      chegada: '2026-09-22T10:00:00.000Z', saida: '2026-09-22T10:20:00.000Z', fim_real: '2026-09-22T10:20:00.000Z',
      classificacao: 'FORA_BASE', lat: -22.918, lng: -43.2, // ~2km do geocode
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaLonge]]])

    const [d] = montarDetalheEntregas(
      '93758', 'TTL7D40', [linha('NF1')], alvos, new Map(), resumoCargaVazio, true,
      new Map(), null, false, false, false, paradasCruas,
    )

    expect(d.status).toBe('confirmado_unitrac')
    expect(d.evidencia).toBe('alvo_feito_unitrac')
    expect(d.chegada).toBeNull()
    expect(d.saida).toBeNull()
    expect(d.distParadaM).toBeNull()
  })

  it('feito fora de qualquer parada (mesmo perto) -- sem horario', () => {
    const alvos = [alvo('NF1', 1, { feitoISO: '2026-09-22T12:00:00.000Z' })] // bem depois da parada abaixo
    const paradaPerto = parada({
      chegada: '2026-09-22T10:00:00.000Z', saida: '2026-09-22T10:20:00.000Z', fim_real: '2026-09-22T10:20:00.000Z',
      classificacao: 'FORA_BASE', lat: -22.9001, lng: -43.2,
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPerto]]])

    const [d] = montarDetalheEntregas(
      '93758', 'TTL7D40', [linha('NF1')], alvos, new Map(), resumoCargaVazio, true,
      new Map(), null, false, false, false, paradasCruas,
    )

    expect(d.status).toBe('confirmado_unitrac')
    expect(d.evidencia).toBe('alvo_feito_unitrac')
    expect(d.chegada).toBeNull()
    expect(d.saida).toBeNull()
    expect(d.distParadaM).toBeNull()
  })

  // Teste de fuso (bug critico de 3h ja visto neste projeto -- NAO reintroduzir):
  // feitoISO em digitos BRT ("2026-09-22T10:05:00Z", ja mascarado, mesma
  // convencao de instanteDeFeitoISO) precisa casar com uma parada cuja
  // janela [chegada, saida] tambem esta em digitos BRT (10:00-10:20), SEM
  // somar nem subtrair 3h em nenhum dos lados.
  it('fuso: feito "2026-09-22T10:05:00Z" (digitos BRT) casa com parada 10:00-10:20 na MESMA convencao -- nunca desloca 3h', () => {
    const alvos = [alvo('NF1', 1, { feitoISO: '2026-09-22T10:05:00Z' })]
    const paradaPropria = parada({
      chegada: '2026-09-22T10:00:00Z', saida: '2026-09-22T10:20:00Z', fim_real: '2026-09-22T10:20:00Z',
      classificacao: 'FORA_BASE', lat: -22.9005, lng: -43.2,
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

    const [d] = montarDetalheEntregas(
      '93758', 'TTL7D40', [linha('NF1')], alvos, new Map(), resumoCargaVazio, true,
      new Map(), null, false, false, false, paradasCruas,
    )

    expect(d.evidencia).toBe('alvo_feito_unitrac')
    expect(d.chegada).toBe('2026-09-22T10:00:00Z')
    expect(d.saida).toBe('2026-09-22T10:20:00Z')
    expect(d.distParadaM).not.toBeNull()
  })

  it('tolerancia de 10min: feito 9min antes da chegada da parada ainda casa (dentro da janela ampliada)', () => {
    const alvos = [alvo('NF1', 1, { feitoISO: '2026-09-22T09:51:00.000Z' })] // 9min antes de 10:00
    const paradaPropria = parada({
      chegada: '2026-09-22T10:00:00.000Z', saida: '2026-09-22T10:20:00.000Z', fim_real: '2026-09-22T10:20:00.000Z',
      classificacao: 'FORA_BASE', lat: -22.9005, lng: -43.2,
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

    const [d] = montarDetalheEntregas(
      '93758', 'TTL7D40', [linha('NF1')], alvos, new Map(), resumoCargaVazio, true,
      new Map(), null, false, false, false, paradasCruas,
    )

    expect(d.chegada).toBe('2026-09-22T10:00:00.000Z')
    expect(d.distParadaM).not.toBeNull()
  })

  it('usa o cadastro Unitrac (pontoLat/pontoLng) quando o geocode nao e confiavel', () => {
    const alvos = [alvo('NF1', 1, { feitoISO: '2026-09-22T10:05:00.000Z', pontoLat: -22.9009, pontoLng: -43.2 })]
    const paradaPropria = parada({
      chegada: '2026-09-22T10:00:00.000Z', saida: '2026-09-22T10:20:00.000Z', fim_real: '2026-09-22T10:20:00.000Z',
      classificacao: 'FORA_BASE', lat: -22.9009, lng: -43.2, // ~100m do CADASTRO, longe do geocode nao confiavel
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])
    const linhas = [linha('NF1', { geoConfiavel: false, lat: -23.5, lng: -46.6 })] // geocode ruim, longe de tudo

    const [d] = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, alvos, new Map(), resumoCargaVazio, true,
      new Map(), null, false, false, false, paradasCruas,
    )

    expect(d.evidencia).toBe('alvo_feito_unitrac')
    expect(d.chegada).toBe('2026-09-22T10:00:00.000Z')
    expect(d.distParadaM).not.toBeNull()
    expect(d.distParadaM as number).toBeLessThan(150)
  })

  // Teste pedido explicitamente pela revisao de codigo (Fix round 1): reproduz
  // o cenario real que o fix corrige. `paradasPorOutraPlaca` (o que o resto
  // do fluxo usa -- resultado de resolverParadas) tem uma parada da PONTE
  // pra essa placa, mas essa parada NAO contem o feito (a ponte tambem
  // congelou, so' que sem disparar apagaoDeSinal -- resolverParadas ainda
  // assim descarta a Unitrac crua e fica so' com essa parada da ponte, ver
  // unitrac.ts:175). As paradas CRUAS da Unitrac (paradasUnitracCruasPropria
  // Placa, o que `paradasEfetivas` devolve ANTES de resolverParadas escolher)
  // tem a parada certa, que contem o feito. So' passando as cruas no
  // parametro dedicado o horario aparece -- se a busca ainda lesse
  // `paradasPorOutraPlaca` (bug da Task 10 original), este teste falharia.
  it('placa sem apagao cujas paradas RESOLVIDAS vem da ponte (sem a parada do feito) mas cujas paradas Unitrac CRUAS tem a parada do feito -- horario preenchido (Fix round 1)', () => {
    const alvos = [alvo('NF1', 1, { feitoISO: '2026-09-22T10:05:00.000Z' })] // linha() default: lat -22.9, lng -43.2
    // Parada da PONTE (o que resolverParadas entregaria sem apagao) -- longe
    // do horario do feito, nao pode confirmar nada.
    const paradaDaPonteSemFeito = parada({
      id: 'ponte-sem-feito', chegada: '2026-09-22T14:00:00.000Z', saida: '2026-09-22T14:10:00.000Z', fim_real: '2026-09-22T14:10:00.000Z',
      classificacao: 'FORA_BASE', lat: -22.9009, lng: -43.2,
    })
    const paradasResolvidas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaDaPonteSemFeito]]])
    // Parada CRUA da Unitrac (o que a API/snapshot devolveram, ANTES de
    // resolverParadas descarta-la em favor da ponte) -- contem o feito.
    const paradaCruaComFeito = parada({
      id: 'crua-com-feito', chegada: '2026-09-22T10:00:00.000Z', saida: '2026-09-22T10:20:00.000Z', fim_real: '2026-09-22T10:20:00.000Z',
      classificacao: 'FORA_BASE', lat: -22.9009, lng: -43.2,
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaCruaComFeito]]])

    const [d] = montarDetalheEntregas(
      '93758', 'TTL7D40', [linha('NF1')], alvos, new Map(), resumoCargaVazio, true,
      paradasResolvidas, null, false, false, false, paradasCruas,
    )

    expect(d.status).toBe('confirmado_unitrac')
    expect(d.evidencia).toBe('alvo_feito_unitrac')
    expect(d.chegada).toBe('2026-09-22T10:00:00.000Z') // veio da parada CRUA, nao da ponte
    expect(d.saida).toBe('2026-09-22T10:20:00.000Z')
    expect(d.distParadaM).not.toBeNull()
  })

  it('regressao: se a busca voltasse a olhar paradasPorOutraPlaca (resolvida), ficaria sem horario -- confirma que os dois parametros sao independentes', () => {
    const alvos = [alvo('NF1', 1, { feitoISO: '2026-09-22T10:05:00.000Z' })]
    // So' a parada RESOLVIDA (ponte) contem o feito -- as cruas estao vazias
    // (placa sem entrada nenhuma no mapa dedicado). Comportamento correto:
    // sem horario (a Task 10 nunca deve ler paradasPorOutraPlaca).
    const paradaComFeitoSoNaResolvida = parada({
      chegada: '2026-09-22T10:00:00.000Z', saida: '2026-09-22T10:20:00.000Z', fim_real: '2026-09-22T10:20:00.000Z',
      classificacao: 'FORA_BASE', lat: -22.9009, lng: -43.2,
    })
    const paradasResolvidas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaComFeitoSoNaResolvida]]])

    const [d] = montarDetalheEntregas(
      '93758', 'TTL7D40', [linha('NF1')], alvos, new Map(), resumoCargaVazio, true,
      paradasResolvidas, null, false, false, false, new Map(),
    )

    expect(d.status).toBe('confirmado_unitrac')
    expect(d.evidencia).toBe('alvo_feito_unitrac')
    expect(d.chegada).toBeNull()
    expect(d.saida).toBeNull()
    expect(d.distParadaM).toBeNull()
  })
})

// Revisao final pre-deploy (24/09), item 1: `semRastreadorNoDia` e o rotulo
// unificado "SEM RASTREADOR - VEICULO SEM RASTREAMENTO NO DIA" sao da Nutry
// Max -- o Rio Quality (kpi-rioquality/pipeline.ts) usa a MESMA
// montarDetalheEntregas e herdava o comportamento sem decisao. Opt-in via
// `tratarSemRastreadorNoDia` (14o parametro, default false), mesmo padrao de
// `verificarAcessoIlha`. Desligado = comportamento exato de 108b4bb.
describe('montarDetalheEntregas -- tratarSemRastreadorNoDia opt-in (revisao final 24/09, item 1)', () => {
  const resumoCargaVazio = { motorista: '', saidaCd: null, chegadaCd: null, tempoOperacaoMin: null }

  it('desligado (chamada do Rio Quality): placa sem CV, paradas [] -> observacao null (gerador mostra PLACA SEM RASTREADOR CADASTRADO), nunca o rotulo novo', () => {
    const paradasFrota = new Map<string, UnitracParadaRow[]>([['TTL5J17', []]])
    const [d] = montarDetalheEntregas('93758', 'TTL5J17', [linha('NF1')], [], new Map(), resumoCargaVazio, false, paradasFrota, null)
    expect(d.status).toBe('pendente')
    expect(d.observacao).toBeNull()
    expect(d.evidencia).not.toBe('sem_rastreador')
  })

  it('desligado: placa com CV mas zero posicoes no dia encerrado -> rotulo antigo "NENHUMA POSIÇÃO REPORTADA"', () => {
    const paradasFrota = new Map<string, UnitracParadaRow[]>([['TTL7D40', []]])
    const [d] = montarDetalheEntregas('93758', 'TTL7D40', [linha('NF1')], [], new Map(), resumoCargaVazio, true, paradasFrota, null)
    expect(d.observacao).toBe('SEM RASTREADOR - NENHUMA POSIÇÃO REPORTADA NO DIA - CONFERIR EQUIPAMENTO')
  })

  it('desligado: placa sem CV + paradas so BASE + km<2 -> VEICULO SEM MOVIMENTO (como em 108b4bb)', () => {
    const paradasFrota = new Map([['TTL5J17', [parada({ placa_norm: 'TTL5J17', classificacao: 'BASE' })]]])
    const [d] = montarDetalheEntregas('93758', 'TTL5J17', [linha('NF1')], [], new Map(), resumoCargaVazio, false, paradasFrota, 0.5)
    expect(d.observacao).toBe('VEÍCULO SEM MOVIMENTO NO DIA - CONFERIR RASTREADOR OU SE SAIU PRA RUA')
  })

  it('desligado: placa sem CV com dia em andamento -> AGUARDANDO (como em 108b4bb)', () => {
    const [d] = montarDetalheEntregas('93758', 'TTL5J17', [linha('NF1')], [], new Map(), resumoCargaVazio, false, new Map(), null, true)
    expect(d.observacao).toBe('AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO')
  })
})

// Revisao final pre-deploy (24/09), item 3: caso (b) de semRastreadorNoDia
// (tem CV mas zero posicoes no dia) nao conferia outros sinais de que o
// veiculo rodou -- alvo "feito" da Unitrac pra placa no dia, ou km > 0,
// desmentem "sem rastreamento".
describe('montarDetalheEntregas -- semRastreadorNoDia caso (b) confere alvo feito e km (revisao final 24/09, item 3)', () => {
  const resumoCargaVazio = { motorista: '', saidaCd: null, chegadaCd: null, tempoOperacaoMin: null }
  const OBS = 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO'

  it('zero posicoes mas a placa tem alvo feito na Unitrac no dia (outra NF): NF pendente NAO vira sem rastreador', () => {
    const paradasFrota = new Map<string, UnitracParadaRow[]>([['TTL7D40', []]])
    const detalhes = montarDetalheEntregas(
      '93758', 'TTL7D40', [linha('NF1'), linha('NF2')], [alvo('NF1', 1)], new Map(), resumoCargaVazio,
      true, paradasFrota, null, false, false, false, new Map(), true,
    )
    const nf2 = detalhes.find(d => d.nf === 'NF2')!
    expect(nf2.status).toBe('pendente')
    expect(nf2.observacao).not.toBe(OBS)
    expect(nf2.evidencia).not.toBe('sem_rastreador')
  })

  it('zero posicoes mas kmPercorrido > 0: NAO vira sem rastreador', () => {
    const paradasFrota = new Map<string, UnitracParadaRow[]>([['TTL7D40', []]])
    const [d] = montarDetalheEntregas(
      '93758', 'TTL7D40', [linha('NF1')], [], new Map(), resumoCargaVazio,
      true, paradasFrota, 35, false, false, false, new Map(), true,
    )
    expect(d.observacao).not.toBe(OBS)
    expect(d.evidencia).not.toBe('sem_rastreador')
  })

  it('zero posicoes, sem alvo feito, km null/0: continua sem rastreador', () => {
    const paradasFrota = new Map<string, UnitracParadaRow[]>([['TTL7D40', []]])
    const [d] = montarDetalheEntregas(
      '93758', 'TTL7D40', [linha('NF1')], [alvo('NF1', 0)], new Map(), resumoCargaVazio,
      true, paradasFrota, 0, false, false, false, new Map(), true,
    )
    expect(d.observacao).toBe(OBS)
  })
})

// Task 1 (plano 2026-09-25, mudanca de requisito pos-brief -- decisao do
// usuario e da operacao, prevalece sobre o brief original): na Nutry Max NAO
// EXISTE entrega por outra placa. `desativarOutraPlaca` (14o parametro
// posicional, opt-in so' Nutry Max, mesmo padrao de tratarSemRastreadorNoDia)
// desliga `acharParadaDeOutraPlaca` de vez -- nenhuma NF recebe "ENTREGUE POR
// OUTRA PLACA" (nem o rotulo antigo "CARGA TRANSFERIDA", nem um novo "ROTA
// TROCADA" -- essa nomenclatura foi descartada). A NF segue a classificacao
// normal pela PROPRIA placa; a Task 2 podera confirma-la depois pela parada
// Unitrac da propria placa.
describe('montarDetalheEntregas -- desativarOutraPlaca opt-in (Task 1, plano 2026-09-25, requisito revisado)', () => {
  const resumoCargaVazio = { motorista: '', saidaCd: null, chegadaCd: null, tempoOperacaoMin: null }

  it('(a) parada de outra placa a 10m do cliente e sem parada propria -- NAO confirma por outra placa, segue classificacao normal', () => {
    const linhas = [linha('NF1', { lat: -22.9, lng: -43.2 })]
    // ~10m da coordenada da linha.
    const paradaOutraPlaca = parada({ id: 'p2', placa_norm: 'RQV6I51', classificacao: 'FORA_BASE', lat: -22.90009, lng: -43.2 })
    const paradasFrota = new Map<string, UnitracParadaRow[]>([
      ['TTL7D40', []], // propria placa: nenhuma parada
      ['RQV6I51', [paradaOutraPlaca]],
    ])

    const [d] = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio,
      true, paradasFrota, null, false, false, false, new Map(), false,
      /* desativarOutraPlaca */ true,
    )

    expect(d.observacao ?? '').not.toContain('OUTRA PLACA')
    expect(d.evidencia).not.toBe('outra_placa')
    expect(d.status).toBe('pendente')
  })

  it('(b) opcao desligada (default, Rio Quality): continua ENTREGUE POR OUTRA PLACA (X) - CARGA TRANSFERIDA', () => {
    const linhas = [linha('NF1')]
    const paradaOutraPlaca = parada({ id: 'p2', placa_norm: 'RQV6I51', classificacao: 'FORA_BASE', lat: -22.9001, lng: -43.2001 })
    const paradasFrota = new Map<string, UnitracParadaRow[]>([
      ['TTL7D40', []],
      ['RQV6I51', [paradaOutraPlaca]],
    ])

    const [d] = montarDetalheEntregas('93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio, true, paradasFrota)

    expect(d.observacao).toBe('ENTREGUE POR OUTRA PLACA (RQV6I51) - CARGA TRANSFERIDA')
    expect(d.evidencia).toBe('outra_placa')
  })

  it('(c) evidencia nunca "outra_placa" com a opcao ligada, mesmo com varias NFs casadas com a mesma outra placa', () => {
    const linhas = [
      linha('NF1', { clienteCodigo: 'CLI1', lat: -22.9, lng: -43.2 }),
      linha('NF2', { clienteCodigo: 'CLI2', lat: -22.93, lng: -43.2 }),
    ]
    const paradasB = [
      parada({ id: 'pb1', placa_norm: 'RQV6I51', classificacao: 'FORA_BASE', lat: -22.9, lng: -43.2 }),
      parada({ id: 'pb2', placa_norm: 'RQV6I51', classificacao: 'FORA_BASE', lat: -22.93, lng: -43.2 }),
    ]
    const paradasFrota = new Map<string, UnitracParadaRow[]>([
      ['TTL7D40', []],
      ['RQV6I51', paradasB],
    ])

    const detalhes = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio,
      true, paradasFrota, null, false, false, false, new Map(), false,
      /* desativarOutraPlaca */ true,
    )

    for (const d of detalhes) {
      expect(d.evidencia).not.toBe('outra_placa')
      expect(d.observacao ?? '').not.toContain('OUTRA PLACA')
    }
  })
})

// Task 2 (plano 2026-09-25, regra R2 -- generaliza acharParadaUnitracParaFeito
// pra qualquer NF sem confirmacao limpa, nao so' confirmado_unitrac sem
// visita): `confirmarPorParadaUnitracPropria` (16o parametro posicional,
// opt-in so' Nutry Max, mesmo padrao de desativarOutraPlaca/
// tratarSemRastreadorNoDia). Usa a parada Unitrac CRUA da PROPRIA placa
// (paradasUnitracCruasPropriaPlaca) pra confirmar por presenca fisica.
describe('montarDetalheEntregas -- confirmarPorParadaUnitracPropria opt-in (Task 2, plano 2026-09-25, R2)', () => {
  const resumoCargaVazio = { motorista: '', saidaCd: null, chegadaCd: null, tempoOperacaoMin: null }

  // Mesmo espirito do padrao Nutry Max de producao (route.ts): temRastreador,
  // tratarSemRastreadorNoDia e desativarOutraPlaca ligados por padrao aqui --
  // so' `confirmarPorParadaUnitracPropria` e `temRastreador` variam por teste.
  function chamar(
    linhas: LinhaGeocodificada[],
    opts: {
      alvos?: AlvoApi[]
      visitasPorNf?: Map<string, Visita>
      paradasPorOutraPlaca?: Map<string, UnitracParadaRow[]>
      paradasUnitracCruasPropriaPlaca?: Map<string, UnitracParadaRow[]>
      temRastreador?: boolean
      detectarParadaCurtaCompartilhada?: boolean
      confirmarPorParadaUnitracPropria?: boolean
    } = {},
  ) {
    return montarDetalheEntregas(
      '93758', 'TTL7D40', linhas,
      opts.alvos ?? [],
      opts.visitasPorNf ?? new Map(),
      resumoCargaVazio,
      opts.temRastreador ?? true,
      opts.paradasPorOutraPlaca ?? new Map(),
      null,
      false,
      false,
      opts.detectarParadaCurtaCompartilhada ?? false,
      opts.paradasUnitracCruasPropriaPlaca ?? new Map(),
      true, // tratarSemRastreadorNoDia
      true, // desativarOutraPlaca
      opts.confirmarPorParadaUnitracPropria ?? true,
    )
  }

  // ~150m ao sul do geocode (delta lat = 150 / 111.195 m por 0,001 grau).
  const DELTA_150M = 0.0013491
  const DELTA_250M = 0.0022486
  const DELTA_40M = 0.0003598

  it('(a) parada Unitrac da propria placa, >=2min, a ~150m do geocode confiavel -- ENTREGUE limpo, evidencia/distancia da parada', () => {
    const linhas = [linha('NF1')] // lat -22.9, lng -43.2, geoConfiavel default (confiavel)
    const paradaPropria = parada({
      classificacao: 'FORA_BASE',
      lat: -22.9 + DELTA_150M, lng: -43.2,
      chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:03:00.000Z', fim_real: '2026-09-24T10:03:00.000Z',
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

    const [d] = chamar(linhas, { paradasUnitracCruasPropriaPlaca: paradasCruas })

    expect(d.status).toBe('confirmado_gps')
    expect(d.observacao).toBeNull()
    expect(d.evidencia).toBe('parada_unitrac_propria')
    expect(d.chegada).toBe('2026-09-24T10:00:00.000Z')
    expect(d.saida).toBe('2026-09-24T10:03:00.000Z')
    expect(d.distParadaM as number).toBeGreaterThan(100)
    expect(d.distParadaM as number).toBeLessThan(200)
  })

  it('(b) geocode NAO confiavel mas parada a ~150m do CADASTRO Unitrac do alvo -- mesma confirmacao, distancia ao cadastro', () => {
    const linhas = [linha('NF1', { lat: -22.9, lng: -43.2, geoConfiavel: false })]
    const alvos = [alvo('NF1', 0, { pontoLat: -23.0, pontoLng: -43.3 })]
    const paradaPropria = parada({
      classificacao: 'FORA_BASE',
      lat: -23.0 + DELTA_150M, lng: -43.3,
      chegada: '2026-09-24T11:00:00.000Z', saida: '2026-09-24T11:05:00.000Z', fim_real: '2026-09-24T11:05:00.000Z',
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

    const [d] = chamar(linhas, { alvos, paradasUnitracCruasPropriaPlaca: paradasCruas })

    expect(d.status).toBe('confirmado_gps')
    expect(d.observacao).toBeNull()
    expect(d.evidencia).toBe('parada_unitrac_propria')
    expect(d.chegada).toBe('2026-09-24T11:00:00.000Z')
    expect(d.distParadaM as number).toBeGreaterThan(100)
    expect(d.distParadaM as number).toBeLessThan(200)
  })

  it('(c) parada a ~250m deste cliente mas ~40m do endereco de OUTRA NF da mesma placa -- nao confirma este', () => {
    const paradaLat = -22.95
    const linhas = [
      linha('NF1', { endereco: 'ENDERECO A', lat: paradaLat + DELTA_250M, lng: -43.25 }),
      linha('NF2', { endereco: 'ENDERECO B', lat: paradaLat + DELTA_40M, lng: -43.25 }),
    ]
    const paradaPropria = parada({
      classificacao: 'FORA_BASE',
      lat: paradaLat, lng: -43.25,
      chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

    const [d1] = chamar(linhas, { paradasUnitracCruasPropriaPlaca: paradasCruas })

    expect(d1.evidencia).not.toBe('parada_unitrac_propria')
    expect(d1.status).toBe('pendente')
    expect(d1.chegada).toBeNull()
  })

  it('(d) parada de apenas 1min (abaixo do minimo de 2min) -- nao confirma', () => {
    const linhas = [linha('NF1')]
    const paradaCurta = parada({
      classificacao: 'FORA_BASE',
      lat: -22.9 + DELTA_150M, lng: -43.2,
      chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:01:00.000Z', fim_real: '2026-09-24T10:01:00.000Z',
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaCurta]]])

    const [d] = chamar(linhas, { paradasUnitracCruasPropriaPlaca: paradasCruas })

    expect(d.evidencia).not.toBe('parada_unitrac_propria')
    expect(d.status).toBe('pendente')
  })

  it('(e) NF que ja era ENTREGUE limpo pela ponte -- nada muda, mesmo com parada propria valida disponivel em outro horario', () => {
    const linhas = [linha('NF1')]
    const visitas = new Map<string, Visita>([
      ['NF1', { nf: 'NF1', chegada: '2026-09-24T09:00:00.000Z', saida: '2026-09-24T09:10:00.000Z', distanciaMetrosDoPonto: 20 }],
    ])
    const paradaPropria = parada({
      classificacao: 'FORA_BASE',
      lat: -22.9 + DELTA_150M, lng: -43.2,
      chegada: '2026-09-24T14:00:00.000Z', saida: '2026-09-24T14:05:00.000Z', fim_real: '2026-09-24T14:05:00.000Z',
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

    const [d] = chamar(linhas, { visitasPorNf: visitas, paradasUnitracCruasPropriaPlaca: paradasCruas })

    expect(d.status).toBe('confirmado_gps')
    expect(d.observacao).toBeNull()
    expect(d.chegada).toBe('2026-09-24T09:00:00.000Z')
    expect(d.evidencia).not.toBe('parada_unitrac_propria')
  })

  describe('(f) rotulos de ressalva/pendente listados no brief -- viram ENTREGUE limpo com parada propria valida', () => {
    it('ENTREGUE - PARADA CURTA (ATE 3MIN) CONFIRMOU VARIOS ENDERECOS', () => {
      const paradaCurtaCompartilhada = { chegada: '2026-09-24T08:00:00.000Z', saida: '2026-09-24T08:01:00.000Z' }
      const linhas = [
        linha('NF1', { endereco: 'RUA A, KM 1' }),
        linha('NF2', { endereco: 'RUA A, KM 2', lat: -22.93, lng: -43.2 }),
      ]
      const visitas = new Map<string, Visita>(
        linhas.map(l => [l.nf, { nf: l.nf, chegada: paradaCurtaCompartilhada.chegada, saida: paradaCurtaCompartilhada.saida, distanciaMetrosDoPonto: 10 }]),
      )
      const paradaPropria = parada({
        classificacao: 'FORA_BASE',
        lat: -22.9 + DELTA_150M, lng: -43.2,
        chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
      })
      const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

      const detalhes = chamar(linhas, { visitasPorNf: visitas, paradasUnitracCruasPropriaPlaca: paradasCruas, detectarParadaCurtaCompartilhada: true })
      const d1 = detalhes.find(d => d.nf === 'NF1')!

      expect(d1.status).toBe('confirmado_gps')
      expect(d1.observacao).toBeNull()
      expect(d1.evidencia).toBe('parada_unitrac_propria')
    })

    it('ENTREGUE - PARADA PROXIMA (500-800m) MAS DENTRO DA ROTA (viaRaioAmpliado)', () => {
      const linhas = [linha('NF1')]
      const visitas = new Map<string, Visita>([
        ['NF1', { nf: 'NF1', chegada: '2026-09-24T09:00:00.000Z', saida: '2026-09-24T09:10:00.000Z', distanciaMetrosDoPonto: 700, viaRaioAmpliado: true }],
      ])
      const paradaPropria = parada({
        classificacao: 'FORA_BASE',
        lat: -22.9 + DELTA_150M, lng: -43.2,
        chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
      })
      const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

      const [d] = chamar(linhas, { visitasPorNf: visitas, paradasUnitracCruasPropriaPlaca: paradasCruas })

      expect(d.status).toBe('confirmado_gps')
      expect(d.observacao).toBeNull()
      expect(d.evidencia).toBe('parada_unitrac_propria')
      expect(d.chegada).toBe('2026-09-24T10:00:00.000Z')
    })

    it('PASSOU NO ENDERECO MAS NAO REGISTROU PARADA (distPropria <=500m)', () => {
      const linhas = [linha('NF1')]
      const paradaPassou = parada({ classificacao: 'FORA_BASE', lat: -22.9012, lng: -43.2012 }) // ~180m
      const paradaPropriaConfirma = parada({
        classificacao: 'FORA_BASE',
        lat: -22.9 + DELTA_150M, lng: -43.2,
        chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
      })
      const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropriaConfirma]]])

      const [d] = chamar(linhas, {
        paradasPorOutraPlaca: new Map([['TTL7D40', [paradaPassou]]]),
        paradasUnitracCruasPropriaPlaca: paradasCruas,
      })

      expect(d.status).toBe('confirmado_gps')
      expect(d.observacao).toBeNull()
      expect(d.evidencia).toBe('parada_unitrac_propria')
    })

    it('PARADA PROXIMA (500m-2km) MAS FORA DO ENDERECO (distPropria ~1,1km)', () => {
      const linhas = [linha('NF1')]
      const paradaMeio = parada({ classificacao: 'FORA_BASE', lat: -22.910, lng: -43.200 }) // ~1,1km
      const paradaPropriaConfirma = parada({
        classificacao: 'FORA_BASE',
        lat: -22.9 + DELTA_150M, lng: -43.2,
        chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
      })
      const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropriaConfirma]]])

      const [d] = chamar(linhas, {
        paradasPorOutraPlaca: new Map([['TTL7D40', [paradaMeio]]]),
        paradasUnitracCruasPropriaPlaca: paradasCruas,
      })

      expect(d.status).toBe('confirmado_gps')
      expect(d.observacao).toBeNull()
      expect(d.evidencia).toBe('parada_unitrac_propria')
    })

    it('NAO FOI AO CLIENTE (distPropria >2km)', () => {
      const linhas = [linha('NF1')]
      const paradaLonge = parada({ classificacao: 'FORA_BASE', lat: -22.95, lng: -43.30 }) // ~11km
      const paradaPropriaConfirma = parada({
        classificacao: 'FORA_BASE',
        lat: -22.9 + DELTA_150M, lng: -43.2,
        chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
      })
      const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropriaConfirma]]])

      const [d] = chamar(linhas, {
        paradasPorOutraPlaca: new Map([['TTL7D40', [paradaLonge]]]),
        paradasUnitracCruasPropriaPlaca: paradasCruas,
      })

      expect(d.status).toBe('confirmado_gps')
      expect(d.observacao).toBeNull()
      expect(d.evidencia).toBe('parada_unitrac_propria')
    })

    it('ENDERECO COM COORDENADA IMPRECISA (geoConfiavel false, confirma pelo cadastro)', () => {
      const linhas = [linha('NF1', { geoConfiavel: false })]
      const alvos = [alvo('NF1', 0, { pontoLat: -23.0, pontoLng: -43.3 })]
      const paradaPropria = parada({
        classificacao: 'FORA_BASE',
        lat: -23.0 + DELTA_150M, lng: -43.3,
        chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
      })
      const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

      const [d] = chamar(linhas, { alvos, paradasUnitracCruasPropriaPlaca: paradasCruas })

      expect(d.status).toBe('confirmado_gps')
      expect(d.observacao).toBeNull()
      expect(d.evidencia).toBe('parada_unitrac_propria')
    })
  })

  it('(g) placa sem rastreador (rotulo SEM RASTREADOR) -- R2 nao se aplica', () => {
    const linhas = [linha('NF1')]
    const paradaPropria = parada({
      classificacao: 'FORA_BASE',
      lat: -22.9 + DELTA_150M, lng: -43.2,
      chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

    const [d] = chamar(linhas, { temRastreador: false, paradasUnitracCruasPropriaPlaca: paradasCruas })

    expect(d.evidencia).toBe('sem_rastreador')
    expect(d.status).toBe('pendente')
    expect(d.chegada).toBeNull()
    expect(d.observacao).toBe('SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO')
  })

  it('(h) opcao desligada (default) -- mesma parada valida NAO confirma nada', () => {
    const linhas = [linha('NF1')]
    const paradaPropria = parada({
      classificacao: 'FORA_BASE',
      lat: -22.9 + DELTA_150M, lng: -43.2,
      chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

    const [d] = chamar(linhas, { paradasUnitracCruasPropriaPlaca: paradasCruas, confirmarPorParadaUnitracPropria: false })

    expect(d.evidencia).not.toBe('parada_unitrac_propria')
    expect(d.status).toBe('pendente')
    expect(d.chegada).toBeNull()
  })
})

// Fix round 1 (revisao pos-medicao, achado real 24/09): a analise que
// embasou o plano (~/ClaudeGerado/kpi-regen-0922/analise-24-09.md) media 69
// NFs com a MESMA regra de R2, mas a primeira implementacao so' confirmou
// 31. Diagnostico NF a NF (TOS0G53/2388187, RQU2G47/2387959, TOS1H26/2388001
// -- todos com "Unitrac situacao 1 feito ..." na analise, i.e.
// confirmadoUnitrac=true) mostrou dois desvios da regra medida:
// (1) `elegivelParaConfirmarPorParadaPropria` excluia qualquer NF cujo
//     STATUS ja fosse 'confirmado_unitrac' -- mas a analise nunca olhou pro
//     enum de status, so' pra "tem ressalva/CONFERIR ou nao" (situacao=1 +
//     visita com raio ampliado/parada curta compartilhada/vizinhanca ainda
//     E' ambigua, so' o status por baixo e' confirmado_unitrac). 43 dos 69
//     tinham 'feito' Unitrac batendo -- a maioria caia nesse buraco.
// (2) a regra "nao mais perto de outro cliente" usava distancia RELATIVA
//     (`< dist`), mais agressiva que o texto exato da analise ("sem outro
//     cliente da mesma placa a <=150 m", raio FIXO).
// (3) faltavam dois rotulos que a analise mostra que R2 tambem recupera:
//     "compartilhada" (viaVizinhanca, 3 de 6) e "curta de outro endereco"
//     (perdeuParadaCompartilhada, 1 de 9).
describe('montarDetalheEntregas -- Fix round 1 (R2 tambem confirma quando o status ja e confirmado_unitrac com ressalva)', () => {
  const resumoCargaVazio = { motorista: '', saidaCd: null, chegadaCd: null, tempoOperacaoMin: null }
  const DELTA_150M = 0.0013491

  it('achado real TOS0G53/2388187: situacao=1 (confirmado_unitrac) + visita.viaRaioAmpliado -- R2 confirma pelo cadastro', () => {
    const linhas = [linha('NF1', { lat: -22.9, lng: -43.2 })]
    const alvos = [alvo('NF1', 1, { pontoLat: -23.0, pontoLng: -43.3 })]
    const visitas = new Map<string, Visita>([
      ['NF1', { nf: 'NF1', chegada: '2026-09-24T09:00:00.000Z', saida: '2026-09-24T09:10:00.000Z', distanciaMetrosDoPonto: 700, viaRaioAmpliado: true }],
    ])
    const paradaPropria = parada({
      classificacao: 'FORA_BASE',
      lat: -23.0 + DELTA_150M, lng: -43.3,
      chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

    const [d] = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, alvos, visitas, resumoCargaVazio,
      true, new Map(), null, false, false, false, paradasCruas, true, true, true,
    )

    expect(d.status).toBe('confirmado_gps')
    expect(d.observacao).toBeNull()
    expect(d.evidencia).toBe('parada_unitrac_propria')
    expect(d.chegada).toBe('2026-09-24T10:00:00.000Z')
  })

  it('achado real RQU2G47/2387959: situacao=1 + parada curta compartilhada (grupo>1) -- R2 confirma', () => {
    const linhas = [
      linha('NF1', { endereco: 'RUA A' }),
      linha('NF2', { endereco: 'RUA B', lat: -22.93, lng: -43.2 }),
    ]
    const alvos = [alvo('NF1', 1)]
    const curta = { chegada: '2026-09-24T17:10:00.000Z', saida: '2026-09-24T17:11:00.000Z' }
    const visitas = new Map<string, Visita>(
      linhas.map(l => [l.nf, { nf: l.nf, chegada: curta.chegada, saida: curta.saida, distanciaMetrosDoPonto: 10 }]),
    )
    const paradaPropria = parada({
      classificacao: 'FORA_BASE',
      lat: -22.9 + DELTA_150M, lng: -43.2,
      chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

    const detalhes = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, alvos, visitas, resumoCargaVazio,
      true, new Map(), null, false, false, true, paradasCruas, true, true, true,
    )
    const d1 = detalhes.find(d => d.nf === 'NF1')!

    expect(d1.status).toBe('confirmado_gps')
    expect(d1.observacao).toBeNull()
    expect(d1.evidencia).toBe('parada_unitrac_propria')
  })

  it('rotulo "ENTREGUE - PARADA COMPARTILHADA COM ENTREGA PRÓXIMA" (viaVizinhanca) -- R2 confirma', () => {
    const linhas = [linha('NF1')]
    const visitas = new Map<string, Visita>([
      ['NF1', { nf: 'NF1', chegada: '2026-09-24T09:00:00.000Z', saida: '2026-09-24T09:10:00.000Z', distanciaMetrosDoPonto: 400, viaVizinhanca: true }],
    ])
    const paradaPropria = parada({
      classificacao: 'FORA_BASE',
      lat: -22.9 + DELTA_150M, lng: -43.2,
      chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

    const [d] = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio,
      true, new Map(), null, false, false, false, paradasCruas, true, true, true,
    )

    expect(d.status).toBe('confirmado_gps')
    expect(d.observacao).toBeNull()
    expect(d.evidencia).toBe('parada_unitrac_propria')
  })

  it('rotulo "PARADA CURTA DE OUTRO ENDEREÇO" (perdeuParadaCompartilhada) -- R2 confirma o perdedor pela parada propria dele', () => {
    const paradaCurta = { chegada: '2026-09-11T08:00:00.000Z', saida: '2026-09-11T08:01:00.000Z' }
    const paradaRealDoGrupo = parada({
      chegada: paradaCurta.chegada, saida: paradaCurta.saida, fim_real: paradaCurta.saida,
      classificacao: 'FORA_BASE', lat: -22.71, lng: -42.628,
    })
    const linhas = [
      linha('NF_A', { endereco: 'ENDERECO A - PERTO (~45m)', lat: -22.7104, lng: -42.628 }),
      linha('NF_B', { endereco: 'ENDERECO B - LONGE (~4.4km)', lat: -22.75, lng: -42.628 }),
    ]
    const visitas = new Map<string, Visita>([
      ['NF_A', { nf: 'NF_A', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 999 }],
      ['NF_B', { nf: 'NF_B', chegada: paradaCurta.chegada, saida: paradaCurta.saida, distanciaMetrosDoPonto: 999 }],
    ])
    // Parada REAL da propria placa perto de NF_B, em horario DIFERENTE da
    // parada curta compartilhada (senao a distancia medida vira a mesma
    // parada de 1min, que ja perdeu por outro motivo) -- 150m/3min, valida
    // pra R2.
    const paradaPropriaDeNF_B = parada({
      classificacao: 'FORA_BASE',
      lat: -22.75 + DELTA_150M, lng: -42.628,
      chegada: '2026-09-11T09:00:00.000Z', saida: '2026-09-11T09:03:00.000Z', fim_real: '2026-09-11T09:03:00.000Z',
    })
    const paradasPorOutraPlaca = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaRealDoGrupo]]])
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaRealDoGrupo, paradaPropriaDeNF_B]]])

    const detalhes = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, [], visitas, resumoCargaVazio,
      true, paradasPorOutraPlaca, null, false, false, true, paradasCruas, true, true, true,
    )
    const nfB = detalhes.find(d => d.nf === 'NF_B')!

    expect(nfB.status).toBe('confirmado_gps')
    expect(nfB.observacao).toBeNull()
    expect(nfB.evidencia).toBe('parada_unitrac_propria')
    expect(nfB.chegada).toBe('2026-09-11T09:00:00.000Z')
  })

  it('raio fixo de 150m (nao relativo): outro cliente a 140m da parada bloqueia mesmo esta NF estando mais perto (100m)', () => {
    const paradaLat = -22.95
    const DELTA_100M = 0.0008994
    const DELTA_140M = 0.0012592
    const linhas = [
      linha('NF1', { endereco: 'ENDERECO A', lat: paradaLat + DELTA_100M, lng: -43.25 }),
      linha('NF2', { endereco: 'ENDERECO B', lat: paradaLat + DELTA_140M, lng: -43.25 }),
    ]
    const paradaPropria = parada({
      classificacao: 'FORA_BASE',
      lat: paradaLat, lng: -43.25,
      chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

    const [d1] = montarDetalheEntregas(
      '93758', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio,
      true, new Map(), null, false, false, false, paradasCruas, true, true, true,
    )

    // NF1 esta mais perto (100m) que NF2 (140m) da parada -- pela regra
    // RELATIVA antiga isso NAO bloquearia (140 > 100). Pela regra fixa
    // (<=150m explica), NF2 tambem esta "explicada" pela parada -- ela e'
    // outro cliente da mesma placa a <=150m -- entao NF1 NAO confirma.
    expect(d1.evidencia).not.toBe('parada_unitrac_propria')
    expect(d1.status).toBe('pendente')
  })
})

// Fix round 2 (revisao de codigo pos-Fix-round-1): 2 achados na
// implementacao de `pontosReferenciaDaPlaca`/`acharParadaUnitracPropria`.
describe('montarDetalheEntregas -- Fix round 2 (pontosReferenciaDaPlaca: dia inteiro + 2 pontos por NF)', () => {
  const resumoCargaVazio = { motorista: '', saidaCd: null, chegadaCd: null, tempoOperacaoMin: null }
  const DELTA_150M = 0.0013491

  // Achado MÉDIO (agregacao.ts:626-633): `pontosReferenciaDaPlaca` so'
  // enxergava as NFs da CARGA ATUAL (`linhasRomaneio`), mas as paradas cruas
  // da Unitrac sao do DIA INTEIRO da placa -- uma parada perto de cliente de
  // OUTRA carga da MESMA placa nao era descartada. `todasLinhasDaPlacaNoDia`
  // (novo parametro, default = `linhasRomaneio` pra nao quebrar quem nao
  // passar nada) corrige isso.
  it('placa com 2 cargas no dia: parada explicada por cliente de OUTRA carga da mesma placa nao confirma', () => {
    const linhaCarga1 = linha('NF1', { carga: '111', endereco: 'ENDERECO CARGA 1', lat: -22.9, lng: -43.2 })
    // NF2, de uma carga DIFERENTE (222) da mesma placa, com geocode a ~40m
    // da parada candidata -- so' aparece em `todasLinhasDaPlacaNoDia`, nao
    // em `linhasRomaneio` (que so' tem a carga 111 sendo processada agora).
    const linhaCarga2 = linha('NF2', { carga: '222', endereco: 'ENDERECO CARGA 2', lat: -22.9 + 0.0003598, lng: -43.2 })
    const paradaPropria = parada({
      classificacao: 'FORA_BASE',
      lat: -22.9 + DELTA_150M, lng: -43.2, // ~150m de NF1, ~110m de NF2 (carga 2) -- dentro de 150m
      chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

    const [d1] = montarDetalheEntregas(
      '111', 'TTL7D40', [linhaCarga1], [], new Map(), resumoCargaVazio,
      true, new Map(), null, false, false, false, paradasCruas, true, true, true,
      [linhaCarga1, linhaCarga2], // todasLinhasDaPlacaNoDia: as 2 cargas
    )

    expect(d1.evidencia).not.toBe('parada_unitrac_propria')
    expect(d1.status).toBe('pendente')
  })

  it('sem passar todasLinhasDaPlacaNoDia (default = so a carga atual): comportamento antigo preservado, confirma normalmente', () => {
    const linhaCarga1 = linha('NF1', { carga: '111', endereco: 'ENDERECO CARGA 1', lat: -22.9, lng: -43.2 })
    const paradaPropria = parada({
      classificacao: 'FORA_BASE',
      lat: -22.9 + DELTA_150M, lng: -43.2,
      chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

    const [d1] = montarDetalheEntregas(
      '111', 'TTL7D40', [linhaCarga1], [], new Map(), resumoCargaVazio,
      true, new Map(), null, false, false, false, paradasCruas, true, true, true,
    )

    expect(d1.evidencia).toBe('parada_unitrac_propria')
    expect(d1.status).toBe('confirmado_gps')
  })

  // Achado MENOR: cada outra NF entrava com um so' ponto (geocode confiavel
  // OU cadastro, o que `referenciaParaDesempate` preferisse) -- quando as
  // duas coordenadas existem e apontam pra lugares diferentes, so' expor o
  // geocode escondia um cadastro que tambem "explicaria" a parada.
  it('outra NF com geocode confiavel LONGE mas cadastro Unitrac PERTO da parada -- os DOIS pontos contam, parada nao confirma', () => {
    const linhaAlvo = linha('NF1', { endereco: 'ENDERECO ALVO', lat: -22.9, lng: -43.2 })
    // NF2: geocode confiavel a ~5,5km (nao explicaria nada), mas CADASTRO
    // Unitrac a ~110m da mesma parada (dentro de RAIO_OUTRO_CLIENTE_EXPLICA_M).
    const linhaOutraNf = linha('NF2', { endereco: 'ENDERECO OUTRO', lat: -22.95, lng: -43.2 })
    const alvos = [alvo('NF2', 0, { pontoLat: -22.9 + 0.0003598, pontoLng: -43.2 })]
    const paradaPropria = parada({
      classificacao: 'FORA_BASE',
      lat: -22.9 + DELTA_150M, lng: -43.2, // ~150m de NF1, ~110m do CADASTRO de NF2
      chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaPropria]]])

    const [d1] = montarDetalheEntregas(
      '111', 'TTL7D40', [linhaAlvo, linhaOutraNf], alvos, new Map(), resumoCargaVazio,
      true, new Map(), null, false, false, false, paradasCruas, true, true, true,
    )

    expect(d1.evidencia).not.toBe('parada_unitrac_propria')
    expect(d1.status).toBe('pendente')
  })

  it('parada BASE a <=300m/>=2min do cliente -- nao confirma (so FORA_BASE conta)', () => {
    const linhas = [linha('NF1')]
    const paradaBase = parada({
      classificacao: 'BASE',
      lat: -22.9 + DELTA_150M, lng: -43.2,
      chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
    })
    const paradasCruas = new Map<string, UnitracParadaRow[]>([['TTL7D40', [paradaBase]]])

    const [d] = montarDetalheEntregas(
      '111', 'TTL7D40', linhas, [], new Map(), resumoCargaVazio,
      true, new Map(), null, false, false, false, paradasCruas, true, true, true,
    )

    expect(d.evidencia).not.toBe('parada_unitrac_propria')
    expect(d.status).toBe('pendente')
    expect(d.chegada).toBeNull()
  })
})

// Achado real 25/09 (trava de regressao antes do deploy): RQQ5B81/NF 2386225
// de 23/09 (equipe: "nao esteve no local", parada curta a ~4,2 km) voltou a
// sair ENTREGUE ao regenerar o dia em 26/09 -- mesmo com o codigo de
// producao. Causa: fora das 48h e sem snapshot de paradas do dia, a Unitrac
// devolve so' um retalho (1 parada BASE da noite); com apagao de sinal,
// resolverParadas deixava esse retalho vencer a ponte, o dia ficava sem a
// parada das 12:53 e sem coordenada o grupo nao tinha "vencedor" -- a regra
// de perdedor da parada compartilhada nunca disparava. Dados reais do dump
// da placa (so' o grupo das 12:53 + o retalho + as paradas da ponte ao redor).
describe('RQQ5B81/NF 2386225 23/09 regenerado fora da janela da Unitrac', () => {
  const placa = 'RQQ5B81'
  const l = (nf: string, endereco: string, lat: number, lng: number, extra: Partial<LinhaGeocodificada> = {}) =>
    linha(nf, { carga: '98522', placa, destino: 'RIO BONITO', endereco, lat, lng, geoConfiavel: true, ...extra })
  const linhas = [
    l('2386219', 'RUA  DR MATTOS, 419 - CENTRO, RIO BONITO - *', -22.712282, -42.629991),
    l('2386220', 'RUA DR MATTOS, 26 - CENTRO, RIO BONITO - LOJA 01', -22.710109, -42.627165),
    l('2386225', 'RUA 1, S/N - JACUBA, RIO BONITO - LOJA', -22.6951345, -42.5909642),
    l('2386231', 'RUA GERALDINO VIEIRA DE MORAES, 56 - BOA ESPERANCA, RIO BONITO', -22.703772, -42.625909, { geoConfiavel: false, geoMotivo: 'bairro_divergente' }),
  ]
  const chegada = '2026-09-23T12:53:58.203Z'
  const saida = '2026-09-23T12:56:47.571Z'
  const visitas = new Map<string, Visita>(linhas.map(x => [x.nf, { nf: x.nf, chegada, saida, distanciaMetrosDoPonto: 0, viaVizinhanca: false }]))
  const alvo = (documento: string, situacao: number, pontoLat: number, pontoLng: number, feitoISO: string | null): AlvoApi => ({
    nome: documento, rota: '98522', ordem: 0, feitoISO, pontoLat, pontoLng, situacao, documento,
    inicioISO: '2026-09-23T07:00:00', placaNorm: placa, codigoUnitrac: documento,
  } as AlvoApi)
  const alvos = [
    alvo('2386220', 98, -22.710059, -42.627188, '2026-09-23T13:01:36.167303'),
    alvo('2386225', 98, -22.710139, -42.627105, '2026-09-23T13:01:36.167303'),
    alvo('2386219', 0, -22.711498, -42.627954, null),
    alvo('2386231', 1, -22.709906, -42.626296, '2026-09-23T13:00:02.152927'),
  ]
  // Retalho que a Unitrac ainda devolve em 26/09 pro dia 23/09.
  const retalhoUnitrac = [parada({
    id: 'RQQ5B81-api-1', placa_norm: placa,
    chegada: '2026-09-23T21:45:21.000Z', saida: '2026-09-24T04:40:14.000Z', fim_real: '2026-09-24T04:40:14.000Z',
    duracao_seg: 24893, local_parada: 'BASE BENASSI - BASE BENASSI', lat: -22.8158316, lng: -43.2778099, classificacao: 'BASE',
  })]
  const daPonte = [
    { chegada: '2026-09-23T12:46:42.915Z', saida: '2026-09-23T12:52:29.401Z', duracaoSeg: 346, lat: -22.710493, lng: -42.630157, classificacao: 'FORA_BASE' as const },
    { chegada, saida, duracaoSeg: 169, lat: -22.710206999999997, lng: -42.62815125, classificacao: 'FORA_BASE' as const },
    { chegada: '2026-09-23T13:04:34.297Z', saida: '2026-09-23T13:07:40.252Z', duracaoSeg: 186, lat: -22.714217, lng: -42.636638, classificacao: 'FORA_BASE' as const },
  ]

  it('Unitrac sem cobrir o dia: a ponte vence mesmo com apagao e a NF 2386225 NAO e\' confirmada pela parada curta de outro endereco', () => {
    const paradas = resolverParadas(retalhoUnitrac, daPonte, placa, true, false)
    const detalhes = montarDetalheEntregas(
      '98522', placa, linhas, alvos, visitas, { motorista: '', saidaCd: null, chegadaCd: null, tempoOperacaoMin: null },
      true, new Map([[placa, paradas]]), 330.4, false, true, true,
      new Map([[placa, retalhoUnitrac]]), true, true, true, linhas,
    )
    const d = detalhes.find(x => x.nf === '2386225')!
    expect(d.status).toBe('pendente')
    expect(d.observacao).toBe('PARADA CURTA DE OUTRO ENDEREÇO - NÃO CONFIRMA ESTE CLIENTE - CONFERIR')
    expect(d.chegada).toBeNull()
  })
})

// Task 2 (plano 2026-09-26, verificacao manual 24/09): GPS congelado e placa
// declarada sem rastreador nao podem gerar visita/NF falsa. Achado real
// TTL5J17 23-24/09: placa em kpi_placa_sem_rastreador (temRastreador=false)
// mas com cv/ponte respondendo -- a ponte devolvia uma "visita" (GPS
// congelado num unico ponto o dia inteiro, atraso medio ~40.000min) cobrindo
// 00:00-23:59, e o rotulo unificado de sem rastreador (Task 1, 24/09) so'
// disparava quando `status === 'pendente'` -- a visita da ponte fazia
// `confirmadoGps` ficar true, empurrando status pra 'confirmado_gps' ANTES
// da checagem de semRastreadorNoDia rodar, e o `tempoParadaMin` de quase 24h
// batia o limiar de LIMITE_TEMPO_LOJA_MIN -- a NF saia "TEMPO EM LOJA ACIMA
// DE 4H" com visita 00:00-23:59, DENTRO da taxa de falha, em vez de "SEM
// RASTREADOR ... NAO CONTABILIZADO" fora da taxa.
describe('montarDetalheEntregas -- GPS congelado e sem rastreador nao geram visita falsa (Task 2, plano 26/09)', () => {
  const resumoCargaVazio = { motorista: '', saidaCd: null, chegadaCd: null, tempoOperacaoMin: null }
  const OBS = 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO'

  it('(a) temRastreador=false com visita da ponte cobrindo o dia inteiro (GPS congelado, caso TTL5J17): SEM RASTREADOR, sem chegada/saida/tempo, evidencia sem_rastreador -- nunca TEMPO EM LOJA', () => {
    const linhas = [linha('NF1'), linha('NF2')]
    const visitaCongelada: Visita = {
      nf: 'NF1', chegada: '2026-09-24T03:00:00.000Z', saida: '2026-09-25T02:59:00.000Z', distanciaMetrosDoPonto: 0,
    }
    const visitas = new Map<string, Visita>([
      ['NF1', visitaCongelada],
      ['NF2', { ...visitaCongelada, nf: 'NF2' }],
    ])

    const detalhes = montarDetalheEntregas(
      '93758', 'TTL5J17', linhas, [], visitas, resumoCargaVazio,
      /* temRastreador */ false, new Map(), null, false, false, false, new Map(),
      /* tratarSemRastreadorNoDia */ true,
    )

    for (const d of detalhes) {
      expect(d.status).toBe('pendente')
      expect(d.observacao).toBe(OBS)
      expect(d.observacao).not.toContain('TEMPO EM LOJA')
      expect(d.evidencia).toBe('sem_rastreador')
      expect(d.chegada).toBeNull()
      expect(d.saida).toBeNull()
      expect(d.tempoParadaMin).toBeNull()
    }
  })

  it('(b) placa com cv (temRastreador=true) e GPS congelado o dia todo (todas as paradas da propria placa no mesmo ponto, sinal de apagao da ponte): SEM RASTREADOR/NAO CONTABILIZADO, fora da taxa, nao VEICULO SEM MOVIMENTO', () => {
    const linhas = [linha('NF1')]
    // Mesmo ponto (delta bem menor que 50m) o dia inteiro -- classificacao
    // BASE ou FORA_BASE tanto faz, o sinal e' "nunca se moveu de verdade".
    const paradasCongeladas = [
      parada({ placa_norm: 'TTL5J17', classificacao: 'BASE', lat: -22.816007, lng: -43.277827, chegada: '2026-09-24T03:00:00.000Z', saida: '2026-09-24T12:00:00.000Z' }),
      parada({ placa_norm: 'TTL5J17', classificacao: 'BASE', lat: -22.816008, lng: -43.277828, chegada: '2026-09-24T12:00:00.000Z', saida: '2026-09-25T02:59:00.000Z' }),
    ]
    const paradasFrota = new Map([['TTL5J17', paradasCongeladas]])

    const [d] = montarDetalheEntregas(
      '93758', 'TTL5J17', linhas, [], new Map(), resumoCargaVazio,
      /* temRastreador */ true, paradasFrota, 0.3, false, false, false, new Map(),
      /* tratarSemRastreadorNoDia */ true, false, false, linhas,
      /* apagaoDeSinalPropriaPlaca (sinal da ponte de leitura atrasada -- GPS travado na ultima posicao) */ true,
    )

    expect(d.observacao).toBe(OBS)
    expect(d.observacao).not.toContain('SEM MOVIMENTO')
    expect(d.evidencia).toBe('sem_rastreador')
    expect(d.status).toBe('pendente')
  })

  it('(c) placa realmente parada na base com GPS vivo (sem sinal de apagao): continua VEICULO SEM MOVIMENTO normalmente, nao vira sem rastreador', () => {
    const linhas = [linha('NF1')]
    const paradasNaBase = [
      parada({ placa_norm: 'TTL5J17', classificacao: 'BASE', lat: -22.816007, lng: -43.277827, chegada: '2026-09-24T03:00:00.000Z', saida: '2026-09-24T12:00:00.000Z' }),
      parada({ placa_norm: 'TTL5J17', classificacao: 'BASE', lat: -22.816008, lng: -43.277828, chegada: '2026-09-24T12:00:00.000Z', saida: '2026-09-25T02:59:00.000Z' }),
    ]
    const paradasFrota = new Map([['TTL5J17', paradasNaBase]])

    const [d] = montarDetalheEntregas(
      '93758', 'TTL5J17', linhas, [], new Map(), resumoCargaVazio,
      /* temRastreador */ true, paradasFrota, 0.3, false, false, false, new Map(),
      /* tratarSemRastreadorNoDia */ true, false, false, linhas,
      /* apagaoDeSinalPropriaPlaca */ false,
    )

    expect(d.observacao).toBe('VEÍCULO SEM MOVIMENTO NO DIA - CONFERIR RASTREADOR OU SE SAIU PRA RUA')
    expect(d.evidencia).not.toBe('sem_rastreador')
  })

  it('R2 (confirmarPorParadaUnitracPropria) nunca confirma quando a placa e\' sem rastreador -- trava TTL5J17 continua sem_rastreador', () => {
    const linhas = [linha('NF1')]
    const paradaPropria = [parada({ placa_norm: 'TTL5J17', classificacao: 'FORA_BASE', lat: -22.9, lng: -43.2 })]

    const [d] = montarDetalheEntregas(
      '93758', 'TTL5J17', linhas, [], new Map(), resumoCargaVazio,
      /* temRastreador */ false, new Map(), null, false, false, false,
      new Map([['TTL5J17', paradaPropria]]),
      /* tratarSemRastreadorNoDia */ true, /* desativarOutraPlaca */ true,
      /* confirmarPorParadaUnitracPropria */ true,
    )

    expect(d.status).toBe('pendente')
    expect(d.observacao).toBe(OBS)
    expect(d.evidencia).toBe('sem_rastreador')
  })
})

// Task 3 (plano 26/09, verificacao manual 24/09): casos reais RQV9E37/2388069
// (GPS a 8m), TUO1D10/2388557 (340m), RBJ7H78/2389720 (143m), RQU2E34/2389291
// (400m) saiam "NAO FOI AO CLIENTE" -- o GPS bruto (posicoes_historico,
// cruzado manualmente pela operacao) mostra o caminhao a poucos metros/
// centenas de metros do endereco, so' que sem PARAR la' (nenhuma parada, nem
// da Unitrac nem da ponte, existe perto o bastante -- ver comentario de
// `melhorDistanciaPropria`/`menorDistanciaTrajetoPorNf` em agregacao.ts).
describe('montarDetalheEntregas -- NAO FOI so quando a placa nao passou perto (Task 3, plano 26/09)', () => {
  const resumoCargaVazio = { motorista: '', saidaCd: null, chegadaCd: null, tempoOperacaoMin: null }

  it.each([
    ['RQV9E37/2388069', 8],
    ['RBJ7H78/2389720', 143],
    ['TUO1D10/2388557', 340],
    ['RQU2E34/2389291', 400],
  ])('%s: trajeto continuo a %dm (sem parada registrada) -> PASSOU NO ENDERECO, evidencia passagem_sem_parada, distancia preenchida', (_rotulo, distM) => {
    const [d] = montarDetalheEntregas(
      '93758', 'TTL7D40', [linha('NF1')], [], new Map(), resumoCargaVazio,
      /* temRastreador */ true, new Map(), null, false, false, false, new Map(),
      false, false, false, undefined,
      /* apagaoDeSinalPropriaPlaca */ false,
      /* menorDistanciaTrajetoPorNf */ new Map([['NF1', distM]]),
    )

    expect(d.status).toBe('pendente')
    expect(d.observacao).toBe('PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR')
    expect(d.evidencia).toBe('passagem_sem_parada')
    expect(d.distParadaM).toBe(distM)
  })

  it('trajeto continuo a mais de 2km (nunca chegou perto de verdade): continua NAO FOI AO CLIENTE', () => {
    const [d] = montarDetalheEntregas(
      '93758', 'TTL7D40', [linha('NF1')], [], new Map(), resumoCargaVazio,
      true, new Map(), null, false, false, false, new Map(),
      false, false, false, undefined, false,
      new Map([['NF1', 4_700]]), // achado real (RQU2E34/2389291): parada mais perto a 4,7km
    )

    expect(d.observacao).toBe('NÃO FOI AO CLIENTE (caminhão não esteve na região)')
    expect(d.evidencia).toBe('sem_evidencia')
    expect(d.distParadaM as number).toBeGreaterThan(2_000)
  })

  it('trajeto continuo nunca ignora uma parada real MAIS PERTO (usa a menor das duas distancias, nao so\' o trajeto)', () => {
    const paradaBemPerto = parada({ id: 'p', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -22.9001, lng: -43.2001 }) // ~15m
    const paradasFrota = new Map([['TTL7D40', [paradaBemPerto]]])

    const [d] = montarDetalheEntregas(
      '93758', 'TTL7D40', [linha('NF1')], [], new Map(), resumoCargaVazio,
      true, paradasFrota, null, false, false, false, new Map(),
      false, false, false, undefined, false,
      new Map([['NF1', 1_500]]), // trajeto "mediria" 1,5km -- a parada real (15m) e' mais confiavel
    )

    expect(d.observacao).toBe('PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR')
    expect(d.distParadaM as number).toBeLessThan(20)
  })

  it('sem menorDistanciaTrajetoPorNf (default, comportamento de producao hoje): so\' a distancia por parada decide, igual antes da Task 3', () => {
    const longe = parada({ id: 'p', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -22.95, lng: -43.30 }) // ~11km
    const paradasFrota = new Map([['TTL7D40', [longe]]])
    const [d] = montarDetalheEntregas('93758', 'TTL7D40', [linha('NF1')], [], new Map(), resumoCargaVazio, true, paradasFrota)

    expect(d.observacao).toBe('NÃO FOI AO CLIENTE (caminhão não esteve na região)')
  })

  it('paradas cruas da Unitrac (paradasUnitracCruasPropriaPlaca) com um cluster mais perto do que o que resolverParadas escolheu: usa a MENOR das duas fontes, nunca ignora a parada real que a outra fonte tinha', () => {
    // resolverParadas escolheu (paradasPorOutraPlaca) uma parada longe --
    // ex. a ponte venceu naquele dia mas nao formou dwell perto do cliente.
    const paradaLongeResolvida = parada({ id: 'ponte', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -22.95, lng: -43.30 }) // ~11km
    // A Unitrac crua (sempre buscada, independente de quem "ganhou") tinha
    // um cluster real bem mais perto do cliente que a ponte descartou.
    const paradaPertoCrua = parada({ id: 'unitrac', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -22.9012, lng: -43.2012 }) // ~180m

    const [d] = montarDetalheEntregas(
      '93758', 'TTL7D40', [linha('NF1')], [], new Map(), resumoCargaVazio,
      true, new Map([['TTL7D40', [paradaLongeResolvida]]]), null, false, false, false,
      new Map([['TTL7D40', [paradaPertoCrua]]]),
    )

    expect(d.observacao).toBe('PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR')
    expect(d.evidencia).toBe('passagem_sem_parada')
    expect(d.distParadaM as number).toBeLessThanOrEqual(500)
  })
})

// Task 4 (plano 26/09, verificacao manual 24/09): caso real RBJ2J67/carga
// 98593 -- escala e romaneio poem a carga na RBJ2J67, o GPS dela ficou a
// 3-10km dos 18 clientes enquanto a RQV6I51 (outro veiculo da frota) parou a
// 8-400m deles. "Na Nutry Max nao existe troca de caminhao" (decisao do
// usuario 26/09): a parada da RQV6I51 e' so' SINAL de que a escala/romaneio
// erraram a placa, nunca confirmacao -- nunca "ENTREGUE POR OUTRA PLACA" nem
// "NAO FOI AO CLIENTE" (acusaria a placa errada de nao ter ido).
describe('montarDetalheEntregas -- escala divergente vira CONFERIR ESCALA em vez de acusar (Task 4, plano 26/09)', () => {
  const resumoCargaVazio = { motorista: '', saidaCd: null, chegadaCd: null, tempoOperacaoMin: null }

  // 5 NFs (mesmo espirito do caso real com 18): coordenadas distintas, GPS
  // continuo da placa da escala a 3-10km de cada uma (menorDistanciaTrajetoPorNf).
  function nfsLongeDaPropriaPlaca(qtd: number, distanciasM: number[]): LinhaGeocodificada[] {
    return Array.from({ length: qtd }, (_, i) => linha(`NF${i + 1}`, { lat: -22.90 + i * 0.01, lng: -43.20 + i * 0.01 }))
  }

  function menorDistanciaMap(linhas: LinhaGeocodificada[], distanciasM: number[]): Map<string, number> {
    return new Map(linhas.map((l, i) => [l.nf, distanciasM[i]]))
  }

  // Parada real da OUTRA placa da frota (RQV6I51), 8m do 3o cliente, dwell 5min.
  function paradaOutraPlacaPerto(linhaAlvo: LinhaGeocodificada, distM = 8): UnitracParadaRow {
    // ~8m ao norte (1m de lat ~= 0.000009 grau)
    return parada({
      id: 'rqv6i51-1', placa_norm: 'RQV6I51', classificacao: 'FORA_BASE',
      lat: (linhaAlvo.lat as number) + distM * 0.000009, lng: linhaAlvo.lng as number,
      chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
    })
  }

  it('caso real 24/09: carga com 5 NFs, placa da escala nunca a <=2km, outro veiculo da frota parou perto -- vira CONFERIR ESCALA, pendente, sem_evidencia, sem horario', () => {
    const nfs = nfsLongeDaPropriaPlaca(5, [3_000, 5_000, 8_000, 9_000, 10_000])
    const paradasFrota = new Map([['RQV6I51', [paradaOutraPlacaPerto(nfs[2], 8), paradaOutraPlacaPerto(nfs[4], 400)]]])

    const detalhe = montarDetalheEntregas(
      '98593', 'RBJ2J67', nfs, [], new Map(), resumoCargaVazio,
      true, paradasFrota, null, false, false, false, new Map(),
      false, true, false, undefined, false,
      menorDistanciaMap(nfs, [3_000, 5_000, 8_000, 9_000, 10_000]),
      true, // detectarEscalaDivergente
    )

    expect(detalhe).toHaveLength(5)
    for (const d of detalhe) {
      expect(d.status).toBe('pendente')
      expect(d.observacao).toBe('PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA')
      expect(d.evidencia).toBe('sem_evidencia')
      expect(d.chegada).toBeNull()
      expect(d.saida).toBeNull()
      // Regra de negocio inegociavel: nunca rotular como troca de caminhao,
      // nem como confirmacao, nem como falha do motorista.
      expect(d.observacao).not.toContain('OUTRA PLACA')
      expect(d.observacao).not.toContain('NÃO FOI')
      expect(d.status).not.toBe('confirmado_gps')
      expect(d.status).not.toBe('confirmado_unitrac')
    }
  })

  it('abaixo do limiar (>=50% dos clientes com a propria placa a <=2km): classificacao normal, sem o rotulo de escala', () => {
    // 3 de 5 clientes com a propria placa a <=2km (perto) -- so' 2 longe.
    const nfs = nfsLongeDaPropriaPlaca(5, [500, 1_000, 1_500, 8_000, 9_000])
    const paradasFrota = new Map([['RQV6I51', [paradaOutraPlacaPerto(nfs[3], 8), paradaOutraPlacaPerto(nfs[4], 8)]]])

    const detalhe = montarDetalheEntregas(
      '98593', 'RBJ2J67', nfs, [], new Map(), resumoCargaVazio,
      true, paradasFrota, null, false, false, false, new Map(),
      false, true, false, undefined, false,
      menorDistanciaMap(nfs, [500, 1_000, 1_500, 8_000, 9_000]),
      true,
    )

    for (const d of detalhe) {
      expect(d.observacao).not.toBe('PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA')
    }
  })

  it('abaixo do limiar (sem sinal de parada de outra placa a <=500m/>=2min): classificacao normal (continua NAO FOI)', () => {
    const nfs = nfsLongeDaPropriaPlaca(5, [3_000, 5_000, 8_000, 9_000, 10_000])
    // Nenhuma parada de outra placa perto -- frota vazia.
    const detalhe = montarDetalheEntregas(
      '98593', 'RBJ2J67', nfs, [], new Map(), resumoCargaVazio,
      true, new Map(), null, false, false, false, new Map(),
      false, true, false, undefined, false,
      menorDistanciaMap(nfs, [3_000, 5_000, 8_000, 9_000, 10_000]),
      true,
    )

    for (const d of detalhe) {
      expect(d.observacao).not.toBe('PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA')
      expect(d.observacao).toBe('NÃO FOI AO CLIENTE (caminhão não esteve na região)')
    }
  })

  it('carga com menos de 5 NFs: classificacao normal mesmo com todos os sinais presentes', () => {
    const nfs = nfsLongeDaPropriaPlaca(4, [3_000, 5_000, 8_000, 9_000])
    const paradasFrota = new Map([['RQV6I51', [paradaOutraPlacaPerto(nfs[0], 8)]]])

    const detalhe = montarDetalheEntregas(
      '98593', 'RBJ2J67', nfs, [], new Map(), resumoCargaVazio,
      true, paradasFrota, null, false, false, false, new Map(),
      false, true, false, undefined, false,
      menorDistanciaMap(nfs, [3_000, 5_000, 8_000, 9_000]),
      true,
    )

    for (const d of detalhe) {
      expect(d.observacao).not.toBe('PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA')
    }
  })

  it('opcao desligada (default false): nada muda mesmo com todos os sinais presentes -- continua NAO FOI', () => {
    const nfs = nfsLongeDaPropriaPlaca(5, [3_000, 5_000, 8_000, 9_000, 10_000])
    const paradasFrota = new Map([['RQV6I51', [paradaOutraPlacaPerto(nfs[2], 8)]]])

    const detalhe = montarDetalheEntregas(
      '98593', 'RBJ2J67', nfs, [], new Map(), resumoCargaVazio,
      true, paradasFrota, null, false, false, false, new Map(),
      false, true, false, undefined, false,
      menorDistanciaMap(nfs, [3_000, 5_000, 8_000, 9_000, 10_000]),
      // detectarEscalaDivergente nao passado -- default false
    )

    for (const d of detalhe) {
      expect(d.observacao).toBe('NÃO FOI AO CLIENTE (caminhão não esteve na região)')
    }
  })

  it('se a PROPRIA placa confirmou uma NF especifica (Unitrac), nao e\' divergencia PRA ELA -- as outras da carga continuam com o rotulo de escala', () => {
    const nfs = nfsLongeDaPropriaPlaca(5, [3_000, 5_000, 8_000, 9_000, 10_000])
    const paradasFrota = new Map([['RQV6I51', [paradaOutraPlacaPerto(nfs[2], 8)]]])
    // NF3 confirmada pela propria placa (Unitrac, situacao=1) -- apesar da
    // carga inteira ter o sinal de divergencia, esta NF tem prova positiva.
    const alvos = [alvo(nfs[2].nf, 1)]

    const detalhe = montarDetalheEntregas(
      '98593', 'RBJ2J67', nfs, alvos, new Map(), resumoCargaVazio,
      true, paradasFrota, null, false, false, false, new Map(),
      false, true, false, undefined, false,
      menorDistanciaMap(nfs, [3_000, 5_000, 8_000, 9_000, 10_000]),
      true,
    )

    const nf3 = detalhe.find(d => d.nf === nfs[2].nf)!
    expect(nf3.status).toBe('confirmado_unitrac')
    expect(nf3.observacao).not.toBe('PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA')

    const outras = detalhe.filter(d => d.nf !== nfs[2].nf)
    for (const d of outras) {
      expect(d.observacao).toBe('PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA')
    }
  })

  // Fix round 1 (revisao de codigo 79351d8, achado 1): precedencia por NF --
  // a carga pode ser `escalaDivergente` no agregado (maioria longe) e ainda
  // assim UMA NF especifica ter a propria placa genuinamente perto (passou a
  // 300m). A evidencia INDIVIDUAL manda: essa NF mantem "PASSOU NO
  // ENDERECO...", nao vira "CONFERIR ESCALA".
  it('NF cuja propria placa passou perto (<=500m) mantem PASSOU NO ENDERECO, mesmo dentro de carga divergente', () => {
    // NF1: propria placa passou a 300m (evidencia individual forte).
    // NF2-NF5: propria placa nunca chegou perto (3-10km) -- carga inteira
    // seguiria "escalaDivergente" (1 de 5 perto = 20% < 50%).
    const nfs = nfsLongeDaPropriaPlaca(5, [300, 5_000, 8_000, 9_000, 10_000])
    const paradasFrota = new Map([['RQV6I51', [paradaOutraPlacaPerto(nfs[2], 8)]]])

    const detalhe = montarDetalheEntregas(
      '98593', 'RBJ2J67', nfs, [], new Map(), resumoCargaVazio,
      true, paradasFrota, null, false, false, false, new Map(),
      false, true, false, undefined, false,
      menorDistanciaMap(nfs, [300, 5_000, 8_000, 9_000, 10_000]),
      true,
    )

    const nf1 = detalhe.find(d => d.nf === nfs[0].nf)!
    expect(nf1.observacao).toBe('PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR')
    expect(nf1.evidencia).toBe('passagem_sem_parada')

    const outras = detalhe.filter(d => d.nf !== nfs[0].nf)
    for (const d of outras) {
      expect(d.observacao).toBe('PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA')
    }
  })

  it('NF cuja propria placa parou perto (500m-2km, PARADA PROXIMA) mantem o rotulo, mesmo dentro de carga divergente', () => {
    const nfs = nfsLongeDaPropriaPlaca(5, [1_200, 5_000, 8_000, 9_000, 10_000])
    const paradasFrota = new Map([['RQV6I51', [paradaOutraPlacaPerto(nfs[2], 8)]]])

    const detalhe = montarDetalheEntregas(
      '98593', 'RBJ2J67', nfs, [], new Map(), resumoCargaVazio,
      true, paradasFrota, null, false, false, false, new Map(),
      false, true, false, undefined, false,
      menorDistanciaMap(nfs, [1_200, 5_000, 8_000, 9_000, 10_000]),
      true,
    )

    const nf1 = detalhe.find(d => d.nf === nfs[0].nf)!
    expect(nf1.observacao).toBe('PARADA PRÓXIMA (500m-2km) MAS FORA DO ENDEREÇO - CONFERIR')

    const outras = detalhe.filter(d => d.nf !== nfs[0].nf)
    for (const d of outras) {
      expect(d.observacao).toBe('PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA')
    }
  })

  // Fix round 1, achado 2: cenario realista "dois caminhoes da frota na
  // mesma regiao" -- a placa da escala TAMBEM parou perto da maioria dos
  // clientes (rota urbana densa, coincidencia normal de frota, nao troca).
  // >=50% perto ja' desliga `escalaDivergente` no agregado -- nenhuma NF
  // deveria levar o rotulo, mesmo com outro veiculo tambem por perto.
  it('duas placas da frota na mesma regiao (propria placa perto de >=50% dos clientes): nenhuma NF vira CONFERIR ESCALA', () => {
    const nfs = Array.from({ length: 6 }, (_, i) => linha(`NF${i + 1}`, { lat: -22.90 + i * 0.01, lng: -43.20 + i * 0.01 }))
    // Propria placa (RBJ2J67) perto de 4 dos 6 clientes (>=50%).
    const distanciasPropriaPlaca = [300, 400, 500, 900, 6_000, 7_000]
    // Outro veiculo (RQV6I51) tambem parou perto de TODOS os clientes --
    // coincidencia de rota, nao deve virar sinal de escala errada quando a
    // propria placa ja' confirma a maioria.
    const paradasFrota = new Map([[
      'RQV6I51',
      nfs.map(l => parada({
        id: `rqv6i51-${l.nf}`, placa_norm: 'RQV6I51', classificacao: 'FORA_BASE',
        lat: l.lat as number, lng: l.lng as number,
        chegada: '2026-09-24T10:00:00.000Z', saida: '2026-09-24T10:05:00.000Z', fim_real: '2026-09-24T10:05:00.000Z',
      })),
    ]])

    const detalhe = montarDetalheEntregas(
      '98593', 'RBJ2J67', nfs, [], new Map(), resumoCargaVazio,
      true, paradasFrota, null, false, false, false, new Map(),
      false, true, false, undefined, false,
      menorDistanciaMap(nfs, distanciasPropriaPlaca),
      true,
    )

    for (const d of detalhe) {
      expect(d.observacao).not.toBe('PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA')
    }
  })

  // Achado real 26/09 (correcoes finais pre-deploy, item 1): o mesmo cenario
  // de carga divergente gerado NO MEIO DO DIA (diaEmAndamento=true) nao pode
  // acusar "CONFERIR ESCALA" -- a placa da escala ainda pode passar nos
  // clientes que faltam. `elegivelParaEscalaDivergente` e' um fato "ja'
  // resolvido" so' quando o dia ACABOU pra essa rota; com o dia em
  // andamento, o correto e' esperar (AGUARDANDO), igual a qualquer outro
  // pendente sem evidencia (ver comentario de `diaEmAndamento` na
  // assinatura da funcao).
  it('mesmo cenario de carga divergente com diaEmAndamento=true vira AGUARDANDO, nao CONFERIR ESCALA', () => {
    const nfs = nfsLongeDaPropriaPlaca(5, [3_000, 5_000, 8_000, 9_000, 10_000])
    const paradasFrota = new Map([['RQV6I51', [paradaOutraPlacaPerto(nfs[2], 8), paradaOutraPlacaPerto(nfs[4], 400)]]])

    const detalhe = montarDetalheEntregas(
      '98593', 'RBJ2J67', nfs, [], new Map(), resumoCargaVazio,
      true, paradasFrota, null, true, false, false, new Map(),
      false, true, false, undefined, false,
      menorDistanciaMap(nfs, [3_000, 5_000, 8_000, 9_000, 10_000]),
      true, // detectarEscalaDivergente
    )

    expect(detalhe).toHaveLength(5)
    for (const d of detalhe) {
      expect(d.status).toBe('pendente')
      expect(d.observacao).toBe('AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO')
      expect(d.observacao).not.toBe('PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA')
      expect(d.chegada).toBeNull()
      expect(d.saida).toBeNull()
    }
  })

  it('com diaEmAndamento=false (dia encerrado), o mesmo cenario segue vira CONFERIR ESCALA', () => {
    const nfs = nfsLongeDaPropriaPlaca(5, [3_000, 5_000, 8_000, 9_000, 10_000])
    const paradasFrota = new Map([['RQV6I51', [paradaOutraPlacaPerto(nfs[2], 8), paradaOutraPlacaPerto(nfs[4], 400)]]])

    const detalhe = montarDetalheEntregas(
      '98593', 'RBJ2J67', nfs, [], new Map(), resumoCargaVazio,
      true, paradasFrota, null, false, false, false, new Map(),
      false, true, false, undefined, false,
      menorDistanciaMap(nfs, [3_000, 5_000, 8_000, 9_000, 10_000]),
      true,
    )

    for (const d of detalhe) {
      expect(d.observacao).toBe('PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA')
    }
  })
})
