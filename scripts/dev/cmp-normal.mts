import { readFile } from 'fs/promises'
import { config } from 'dotenv'; config({ path: '.env.local' })
import { parseUnitracPdf } from '../../src/lib/parsers/unitrac-pdf.ts'
import { parseEscalaArquivo } from '../../src/lib/parsers/escala-arquivo.ts'
import { cruzaEscalaUnitrac, setSemGeo } from '../../src/lib/kpi/matcher.ts'
import { derivarStatus } from '../../src/lib/kpi/status-rota.ts'
import { createServiceClient } from '../../src/lib/supabase/service.ts'

const data = '2026-06-12'
const svc = createServiceClient()
const [lojasRes, canonRes] = await Promise.all([
  svc.from('lojas').select('id,rede_id,nome,nome_normalizado,codigo_escala,codigo_unitrac,nome_unitrac,lat,lng,raio_metros,endereco,bairro,municipio,numero').eq('ativo', true).order('id'),
  svc.from('canonical_loja').select('id,name,lat,lng,raio_metros').not('lat','is',null).not('lng','is',null),
])
const lojas = (lojasRes.data ?? []).map((l: any) => ({ ...l, raio_metros: l.raio_metros ?? 150 }))
const geo = (canonRes.data ?? []).map((c: any) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, raio_metros: c.raio_metros ?? 150 }))

const eb = await readFile('C:/Users/media/Downloads/ESCALA GERAL DE JUNHO (6).xlsx')
const escala = await parseEscalaArquivo(eb.buffer.slice(eb.byteOffset, eb.byteOffset + eb.byteLength) as any, 'x.xlsx', data)
const escalaRows = escala.map((l: any, i: number) => ({ id: `e${i}`, rede_id: l.rede_id, placa_norm: l.placa_norm || null, loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega }))

// cadastro de placas pra OCR (igual produção)
const cad = new Set<string>(); for (const l of escala) if (l.placa_norm) cad.add(l.placa_norm)
const buf = await readFile('C:/Users/media/Downloads/relatorio_10254.pdf')
const veiculos = await parseUnitracPdf(buf, cad)
const pr: any[] = []
for (const v of veiculos) for (const p of v.paradas) pr.push({ id: `${v.placa_norm}-${p.ordem}`, placa_norm: v.placa_norm, chegada: p.chegada.toISOString(), saida: p.saida.toISOString(), duracao_seg: p.duracao_seg, local_parada: p.local_parada, codigo_loja: p.codigo_loja, nome_loja: p.nome_loja, lat: p.lat, lng: p.lng, endereco: p.endereco, classificacao: p.classificacao, ordem: p.ordem })

const todas = new Map<string, any[]>(); for (const p of pr) { const a = todas.get(p.placa_norm) ?? []; a.push(p); todas.set(p.placa_norm, a) }
const saiu = (pl: string | null) => !!pl && (todas.get(pl) ?? []).some((p: any) => p.classificacao === 'LOJA' || p.classificacao === 'FORA_BASE')

setSemGeo(true)
const rotas = await cruzaEscalaUnitrac(escalaRows as any, pr as any, lojas as any, svc, geo as any, { geoEndereco: true })
const cont: Record<string, number> = {}
for (const rt of rotas) {
  const placaUni = rt.placa_unitrac ?? rt.placa_norm
  const st = derivarStatus({
    temGps: rt.paradas.length > 0 || todas.has(placaUni), ficouNaBase: rt.status === 'sem_entrega' && !!rt.placa_norm,
    paradas: rt.paradas.map((p: any) => ({ classificacao: p.classificacao, loja_id: p.loja_id ?? null })),
    viaGeo: rt._matchMeta?.algorithm === 'geo', viaTroca: rt._matchMeta?.algorithm === 'troca',
    geoConfiavel: rt.geo_confiavel ?? false, placaFoiAlgumLugar: saiu(placaUni), placaSaiuDaBase: saiu(placaUni),
  })
  cont[st.status] = (cont[st.status] ?? 0) + 1
}
const ent = (cont['ENTREGUE'] ?? 0) + (cont['ENTREGUE_GEO'] ?? 0)
console.log(`MATCHER PRODUÇÃO (PDF) dia ${data}: ${rotas.length} linhas`)
console.log(`  ENTREGUES: ${ent} (${Math.round(ent/rotas.length*100)}%)`)
console.log('  breakdown:', JSON.stringify(cont))
