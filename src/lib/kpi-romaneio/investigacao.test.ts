import { describe, it, expect } from 'vitest'
import { investigarNf, investigarPlacas } from './investigacao'
import { resumirInvestigacao } from './investigacao-resumo'
import type { PlacaAoVivo, NfAoVivo } from './ao-vivo'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

const M = 1 / 111_195
const CLI = { lat: -22.9, lng: -43.2 }
// Horário da Unitrac: Brasília mascarado como UTC ("14:32Z" = 14:32 BRT).
const parada = (dNorteM: number, chegada = '2026-10-06T14:32:00Z', fim = '2026-10-06T14:40:00Z', classificacao: 'FORA_BASE' | 'BASE' = 'FORA_BASE') =>
  ({ id: `${dNorteM}-${chegada}`, placa_norm: 'ABC1D23', classificacao, lat: CLI.lat + dNorteM * M, lng: CLI.lng, chegada, saida: fim, fim_real: fim }) as unknown as UnitracParadaRow

const nf = (over: Partial<NfAoVivo> = {}): NfAoVivo => ({
  nf: '1', carga: '10', cliente: 'MERCADO', endereco: 'RUA A, 1', status: 'SEM CONFIRMAÇÃO', situacao: 'nao_confirmada',
  chegada: null, saida: null, tempoMin: null, lat: CLI.lat, lng: CLI.lng, ...over,
})

describe('investigarNf', () => {
  it('parada mais perto a <=150 m: parou no cliente, com hora e duração', () => {
    expect(investigarNf(nf(), [parada(900), parada(120)])).toEqual({ categoria: 'parou_no_cliente', distM: 120, hora: '14:32', minutos: 8 })
  })
  it('faixas: 150-500 perto, 500-2000 região, >2000 não chegou perto', () => {
    expect(investigarNf(nf(), [parada(300)]).categoria).toBe('parou_perto')
    expect(investigarNf(nf(), [parada(1500)]).categoria).toBe('parou_na_regiao')
    expect(investigarNf(nf(), [parada(5000)]).categoria).toBe('nao_chegou_perto')
  })
  it('parada na base não conta (carro parado no pátio do lado do cliente)', () => {
    expect(investigarNf(nf(), [parada(50, undefined, undefined, 'BASE')])).toEqual({ categoria: 'sem_gps', distM: null, hora: null, minutos: null })
  })
  // GN-07/KM-11 (auditoria 20/10, caso TTI6E43 2422645): o carro passou a
  // 191 m sem parar e a investigacao dizia "nao chegou perto 3.242 m".
  it('trajeto a 191 m e parada mais perto a 3.242 m: passou sem parar, distancia do trajeto', () => {
    expect(investigarNf(nf(), [parada(3242)], 191)).toEqual({ categoria: 'passou_sem_parar', distM: 191, hora: null, minutos: null })
  })
  it('parada a 120 m vence o trajeto (parou no cliente)', () => {
    expect(investigarNf(nf(), [parada(120)], 30).categoria).toBe('parou_no_cliente')
  })
  it('trajeto a mais de 500 m nao muda nada', () => {
    expect(investigarNf(nf(), [parada(5000)], 900).categoria).toBe('nao_chegou_perto')
  })
  it('sem coordenada do cliente / sem rastreador', () => {
    expect(investigarNf(nf({ lat: null, lng: null }), [parada(100)]).categoria).toBe('sem_coordenada')
    expect(investigarNf(nf({ situacao: 'sem_rastreador' }), [parada(100)]).categoria).toBe('sem_gps')
  })
})

describe('investigarPlacas + resumirInvestigacao', () => {
  const placa = (p: string, nfs: NfAoVivo[]): PlacaAoVivo => ({ placa: p, motorista: '', destino: '', cargas: [], saidaBase: null, chegadaBase: null, km: null, total: nfs.length, feitas: 0, pct: 0, nfs })
  it('só investiga não entregue; resumo por placa ignora pendente (rota rodando)', () => {
    const placas = [
      placa('ABC-1D23', [nf({ nf: '1' }), nf({ nf: '2', situacao: 'entregue' }), nf({ nf: '3', situacao: 'pendente' })]),
      placa('XYZ9A99', [nf({ nf: '4', situacao: 'nao_foi' })]),
    ]
    investigarPlacas(placas, new Map([['ABC1D23', [parada(100)]], ['XYZ9A99', [parada(4000)]]]))
    expect(placas[0].nfs[0].investigacao?.categoria).toBe('parou_no_cliente')
    expect(placas[0].nfs[1].investigacao).toBeUndefined()
    expect(placas[0].nfs[2].investigacao?.categoria).toBe('parou_no_cliente')
    const r = resumirInvestigacao(placas)
    expect(r.total).toBe(2)
    expect(r.aguardando).toBe(1)
    expect(r.porCategoria).toEqual({ parou_no_cliente: 1, nao_chegou_perto: 1 })
    expect(r.placas.map(p => [p.placa, p.naoEntregues])).toEqual([['ABC-1D23', 1], ['XYZ9A99', 1]])
  })
})

// F2-REV-04: ponto nao confiavel (so' a rua) nao sustenta "nao passou".
describe('F2-REV-04: investigarNf com ponto aproximado', () => {
  it('parada a mais de 500 m de ponto aproximado: ponto_impreciso, sem distancia', () => {
    expect(investigarNf(nf({ pontoImpreciso: true }), [parada(5000)])).toEqual({ categoria: 'ponto_impreciso', distM: null, hora: null, minutos: null })
    expect(investigarNf(nf({ pontoImpreciso: true }), [parada(1500)]).categoria).toBe('ponto_impreciso')
  })
  it('parada perto do ponto aproximado continua "conferir" (parou no cliente/perto)', () => {
    expect(investigarNf(nf({ pontoImpreciso: true }), [parada(120)]).categoria).toBe('parou_no_cliente')
    expect(investigarNf(nf({ pontoImpreciso: true }), [parada(300)]).categoria).toBe('parou_perto')
  })
})
