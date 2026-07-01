import { describe, it, expect } from 'vitest'
import { statusRotaParaDashboard, rotaParaEntrada, datasNoIntervalo } from './dashboard-api-fonte'

describe('statusRotaParaDashboard', () => {
  it('ENTREGUE e ENTREGUE_GEO → entregue', () => {
    expect(statusRotaParaDashboard('ENTREGUE')).toBe('entregue')
    expect(statusRotaParaDashboard('ENTREGUE_GEO')).toBe('entregue')
  })
  it('SEM_RASTREADOR → sem_rastreador', () => {
    expect(statusRotaParaDashboard('SEM_RASTREADOR')).toBe('sem_rastreador')
  })
  it('status ricos mapeiam pras 4 categorias (mudou de rota e desatualizado não são mais categorias próprias)', () => {
    expect(statusRotaParaDashboard('MUDOU_DE_ROTA')).toBe('nao_foi')
    expect(statusRotaParaDashboard('DESATUALIZADO')).toBe('sem_rastreador')
    expect(statusRotaParaDashboard('FORA_DE_BASE')).toBe('indefinido')
    expect(statusRotaParaDashboard('NAO_SAIU_DA_BASE')).toBe('nao_foi')
    expect(statusRotaParaDashboard('NAO_FOI_AO_CLIENTE')).toBe('nao_foi')
  })
})

describe('rotaParaEntrada', () => {
  const esc = { rede_id: 'PRINCESA', loja_nome_raw: 'Princesa - Fonseca', motorista_nome: 'JOAO' }
  const rota = {
    placa_norm: 'RJN9F68',
    saida_cd: new Date('2026-06-12T05:03:00Z'),
    chegada_base: new Date('2026-06-12T07:40:00Z'),
    paradas: [{ chegada: new Date('2026-06-12T05:44:00Z'), duracao_min: 92 }],
  }
  it('mapeia campos e formata horários HH:MM', () => {
    const e = rotaParaEntrada(rota as any, esc as any, 'ENTREGUE', '2026-06-12')
    expect(e.data).toBe('2026-06-12')
    expect(e.rede_id).toBe('PRINCESA')
    expect(e.loja).toBe('Princesa - Fonseca')
    expect(e.placa).toBe('RJN9F68')
    expect(e.motorista).toBe('JOAO')
    expect(e.status).toBe('entregue')
    expect(e.saida_cd).toBe('05:03')
    expect(e.chd).toBe('05:44')
    expect(e.sai).toBe('07:16')      // chegada + 92min
    expect(e.volta_base).toBe('07:40')
  })
  it('sem parada → horários null, status preservado', () => {
    const e = rotaParaEntrada({ placa_norm: 'X', saida_cd: null, chegada_base: null, paradas: [] } as any, esc as any, 'NAO_FOI_AO_CLIENTE', '2026-06-12')
    expect(e.status).toBe('nao_foi')
    expect(e.chd).toBeNull(); expect(e.sai).toBeNull(); expect(e.saida_cd).toBeNull()
  })
})

describe('datasNoIntervalo', () => {
  it('enumera inclusive', () => {
    expect(datasNoIntervalo('2026-06-10', '2026-06-12')).toEqual(['2026-06-10', '2026-06-11', '2026-06-12'])
  })
  it('um único dia', () => {
    expect(datasNoIntervalo('2026-06-12', '2026-06-12')).toEqual(['2026-06-12'])
  })
})
