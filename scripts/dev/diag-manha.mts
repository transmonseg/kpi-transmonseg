import { readFile } from 'fs/promises'
import { config } from 'dotenv'; config({ path: '.env.local' })
import { createServiceClient } from '../../src/lib/supabase/service.ts'
import { parseEscalaArquivo } from '../../src/lib/parsers/escala-arquivo.ts'
import { parseUnitracPdf } from '../../src/lib/parsers/unitrac-pdf.ts'
import { cruzaEscalaUnitrac, setSemGeo, variantesPlaca, type UnitracParadaRow } from '../../src/lib/kpi/matcher.ts'
import { derivarStatus } from '../../src/lib/kpi/status-rota.ts'
import { buscarFrota } from '../../src/lib/unitrac-api/frota.ts'
import { buscarPontos } from '../../src/lib/unitrac-api/pontos.ts'
import { buscarStopsCru, consolidaParadasApi } from '../../src/lib/unitrac-api/consolida.ts'
import { mesclarParadas } from '../../src/lib/kpi/merge-paradas.ts'
import { saidaBaseSeEmRota, JANELA_FIM } from '../../src/lib/kpi/gerar-kpi-local.ts'
import { situacaoViva } from '../../src/lib/kpi/situacao-viva.ts'

const ESC = 'C:/Users/media/Downloads/ESCALA GERAL DE JUNHO DIA 15.xlsx'
const PDF = 'C:/Users/media/Downloads/relatorio_10290.pdf'
const data = '2026-06-15'
const CUTOFF = Number(process.argv[2] ?? 6.5)
const cutoffMs = new Date(`${data}T00:00:00.000Z`).getTime() + CUTOFF * 3600_000
const hhmm = (d: Date | null) => d ? `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}` : '—'

let escalaLinhas = await parseEscalaArquivo(await readFile(ESC), ESC, data)
const redesComPlaca = new Set(escalaLinhas.filter(l => l.placa_norm).map(l => l.rede_id))
escalaLinhas = escalaLinhas.filter(l => l.placa_norm || !redesComPlaca.has(l.rede_id) || l.obs === 'SEM PEDIDO')
const cad = new Set<string>(); for (const l of escalaLinhas) if (l.placa_norm) cad.add(l.placa_norm)
const veic = await parseUnitracPdf(await readFile(PDF), cad)
let paradaRows: UnitracParadaRow[] = veic.flatMap((v, vi) => v.paradas.map((p, pi) => ({ id: `pdf-${vi}-${pi}`, placa_norm: p.placa_norm, chegada: p.chegada.toISOString(), saida: p.saida.toISOString(), duracao_seg: p.duracao_seg, local_parada: p.local_parada, codigo_loja: p.codigo_loja, nome_loja: p.nome_loja, lat: p.lat, lng: p.lng, endereco: p.endereco, classificacao: p.classificacao, ordem: p.ordem })))
const frota = await buscarFrota(); const cvs = frota.map(v => v.cv); const pts = await buscarPontos(cvs)
const placasEscala = new Set(escalaLinhas.map(l => l.placa_norm).filter(Boolean) as string[])
const apiRows: UnitracParadaRow[] = []
for (const v of frota) { if (!placasEscala.has(v.placaNorm)) continue; const ev = (await buscarStopsCru(v.cv,48)).filter(e => new Date(e._data).getTime() <= cutoffMs); apiRows.push(...consolidaParadasApi(ev, pts, data, v.placaNorm)) }
paradaRows = mesclarParadas(paradaRows, apiRows)

const svc = createServiceClient()
const lr = await svc.from('lojas').select('id,rede_id,nome,nome_normalizado,codigo_escala,codigo_unitrac,nome_unitrac,lat,lng,raio_metros,endereco,bairro,municipio,numero').eq('ativo', true).order('id')
const lojas = (lr.data ?? []).map((l: any) => ({ ...l, raio_metros: l.raio_metros ?? 150 }))
const escalaRows = escalaLinhas.map((l, i) => ({ id: `esc-${i}`, rede_id: l.rede_id, placa_norm: l.placa_norm || null, loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega }))
const escMap = new Map(escalaRows.map((e, i) => [e.id, escalaLinhas[i]]))
const reportMaxHora = paradaRows.reduce((mx, p) => { const d = new Date(p.saida ?? p.chegada); return Math.max(mx, d.getUTCHours()+d.getUTCMinutes()/60) }, 0)
const corteMs = paradaRows.reduce((mx, p) => Math.max(mx, new Date(p.saida ?? p.chegada).getTime()), 0)
const saiuSet = new Set(paradaRows.filter(p => p.classificacao==='LOJA'||p.classificacao==='FORA_BASE').map(p=>p.placa_norm))
const relSet = new Set(paradaRows.map(p=>p.placa_norm))
const saiu = (pl:string|null)=>!!pl&&(saiuSet.has(pl)||variantesPlaca(pl).some(v=>saiuSet.has(v)))
const rastr = (pl:string|null)=>!!pl&&(relSet.has(pl)||variantesPlaca(pl).some(v=>relSet.has(v)))
setSemGeo(true)
const rotas = await cruzaEscalaUnitrac(escalaRows as any, paradaRows as any, lojas as any, svc, [] as any, { geoEndereco: true })

const idx = new Map<string, {classificacao:string;chegada:Date;saida:Date|null}[]>()
for (const p of paradaRows) { const a = idx.get(p.placa_norm)??[]; a.push({classificacao:p.classificacao,chegada:new Date(p.chegada),saida:p.saida?new Date(p.saida):null}); idx.set(p.placa_norm,a) }
// saída de base PERMISSIVA: última parada BASE da placa (mesmo que tenha ido a alguma LOJA depois)
const ultimaBaseConhecida = (pl:string|null): Date|null => {
  if (!pl) return null
  const ps = idx.get(pl) ?? variantesPlaca(pl).flatMap(v=>idx.get(v)??[])
  const bases = ps.filter(p=>p.classificacao==='BASE').sort((a,b)=>a.chegada.getTime()-b.chegada.getTime())
  const u = bases[bases.length-1]
  return u ? (u.saida ?? u.chegada) : null
}

let probSaidaBlank = 0, probDeveriaRota = 0, total = 0
const ex1: string[] = [], ex2: string[] = []
for (const rota of rotas) {
  const esc = escMap.get(rota.escala_linha_id)!; total++
  const janelaFim = JANELA_FIM[esc.rede_id] ?? 12
  const relatorioCedo = reportMaxHora < janelaFim
  const temEntrega = rota.paradas.some(p=>p.loja_id!=null)
  const pu = rota.placa_unitrac ?? rota.placa_norm
  const st = derivarStatus({ temGps: rota.paradas.length>0||rastr(rota.placa_norm), ficouNaBase: rota.status==='sem_entrega'&&!!esc.placa_norm, paradas: rota.paradas.map(p=>({classificacao:p.classificacao,loja_id:p.loja_id??null})), viaGeo:false, viaTroca:false, geoConfiavel: rota.geo_confiavel??false, placaFoiAlgumLugar: saiu(pu), placaSaiuDaBase: saiu(pu) } as any)
  const ent = st.status==='ENTREGUE'||st.status==='ENTREGUE_GEO'
  const sv = relatorioCedo ? situacaoViva({ entregue: ent, naApi: rastr(rota.placa_norm), saiuDaBase: saiu(rota.placa_norm) }) : undefined
  // saída que o sistema MOSTRA hoje (rota.saida_cd ?? saidaParcial estrito)
  const saidaParcial = relatorioCedo && !temEntrega ? saidaBaseSeEmRota(idx.get(rota.placa_unitrac??rota.placa_norm??''), corteMs) : null
  const saidaMostrada = rota.saida_cd ?? saidaParcial
  const baseConhecida = ultimaBaseConhecida(rota.placa_unitrac ?? rota.placa_norm)

  // PROBLEMA 1: em rota (ou na base) mas saída em branco, e a gente SABE a saída de base
  if ((sv==='EM_ROTA'||sv==='NA_BASE') && !saidaMostrada && baseConhecida) {
    probSaidaBlank++
    if (ex1.length<12) ex1.push(`${rota.placa_norm} ${String(esc.loja_nome_raw).slice(0,22).padEnd(22)} sv=${sv} mostra=${hhmm(saidaMostrada)} | SABE base=${hhmm(baseConhecida)}`)
  }
  // PROBLEMA 2: caiu como erro/vermelho (sem sv suavizando) mas a placa SAIU da base
  const vermelho = !ent && !sv && st.status!=='SEM_RASTREADOR'
  if (vermelho && saiu(rota.placa_norm)) {
    probDeveriaRota++
    if (ex2.length<12) ex2.push(`${rota.placa_norm} ${String(esc.loja_nome_raw).slice(0,22).padEnd(22)} status=${st.status} (saiu da base ${hhmm(baseConhecida)})`)
  }
}
console.log(`\ncorte ${CUTOFF}h · relatorioCedo=${reportMaxHora<12} · ${total} linhas\n`)
console.log(`### PROBLEMA 1: "em rota/na base" com SAÍDA EM BRANCO mas a gente sabe a saída de base: ${probSaidaBlank}`)
ex1.forEach(s=>console.log('  '+s))
console.log(`\n### PROBLEMA 2: marcado como ERRO/vermelho mas a placa SAIU da base (deveria ser em rota): ${probDeveriaRota}`)
ex2.forEach(s=>console.log('  '+s))
