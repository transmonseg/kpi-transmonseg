/**
 * Pipeline completo dia 20 + comparação rede a rede contra KPIs manuais.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { parseAlteracoesV2 } from '@/lib/parsers/alteracoes-v2'
import { blocoToParsed } from '@/lib/parsers/alteracoes-v2-adapter'
import { buildLookupContext } from '@/lib/parsers/lookup-canonical'
import { inferirSaiDaEscala } from '@/lib/parsers/inferir-sai'
import { aplicarAlteracoes, parsedToConfirmada } from '@/lib/kpi/aplicar-alteracoes'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'
import { createClient } from '@supabase/supabase-js'

const DATA = '2026-05-20'

async function main() {
  // 1. Escalas
  const geralBuf = readFileSync('docs/conversas-tia-erica/dia-20/escalas/ESCALA GERAL DE MAIO 1 (7).xlsx')
  const zsBuf = readFileSync('docs/conversas-tia-erica/dia-20/escalas/ESCALA ZONA SUL - MAIO (7).xlsx')
  const paxBuf = readFileSync('docs/conversas-tia-erica/dia-20/escalas/ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (6).xlsx')
  const armBuf = readFileSync('docs/conversas-tia-erica/dia-20/escalas/ESCALA DO ARMAZÉM DO GRÃO MAIO.xlsx')

  let linhasEscala: Awaited<ReturnType<typeof parseEscalaGeral>> = []
  for (const [buf, label] of [[geralBuf, 'GERAL'], [zsBuf, 'ZS'], [paxBuf, 'PAX'], [armBuf, 'ARMAZEM']] as const) {
    for (const parser of [parseEscalaZonaSul, parseEscalaArmazemGrao, parseEscalaPax, parseEscalaGeral]) {
      try {
        const r = await parser(buf, DATA)
        if (r.length >= 3) {
          console.log(`[${label}] ${parser.name}: ${r.length} linhas`)
          linhasEscala.push(...r)
          break
        }
      } catch { /* tenta próximo */ }
    }
  }

  // Dedup multi-escala (pra redes com varias escalas)
  const redesComPlaca = new Set(linhasEscala.filter(l => l.placa_norm).map(l => l.rede_id))
  linhasEscala = linhasEscala.filter(l => l.placa_norm || !redesComPlaca.has(l.rede_id) || l.obs === 'SEM PEDIDO')

  console.log(`\nEscala total dedup: ${linhasEscala.length} linhas`)
  const porRede: Record<string, number> = {}
  for (const l of linhasEscala) porRede[l.rede_id] = (porRede[l.rede_id] || 0) + 1
  for (const [k, v] of Object.entries(porRede).sort()) console.log(`  ${k}: ${v}`)

  // 2. Alteracoes
  const txt = readFileSync('docs/conversas-tia-erica/dia-20/alteracoes/alteracoes_20.05.txt', 'utf-8')
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const ctx = await buildLookupContext(svc)
  const altBlocos = parseAlteracoesV2(txt, ctx)
  const altParsed = altBlocos.filter(b => b.entra || b.sai).map(blocoToParsed)
  console.log(`\nAlteracoes: ${altParsed.length}`)
  altParsed.forEach(a => console.log(`  ${a.rede_id} ${a.loja_nome_raw}: entra ${a.entra?.motorista_nome}/${a.entra?.placa_norm}, sai ${a.sai?.motorista_nome ?? '(null)'}/${a.sai?.placa_norm ?? '(null)'}`))

  const altInferidas = await inferirSaiDaEscala(altParsed, DATA, svc)
  const efetivas = aplicarAlteracoes([...linhasEscala], altInferidas.map(parsedToConfirmada))

  // 3. Unitrac
  const cadastroPlacas = new Set<string>()
  for (const l of efetivas) if (l.placa_norm) cadastroPlacas.add(l.placa_norm)
  const unitBuf = readFileSync('docs/conversas-tia-erica/dia-20/unitrac/relatorio_9522.pdf')
  const veiculos = await parseUnitracPdf(unitBuf, cadastroPlacas)
  console.log(`\nUnitrac PDF: ${veiculos.length} veiculos`)

  // 4. Matcher
  const escalaRows = efetivas.map((l, i) => ({
    id: `esc-${i}`, rede_id: l.rede_id, placa_norm: l.placa_norm || null,
    loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw,
    motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem,
    data_entrega: l.data_entrega,
  }))
  const paradaRows = veiculos.flatMap((v, vi) => v.paradas.map((p, pi) => ({
    id: `par-${vi}-${pi}`, placa_norm: p.placa_norm,
    chegada: p.chegada.toISOString(), saida: p.saida.toISOString(),
    duracao_seg: p.duracao_seg, local_parada: p.local_parada,
    codigo_loja: p.codigo_loja, nome_loja: p.nome_loja,
    lat: p.lat, lng: p.lng, classificacao: p.classificacao, ordem: p.ordem,
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
  console.log(`Matcher: ${rotas.length} rotas`)

  // 5. Output por rede pra comparar
  const fmt = (d: Date | null | string | undefined) => {
    if (!d) return '-'
    const dt = typeof d === 'string' ? new Date(d) : d
    return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`
  }

  const REDES = ['ASSAI', 'ATACADAO', 'CARREFOUR', 'PREZUNIC', 'PRINCESA', 'SUPERPRIX', 'GUANABARA', 'ZONA_SUL', 'ARMAZEM_GRAO']
  for (const rede of REDES) {
    const linhasRede = efetivas.filter(l => l.rede_id === rede)
    if (!linhasRede.length) continue
    console.log(`\n\n=== ${rede} (${linhasRede.length} linhas) ===`)
    console.log(`Loja                                       | Motorista            Placa      SaidaCD  Chd    SaiLj`)
    for (const rota of rotas) {
      const esc = efetivas.find((_, i) => `esc-${i}` === rota.escala_linha_id)
      if (!esc || esc.rede_id !== rede) continue
      const p0 = rota.paradas[0]
      const loja = (esc.loja_nome_raw ?? '').slice(0, 42).padEnd(42)
      const mot = (esc.motorista_nome ?? '').slice(0, 20).padEnd(20)
      const placa = (rota.placa_norm ?? '').slice(0, 10).padEnd(10)
      console.log(`${loja} | ${mot} ${placa} ${fmt(rota.saida_cd).padEnd(8)} ${fmt(p0?.chegada).padEnd(6)} ${fmt(p0?.saida).padEnd(6)}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
