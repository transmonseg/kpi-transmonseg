import { describe, expect, it } from 'vitest'
import { classificarNf, type EntradaAuditoria } from './auditoria-nf'

const base: EntradaAuditoria = { status: 'entregue', emRota: false, gpsMinM: 20, gpsParadoMin: 8, kpiChegadaMin: 600, gpsParadoInisMin: [598] }
const com = (x: Partial<EntradaAuditoria>) => ({ ...base, ...x })

describe('classificarNf', () => {
  it('entregue e o GPS parou no endereco no mesmo horario: OK', () => {
    expect(classificarNf(base)).toBe('OK')
  })
  it('entregue mas o GPS so parou la 70 min depois: horario diverge (TTI6E49 08/10)', () => {
    expect(classificarNf(com({ kpiChegadaMin: 555, gpsParadoInisMin: [626] }))).toBe('HORARIO_DIVERGE')
  })
  it('o carro parou no endereco em DUAS vezes e o KPI bate com a segunda: OK (nao compara so com a primeira)', () => {
    expect(classificarNf(com({ kpiChegadaMin: 840, gpsParadoInisMin: [300, 838] }))).toBe('OK')
  })
  it('entregue e o carro nunca chegou a 300 m: suspeita de falso positivo', () => {
    expect(classificarNf(com({ gpsMinM: 2500, gpsParadoMin: 0 }))).toBe('SUSPEITA_FALSO_POSITIVO')
  })
  it('entregue, carro passou a 120 m sem parar: OK (so passou perto)', () => {
    expect(classificarNf(com({ gpsMinM: 120, gpsParadoMin: 0 }))).toBe('OK')
  })
  it('entregue sem nenhum GPS do dia: sem GPS', () => {
    expect(classificarNf(com({ gpsMinM: null, gpsParadoMin: 0, gpsParadoInisMin: [] }))).toBe('SEM_GPS')
  })
  it('nao entregue e o GPS parou 12 min no endereco: suspeita de falso negativo', () => {
    expect(classificarNf(com({ status: 'pendente', gpsParadoMin: 12 }))).toBe('SUSPEITA_FALSO_NEGATIVO')
  })
  it('nao entregue, rota andando, GPS ainda nao chegou: em rota', () => {
    expect(classificarNf(com({ status: 'pendente', emRota: true, gpsMinM: 4000, gpsParadoMin: 0 }))).toBe('EM_ROTA')
  })
  it('nao entregue, dia fechado e o GPS nunca parou la: nao entregue ok', () => {
    expect(classificarNf(com({ status: 'pendente', gpsMinM: 4000, gpsParadoMin: 0 }))).toBe('NAO_ENTREGUE_OK')
  })
})
