import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { aplicarOrdemRota } from './ordem-rota'
import { montarRelatorioOrdemRota } from './relatorio-ordem-rota'
import { gerarXlsxOrdemRota } from './relatorio-ordem-rota-xlsx'

const nf = (nf: string, chegada: string | null, situacao = 'entregue') => ({ nf, cliente: `CLIENTE ${nf}`, chegada, situacao })
const dia = (data: string) => {
  const r = {
    calculadoEm: 'c',
    placas: [
      { placa: 'AAA1A11', motorista: 'JOAO', destino: 'NORTE', nfs: [nf('1', '08:00'), nf('2', '10:00'), nf('3', '09:00'), nf('4', '11:30'), nf('5', null, 'nao_foi')] },
      { placa: 'BBB2B22', motorista: 'MARIA', destino: 'SUL', nfs: [nf('6', '08:00'), nf('7', '09:00'), nf('8', '10:00'), nf('9', '11:00')] },
    ],
  }
  const plano = [
    ...['1', '2', '3', '4', '5'].map((n, i) => ({ nf: n, romaneio: 'R1', ordem: i + 1, previsaoInicio: `${data} ${String(8 + i).padStart(2, '0')}:00:00` })),
    ...['9', '8', '7', '6'].map((n, i) => ({ nf: n, romaneio: 'R2', ordem: i + 1, previsaoInicio: null })),
  ]
  return { data, planejadas: { R1: 5, R2: 4 }, placas: aplicarOrdemRota(r, plano).placas as never }
}

describe('montarRelatorioOrdemRota', () => {
  const r = montarRelatorioOrdemRota([dia('2026-11-12'), dia('2026-11-13')], '2026-11-12', '2026-11-13')
  it('total, por dia e viagens', () => {
    // por dia: João 3/4, Maria 1/4 (invertida) -> 4/8
    expect(r.total).toMatchObject({ entregas: 16, naOrdem: 8, pct: 50, viagens: 4, invertidas: 2 })
    expect(r.dias).toEqual([{ data: '2026-11-12', entregas: 8, naOrdem: 4, pct: 50, viagens: 2 }, { data: '2026-11-13', entregas: 8, naOrdem: 4, pct: 50, viagens: 2 }])
    const joao = r.viagens.find(v => v.placa === 'AAA1A11')!
    expect(joao).toMatchObject({ entregas: 4, naOrdem: 3, pct: 75, invertida: false, naoFeitas: 1, motorista: 'JOAO' })
    // sequência na ordem real; a 3ª planejada foi feita cedo demais (pulou a
    // 2ª) -> é ela que fica fora da ordem.
    expect(joao.sequencia.map(s => [s.real, s.planejada, s.naOrdem, s.previsao])).toEqual([[1, 1, true, '08:00'], [2, 3, false, '10:00'], [3, 2, true, '09:00'], [4, 4, true, '11:00']])
  })
  it('ranking de motoristas: pior primeiro', () => {
    expect(r.motoristas.map(m => [m.nome, m.pct, m.viagens, m.invertidas])).toEqual([['MARIA', 25, 2, 2], ['JOAO', 75, 2, 0]])
    expect(r.placas[0]).toMatchObject({ nome: 'BBB2B22', sub: 'MARIA' })
  })
  it('vazio não quebra', () => {
    expect(montarRelatorioOrdemRota([], '2026-11-12', '2026-11-12').total).toEqual({ entregas: 0, naOrdem: 0, pct: 0, viagens: 0, invertidas: 0 })
  })
  it('planilha com as 5 abas', () => {
    const wb = XLSX.read(gerarXlsxOrdemRota(r), { type: 'buffer' })
    expect(wb.SheetNames).toEqual(['Resumo', 'Motoristas', 'Placas', 'Viagens', 'Sequência'])
    const seq = XLSX.utils.sheet_to_json(wb.Sheets['Sequência'], { header: 1 }) as unknown[][]
    expect(seq.length).toBe(1 + 16)
    expect(seq.some(l => l[6] === 'FORA DA ORDEM')).toBe(true)
  })
})
