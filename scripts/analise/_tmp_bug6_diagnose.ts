/**
 * Bug 6 — Investigacao dos 10 casos de SL muito curta dia 19.
 *
 * Para cada caso (placa + janela aproximada da loja), dumpa todas as paradas
 * (LOJA/FORA_BASE/BASE/FAKE_EXIT) da placa no dia 19 com:
 *   - tipo, classificacao
 *   - chegada/saida (BRT mascarado UTC)
 *   - duracao (min)
 *   - dist da loja (m) quando lat/lng disponivel
 *   - codigo_loja / local_parada
 *
 * Output: docs/auditoria/dia-19-reanalise/bug-6-<loja>-diagnose.txt
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { variantesOcr } from '@/lib/kpi/matcher'
import { haversine } from '@/lib/utils/geo'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const OUT = 'docs/auditoria/dia-19-reanalise'
mkdirSync(OUT, { recursive: true })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

function fmtT(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getUTCHours()).padStart(2, '0')}:${String(dt.getUTCMinutes()).padStart(2, '0')}`
}
function durMin(seg: number | null | undefined): string {
  if (seg == null) return '---'
  return `${Math.round(seg / 60)}min`
}

interface Caso {
  rede: string
  loja_token: string // pra grep no nome
  placa: string
  manualSL: string
}

// Casos do plano. Placas extraidas via auditoria existente.
const CASOS: Caso[] = [
  { rede: 'ZONA_SUL',  loja_token: 'Loja 43', placa: 'AFY7J99', manualSL: '16:55' },
  { rede: 'ZONA_SUL',  loja_token: 'Loja 45', placa: '', manualSL: '18:00' },
  { rede: 'ATACADAO',  loja_token: 'MANILHA', placa: 'QSS1E48', manualSL: '10:20' },
  { rede: 'CARREFOUR', loja_token: 'SULACAP', placa: '', manualSL: '07:15' },
  { rede: 'PREZUNIC',  loja_token: 'CAXIAS CENTRO', placa: '', manualSL: '06:30' },
  { rede: 'GUANABARA', loja_token: 'BENTO RIBEIRO', placa: 'LBB5205', manualSL: '12:50' },
  { rede: 'GUANABARA', loja_token: 'BONSUCESSO', placa: '', manualSL: '11:55' },
  { rede: 'ASSAI',     loja_token: 'MACAE', placa: '', manualSL: '10:30' },
  { rede: 'PRINCESA',  loja_token: 'BUZIOS', placa: '', manualSL: '17:30' },
  { rede: 'PREZUNIC',  loja_token: 'FONSECA', placa: 'KQV1D80', manualSL: '09:30' }, // controle
]

;(async () => {
  const data = '2026-05-19'
  const dataFonseca = '2026-05-20' // Fonseca eh do dia 20

  // Lojas com lat/lng
  const { data: lojas } = await sb.from('lojas')
    .select('id, rede_id, nome, lat, lng, raio_metros')
    .eq('ativo', true)

  // Escala de TODOS os dias (19 e 20)
  const { data: escalaLinhas } = await sb.from('escala_linhas')
    .select('id, rede_id, placa_norm, loja_nome_raw, motorista_nome, carro_ordem, data_entrega')
    .in('data_entrega', [data, dataFonseca])

  // Carrega XLSX Unitrac dia 19 e dia 20
  const carregaParadasPlaca = async (dia: string, placa: string) => {
    const pasta = `${BASE}/ESCALA DIA ${dia.split('-')[2]}`
    const files = readdirSync(pasta)
    const xlsx = files.find((f) => /relatorio.*\.xlsx$/i.test(f))
    if (!xlsx) return []
    const veiculos = await parseUnitrac(readFileSync(`${pasta}/${xlsx}`))
    const placaVars = new Set(variantesOcr(placa))
    const out: any[] = []
    for (const v of veiculos) {
      if (!placaVars.has(v.placa_norm)) continue
      for (const p of v.paradas) out.push({ ...p, placa_norm: v.placa_norm })
    }
    return out.sort((a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())
  }

  // Descobre placa quando nao temos no caso
  const findPlaca = (rede: string, lojaToken: string, dataDia: string): string | null => {
    const matches = (escalaLinhas || []).filter((l: any) =>
      l.rede_id === rede &&
      l.data_entrega === dataDia &&
      l.placa_norm &&
      new RegExp(lojaToken, 'i').test(l.loja_nome_raw || ''),
    )
    if (matches.length === 0) return null
    // pega a 1ª
    return matches[0].placa_norm
  }

  for (const caso of CASOS) {
    const dataDia = caso.loja_token === 'FONSECA' ? dataFonseca : data
    let placa = caso.placa
    if (!placa) {
      placa = findPlaca(caso.rede, caso.loja_token, dataDia) || ''
    }
    if (!placa) {
      console.log(`!!! ${caso.rede} ${caso.loja_token}: placa nao encontrada — pulando`)
      continue
    }

    // Encontra a loja no cadastro
    const loja = (lojas || []).find((l: any) =>
      l.rede_id === caso.rede &&
      new RegExp(caso.loja_token, 'i').test(l.nome),
    )
    const lojaLat = loja?.lat ?? null
    const lojaLng = loja?.lng ?? null

    const paradas = await carregaParadasPlaca(dataDia, placa)

    const lines: string[] = []
    lines.push(`# Bug 6 diagnose — ${caso.rede} ${caso.loja_token} (dia ${dataDia})`)
    lines.push('')
    lines.push(`Placa: ${placa}`)
    lines.push(`Loja cadastro: ${loja?.nome ?? '(nao encontrada)'}  lat=${lojaLat} lng=${lojaLng}  raio=${loja?.raio_metros ?? '---'}m`)
    lines.push(`Manual SL: ${caso.manualSL}`)
    lines.push('')
    lines.push('## Todas as paradas dia (placa)')
    lines.push('')
    lines.push('| # | classif | chegada | saida | dur | dist→loja | codigo | local |')
    lines.push('|---|---------|---------|-------|-----|-----------|--------|-------|')
    for (let i = 0; i < paradas.length; i++) {
      const p = paradas[i]
      const dist = (lojaLat != null && p.lat != null) ? Math.round(haversine(lojaLat, lojaLng!, p.lat, p.lng!)) : null
      lines.push(`| ${i} | ${p.classificacao} | ${fmtT(p.chegada)} | ${fmtT(p.saida)} | ${durMin(p.duracao_seg)} | ${dist == null ? '---' : `${dist}m`} | ${p.codigo_loja || '---'} | ${(p.local_parada || '').slice(0, 50)} |`)
    }
    lines.push('')

    // Tenta identificar a parada LOJA que casou (mesma loja por codigo_loja
    // contendo token ou local_parada matching).
    const lojaParadas = paradas.filter((p: any) =>
      p.classificacao === 'LOJA' &&
      (
        new RegExp(caso.loja_token, 'i').test(p.local_parada || '') ||
        (lojaLat != null && p.lat != null && haversine(lojaLat, lojaLng!, p.lat, p.lng!) < 200)
      ),
    )
    lines.push('## Parada LOJA candidata (mesma loja)')
    lines.push('')
    if (lojaParadas.length === 0) {
      lines.push('Nenhuma parada LOJA matched.')
    } else {
      for (const lp of lojaParadas) {
        lines.push(`- ${fmtT(lp.chegada)}→${fmtT(lp.saida)} dur=${durMin(lp.duracao_seg)} dist=${lojaLat != null && lp.lat != null ? Math.round(haversine(lojaLat, lojaLng!, lp.lat, lp.lng!)) : '---'}m`)

        // Vizinhança 2h ao redor da saida da LOJA
        const lpSaidaTs = lp.saida ? new Date(lp.saida).getTime() : null
        if (lpSaidaTs) {
          lines.push(`  Vizinhos depois (gap, classif, dur, dist→loja):`)
          for (const v of paradas) {
            const vCheg = new Date(v.chegada).getTime()
            if (vCheg <= lpSaidaTs) continue
            const gapMin = Math.round((vCheg - lpSaidaTs) / 60000)
            if (gapMin > 120) break
            const dist = (lojaLat != null && v.lat != null) ? Math.round(haversine(lojaLat, lojaLng!, v.lat, v.lng!)) : null
            lines.push(`    +${gapMin}min  ${v.classificacao}  ${fmtT(v.chegada)}→${fmtT(v.saida)}  dur=${durMin(v.duracao_seg)}  dist=${dist == null ? '---' : `${dist}m`}  ${(v.local_parada || '').slice(0, 40)}`)
          }
        }
      }
    }
    lines.push('')

    const safeName = `${caso.rede}-${caso.loja_token}`.replace(/[^a-zA-Z0-9_-]/g, '_')
    const outFile = `${OUT}/bug-6-${safeName}-diagnose.txt`
    writeFileSync(outFile, lines.join('\n'))
    console.log(`  ${outFile} (${paradas.length} paradas, ${lojaParadas.length} LOJA-candidata)`)
  }

  process.exit(0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
