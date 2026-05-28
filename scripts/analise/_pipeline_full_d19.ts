/**
 * Simula o pipeline completo do /api/kpi/simples no dia 19:
 * 1. parseEscalaGeral (XLSX)
 * 2. parseAlteracaoPdfTabular (PDF) + parseAlteracoesV2 (texto)
 * 3. inferirSaiDaEscala
 * 4. aplicarAlteracoes
 * 5. parseUnitracPdf
 * 6. cruzaEscalaUnitrac (matcher.ts — onde estão M1+M4)
 *
 * Para cada loja: reporta motorista, placa, GPS chd/sai.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseAlteracaoPdfTabular } from '@/lib/parsers/alteracao-pdf-tabular'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { inferirSaiDaEscala } from '@/lib/parsers/inferir-sai'
import { aplicarAlteracoes, parsedToConfirmada } from '@/lib/kpi/aplicar-alteracoes'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'
import { createClient } from '@supabase/supabase-js'

const DATA = '2026-05-19'
const ESCALA = 'docs/conversas-tia-erica/dia-25/escalas/ESCALA GERAL DE MAIO 0 (2).xlsx'
const PDF_ALT = 'docs/conversas-tia-erica/dia-19/alteracoes/ALTERACAO DE ESCALA GERAL 19.05 (3).pdf'
const PDF_UNITRAC = 'docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'

const REDE_FOCO = process.argv[2] ?? 'ASSAI'

async function main() {
  console.log(`Pipeline dia ${DATA} rede ${REDE_FOCO}\n`)

  // 1. Escala
  const xlsxBuf = readFileSync(ESCALA)
  const linhasEscala = await parseEscalaGeral(xlsxBuf, DATA)
  console.log(`Escala: ${linhasEscala.length} linhas total`)
  const linhasRede = linhasEscala.filter(l => l.rede_id === REDE_FOCO)
  console.log(`  Rede ${REDE_FOCO}: ${linhasRede.length} linhas`)

  // 2. Alteracoes do PDF
  const altBuf = readFileSync(PDF_ALT)
  const altParsed = await parseAlteracaoPdfTabular(altBuf)
  console.log(`\nAlteracoes PDF parseadas: ${altParsed.length}`)
  altParsed.forEach((a, i) => {
    console.log(`  [${i+1}] ${a.rede_id} ${a.loja_nome_raw}: entra ${a.entra?.motorista_nome}/${a.entra?.placa_norm}, sai ${a.sai?.motorista_nome ?? '(null)'}`)
  })

  // 3. Inferir sai
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const altInferidas = await inferirSaiDaEscala(altParsed, DATA, svc)
  console.log(`\nApos inferirSaiDaEscala:`)
  altInferidas.forEach((a, i) => {
    console.log(`  [${i+1}] ${a.rede_id} ${a.loja_nome_raw}: entra ${a.entra?.motorista_nome}, sai ${a.sai?.motorista_nome ?? '(null)'}/${a.sai?.placa_norm ?? '(null)'}`)
  })

  // 4. Aplicar
  const linhasEfetivas = aplicarAlteracoes([...linhasEscala], altInferidas.map(parsedToConfirmada))
  const efetivasRede = linhasEfetivas.filter(l => l.rede_id === REDE_FOCO)
  console.log(`\nLinhas efetivas ${REDE_FOCO}: ${efetivasRede.length}`)

  // 5. Unitrac
  const cadastroPlacas = new Set<string>()
  for (const l of efetivasRede) if (l.placa_norm) cadastroPlacas.add(l.placa_norm)
  const unitBuf = readFileSync(PDF_UNITRAC)
  const veiculos = await parseUnitracPdf(unitBuf, cadastroPlacas)
  console.log(`Unitrac PDF: ${veiculos.length} veiculos`)

  // 6. Matcher
  const escalaRows = efetivasRede.map((l, i) => ({
    id: `esc-${i}`,
    rede_id: l.rede_id,
    placa_norm: l.placa_norm || null,
    loja_nome_raw: l.loja_nome_raw,
    loja_codigo_raw: l.loja_codigo_raw,
    motorista_nome: l.motorista_nome,
    carro_ordem: l.carro_ordem,
    data_entrega: l.data_entrega,
  }))

  const paradaRows = veiculos.flatMap((v, vi) => v.paradas.map((p, pi) => ({
    id: `par-${vi}-${pi}`,
    placa_norm: p.placa_norm,
    chegada: p.chegada.toISOString(),
    saida: p.saida.toISOString(),
    duracao_seg: p.duracao_seg,
    local_parada: p.local_parada,
    codigo_loja: p.codigo_loja,
    nome_loja: p.nome_loja,
    lat: p.lat,
    lng: p.lng,
    classificacao: p.classificacao,
    ordem: p.ordem,
  })))

  const { data: lojasDb } = await svc.from('lojas').select('*').eq('ativo', true)
  const lojas = (lojasDb ?? []).map((l: Record<string, unknown>) => ({
    id: l.id as string, rede_id: l.rede_id as string,
    nome: (l.nome as string) ?? '', nome_normalizado: (l.nome_normalizado as string) ?? '',
    codigo_escala: l.codigo_escala as string | null,
    codigo_unitrac: l.codigo_unitrac as string | null,
    nome_unitrac: l.nome_unitrac as string | null,
    lat: l.lat as number | null, lng: l.lng as number | null,
    raio_metros: (l.raio_metros as number | null) ?? 150,
  }))

  const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas, svc, [])
  console.log(`\nMatcher: ${rotas.length} rotas geradas`)

  // 7. Sumario por loja
  console.log(`\n=== Resultado final ${REDE_FOCO} dia ${DATA} ===\n`)
  console.log(`Loja                                       | Motorista            Placa      SaidaCD  Chd    SaiLj`)
  console.log('-'.repeat(120))
  const fmt = (d: Date | null | string | undefined) => {
    if (!d) return '-     '
    const dt = typeof d === 'string' ? new Date(d) : d
    return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`
  }
  for (const rota of rotas) {
    const esc = efetivasRede.find((_, i) => `esc-${i}` === rota.escala_linha_id)
    if (!esc) continue
    const p0 = rota.paradas[0]
    const loja = (esc.loja_nome_raw ?? '').slice(0, 42).padEnd(42)
    const mot = (esc.motorista_nome ?? '').slice(0, 20).padEnd(20)
    const placa = (rota.placa_norm ?? '').slice(0, 10).padEnd(10)
    console.log(`${loja} | ${mot} ${placa} ${fmt(rota.saida_cd).padEnd(8)} ${fmt(p0?.chegada).padEnd(6)} ${fmt(p0?.saida).padEnd(6)}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
