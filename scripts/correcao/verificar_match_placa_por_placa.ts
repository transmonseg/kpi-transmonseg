/**
 * Verificação placa por placa, dia por dia, rede por rede.
 *
 * Pra cada (dia, placa, rede) que aparece na escala:
 *   1. Lista linhas da escala (quantas, quais lojas)
 *   2. Lista paradas do Unitrac (quantas LOJA, quais codigo_loja)
 *   3. Roda o matcher
 *   4. Diagnostica:
 *      - OK_FULL: todas linhas casadas
 *      - OK_PARCIAL: algumas linhas casaram, outras não
 *      - FALHA_MATCH_ZERO: 0 linhas casadas mas a placa tem paradas LOJA
 *      - PLACA_NAO_ESTA_UNITRAC: placa ausente
 *      - PLACA_SO_BASE: placa só BASE BENASSI
 *      - PLACA_INATIVA: lista negra
 *      - DESCONHECIDO
 *
 * Output: docs/correcao-sistema/match-placa-por-placa.md (tabelão com tudo)
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync, writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac, type EscalaLinhaRow, type UnitracParadaRow, type LojaRow } from '@/lib/kpi/matcher'
import { isVeiculoInativo } from '@/lib/kpi/veiculos-inativos'
import type { LinhaEscala } from '@/lib/types/escala'
import type { ParadaUnitrac } from '@/lib/types/unitrac'

const BASE_DIR = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'

const DIAS = [
  { data: '2026-05-18', pasta: 'ESCALA DIA 18', geral: 'ESCALA GERAL DE MAIO 1 (6).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (5).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx', zonasul: 'ESCALA ZONA SUL - MAIO (6).xlsx', unitrac: 'relatorio_9402.xlsx' },
  { data: '2026-05-19', pasta: 'ESCALA DIA 19', geral: 'ESCALA GERAL DE MAIO 1 (6).xlsx', pax: 'ESCALA - PAX , FEIRA NOVA , EMANUEL.xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx', zonasul: 'ESCALA ZONA SUL - MAIO (6).xlsx', unitrac: 'relatorio_9391.xlsx' },
  { data: '2026-05-20', pasta: 'ESCALA DIA 20', geral: 'ESCALA GERAL DE MAIO 1 (7).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (6).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO.xlsx', zonasul: 'ESCALA ZONA SUL - MAIO (7).xlsx', unitrac: 'relatorio_9573.xlsx' },
  { data: '2026-05-21', pasta: 'ESCALA DIA 21', geral: 'ESCALA GERAL DE MAIO 1 (7).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (6).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx', zonasul: 'ESCALA ZONA SUL - MAIO (7).xlsx', unitrac: 'relatorio_9552.xlsx' },
  { data: '2026-05-22', pasta: 'ESCALA DIA 22', geral: 'ESCALA GERAL DE MAIO 0.xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (7).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx', zonasul: 'ESCALA ZONA SUL - MAIO (8).xlsx', unitrac: 'relatorio_9588.xlsx' },
]

function tryRead(path: string): Buffer | null { try { return readFileSync(path) } catch { return null } }

function toEscalaRow(l: LinhaEscala, idx: number): EscalaLinhaRow {
  return { id: `e-${idx}`, rede_id: l.rede_id, placa_norm: l.placa_norm, loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega, sub_rede: l.sub_rede ?? null }
}
function toParadaRow(p: ParadaUnitrac, idx: number): UnitracParadaRow {
  return { id: `p-${idx}`, placa_norm: p.placa_norm, chegada: p.chegada instanceof Date ? p.chegada.toISOString() : String(p.chegada), saida: p.saida instanceof Date ? p.saida.toISOString() : (p.saida ? String(p.saida) : null), duracao_seg: p.duracao_seg ?? null, local_parada: p.local_parada ?? '', codigo_loja: p.codigo_loja ?? null, nome_loja: p.nome_loja ?? null, lat: p.lat ?? null, lng: p.lng ?? null, classificacao: p.classificacao, ordem: p.ordem }
}

interface CasoPlaca {
  dia: string
  placa: string
  rede: string
  diagnostico: 'OK_FULL' | 'OK_PARCIAL' | 'FALHA_MATCH_ZERO' | 'PLACA_NAO_ESTA_UNITRAC' | 'PLACA_SO_BASE' | 'PLACA_INATIVA'
  linhas_escala: Array<{ loja: string, cod: string | null, ordem: number }>
  paradas_loja: Array<{ chegada: string, cod: string | null, nome: string | null }>
  matches: Array<{ linha_idx: number, parada_idx: number | null }>
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: lojasData } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, entrega_d1_fixo')
    .eq('ativo', true)
  const lojas = ((lojasData ?? []) as Record<string, unknown>[]).map(l => ({ ...l, sub_rede: null })) as unknown as LojaRow[]

  const casos: CasoPlaca[] = []

  for (const dia of DIAS) {
    const escalas: LinhaEscala[] = []
    for (const [k, path] of [['geral', dia.geral], ['pax', dia.pax], ['armazem', dia.armazem], ['zonasul', dia.zonasul]]) {
      if (!path) continue
      const buf = tryRead(`${BASE_DIR}/${dia.pasta}/${path}`)
      if (!buf) continue
      try {
        if (k === 'geral') escalas.push(...await parseEscalaGeral(buf, dia.data))
        else if (k === 'pax') escalas.push(...await parseEscalaPax(buf, dia.data))
        else if (k === 'armazem') escalas.push(...await parseEscalaArmazemGrao(buf, dia.data))
        else if (k === 'zonasul') escalas.push(...await parseEscalaZonaSul(buf, dia.data))
      } catch { /* ignore */ }
    }
    const bufU = tryRead(`${BASE_DIR}/${dia.pasta}/${dia.unitrac}`)
    if (!bufU) continue
    const viagens = await parseUnitrac(bufU) as unknown as Array<{ placa_norm: string, paradas: ParadaUnitrac[] }>
    const paradas: ParadaUnitrac[] = []
    for (const v of viagens) for (const p of (v.paradas ?? [])) paradas.push(p)

    const escalasDoDia = escalas.filter(e => e.data_entrega === dia.data)
    const paradasDoDia = paradas.filter(p => {
      const c = p.chegada instanceof Date ? p.chegada : new Date(p.chegada as string)
      return c && !isNaN(c.getTime()) && c.toISOString().slice(0, 10) === dia.data
    })

    const escalaRows = escalasDoDia.map(toEscalaRow)
    const paradaRows = paradasDoDia.map(toParadaRow)
    const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas)

    // Mapa: rota.escala_linha_id → parada (id)
    const matchByEscala = new Map<string, string | null>()
    for (const r of rotas) {
      const lojaMatch = r.paradas.find(_ => true)
      matchByEscala.set(r.escala_linha_id, lojaMatch ? (lojaMatch as any).id ?? null : null)
    }

    // Mapa placa → paradas Unitrac
    const paradasPorPlaca = new Map<string, UnitracParadaRow[]>()
    for (const p of paradaRows) {
      const arr = paradasPorPlaca.get(p.placa_norm) ?? []
      arr.push(p)
      paradasPorPlaca.set(p.placa_norm, arr)
    }

    // Agrupa escala por (placa, rede)
    const grupos = new Map<string, EscalaLinhaRow[]>()
    for (const l of escalaRows) {
      if (!l.placa_norm) continue
      const k = `${l.placa_norm}|${l.rede_id}`
      const arr = grupos.get(k) ?? []
      arr.push(l)
      grupos.set(k, arr)
    }

    for (const [key, linhas] of grupos) {
      const [placa, rede] = key.split('|')
      const paradasDaPlaca = paradasPorPlaca.get(placa) ?? []
      const paradasLojaDaPlaca = paradasDaPlaca.filter(p => p.classificacao === 'LOJA')

      let diagnostico: CasoPlaca['diagnostico']
      if (isVeiculoInativo(placa) && paradasLojaDaPlaca.length === 0) diagnostico = 'PLACA_INATIVA'
      else if (paradasDaPlaca.length === 0) diagnostico = 'PLACA_NAO_ESTA_UNITRAC'
      else if (paradasLojaDaPlaca.length === 0) diagnostico = 'PLACA_SO_BASE'
      else {
        const nCasadas = linhas.filter(l => {
          const r = rotas.find(rr => rr.escala_linha_id === l.id)
          return r && r.paradas.length > 0
        }).length
        if (nCasadas === linhas.length) diagnostico = 'OK_FULL'
        else if (nCasadas === 0) diagnostico = 'FALHA_MATCH_ZERO'
        else diagnostico = 'OK_PARCIAL'
      }

      casos.push({
        dia: dia.data,
        placa,
        rede,
        diagnostico,
        linhas_escala: linhas.map(l => ({ loja: l.loja_nome_raw, cod: l.loja_codigo_raw, ordem: l.carro_ordem })),
        paradas_loja: paradasLojaDaPlaca.map(p => {
          const ch = new Date(p.chegada)
          return { chegada: ch.toISOString().slice(11, 16), cod: p.codigo_loja, nome: p.nome_loja }
        }),
        matches: linhas.map((l, idx) => {
          const r = rotas.find(rr => rr.escala_linha_id === l.id)
          if (!r || r.paradas.length === 0) return { linha_idx: idx, parada_idx: null }
          const par = r.paradas[0] as any
          const parIdx = paradasLojaDaPlaca.findIndex(p => p.id === par.id)
          return { linha_idx: idx, parada_idx: parIdx >= 0 ? parIdx : null }
        }),
      })
    }
  }

  // Sumário
  const porDiag: Record<string, number> = {}
  for (const c of casos) porDiag[c.diagnostico] = (porDiag[c.diagnostico] ?? 0) + 1
  console.log('Total casos (placa+rede+dia):', casos.length)
  console.log('Por diagnóstico:', porDiag)

  // Markdown: focar em casos PROBLEMÁTICOS (FALHA_MATCH_ZERO + OK_PARCIAL)
  const md: string[] = []
  md.push('# Verificação match placa-por-placa — 5 dias')
  md.push('')
  md.push(`Total casos: ${casos.length}`)
  md.push('')
  md.push('| Diagnóstico | Qtd |')
  md.push('|------|-----|')
  for (const [k, v] of Object.entries(porDiag).sort((a, b) => b[1] - a[1])) md.push(`| ${k} | ${v} |`)
  md.push('')

  for (const tipo of ['FALHA_MATCH_ZERO', 'OK_PARCIAL'] as const) {
    md.push(`## ${tipo}`)
    md.push('')
    const lista = casos.filter(c => c.diagnostico === tipo).sort((a, b) => a.dia.localeCompare(b.dia) || a.rede.localeCompare(b.rede))
    md.push(`Total: ${lista.length}`)
    md.push('')
    for (const c of lista) {
      md.push(`### ${c.dia} | ${c.placa} | ${c.rede}`)
      md.push('')
      md.push('**Escala:**')
      for (let i = 0; i < c.linhas_escala.length; i++) {
        const l = c.linhas_escala[i]
        const m = c.matches[i]
        const matchInfo = m.parada_idx == null ? '❌ unmatched' : `✓ → parada[${m.parada_idx}]`
        md.push(`- ordem=${l.ordem} loja="${l.loja}" cod=${l.cod ?? '—'} ${matchInfo}`)
      }
      md.push('')
      md.push('**Paradas LOJA Unitrac:**')
      for (let i = 0; i < c.paradas_loja.length; i++) {
        const p = c.paradas_loja[i]
        md.push(`- [${i}] ${p.chegada} cod=${p.cod ?? '—'} nome="${p.nome ?? '—'}"`)
      }
      md.push('')
    }
  }

  writeFileSync('docs/correcao-sistema/match-placa-por-placa.md', md.join('\n'), 'utf8')
  writeFileSync('docs/correcao-sistema/match-placa-por-placa.json', JSON.stringify(casos, null, 2), 'utf8')
  console.log('Salvos: docs/correcao-sistema/match-placa-por-placa.{md,json}')
}

main().catch(e => { console.error(e); process.exit(1) })
