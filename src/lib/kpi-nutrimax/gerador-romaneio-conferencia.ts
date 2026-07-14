import ExcelJS from 'exceljs'
import type { RelatorioPlacaNutrimax } from './types'

const STATUS_LABEL: Record<RelatorioPlacaNutrimax['status'], string> = {
  ok: 'OK',
  divergente: 'DIVERGENTE',
  ausente: 'AUSENTE',
}

function sanitizaNomeAba(nome: string): string {
  return nome.replace(/[\\/?*[\]:]/g, '-').slice(0, 31)
}

function nomeUnicoAba(usados: Set<string>, base: string): string {
  let nome = sanitizaNomeAba(base)
  let i = 2
  while (usados.has(nome)) {
    nome = sanitizaNomeAba(`${base} (${i})`)
    i++
  }
  usados.add(nome)
  return nome
}

export async function gerarRomaneioConferencia(relatorio: RelatorioPlacaNutrimax[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()

  const resumo = wb.addWorksheet('Resumo')
  resumo.addRow(['CARGA', 'PLACA', 'DESTINO', 'STATUS'])
  for (const r of relatorio) {
    resumo.addRow([r.carga, r.placaNorm, r.destino, STATUS_LABEL[r.status]])
  }

  const usados = new Set<string>(['Resumo'])
  for (const r of relatorio) {
    const ws = wb.addWorksheet(nomeUnicoAba(usados, `${r.placaNorm} (${r.carga})`))
    ws.addRow(['CARGA', r.carga])
    ws.addRow(['PLACA', r.placaNorm])
    ws.addRow(['DESTINO', r.destino])
    ws.addRow(['MOTORISTA', r.motorista])
    ws.addRow(['AJUDANTE 1', r.ajudante1 ?? ''])
    ws.addRow(['AJUDANTE 2', r.ajudante2 ?? ''])
    ws.addRow(['PESO (KG)', r.pesoKg ?? ''])
    ws.addRow(['NF PLANEJADO', r.nfPlanejado ?? ''])
    ws.addRow(['NF RECEBIDO', r.nfRecebido])
    ws.addRow(['STATUS', STATUS_LABEL[r.status]])
    ws.addRow([])
    ws.addRow(['NF', 'CLIENTE', 'ENDEREÇO'])
    for (const c of r.clientes) {
      ws.addRow([c.nf, c.clienteNome, c.endereco ?? ''])
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
