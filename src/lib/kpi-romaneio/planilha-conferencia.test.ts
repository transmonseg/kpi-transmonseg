import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import type { NfAoVivo } from './ao-vivo'
import type { ItemFila } from './fila-conferir'
import { motivoLegivel } from './fila-conferir'
import { COLUNAS_REVISAO, linhasRevisao, grupoRevisao, montarPlanilhaConferencia } from './planilha-conferencia'

// F3-03: exportação da fila no layout da planilha da Érica
// (revisao-passagens-14-10-INVESTIGADA.xlsx: abas RESUMO, REVISAO PASSAGENS e
// CRITERIOS; 10 colunas de PLACA a EVIDÊNCIA / OBSERVAÇÃO).

const nf = (x: Partial<NfAoVivo>): NfAoVivo => ({ nf: '1', carga: '100080', cliente: 'CLIENTE', endereco: 'RUA AQ, 2 - JARDIM ANHANGA - *', status: 'ENTREGUE', situacao: 'revisar', chegada: null, saida: null, tempoMin: null, lat: null, lng: null, ...x })
const item = (n: NfAoVivo, placa: string, extra: Partial<ItemFila> = {}): ItemFila => ({ placa, nf: n, daPlaca: [n], motivo: motivoLegivel(n.status), titulo: null, frase: null, resolucao: null, ...extra })

// 14/10 (casos da planilha dela) e 22/10 (fila).
const passouLonge = item(nf({ nf: '2423801', status: 'PASSOU A 500m-2km SEM PARAR - CONFERIR', cliente: 'MERCEARIA E ACOUGUE DO PARAZAO' }), 'RQS7H76')
const passouNoEndereco = item(nf({ nf: '2423004', carga: '100054', status: 'PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR', cliente: 'CASA DE CARNE SO FILE' }), 'RQV3J99')
const naoFoi = item(nf({ nf: '2421760', carga: '100010', situacao: 'nao_foi', status: 'NÃO FOI AO CLIENTE (caminhão não esteve na região)', cliente: 'MERCADINHO  XAVIER' }), 'RBG8J72')
const paradaOutro = item(nf({ nf: '2437979', carga: '100700', status: 'PARADA DE OUTRO CLIENTE - NÃO CONFIRMA ESTE CLIENTE - CONFERIR', cliente: 'MERCADO DO PORTUGA', investigacao: { categoria: 'parou_no_cliente', distM: 14, hora: '09:16', minutos: 4 } }), 'RQV5F64', {
  titulo: 'Parou no cliente (até 150 m)', frase: 'Parada mais perto: 14 m do cliente às 09:16 (4 min).',
  resolucao: { id: 1, nf: '2437979', resolucao: 'entregue', responsavel: 'erica@transmonseg.com.br', criadoEm: '2026-10-23T13:05:00.000Z', observacao: 'canhoto assinado', placaExecutora: null, temComprovante: true },
})

describe('planilha da conferência no layout da Érica', () => {
  it('as 10 colunas dela, na mesma ordem', () => {
    expect(COLUNAS_REVISAO).toEqual(['PLACA', 'NF', 'CLIENTE', 'ENDEREÇO ROMANEIO', 'CARGA', 'CLASSIFICAÇÃO ORIGINAL', 'GRUPO DE REVISÃO', 'CLASSIFICAÇÃO PROPOSTA', 'STATUS VALIDAÇÃO', 'EVIDÊNCIA / OBSERVAÇÃO'])
  })

  it('grupos de revisão dela pelo rótulo do KPI; o resto pelo GPS', () => {
    expect(grupoRevisao(passouNoEndereco)).toBe('Passagem registrada no KPI')
    expect(grupoRevisao(passouLonge)).toBe('Passagem próxima')
    expect(grupoRevisao(naoFoi)).toBe('Revisar localização')
    expect(grupoRevisao(paradaOutro)).toBe('Parou no cliente (até 150 m)')
  })

  it('linha: rótulo original intacto, status da validação e evidência com quem conferiu', () => {
    const [a, b] = linhasRevisao([passouNoEndereco, paradaOutro])
    expect(a).toEqual(['RQV3J99', '2423004', 'CASA DE CARNE SO FILE', 'RUA AQ, 2 - JARDIM ANHANGA', '100054', 'PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR', 'Passagem registrada no KPI', 'Passagem reconhecida — confirmar parada e entrega', 'Pendente de validação', ''])
    expect(b[5]).toBe('PARADA DE OUTRO CLIENTE - NÃO CONFIRMA ESTE CLIENTE - CONFERIR')
    expect(b[8]).toBe('Entregue (comprovante)')
    expect(b[9]).toBe('Parada mais perto: 14 m do cliente às 09:16 (4 min). Conferido por erica@transmonseg.com.br em 23/10 10:05: canhoto assinado. Comprovante anexado no sistema.')
  })

  it('arquivo com as três abas, título dela e as duas taxas separadas (D-06)', async () => {
    const wb = montarPlanilhaConferencia(ExcelJS, {
      nomeCliente: 'Nutry Max', data: '2026-10-22', itens: [passouLonge, passouNoEndereco, naoFoi, paradaOutro],
      taxaOficial: { taxa: 96.9, confirmadas: 2183, naConta: 2253 }, taxaApos: { taxa: 97, confirmadas: 2186, naConta: 2253, conferidas: 3 },
    })
    expect(wb.worksheets.map(w => w.name)).toEqual(['RESUMO', 'REVISAO PASSAGENS', 'CRITERIOS'])
    const rev = wb.getWorksheet('REVISAO PASSAGENS')!
    expect(rev.getCell('A1').value).toBe('KPI 22/10/2026 | CONFERÊNCIA DE PASSAGENS')
    expect((rev.getRow(4).values as unknown[]).slice(1)).toEqual([...COLUNAS_REVISAO])
    expect(rev.getCell('B5').value).toBe('2423801')
    expect(rev.rowCount).toBe(8)
    const resumo = wb.getWorksheet('RESUMO')!
    const textos: string[] = []
    resumo.eachRow(r => textos.push((r.values as unknown[]).slice(1).map(v => (v && typeof v === 'object' && 'formula' in v ? `=${(v as { formula: string }).formula}` : String(v ?? ''))).join(' | ')))
    expect(resumo.getCell('A1').value).toBe('TRANSMONSEG | KPI NUTRY MAX — 22/10/2026')
    expect(textos).toContain('Taxa oficial (GPS) | 96,9% (2.183 de 2.253)')
    expect(textos).toContain('Taxa após conferência da operação | 97,0% (2.186 de 2.253; 3 notas conferidas)')
    expect(textos).toContain(`Passagem próxima | =COUNTIF('REVISAO PASSAGENS'!G5:G8,"Passagem próxima")`)
    // Ida e volta pelo arquivo (o navegador baixa o buffer).
    const buf = await wb.xlsx.writeBuffer()
    const lido = new ExcelJS.Workbook()
    await lido.xlsx.load(buf as ArrayBuffer)
    expect(lido.getWorksheet('REVISAO PASSAGENS')!.getCell('I8').value).toBe('Entregue (comprovante)')
  })
})
