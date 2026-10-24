import { describe, it, expect, vi } from 'vitest'
import romaneios from '../fusion/__fixtures__/romaneios.json'
import entregas from '../fusion/__fixtures__/entregas.json'
import { mapearEntregasFusion, buscarDiaRioQualityFusion, buscarDiaRioQualityFusionCompleto, placaFicticia } from './fonte-fusion'
import { buscarEntregasDoDia, buscarRelatorioEntregasFusion } from '../fusion/entregas'
import type { RomaneioFusion, EntregaFusionRaw } from '../fusion/tipos'

vi.mock('../fusion/entregas', async importOriginal => ({
  ...(await importOriginal<typeof import('../fusion/entregas')>()),
  buscarEntregasDoDia: vi.fn(async () => ({ romaneios: [], entregas: [] })),
  buscarRelatorioEntregasFusion: vi.fn(),
}))

describe('mapearEntregasFusion', () => {
  const linhas = mapearEntregasFusion(romaneios.rows as RomaneioFusion[], entregas.rows as EntregaFusionRaw[])

  it('produz uma linha por entrega', () => expect(linhas).toHaveLength(4))

  it('casa romaneio -> placa/motorista/cliente/cidade', () => {
    const l = linhas[0]
    expect(l.placaNorm).toBe('KOB3H38')
    expect(l.motorista).toBe('DAVIDSON MESQUITA SILVA')
    expect(l.clienteNome).toBe('BANG 2024 REST E LANC LTDA')
    expect(l.cidade).toBe('RIO DE JANEIRO')
  })

  it('nf = pedido ERP (id estavel)', () => {
    expect(linhas[0].nf).toBe('6052562')
    expect(linhas.find(l => l.clienteNome.includes('DEVOLVIDO'))!.nf).toBe('6059999')
  })

  it('pedidoErp = pedido ERP (D-21b: a mesma chave da planilha manual)', () => {
    expect(linhas[0].pedidoErp).toBe('6052562')
  })

  it('entregue -> gabarito Entregue com check-in/out', () => {
    const g = linhas[0].gabarito!
    expect(g.status).toBe('Entregue')
    expect(g.checkIn).toBe(true)
    expect(g.checkOut).toBe(true)
    expect(g.dataCheckIn).toBe('2026-10-10 10:14:44')
  })

  it('devolucao -> gabarito Devolvido sem check-out', () => {
    const dev = linhas.find(l => l.clienteNome.includes('DEVOLVIDO'))!
    expect(dev.gabarito!.status).toBe('Devolvido')
    expect(dev.gabarito!.checkOut).toBe(false)
  })
})

describe('placa ficticia da Fusion (RQ-04, auditoria 20/10)', () => {
  it('XXX5678 (108 NFs em 15/10 contadas como entregues) vira carga sem placa, fora da taxa', () => {
    const roms = (romaneios.rows as RomaneioFusion[]).map(r => ({ ...r, t06_placa: 'XXX-5678' }))
    const l = mapearEntregasFusion(roms, entregas.rows as EntregaFusionRaw[])
    expect(l.every(x => x.placaNorm === '')).toBe(true)
  })
  it('placa real segue igual', () => {
    expect(placaFicticia('KOB3H38')).toBe(false)
    expect(placaFicticia('XXX5678')).toBe(true)
  })
})

describe('buscarDiaRioQualityFusion', () => {
  it('dia sem romaneios devolve lista vazia', async () => {
    expect(await buscarDiaRioQualityFusion('2026-10-10')).toEqual([])
  })
})

// F4-09 (KRQ-02): o dia vem do relatorio de 55 colunas (NF real, bairro,
// codigo do cliente); a grade sem bairro so' entra quando o relatorio falha,
// e com aviso.
describe('buscarDiaRioQualityFusionCompleto (F4-09)', () => {
  const linha55 = { placaNorm: 'TTT1J28', nf: '5555374', pedidoErp: '6072386', clienteCodigo: '60485', bairro: 'PARQUE TARCISIO MIRANDA' }

  it('relatorio de 55 colunas respondeu: fonte fusion55, sem aviso, grade nao e consultada', async () => {
    vi.mocked(buscarRelatorioEntregasFusion).mockResolvedValueOnce([linha55] as never)
    vi.mocked(buscarEntregasDoDia).mockClear()
    const r = await buscarDiaRioQualityFusionCompleto('2026-10-22')
    expect(r).toEqual({ linhas: [linha55], fonte: 'fusion55', aviso: null })
    expect(buscarEntregasDoDia).not.toHaveBeenCalled()
  })

  it('relatorio falhou: cai na grade (pedido como NF, sem bairro) com aviso', async () => {
    vi.mocked(buscarRelatorioEntregasFusion).mockRejectedValueOnce(new Error('Fusion: relatório de entregas sem dados (formato inesperado)'))
    vi.mocked(buscarEntregasDoDia).mockResolvedValueOnce({ romaneios: romaneios.rows, entregas: entregas.rows } as never)
    const r = await buscarDiaRioQualityFusionCompleto('2026-10-22')
    expect(r.fonte).toBe('fusion')
    expect(r.linhas).toHaveLength(4)
    expect(r.linhas[0].nf).toBe('6052562')
    expect(r.aviso).toMatch(/relatório de 55 colunas.*formato inesperado/)
    expect(r.aviso).toMatch(/sem bairro/)
  })

  it('relatorio falhou e o dia ja tem a versao de 55 colunas: lanca (nao troca NF real por pedido)', async () => {
    vi.mocked(buscarRelatorioEntregasFusion).mockRejectedValueOnce(new TypeError('fetch failed'))
    vi.mocked(buscarEntregasDoDia).mockClear()
    await expect(buscarDiaRioQualityFusionCompleto('2026-10-22', { gradeComoReserva: false })).rejects.toThrow(/55 colunas.*fetch failed/)
    expect(buscarEntregasDoDia).not.toHaveBeenCalled()
  })

  it('relatorio vazio e a grade com entregas: usa a grade com aviso (dia sem saida registrada ainda)', async () => {
    vi.mocked(buscarRelatorioEntregasFusion).mockResolvedValueOnce([])
    vi.mocked(buscarEntregasDoDia).mockResolvedValueOnce({ romaneios: romaneios.rows, entregas: entregas.rows } as never)
    const r = await buscarDiaRioQualityFusionCompleto('2026-10-22')
    expect(r.fonte).toBe('fusion')
    expect(r.aviso).toMatch(/sem linhas/)
  })

  it('os dois vazios: dia sem dados', async () => {
    vi.mocked(buscarRelatorioEntregasFusion).mockResolvedValueOnce([])
    vi.mocked(buscarEntregasDoDia).mockResolvedValueOnce({ romaneios: [], entregas: [] } as never)
    expect(await buscarDiaRioQualityFusionCompleto('2026-10-25')).toEqual({ linhas: [], fonte: 'fusion55', aviso: null })
  })
})
