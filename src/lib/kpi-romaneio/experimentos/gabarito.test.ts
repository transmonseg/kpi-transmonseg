import { describe, it, expect } from 'vitest'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { DumpExperimento, LinhaDump } from './tipos'
import { avaliarContraGabarito, type RotuloGabarito } from './gabarito'

const P = { duracaoMinSeg: 120, raioReivindicadaM: 800 }

function linha(o: Partial<LinhaDump>): LinhaDump {
  return {
    nf: 'NF', carga: '100', placa: 'ABC1234', clienteNome: 'C', endereco: 'RUA', lat: -22.9, lng: -43.2,
    geoConfiavel: true, geoMotivo: null, status: 'pendente', observacao: null, ...o,
  }
}

const ORFA: UnitracParadaRow = {
  id: 'S2', placa_norm: 'ABC1234', chegada: '2026-09-17T13:00:00.000Z', saida: '2026-09-17T13:10:00.000Z',
  fim_real: '2026-09-17T13:10:00.000Z', duracao_seg: 600, local_parada: 'RUA', codigo_loja: null,
  nome_loja: null, lat: -22.91, lng: -43.2, endereco: null, classificacao: 'FORA_BASE', ordem: 1,
}

const dump: DumpExperimento = {
  data: '2026-09-17',
  linhas: [
    linha({ nf: 'C1', status: 'confirmado_gps' }),
    linha({ nf: 'E1', lat: -22.9108 }),          // pendente, entregue no gabarito, com orfa por perto
    linha({ nf: 'S1', lat: -22.9109 }),          // pendente, sem_evidencia no gabarito, com orfa por perto (falso confirmado)
    linha({ nf: 'E2', lat: -22.99 }),            // pendente, entregue, sem orfa por perto
  ],
  paradasPorPlaca: { ABC1234: [ORFA] },
}

const gab = (nf: string, veredito: RotuloGabarito['veredito'], data = '2026-09-17'): RotuloGabarito => ({ data, nf, veredito, fonte: 't' })

describe('avaliarContraGabarito', () => {
  it('mede recall das entregues e falso-confirmado das sem evidência', () => {
    const r = avaliarContraGabarito([dump], [gab('E1', 'entregue'), gab('E2', 'entregue'), gab('S1', 'sem_evidencia')], P, 500)
    expect(r).toEqual({
      raioM: 500, entregueTotal: 2, entregueComOrfa: 1, semEvidenciaTotal: 1, semEvidenciaComOrfa: 1,
      jaConfirmadaCorreta: 0, jaConfirmadaFalsa: 0, naoEncontradas: 0,
    })
  })

  it('separa já confirmadas em correta/falsa e conta NFs não encontradas', () => {
    const r = avaliarContraGabarito([dump], [gab('C1', 'entregue'), gab('C1', 'sem_evidencia'), gab('NAO-EXISTE', 'entregue')], P, 500)
    expect(r.jaConfirmadaCorreta).toBe(1)
    expect(r.jaConfirmadaFalsa).toBe(1)
    expect(r.naoEncontradas).toBe(1)
    expect(r.entregueTotal).toBe(0)
  })

  it('casa por NF mesmo quando a data do rótulo difere da do dump', () => {
    const r = avaliarContraGabarito([dump], [gab('E1', 'entregue', '2026-09-18')], P, 500)
    expect(r.entregueTotal).toBe(1)
    expect(r.entregueComOrfa).toBe(1)
    expect(r.naoEncontradas).toBe(0)
  })
})
