/** Roda pipeline completo dia 19 e dump KPIs por rede pra comparar. */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync, writeFileSync } from 'fs'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseAlteracaoPdfTabular } from '@/lib/parsers/alteracao-pdf-tabular'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { inferirSaiDaEscala } from '@/lib/parsers/inferir-sai'
import { aplicarAlteracoes, parsedToConfirmada } from '@/lib/kpi/aplicar-alteracoes'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'
import { createClient } from '@supabase/supabase-js'

const DATA = '2026-05-19'
const BASE = 'docs/conversas-tia-erica/dia-25/escalas/'
const PDF_ALT = 'docs/conversas-tia-erica/dia-19/alteracoes/ALTERACAO DE ESCALA GERAL 19.05 (3).pdf'
const PDF_UNI = 'docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'

async function main() {
  const buf = {
    geral: readFileSync(BASE + 'ESCALA GERAL DE MAIO 0 (2).xlsx'),
    zs: readFileSync(BASE + 'ESCALA ZONA SUL - MAIO (9).xlsx'),
    pax: readFileSync(BASE + 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (7).xlsx'),
    arm: readFileSync(BASE + 'ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx'),
  }
  const linhas = [
    ...await parseEscalaGeral(buf.geral, DATA),
    ...await parseEscalaZonaSul(buf.zs, DATA),
    ...await parseEscalaPax(buf.pax, DATA),
    ...await parseEscalaArmazemGrao(buf.arm, DATA),
  ]
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const altParsed = await parseAlteracaoPdfTabular(readFileSync(PDF_ALT))
  const altInfer = await inferirSaiDaEscala(altParsed, DATA, svc)
  const efetivas = aplicarAlteracoes([...linhas], altInfer.map(parsedToConfirmada))

  const veiculos = await parseUnitracPdf(readFileSync(PDF_UNI), null)
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

  const { data: canonRes } = await svc.from('canonical_loja').select('id, name, lat, lng, raio_metros').not('lat', 'is', null).not('lng', 'is', null)
  const geoStores = (canonRes ?? []).map((c: Record<string, unknown>) => ({
    id: c.id as string, name: c.name as string,
    lat: c.lat as number, lng: c.lng as number,
    raio_metros: (c.raio_metros as number | null) ?? 150,
  }))
  const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas, svc, geoStores)
  console.log(`Matcher gerou ${rotas.length} rotas`)

  // Por rede: loja|motorista|placa|SaiCD|CHD|SaiLj
  const fmt = (d: Date | null | string | undefined) => {
    if (!d) return '-'
    const dt = typeof d === 'string' ? new Date(d) : d
    return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`
  }

  const REDES = ['ARMAZEM_GRAO','ASSAI','ATACADAO','CAB_PETROPOLIS','CARREFOUR','EMANUEL','FEIRA_NOVA','GUANABARA','MUNDIAL','PRINCESA','PREZUNIC','SAMS_CLUB','SENDAS','SUPERCOMPRAS','SUPER_PAX','SUPERPRIX','VIANENSE','ZONA_SUL']
  const out: string[] = []
  for (const rede of REDES) {
    const linhasRede = efetivas.filter(l => l.rede_id === rede)
    if (!linhasRede.length) continue
    out.push(`\n## ${rede} (${linhasRede.length} linhas)`)
    out.push(`Loja                                       | Motorista            Placa      SaiCD    CHD    SaiLj`)
    for (const rota of rotas) {
      const esc = efetivas.find((_, i) => `esc-${i}` === rota.escala_linha_id)
      if (!esc || esc.rede_id !== rede) continue
      const p0 = rota.paradas[0]
      const loja = (esc.loja_nome_raw ?? '').slice(0, 42).padEnd(42)
      const mot = (esc.motorista_nome ?? '').slice(0, 20).padEnd(20)
      const placa = (rota.placa_norm ?? '').slice(0, 10).padEnd(10)
      out.push(`${loja} | ${mot} ${placa} ${fmt(rota.saida_cd).padEnd(8)} ${fmt(p0?.chegada).padEnd(6)} ${fmt(p0?.saida).padEnd(6)}`)
    }
  }
  writeFileSync('scripts/analise/_pos_fix_d19.md', out.join('\n'))
  console.log('Saída em scripts/analise/_pos_fix_d19.md')
}
main().catch(e => { console.error(e); process.exit(1) })
