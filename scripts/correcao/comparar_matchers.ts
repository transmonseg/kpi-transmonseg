/**
 * Compara matcher v1 (atual, 1200 linhas) vs matcher v2 (simplificado).
 *
 * Roda os dois em todas as escalas dos dias 18-22 que temos.
 * Gera tabela em docs/correcao-sistema/comparativo-matchers.md
 *
 * Decisão go/no-go: se v2 elimina falsos positivos Cat B
 * e ZONA_SUL não regride, fazer merge.
 */
import { readFileSync, writeFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaGuanabaraPdf } from '@/lib/parsers/escala-guanabara-pdf'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import {
  cruzaEscalaUnitrac,
  type EscalaLinhaRow,
  type UnitracParadaRow,
  type LojaRow,
} from '@/lib/kpi/matcher'
import { cruzaEscalaUnitracV2 } from '@/lib/kpi/matcher-v2'
import type { LinhaEscala } from '@/lib/types/escala'
import type { ParadaUnitrac } from '@/lib/types/unitrac'

const BASE_DIR = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'

const DIAS = [
  { data: '2026-05-18', pasta: 'ESCALA DIA 18' },
  { data: '2026-05-19', pasta: 'ESCALA DIA 19' },
  { data: '2026-05-22', pasta: 'ESCALA DIA 22' },
]

const ARQUIVOS_PADRAO = {
  geral: ['ESCALA GERAL DE MAIO 0.xlsx', 'ESCALA GERAL DE MAIO 1 (6).xlsx'],
  pax: ['ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (7).xlsx', 'ESCALA - PAX , FEIRA NOVA , EMANUEL.xlsx', 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (5).xlsx'],
  armazem: ['ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx', 'ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx'],
  zonasul: ['ESCALA ZONA SUL - MAIO (8).xlsx'],
  guanabara: ['ESCALA 23.05.pdf', 'ESCALA 19.05.pdf'],
  unitrac: ['relatorio_9588.xlsx', 'relatorio_9402.xlsx', 'relatorio_9391.xlsx'],
}

function tentarLer(pasta: string, candidatos: string[]): Buffer | null {
  for (const nome of candidatos) {
    try { return readFileSync(`${BASE_DIR}/${pasta}/${nome}`) } catch { /* tenta próximo */ }
  }
  return null
}

async function carregarEscalas(pasta: string, data: string): Promise<LinhaEscala[]> {
  const todas: LinhaEscala[] = []
  const bufs = [
    [ARQUIVOS_PADRAO.geral, parseEscalaGeral],
    [ARQUIVOS_PADRAO.pax, parseEscalaPax],
    [ARQUIVOS_PADRAO.armazem, parseEscalaArmazemGrao],
    [ARQUIVOS_PADRAO.zonasul, parseEscalaZonaSul],
    [ARQUIVOS_PADRAO.guanabara, parseEscalaGuanabaraPdf],
  ] as const
  for (const [candidatos, parser] of bufs) {
    const buf = tentarLer(pasta, candidatos as string[])
    if (!buf) continue
    try { todas.push(...await parser(buf, data)) } catch { /* erro silencioso */ }
  }
  return todas
}

async function carregarUnitrac(pasta: string): Promise<ParadaUnitrac[]> {
  const buf = tentarLer(pasta, ARQUIVOS_PADRAO.unitrac)
  if (!buf) return []
  try {
    const veiculos = await parseUnitrac(buf)
    return veiculos.flatMap(v => v.paradas)
  } catch { return [] }
}

function toEscalaRow(l: LinhaEscala, idx: number): EscalaLinhaRow {
  return {
    id: `fake-${idx}`,
    rede_id: l.rede_id,
    placa_norm: l.placa_norm,
    loja_nome_raw: l.loja_nome_raw,
    loja_codigo_raw: l.loja_codigo_raw,
    motorista_nome: l.motorista_nome,
    carro_ordem: l.carro_ordem,
    data_entrega: l.data_entrega,
    sub_rede: l.sub_rede ?? null,
  }
}

function toParadaRow(p: ParadaUnitrac, idx: number): UnitracParadaRow {
  return {
    id: `p-${idx}`,
    placa_norm: p.placa_norm,
    chegada: p.chegada instanceof Date ? p.chegada.toISOString() : String(p.chegada),
    saida: p.saida instanceof Date ? p.saida.toISOString() : (p.saida ? String(p.saida) : null),
    duracao_seg: p.duracao_seg ?? null,
    local_parada: p.local_parada ?? '',
    codigo_loja: p.codigo_loja ?? null,
    nome_loja: p.nome_loja ?? null,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    classificacao: p.classificacao,
    ordem: p.ordem,
  }
}

function toHHMM(d: Date | string | null | undefined): string {
  if (!d) return '---'
  const x = typeof d === 'string' ? new Date(d) : d
  return String(x.getUTCHours()).padStart(2, '0') + ':' + String(x.getUTCMinutes()).padStart(2, '0')
}

async function main() {
  console.log('=== COMPARATIVO MATCHER v1 vs v2 ===\n')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data: lojasRaw } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)
  const lojas: LojaRow[] = (lojasRaw ?? []) as LojaRow[]
  console.log(`Lojas ativas: ${lojas.length}\n`)

  const md: string[] = []
  md.push('# Comparativo Matcher v1 vs v2')
  md.push('')
  md.push(`Gerado em: ${new Date().toISOString()}`)
  md.push('')

  type Linha = {
    data: string; rede: string; loja: string; placa: string
    v1: { sc: string; chd: string; sl: string }
    v2: { sc: string; chd: string; sl: string }
    iguais: boolean
    obs: string
  }

  const resultados: Linha[] = []
  const statsGlobal = { totalV1: 0, totalV2: 0, comGpsV1: 0, comGpsV2: 0, diferentes: 0, v2Melhor: 0, v1Melhor: 0 }

  for (const { data, pasta } of DIAS) {
    console.log(`Processando ${data}...`)
    const escalasRaw = await carregarEscalas(pasta, data)
    const paradasRaw = await carregarUnitrac(pasta)
    const escalas = escalasRaw.map(toEscalaRow)
    const paradas = paradasRaw.map(toParadaRow)
    console.log(`  ${escalas.length} escalas, ${paradas.length} paradas`)

    const rotasV1 = await cruzaEscalaUnitrac(escalas, paradas, lojas)
    const { rotas: rotasV2 } = cruzaEscalaUnitracV2(escalas, paradas, lojas)
    console.log(`  v1: ${rotasV1.length} rotas, ${rotasV1.filter(r => r.paradas.length > 0).length} com GPS`)
    console.log(`  v2: ${rotasV2.length} rotas, ${rotasV2.filter(r => r.paradas.length > 0).length} com GPS`)

    statsGlobal.totalV1 += rotasV1.length
    statsGlobal.totalV2 += rotasV2.length
    statsGlobal.comGpsV1 += rotasV1.filter(r => r.paradas.length > 0).length
    statsGlobal.comGpsV2 += rotasV2.filter(r => r.paradas.length > 0).length

    const rotaV1ById = new Map(rotasV1.map(r => [r.escala_linha_id, r]))
    const rotaV2ById = new Map(rotasV2.map(r => [r.escala_linha_id, r]))

    for (const linha of escalas) {
      const r1 = rotaV1ById.get(linha.id)
      const r2 = rotaV2ById.get(linha.id)
      const p1 = r1?.paradas[0]
      const p2 = r2?.paradas[0]
      const v1 = {
        sc: r1?.saida_cd ? toHHMM(r1.saida_cd) : '---',
        chd: p1 ? toHHMM(p1.chegada) : '---',
        sl: p1 ? toHHMM(p1.saida) : '---',
      }
      const v2 = {
        sc: r2?.saida_cd ? toHHMM(r2.saida_cd) : '---',
        chd: p2 ? toHHMM(p2.chegada) : '---',
        sl: p2 ? toHHMM(p2.saida) : '---',
      }
      const iguais = v1.sc === v2.sc && v1.chd === v2.chd && v1.sl === v2.sl
      let obs = ''
      if (!iguais) {
        statsGlobal.diferentes++
        const v1Tem = v1.chd !== '---'
        const v2Tem = v2.chd !== '---'
        if (v1Tem && !v2Tem) {
          obs = 'v1 acha, v2 deixou em branco'
          statsGlobal.v1Melhor++
        } else if (!v1Tem && v2Tem) {
          obs = 'v2 acha, v1 deixou em branco'
          statsGlobal.v2Melhor++
        } else if (v1Tem && v2Tem) {
          obs = 'AMBOS acharam mas timestamps diferem'
        }
      }
      resultados.push({
        data, rede: linha.rede_id, loja: linha.loja_nome_raw, placa: linha.placa_norm ?? '-',
        v1, v2, iguais, obs,
      })
    }
  }

  console.log('\n=== ESTATÍSTICAS GLOBAIS ===')
  console.log(`Total linhas:        v1=${statsGlobal.totalV1}  v2=${statsGlobal.totalV2}`)
  console.log(`Com GPS encontrado:  v1=${statsGlobal.comGpsV1}  v2=${statsGlobal.comGpsV2}`)
  console.log(`Diferentes:          ${statsGlobal.diferentes}`)
  console.log(`  v1 acha mais (perdeu no v2): ${statsGlobal.v1Melhor}`)
  console.log(`  v2 acha mais (ganho no v2):  ${statsGlobal.v2Melhor}`)
  console.log(`  Ambos acham timestamps diferentes: ${statsGlobal.diferentes - statsGlobal.v1Melhor - statsGlobal.v2Melhor}`)

  // Tabela MD
  md.push('## Estatísticas globais')
  md.push('')
  md.push(`| Métrica | v1 (atual) | v2 (simplificado) |`)
  md.push(`|---------|-----------|-------------------|`)
  md.push(`| Total linhas | ${statsGlobal.totalV1} | ${statsGlobal.totalV2} |`)
  md.push(`| Com GPS encontrado | ${statsGlobal.comGpsV1} | ${statsGlobal.comGpsV2} |`)
  md.push(`| Diferenças | - | ${statsGlobal.diferentes} |`)
  md.push(`| v1 acha (v2 perde) | - | ${statsGlobal.v1Melhor} |`)
  md.push(`| v2 acha (v1 perde) | - | ${statsGlobal.v2Melhor} |`)
  md.push('')
  md.push('## Diferenças por rede')
  md.push('')

  // Agrupar por rede e contar
  const porRede = new Map<string, { dif: number; v1Mais: number; v2Mais: number; total: number }>()
  for (const r of resultados) {
    const s = porRede.get(r.rede) ?? { dif: 0, v1Mais: 0, v2Mais: 0, total: 0 }
    s.total++
    if (!r.iguais) {
      s.dif++
      if (r.obs.includes('v1 acha')) s.v1Mais++
      if (r.obs.includes('v2 acha')) s.v2Mais++
    }
    porRede.set(r.rede, s)
  }
  md.push('| Rede | Total | Diferenças | v1>v2 | v2>v1 |')
  md.push('|------|-------|------------|-------|-------|')
  for (const [rede, s] of [...porRede.entries()].sort((a, b) => b[1].dif - a[1].dif)) {
    md.push(`| ${rede} | ${s.total} | ${s.dif} | ${s.v1Mais} | ${s.v2Mais} |`)
  }
  md.push('')

  md.push('## Casos onde v1 acha mas v2 não (regressões aceitas)')
  md.push('')
  const regressoes = resultados.filter(r => r.obs.includes('v1 acha'))
  md.push(`Total: ${regressoes.length}`)
  md.push('')
  for (const r of regressoes.slice(0, 30)) {
    md.push(`- ${r.data} | ${r.rede} | "${r.loja}" | placa=${r.placa} | v1=${r.v1.sc}/${r.v1.chd}/${r.v1.sl} | v2=---`)
  }
  if (regressoes.length > 30) md.push(`... +${regressoes.length - 30}`)
  md.push('')

  md.push('## Casos onde v2 acha mas v1 não (ganhos)')
  md.push('')
  const ganhos = resultados.filter(r => r.obs.includes('v2 acha'))
  md.push(`Total: ${ganhos.length}`)
  md.push('')
  for (const r of ganhos.slice(0, 30)) {
    md.push(`- ${r.data} | ${r.rede} | "${r.loja}" | placa=${r.placa} | v1=--- | v2=${r.v2.sc}/${r.v2.chd}/${r.v2.sl}`)
  }
  if (ganhos.length > 30) md.push(`... +${ganhos.length - 30}`)

  writeFileSync('docs/correcao-sistema/comparativo-matchers.md', md.join('\n'), 'utf8')
  console.log('\nRelatório: docs/correcao-sistema/comparativo-matchers.md')
}

main().catch(e => { console.error(e); process.exit(1) })
