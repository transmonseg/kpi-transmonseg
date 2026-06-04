/**
 * Extrai TODAS as lojas (códigos com nome) que aparecem nos 5 relatórios Unitrac.
 * Pra cada loja única, calcula:
 *   - nome canônico
 *   - lat/lng médio (centro do geofence)
 *   - lat/lng MIN/MAX (extensão do geofence — diferencia LOJA INDIVIDUAL de ROTA GIGANTE)
 *   - placas distintas que passaram lá
 *   - frequência total
 *
 * Output: docs/correcao-sistema/lojas-no-unitrac.md
 */
import { readFileSync, writeFileSync } from 'fs'
 
const XLSX = require('xlsx') as typeof import('xlsx')

const RELATORIOS = [
  { dia: 18, path: 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 18/relatorio_9402.xlsx' },
  { dia: 19, path: 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19/relatorio_9391.xlsx' },
  { dia: 20, path: 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20/relatorio_9573.xlsx' },
  { dia: 21, path: 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 21/relatorio_9552.xlsx' },
  { dia: 22, path: 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 22/relatorio_9588.xlsx' },
]

interface Ocorrencia {
  codigo: string  // "8590565"
  nome: string    // "PRINCESA - CABO FRIO 1"
  lat: number
  lng: number
  placa: string
  dia: number
}

function main() {
  const ocorrencias: Ocorrencia[] = []

  for (const { dia, path } of RELATORIOS) {
    let wb
    try { wb = XLSX.read(readFileSync(path)) } catch { console.error(`Dia ${dia} falhou`); continue }

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName]
      if (!sheet) continue
      const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:Z100')
      const placa = sheetName

      for (let r = 7; r <= range.e.r + 1; r++) {
        const get = (c: number): unknown => {
          const cellObj = sheet[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })]
          return cellObj ? (cellObj.v ?? cellObj.w) : null
        }
        const lat = Number(get(9))
        const lng = Number(get(10))
        const local = String(get(11) ?? '').trim()
        if (!local || isNaN(lat) || isNaN(lng)) continue

        // Local da Parada pode ter múltiplos códigos separados por vírgula
        // Ex: "BASE BENASSI - BASE BENASSI, 7012010 - CAB - PETROPOLIS"
        const partes = local.split(/,(?=\s*\d)/)  // separa por vírgula seguida de dígitos
        for (let p of partes) {
          p = p.trim()
          if (!p) continue
          // Pula BASE BENASSI e FORA DE BASE
          if (/^BASE BENASSI/i.test(p)) continue
          if (/^FORA DE BASE/i.test(p)) continue
          // Match formato "CODIGO - NOME"
          const m = p.match(/^(\d+)\s*-\s*(.+)$/)
          if (!m) continue
          const codigo = m[1].trim()
          const nome = m[2].trim()
          ocorrencias.push({ codigo, nome, lat, lng, placa, dia })
        }
      }
    }
    console.log(`Dia ${dia}: processado`)
  }

  console.log(`Total ocorrências: ${ocorrencias.length}`)

  // Agregar por código
  const porCodigo = new Map<string, Ocorrencia[]>()
  for (const o of ocorrencias) {
    const arr = porCodigo.get(o.codigo) ?? []
    arr.push(o)
    porCodigo.set(o.codigo, arr)
  }

  console.log(`Códigos únicos: ${porCodigo.size}`)

  // Pra cada código, calcular estatísticas
  interface LojaStat {
    codigo: string
    nomes: string[]
    nomePrincipal: string
    paradas: number
    placasDistintas: number
    diasDistintos: number
    latMin: number; latMax: number; latMedio: number
    lngMin: number; lngMax: number; lngMedio: number
    raioEstimado: number  // extensão geográfica em metros
    classificacao: 'LOJA_INDIVIDUAL' | 'ROTA_GIGANTE'
  }

  function haversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000
    const toRad = (x: number) => (x * Math.PI) / 180
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(a))
  }

  const stats: LojaStat[] = []
  for (const [codigo, arr] of porCodigo) {
    const nomes = [...new Set(arr.map(o => o.nome))]
    const lats = arr.map(o => o.lat)
    const lngs = arr.map(o => o.lng)
    const latMin = Math.min(...lats), latMax = Math.max(...lats)
    const lngMin = Math.min(...lngs), lngMax = Math.max(...lngs)
    const latMedio = lats.reduce((a, b) => a + b, 0) / lats.length
    const lngMedio = lngs.reduce((a, b) => a + b, 0) / lngs.length
    const raioEstimado = haversineMetros(latMin, lngMin, latMax, lngMax) / 2
    const classificacao: LojaStat['classificacao'] = raioEstimado > 5000 ? 'ROTA_GIGANTE' : 'LOJA_INDIVIDUAL'
    stats.push({
      codigo,
      nomes,
      nomePrincipal: nomes[0],
      paradas: arr.length,
      placasDistintas: new Set(arr.map(o => o.placa)).size,
      diasDistintos: new Set(arr.map(o => o.dia)).size,
      latMin, latMax, latMedio,
      lngMin, lngMax, lngMedio,
      raioEstimado,
      classificacao,
    })
  }

  stats.sort((a, b) => b.paradas - a.paradas)

  // Gerar relatório MD
  const md: string[] = []
  md.push('# Lojas extraídas dos relatórios Unitrac (5 dias)')
  md.push('')
  md.push(`Total ocorrências: ${ocorrencias.length}`)
  md.push(`Códigos únicos: ${stats.length}`)
  md.push(`Lojas INDIVIDUAIS (raio < 5km): ${stats.filter(s => s.classificacao === 'LOJA_INDIVIDUAL').length}`)
  md.push(`Geofences ROTA GIGANTES (raio ≥ 5km): ${stats.filter(s => s.classificacao === 'ROTA_GIGANTE').length}`)
  md.push('')
  md.push('## ROTAS GIGANTES (descartar do matching por código)')
  md.push('')
  md.push('| Código | Nome | Paradas | Placas | Dias | Raio (km) |')
  md.push('|--------|------|---------|--------|------|-----------|')
  for (const s of stats.filter(s => s.classificacao === 'ROTA_GIGANTE')) {
    md.push(`| ${s.codigo} | ${s.nomePrincipal.slice(0, 50)} | ${s.paradas} | ${s.placasDistintas} | ${s.diasDistintos} | ${(s.raioEstimado / 1000).toFixed(1)} |`)
  }
  md.push('')
  md.push('## LOJAS INDIVIDUAIS')
  md.push('')
  md.push('| Código | Nome | Paradas | Placas | Dias | Lat,Lng | Raio (m) |')
  md.push('|--------|------|---------|--------|------|---------|----------|')
  for (const s of stats.filter(s => s.classificacao === 'LOJA_INDIVIDUAL')) {
    md.push(`| ${s.codigo} | ${s.nomePrincipal.slice(0, 50)} | ${s.paradas} | ${s.placasDistintas} | ${s.diasDistintos} | ${s.latMedio.toFixed(5)},${s.lngMedio.toFixed(5)} | ${Math.round(s.raioEstimado)} |`)
  }
  md.push('')

  // JSON estruturado pra próximo passo
  const jsonOut = stats.map(s => ({
    codigo: s.codigo,
    nome: s.nomePrincipal,
    nomes_alternativos: s.nomes.length > 1 ? s.nomes : undefined,
    classificacao: s.classificacao,
    lat: s.latMedio,
    lng: s.lngMedio,
    raio_metros: Math.round(s.raioEstimado),
    paradas: s.paradas,
    placas_distintas: s.placasDistintas,
    dias_distintos: s.diasDistintos,
  }))

  writeFileSync('docs/correcao-sistema/lojas-no-unitrac.md', md.join('\n'), 'utf8')
  writeFileSync('docs/correcao-sistema/lojas-no-unitrac.json', JSON.stringify(jsonOut, null, 2), 'utf8')

  console.log('Relatórios:')
  console.log('  docs/correcao-sistema/lojas-no-unitrac.md')
  console.log('  docs/correcao-sistema/lojas-no-unitrac.json')
}

main()
