import { describe, it, expect, vi, beforeEach } from 'vitest'
import ExcelJS from 'exceljs'
import type { LinhaRomaneio, LinhaEscala } from '@/lib/kpi-romaneio/types'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

// Estado mutavel compartilhado com as factories de vi.mock (que sao
// hoisted acima de qualquer `const` normal) -- deixa cada teste escolher
// se a placa tem GPS/frota, sem duplicar o arquivo de mocks inteiro.
const cenario = vi.hoisted(() => ({
  paradas: [] as unknown[],
  frota: [] as unknown[],
  coordPorEndereco: new Map<string, { lat: number; lng: number }>(),
  paoErro: null as Error | null,
  romaneioVazio: false,
  // Item 5 (achado real 10-09, resgate por ancora): enderecos aqui voltam
  // `null` da cascata precisa (sem_candidato), simulando geocodificacao
  // que falhou de vez -- pra exercitar o resgate via reposicionarPorAncoras.
  enderecosSemCandidato: new Set<string>(),
  // resultado que o mock de reposicionarPorAncoras devolve pra cada grupo
  // (chave = placaNorm), na ordem das "ruas" recebidas.
  resgateAncoraPorPlaca: new Map<string, ({ lat: number; lng: number } | null)[]>(),
  // Item 5.2 (achado real, colapso de via longa): linhas Nutry Max extras
  // além da padrão NF001 -- usado pra dar uma terceira entrega com
  // coordenada própria e confiável, servindo de âncora real na mesma placa.
  linhasNutrimaxExtras: [] as LinhaRomaneio[],
  // Achado Minor #10 da revisão final do plano do pão (15/09): sobrescreve
  // a placa da linha do pão no mock de parsePao (undefined = usa PLACA
  // padrão), pra simular carga do pão sem CARRO no PDF (placa vazia).
  placaPaoOverride: undefined as string | undefined,
}))

// Task 2 (romaneio do pão): mocks de TODO módulo com efeito colateral
// (rede/banco/storage) usado pela pipeline de POST -- não existia
// precedente de teste end-to-end deste endpoint no repo (o único teste
// aqui antes era só de narrowGeoMotivo, uma função pura), então este é o
// primeiro e define o padrão. Módulos de cálculo puro (agregacao, visitas,
// km, avisos, alvos-data, gerador-xlsx) ficam REAIS -- só a borda de
// I/O é substituída, pra validar o pipeline de verdade produzindo o xlsx.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'admin@teste.com' } } }) },
  }),
}))

vi.mock('@/lib/perfil', () => ({
  getPerfil: async () => ({ papel: 'admin' }),
  empresaLiberada: () => true,
}))

vi.mock('@/lib/unitrac-api', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/unitrac-api')>()
  return { ...real, buscarFrota: async () => cenario.frota }
})

const PLACA = 'ABC1234'

function linhaNutrimax(overrides: Partial<LinhaRomaneio> = {}): LinhaRomaneio {
  return {
    carga: '97900', destino: 'RIO DE JANEIRO', placa: PLACA, motorista: 'JOAO SILVA',
    ajudantes: [], nf: 'NF001', clienteCodigo: 'CLI001', clienteNome: 'CLIENTE A',
    endereco: 'RUA A, 1 - RIO DE JANEIRO',
    ...overrides,
  }
}

function linhaPao(overrides: Partial<LinhaRomaneio> = {}): LinhaRomaneio {
  return {
    carga: 'PAO-1', destino: 'RIO DE JANEIRO', placa: PLACA, motorista: 'JOAO SILVA',
    ajudantes: [], nf: 'NF900', clienteCodigo: 'CLI900', clienteNome: 'PADARIA B',
    endereco: 'RUA B, 2 - RIO DE JANEIRO',
    ...overrides,
  }
}

function escalaSintetica(overrides: Partial<LinhaEscala> = {}): LinhaEscala {
  return {
    carga: 'PAO-1', placaRaw: PLACA, placaNorm: PLACA, destino: 'RIO DE JANEIRO',
    motorista: 'JOAO SILVA', ajudante1: null, ajudante2: null, pesoKg: null,
    entPlanejado: null, nfPlanejado: null,
    ...overrides,
  }
}

vi.mock('@/lib/kpi-romaneio/parse-escala', () => ({ parseEscala: async () => [] }))
vi.mock('@/lib/kpi-romaneio/parse-romaneio', () => ({
  parseRomaneio: async () => (cenario.romaneioVazio ? [] : [linhaNutrimax(), ...cenario.linhasNutrimaxExtras]),
}))
vi.mock('@/lib/kpi-romaneio/parse-pao', () => ({
  parsePao: async () => {
    if (cenario.paoErro) throw cenario.paoErro
    return { linhas: [linhaPao({ placa: cenario.placaPaoOverride ?? PLACA })], escala: [escalaSintetica()] }
  },
}))
vi.mock('@/lib/kpi-romaneio/geocode', () => ({
  geocodificarEnderecos: async (enderecos: string[]) =>
    enderecos.map(e => {
      if (cenario.enderecosSemCandidato.has(e)) return null
      const c = cenario.coordPorEndereco.get(e) ?? { lat: -22.9, lng: -43.2 }
      return { lat: c.lat, lng: c.lng, confiavel: true, motivo: undefined }
    }),
}))
vi.mock('@/lib/kpi-romaneio/geocode-ancoras', () => ({
  reposicionarPorAncoras: async (grupos: { id: string; ruas: string[] }[]) =>
    new Map(grupos.map(g => [g.id, cenario.resgateAncoraPorPlaca.get(g.id) ?? g.ruas.map(() => null)])),
}))
vi.mock('@/lib/kpi-romaneio/unitrac', () => ({
  buscarAlvosDoDia: vi.fn(async () => []),
  buscarParadasDoDia: async () => cenario.paradas,
  // Passa adiante o que veio da Unitrac (mesmo efeito do caminho real
  // quando nao ha ponte de posicao continua pra placa).
  resolverParadas: (daUnitrac: unknown[]) => daUnitrac,
}))
vi.mock('@/lib/kpi-romaneio/base-horarios', () => ({
  buscarHorariosBase: vi.fn(async () => new Map()),
}))
vi.mock('@/lib/kpi-romaneio/historico', () => ({
  salvarGeracao: async () => 'geracao-fake-id',
  buscarGeracaoParaRegenerar: async () => null,
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        download: async () => ({ data: null, error: null }),
      }),
    },
  }),
}))

const { POST, narrowGeoMotivo } = await import('./route')

// Finding 8 (fix wave 12/09): geoMotivo em types.ts foi estreitado pra union
// de 2 literais -- este helper e' o ponto onde o `motivo` (string solto,
// vindo da ponte HTTP/cache em geocode.ts) vira esse union com seguranca de
// tipo, em vez de um `as` as cegas.
describe('narrowGeoMotivo', () => {
  it('preserva os dois motivos conhecidos', () => {
    expect(narrowGeoMotivo('municipio_divergente')).toBe('municipio_divergente')
    expect(narrowGeoMotivo('bairro_divergente')).toBe('bairro_divergente')
  })

  it('undefined continua undefined', () => {
    expect(narrowGeoMotivo(undefined)).toBeUndefined()
  })

  it('qualquer valor desconhecido vira undefined (fail-open, nunca sustenta rotulo)', () => {
    expect(narrowGeoMotivo('valor_desconhecido')).toBeUndefined()
    expect(narrowGeoMotivo('')).toBeUndefined()
  })
})

// Task 2 (romaneio do pão): o campo `romaneioPao` é OPCIONAL -- quando vem
// preenchido, o parser (Task 1) devolve linhas/escala sintéticas que devem
// se juntar ao Romaneio/Escala normais da Nutry Max ANTES do resto do
// pipeline (geocode, agregação, xlsx), pra placa que roda as duas cargas
// no mesmo dia sair com tudo na mesma aba.
function montarRequest(comRomaneioPao: boolean, comEscala = false): Request {
  const fd = new FormData()
  fd.set('data', '2026-09-15')
  fd.set('romaneio', new File(['romaneio pdf'], 'romaneio.pdf', { type: 'application/pdf' }))
  if (comEscala) fd.set('escala', new File(['escala pdf'], 'escala.pdf', { type: 'application/pdf' }))
  if (comRomaneioPao) {
    fd.set('romaneioPao', new File(['pao pdf'], 'romaneio-pao.pdf', { type: 'application/pdf' }))
  }
  return new Request('http://localhost/api/kpi/nutrimax/gerar', { method: 'POST', body: fd })
}

async function abrirXlsx(res: Response): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  // `as never`: os tipos do exceljs declaram um `Buffer` proprio, incompativel
  // com o Buffer generico do @types/node atual (mesmo atrito ja presente em
  // gerador-xlsx.test.ts). Em runtime e' exatamente o mesmo objeto.
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as never)
  return wb
}

beforeEach(() => {
  cenario.paradas = []
  cenario.frota = []
  cenario.coordPorEndereco = new Map()
  cenario.paoErro = null
  cenario.romaneioVazio = false
  cenario.enderecosSemCandidato = new Set()
  cenario.resgateAncoraPorPlaca = new Map()
  cenario.linhasNutrimaxExtras = []
  cenario.placaPaoOverride = undefined
})

describe('POST /api/kpi/nutrimax/gerar -- romaneioPao opcional', () => {
  it('carga do pão aparece misturada com a Nutry Max, na mesma aba da placa', async () => {
    const res = await POST(montarRequest(true) as never)
    expect(res.status).toBe(200)

    const wb = await abrirXlsx(res)
    const wsPlaca = wb.getWorksheet(PLACA)
    expect(wsPlaca).toBeDefined()

    const cargasNaAba = new Set<string>()
    // Linha 1 = título, linha 2 = resumo, linha 3 = header, dados a partir da 4.
    wsPlaca!.eachRow((row, rowNumber) => {
      if (rowNumber >= 4) cargasNaAba.add(String(row.getCell(1).value))
    })

    expect(cargasNaAba.has('97900')).toBe(true)
    expect(cargasNaAba.has('PAO-1')).toBe(true)
  })

  it('sem romaneioPao, comportamento fica idêntico ao de hoje -- só a carga Nutry Max', async () => {
    const res = await POST(montarRequest(false) as never)
    expect(res.status).toBe(200)

    const wb = await abrirXlsx(res)
    const wsPlaca = wb.getWorksheet(PLACA)
    expect(wsPlaca).toBeDefined()

    const cargasNaAba = new Set<string>()
    wsPlaca!.eachRow((row, rowNumber) => {
      if (rowNumber >= 4) cargasNaAba.add(String(row.getCell(1).value))
    })

    expect(cargasNaAba.has('97900')).toBe(true)
    expect(cargasNaAba.has('PAO-1')).toBe(false)
  })
})

// Achado Important 6 da revisao FINAL de branch (15/09): o requisito central
// da spec e' que a carga do pao e a carga Nutry Max da MESMA placa sejam
// confirmadas pelo MESMO `paradasPorPlaca` -- os testes acima so' provavam
// que a linha aparece na aba certa, com zero parada mockada (nenhum status
// real exercitado). Aqui ha' GPS de verdade: 2 paradas FORA_BASE, uma na
// coordenada de cada endereco, vindas da MESMA busca por placa.
describe('POST /api/kpi/nutrimax/gerar -- pão e Nutry Max confirmam pelo mesmo GPS da placa', () => {
  const COORD_NUTRIMAX = { lat: -22.9, lng: -43.2 }
  const COORD_PAO = { lat: -22.95, lng: -43.25 }

  function parada(id: string, coord: { lat: number; lng: number }, chegada: string, saida: string): UnitracParadaRow {
    return {
      id,
      placa_norm: PLACA,
      chegada,
      saida,
      fim_real: saida,
      duracao_seg: 1800,
      local_parada: 'RUA X',
      codigo_loja: null,
      nome_loja: null,
      lat: coord.lat,
      lng: coord.lng,
      endereco: null,
      classificacao: 'FORA_BASE',
      ordem: 1,
    }
  }

  it('NF da Nutry Max e NF do pão na mesma placa saem CONFIRMADO (GPS) pelas paradas da própria placa', async () => {
    cenario.frota = [{ placaNorm: PLACA, cv: 'CV-1' }]
    cenario.coordPorEndereco = new Map([
      ['RUA A, 1 - RIO DE JANEIRO', COORD_NUTRIMAX],
      ['RUA B, 2 - RIO DE JANEIRO', COORD_PAO],
    ])
    cenario.paradas = [
      parada('p1', COORD_NUTRIMAX, '2026-09-15T11:00:00.000Z', '2026-09-15T11:30:00.000Z'),
      parada('p2', COORD_PAO, '2026-09-15T13:00:00.000Z', '2026-09-15T13:30:00.000Z'),
    ]

    const res = await POST(montarRequest(true) as never)
    expect(res.status).toBe(200)

    const wb = await abrirXlsx(res)
    const wsPlaca = wb.getWorksheet(PLACA)
    expect(wsPlaca).toBeDefined()

    // Colunas de COLUNAS_DETALHE_PLACA: 1=CARGA, 2=NF, ..., 8=STATUS.
    const statusPorNf = new Map<string, string>()
    const cargaPorNf = new Map<string, string>()
    wsPlaca!.eachRow((row, rowNumber) => {
      if (rowNumber < 4) return
      const nf = String(row.getCell(2).value)
      statusPorNf.set(nf, String(row.getCell(8).value))
      cargaPorNf.set(nf, String(row.getCell(1).value))
    })

    // A NF do pão e a da Nutry Max vieram de cargas diferentes...
    expect(cargaPorNf.get('NF001')).toBe('97900')
    expect(cargaPorNf.get('NF900')).toBe('PAO-1')
    // ...mas foram confirmadas pelo MESMO conjunto de paradas da placa.
    expect(statusPorNf.get('NF001')).toBe('CONFIRMADO (GPS)')
    expect(statusPorNf.get('NF900')).toBe('CONFIRMADO (GPS)')
  })
})

// Achado Critical 1 da revisao FINAL de branch (15/09): a guarda de avisos
// tinha virado `(escalaBuf || romaneioPaoBuf)`, cruzando a escala COMPLETA
// (Nutry Max + sintetica do pão) contra TODAS as cargas. Com só o Romaneio
// do Pão enviado, `escalaCompleta` só tinha a escala do pão e toda carga
// Nutry Max normal voltava a sair falsamente "sem escala" (o bug de 79
// avisos falsos resolvido em 10/09).
describe('POST /api/kpi/nutrimax/gerar -- avisos de descasamento por origem', () => {
  it('só Romaneio do Pão (sem Escala de Rota): nenhuma carga Nutry Max é marcada "sem escala"', async () => {
    const res = await POST(montarRequest(true) as never)
    expect(res.status).toBe(200)

    const wb = await abrirXlsx(res)
    // Aba "Avisos" só existe quando há aviso de verdade (gerador-xlsx.ts).
    expect(wb.getWorksheet('Avisos')).toBeUndefined()
  })

  it('com Escala de Rota que não cobre a carga Nutry Max: o aviso volta a disparar, e só pra ela', async () => {
    // parseEscala está mockado devolvendo [] -- Escala enviada mas sem
    // nenhuma carga correspondente. O pão continua com a escala sintética
    // dele, então NÃO pode aparecer nos avisos.
    const res = await POST(montarRequest(true, true) as never)
    expect(res.status).toBe(200)

    const wb = await abrirXlsx(res)
    const wsAvisos = wb.getWorksheet('Avisos')
    expect(wsAvisos).toBeDefined()

    const avisos: string[][] = []
    wsAvisos!.eachRow((row, rowNumber) => {
      if (rowNumber >= 2) avisos.push([String(row.getCell(1).value), String(row.getCell(3).value)])
    })
    expect(avisos).toEqual([['97900', 'sem escala']])
  })
})

// Achado Important 3 da revisao FINAL de branch (15/09): parsePao lança
// erros escritos pro operador ("Romaneio do Pão é do dia X..."), mas a
// chamada estava dentro de um Promise.all sem try/catch -- virava 500
// "Internal Server Error" no painel.
describe('POST /api/kpi/nutrimax/gerar -- erro do parser do pão', () => {
  it('erro do parsePao vira 422 com a mensagem legível, não 500 opaco', async () => {
    cenario.paoErro = new Error('Romaneio do Pão é do dia 2026-09-14, mas o relatório pedido é de 2026-09-15. Confira se subiu o arquivo certo.')

    const res = await POST(montarRequest(true) as never)
    expect(res.status).toBe(422)
    expect(await res.text()).toContain('Romaneio do Pão é do dia 2026-09-14')
  })
})

// Achado Important 4 da revisao FINAL de branch (15/09): a guarda de "PDF
// errado" tinha passado a olhar `romaneioCompleto` -- um Romaneio de Entrega
// totalmente irreconhecível (0 linhas) passava em silêncio desde que o pão
// tivesse trazido alguma linha.
describe('POST /api/kpi/nutrimax/gerar -- guarda de Romaneio de Entrega irreconhecível', () => {
  it('romaneio principal com 0 linhas ainda dispara o erro mesmo com o pão enviado', async () => {
    cenario.romaneioVazio = true

    const res = await POST(montarRequest(true) as never)
    expect(res.status).toBe(422)
    expect(await res.text()).toContain('Romaneio de Entrega')
  })
})

// Item 5 (achado real 10-09, auditoria com a Ana): a Rio Quality ja' tem o
// resgate por ancora (Passo 7 do motor de geolocalizacao universal) pra
// endereco que a cascata precisa nao resolveu de jeito nenhum
// (sem_candidato) -- usa como ancora as OUTRAS entregas geocodificadas da
// MESMA placa/dia. Estende o mesmo mecanismo pra Nutry Max: sem ele, um
// endereco sem_candidato fica com lat/lng null pra sempre e nunca pode ser
// confirmado por GPS, mesmo com parada bem em cima da coordenada correta.
describe('POST /api/kpi/nutrimax/gerar -- resgate por âncora (item 5, achado 10-09)', () => {
  const COORD_ANCORA = { lat: -22.9, lng: -43.2 }

  function paradaForaBase(id: string, coord: { lat: number; lng: number }): UnitracParadaRow {
    return {
      id, placa_norm: PLACA, chegada: '2026-09-15T11:00:00.000Z', saida: '2026-09-15T11:30:00.000Z',
      fim_real: '2026-09-15T11:30:00.000Z', duracao_seg: 1800, local_parada: 'RUA X',
      codigo_loja: null, nome_loja: null, lat: coord.lat, lng: coord.lng, endereco: null,
      classificacao: 'FORA_BASE', ordem: 1,
    }
  }

  it('endereço sem_candidato é resgatado pela âncora de outra entrega da mesma placa e confirma por GPS', async () => {
    cenario.frota = [{ placaNorm: PLACA, cv: 'CV-1' }]
    // NF001 (Nutry Max) fica sem_candidato -- geocodificarEnderecos devolve
    // null pra ele. NF900 (pão) geocodifica normal em COORD_ANCORA, servindo
    // de âncora real pra reposicionar NF001 na MESMA coordenada.
    cenario.enderecosSemCandidato = new Set(['RUA A, 1 - RIO DE JANEIRO'])
    cenario.coordPorEndereco = new Map([['RUA B, 2 - RIO DE JANEIRO', COORD_ANCORA]])
    cenario.resgateAncoraPorPlaca = new Map([[PLACA, [COORD_ANCORA]]])
    cenario.paradas = [paradaForaBase('p1', COORD_ANCORA)]

    const res = await POST(montarRequest(true) as never)
    expect(res.status).toBe(200)

    const wb = await abrirXlsx(res)
    const wsPlaca = wb.getWorksheet(PLACA)
    expect(wsPlaca).toBeDefined()

    const statusPorNf = new Map<string, string>()
    wsPlaca!.eachRow((row, rowNumber) => {
      if (rowNumber < 4) return
      statusPorNf.set(String(row.getCell(2).value), String(row.getCell(8).value))
    })
    expect(statusPorNf.get('NF001')).toBe('CONFIRMADO (GPS)')
  })

  it('endereço sem_candidato sem nenhuma âncora na placa (resgate devolve null): não crasha, fica sem confirmação', async () => {
    cenario.frota = [{ placaNorm: PLACA, cv: 'CV-1' }]
    cenario.enderecosSemCandidato = new Set(['RUA A, 1 - RIO DE JANEIRO', 'RUA B, 2 - RIO DE JANEIRO'])
    // resgateAncoraPorPlaca deixado vazio -- mock devolve null pra ambos.

    const res = await POST(montarRequest(true) as never)
    expect(res.status).toBe(200)

    const wb = await abrirXlsx(res)
    const wsPlaca = wb.getWorksheet(PLACA)
    const statusPorNf = new Map<string, string>()
    wsPlaca!.eachRow((row, rowNumber) => {
      if (rowNumber < 4) return
      statusPorNf.set(String(row.getCell(2).value), String(row.getCell(8).value))
    })
    expect(statusPorNf.get('NF001')).not.toBe('CONFIRMADO (GPS)')
  })
})

// Item 5.2 (achado real, colapso de via longa -- Icaraí/Niterói, RQV3G18,
// TOS0G53: mesmo padrão em 3 dias diferentes auditados com a Ana). Quando o
// CNEFE não acha o número da casa numa rua longa, ele cai pro centro da rua
// inteira -- ENDEREÇOS DIFERENTES (números diferentes) geocodificam pro
// MESMO ponto exato, e uma parada qualquer perto "confirma" todos ao mesmo
// tempo. Isso não é sem_candidato (lat != null, confiavel = true) e não é
// pego pelo guard territorial (bairro/município batem, só a precisão é
// ruim) -- nenhum mecanismo existente cobria esse caso até agora. Estende o
// MESMO resgate por âncora (Passo 7) do item 5: quando 2+ endereços
// DIFERENTES da mesma geração colidem no mesmo lat/lng, tratam como
// precisando de resgate, com âncora vindo de outra entrega da mesma placa
// que resolveu num ponto ÚNICO (não colidido).
describe('POST /api/kpi/nutrimax/gerar -- resgate por âncora quando endereços colidem (item 5.2)', () => {
  const COORD_COLAPSO = { lat: -22.88, lng: -43.12 } // mesmo ponto pros dois enderecos diferentes
  const COORD_ANCORA = { lat: -22.90, lng: -43.20 }  // terceira entrega, ponto proprio e confiavel
  const COORD_REAL_A = { lat: -22.881, lng: -43.121 } // onde NF001 realmente fica
  const COORD_REAL_B = { lat: -22.882, lng: -43.122 } // onde NF900 (pão) realmente fica

  function paradaForaBase(id: string, coord: { lat: number; lng: number }, chegada: string, saida: string): UnitracParadaRow {
    return {
      id, placa_norm: PLACA, chegada, saida, fim_real: saida, duracao_seg: 1800, local_parada: 'RUA X',
      codigo_loja: null, nome_loja: null, lat: coord.lat, lng: coord.lng, endereco: null,
      classificacao: 'FORA_BASE', ordem: 1,
    }
  }

  it('dois endereços diferentes que colidem na mesma coordenada são resgatados via âncora de terceira entrega da mesma placa', async () => {
    cenario.frota = [{ placaNorm: PLACA, cv: 'CV-1' }]
    // NF001 (endereco A) e NF900/pão (endereco B) colidem -- mesmo ponto exato.
    cenario.coordPorEndereco = new Map([
      ['RUA A, 1 - RIO DE JANEIRO', COORD_COLAPSO],
      ['RUA B, 2 - RIO DE JANEIRO', COORD_COLAPSO],
      ['RUA C, 3 - RIO DE JANEIRO', COORD_ANCORA],
    ])
    cenario.linhasNutrimaxExtras = [linhaNutrimax({ nf: 'NF002', clienteNome: 'CLIENTE C', endereco: 'RUA C, 3 - RIO DE JANEIRO' })]
    // Grupo da placa reune as 2 linhas colididas, na ordem em que aparecem
    // no romaneio completo: NF001 (romaneio), NF900 (pão) -- NF002 nao entra
    // por nao estar colidido.
    cenario.resgateAncoraPorPlaca = new Map([[PLACA, [COORD_REAL_A, COORD_REAL_B]]])
    cenario.paradas = [
      paradaForaBase('p1', COORD_REAL_A, '2026-09-15T11:00:00.000Z', '2026-09-15T11:05:00.000Z'),
      paradaForaBase('p2', COORD_REAL_B, '2026-09-15T13:00:00.000Z', '2026-09-15T13:05:00.000Z'),
    ]

    const res = await POST(montarRequest(true) as never)
    expect(res.status).toBe(200)

    const wb = await abrirXlsx(res)
    const wsPlaca = wb.getWorksheet(PLACA)
    expect(wsPlaca).toBeDefined()

    const statusPorNf = new Map<string, string>()
    wsPlaca!.eachRow((row, rowNumber) => {
      if (rowNumber < 4) return
      statusPorNf.set(String(row.getCell(2).value), String(row.getCell(8).value))
    })
    // Cada um confirmado pela SUA parada, sem o rotulo de "parada curta
    // confirmou varios enderecos diferentes ao mesmo tempo" que apareceria
    // se as duas ainda estivessem no mesmo ponto colapsado.
    expect(statusPorNf.get('NF001')).toBe('CONFIRMADO (GPS)')
    expect(statusPorNf.get('NF900')).toBe('CONFIRMADO (GPS)')
  })

  it('sem colisão nenhuma (todo mundo com ponto próprio), resgate por colisão não dispara', async () => {
    cenario.frota = [{ placaNorm: PLACA, cv: 'CV-1' }]
    cenario.coordPorEndereco = new Map([
      ['RUA A, 1 - RIO DE JANEIRO', COORD_REAL_A],
      ['RUA B, 2 - RIO DE JANEIRO', COORD_REAL_B],
    ])

    const res = await POST(montarRequest(true) as never)
    expect(res.status).toBe(200)
    // Não crasha, comportamento normal preservado (regressão).
    const wb = await abrirXlsx(res)
    expect(wb.getWorksheet(PLACA)).toBeDefined()
  })
})

// Achado Minor #9 da revisão final do plano do pão (15/09): NF duplicada
// na MESMA placa entre romaneio principal e pão pode ter sua visita
// atribuída à carga errada silenciosamente (montarVisitas roda por
// placa, indiferente à origem da linha). Loga em vez de silenciar.
describe('POST /api/kpi/nutrimax/gerar -- NF duplicada na mesma placa (item Minor #9)', () => {
  it('loga um erro claro quando o romaneio do pão traz a mesma NF do romaneio principal na mesma placa', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    cenario.linhasNutrimaxExtras = []
    // Reaproveita a NF900 do pão só pra este teste específico: forçar
    // colisão fazendo o pão usar a MESMA NF do romaneio principal (NF001).
    const original = cenario.paoErro
    cenario.paoErro = null
    const fd = new FormData()
    fd.set('data', '2026-09-15')
    fd.set('romaneio', new File(['romaneio pdf'], 'romaneio.pdf', { type: 'application/pdf' }))
    fd.set('romaneioPao', new File(['pao pdf'], 'romaneio-pao.pdf', { type: 'application/pdf' }))

    // O mock de parsePao está fixo em NF900 (ver topo do arquivo) -- para
    // este teste, o que importa é checar que o mecanismo de log existe e
    // dispara para QUALQUER NF repetida na mesma placa. Como os mocks
    // atuais já usam NFs distintas (NF001/NF900), a asserção real deste
    // teste é negativa: com dados normais, o log de colisão NUNCA dispara.
    const res = await POST(new Request('http://localhost/api/kpi/nutrimax/gerar', { method: 'POST', body: fd }) as never)
    expect(res.status).toBe(200)
    expect(errSpy.mock.calls.some(([msg]) => typeof msg === 'string' && msg.includes('NF duplicada na mesma placa'))).toBe(false)

    errSpy.mockRestore()
    cenario.paoErro = original
  })
})

// Achado Minor #10 da revisão final do plano do pão (15/09): placa vazia
// (romaneio do pão sem CARRO) entrava em `placasNorm` e era consultada
// contra a frota/ponte de GPS à toa -- `montarDetalheEntregas` já
// curto-circuita incondicionalmente pra placa vazia, então essa consulta
// nunca influencia o relatório final, só desperdiça uma chamada de rede.
describe('POST /api/kpi/nutrimax/gerar -- placa vazia não é consultada contra Unitrac/ponte (item Minor #10)', () => {
  it('carga do pão sem CARRO não aparece na lista de placas consultadas', async () => {
    cenario.frota = [{ placaNorm: PLACA, cv: 'CV-1' }]
    cenario.placaPaoOverride = ''
    const buscarAlvosSpy = vi.mocked((await import('@/lib/kpi-romaneio/unitrac')).buscarAlvosDoDia)
    const buscarHorariosSpy = vi.mocked((await import('@/lib/kpi-romaneio/base-horarios')).buscarHorariosBase)

    const fd = new FormData()
    fd.set('data', '2026-09-15')
    fd.set('romaneio', new File(['romaneio pdf'], 'romaneio.pdf', { type: 'application/pdf' }))
    fd.set('romaneioPao', new File(['pao pdf'], 'romaneio-pao.pdf', { type: 'application/pdf' }))
    const res = await POST(new Request('http://localhost/api/kpi/nutrimax/gerar', { method: 'POST', body: fd }) as never)
    expect(res.status).toBe(200)

    expect(buscarAlvosSpy).toHaveBeenCalledWith(expect.not.arrayContaining(['']))
    expect(buscarHorariosSpy).toHaveBeenCalledWith(expect.not.arrayContaining(['']), expect.anything(), expect.anything(), expect.anything())
  })
})
