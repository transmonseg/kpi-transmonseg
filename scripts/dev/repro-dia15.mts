import { readFile } from 'fs/promises'
import { config } from 'dotenv'; config({ path: '.env.local' })
import { createServiceClient } from '../../src/lib/supabase/service.ts'
import { parseEscalaArquivo } from '../../src/lib/parsers/escala-arquivo.ts'
import { parseUnitracPdf } from '../../src/lib/parsers/unitrac-pdf.ts'
import { cruzaEscalaUnitrac, setSemGeo, resolverLojaEsperada, variantesPlaca, type UnitracParadaRow } from '../../src/lib/kpi/matcher.ts'
import { derivarStatus } from '../../src/lib/kpi/status-rota.ts'
import { buscarFrota } from '../../src/lib/unitrac-api/frota.ts'
import { buscarPontos } from '../../src/lib/unitrac-api/pontos.ts'
import { buscarStopsCru, consolidaParadasApi } from '../../src/lib/unitrac-api/consolida.ts'
import { buscarAlvos, confirmaPorAlvo, inicioRotaPorAlvo } from '../../src/lib/unitrac-api/alvos.ts'
import { mesclarParadas } from '../../src/lib/kpi/merge-paradas.ts'
import { saidaBaseSeEmRota, JANELA_FIM } from '../../src/lib/kpi/gerar-kpi-local.ts'
import { situacaoViva } from '../../src/lib/kpi/situacao-viva.ts'

const ESC = '/c/Users/media/Downloads/ESCALA GERAL DE JUNHO DIA 15.xlsx'.replace('/c/', 'C:/')
const PDF = '/c/Users/media/Downloads/relatorio_10290.pdf'.replace('/c/', 'C:/')
const data = '2026-06-15'
const CUTOFF_HORA = Number(process.argv[2] ?? 6.5) // simula relatório ~06:30
const cutoffMs = new Date(`${data}T00:00:00.000Z`).getTime() + CUTOFF_HORA * 3600_000
const RECLAMADAS = ['FQN6J72', 'INW8A51', 'KRK3D12', 'KXB6E57', 'TML7D61', 'UBF5G36', 'KPB5I95', 'GAJ6H51', 'KNC1I34', 'EFU5H04', 'NTT4858', 'DBB8D19', 'MES7F27', 'JAJ6B36']
const hhmm = (d: Date | null | undefined) => d ? `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` : '—'

console.log(`Reproduzindo dia ${data} · corte simulado ${CUTOFF_HORA}h (relatório gerado ~06:23)\n`)

// 1) ESCALA
let escalaLinhas = await parseEscalaArquivo(await readFile(ESC), ESC, data)
const redesComPlaca = new Set(escalaLinhas.filter(l => l.placa_norm).map(l => l.rede_id))
escalaLinhas = escalaLinhas.filter(l => l.placa_norm || !redesComPlaca.has(l.rede_id) || l.obs === 'SEM PEDIDO')
console.log(`escala: ${escalaLinhas.length} linhas`)

// 2) PDF
const cad = new Set<string>(); for (const l of escalaLinhas) if (l.placa_norm) cad.add(l.placa_norm)
const veic = await parseUnitracPdf(await readFile(PDF), cad)
let paradaRows: UnitracParadaRow[] = veic.flatMap((v, vi) => v.paradas.map((p, pi) => ({
  id: `par-${vi}-${pi}`, placa_norm: p.placa_norm, chegada: p.chegada.toISOString(), saida: p.saida.toISOString(),
  duracao_seg: p.duracao_seg, local_parada: p.local_parada, codigo_loja: p.codigo_loja, nome_loja: p.nome_loja,
  lat: p.lat, lng: p.lng, endereco: p.endereco, classificacao: p.classificacao, ordem: p.ordem,
})))

// 3) MERGE PDF+API (corte simulado nos eventos da API)
const frota = await buscarFrota()
const pontos = await buscarPontos(frota.map(v => v.cv))
const alvos = await buscarAlvos(frota.map(v => v.cv))
const placasEscala = new Set(escalaLinhas.map(l => l.placa_norm).filter(Boolean) as string[])
const apiRows: UnitracParadaRow[] = []
for (const v of frota) {
  if (!placasEscala.has(v.placaNorm)) continue
  const eventos = (await buscarStopsCru(v.cv, 48)).filter(e => new Date(e._data).getTime() <= cutoffMs)
  apiRows.push(...consolidaParadasApi(eventos, pontos, data, v.placaNorm))
}
paradaRows = mesclarParadas(paradaRows, apiRows)

// 4) sinais por placa
const reportMaxHora = paradaRows.reduce((mx, p) => { const d = new Date(p.saida ?? p.chegada); return Math.max(mx, d.getUTCHours() + d.getUTCMinutes() / 60) }, 0)
const corteMs = paradaRows.reduce((mx, p) => Math.max(mx, new Date(p.saida ?? p.chegada).getTime()), 0)
const placasSairam = new Set(paradaRows.filter(p => p.classificacao === 'LOJA' || p.classificacao === 'FORA_BASE').map(p => p.placa_norm))
const placaSaiuDaBase = (pl: string | null) => !!pl && (placasSairam.has(pl) || variantesPlaca(pl).some(v => placasSairam.has(v)))
const placasNoRel = new Set(paradaRows.map(p => p.placa_norm))
const placaRastreada = (pl: string | null) => !!pl && (placasNoRel.has(pl) || variantesPlaca(pl).some(v => placasNoRel.has(v)))
console.log(`reportMaxHora=${reportMaxHora.toFixed(2)}h · relatorioCedo(default12)=${reportMaxHora < 12}\n`)

// 5) matcher + enriquecimento (NOVO: sem inicioRotaPorAlvo; confirmaPorAlvo só feito<=corte)
const svc = createServiceClient()
const [lr, cr] = await Promise.all([
  svc.from('lojas').select('id,rede_id,nome,nome_normalizado,codigo_escala,codigo_unitrac,nome_unitrac,lat,lng,raio_metros,endereco,bairro,municipio,numero').eq('ativo', true).order('id'),
  svc.from('canonical_loja').select('id,name,lat,lng,raio_metros').not('lat', 'is', null).not('lng', 'is', null),
])
const lojas = (lr.data ?? []).map((l: any) => ({ ...l, raio_metros: l.raio_metros ?? 150 }))
const geo = (cr.data ?? []).map((c: any) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, raio_metros: c.raio_metros ?? 150 }))
const escalaRows = escalaLinhas.map((l, i) => ({ id: `esc-${i}`, rede_id: l.rede_id, placa_norm: l.placa_norm || null, loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega }))
const escMap = new Map(escalaRows.map((e, i) => [e.id, escalaLinhas[i]]))
setSemGeo(true)
const rotas = await cruzaEscalaUnitrac(escalaRows as any, paradaRows as any, lojas as any, svc, geo as any, { geoEndereco: true })

// alvos com feito <= corte (simula o que a API "sabia" às 06:30)
const alvosCorte = alvos.filter(a => !a.feitoISO || new Date(a.feitoISO + 'Z').getTime() <= cutoffMs)
for (const rota of rotas) {
  const esc = escMap.get(rota.escala_linha_id); if (!esc || !rota.placa_norm) continue
  const esperada = resolverLojaEsperada(esc as any, lojas as any); if (!esperada?.codigo_unitrac) continue
  const placaAlvo = rota.placa_unitrac ?? rota.placa_norm
  const c = confirmaPorAlvo(placaAlvo, esperada.codigo_unitrac, alvosCorte)
  if (c && !rota.paradas.some(p => p.loja_id === esperada.id)) {
    const t = new Date(c.feitoISO + 'Z')
    rota.paradas = [{ parada_id: null, loja_id: esperada.id, nome: esperada.nome, chegada: t, saida: t, duracao_min: 0, classificacao: 'LOJA' } as any]
    rota.status = 'ok'; (rota as any)._matchMeta = { algorithm: 'api' }
  }
}

// paradasIndex p/ saída parcial
const paradasIndex = new Map<string, { classificacao: string; chegada: Date; saida: Date | null }[]>()
for (const p of paradaRows) { const a = paradasIndex.get(p.placa_norm) ?? []; a.push({ classificacao: p.classificacao, chegada: new Date(p.chegada), saida: p.saida ? new Date(p.saida) : null }); paradasIndex.set(p.placa_norm, a) }

// 6) por placa reclamada
console.log('PLACA     LOJA(escala)                  STATUS@corte    SaídaCD(novo)  ao-vivo     | velho(alvo-início)')
console.log('-'.repeat(120))
for (const placa of RECLAMADAS) {
  const idx = rotas.findIndex(r => r.placa_norm === placa)
  if (idx < 0) { console.log(`${placa}  (não está na escala parseada / sem rota)`); continue }
  const rota = rotas[idx]
  const esc = escMap.get(rota.escala_linha_id)!
  const esperada = resolverLojaEsperada(esc as any, lojas as any)
  const janelaFim = JANELA_FIM[esc.rede_id] ?? 12
  const relatorioCedo = reportMaxHora < janelaFim
  const temEntrega = rota.paradas.some(p => p.loja_id != null)
  const saidaParcial = relatorioCedo && !temEntrega ? saidaBaseSeEmRota(paradasIndex.get(rota.placa_unitrac ?? rota.placa_norm ?? ''), corteMs) : null
  const saidaFinal = rota.saida_cd ?? saidaParcial
  const st = derivarStatus({
    temGps: rota.paradas.length > 0 || placaRastreada(rota.placa_norm),
    ficouNaBase: rota.status === 'sem_entrega' && !!esc.placa_norm,
    paradas: rota.paradas.map(p => ({ classificacao: p.classificacao, loja_id: p.loja_id ?? null })),
    viaGeo: (rota as any)._matchMeta?.algorithm === 'geo', viaTroca: (rota as any)._matchMeta?.algorithm === 'troca',
    geoConfiavel: rota.geo_confiavel ?? false,
    placaFoiAlgumLugar: placaSaiuDaBase(rota.placa_norm), placaSaiuDaBase: placaSaiuDaBase(rota.placa_norm),
    relatorioParcial: !!saidaParcial, saidaBaseParcial: saidaParcial ? hhmm(saidaParcial) : null,
  } as any)
  const sv = relatorioCedo ? situacaoViva({ entregue: st.status === 'ENTREGUE' || st.status === 'ENTREGUE_GEO', naApi: placaRastreada(rota.placa_norm), saiuDaBase: placaSaiuDaBase(rota.placa_norm) }) : undefined
  // velho: o que inicioRotaPorAlvo daria (sem corte de dia) → bug
  const velho = esperada?.codigo_unitrac ? inicioRotaPorAlvo(rota.placa_unitrac ?? rota.placa_norm!, esperada.codigo_unitrac, alvos) : null
  const velhoTxt = velho ? velho.replace('T', ' ').slice(11, 16) : '—'
  const svTxt = sv && sv !== 'ENTREGUE' ? (sv === 'EM_ROTA' ? 'Em rota' : sv === 'NA_BASE' ? 'Na base' : 'Sem sinal') : (st.status === 'ENTREGUE' || st.status === 'ENTREGUE_GEO' ? 'entregue' : '—')
  console.log(`${placa}  ${(esc.loja_nome_raw ?? '').slice(0, 28).padEnd(28)}  ${st.status.padEnd(14)}  ${hhmm(saidaFinal).padEnd(13)}  ${svTxt.padEnd(10)} | ${velhoTxt}`)
}
