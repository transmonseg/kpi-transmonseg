/**
 * Detecta lojas com mesma localização GPS mas CÓDIGOS DIFERENTES no Unitrac.
 *
 * Bug confirmado pela Tia Erica (27/05): cliente cadastra a MESMA loja física
 * com 2+ códigos diferentes (Assai Freguesia + Sendas Freguesia mesma coord),
 * ou cadastra geofences sobrepostos (Regina Lúcio + Emanuel Vargem Grande
 * + Armazém Grão da Serra todos no mesmo endereço).
 *
 * Estratégia: clusteriza paradas LOJA por proximidade (≤100m) e reporta
 * grupos com 2+ codigo_loja distintos.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync, writeFileSync } from 'fs'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const PDFS = [
  ['19', 'docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'],
  ['20', 'docs/conversas-tia-erica/dia-20/unitrac/relatorio_9522.pdf'],
  ['25', 'docs/conversas-tia-erica/dia-25/unitrac/relatorio_9652.pdf'],
] as const

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180
  const df = (lat2 - lat1) * Math.PI / 180, dl = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(df/2)**2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl/2)**2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

type Pt = { cod: string; nome: string; lat: number; lng: number; placa: string; dia: string }

;(async () => {
  // Coletar TODAS as paradas LOJA de 3 dias
  const pts: Pt[] = []
  for (const [dia, pdf] of PDFS) {
    const veiculos = await parseUnitracPdf(readFileSync(pdf), null)
    for (const v of veiculos) {
      for (const p of v.paradas) {
        if (p.classificacao !== 'LOJA') continue
        if (!p.codigo_loja || p.lat == null || p.lng == null) continue
        pts.push({
          cod: p.codigo_loja,
          nome: (p.nome_loja ?? '').replace(/\s+/g, ' ').trim(),
          lat: p.lat,
          lng: p.lng,
          placa: v.placa_norm,
          dia,
        })
      }
    }
  }
  console.log(`Total paradas LOJA: ${pts.length}`)

  // Indexar por cod_loja → centro médio + lista de nomes
  type CodInfo = {
    cod: string
    nomes: Set<string>
    lats: number[]
    lngs: number[]
    placas: Set<string>
    dias: Set<string>
  }
  const byCod = new Map<string, CodInfo>()
  for (const p of pts) {
    const x = byCod.get(p.cod) ?? { cod: p.cod, nomes: new Set(), lats: [], lngs: [], placas: new Set(), dias: new Set() }
    x.nomes.add(p.nome)
    x.lats.push(p.lat)
    x.lngs.push(p.lng)
    x.placas.add(p.placa)
    x.dias.add(p.dia)
    byCod.set(p.cod, x)
  }
  console.log(`Total cods únicos: ${byCod.size}`)

  // Centro mediano por cod (mais robusto que média p/ ruído GPS)
  const centroCod = new Map<string, { lat: number; lng: number; nome: string; placas: number; dias: number }>()
  for (const [cod, info] of byCod) {
    const lats = [...info.lats].sort((a, b) => a - b)
    const lngs = [...info.lngs].sort((a, b) => a - b)
    const lat = lats[Math.floor(lats.length / 2)]
    const lng = lngs[Math.floor(lngs.length / 2)]
    centroCod.set(cod, { lat, lng, nome: [...info.nomes][0] ?? '?', placas: info.placas.size, dias: info.dias.size })
  }

  // Clusterizar cods por proximidade ≤ 100m
  const cods = [...centroCod.keys()]
  const usados = new Set<string>()
  type Cluster = { cods: string[]; centro: { lat: number; lng: number } }
  const clusters: Cluster[] = []
  for (const c of cods) {
    if (usados.has(c)) continue
    const cc = centroCod.get(c)!
    const grupo: string[] = [c]
    usados.add(c)
    for (const c2 of cods) {
      if (usados.has(c2)) continue
      const cc2 = centroCod.get(c2)!
      if (haversine(cc.lat, cc.lng, cc2.lat, cc2.lng) <= 100) {
        grupo.push(c2)
        usados.add(c2)
      }
    }
    if (grupo.length >= 2) {
      clusters.push({ cods: grupo, centro: { lat: cc.lat, lng: cc.lng } })
    }
  }

  // Ordenar clusters por nº de cods
  clusters.sort((a, b) => b.cods.length - a.cods.length)

  // Inferir rede pelo cod (prefixos conhecidos)
  function inferRede(cod: string): string {
    if (/^9039/.test(cod)) return 'ZONA_SUL'
    if (/^560\d{3}/.test(cod)) return 'ASSAI/SENDAS'
    if (/^71\d{3}/.test(cod)) return 'GUANABARA'
    if (/^7000\d{3}/.test(cod)) return 'PREZUNIC'
    if (/^202\d{3}/.test(cod)) return 'SUPER_PAX'
    if (/^579\d{3}/.test(cod)) return 'FEIRA_NOVA'
    if (/^8590/.test(cod)) return 'PRINCESA'
    if (/^9006/.test(cod)) return 'CARREFOUR'
    if (/^3030/.test(cod)) return 'SUPERPRIX'
    if (/^5353/.test(cod)) return 'ARMAZEM_GRAO'
    if (/^17659/.test(cod)) return 'EMANUEL'
    if (/^4568/.test(cod)) return 'SAMS_CLUB'
    if (/^6018/.test(cod)) return 'MEGA_BOX'
    if (/^11623/.test(cod)) return 'VIANENSE'
    if (/^15247/.test(cod)) return 'SUPERCOMPRAS'
    if (/^21468|^25140|^21469|^11139/.test(cod)) return 'EMANUEL'
    if (/^23843/.test(cod)) return 'ATACADAO'
    if (/^113\d{3}/.test(cod)) return 'MUNDIAL'
    if (/^131\d{3}/.test(cod)) return 'REAL'
    if (/^7012/.test(cod)) return 'CAB_PETROPOLIS'
    if (/^2018/.test(cod)) return 'ROTA'
    if (/^9966/.test(cod)) return '?'
    if (/^25414/.test(cod)) return 'NATURCON'
    if (/^23080/.test(cod)) return 'SANTO_AGOSTINHO'
    return '?'
  }

  // Relatório
  const out: string[] = [
    '# Lojas com MESMA localização + CÓDIGOS DIFERENTES no Unitrac',
    '',
    'Análise dos 3 dias (19/20/25) — clusters de paradas LOJA dentro de 100m',
    'com 2+ codigo_loja distintos. Detecta o bug descrito pela Tia Erica:',
    'cliente cadastra a MESMA loja com vários códigos OU geofences sobrepostos.',
    '',
    `Total clusters problemáticos: **${clusters.length}**`,
    '',
  ]

  // Categorizar
  const mesmaRede: Cluster[] = []
  const redesDiferentes: Cluster[] = []
  for (const cl of clusters) {
    const redes = new Set(cl.cods.map(inferRede))
    if (redes.size === 1) mesmaRede.push(cl)
    else redesDiferentes.push(cl)
  }

  out.push(`## A) Redes DIFERENTES no mesmo lugar (${redesDiferentes.length})`)
  out.push('')
  out.push('Tipo mais grave — cliente cadastrou loja de rede X com cod no lugar de loja Y de outra rede.')
  out.push('')
  for (const cl of redesDiferentes) {
    out.push(`### Cluster @ lat=${cl.centro.lat.toFixed(5)} lng=${cl.centro.lng.toFixed(5)}`)
    for (const cod of cl.cods) {
      const info = centroCod.get(cod)!
      const rede = inferRede(cod)
      out.push(`- **[${rede}]** cod=\`${cod}\` "${info.nome}" — ${info.placas} placas / ${info.dias} dias`)
    }
    out.push('')
  }

  out.push(`## B) Mesma REDE com cods duplicados (${mesmaRede.length})`)
  out.push('')
  out.push('Cliente cadastrou a mesma loja física com 2 códigos diferentes (ou 2 lojas adjacentes muito próximas).')
  out.push('')
  for (const cl of mesmaRede) {
    out.push(`### Cluster @ lat=${cl.centro.lat.toFixed(5)} lng=${cl.centro.lng.toFixed(5)}`)
    for (const cod of cl.cods) {
      const info = centroCod.get(cod)!
      const rede = inferRede(cod)
      out.push(`- **[${rede}]** cod=\`${cod}\` "${info.nome}" — ${info.placas} placas / ${info.dias} dias`)
    }
    out.push('')
  }

  // Sumário por rede
  const porRede = new Map<string, number>()
  for (const cl of clusters) {
    for (const cod of cl.cods) {
      const rede = inferRede(cod)
      porRede.set(rede, (porRede.get(rede) ?? 0) + 1)
    }
  }
  out.push('## Sumário por rede (quantos cods em clusters problemáticos)')
  out.push('')
  out.push('| Rede | Cods em duplicação |')
  out.push('|------|---------------------|')
  const ord = [...porRede.entries()].sort((a, b) => b[1] - a[1])
  for (const [r, n] of ord) out.push(`| ${r} | ${n} |`)

  writeFileSync('docs/conversas-tia-erica/LOJAS-CODIGOS-DUPLICADOS-UNITRAC.md', out.join('\n'))
  console.log(`OK → docs/conversas-tia-erica/LOJAS-CODIGOS-DUPLICADOS-UNITRAC.md`)
  console.log(`Clusters: ${clusters.length} (${redesDiferentes.length} cross-rede + ${mesmaRede.length} mesma rede)`)
})().catch(e => { console.error(e); process.exit(1) })
