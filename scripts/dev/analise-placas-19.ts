// Análise placa-por-placa do dia 19:
//   Para CADA loja em CADA KPI TESTE, pega a placa e procura no Unitrac:
//   1. A placa existe no Unitrac?
//   2. Tem parada LOJA classificada?
//   3. O horário do KPI bate com o que o Unitrac registrou?
//   4. Tem alguma parada em loja com nome próximo?
//
// Output: relatório linha-por-linha por rede.

import { readFile, readdir } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { parseUnitrac } from '@/lib/parsers/unitrac'

const ESP_DIR = 'C:/Users/media/Downloads/DIA 19 KPI TESTE'
const UNITRAC = 'C:/Users/media/Downloads/dia 19/relatorio_9521.xlsx'
const DATA = '2026-05-19'

type Linha = {
  loja: string
  motorista1: string; cod1: string; placa1: string
  saidaCd1: string; chdLoja1: string; saidaLoja1: string
  motorista2: string; cod2: string; placa2: string
  saidaCd2: string; chdLoja2: string; saidaLoja2: string
  tempo1: string; tempo2: string
}

function fmt(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'number') {
    if (v >= 0 && v < 1) {
      const h = Math.floor(v * 24)
      const m = Math.round((v * 24 - h) * 60)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
    return String(v)
  }
  // ExcelJS converte horas em Date (epoch 1899-12-30) — extrai HH:MM
  if (v instanceof Date) {
    const h = v.getUTCHours()
    const m = v.getUTCMinutes()
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  if (typeof v === 'object' && v !== null && 'result' in v) {
    return fmt((v as { result: ExcelJS.CellValue }).result)
  }
  return String(v).trim()
}

function normPlaca(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function fmtHoraBRT(d: Date | null | undefined): string {
  if (!d) return ''
  const h = (d.getUTCHours() - 3 + 24) % 24
  const m = d.getUTCMinutes()
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function normNome(s: string): string {
  return (s ?? '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function tokensIntersection(a: string, b: string): number {
  const ta = new Set(normNome(a).split(' ').filter(x => x.length >= 3))
  const tb = new Set(normNome(b).split(' ').filter(x => x.length >= 3))
  let c = 0
  for (const t of ta) if (tb.has(t)) c++
  return c
}

async function lerKpi(path: string): Promise<Linha[]> {
  const buf = await readFile(path)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
  const ws = wb.worksheets[0]
  if (!ws) return []
  const out: Linha[] = []
  for (let r = 5; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const loja = fmt(row.getCell(1).value)
    if (!loja) continue
    out.push({
      loja,
      motorista1: fmt(row.getCell(2).value), cod1: fmt(row.getCell(3).value), placa1: fmt(row.getCell(4).value),
      saidaCd1: fmt(row.getCell(5).value), chdLoja1: fmt(row.getCell(6).value), saidaLoja1: fmt(row.getCell(7).value),
      motorista2: fmt(row.getCell(8).value), cod2: fmt(row.getCell(9).value), placa2: fmt(row.getCell(10).value),
      saidaCd2: fmt(row.getCell(11).value), chdLoja2: fmt(row.getCell(12).value), saidaLoja2: fmt(row.getCell(13).value),
      tempo1: fmt(row.getCell(14).value), tempo2: fmt(row.getCell(15).value),
    })
  }
  return out
}

async function main() {
  // 1. Carrega Unitrac
  const unitracBuf = await readFile(UNITRAC)
  const veiculos = await parseUnitrac(unitracBuf.buffer.slice(unitracBuf.byteOffset, unitracBuf.byteOffset + unitracBuf.byteLength) as ArrayBuffer)
  console.log(`Unitrac: ${veiculos.length} veículos parseados\n`)

  // Indexa por placa
  const porPlaca = new Map<string, typeof veiculos[0]>()
  for (const v of veiculos) porPlaca.set(v.placa_norm, v)

  // 2. Lista KPIs
  const files = await readdir(ESP_DIR)
  const kpis = files.filter(f => f.endsWith('.xlsx')).sort()

  let totalLinhas = 0
  let totalPlacas = 0
  let okComplete = 0
  let placaNaoNoUnitrac = 0
  let placaSemParadaLoja = 0
  let placaSemMatchNome = 0
  let horarioDivergente = 0
  let semPlaca = 0

  for (const file of kpis) {
    const rede = file.replace('KPI-', '').replace(`-${DATA}`, '').replace('.xlsx', '').replace(/ \(\d+\)/, '')
    const linhas = await lerKpi(`${ESP_DIR}/${file}`)

    console.log(`\n${'═'.repeat(80)}`)
    console.log(`█ ${rede.toUpperCase().padEnd(20)} (${linhas.length} lojas no KPI TESTE)`)
    console.log(`${'═'.repeat(80)}`)

    for (let idx = 0; idx < linhas.length; idx++) {
      const l = linhas[idx]
      totalLinhas++
      console.log(`\n[${String(idx + 1).padStart(2, '0')}] ${l.loja}`)

      for (const carro of [1, 2] as const) {
        const placa = carro === 1 ? l.placa1 : l.placa2
        const mot = carro === 1 ? l.motorista1 : l.motorista2
        const cod = carro === 1 ? l.cod1 : l.cod2
        const saidaCd = carro === 1 ? l.saidaCd1 : l.saidaCd2
        const chd = carro === 1 ? l.chdLoja1 : l.chdLoja2
        const sai = carro === 1 ? l.saidaLoja1 : l.saidaLoja2
        const tempo = carro === 1 ? l.tempo1 : l.tempo2

        // Sem placa nesse carro
        if (!placa || placa.trim() === '') {
          if (carro === 1) {
            semPlaca++
            console.log(`   Carro 1: SEM PLACA NO KPI TESTE`)
          }
          continue
        }

        totalPlacas++
        const placaN = normPlaca(placa)
        const v = porPlaca.get(placaN)
        const label = `Carro ${carro}: ${cod || '—'} ${placa} ${mot}`

        if (!v) {
          placaNaoNoUnitrac++
          console.log(`   ${label}`)
          console.log(`     ❌ PLACA NÃO EXISTE NO UNITRAC`)
          continue
        }

        const paradasLoja = v.paradas.filter(p => p.classificacao === 'LOJA')
        if (paradasLoja.length === 0) {
          placaSemParadaLoja++
          console.log(`   ${label}`)
          console.log(`     ⚠️  Placa no Unitrac, mas SEM NENHUMA PARADA-LOJA (${v.paradas.length} paradas totais, todas FORA_BASE/BASE)`)
          if (v.paradas.length > 0) {
            const fb = v.paradas.filter(p => p.classificacao === 'FORA_BASE').slice(0, 2)
            for (const p of fb) {
              console.log(`        FORA_BASE: ${p.nome_loja ?? p.local_parada} ${fmtHoraBRT(p.chegada)}-${fmtHoraBRT(p.saida)}`)
            }
          }
          continue
        }

        // Busca melhor parada por nome (tokens em comum)
        let melhor = paradasLoja[0]
        let melhorScore = tokensIntersection(l.loja, melhor.nome_loja ?? melhor.local_parada ?? '')
        for (const p of paradasLoja) {
          const s = tokensIntersection(l.loja, p.nome_loja ?? p.local_parada ?? '')
          if (s > melhorScore) { melhor = p; melhorScore = s }
        }

        // Saída do CD = última saída BASE antes da primeira LOJA
        const baseSaidas = v.paradas.filter(p =>
          (p.classificacao === 'BASE' || (p.classificacao === 'FAKE_EXIT' && (p.local_parada ?? '').startsWith('BASE BENASSI'))) &&
          p.saida && p.saida < melhor.chegada,
        )
        const saidaCdUnitrac = baseSaidas.length > 0
          ? baseSaidas.reduce((a, b) => a.saida! > b.saida! ? a : b).saida
          : null

        const chdHoraU = fmtHoraBRT(melhor.chegada)
        const saiHoraU = fmtHoraBRT(melhor.saida)
        const sCdU = fmtHoraBRT(saidaCdUnitrac)

        console.log(`   ${label}`)

        if (melhorScore === 0) {
          placaSemMatchNome++
          console.log(`     ⚠️  Placa OK mas paradas-LOJA não casam por nome com "${l.loja}"`)
          for (const p of paradasLoja.slice(0, 3)) {
            console.log(`        ${(p.nome_loja ?? p.local_parada ?? '').slice(0, 50).padEnd(50)} ${fmtHoraBRT(p.chegada)}-${fmtHoraBRT(p.saida)}`)
          }
        } else {
          const okSCd = (!saidaCd) || sCdU === saidaCd
          const okChd = (!chd) || chdHoraU === chd
          const okSai = (!sai) || saiHoraU === sai
          const allOk = okSCd && okChd && okSai
          if (allOk) {
            okComplete++
            console.log(`     ✓ Match (${melhor.nome_loja ?? melhor.local_parada})`)
            console.log(`        SCD ${saidaCd || '—'} | CHD ${chd || '—'} | SAI ${sai || '—'} | TMP ${tempo || '—'}  ←KPI`)
            console.log(`        SCD ${sCdU || '—'} | CHD ${chdHoraU || '—'} | SAI ${saiHoraU || '—'}  ←Unitrac`)
          } else {
            horarioDivergente++
            console.log(`     ⚠️  Horários divergem (${melhor.nome_loja ?? melhor.local_parada})`)
            console.log(`        KPI:     SCD ${saidaCd || '—'} | CHD ${chd || '—'} | SAI ${sai || '—'} | TMP ${tempo || '—'}`)
            console.log(`        Unitrac: SCD ${sCdU || '—'} | CHD ${chdHoraU || '—'} | SAI ${saiHoraU || '—'}`)
          }
        }
      }
    }
  }

  console.log(`\n${'═'.repeat(80)}`)
  console.log(`RESUMO GERAL`)
  console.log(`${'═'.repeat(80)}`)
  console.log(`  Lojas analisadas:                 ${totalLinhas}`)
  console.log(`  Slots de placa (carro 1 + 2):     ${totalPlacas + semPlaca}`)
  console.log(`  Sem placa preenchida no KPI:      ${semPlaca}`)
  console.log(`  Com placa preenchida:             ${totalPlacas}`)
  console.log(`    ✓ Match completo:               ${okComplete}`)
  console.log(`    ⚠ Horário divergente:           ${horarioDivergente}`)
  console.log(`    ⚠ Sem match por nome de loja:   ${placaSemMatchNome}`)
  console.log(`    ⚠ Sem parada-LOJA no Unitrac:   ${placaSemParadaLoja}`)
  console.log(`    ❌ Placa não existe no Unitrac:  ${placaNaoNoUnitrac}`)
  const pct = totalPlacas > 0 ? Math.round((okComplete / totalPlacas) * 100) : 0
  console.log(`\n  Taxa de match completo placa+horário: ${pct}%`)
}

main().catch(e => { console.error(e); process.exit(1) })
