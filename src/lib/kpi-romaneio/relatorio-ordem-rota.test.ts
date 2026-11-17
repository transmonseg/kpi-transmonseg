import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { aplicarOrdemRota } from './ordem-rota'
import { montarRelatorioOrdemRota, resumoOrdemDashboard, kmDaViagem, filtrarRelatorio, filtrosDaUrl, filtrosParaUrl, descreverFiltros } from './relatorio-ordem-rota'
import { gerarXlsxOrdemRota } from './relatorio-ordem-rota-xlsx'

const nf = (nf: string, chegada: string | null, situacao = 'entregue') => ({ nf, carga: 'C1', cliente: `CLIENTE ${nf}`, endereco: `RUA ${nf}`, chegada, saida: chegada, tempoMin: 7, situacao })
const dia = (data: string) => {
  const r = {
    calculadoEm: 'c',
    placas: [
      { placa: 'AAA1A11', motorista: 'JOAO', destino: 'NORTE', saidaBase: `${data}T09:10:00Z`, chegadaBase: `${data}T18:00:00Z`, km: 82.4, nfs: [nf('1', '08:00'), nf('2', '10:00'), nf('3', '09:00'), nf('4', '11:30'), nf('5', null, 'nao_foi')] },
      { placa: 'BBB2B22', motorista: 'MARIA', destino: 'SUL', nfs: [nf('6', '08:00'), nf('7', '09:00'), nf('8', '10:00'), nf('9', '11:00')] },
    ],
  }
  const plano = [
    ...['1', '2', '3', '4', '5'].map((n, i) => ({ nf: n, romaneio: 'R1', ordem: i + 1, previsaoInicio: `${data} ${String(8 + i).padStart(2, '0')}:00:00` })),
    ...['9', '8', '7', '6'].map((n, i) => ({ nf: n, romaneio: 'R2', ordem: i + 1, previsaoInicio: null })),
  ]
  return { data, plano: plano.map(p => ({ nf: p.nf, romaneio: p.romaneio, ordem: p.ordem })), placas: aplicarOrdemRota(r, plano).placas as never }
}

describe('montarRelatorioOrdemRota', () => {
  const r = montarRelatorioOrdemRota([dia('2026-11-12'), dia('2026-11-13')], '2026-11-12', '2026-11-13')
  it('total, por dia e viagens', () => {
    // por dia: João 3/4, Maria 1/4 (invertida) -> 4/8
    expect(r.total).toMatchObject({ entregas: 16, naOrdem: 8, pct: 50, viagens: 4, invertidas: 2 })
    expect(r.dias).toEqual([{ data: '2026-11-12', entregas: 8, naOrdem: 4, pct: 50, viagens: 2 }, { data: '2026-11-13', entregas: 8, naOrdem: 4, pct: 50, viagens: 2 }])
    const joao = r.viagens.find(v => v.placa === 'AAA1A11')!
    expect(joao).toMatchObject({ entregas: 4, naOrdem: 3, pct: 75, invertida: false, naoFeitas: 1, motorista: 'JOAO', saidaBase: '06:10', chegadaBase: '15:00', km: 82.4, primeira: '08:00', ultima: '11:30' })
    // a 3ª planejada foi feita cedo demais (pulou a 2ª) -> é ela que fica fora da ordem.
    expect(joao.sequencia.map(s => [s.real, s.planejada, s.naOrdem, s.chegada, s.tempoMin, s.endereco])).toEqual([[1, 1, true, '08:00', 7, 'RUA 1'], [2, 3, false, '09:00', 7, 'RUA 3'], [3, 2, true, '10:00', 7, 'RUA 2'], [4, 4, true, '11:30', 7, 'RUA 4']])
    expect(joao.naoFeitasLista).toEqual([{ planejada: 5, nf: '5', cliente: 'CLIENTE 5', endereco: 'RUA 5', situacao: 'nao_foi' }])
  })
  it('ranking de motoristas: pior primeiro', () => {
    expect(r.motoristas.map(m => [m.nome, m.pct, m.viagens, m.invertidas, m.naoFeitas])).toEqual([['MARIA', 25, 2, 2, 0], ['JOAO', 75, 2, 0, 2]])
    expect(r.placas[0]).toMatchObject({ nome: 'BBB2B22', sub: 'MARIA' })
  })
  it('km a mais: ordem feita x ordem do plano, em linha reta', () => {
    // plano 1-2-3 numa reta (0, 1, 2 km); feito 1-3-2 = 2 + 1 = 3 km contra 2 km
    const p = (planejada: number, x: number) => ({ planejada, lat: 0, lng: x / 111.195 })
    expect(kmDaViagem([p(1, 0), p(3, 2), p(2, 1)])).toEqual({ kmFeito: 3, kmPlano: 2, kmExtra: 1, kmMelhor: 2 })
    // plano ziguezague (0, 4, 1, 3, 2 km): melhor ordem é a reta 0..4 = 4 km
    expect(kmDaViagem([p(1, 0), p(2, 4), p(3, 1), p(4, 3), p(5, 2)])).toMatchObject({ kmPlano: 10, kmMelhor: 4 })
    // sem ponto confiável da maioria: não calcula
    expect(kmDaViagem([p(1, 0), { planejada: 2 }, { planejada: 3 }, p(4, 3)])).toBeNull()
    // ponto de cadastro errado (1.000 km) fica de fora; a parada real do GPS vale mais que o ponto do cliente
    expect(kmDaViagem([p(1, 0), p(3, 2), p(2, 1), { planejada: 4, lat: 9, lng: 0 }])).toEqual({ kmFeito: 3, kmPlano: 2, kmExtra: 1, kmMelhor: 2 })
    expect(kmDaViagem([p(1, 0), { ...p(3, 50), parada: { lat: 0, lng: 2 / 111.195 } }, p(2, 1)])).toEqual({ kmFeito: 3, kmPlano: 2, kmExtra: 1, kmMelhor: 2 })
  })
  it('clientes fora da ordem e recorrência do motorista', () => {
    expect(r.clientes[0]).toMatchObject({ fora: 2, vezes: 2, pctFora: 100, motoristas: 1 })
    const maria = r.motoristas.find(m => m.nome === 'MARIA')!
    expect(maria.porDia).toEqual([{ data: '2026-11-12', pct: 25 }, { data: '2026-11-13', pct: 25 }])
    expect(maria.diasAbaixo).toBe(2)
    expect(r.motoristas.find(m => m.nome === 'JOAO')!.diasAbaixo).toBe(0)
  })
  it('resumo do Dashboard: fila só com a posição no plano, sem endereço', () => {
    const d = resumoOrdemDashboard(r)
    const joao = d.viagens.find(v => v.placa === 'AAA1A11')!
    expect(joao.fila).toEqual([[1, true], [3, false], [2, true], [4, true]])
    expect(joao.naoFeitas).toEqual([5])
    expect(JSON.stringify(d)).not.toContain('RUA ')
    expect(d.total).toEqual(r.total)
  })
  it('vazio não quebra', () => {
    expect(montarRelatorioOrdemRota([], '2026-11-12', '2026-11-12').total).toEqual({ entregas: 0, naOrdem: 0, pct: 0, viagens: 0, invertidas: 0, kmExtra: 0, viagensComKm: 0, maisLongas: 0, maisCurtas: 0, kmFeitoTotal: 0, kmPlanoTotal: 0, kmMelhorTotal: 0 })
  })

  describe('filtros (14/11: "só um motorista ou só tal horário")', () => {
    it('só um motorista', () => {
      const f = filtrarRelatorio(r, { motoristas: ['JOAO'] })
      expect(f.viagens.every(v => v.motorista === 'JOAO')).toBe(true)
      expect(f.total).toMatchObject({ entregas: 8, naOrdem: 6, viagens: 2 })
      expect(f.motoristas.map(m => m.nome)).toEqual(['JOAO'])
    })
    it('faixa de horário: só as entregas que chegaram no horário, veredito da viagem mantido', () => {
      const f = filtrarRelatorio(r, { motoristas: ['JOAO'], horaDe: '08:30', horaAte: '10:00' })
      const v = f.viagens[0]
      expect(v.sequencia.map(s => [s.chegada, s.naOrdem])).toEqual([['09:00', false], ['10:00', true]])
      expect(v).toMatchObject({ entregas: 2, naOrdem: 1, pct: 50 })
    })
    it('só fora da ordem e só de trás pra frente', () => {
      expect(filtrarRelatorio(r, { soForaDaOrdem: true }).viagens.flatMap(v => v.sequencia).every(s => !s.naOrdem)).toBe(true)
      expect(filtrarRelatorio(r, { soInvertidas: true }).viagens.map(v => v.placa)).toEqual(['BBB2B22', 'BBB2B22'])
    })
    it('sem filtro devolve o mesmo; filtro que não pega nada dá zero', () => {
      expect(filtrarRelatorio(r, {})).toBe(r)
      expect(filtrarRelatorio(r, { placas: ['XXX0X00'] }).total.viagens).toBe(0)
    })
    it('URL ida e volta, e a descrição pro Excel', () => {
      const f = { motoristas: ['JOAO', 'MARIA'], placas: ['AAA1A11'], horaDe: '08:00', horaAte: '12:00', soForaDaOrdem: true, soInvertidas: false }
      expect(filtrosDaUrl(new URLSearchParams(filtrosParaUrl(f)))).toEqual(f)
      expect(descreverFiltros(f)).toBe('Motorista: JOAO, MARIA · Placa: AAA1A11 · Horário de chegada: 08:00–12:00 · Só entregas fora da ordem')
      expect(descreverFiltros({})).toBe('Sem filtro (todas as viagens)')
    })
  })

  it('planilha: 6 abas, tabelas com filtro, hora de verdade, fora da ordem marcado', async () => {
    const buf = await gerarXlsxOrdemRota(filtrarRelatorio(r, { motoristas: ['JOAO'] }), 'Motorista: JOAO')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer)
    expect(wb.worksheets.map(w => w.name)).toEqual(['Resumo', 'Motoristas', 'Placas', 'Viagens', 'Entregas', 'Clientes fora da ordem', 'Não entregues'])
    const e = wb.getWorksheet('Entregas')!
    expect(String(e.getCell('A2').value)).toMatch(/Motorista: JOAO/)
    const cab = (e.getRow(4).values as unknown[]).slice(1)
    expect(cab).toEqual(['Dia', 'Placa', 'Motorista', 'Romaneio', 'Feita como', 'Era a', 'Situação', 'Chegou', 'Saiu', 'Min. no cliente', 'Cliente', 'Endereço', 'NF', 'Carga'])
    const linhas = Array.from({ length: 8 }, (_, i) => e.getRow(5 + i))
    expect(linhas.map(l => l.getCell(3).value)).toEqual(Array(8).fill('JOAO'))
    expect((linhas[0].getCell(8).value as Date).toISOString()).toBe('1899-12-30T08:00:00.000Z') // 08:00 como hora do Excel
    expect(linhas[0].getCell(8).numFmt).toBe('hh:mm')
    expect(linhas.filter(l => l.getCell(7).value === 'FORA DA ORDEM')).toHaveLength(2)
    expect(e.getTables?.().length ?? 1).toBeGreaterThan(0)
    expect(wb.getWorksheet('Não entregues')!.getRow(5).getCell(7).value).toBe('CLIENTE 5')
  })
})
