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

    // Pedido do usuario 05/09 ("se a porra foi feita ... umas nomeclaturas
    // melhores"): "PENDENTE" soa como "o motorista nao entregou", mas na
    // maioria das vezes e' o nosso lado que nao conseguiu confirmar. O status
    // passa a dizer o que o GPS mostra, com criterio medido:
    //   caminhao esteve a <=500m mas sem parada  -> passou e nao parou
    //   caminhao nunca chegou a 2km              -> ai sim, nao foi ao cliente
    // Entre 500m e 2km fica sem rotulo extra (nao da' pra afirmar nada).
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

      it('entre 500m e 2km: sem rotulo extra (nao afirma o que nao da pra saber)', () => {
        const meio = parada({ id: 'p', placa_norm: 'TTL7D40', classificacao: 'FORA_BASE', lat: -22.910, lng: -43.200 }) // ~1,1km
        const paradasFrota = new Map([['TTL7D40', [meio]]])
        const [d] = montarDetalheEntregas('93758', 'TTL7D40', [linha('NF1')], [], new Map(), resumoCargaVazio, true, paradasFrota)
        expect(d.observacao).toBeNull()
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
  })
})
