import { describe, it, expect } from 'vitest'
import { buscarNfs, filtrarNfs } from './ao-vivo-busca'
import type { PlacaAoVivo, NfAoVivo } from './ao-vivo'

const nf = (nf: string, cliente: string, situacao: NfAoVivo['situacao'] = 'entregue'): NfAoVivo => ({ nf, carga: '1', cliente, endereco: '', status: '', situacao, chegada: null, saida: null, tempoMin: null, lat: null, lng: null })
const placa = (p: string, nfs: NfAoVivo[]): PlacaAoVivo => ({ placa: p, motorista: '', destino: '', cargas: [], saidaBase: null, chegadaBase: null, km: null, total: nfs.length, feitas: 0, pct: 0, nfs })
const placas = [placa('TTH6G37', [nf('2408242', 'ZAZA'), nf('2408243', 'Galeto Bicão', 'pendente')]), placa('RQU0B47', [nf('2401111', 'PADARIA CAIÇARA')])]

describe('buscarNfs (pedido da tia Érica 06/10: achar a nota pelo cliente ou número)', () => {
  it('por número da nota (parte do número)', () => expect(buscarNfs(placas, '8242').map(r => [r.placa, r.nf.nf])).toEqual([['TTH6G37', '2408242']]))
  it('por nome do cliente, sem acento e sem caixa', () => {
    expect(buscarNfs(placas, 'galeto bicao').map(r => r.nf.nf)).toEqual(['2408243'])
    expect(buscarNfs(placas, 'caicara').map(r => r.placa)).toEqual(['RQU0B47'])
  })
  it('menos de 3 letras/dígitos ou placa: nada (a lista de placas já filtra)', () => {
    expect(buscarNfs(placas, 'za')).toEqual([])
    expect(buscarNfs(placas, '')).toEqual([])
  })
})

describe('filtrarNfs', () => {
  it('pendentes = tudo que não é entregue; entregues = só entregue', () => {
    const ns = placas[0].nfs
    expect(filtrarNfs(ns, 'todas')).toHaveLength(2)
    expect(filtrarNfs(ns, 'pendentes').map(n => n.nf)).toEqual(['2408243'])
    expect(filtrarNfs(ns, 'entregues').map(n => n.nf)).toEqual(['2408242'])
  })
})
