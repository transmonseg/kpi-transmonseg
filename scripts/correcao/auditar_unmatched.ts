/**
 * Auditoria das 285 linhas unmatched após V2.1.
 * Classifica cada linha sem match em uma das categorias:
 *   A. PLACA_AUSENTE_UNITRAC: placa da escala não existe no Unitrac do dia
 *   B. PLACA_INATIVA: placa está em VEICULOS_INATIVOS (correto pular)
 *   C. PLACA_SO_BASE: placa existe mas só tem paradas BASE BENASSI (CD-only do dia)
 *   D. LOJA_NAO_CADASTRADA: loja_nome_raw da escala não bate com cadastro
 *   E. CODIGO_AMBIGUO: várias paradas LOJA disponíveis, nenhuma bate código nem nome
 *   F. ROTA_GIGANTE_SEM_CITACAO: parada Unitrac é rota gigante mas linha não cita
 *   G. OUTRO: cair em caso não classificado
 *
 * Uso: npx tsx scripts/correcao/auditar_unmatched.ts
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
import { isRotaGigante } from '@/lib/kpi/rotas-gigantes'
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
  return {
    id: `e-${idx}`,
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

function normalizar(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

interface UnmatchedRow {
  dia: string
  rede: string
  placa: string | null
  loja_nome: string
  loja_codigo: string | null
  categoria: string
  detalhe: string
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data: lojasData } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, entrega_d1_fixo')
    .eq('ativo', true)
  const lojas = ((lojasData ?? []) as Record<string, unknown>[]).map(l => ({ ...l, sub_rede: null })) as unknown as LojaRow[]

  const lojasPorRede = new Map<string, LojaRow[]>()
  for (const l of lojas) {
    const arr = lojasPorRede.get(l.rede_id) ?? []
    arr.push(l)
    lojasPorRede.set(l.rede_id, arr)
  }

  const todasUnmatched: UnmatchedRow[] = []

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

    // Mapa placa → paradas
    const paradasPorPlaca = new Map<string, UnitracParadaRow[]>()
    for (const p of paradaRows) {
      const arr = paradasPorPlaca.get(p.placa_norm) ?? []
      arr.push(p)
      paradasPorPlaca.set(p.placa_norm, arr)
    }

    for (const rota of rotas) {
      if (rota.paradas.length > 0) continue  // matched, pula
      const linha = escalaRows.find(e => e.id === rota.escala_linha_id)
      if (!linha) continue

      let categoria = 'OUTRO'
      let detalhe = ''
      const placa = rota.placa_norm
      const paradasDaPlaca = placa ? (paradasPorPlaca.get(placa) ?? []) : []
      const paradasLojaDaPlaca = paradasDaPlaca.filter(p => p.classificacao === 'LOJA')

      // B. PLACA_INATIVA
      if (placa && isVeiculoInativo(placa)) {
        categoria = 'PLACA_INATIVA'
        detalhe = 'em VEICULOS_INATIVOS'
      }
      // A. PLACA_AUSENTE_UNITRAC
      else if (!placa || paradasDaPlaca.length === 0) {
        categoria = 'PLACA_AUSENTE_UNITRAC'
        detalhe = placa ? `placa "${placa}" sem paradas` : 'sem placa'
      }
      // C. PLACA_SO_BASE
      else if (paradasLojaDaPlaca.length === 0) {
        categoria = 'PLACA_SO_BASE'
        detalhe = `${paradasDaPlaca.length} paradas, 0 LOJA`
      }
      // F. ROTA_GIGANTE_SEM_CITACAO
      else if (paradasLojaDaPlaca.every(p => p.codigo_loja && isRotaGigante(p.codigo_loja))) {
        categoria = 'ROTA_GIGANTE_SEM_CITACAO'
        const codes = [...new Set(paradasLojaDaPlaca.map(p => p.codigo_loja).filter(Boolean))]
        detalhe = `paradas só em ${codes.length} rota(s) gigante(s): ${codes.slice(0, 3).join(',')}`
      }
      // D. LOJA_NAO_CADASTRADA
      else {
        const lojasDaRede = lojasPorRede.get(linha.rede_id) ?? []
        const nomeNorm = normalizar(linha.loja_nome_raw)
        const temNoCad = lojasDaRede.some(l => {
          const ln = normalizar(l.nome_normalizado || l.nome)
          return ln === nomeNorm || ln.includes(nomeNorm) || nomeNorm.includes(ln)
        })
        if (!temNoCad) {
          categoria = 'LOJA_NAO_CADASTRADA'
          detalhe = `loja "${linha.loja_nome_raw}" não bate cadastro da rede ${linha.rede_id}`
        } else {
          // E. CODIGO_AMBIGUO
          categoria = 'CODIGO_AMBIGUO'
          detalhe = `${paradasLojaDaPlaca.length} paradas LOJA disponíveis, nenhuma casou; loja cadastrada`
        }
      }

      todasUnmatched.push({
        dia: dia.data,
        rede: linha.rede_id,
        placa,
        loja_nome: linha.loja_nome_raw,
        loja_codigo: linha.loja_codigo_raw,
        categoria,
        detalhe,
      })
    }
  }

  console.log(`\nTotal unmatched: ${todasUnmatched.length}\n`)
  const porCategoria: Record<string, number> = {}
  for (const u of todasUnmatched) porCategoria[u.categoria] = (porCategoria[u.categoria] ?? 0) + 1
  console.log('Por categoria:')
  for (const [k, v] of Object.entries(porCategoria).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`)

  console.log('\nPor rede:')
  const porRede: Record<string, number> = {}
  for (const u of todasUnmatched) porRede[u.rede] = (porRede[u.rede] ?? 0) + 1
  for (const [k, v] of Object.entries(porRede).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`)

  console.log('\nPor (categoria, rede) — top 30:')
  const cat_rede: Record<string, number> = {}
  for (const u of todasUnmatched) cat_rede[`${u.categoria}|${u.rede}`] = (cat_rede[`${u.categoria}|${u.rede}`] ?? 0) + 1
  for (const [k, v] of Object.entries(cat_rede).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${k}: ${v}`)

  writeFileSync('docs/correcao-sistema/unmatched-auditoria.json', JSON.stringify(todasUnmatched, null, 2), 'utf8')
  console.log('\nSalvo: docs/correcao-sistema/unmatched-auditoria.json')
}

main().catch(e => { console.error(e); process.exit(1) })
