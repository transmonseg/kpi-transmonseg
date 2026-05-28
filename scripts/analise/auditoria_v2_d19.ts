/**
 * AUDITORIA V2 — gerado (sem geo) × manual, dia 19, lendo OS DOIS CARROS.
 * Cada loja pode ter 2 entregas (1º e 2º carro), cada uma com sua placa.
 * Casa por PLACA dentro da loja; compara chegada+saída com tolerância 10min.
 * Conta cada ENTREGA (loja+carro), não cada loja.
 */
import ExcelJS from 'exceljs'

const MANUAL_DIR = 'C:/Users/media/Downloads/KPI SMANUAIS'
const BETA_DIR = 'docs/conversas-tia-erica/kpi-beta'
const DIA = '2026-05-19'
const TOL = 10

const PARES: Array<[string, string]> = [
  ['ARMAZEM_GRAO', 'KPI ARMAZEM DO GRAO (2).xlsx'], ['ASSAI', 'KPI ASSAI (4).xlsx'],
  ['ATACADAO', 'KPI ATACADAO (4).xlsx'], ['CARREFOUR', 'KPI CARREFOUR (4).xlsx'],
  ['GUANABARA', 'KPI GUANABARA (4).xlsx'], ['PREZUNIC', 'KPI PREZUNIC (6).xlsx'],
  ['PRINCESA', 'KPI PRINCESA (11).xlsx'], ['SUPER_PAX', 'KPI SUPERPAX.xlsx'],
  ['SUPERPRIX', 'KPI SUPERPRIX (4).xlsx'], ['ZONA_SUL', 'KPI ZONA SUL.xlsx'],
]

function norm(s: string) {
  let x = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/FILIAL/g, 'F').replace(/\bLOJA\b/g, '').replace(/[^A-Z0-9]+/g, ' ').trim()
  x = x.replace(/^(PAX|GB|ASSAI|SENDAS|PREZUNIC|CARREFOUR|PRINCESA|SUPERPRIX|ATACADAO|GUANABARA|VIANENSE|SAM ?S|MUNDIAL|ZONA SUL)\s+/, '')
  x = x.replace(/\s*\d*\s*CARRO.*$/, '').trim()
  return x
}
function placaNorm(s: string) { return s.replace(/[^A-Z0-9]/gi, '').toUpperCase() }
function ct(v: any): string { if (v == null) return ''; if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2, '0')}:${String(v.getUTCMinutes()).padStart(2, '0')}`; if (typeof v === 'object') { if (v.text) return v.text; if (v.result != null) return ct(v.result); if (v.richText) return v.richText.map((r: any) => r.text).join(''); return '' } return String(v).trim() }
function toMin(s: string) { const m = s.match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null }

// Acha colunas dos 2 carros pelo header
type Slot = { placa: number; chd: number; sai: number }
function acharSlots(ws: ExcelJS.Worksheet, hr: number): Slot[] {
  const row = ws.getRow(hr)
  const placas: number[] = [], chds: number[] = [], sais: number[] = []
  for (let c = 1; c <= ws.columnCount; c++) {
    const t = ct(row.getCell(c).value).toUpperCase().replace(/\s+/g, ' ')
    if (/^PLACA/.test(t)) placas.push(c)
    else if (/CH?D LOJA|CHEGAD/.test(t)) chds.push(c)
    else if (/SAIDA LOJA/.test(t)) sais.push(c)
  }
  const slots: Slot[] = []
  for (let i = 0; i < placas.length; i++) {
    if (chds[i] != null && sais[i] != null) slots.push({ placa: placas[i], chd: chds[i], sai: sais[i] })
  }
  return slots
}
type Ent = { placa: string; chd: number | null; sai: number | null; sem: boolean; naofoi: boolean }
function lerEntregas(ws: ExcelJS.Worksheet): Map<string, Ent[]> {
  let hr = -1
  for (let r = 1; r <= 10; r++) if (/REDES|FILIAIS/i.test(ct(ws.getRow(r).getCell(1).value))) { hr = r; break }
  if (hr < 0) hr = 3
  const slots = acharSlots(ws, hr)
  const mapa = new Map<string, Ent[]>()
  for (let r = hr + 1; r <= ws.rowCount; r++) {
    const loja = ct(ws.getRow(r).getCell(1).value)
    if (!loja || /^REDES|TOTAL|^\s*$/.test(loja)) continue
    const key = norm(loja); if (!key) continue
    const ents: Ent[] = []
    for (const s of slots) {
      const placa = placaNorm(ct(ws.getRow(r).getCell(s.placa).value))
      const linhaTxt = `${ct(ws.getRow(r).getCell(s.chd).value)} ${ct(ws.getRow(r).getCell(s.sai).value)} ${ct(ws.getRow(r).getCell(s.chd - 1).value)}`.toUpperCase()
      const sem = /SEM\s*RASTREAD/.test(linhaTxt)
      const naofoi = /N[ÃA]O\s*FOI/.test(linhaTxt)
      const chd = toMin(ct(ws.getRow(r).getCell(s.chd).value))
      const sai = toMin(ct(ws.getRow(r).getCell(s.sai).value))
      if (placa || chd != null || sem || naofoi) ents.push({ placa, chd, sai, sem, naofoi })
    }
    mapa.set(key, (mapa.get(key) ?? []).concat(ents))
  }
  return mapa
}
function bate(a: Ent, b: Ent) {
  for (const f of ['chd', 'sai'] as const) {
    const av = a[f], bv = b[f]
    if (av == null && bv == null) continue
    if (av == null || bv == null) return false
    if (Math.abs(av - bv) > TOL) return false
  }
  return true
}

;(async () => {
  console.log(`\n## AUDITORIA V2 (2 carros, casa por placa) — dia 19, tol ${TOL}min\n`)
  console.log('| Rede | Entregas c/ horário (manual) | Sistema bateu | Precisão | Sistema vazio (manual tinha) |')
  console.log('|------|:--:|:--:|:--:|:--:|')
  let tMan = 0, tOk = 0, tPerd = 0
  const erros: string[] = []
  for (const [rede, fm] of PARES) {
    const wbM = new ExcelJS.Workbook(); await wbM.xlsx.readFile(`${MANUAL_DIR}/${fm}`)
    const wbB = new ExcelJS.Workbook(); await wbB.xlsx.readFile(`${BETA_DIR}/KPI-${rede}-${DIA}-BETA.xlsx`)
    const M = lerEntregas(wbM.getWorksheet('19') ?? wbM.worksheets[0])
    const B = lerEntregas(wbB.worksheets[0])
    let man = 0, ok = 0, perd = 0
    for (const [loja, entsM] of M) {
      const entsB = B.get(loja) ?? []
      for (const em of entsM) {
        if (em.chd == null) continue // só conta entregas que o manual preencheu com horário
        man++
        // acha entrega no sistema pela mesma placa (ou, se sem placa, qualquer com horário)
        let eb = em.placa ? entsB.find(x => x.placa === em.placa) : undefined
        if (!eb) eb = entsB.find(x => x.chd != null)
        if (eb && eb.chd != null && bate(em, eb)) ok++
        else if (!eb || eb.chd == null) { perd++ }
        else { erros.push(`[${rede}] ${loja} placa ${em.placa}: manual ${em.chd}/${em.sai} ≠ sistema ${eb.chd}/${eb.sai}`) }
      }
    }
    const prec = man > 0 ? Math.round(100 * ok / man) : 0
    console.log(`| ${rede} | ${man} | ${ok} | ${prec}% | ${perd} |`)
    tMan += man; tOk += ok; tPerd += perd
  }
  console.log(`| **TOTAL** | **${tMan}** | **${tOk}** | **${Math.round(100 * tOk / tMan)}%** | **${tPerd}** |`)
  console.log(`\n### Erros de horário (${erros.length})`)
  erros.slice(0, 30).forEach(e => console.log('  ' + e))
})().catch(e => { console.error(e); process.exit(1) })
