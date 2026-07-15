import { describe, it, expect } from 'vitest'
import { gerarKpiNutrimax } from './gerador'
import { parseKpiNutrimaxXlsx } from './parse-xlsx'
import type { EntradaNutrimax } from './types'

const entradas: EntradaNutrimax[] = [
  {
    data: '2026-07-14', carga: '92593', destino: 'CAMPOS', placa: 'TTL7D40', motorista: 'LUAN VIANA',
    nf: '2270025', cliente_codigo: '165049', cliente_nome: 'ANDRE LUIS SILVA VELASCO',
    endereco: 'RUA X, 1 - BAIRRO, CAMPOS - *', status: 'entregue', hora_realizado: '2026-07-14T09:58:18.480Z',
    placa_rastreada: true, placa_duplicada: false,
  },
  {
    data: '2026-07-14', carga: '92593', destino: 'CAMPOS', placa: 'TTL7D40', motorista: 'LUAN VIANA',
    nf: '2270014', cliente_codigo: '139854', cliente_nome: 'M A SARDINHA',
    endereco: 'RUA Y, 2 - BAIRRO, CAMPOS - *', status: 'pendente', hora_realizado: null,
    placa_rastreada: true, placa_duplicada: false,
  },
  {
    data: '2026-07-14', carga: '92594', destino: 'ITAPERUNA', placa: 'ZZZ9Z99', motorista: 'OUTRO',
    nf: '2270099', cliente_codigo: '153395', cliente_nome: 'RESTAURANTE DO TIO JILO',
    endereco: 'RUA W, 4 - BAIRRO, CAMPOS - *', status: 'confirmado_indireto', hora_realizado: '2026-07-14T10:13:37.400Z',
    placa_rastreada: false, placa_duplicada: true,
  },
]

describe('gerarKpiNutrimax + parseKpiNutrimaxXlsx', () => {
  it('gera um XLSX e relê exatamente as mesmas entradas, incluindo os 3 status e as flags', async () => {
    const buf = await gerarKpiNutrimax(entradas)
    expect(buf.length).toBeGreaterThan(0)

    const relidas = await parseKpiNutrimaxXlsx(buf, '2026-07-14')
    expect(relidas).toHaveLength(3)
    expect(relidas[0]).toMatchObject({
      carga: '92593', destino: 'CAMPOS', placa: 'TTL7D40', nf: '2270025',
      cliente_nome: 'ANDRE LUIS SILVA VELASCO', status: 'entregue',
      placa_rastreada: true, placa_duplicada: false,
    })
    expect(relidas[1]).toMatchObject({ nf: '2270014', status: 'pendente', placa_rastreada: true, placa_duplicada: false })
    expect(relidas[2]).toMatchObject({ nf: '2270099', status: 'confirmado_indireto', placa_rastreada: false, placa_duplicada: true })
  })

  it('planilha vazia → array vazio', async () => {
    const buf = await gerarKpiNutrimax([])
    expect(await parseKpiNutrimaxXlsx(buf, '2026-07-14')).toEqual([])
  })
})
