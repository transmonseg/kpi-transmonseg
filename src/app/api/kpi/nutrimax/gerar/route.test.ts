import { describe, it, expect, vi } from 'vitest'
import ExcelJS from 'exceljs'
import type { LinhaRomaneio, LinhaEscala } from '@/lib/kpi-romaneio/types'

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
  return { ...real, buscarFrota: async () => [] }
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
vi.mock('@/lib/kpi-romaneio/parse-romaneio', () => ({ parseRomaneio: async () => [linhaNutrimax()] }))
vi.mock('@/lib/kpi-romaneio/parse-pao', () => ({
  parsePao: async () => ({ linhas: [linhaPao()], escala: [escalaSintetica()] }),
}))
vi.mock('@/lib/kpi-romaneio/geocode', () => ({
  geocodificarEnderecos: async (enderecos: string[]) =>
    enderecos.map(() => ({ lat: -22.9, lng: -43.2, confiavel: true, motivo: undefined })),
}))
vi.mock('@/lib/kpi-romaneio/unitrac', () => ({
  buscarAlvosDoDia: async () => [],
  buscarParadasDoDia: async () => [],
  resolverParadas: () => [],
}))
vi.mock('@/lib/kpi-romaneio/base-horarios', () => ({
  buscarHorariosBase: async () => new Map(),
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
describe('POST /api/kpi/nutrimax/gerar -- romaneioPao opcional', () => {
  function montarRequest(comRomaneioPao: boolean): Request {
    const fd = new FormData()
    fd.set('data', '2026-09-15')
    fd.set('romaneio', new File(['romaneio pdf'], 'romaneio.pdf', { type: 'application/pdf' }))
    if (comRomaneioPao) {
      fd.set('romaneioPao', new File(['pao pdf'], 'romaneio-pao.pdf', { type: 'application/pdf' }))
    }
    return new Request('http://localhost/api/kpi/nutrimax/gerar', { method: 'POST', body: fd })
  }

  it('carga do pão aparece misturada com a Nutry Max, na mesma aba da placa', async () => {
    const res = await POST(montarRequest(true) as never)
    expect(res.status).toBe(200)

    const buffer = Buffer.from(await res.arrayBuffer())
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

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

    const buffer = Buffer.from(await res.arrayBuffer())
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)

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
