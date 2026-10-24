// F3-03 (ACH-02): exportação da fila "Conferir" no layout da planilha que a
// Érica montava à mão (revisao-passagens-14-10-INVESTIGADA.xlsx): abas RESUMO,
// REVISAO PASSAGENS (10 colunas) e CRITERIOS. O ExcelJS entra como parâmetro:
// no navegador ele só carrega no clique; no teste vem direto.
import type ExcelJSNs from 'exceljs'
import type { ItemFila } from './fila-conferir'
import { rotuloResolucao } from './fila-conferir'

export const COLUNAS_REVISAO = ['PLACA', 'NF', 'CLIENTE', 'ENDEREÇO ROMANEIO', 'CARGA', 'CLASSIFICAÇÃO ORIGINAL', 'GRUPO DE REVISÃO', 'CLASSIFICAÇÃO PROPOSTA', 'STATUS VALIDAÇÃO', 'EVIDÊNCIA / OBSERVAÇÃO'] as const
const LARGURAS_REVISAO = [13, 13, 28, 52, 14, 42, 29, 52, 38, 100]

// Grupos e propostas com o texto dela (14/10).
const GRUPOS_DO_KPI: { prefixo: string; grupo: string; proposta: string }[] = [
  { prefixo: 'PASSOU NO ENDEREÇO', grupo: 'Passagem registrada no KPI', proposta: 'Passagem reconhecida — confirmar parada e entrega' },
  { prefixo: 'PASSOU A 500', grupo: 'Passagem próxima', proposta: 'Verificar endereço, distância e evidências da entrega' },
  { prefixo: 'NÃO FOI AO CLIENTE', grupo: 'Revisar localização', proposta: 'Verificar rastreamento e endereço do cliente' },
]
const PROPOSTA_GPS: Record<string, string> = {
  parou_no_cliente: 'Parada no cliente — confirmar entrega com comprovante',
  parou_perto: 'Parada perto do cliente — confirmar endereço e entrega com comprovante',
}

function grupoDoKpi(i: ItemFila) {
  return GRUPOS_DO_KPI.find(g => i.nf.status.toUpperCase().startsWith(g.prefixo)) ?? null
}

export function grupoRevisao(i: ItemFila): string {
  return grupoDoKpi(i)?.grupo ?? i.titulo ?? 'Conferir'
}

function proposta(i: ItemFila): string {
  const g = grupoDoKpi(i)
  if (g) return g.proposta
  const cat = i.nf.investigacao?.categoria
  return (cat && PROPOSTA_GPS[cat]) || 'Verificar evidências da entrega'
}

const enderecoLimpo = (e: string) => e.replace(/\s+-\s+\*(?=\s+-|\s*$)/g, '').replace(/\s{2,}/g, ' ').trim()
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')

function evidencia(i: ItemFila): string {
  const partes: string[] = []
  if (i.frase) partes.push(i.frase)
  const r = i.resolucao
  if (r) {
    partes.push(`Conferido por ${r.responsavel} em ${quando(r.criadoEm)}${r.observacao ? `: ${r.observacao.trim().replace(/\.$/, '')}` : ''}.`)
    if (r.temComprovante) partes.push('Comprovante anexado no sistema.')
  }
  return partes.join(' ')
}

export function linhasRevisao(itens: ItemFila[]): string[][] {
  return itens.map(i => [
    i.placa, i.nf.nf, i.nf.cliente, enderecoLimpo(i.nf.endereco), i.nf.carga, i.nf.status,
    grupoRevisao(i), proposta(i), i.resolucao ? rotuloResolucao(i.resolucao) : 'Pendente de validação', evidencia(i),
  ])
}

const pct = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const int = (n: number) => n.toLocaleString('pt-BR')
const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

export type DadosPlanilhaConferencia = {
  nomeCliente: string
  data: string
  itens: ItemFila[]
  taxaOficial: { taxa: number | null; confirmadas: number | null; naConta: number | null }
  taxaApos: { taxa: number | null; confirmadas: number; naConta: number; conferidas: number }
}

const NAVY = 'FF1E3A5F'

export function montarPlanilhaConferencia(ExcelJS: typeof ExcelJSNs, d: DadosPlanilhaConferencia): ExcelJSNs.Workbook {
  const wb = new ExcelJS.Workbook()
  const titulo = (ws: ExcelJSNs.Worksheet, faixa: string, texto: string, tamanho = 14) => {
    ws.mergeCells(faixa)
    const c = ws.getCell(faixa.split(':')[0])
    c.value = texto
    c.font = { bold: true, size: tamanho, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
  }
  const cabecalho = (r: ExcelJSNs.Row) => {
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } } })
  }
  const ultima = 4 + d.itens.length
  const grupos = [...new Set(linhasRevisao(d.itens).map(l => l[6]))]

  // RESUMO
  const resumo = wb.addWorksheet('RESUMO')
  resumo.columns = [38, 16, 14, 14, 14, 14].map(width => ({ width }))
  titulo(resumo, 'A1:F2', `TRANSMONSEG | KPI ${d.nomeCliente.toUpperCase()} — ${dataBR(d.data)}`)
  titulo(resumo, 'A4:F4', 'CONFERÊNCIA DA OPERAÇÃO — sem alteração do KPI original', 11)
  cabecalho(resumo.addRow(['INDICADOR', 'QUANTIDADE']))
  for (const g of grupos) resumo.addRow([g, { formula: `COUNTIF('REVISAO PASSAGENS'!G5:G${ultima},"${g}")` }])
  resumo.addRow(['TOTAL A REVISAR', d.itens.length > 0 ? { formula: `COUNTA('REVISAO PASSAGENS'!B5:B${ultima})` } : 0])
  resumo.addRow(['Conferidas pela operação', { formula: `COUNTIF('REVISAO PASSAGENS'!I5:I${Math.max(5, ultima)},"<>Pendente de validação")` }])
  resumo.addRow([])
  const o = d.taxaOficial, a = d.taxaApos
  resumo.addRow(['Taxa oficial (GPS)', o.taxa != null ? `${pct(o.taxa)}% (${int(o.confirmadas ?? 0)} de ${int(o.naConta ?? 0)})` : '—'])
  resumo.addRow(['Taxa após conferência da operação', a.taxa != null ? `${pct(a.taxa)}% (${int(a.confirmadas)} de ${int(a.naConta)}; ${int(a.conferidas)} ${a.conferidas === 1 ? 'nota conferida' : 'notas conferidas'})` : '—'])
  resumo.addRow([])
  const nota = resumo.addRow(['A taxa oficial é a do GPS e não muda com a conferência. "Entregue" só com canhoto ou foto anexados no sistema. Nenhuma NF foi reclassificada automaticamente.'])
  resumo.mergeCells(`A${nota.number}:F${nota.number + 1}`)
  nota.getCell(1).alignment = { wrapText: true, vertical: 'top' }

  // REVISAO PASSAGENS
  const rev = wb.addWorksheet('REVISAO PASSAGENS', { views: [{ state: 'frozen', ySplit: 4 }] })
  rev.columns = LARGURAS_REVISAO.map(width => ({ width }))
  titulo(rev, 'A1:J2', `KPI ${dataBR(d.data)} | CONFERÊNCIA DE PASSAGENS`)
  rev.mergeCells('A3:J3')
  rev.getCell('A3').value = 'Prioridade: confirmar passagem, parada e entrega. Entregue só com comprovante anexado; a taxa oficial não muda.'
  rev.getCell('A3').font = { italic: true }
  cabecalho(rev.addRow([...COLUNAS_REVISAO]))
  for (const l of linhasRevisao(d.itens)) rev.addRow(l).alignment = { vertical: 'top', wrapText: true }
  rev.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: COLUNAS_REVISAO.length } }

  // CRITERIOS (os dela)
  const crit = wb.addWorksheet('CRITERIOS')
  crit.columns = [26, 60, 66].map(width => ({ width }))
  titulo(crit, 'A1:D2', 'CRITÉRIOS PARA CONFERÊNCIA')
  cabecalho(crit.addRow([]))
  crit.getRow(4).values = ['ETAPA', 'EVIDÊNCIA NECESSÁRIA', 'ENCAMINHAMENTO']
  cabecalho(crit.getRow(4))
  for (const l of [
    ['Passagem no endereço', 'Registro GPS no endereço real ou em distância tecnicamente consistente', 'Corrigir “não esteve na região” quando demonstrado'],
    ['Parada no endereço', 'Trajeto/parada Unitrac e tempo de permanência', 'Marcar parada confirmada; investigar entrega'],
    ['Entrega efetiva', 'Comprovante de entrega (canhoto ou foto) anexado', 'Marcar "Entregue — tenho comprovante" somente se houver prova'],
    ['Cadastro divergente', 'Endereço romaneio vs. cadastro Unitrac e referência local', 'Marcar "Ponto do cliente errado"; corrigir o ponto'],
    ['Sem evidências', 'Registro insuficiente ou passagem sem parada', 'Permanecer pendente de validação'],
  ]) crit.addRow(l).alignment = { wrapText: true, vertical: 'top' }
  return wb
}
