import { describe, it, expect } from 'vitest'
import { gerarKpiNutrimax, ErroEntradaKpi } from './gerar-nutrimax'

describe('gerarKpiNutrimax', () => {
  it('romaneio principal vazio: ErroEntradaKpi com a mensagem da rota (mesmo com pão)', async () => {
    const pao = { linhas: [{ carga: 'PAO-1', destino: '', placa: 'ABC1234', motorista: '', ajudantes: [], nf: '1', clienteCodigo: '', clienteNome: 'X', endereco: 'RUA A, 1' }], escala: [] }
    const entrada = { data: '2026-10-03', escala: [], romaneio: [], pao, escalaEnviada: false, paoEnviado: true }
    await expect(gerarKpiNutrimax(entrada)).rejects.toThrow(ErroEntradaKpi)
    await expect(gerarKpiNutrimax(entrada)).rejects.toThrow('Nenhuma linha reconhecida no Romaneio de Entrega — confira se o PDF é o "Romaneio de Entrega" da Nutry Max.')
  })
})
