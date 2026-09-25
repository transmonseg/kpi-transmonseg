import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { agregarPorCarga, montarDetalheEntregas } from '@/lib/kpi-romaneio/agregacao'
import { gerarKpiRomaneioXlsx } from '@/lib/kpi-romaneio/gerador-xlsx'
import type { LinhaGeocodificada } from '@/lib/kpi-romaneio/types'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

// Revisao final pre-deploy (24/09, item 1): regressao do Rio Quality com
// placa sem CV. Reproduz EXATAMENTE a forma como kpi-rioquality/pipeline.ts
// chama agregarPorCarga/montarDetalheEntregas/gerarKpiRomaneioXlsx (sem
// alvos, so' as paradas da propria placa, sem os parametros opt-in da Nutry
// Max) e fixa o resultado de 108b4bb: observacao nula, STATUS "PLACA SEM
// RASTREADOR CADASTRADO - COMPLETAR FROTA" e nenhuma linha de TAXA.

function linha(nf: string, placa: string): LinhaGeocodificada {
  return {
    carga: 'R1', destino: 'RIO', placa, motorista: 'MOT', ajudantes: [],
    nf, clienteCodigo: `C${nf}`, clienteNome: `CLIENTE ${nf}`, endereco: `RUA ${nf}`,
    lat: -22.9, lng: -43.2,
  }
}

async function gerarComoRioQuality(placa: string, temRastreador: boolean, paradas: UnitracParadaRow[]) {
  const linhas = [linha('1', placa), linha('2', placa)]
  const resumo = agregarPorCarga('R1', placa, linhas, null, [], new Map(), paradas, null, undefined, temRastreador)
  const detalhe = montarDetalheEntregas(
    'R1', placa, linhas, [], new Map(),
    { motorista: resumo.motorista, saidaCd: resumo.saidaCd, chegadaCd: resumo.chegadaCd, tempoOperacaoMin: resumo.tempoOperacaoMin },
    temRastreador,
    new Map([[placa, paradas]]),
    resumo.kmPercorrido ?? null,
  )
  const xlsx = await gerarKpiRomaneioXlsx([resumo], '2026-09-20', [], detalhe, undefined, 'RIO QUALITY')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(xlsx as never)
  return { detalhe, wb }
}

function textos(ws: ExcelJS.Worksheet): string[] {
  const out: string[] = []
  ws.eachRow(r => r.eachCell(c => { if (typeof c.value === 'string') out.push(c.value) }))
  return out
}

describe('Rio Quality -- regressao placa sem CV (revisao final 24/09, item 1)', () => {
  it('placa sem CV: observacao nula, STATUS "PLACA SEM RASTREADOR CADASTRADO - COMPLETAR FROTA", sem linha de TAXA', async () => {
    const { detalhe, wb } = await gerarComoRioQuality('RQX1A11', false, [])

    for (const d of detalhe) {
      expect(d.status).toBe('pendente')
      expect(d.observacao).toBeNull()
    }
    const aba = wb.getWorksheet('RQX1A11')!
    const status = [4, 5].map(r => aba.getRow(r).getCell(8).value)
    expect(status).toEqual([
      'PLACA SEM RASTREADOR CADASTRADO - COMPLETAR FROTA',
      'PLACA SEM RASTREADOR CADASTRADO - COMPLETAR FROTA',
    ])
    const principal = textos(wb.worksheets[0])
    expect(principal.some(t => t.includes('TAXA DE CONFIRMAÇÃO'))).toBe(false)
    expect(principal.some(t => t.includes('NFs sem rastreador'))).toBe(false)
    expect(principal.some(t => t.includes('NFs aguardando'))).toBe(false)
  })

  it('placa COM CV mas nenhuma posicao no dia: rotulo antigo "NENHUMA POSIÇÃO REPORTADA" (108b4bb), nunca o "NÃO CONTABILIZADO" da Nutry Max', async () => {
    const { detalhe } = await gerarComoRioQuality('RQX2B22', true, [])
    for (const d of detalhe) {
      expect(d.observacao).toBe('SEM RASTREADOR - NENHUMA POSIÇÃO REPORTADA NO DIA - CONFERIR EQUIPAMENTO')
    }
  })
})
