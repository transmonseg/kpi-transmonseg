import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseOrdemRota, ehRelatorioOrdemRota, dataDaPrevisao } from './parse-ordem-rota'
import { parseEntregasCompletas } from './parse-planilhas'

const buf = readFileSync(join(__dirname, '__fixtures__', 'relatorio-ordem-rota.xlsx'))

describe('relatório de entregas com ORDEM (Fusion RQ, 12/11)', () => {
  it('reconhece o formato', () => {
    expect(ehRelatorioOrdemRota(buf)).toBe(true)
    expect(ehRelatorioOrdemRota(Buffer.from('nada'))).toBe(false)
  })
  it('lê placa, romaneio, ordem, NF e previsão por entrega', () => {
    const l = parseOrdemRota(buf)
    expect(l.length).toBe(74)
    expect(l[0]).toEqual({ nf: '5597459', romaneio: '1179326', placa: 'RIQ4G11', ordem: 1, previsaoInicio: '12/11/2026 14:44:29', previsaoFim: '12/11/2026 14:54:29', data: '2026-11-12' })
    expect(new Set(l.map(x => x.romaneio)).size).toBe(3)
    expect(l.every(x => x.placa.length === 7 && x.ordem > 0)).toBe(true)
  })
  it('o leitor do romaneio do dia não lê este arquivo (por isso a rota testa a ordem antes)', () => {
    let lidas: unknown[] = []
    try { lidas = parseEntregasCompletas(buf) } catch { lidas = [] }
    expect(lidas).toEqual([])
  })
})

describe('reconhecimento na área "Solte os arquivos do dia" (12/11: antes dava "não reconheci")', () => {
  it('vira "Ordem da rota da Rio Quality", campo próprio', async () => {
    const { reconhecerArquivo, cabeNoAoVivo } = await import('@/lib/kpi-romaneio/reconhecer-arquivo')
    const a = await reconhecerArquivo(buf, 'Relatório de Entregas.xlsx')
    expect(a.tipo).toBe('rq_ordem_rota')
    expect(a.campo).toBe('ordemRota')
    expect(a.contagens).toEqual({ notas: 74, placas: 3, romaneios: 3 })
    expect(cabeNoAoVivo(a, 'rioquality')).toBe(true)
    expect(cabeNoAoVivo(a, 'nutrimax')).toBe(false)
  })
  it('a ordem pode ir sozinha no envio da RQ', async () => {
    const { montarEnvio } = await import('@/app/painel/ao-vivo/arquivos-do-dia')
    const file = new File([new Uint8Array(buf)], 'r.xlsx')
    const item = { id: '1', file, info: { nome: 'r', tipo: 'rq_ordem_rota' as const, cliente: 'rioquality' as const, campo: 'ordemRota' as const, data: null, contagens: {}, resumo: '', serve: true } }
    expect(montarEnvio([item], 'rioquality', false)).toMatchObject({ podeEnviar: true, falta: null })
  })
})

describe('dataDaPrevisao', () => {
  it('lê a data e descarta lixo (24/09/2083 veio no relatório real)', () => {
    expect(dataDaPrevisao('12/11/2026 14:44:29')).toBe('2026-11-12')
    expect(dataDaPrevisao('24/09/2083 10:00:00')).toBe('2083-09-24')
    expect(dataDaPrevisao('24/09/2183 10:00:00')).toBeNull()
    expect(dataDaPrevisao(null)).toBeNull()
  })
})
