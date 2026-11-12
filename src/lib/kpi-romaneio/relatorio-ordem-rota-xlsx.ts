// 12/11: planilha do relatório Ordem da rota (o "tirar relatório" da tela).
import * as XLSX from 'xlsx'
import type { RelatorioOrdemRota } from './relatorio-ordem-rota'

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

export function gerarXlsxOrdemRota(r: RelatorioOrdemRota): Buffer {
  const wb = XLSX.utils.book_new()
  const periodo = r.de === r.ate ? br(r.de) : `${br(r.de)} a ${br(r.ate)}`
  const resumo = [
    ['ORDEM DA ROTA — RIO QUALITY', ''],
    ['Período', periodo],
    ['Entregas feitas com ordem planejada', r.total.entregas],
    ['Na sequência planejada', r.total.naOrdem],
    ['% na ordem', r.total.pct],
    ['Viagens', r.total.viagens],
    ['Viagens feitas de trás pra frente', r.total.invertidas],
    [],
    ['Como ler', 'Por viagem, as entregas são ordenadas pela hora de chegada (GPS). "Na ordem" = a maior sequência que respeita a ordem da roteirização; as outras foram feitas fora da ordem (pulou e voltou, ou inverteu).'],
    [],
    ['Dia', 'Entregas', 'Na ordem', '% na ordem', 'Viagens'],
    ...r.dias.map(d => [br(d.data), d.entregas, d.naOrdem, d.pct, d.viagens]),
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(resumo)
  ws1['!cols'] = [{ wch: 40 }, { wch: 60 }, { wch: 10 }, { wch: 12 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumo')

  const cab = ['Entregas', 'Na ordem', '% na ordem', 'Viagens', 'De trás pra frente']
  const linhaAg = (a: RelatorioOrdemRota['motoristas'][number]) => [a.entregas, a.naOrdem, a.pct, a.viagens, a.invertidas]
  const ws2 = XLSX.utils.aoa_to_sheet([['Motorista', 'Placas', ...cab], ...r.motoristas.map(a => [a.nome, a.sub, ...linhaAg(a)])])
  ws2['!cols'] = [{ wch: 36 }, { wch: 22 }, ...cab.map(() => ({ wch: 14 }))]
  XLSX.utils.book_append_sheet(wb, ws2, 'Motoristas')
  const ws3 = XLSX.utils.aoa_to_sheet([['Placa', 'Motoristas', ...cab], ...r.placas.map(a => [a.nome, a.sub, ...linhaAg(a)])])
  ws3['!cols'] = [{ wch: 12 }, { wch: 40 }, ...cab.map(() => ({ wch: 14 }))]
  XLSX.utils.book_append_sheet(wb, ws3, 'Placas')

  const ws4 = XLSX.utils.aoa_to_sheet([
    ['Dia', 'Placa', 'Motorista', 'Destino', 'Romaneio', 'Entregas', 'Na ordem', '% na ordem', 'De trás pra frente', 'Planejadas não entregues'],
    ...r.viagens.map(v => [br(v.data), v.placa, v.motorista, v.destino, v.romaneio, v.entregas, v.naOrdem, v.pct, v.invertida ? 'sim' : '', v.naoFeitas]),
  ])
  ws4['!cols'] = [{ wch: 11 }, { wch: 10 }, { wch: 32 }, { wch: 30 }, { wch: 11 }, ...Array(5).fill({ wch: 13 })]
  XLSX.utils.book_append_sheet(wb, ws4, 'Viagens')

  const ws5 = XLSX.utils.aoa_to_sheet([
    ['Dia', 'Placa', 'Motorista', 'Romaneio', 'Feita como', 'Era a', 'Situação', 'Cliente', 'NF', 'Chegada (GPS)'],
    ...r.viagens.flatMap(v => v.sequencia.map(s => [br(v.data), v.placa, v.motorista, v.romaneio, s.real, s.planejada, s.naOrdem ? 'na ordem' : 'FORA DA ORDEM', s.cliente, s.nf, s.chegada ?? ''])),
  ])
  ws5['!cols'] = [{ wch: 11 }, { wch: 10 }, { wch: 30 }, { wch: 11 }, { wch: 10 }, { wch: 8 }, { wch: 15 }, { wch: 40 }, { wch: 10 }, { wch: 13 }]
  XLSX.utils.book_append_sheet(wb, ws5, 'Sequência')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
