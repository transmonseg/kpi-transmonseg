/**
 * Dia 19: lista PLACA × MOTORISTA × LOJA × REDE de TODAS as escalas
 * (geral + ZS + Pax + Armazém Grão) + alterações aplicadas.
 * Cruza com placas do relatório Unitrac.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseAlteracaoPdfTabular } from '@/lib/parsers/alteracao-pdf-tabular'
import { inferirSaiDaEscala } from '@/lib/parsers/inferir-sai'
import { aplicarAlteracoes, parsedToConfirmada } from '@/lib/kpi/aplicar-alteracoes'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { createClient } from '@supabase/supabase-js'

const DATA = '2026-05-19'
const BASE = 'docs/conversas-tia-erica/dia-25/escalas/'
const PDF_ALT = 'docs/conversas-tia-erica/dia-19/alteracoes/ALTERACAO DE ESCALA GERAL 19.05 (3).pdf'
const PDF_UNI = 'docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'

async function placasUnitrac(): Promise<{ set: Set<string>; veiculos: { placa: string; paradas: number }[] }> {
  const buf = readFileSync(PDF_UNI)
  const veiculos = await parseUnitracPdf(buf, null)
  const set = new Set<string>()
  const lista: { placa: string; paradas: number }[] = []
  for (const v of veiculos) {
    set.add(v.placa_norm)
    lista.push({ placa: v.placa_norm, paradas: v.paradas.length })
  }
  return { set, veiculos: lista }
}

async function main() {
  const buffers = {
    geral: readFileSync(BASE + 'ESCALA GERAL DE MAIO 0 (2).xlsx'),
    zs: readFileSync(BASE + 'ESCALA ZONA SUL - MAIO (9).xlsx'),
    pax: readFileSync(BASE + 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (7).xlsx'),
    arm: readFileSync(BASE + 'ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx'),
  }
  const linhas = [
    ...await parseEscalaGeral(buffers.geral, DATA),
    ...await parseEscalaZonaSul(buffers.zs, DATA),
    ...await parseEscalaPax(buffers.pax, DATA),
    ...await parseEscalaArmazemGrao(buffers.arm, DATA),
  ]

  // Alterações
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const altRaw = await parseAlteracaoPdfTabular(readFileSync(PDF_ALT))
  const altInfer = await inferirSaiDaEscala(altRaw, DATA, svc)
  const efetivas = aplicarAlteracoes([...linhas], altInfer.map(parsedToConfirmada))

  // Unitrac
  const { set: unit, veiculos: unitList } = await placasUnitrac()

  // Agrupa por rede
  const porRede: Record<string, typeof efetivas> = {}
  for (const l of efetivas) {
    (porRede[l.rede_id] ||= []).push(l)
  }

  console.log(`\n# ESCALAS DIA 19 (com alterações) × UNITRAC\n`)
  console.log(`Placas únicas Unitrac: ${unit.size}`)
  console.log(`Linhas escala efetivas: ${efetivas.length}\n`)

  for (const rede of Object.keys(porRede).sort()) {
    console.log(`\n## ${rede} (${porRede[rede].length} linhas)`)
    console.log(`| Loja | Motorista | Placa | Unitrac? |`)
    console.log(`|------|-----------|-------|----------|`)
    for (const l of porRede[rede]) {
      const placa = l.placa_norm || ''
      const tem = placa && unit.has(placa) ? 'SIM' : (placa ? 'NÃO' : '—')
      const loja = `${l.loja_codigo_raw ?? ''} ${l.loja_nome_raw ?? ''}`.trim().slice(0, 45)
      const mot = (l.motorista_nome ?? '').slice(0, 25)
      console.log(`| ${loja} | ${mot} | ${placa || '(s/placa)'} | ${tem} |`)
    }
  }

  // Placas Unitrac sem nenhuma escala
  const placasEsc = new Set(efetivas.filter(l => l.placa_norm).map(l => l.placa_norm!))
  const semEscala = unitList.filter(v => !placasEsc.has(v.placa)).sort((a, b) => a.placa.localeCompare(b.placa))
  console.log(`\n\n## PLACAS UNITRAC SEM CORRESPONDÊNCIA EM ESCALA (${semEscala.length}):`)
  for (const v of semEscala) console.log(`  ${v.placa}  (${v.paradas} paradas)`)
}
main().catch(e => { console.error(e); process.exit(1) })
