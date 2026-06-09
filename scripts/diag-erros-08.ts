// Diagnóstico dos 2 erros marcados pela operação no dia 08/06:
//  KNI-8942 (Guanabara Campo Grande 11) e LCO-0978 (Zona Sul Leblon 14) —
//  sistema disse "NÃO FOI AO CLIENTE" mas o mapa mostra que esteve na loja.
import { config } from 'dotenv'; config({ path: '.env.local' })
import { readFileSync } from 'node:fs'
import { parseEscalaArquivo } from '@/lib/parsers/escala-arquivo'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac, setSemGeo, resolverLojaEsperada, type LojaRow } from '@/lib/kpi/matcher'

const DL = 'C:/Users/media/Downloads'
const ESCALAS = [`${DL}/ESCALA 08.06.pdf`, `${DL}/ESCALA ZONA SUL - JUNHO (2).xlsx`]
const RELATORIO = `${DL}/relatorio_10122.pdf`
const DATA = '2026-06-08'
const ALVO = new Set(['KNI8942', 'LCO0978'])
const LOJA_COLS = 'id,rede_id,nome,nome_normalizado,codigo_escala,codigo_unitrac,nome_unitrac,lat,lng,raio_metros,endereco,bairro,municipio,numero'

async function fetchAll(url: string, key: string, q: string): Promise<any[]> {
  for (let t = 0; t < 4; t++) { try {
    const out: any[] = []
    for (let from = 0; ; from += 1000) {
      const r = await fetch(`${url}/rest/v1/${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` } })
      if (!r.ok) throw new Error(`Supabase ${r.status}`); const b = (await r.json()) as any[]; out.push(...b); if (b.length < 1000) break
    } return out
  } catch (e) { if (t === 3) throw e } } return []
}
const mapLoja = (l: any): LojaRow => ({ id: String(l.id ?? ''), rede_id: String(l.rede_id ?? ''), nome: l.nome ?? '', nome_normalizado: l.nome_normalizado ?? '', codigo_escala: l.codigo_escala ?? null, codigo_unitrac: l.codigo_unitrac ?? null, nome_unitrac: l.nome_unitrac ?? null, lat: l.lat ?? null, lng: l.lng ?? null, raio_metros: l.raio_metros ?? 150, endereco: l.endereco ?? null, bairro: l.bairro ?? null, municipio: l.municipio ?? null, numero: l.numero ?? null })

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const [lojasRaw, veicRaw] = await Promise.all([
    fetchAll(url, key, `lojas?select=${LOJA_COLS}&ativo=eq.true&order=id`),
    fetchAll(url, key, `veiculos?select=placa_norm&ativo=eq.true`),
  ])
  const lojas = lojasRaw.map(mapLoja)

  let escalaLinhas: any[] = []
  for (const e of ESCALAS) {
    try { escalaLinhas = escalaLinhas.concat(await parseEscalaArquivo(readFileSync(e), e.split('/').pop()!, DATA)) }
    catch (err) { console.log(`⚠ erro parseando ${e}:`, (err as Error).message) }
  }
  console.log(`Escala: ${escalaLinhas.length} linhas | cadastro: ${lojas.length} lojas\n`)

  const cadastroPlacas = new Set<string>()
  for (const l of escalaLinhas) if (l.placa_norm) cadastroPlacas.add(l.placa_norm)
  for (const v of veicRaw) if (v.placa_norm) cadastroPlacas.add(String(v.placa_norm))
  const veiculos = await parseUnitracPdf(readFileSync(RELATORIO), cadastroPlacas)

  const escalaMap = new Map<string, any>()
  const escalaRows = escalaLinhas.map((l, i) => { const id = `esc-${i}`; escalaMap.set(id, l)
    return { id, rede_id: l.rede_id, placa_norm: l.placa_norm || null, loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome, carro_ordem: l.carro_ordem, data_entrega: l.data_entrega } })
  const paradaRows = veiculos.flatMap((v, vi) => v.paradas.map((p, pi) => ({
    id: `par-${vi}-${pi}`, placa_norm: p.placa_norm, chegada: p.chegada.toISOString(), saida: p.saida.toISOString(),
    duracao_seg: p.duracao_seg, local_parada: p.local_parada, codigo_loja: p.codigo_loja, nome_loja: p.nome_loja,
    lat: p.lat, lng: p.lng, endereco: p.endereco, classificacao: p.classificacao, ordem: p.ordem })))

  setSemGeo(true)
  const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojas, undefined, undefined, { geoEndereco: true })

  for (const placa of ALVO) {
    console.log('\n' + '='.repeat(80) + `\nPLACA ${placa}\n` + '='.repeat(80))
    const escRows = escalaLinhas.filter(l => l.placa_norm === placa)
    if (!escRows.length) console.log('  ⚠ não está na escala (placa_norm) — pode ser Mercosul/alteração')
    for (const e of escRows) {
      console.log(`  ESCALA: rede=${e.rede_id} | loja="${e.loja_nome_raw}" | cod="${e.loja_codigo_raw}" | mot=${e.motorista_nome}`)
      const esp = resolverLojaEsperada(e, lojas)
      console.log(esp ? `    → loja cadastro: "${esp.nome}" cod_unitrac=${esp.codigo_unitrac ?? 'NULL'} lat=${esp.lat} lng=${esp.lng} raio=${esp.raio_metros}` : '    → NÃO resolveu loja no cadastro')
    }
    const v = veiculos.find(v => v.placa_norm === placa)
    if (!v) console.log('  ⚠ placa NÃO está no relatório Unitrac (sem rastreador)')
    else { console.log(`  UNITRAC: ${v.paradas.length} parada(s):`)
      for (const p of v.paradas) console.log(`    - [${p.classificacao}] cod=${p.codigo_loja ?? '—'} "${p.nome_loja ?? '—'}" ${p.chegada.toISOString().slice(11,16)} lat=${p.lat ?? '—'} lng=${p.lng ?? '—'}`) }
    const rota = rotas.find(r => r.placa_norm === placa || r.placa_real === placa)
    if (!rota) console.log('  ⚠ nenhuma rota gerada')
    else { const comLoja = rota.paradas.filter(p => p.loja_id != null).length
      console.log(`  ROTA: status=${rota.status} | algo=${(rota as any)._matchMeta?.algorithm ?? '—'} | conf=${(rota as any)._matchMeta?.confidence ?? '—'} | paradas=${rota.paradas.length} | com_loja_id=${comLoja} | geo_dist=${(rota as any).geo_dist_metros ?? '—'}`)
      for (const p of rota.paradas) console.log(`     rota-parada: [${p.classificacao}] loja_id=${p.loja_id ?? 'NULL'} cod=${(p as any).codigo_loja ?? '—'}`) }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
