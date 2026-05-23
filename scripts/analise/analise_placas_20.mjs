import ExcelJS from 'exceljs'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20'

function cv(cell) {
  const v = cell?.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && v.text) return String(v.text).trim()
  if (typeof v === 'object' && v.richText) return v.richText.map(r => r.text).join('').trim()
  return String(v).trim()
}

function normPlaca(p) { return p ? p.replace(/[^A-Z0-9]/gi, '').toUpperCase() : '' }

function toHHMM(v) {
  if (!v) return null
  if (typeof v === 'object' && v.result !== undefined) v = v.result
  if (v instanceof Date) return v.getUTCHours() + ':' + String(v.getUTCMinutes()).padStart(2, '0')
  if (typeof v === 'number') {
    const s = Math.round(v * 86400)
    return Math.floor(s / 3600) + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  }
  if (typeof v === 'string') return v.slice(0, 12)
  return null
}

async function lerEscalaZonaSul() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(BASE + '/ESCALA ZONA SUL - MAIO (7).xlsx')
  // procurar aba com "20"
  let ws = wb.worksheets.find(w => w.name.includes('20'))
  if (!ws) ws = wb.worksheets[0]
  console.error('Aba escala ZS usada:', ws.name)
  const linhas = []
  ws.eachRow((row, rn) => {
    if (rn < 3) return
    const loja = cv(row.getCell(1))
    if (!loja || loja.startsWith('REDE') || loja.startsWith('REDES') || loja === 'REDES / FILIAIS') return
    const placa1 = normPlaca(cv(row.getCell(4)))
    const placa2 = normPlaca(cv(row.getCell(10)) || cv(row.getCell(7)))
    const mot1 = cv(row.getCell(2))
    const cod1 = cv(row.getCell(3))
    const mot2 = cv(row.getCell(8)) || cv(row.getCell(5))
    const cod2 = cv(row.getCell(9)) || cv(row.getCell(6))
    if (placa1 || placa2) linhas.push({ loja, mot1, cod1, placa1, mot2, cod2, placa2 })
  })
  return linhas
}

async function lerUnitrac() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(BASE + '/relatorio_9573.xlsx')
  console.error('Sheets Unitrac:', wb.worksheets.length)
  const veiculos = {}
  for (const ws of wb.worksheets) {
    // placa = nome da aba
    const placa = normPlaca(ws.name)
    if (!placa || placa.length < 5) continue
    const paradas = []
    let rowNum = 7
    while (true) {
      const row = ws.getRow(rowNum)
      const col2 = cv(row.getCell(2))
      if (!col2) break
      const chegadaV = row.getCell(3).value
      const saidaV = row.getCell(4).value
      const durV = cv(row.getCell(5))
      const local = cv(row.getCell(11))
      const chegada = toHHMM(chegadaV)
      const saida = toHHMM(saidaV)
      paradas.push({ local, chegada, saida, dur: durV })
      rowNum++
    }
    veiculos[placa] = paradas
  }
  return veiculos
}

async function lerKpi(path) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.worksheets[0]
  const map = {}
  for (let r = 5; r <= 70; r++) {
    const row = ws.getRow(r)
    const loja = cv(row.getCell(1))
    if (!loja) continue
    const g = c => toHHMM(row.getCell(c).value) || '---'
    const gt = c => {
      const v = row.getCell(c).value
      if (typeof v === 'string' && (v.includes('SEM') || v.includes('NÃO'))) return v.slice(0, 3)
      return g(c)
    }
    map[loja] = {
      placa1: cv(row.getCell(4)), sc1: gt(5), chd1: gt(6), sl1: gt(7),
      placa2: cv(row.getCell(10)), sc2: gt(11), chd2: gt(12), sl2: gt(13),
    }
  }
  return map
}

// variantes OCR comuns
function ocr(placa) {
  const alts = new Set()
  const swaps = [['0','O'],['1','I'],['5','S'],['8','B'],['E','3'],['J','I'],['Q','O']]
  for (const [a,b] of swaps) {
    alts.add(placa.replace(new RegExp(a,'g'), b))
    alts.add(placa.replace(new RegExp(b,'g'), a))
  }
  alts.delete(placa)
  return [...alts]
}

async function main() {
  const [escala, unitrac, kpiM, kpiG] = await Promise.all([
    lerEscalaZonaSul(),
    lerUnitrac(),
    lerKpi('C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-20.xlsx'),
    lerKpi('C:/Users/media/Downloads/KPI-ZONA_SUL-2026-05-20 (5).xlsx'),
  ])

  const placasUnitrac = new Set(Object.keys(unitrac))

  console.log('=== ANÁLISE PLACA A PLACA — ZONA SUL DIA 20 ===\n')

  const placasEscala = new Set()
  let totalDiff = 0, totalOk = 0, semGps = 0, ocrAchado = 0

  for (const linha of escala) {
    for (const slot of [1, 2]) {
      const placa = slot === 1 ? linha.placa1 : linha.placa2
      const mot = slot === 1 ? linha.mot1 : linha.mot2
      const cod = slot === 1 ? linha.cod1 : linha.cod2
      if (!placa) continue
      placasEscala.add(placa)

      // checar GPS
      let gpsPlaca = placa
      let temUnitrac = placasUnitrac.has(placa)
      if (!temUnitrac) {
        const v = ocr(placa).find(x => placasUnitrac.has(x))
        if (v) { gpsPlaca = v; temUnitrac = true; ocrAchado++ }
      }

      const paradas = temUnitrac ? unitrac[gpsPlaca] : []
      const pLoja = paradas.filter(p =>
        p.local && (p.local.match(/LOJA|Zona Sul|ZS|Filial|Loja/i))
      )
      const pBase = paradas.filter(p =>
        p.local && (p.local.match(/BASE|CD|Transmonseg|Deposito|Depósito/i))
      )
      const pForaBase = paradas.filter(p =>
        p.local && p.local.match(/FORA_BASE|FORA BASE/i)
      )

      // KPI manual e gerado para esta loja/slot
      const km = kpiM[linha.loja] || {}
      const kg = kpiG[linha.loja] || {}
      const mVal = slot === 1
        ? [km.sc1||'---', km.chd1||'---', km.sl1||'---']
        : [km.sc2||'---', km.chd2||'---', km.sl2||'---']
      const gVal = slot === 1
        ? [kg.sc1||'---', kg.chd1||'---', kg.sl1||'---']
        : [kg.sc2||'---', kg.chd2||'---', kg.sl2||'---']

      const diff = mVal.join('/') !== gVal.join('/')

      if (diff) totalDiff++; else totalOk++
      if (!temUnitrac) semGps++

      const gpsInfo = temUnitrac
        ? `GPS:SIM [${paradas.length}p total | ${pBase.length}BASE | ${pLoja.length}LOJA | ${pForaBase.length}FORA]${gpsPlaca !== placa ? ' OCR:'+gpsPlaca : ''}`
        : 'GPS:NAO'

      console.log(`\n${diff ? '[DIFF]' : '[OK]  '} ${linha.loja}`)
      console.log(`       ${mot} | cód:${cod} | placa:${placa} | ${gpsInfo}`)

      // paradas do Unitrac (BASE e LOJA)
      if (temUnitrac) {
        const saidasBase = pBase.filter(p => p.saida).slice(-3)
        if (saidasBase.length) {
          for (const p of saidasBase) {
            console.log(`       BASE  ${p.chegada}-${p.saida} [${p.dur}] ${p.local.slice(0,50)}`)
          }
        }
        if (pLoja.length) {
          for (const p of pLoja) {
            console.log(`       LOJA  ${p.chegada}-${p.saida} [${p.dur}] ${p.local.slice(0,60)}`)
          }
        } else if (pForaBase.length > 0 && pBase.length === 0) {
          console.log(`       TODAS AS PARADAS SÃO FORA_BASE (${pForaBase.length})`)
          for (const p of pForaBase.slice(0,5)) {
            console.log(`       FB    ${p.chegada}-${p.saida} [${p.dur}] ${p.local.slice(0,50)}`)
          }
        } else if (pLoja.length === 0 && pBase.length > 0) {
          console.log(`       SEM PARADAS LOJA no Unitrac (só BASE)`)
        }
      }

      console.log(`       MANUAL : ${mVal.join(' / ')}`)
      console.log(`       GERADO : ${gVal.join(' / ')}`)
    }
  }

  console.log('\n=== PLACAS NO UNITRAC NÃO ENCONTRADAS NA ESCALA ===')
  for (const p of placasUnitrac) {
    if (!placasEscala.has(p)) console.log(`  ${p} (${unitrac[p].length} paradas)`)
  }

  console.log(`\n=== RESUMO ===`)
  console.log(`OK: ${totalOk} | DIFF: ${totalDiff} | SEM GPS: ${semGps} | OCR-variante: ${ocrAchado}`)
}

main().catch(e => { console.error('ERRO:', e.stack); process.exit(1) })
