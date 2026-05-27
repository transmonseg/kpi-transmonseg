/**
 * Dump de todos os 18 KPIs gerados pelo sistema do dia 25/05/2026.
 * Lê cada XLSX, extrai linhas como objetos, lista anomalias detectáveis
 * automaticamente, salva resumo em docs/conversas-tia-erica/dia-25/analise-kpis-d25.md
 */
import ExcelJS from 'exceljs'
import { readdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const PASTA = 'docs/conversas-tia-erica/dia-25/kpis-gerados'

type Linha = Record<string, string | number | null>

async function lerXlsx(path: string): Promise<{ sheet: string; headers: string[]; linhas: Linha[] }[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const result: { sheet: string; headers: string[]; linhas: Linha[] }[] = []
  wb.eachSheet((ws) => {
    const headers: string[] = []
    const linhas: Linha[] = []
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) {
        row.eachCell((cell, c) => { headers[c - 1] = String(cell.value ?? '').trim() })
        return
      }
      const obj: Linha = {}
      row.eachCell((cell, c) => {
        const key = headers[c - 1] ?? `col${c}`
        let v = cell.value
        if (v && typeof v === 'object' && 'result' in (v as object)) v = (v as { result: unknown }).result as never
        if (v instanceof Date) {
          const hh = String(v.getUTCHours()).padStart(2, '0')
          const mm = String(v.getUTCMinutes()).padStart(2, '0')
          obj[key] = `${hh}:${mm}`
        } else {
          obj[key] = (v as string | number | null) ?? null
        }
      })
      if (Object.values(obj).some(v => v !== null && v !== '')) linhas.push(obj)
    })
    result.push({ sheet: ws.name, headers: headers.filter(Boolean), linhas })
  })
  return result
}

function detectAnomalias(linha: Linha): string[] {
  const anoms: string[] = []
  const placa = String(linha['PLACA'] ?? linha['Placa'] ?? '')
  const motorista = String(linha['MOTORISTA'] ?? linha['Motorista'] ?? '')
  const saidaCd = String(linha['SAIDA CD'] ?? linha['Saída CD'] ?? linha['SAIDA_CD'] ?? '')
  const chdLoja = String(linha['CHD LOJA 1'] ?? linha['Chegada Loja'] ?? linha['CHEGADA_LOJA_1'] ?? '')
  const tempo = linha['TEMPO LOJA 1'] ?? linha['Tempo Loja'] ?? linha['TEMPO_LOJA_1']

  if (!motorista && !placa) anoms.push('linha-vazia')
  if (placa && !motorista) anoms.push('placa-sem-motorista')
  if (motorista && !placa) anoms.push('motorista-sem-placa')
  if (saidaCd && chdLoja && saidaCd === chdLoja) anoms.push('saida=chegada (0min viagem)')
  if (typeof tempo === 'number' && tempo > 240) anoms.push(`tempo-absurdo:${tempo}min`)
  if (typeof tempo === 'number' && tempo < 0) anoms.push(`tempo-negativo:${tempo}`)
  if (chdLoja && /^0[0-3]:/.test(chdLoja)) anoms.push(`chegada-madrugada:${chdLoja}`)

  return anoms
}

async function main() {
  const arquivos = readdirSync(PASTA).filter(f => f.endsWith('.xlsx')).sort()
  console.log(`${arquivos.length} KPIs encontrados\n`)

  let mdOut = `# Análise KPIs Sistema — Dia 25/05/2026\n\n`
  mdOut += `Gerado de \`${PASTA}\` em ${new Date().toISOString()}.\n\n`

  let totGeral = 0
  let totSemGps = 0
  let totSemPlaca = 0
  let totSemMotorista = 0
  let totAnom = 0

  for (const arq of arquivos) {
    const rede = arq.replace('KPI-', '').replace('-2026-05-25.xlsx', '')
    const sheets = await lerXlsx(join(PASTA, arq))
    mdOut += `\n---\n\n## ${rede}\n\n`
    let qtdRede = 0
    let qtdSemGpsRede = 0
    let qtdSemPlacaRede = 0
    let qtdSemMotoristaRede = 0
    const anomsRede: { ordem: number; loja: string; motorista: string; placa: string; anoms: string[] }[] = []

    for (const { sheet, headers, linhas } of sheets) {
      if (!linhas.length) continue
      mdOut += `### Sheet: ${sheet} (${linhas.length} linhas)\n\n`
      mdOut += `Colunas: \`${headers.join(' | ')}\`\n\n`
      mdOut += `| # | Loja | Motorista | Placa | Saida CD | CHD Loja | T.Loja | SL Loja |\n`
      mdOut += `|---|------|-----------|-------|----------|----------|--------|---------|\n`

      linhas.forEach((l, idx) => {
        const ord = l['ORDEM'] ?? l['#'] ?? idx + 1
        const loja = String(l['LOJA'] ?? l['Loja'] ?? '').slice(0, 30)
        const motorista = String(l['MOTORISTA'] ?? l['Motorista'] ?? '')
        const placa = String(l['PLACA'] ?? l['Placa'] ?? '')
        const saida = String(l['SAIDA CD'] ?? l['Saída CD'] ?? '')
        const chd = String(l['CHD LOJA 1'] ?? l['Chegada Loja'] ?? '')
        const tempo = String(l['TEMPO LOJA 1'] ?? l['Tempo Loja'] ?? '')
        const sl = String(l['SL LOJA 1'] ?? l['Saida Loja'] ?? '')

        qtdRede++
        if (!saida && !chd) qtdSemGpsRede++
        if (!placa) qtdSemPlacaRede++
        if (!motorista) qtdSemMotoristaRede++

        const anoms = detectAnomalias(l)
        if (anoms.length > 0) {
          anomsRede.push({ ordem: Number(ord), loja, motorista, placa, anoms })
        }

        const flag = anoms.length > 0 ? ' ⚠️' : ''
        mdOut += `| ${ord} | ${loja} | ${motorista} | ${placa} | ${saida} | ${chd} | ${tempo} | ${sl} |${flag}\n`
      })
      mdOut += `\n`
    }

    if (anomsRede.length > 0) {
      mdOut += `**Anomalias detectadas (${anomsRede.length}):**\n\n`
      for (const a of anomsRede) {
        mdOut += `- #${a.ordem} ${a.loja || '(sem loja)'} / ${a.motorista || '?'} / ${a.placa || '?'} → ${a.anoms.join(', ')}\n`
      }
      mdOut += '\n'
    }

    const resumo = `**Resumo ${rede}:** ${qtdRede} linhas, ${qtdSemGpsRede} sem GPS, ${qtdSemPlacaRede} sem placa, ${qtdSemMotoristaRede} sem motorista, ${anomsRede.length} anomalias`
    mdOut += `${resumo}\n`
    console.log(resumo)

    totGeral += qtdRede
    totSemGps += qtdSemGpsRede
    totSemPlaca += qtdSemPlacaRede
    totSemMotorista += qtdSemMotoristaRede
    totAnom += anomsRede.length
  }

  mdOut = mdOut.replace(
    'Gerado de',
    `**Total: ${totGeral} linhas | ${totSemGps} sem GPS | ${totSemPlaca} sem placa | ${totSemMotorista} sem motorista | ${totAnom} anomalias detectadas**\n\nGerado de`,
  )

  const outPath = 'docs/conversas-tia-erica/dia-25/analise-kpis-d25.md'
  writeFileSync(outPath, mdOut, 'utf-8')
  console.log(`\n>> Análise completa em ${outPath}`)
  console.log(`>> TOTAL: ${totGeral} linhas | ${totSemGps} sem GPS | ${totSemPlaca} sem placa | ${totSemMotorista} sem motorista | ${totAnom} anomalias`)
}

main().catch(e => { console.error(e); process.exit(1) })
