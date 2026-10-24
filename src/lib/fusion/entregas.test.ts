// src/lib/fusion/entregas.test.ts
import { describe, it, expect, vi } from 'vitest'
import romaneios from './__fixtures__/romaneios.json'
import entregas from './__fixtures__/entregas.json'

vi.mock('./client', () => ({
  fusionPost: vi.fn(async (path: string) =>
    path.includes('get_grid_romaneios') ? romaneios : entregas),
  fusionGet: vi.fn(),
}))

describe('buscarEntregasDoDia', () => {
  it('casa romaneios com suas entregas', async () => {
    const { buscarEntregasDoDia } = await import('./entregas')
    const r = await buscarEntregasDoDia('2026-10-10')
    expect(r.romaneios).toHaveLength(1)
    expect(r.entregas).toHaveLength(4)
    expect(r.entregas[0].t10_id).toBe('1163924')
  })
})

// Revisao Fase 2 (F2-REV-02): JSON 200 sem `rows` passava como romaneio vazio
// (`g.rows ?? []`) e o romaneio sumia do dia em silencio.
describe('resposta da Fusion sem rows (F2-REV-02)', () => {
  it('romaneio sem rows lanca erro (nao vira romaneio vazio)', async () => {
    const { fusionPost } = await import('./client')
    vi.mocked(fusionPost).mockResolvedValueOnce({ total: 40 } as never)
    const { buscarEntregasDoRomaneio } = await import('./entregas')
    await expect(buscarEntregasDoRomaneio('1167566')).rejects.toThrow(/sem rows/)
  })

  it('lista de romaneios sem rows tambem lanca', async () => {
    const { fusionPost } = await import('./client')
    vi.mocked(fusionPost).mockResolvedValueOnce({ erro: 'x' } as never)
    const { buscarRomaneiosDoDia } = await import('./entregas')
    await expect(buscarRomaneiosDoDia('2026-10-20')).rejects.toThrow(/sem rows/)
  })

  it('rows vazio com total 0 continua valendo (dia sem romaneio)', async () => {
    const { fusionPost } = await import('./client')
    vi.mocked(fusionPost).mockResolvedValueOnce({ total: 0, rows: [] } as never)
    const { buscarRomaneiosDoDia } = await import('./entregas')
    await expect(buscarRomaneiosDoDia('2026-10-25')).resolves.toEqual([])
  })
})

// F4-09 (KRQ-02): o "Relatório de Entregas" de 55 colunas (tela 3.5 Gestão de
// Entregas -> Relatórios -> Relatório de Entregas) é o mesmo arquivo que a
// Érica sobe à mão, com NF real, código do cliente e bairro. Resposta REAL de
// 22/10 (3 linhas do relatório de 2.881, cabeçalho de 55 colunas).
import relatorio55 from './__fixtures__/relatorio-entregas-55.json'

describe('buscarRelatorioEntregasFusion (F4-09, 55 colunas)', () => {
  it('pede o relatório pela data de saída do dia, sem filtro de filial', async () => {
    const { fusionPost } = await import('./client')
    vi.mocked(fusionPost).mockClear()
    vi.mocked(fusionPost).mockResolvedValueOnce(relatorio55 as never)
    const { buscarRelatorioEntregasFusion, PATH_RELATORIO_ENTREGAS } = await import('./entregas')
    await buscarRelatorioEntregasFusion('2026-10-22')
    expect(PATH_RELATORIO_ENTREGAS).toBe('/php/relatorios_flex/gestaoentrega/relatorio_entregas-json.php')
    const [path, corpo] = vi.mocked(fusionPost).mock.calls[0] as [string, Record<string, string>]
    expect(path).toBe(PATH_RELATORIO_ENTREGAS)
    expect(corpo).toMatchObject({
      'json[url]': 'gestaoentrega/relatorio_entregas-json.php',
      'json[filtros][dtSaida_ini]': '2026-10-22', 'json[filtros][dtSaida_fin]': '2026-10-22',
      'json[filtros][dtPedido_ini]': '', 'json[filtros][filiais_ids]': '', 'json[filtros][ignoreCrossdocking]': 'N',
    })
  })

  it('22/10: NF real, pedido, código do cliente, bairro, romaneio, rota e check-in (caso real NF 5555374)', async () => {
    const { fusionPost } = await import('./client')
    vi.mocked(fusionPost).mockResolvedValueOnce(relatorio55 as never)
    const { buscarRelatorioEntregasFusion } = await import('./entregas')
    const l = await buscarRelatorioEntregasFusion('2026-10-22')
    expect(l).toHaveLength(3)
    expect(l[0]).toMatchObject({
      placaNorm: 'TTT1J28', nf: '5555374', pedidoErp: '6072386', clienteCodigo: '60485',
      clienteNome: 'VALDES VIDAL DA SILVA JUNIOR', cidade: 'CAMPOS DOS GOYTACAZES', uf: 'RJ',
      rua: 'RUA VIRGILIO DE PAULA', bairro: 'PARQUE TARCISIO MIRANDA', romaneio: '1168654', rota: 'NORTE FLU 1',
      destino: 'FELIZ GAIOLA - CAMPOS 22/10', motorista: 'IRANILDO MOTA DA SILVA',
    })
    expect(l[0].gabarito).toMatchObject({ status: 'Entregue', checkIn: true, checkOut: true, dataCheckIn: '23/10/2026 07:03:48' })
    expect(l[2].gabarito).toMatchObject({ status: 'Devolvido Parcial', checkIn: false, dataCheckIn: null })
    expect(l.every(x => x.bairro)).toBe(true)
  })

  it('placa de preenchimento (XXX, RQ-04) vira carga sem placa, como na grade', async () => {
    const { fusionPost } = await import('./client')
    const r = JSON.parse(JSON.stringify(relatorio55))
    r.data.dados[1].Placa = 'XXX5678'
    vi.mocked(fusionPost).mockResolvedValueOnce(r as never)
    const { buscarRelatorioEntregasFusion } = await import('./entregas')
    const l = await buscarRelatorioEntregasFusion('2026-10-22')
    expect(l[0].placaNorm).toBe('')
    expect(l[1].placaNorm).toBe('LAT9F36')
  })

  it('só o cabeçalho (dia sem entrega) devolve lista vazia', async () => {
    const { fusionPost } = await import('./client')
    const r = JSON.parse(JSON.stringify(relatorio55))
    r.data.dados = [r.data.dados[0]]
    vi.mocked(fusionPost).mockResolvedValueOnce(r as never)
    const { buscarRelatorioEntregasFusion } = await import('./entregas')
    await expect(buscarRelatorioEntregasFusion('2026-10-25')).resolves.toEqual([])
  })

  it('success false, sem dados ou formato sem Nota Fiscal/Bairro lança (cai na grade com aviso)', async () => {
    const { fusionPost } = await import('./client')
    const { buscarRelatorioEntregasFusion } = await import('./entregas')
    vi.mocked(fusionPost).mockResolvedValueOnce({ success: false, message: 'Sessão expirada' } as never)
    await expect(buscarRelatorioEntregasFusion('2026-10-22')).rejects.toThrow(/Sessão expirada/)
    vi.mocked(fusionPost).mockResolvedValueOnce({ success: true, data: {} } as never)
    await expect(buscarRelatorioEntregasFusion('2026-10-22')).rejects.toThrow(/sem dados/)
    const r = JSON.parse(JSON.stringify(relatorio55))
    delete r.data.dados[0]['Nota Fiscal']
    vi.mocked(fusionPost).mockResolvedValueOnce(r as never)
    await expect(buscarRelatorioEntregasFusion('2026-10-22')).rejects.toThrow(/Nota Fiscal/)
  })
})
