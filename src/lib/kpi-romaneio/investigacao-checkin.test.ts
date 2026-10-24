// F4-10 (KRQ-13): check-in da Fusion como PISTA na investigação, nunca como
// ENTREGUE. Caso real 20/10, LPH6E20, NF 6069736 "AVENIDA DAS AMERICAS"
// (Fusion sem bairro -> ponto CNEFE da Av. das Américas da Maré,
// -22.858122,-43.242315): check-in às 09:29:58 durante a parada
// LPH6E20-api-6 (07:24-09:46, -22.9971183,-43.3552783), na Barra, ~19 km.
import { describe, it, expect } from 'vitest'
import { pistaCheckIn, investigarPlacas } from './investigacao'
import { fraseInvestigacao } from './investigacao-rotulos'
import type { PlacaAoVivo, NfAoVivo } from './ao-vivo'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

const p = (id: string, chegada: string, fim: string, saida: string, lat: number, lng: number, classificacao = 'FORA_BASE') =>
  ({ id, placa_norm: 'LPH6E20', classificacao, lat, lng, chegada, fim_real: fim, saida }) as unknown as UnitracParadaRow
const PARADAS: UnitracParadaRow[] = [
  p('LPH6E20-api-5', '2026-10-20T07:13:15.000Z', '2026-10-20T07:16:15.000Z', '2026-10-20T07:24:24.000Z', -22.9734066, -43.3811149),
  p('LPH6E20-api-6', '2026-10-20T07:24:24.000Z', '2026-10-20T09:46:58.000Z', '2026-10-20T09:50:35.000Z', -22.9971183, -43.3552783),
  p('LPH6E20-api-7', '2026-10-20T09:50:35.000Z', '2026-10-20T10:23:35.000Z', '2026-10-20T10:29:13.000Z', -22.9916199, -43.36271),
  p('LPH6E20-api-18', '2026-10-20T14:34:43.000Z', '2026-10-20T14:48:43.000Z', '2026-10-20T14:50:09.000Z', -22.8157266, -43.3421416, 'BASE'),
]
const PONTO = { lat: -22.858122, lng: -43.242315 }
const nf = (over: Partial<NfAoVivo> = {}): NfAoVivo => ({
  nf: '6069736', carga: '1166000', cliente: 'CLIENTE AV DAS AMERICAS', endereco: 'AVENIDA DAS AMERICAS, RIO DE JANEIRO',
  status: 'ENDEREÇO COM COORDENADA IMPRECISA - CAMINHÃO A MAIS DE 2 KM DO PONTO, QUE NÃO FOI CONFIRMADO - CONFERIR CADASTRO',
  situacao: 'revisar', chegada: null, saida: null, tempoMin: null, ...PONTO, ...over,
})

describe('pistaCheckIn (F4-10)', () => {
  it('LPH6E20 09:29:58: caminhão parado (api-6) a ~19 km do ponto', () => {
    const r = pistaCheckIn(nf(), PARADAS, '2026-10-20T09:29:58.000Z')
    expect(r.hora).toBe('09:29')
    expect(r.parado).toBe(true)
    expect(r.distM).toBeGreaterThan(18_000)
    expect(r.distM).toBeLessThan(19_500)
  })
  it('check-in até 15 min depois do fim da parada ainda conta como parado', () => {
    expect(pistaCheckIn(nf(), PARADAS, '2026-10-20T10:40:00.000Z').parado).toBe(true)
  })
  it('check-in fora de parada: sem caminhão parado, sem distância', () => {
    expect(pistaCheckIn(nf(), PARADAS, '2026-10-20T12:00:00.000Z')).toEqual({ hora: '12:00', parado: false, distM: null })
  })
  it('check-in durante parada na BASE não serve de pista de local', () => {
    expect(pistaCheckIn(nf(), PARADAS, '2026-10-20T14:40:00.000Z')).toEqual({ hora: '14:40', parado: false, distM: null })
  })
  it('sem ponto do cliente: parado, sem distância', () => {
    expect(pistaCheckIn(nf({ lat: null, lng: null }), PARADAS, '2026-10-20T09:29:58.000Z')).toEqual({ hora: '09:29', parado: true, distM: null })
  })
})

describe('investigarPlacas com check-in (F4-10)', () => {
  const placa = (nfs: NfAoVivo[]): PlacaAoVivo => ({ placa: 'LPH6E20', nfs } as unknown as PlacaAoVivo)

  it('não entregue com check-in: a pista entra na investigação e na frase, sem mudar status nem categoria', () => {
    const n = nf()
    const sem = nf()
    investigarPlacas([placa([sem])], new Map([['LPH6E20', PARADAS]]))
    investigarPlacas([placa([n])], new Map([['LPH6E20', PARADAS]]), new Map(), new Map([['6069736', '2026-10-20T09:29:58.000Z']]))
    expect(n.status).toBe(sem.status)
    expect(n.situacao).toBe('revisar')
    expect(n.investigacao!.categoria).toBe(sem.investigacao!.categoria)
    expect(n.investigacao!.pistaCheckIn).toMatchObject({ hora: '09:29', parado: true })
    expect(fraseInvestigacao(n.investigacao!)).toMatch(/Pista da Fusion: check-in às 09:29 com o caminhão parado a 1\d(,\d)? km do ponto \(não confirma entrega\)\./)
  })

  it('entregue não ganha investigação nem pista', () => {
    const n = nf({ situacao: 'entregue', status: 'ENTREGUE' })
    investigarPlacas([placa([n])], new Map([['LPH6E20', PARADAS]]), new Map(), new Map([['6069736', '2026-10-20T09:29:58.000Z']]))
    expect(n.investigacao).toBeUndefined()
  })

  it('check-in fora de parada: frase diz que o caminhão não estava parado', () => {
    const n = nf()
    investigarPlacas([placa([n])], new Map([['LPH6E20', PARADAS]]), new Map(), new Map([['6069736', '2026-10-20T12:00:00.000Z']]))
    expect(fraseInvestigacao(n.investigacao!)).toContain('Pista da Fusion: check-in às 12:00 sem o caminhão parado.')
  })

  it('sem check-in: frase igual à de antes', () => {
    const a = nf(); const b = nf()
    investigarPlacas([placa([a])], new Map([['LPH6E20', PARADAS]]))
    investigarPlacas([placa([b])], new Map([['LPH6E20', PARADAS]]), new Map(), new Map())
    expect(fraseInvestigacao(b.investigacao!)).toBe(fraseInvestigacao(a.investigacao!))
    expect(b.investigacao!.pistaCheckIn).toBeUndefined()
  })
})
