import { describe, it, expect } from 'vitest'
import { mesclarAlvos } from './alvos-snapshot'
import type { AlvoApi } from '@/lib/unitrac-api'

const alvo = (o: Partial<AlvoApi>): AlvoApi => ({
  placaNorm: 'AAA1A11', codigoUnitrac: 'L1', nome: 'Loja', situacao: 0,
  feitoISO: null, documento: '100', inicioISO: '2026-09-17T06:00:00', ordem: 1, rota: 'R1', ...o,
})

describe('mesclarAlvos', () => {
  it('feito nunca volta a pendente', () => {
    const r = mesclarAlvos([alvo({ situacao: 1, feitoISO: '2026-09-17T09:00:00' })], [alvo({ situacao: 0 })])
    expect(r).toHaveLength(1)
    expect(r[0].situacao).toBe(1)
  })
  it('pendente antigo vira feito quando o novo confirma', () => {
    const r = mesclarAlvos([alvo({ situacao: 0 })], [alvo({ situacao: 1, feitoISO: '2026-09-17T10:00:00' })])
    expect(r[0].situacao).toBe(1)
  })
  it('une alvos de chaves diferentes', () => {
    expect(mesclarAlvos([alvo({ documento: '1' })], [alvo({ documento: '2' })])).toHaveLength(2)
  })
})
