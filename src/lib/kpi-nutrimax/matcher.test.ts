import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/unitrac-api/frota', () => ({
  buscarFrota: vi.fn(async () => [{ cv: '18870', placa: 'TTL-7D40', placaNorm: 'TTL7D40' }]),
  normPlaca: (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, ''),
}))
vi.mock('@/lib/unitrac-api/alvos', () => ({
  buscarAlvos: vi.fn(async () => [
    {
      placaNorm: 'TTL7D40', codigoUnitrac: '165049', nome: 'ANDRE LUIS SILVA VELASCO',
      situacao: 1, feitoISO: '2026-07-14T09:58:18.48', inicioISO: '2026-07-14T07:00:00',
      documento: '2270025', ordem: 0, rota: '93496',
    },
    {
      placaNorm: 'TTL7D40', codigoUnitrac: '139854', nome: 'M A SARDINHA',
      situacao: 0, feitoISO: null, inicioISO: '2026-07-14T07:00:00',
      documento: '2270014', ordem: 0, rota: '93496',
    },
  ]),
}))

import { cruzaRomaneioAlvosNutrimax } from './matcher'
import type { LinhaRomaneioNutrimax } from './types'

const linhas: LinhaRomaneioNutrimax[] = [
  {
    carga: '92593', destino: 'CAMPOS', placa: 'TTL-7D40', motorista: 'LUAN VIANA AREAS RIBEIRO',
    ajudantes: [], nf: '2270025', clienteCodigo: '165049', clienteNome: 'ANDRE LUIS SILVA VELASCO',
    endereco: 'RUA X, 1 - BAIRRO, CAMPOS - *',
  },
  {
    carga: '92593', destino: 'CAMPOS', placa: 'TTL-7D40', motorista: 'LUAN VIANA AREAS RIBEIRO',
    ajudantes: [], nf: '2270014', clienteCodigo: '139854', clienteNome: 'M A SARDINHA',
    endereco: 'RUA Y, 2 - BAIRRO, CAMPOS - *',
  },
  {
    // NF sem alvo correspondente no Unitrac → deve virar "pendente" mesmo assim
    carga: '92593', destino: 'CAMPOS', placa: 'TTL-7D40', motorista: 'LUAN VIANA AREAS RIBEIRO',
    ajudantes: [], nf: '9999999', clienteCodigo: '000000', clienteNome: 'CLIENTE SEM ALVO',
    endereco: 'RUA Z, 3 - BAIRRO, CAMPOS - *',
  },
]

describe('cruzaRomaneioAlvosNutrimax', () => {
  it('marca entregue quando o alvo tem situacao=1, pendente caso contrário', async () => {
    const entradas = await cruzaRomaneioAlvosNutrimax(linhas, '2026-07-14')
    expect(entradas).toHaveLength(3)
    expect(entradas[0]).toMatchObject({ nf: '2270025', status: 'entregue', hora_realizado: '2026-07-14T09:58:18.48' })
    expect(entradas[1]).toMatchObject({ nf: '2270014', status: 'pendente', hora_realizado: null })
    expect(entradas[2]).toMatchObject({ nf: '9999999', status: 'pendente', hora_realizado: null })
    expect(entradas[0].data).toBe('2026-07-14')
    expect(entradas[0].placa).toBe('TTL7D40')
  })
})
