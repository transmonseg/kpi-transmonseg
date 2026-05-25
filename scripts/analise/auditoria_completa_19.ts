/**
 * Auditoria COMPLETA placa por placa — dia 19/05/2026 todas as redes.
 *
 * Para cada rede e cada placa:
 *   1. Lista lojas da escala
 *   2. Lista paradas do Unitrac
 *   3. Mostra timestamps GERADO (Excel baixado) vs MANUAL
 *   4. Classifica: OK / DADOS-FALTANDO / MATCHER-ERRADO / etc
 *
 * Output: docs/auditoria/auditoria_completa_2026-05-19.md
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import ExcelJS from 'exceljs'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseEscalaGuanabaraPdf } from '@/lib/parsers/escala-guanabara-pdf'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import type { LinhaEscala } from '@/lib/types/escala'
import type { ResumoVeiculo } from '@/lib/types/unitrac'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'
const DL = 'C:/Users/media/Downloads'
const DATA = '2026-05-19'

const KPI_GERADO_FILES: Record<string, string> = {
  SUPER_PAX:     'KPI-SUPER_PAX-2026-05-19 (2).xlsx',
  FEIRA_NOVA:    'KPI-FEIRA_NOVA-2026-05-19 (2).xlsx',
  MUNDIAL:       'KPI-MUNDIAL-2026-05-19 (3).xlsx',
  SENDAS:        'KPI-SENDAS-2026-05-19 (4).xlsx',
  CARREFOUR:     'KPI-CARREFOUR-2026-05-19 (2).xlsx',
  ATACADAO:      'KPI-ATACADAO-2026-05-19 (3).xlsx',
  ASSAI:         'KPI-ASSAI-2026-05-19 (2).xlsx',
  PREZUNIC:      'KPI-PREZUNIC-2026-05-19 (2).xlsx',
  VIANENSE:      'KPI-VIANENSE-2026-05-19 (2).xlsx',
  PRINCESA:      'KPI-PRINCESA-2026-05-19 (7).xlsx',
  SUPERPRIX:     'KPI-SUPERPRIX-2026-05-19 (2).xlsx',
  SUPERCOMPRAS:  'KPI-SUPERCOMPRAS-2026-05-19 (1).xlsx',
  SAMS_CLUB:     'KPI-SAMS_CLUB-2026-05-19 (2).xlsx',
  CAB_PETROPOLIS:'KPI-CAB_PETROPOLIS-2026-05-19 (2).xlsx',
  ARMAZEM_GRAO:  'KPI-ARMAZEM_GRAO-2026-05-19 (2).xlsx',
  GUANABARA:     'KPI-GUANABARA-2026-05-19 (5).xlsx',
  ZONA_SUL:      'KPI-ZONA_SUL-2026-05-19 (5).xlsx',
}

function fmtHHMM(d: Date | null | undefined): string {
  if (!d) return '---'
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0')
}

function fmtKpiCell(v: unknown): string {
  if (!v) return '---'
  if (typeof v === 'object' && v !== null && 'result' in v) return fmtKpiCell((v as any).result)
  if (v instanceof Date) return fmtHHMM(v)
  if (typeof v === 'number') {
    const s = Math.round(v * 86400)
    return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  }
  if (typeof v === 'string') {
    if (v.includes('SEM')) return 'SEM'
    if (v.includes('NÃO') || v.includes('NAO')) return 'NAO_FOI'
  }
  return '---'
}

function cvCell(cell: ExcelJS.Cell): string {
  const v = cell?.value
  if (!v && v !== 0) return ''
  if (typeof v === 'object' && v !== null && 'richText' in v) return (v as any).richText.map((r: any) => r.text).join('').trim()
  if (typeof v === 'object' && v !== null && 'text' in v) return String((v as any).text).trim()
  return String(v).trim()
}

interface KpiLinha {
  loja: string
  placa1: string; mot1: string; sc1: string; chd1: string; sl1: string
  placa2: string; mot2: string; sc2: string; chd2: string; sl2: string
}

async function lerKpi(path: string): Promise<KpiLinha[]> {
  if (!existsSync(path)) return []
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.worksheets[0]
  const rows: KpiLinha[] = []
  for (let r = 5; r <= 250; r++) {
    const row = ws.getRow(r)
    const loja = cvCell(row.getCell(1))
    if (!loja) continue
    rows.push({
      loja,
      mot1: cvCell(row.getCell(2)),
      placa1: cvCell(row.getCell(4)),
      sc1: fmtKpiCell(row.getCell(5).value),
      chd1: fmtKpiCell(row.getCell(6).value),
      sl1: fmtKpiCell(row.getCell(7).value),
      mot2: cvCell(row.getCell(8)),
      placa2: cvCell(row.getCell(10)),
      sc2: fmtKpiCell(row.getCell(11).value),
      chd2: fmtKpiCell(row.getCell(12).value),
      sl2: fmtKpiCell(row.getCell(13).value),
    })
  }
  return rows
}

async function carregarEscalaPara(redeId: string): Promise<LinhaEscala[]> {
  const pax = ['SUPER_PAX', 'FEIRA_NOVA', 'EMANUEL']
  if (pax.includes(redeId)) {
    const buf = readFileSync(BASE + '/ESCALA - PAX , FEIRA NOVA , EMANUEL.xlsx')
    return parseEscalaPax(buf, DATA)
  }
  if (redeId === 'ARMAZEM_GRAO') {
    const buf = readFileSync(BASE + '/ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx')
    return parseEscalaArmazemGrao(buf, DATA)
  }
  if (redeId === 'GUANABARA') {
    const buf = readFileSync(BASE + '/ESCALA 19.05.pdf')
    return parseEscalaGuanabaraPdf(buf, DATA)
  }
  if (redeId === 'ZONA_SUL') {
    const buf = readFileSync(BASE + '/ESCALA ZONA SUL - MAIO (6).xlsx')
    return parseEscalaZonaSul(buf, DATA)
  }
  const buf = readFileSync(BASE + '/ESCALA GERAL DE MAIO 1 (6).xlsx')
  return parseEscalaGeral(buf, DATA)
}

const REDES = [
  'SUPER_PAX', 'FEIRA_NOVA', 'MUNDIAL', 'SENDAS', 'CARREFOUR', 'ATACADAO',
  'ASSAI', 'PREZUNIC', 'VIANENSE', 'PRINCESA', 'SUPERPRIX', 'SUPERCOMPRAS',
  'SAMS_CLUB', 'CAB_PETROPOLIS', 'ARMAZEM_GRAO', 'GUANABARA', 'ZONA_SUL',
]

function classificar(
  temGps: boolean,
  geradoArr: string[],
  manualArr: string[],
): { categoria: string; emoji: string } {
  const allManualBlank = manualArr.every(v => v === '---')
  const allManualSem = manualArr.every(v => v.startsWith('SEM'))
  const allManualNaoFoi = manualArr.every(v => v.startsWith('NAO'))
  const allGeradoBlank = geradoArr.every(v => v === '---')
  const allGeradoSem = geradoArr.every(v => v.startsWith('SEM'))

  // 1. SEM GPS no Unitrac
  if (!temGps) {
    if (allManualSem || allManualBlank) return { categoria: 'OK_NO_GPS', emoji: '✅' }
    return { categoria: 'GPS_FALTA_MANUAL_TEM', emoji: '⚠️' }
  }

  // 2. GPS existe, mas comparações
  if (allGeradoBlank && allManualBlank) return { categoria: 'OK_BOTH_BLANK', emoji: '✅' }
  if (allGeradoBlank && allManualSem) return { categoria: 'OK_BOTH_NEGATIVE', emoji: '✅' }
  if (allGeradoBlank && allManualNaoFoi) return { categoria: 'OK_BOTH_NEGATIVE', emoji: '✅' }

  // GERADO tem dados mas MANUAL não
  if (!allGeradoBlank && allManualBlank) return { categoria: 'GERADO_TEM_MANUAL_BLANK', emoji: '⚠️' }
  if (!allGeradoBlank && allManualSem) return { categoria: 'GERADO_TEM_MANUAL_SEM', emoji: '⚠️' }
  if (!allGeradoBlank && allManualNaoFoi) return { categoria: 'GERADO_TEM_MANUAL_NAO_FOI', emoji: '⚠️' }

  // MANUAL tem dados mas GERADO não
  if (allGeradoBlank && !allManualBlank && !allManualSem) return { categoria: 'MATCHER_VAZIO', emoji: '❓' }

  // Ambos têm dados — comparar
  const exact = geradoArr.every((v, i) => v === manualArr[i])
  if (exact) return { categoria: 'OK_EXATO', emoji: '✅' }

  // Diferença
  const cH = parseInt(geradoArr[1]?.split(':')[0] ?? '99')
  const mH = parseInt(manualArr[1]?.split(':')[0] ?? '99')
  if (!isNaN(cH) && !isNaN(mH) && Math.abs(cH - mH) >= 4) return { categoria: 'DIFF_2_TURNOS', emoji: '🔄' }

  return { categoria: 'DIFF_TIMING', emoji: '⏱️' }
}

async function main() {
  console.log('Carregando Unitrac (XLSX + PDF)...')
  const veicXlsx = await parseUnitrac(readFileSync(BASE + '/relatorio_9391.xlsx'))
  const veicPdf = await parseUnitracPdf(readFileSync(BASE + '/relatorio_9572.pdf'), new Set()).catch(() => [] as ResumoVeiculo[])
  const placasUnitrac = new Set([...veicXlsx.map(v => v.placa_norm), ...veicPdf.map(v => v.placa_norm)])
  const veiculosByPlaca = new Map<string, ResumoVeiculo>()
  for (const v of veicXlsx) veiculosByPlaca.set(v.placa_norm, v)
  for (const v of veicPdf) if (!veiculosByPlaca.has(v.placa_norm)) veiculosByPlaca.set(v.placa_norm, v)
  console.log(`  ${veiculosByPlaca.size} veículos únicos (XLSX+PDF)\n`)

  let report = `# Auditoria Completa — 19/05/2026\n\n`
  report += `**Data**: 2026-05-19 (terça-feira)\n`
  report += `**Veículos no Unitrac (XLSX+PDF)**: ${veiculosByPlaca.size}\n\n`

  const totaisGlobais = {
    placas: 0, gps_ok: 0, gps_falta: 0,
    ok_exato: 0, ok_negativo: 0, ok_blank: 0,
    diff_timing: 0, diff_2_turnos: 0, matcher_vazio: 0,
    manual_blank_gps_tem: 0, manual_sem_gps_tem: 0, manual_nao_foi: 0,
  }

  for (const redeId of REDES) {
    process.stdout.write(`Processando ${redeId}...\n`)
    report += `\n---\n\n## ${redeId}\n\n`

    // 1. ESCALA
    let escala: LinhaEscala[] = []
    try {
      const all = await carregarEscalaPara(redeId)
      escala = all.filter(l => l.rede_id === redeId)
    } catch (e: any) {
      report += `**ERRO ao carregar escala**: ${e.message}\n\n`
      continue
    }

    // 2. KPI GERADO + MANUAL
    const geradoFile = KPI_GERADO_FILES[redeId]
    const geradoPath = DL + '/' + geradoFile
    const manualPath = DL + '/KPI-' + redeId + '-2026-05-19.xlsx'
    const kpiGerado = await lerKpi(geradoPath)
    const kpiManual = await lerKpi(manualPath)

    if (escala.length === 0) {
      report += `**0 linhas na escala** (rede pode usar KPI direto sem escala)\n\n`
      // Ainda mostra GERADO×MANUAL
      report += `KPI Gerado: ${kpiGerado.length} linhas | KPI Manual: ${kpiManual.length} linhas\n\n`
      continue
    }

    // 3. Agrupa por placa
    const porPlaca = new Map<string, LinhaEscala[]>()
    for (const l of escala) {
      const p = l.placa_norm || '(SEM_PLACA)'
      const arr = porPlaca.get(p) ?? []
      arr.push(l)
      porPlaca.set(p, arr)
    }

    report += `**Resumo**: ${escala.length} linhas na escala · ${porPlaca.size} placas únicas · KPI gerado ${kpiGerado.length} linhas\n\n`

    const totaisRede = {
      placas: 0, gps_ok: 0, gps_falta: 0,
      ok_exato: 0, ok_negativo: 0, ok_blank: 0,
      diff_timing: 0, diff_2_turnos: 0, matcher_vazio: 0,
      manual_blank_gps_tem: 0, manual_sem_gps_tem: 0, manual_nao_foi: 0,
    }

    const placasOrdenadas = [...porPlaca.keys()].sort()

    for (const placa of placasOrdenadas) {
      const linhas = porPlaca.get(placa)!
      const motorista = linhas[0].motorista_nome ?? '?'
      const veiculo = placa !== '(SEM_PLACA)' ? veiculosByPlaca.get(placa) : undefined
      const temGps = !!veiculo
      totaisRede.placas++
      if (temGps) totaisRede.gps_ok++; else totaisRede.gps_falta++

      report += `### ${placa} | ${motorista}\n\n`

      // Escala: lojas que essa placa deveria fazer
      const lojas = linhas.map(l => `${l.loja_codigo_raw ? `[${l.loja_codigo_raw}] ` : ''}${l.loja_nome_raw}`).join(' · ')
      report += `**Escala**: ${linhas.length} linha${linhas.length > 1 ? 's' : ''} → ${lojas}\n\n`

      // Unitrac
      if (!temGps) {
        report += `**Unitrac**: ❌ PLACA NÃO ENCONTRADA no relatório (XLSX nem PDF)\n\n`
      } else {
        const v = veiculo!
        const paradasLoja = v.paradas.filter(p => p.classificacao === 'LOJA')
        const paradasBase = v.paradas.filter(p => p.classificacao === 'BASE')
        const paradasFora = v.paradas.filter(p => p.classificacao === 'FORA_BASE')
        report += `**Unitrac**: ${v.paradas.length} paradas (${paradasBase.length} BASE, ${paradasLoja.length} LOJA, ${paradasFora.length} FB)\n\n`
        if (paradasLoja.length > 0) {
          report += `| Hora | Duração | Loja Unitrac |\n|------|---------|---|\n`
          for (const p of paradasLoja) {
            const dur = p.duracao_seg ? Math.round(p.duracao_seg / 60) + 'min' : '?'
            const nome = (p.nome_loja ?? p.local_parada ?? '').slice(0, 60)
            report += `| ${fmtHHMM(p.chegada)}-${fmtHHMM(p.saida)} | ${dur} | cod ${p.codigo_loja ?? '-'} · ${nome} |\n`
          }
          report += '\n'
        }
        if (paradasFora.length > 0 && paradasLoja.length === 0) {
          report += `Apenas paradas FORA_BASE detectadas:\n`
          for (const p of paradasFora.slice(0, 5)) {
            const dur = p.duracao_seg ? Math.round(p.duracao_seg / 60) + 'min' : '?'
            const nome = (p.local_parada ?? '').slice(0, 50)
            report += `- ${fmtHHMM(p.chegada)}-${fmtHHMM(p.saida)} (${dur}) ${nome}\n`
          }
          report += '\n'
        }
      }

      // Tabela de comparação por loja da escala
      report += `**Comparação por loja**:\n\n`
      report += `| Loja escala | SC ger | CHD ger | SL ger | SC man | CHD man | SL man | Status |\n`
      report += `|---|---|---|---|---|---|---|---|\n`

      for (const linha of linhas) {
        const lojaKey = linha.loja_nome_raw
        const ger = kpiGerado.find(k => k.loja === lojaKey)
        const man = kpiManual.find(k => k.loja === lojaKey)

        const normPlaca = (s: string) => s.toUpperCase().replace(/[\s-]/g, '')
        let geradoArr = ['---', '---', '---']
        let manualArr = ['---', '---', '---']
        if (ger) {
          if (ger.placa1 && normPlaca(ger.placa1) === placa) geradoArr = [ger.sc1, ger.chd1, ger.sl1]
          else if (ger.placa2 && normPlaca(ger.placa2) === placa) geradoArr = [ger.sc2, ger.chd2, ger.sl2]
          else if (linha.carro_ordem === 1) geradoArr = [ger.sc1, ger.chd1, ger.sl1]
          else geradoArr = [ger.sc2, ger.chd2, ger.sl2]
        }
        if (man) {
          if (man.placa1 && normPlaca(man.placa1) === placa) manualArr = [man.sc1, man.chd1, man.sl1]
          else if (man.placa2 && normPlaca(man.placa2) === placa) manualArr = [man.sc2, man.chd2, man.sl2]
          else if (linha.carro_ordem === 1) manualArr = [man.sc1, man.chd1, man.sl1]
          else manualArr = [man.sc2, man.chd2, man.sl2]
        }

        const { categoria, emoji } = classificar(temGps, geradoArr, manualArr)
        if (categoria === 'OK_EXATO') totaisRede.ok_exato++
        else if (categoria === 'OK_BOTH_NEGATIVE') totaisRede.ok_negativo++
        else if (categoria === 'OK_BOTH_BLANK') totaisRede.ok_blank++
        else if (categoria === 'OK_NO_GPS') totaisRede.ok_negativo++
        else if (categoria === 'GPS_FALTA_MANUAL_TEM') totaisRede.gps_falta++
        else if (categoria === 'DIFF_TIMING') totaisRede.diff_timing++
        else if (categoria === 'DIFF_2_TURNOS') totaisRede.diff_2_turnos++
        else if (categoria === 'MATCHER_VAZIO') totaisRede.matcher_vazio++
        else if (categoria === 'GERADO_TEM_MANUAL_BLANK') totaisRede.manual_blank_gps_tem++
        else if (categoria === 'GERADO_TEM_MANUAL_SEM') totaisRede.manual_sem_gps_tem++
        else if (categoria === 'GERADO_TEM_MANUAL_NAO_FOI') totaisRede.manual_nao_foi++

        report += `| ${lojaKey.slice(0, 35)} | ${geradoArr[0]} | ${geradoArr[1]} | ${geradoArr[2]} | ${manualArr[0]} | ${manualArr[1]} | ${manualArr[2]} | ${emoji} ${categoria} |\n`
      }
      report += '\n'
    }

    report += `**Totais ${redeId}**:\n`
    report += `- Placas únicas: ${totaisRede.placas} (GPS: ${totaisRede.gps_ok} | sem GPS: ${totaisRede.gps_falta})\n`
    report += `- OK exato: ${totaisRede.ok_exato} · OK negativo: ${totaisRede.ok_negativo} · OK blank: ${totaisRede.ok_blank}\n`
    report += `- DIFF timing: ${totaisRede.diff_timing} · DIFF 2-turnos: ${totaisRede.diff_2_turnos}\n`
    report += `- Matcher vazio (manual tem dado): ${totaisRede.matcher_vazio}\n`
    report += `- Manual BLANK (GPS tem): ${totaisRede.manual_blank_gps_tem} · Manual SEM (GPS tem): ${totaisRede.manual_sem_gps_tem} · NAO_FOI (GPS tem): ${totaisRede.manual_nao_foi}\n\n`

    Object.keys(totaisGlobais).forEach(k => {
      (totaisGlobais as any)[k] += (totaisRede as any)[k]
    })
  }

  // Sumário global no topo
  let topo = `## SUMÁRIO GLOBAL\n\n`
  topo += `**Placas únicas no total**: ${totaisGlobais.placas}\n`
  topo += `- Com GPS no Unitrac: ${totaisGlobais.gps_ok}\n`
  topo += `- Sem GPS (problema dado externo): ${totaisGlobais.gps_falta}\n\n`
  topo += `**Comparações por loja-placa**:\n`
  topo += `- ✅ OK exato (GERADO=MANUAL): ${totaisGlobais.ok_exato}\n`
  topo += `- ✅ OK negativo (ambos SEM/NAO_FOI): ${totaisGlobais.ok_negativo}\n`
  topo += `- ✅ OK blank (ambos '---'): ${totaisGlobais.ok_blank}\n`
  topo += `- ⏱️ DIFF timing (5-30 min): ${totaisGlobais.diff_timing}\n`
  topo += `- 🔄 DIFF 2 turnos (manhã vs tarde): ${totaisGlobais.diff_2_turnos}\n`
  topo += `- ❓ Matcher vazio (GPS não encontrou): ${totaisGlobais.matcher_vazio}\n`
  topo += `- ⚠️ Manual BLANK mas GPS tem: ${totaisGlobais.manual_blank_gps_tem}\n`
  topo += `- ⚠️ Manual SEM mas GPS tem: ${totaisGlobais.manual_sem_gps_tem}\n`
  topo += `- ⚠️ Manual NAO_FOI mas GPS tem: ${totaisGlobais.manual_nao_foi}\n\n`

  report = `# Auditoria Completa — 19/05/2026\n\n${topo}\n${report.split('# Auditoria Completa — 19/05/2026')[1] ?? ''}`

  const outDir = 'docs/auditoria'
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  const outPath = outDir + '/auditoria_completa_2026-05-19.md'
  writeFileSync(outPath, report, 'utf8')
  console.log(`\nRelatório salvo em: ${outPath}`)
  console.log(`Tamanho: ${(report.length / 1024).toFixed(1)} KB`)

  console.log('\n=== SUMÁRIO ===')
  console.log(topo)
}

main().catch(e => { console.error('ERRO:', e.stack || e); process.exit(1) })
