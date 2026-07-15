import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/unitrac-api/frota', () => ({
  buscarFrota: vi.fn(async () => [
    { cv: '18870', placa: 'TTL-7D40', placaNorm: 'TTL7D40' },
    { cv: '99999', placa: 'ZZZ-9Z99', placaNorm: 'ZZZ9Z99' }, // sem nenhum alvo — sem rastreador
  ]),
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
    {
      placaNorm: 'TTL7D40', codigoUnitrac: '153395', nome: 'RESTAURANTE DO TIO JILO',
      situacao: 98, feitoISO: '2026-07-14T10:13:37.4', inicioISO: '2026-07-14T07:00:00',
      documento: '2270099', ordem: 0, rota: '93496',
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
    carga: '92593', destino: 'CAMPOS', placa: 'TTL-7D40', motorista: 'LUAN VIANA AREAS RIBEIRO',
    ajudantes: [], nf: '9999999', clienteCodigo: '000000', clienteNome: 'CLIENTE SEM ALVO',
    endereco: 'RUA Z, 3 - BAIRRO, CAMPOS - *',
  },
  {
    carga: '92593', destino: 'CAMPOS', placa: 'TTL-7D40', motorista: 'LUAN VIANA AREAS RIBEIRO',
    ajudantes: [], nf: '2270099', clienteCodigo: '153395', clienteNome: 'RESTAURANTE DO TIO JILO',
    endereco: 'RUA W, 4 - BAIRRO, CAMPOS - *',
  },
  {
    // mesma placa TTL7D40, carga diferente (92594) — placa duplicada no dia
    carga: '92594', destino: 'ITAPERUNA', placa: 'TTL-7D40', motorista: 'OUTRO MOTORISTA',
    ajudantes: [], nf: '1111111', clienteCodigo: '111111', clienteNome: 'CLIENTE ITAPERUNA',
    endereco: 'RUA V, 5 - BAIRRO, ITAPERUNA - *',
  },
  {
    // placa sem nenhum alvo na resposta — sem rastreador
    carga: '92595', destino: 'MACAE', placa: 'ZZZ-9Z99', motorista: 'MOTORISTA SEM GPS',
    ajudantes: [], nf: '2222222', clienteCodigo: '222222', clienteNome: 'CLIENTE MACAE',
    endereco: 'RUA U, 6 - BAIRRO, MACAE - *',
  },
]

describe('cruzaRomaneioAlvosNutrimax', () => {
  it('marca entregue quando o alvo tem situacao=1, pendente caso contrário', async () => {
    const entradas = await cruzaRomaneioAlvosNutrimax(linhas, '2026-07-14')
    expect(entradas).toHaveLength(6)
    expect(entradas[0]).toMatchObject({ nf: '2270025', status: 'entregue', hora_realizado: '2026-07-14T09:58:18.48' })
    expect(entradas[1]).toMatchObject({ nf: '2270014', status: 'pendente', hora_realizado: null })
    expect(entradas[2]).toMatchObject({ nf: '9999999', status: 'pendente', hora_realizado: null })
    expect(entradas[0].data).toBe('2026-07-14')
    expect(entradas[0].placa).toBe('TTL7D40')
  })

  it('situacao=98 vira status confirmado_indireto (não entregue, não pendente)', async () => {
    const entradas = await cruzaRomaneioAlvosNutrimax(linhas, '2026-07-14')
    expect(entradas[3]).toMatchObject({ nf: '2270099', status: 'confirmado_indireto', hora_realizado: '2026-07-14T10:13:37.4' })
  })

  it('placa_rastreada true quando a placa aparece em algum alvo do dia, false quando não aparece em nenhum', async () => {
    const entradas = await cruzaRomaneioAlvosNutrimax(linhas, '2026-07-14')
    const doTTL = entradas.filter(e => e.placa === 'TTL7D40')
    expect(doTTL.every(e => e.placa_rastreada === true)).toBe(true)
    const doZZZ = entradas.find(e => e.placa === 'ZZZ9Z99')
    expect(doZZZ?.placa_rastreada).toBe(false)
  })

  it('placa_duplicada true quando a mesma placa aparece em mais de uma carga no dia', async () => {
    const entradas = await cruzaRomaneioAlvosNutrimax(linhas, '2026-07-14')
    const doTTL = entradas.filter(e => e.placa === 'TTL7D40')
    expect(doTTL.every(e => e.placa_duplicada === true)).toBe(true)
    const doZZZ = entradas.find(e => e.placa === 'ZZZ9Z99')
    expect(doZZZ?.placa_duplicada).toBe(false)
  })
})
