// Aprendizado noturno do cadastro de locais dos clientes (05/10).
//
// Uso: npx tsx --env-file=.env.production scripts/aprender-locais-clientes.ts [AAAA-MM-DD] [--aplicar]
// Sem data: ontem (Brasília). Sem --aplicar: só relatório.
//
// Para o dia: roda o KPI da Nutry Max (a mesma gerarKpiNutrimax), pega as
// paradas do monitoramento por placa (ponte base-horarios, posição contínua)
// e procura por fora (Nominatim) o endereço das NFs não confirmadas. As
// evidências (src/lib/kpi-romaneio/aprender-locais.ts) vão pra
// kpi_cliente_local_evidencia e o local de cada cliente afetado é recalculado
// com todas as evidências dele (escolherLocal). Local manual nunca é trocado.
import { createServiceClient } from '../src/lib/supabase/service'
import { hojeBR } from '../src/lib/data-br'
import { gerarKpiNutrimax, type EntradaKpiNutrimax } from '../src/lib/kpi-romaneio/gerar-nutrimax'
import { entradaDoDia } from '../src/lib/kpi-romaneio/ao-vivo-servico'
import { buscarHorariosBase, type ParadaBridge } from '../src/lib/kpi-romaneio/base-horarios'
import { evidenciasDoDia, escolherLocal, type EvidenciaLocal } from '../src/lib/kpi-romaneio/aprender-locais'
import { chaveClienteLocal, type FonteLocal } from '../src/lib/kpi-romaneio/locais-clientes'
import { diaAnterior } from '../src/lib/kpi-romaneio/ao-vivo'
import { parseEscala } from '../src/lib/kpi-romaneio/parse-escala'
import { parseRomaneio } from '../src/lib/kpi-romaneio/parse-romaneio'
import { parsePao } from '../src/lib/kpi-romaneio/parse-pao'
import { normPlaca } from '../src/lib/unitrac-api'
import type { LinhaDetalheEntrega } from '../src/lib/kpi-romaneio/types'

const EMPRESA = 'nutrimax'
const BUCKET = 'kpi-romaneio-inputs'

async function entradaDaGeracao(data: string): Promise<EntradaKpiNutrimax | null> {
  const svc = createServiceClient()
  const { data: g } = await svc.from('kpi_romaneio_geracoes').select('escala_storage_path, romaneio_storage_path, pao_storage_path')
    .eq('cliente', EMPRESA).eq('data_referencia', data).not('romaneio_storage_path', 'is', null)
    .order('gerado_em', { ascending: false }).limit(1).maybeSingle()
  if (!g) return null
  const baixar = async (p: string | null) => {
    if (!p) return null
    const { data: arq, error } = await svc.storage.from(BUCKET).download(p)
    if (error || !arq) throw new Error(`download ${p}: ${error?.message}`)
    return Buffer.from(await arq.arrayBuffer())
  }
  const [e, r, pa] = await Promise.all([baixar(g.escala_storage_path), baixar(g.romaneio_storage_path), baixar(g.pao_storage_path)])
  return {
    data, escala: e ? await parseEscala(e) : [], romaneio: await parseRomaneio(r!),
    pao: pa ? await parsePao(pa, data) : { linhas: [], escala: [] }, escalaEnviada: !!e, paoEnviado: !!pa,
  }
}

const CIDADES: Record<string, string> = { 'CAMPOS DOS GOYT': 'CAMPOS DOS GOYTACAZES', 'ARMACAO DOS BUZ': 'ARMACAO DOS BUZIOS' }
async function nominatim(params: Record<string, string>): Promise<{ lat: number; lng: number } | null> {
  await new Promise(r => setTimeout(r, 1100)) // política de uso: 1 req/s
  const u = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ ...params, format: 'json', limit: '1', countrycodes: 'br' })
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'kpi-transmonseg/1.0 (aprendizado de locais)' }, signal: AbortSignal.timeout(15_000) })
    const j = (await r.json()) as { lat: string; lon: string }[]
    return j[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null
  } catch { return null }
}
/** Endereço do romaneio ("RUA X, 10 - BAIRRO, CIDADE - compl - CEP") achado por fora. */
async function geocodeIndependente(endereco: string): Promise<{ lat: number; lng: number } | null> {
  const m = endereco.match(/^\s*-?\s*(.*?),\s*([^-]*?)\s+-\s+(.*?),\s+(.*?)\s+-/)
  if (!m) return null
  const rua = m[1].trim(), num = m[2].trim().replace(/[^0-9].*$/, ''), cidade = CIDADES[m[4].trim()] ?? m[4].trim()
  return (num && num !== '0' ? await nominatim({ street: `${num} ${rua}`, city: cidade, state: 'Rio de Janeiro' }) : null)
    ?? await nominatim({ street: rua, city: cidade, state: 'Rio de Janeiro' })
}

async function main() {
  const args = process.argv.slice(2)
  const aplicar = args.includes('--aplicar')
  const data = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? diaAnterior(hojeBR())
  const entrada = (await entradaDoDia(EMPRESA, data)) ?? (await entradaDaGeracao(data))
  if (!entrada) { console.log(`[locais] ${data}: sem romaneio guardado, nada a aprender`); return }

  let detalhe: LinhaDetalheEntrega[] = []
  const geo = new Map<string, { lat: number; lng: number; confiavel: boolean }>()
  await gerarKpiNutrimax(entrada, {
    aoMontarDetalhe: ({ detalhe: d, romaneioGeo }) => {
      detalhe = d
      for (const l of romaneioGeo) if (l.lat != null && l.lng != null) geo.set(l.nf, { lat: l.lat, lng: l.lng, confiavel: l.geoConfiavel !== false })
    },
  })

  const placas = [...new Set(detalhe.map(d => normPlaca(d.placa)).filter(Boolean))]
  const horarios = await buscarHorariosBase(placas, data, new Map(), true)
  const paradasPorPlaca = new Map<string, { apagao: boolean; paradas: ParadaBridge[] }>()
  for (const [placa, h] of horarios) if (h.consultaPosicoesOk) paradasPorPlaca.set(placa, { apagao: !!h.apagaoDeSinal, paradas: h.paradas ?? [] })

  const indep = new Map<string, { lat: number; lng: number } | null>()
  const naoConfirmadas = detalhe.filter(d => d.status === 'pendente' && chaveClienteLocal(d) && d.evidencia !== 'sem_rastreador' && d.evidencia !== 'nao_saiu_da_base' && !/^(CARGA SEM PLACA|AGUARDANDO)/.test(d.observacao ?? ''))
  for (const d of naoConfirmadas) indep.set(d.nf, await geocodeIndependente(d.endereco))

  // Cadastro da Unitrac por NF (snapshot dos alvos do dia) -- evidencia "feito + parada no cadastro".
  const cadastro = new Map<string, { lat: number; lng: number }>()
  const { data: snap } = await createServiceClient().from('kpi_alvos_snapshot').select('alvos').eq('cliente', EMPRESA).eq('data_referencia', data).order('capturado_em', { ascending: false }).limit(1).maybeSingle()
  for (const a of (snap?.alvos as { documento?: string | null; pontoLat?: number | null; pontoLng?: number | null }[] | null) ?? []) {
    if (a.documento && a.pontoLat && a.pontoLng) cadastro.set(a.documento, { lat: a.pontoLat, lng: a.pontoLng })
  }
  const evs: EvidenciaLocal[] = evidenciasDoDia({ detalhe, geo, paradasPorPlaca, indep, cadastro })
  const conf = evs.filter(e => e.origem === 'entrega_confirmada'), orfas = evs.filter(e => e.origem === 'parada_orfa')
  console.log(`[locais] ${data}: ${detalhe.length} NFs, ${naoConfirmadas.length} não confirmadas olhadas, ${paradasPorPlaca.size} placas com paradas do monitoramento`)
  console.log(`[locais] evidências: ${conf.length} entregas confirmadas, ${orfas.length} paradas órfãs`)
  console.log(`[locais] das órfãs, ${orfas.filter(e => /cadastro/.test(e.detalhe)).length} vêm do cadastro da Unitrac (feito + parada)`)
  for (const e of orfas) console.log(`  órfã  NF ${e.nf} cliente ${e.chave} ${e.nome}: ${e.detalhe}; nosso ponto a ${e.distGeocodeM ?? '?'} m -> ${e.lat.toFixed(6)},${e.lng.toFixed(6)}`)
  if (!aplicar) { console.log('[locais] sem --aplicar: nada gravado'); return }

  const svc = createServiceClient()
  // Uma evidência por cliente/dia/origem (a mais forte: menor distância ao nosso ponto não importa -- fica a primeira).
  const unicas = new Map<string, EvidenciaLocal>()
  for (const e of evs) { const k = `${e.chave}|${e.origem}`; if (!unicas.has(k)) unicas.set(k, e) }
  const linhas = [...unicas.values()].map(e => ({ empresa: EMPRESA, cliente_codigo: e.chave, data, origem: e.origem, nf: e.nf, lat: e.lat, lng: e.lng, dist_geocode_m: e.distGeocodeM, detalhe: e.detalhe }))
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await svc.from('kpi_cliente_local_evidencia').upsert(linhas.slice(i, i + 500), { onConflict: 'empresa,cliente_codigo,data,origem' })
    if (error) throw new Error(`gravar evidencias: ${error.message}`)
  }

  // Recalcula o local de cada cliente afetado com TODAS as evidências dele.
  const chaves = [...new Set(linhas.map(l => l.cliente_codigo))]
  let novos = 0, atualizados = 0, manuaisMantidos = 0
  for (let i = 0; i < chaves.length; i += 200) {
    const lote = chaves.slice(i, i + 200)
    const [{ data: todas, error: e1 }, { data: atuais, error: e2 }] = await Promise.all([
      svc.from('kpi_cliente_local_evidencia').select('cliente_codigo, origem, lat, lng').eq('empresa', EMPRESA).in('cliente_codigo', lote),
      svc.from('kpi_cliente_local').select('cliente_codigo, fonte').eq('empresa', EMPRESA).in('cliente_codigo', lote),
    ])
    if (e1 || e2) throw new Error(`ler evidencias/locais: ${(e1 ?? e2)!.message}`)
    const fonteAtual = new Map((atuais ?? []).map(a => [a.cliente_codigo as string, a.fonte as string]))
    const upserts = []
    for (const chave of lote) {
      if (fonteAtual.get(chave) === 'manual') { manuaisMantidos++; continue }
      const escolhido = escolherLocal((todas ?? []).filter(t => t.cliente_codigo === chave).map(t => ({ origem: t.origem as FonteLocal, lat: Number(t.lat), lng: Number(t.lng) })))
      if (!escolhido) continue
      const ref = [...unicas.values()].find(e => e.chave === chave)
      upserts.push({ empresa: EMPRESA, cliente_codigo: chave, cliente_nome: ref?.nome ?? null, endereco_ref: ref?.endereco ?? null, lat: escolhido.lat, lng: escolhido.lng, fonte: escolhido.fonte, confirmacoes: escolhido.confirmacoes, atualizado_em: new Date().toISOString() })
      if (fonteAtual.has(chave)) atualizados++; else novos++
    }
    if (upserts.length) {
      const { error } = await svc.from('kpi_cliente_local').upsert(upserts, { onConflict: 'empresa,cliente_codigo' })
      if (error) throw new Error(`gravar locais: ${error.message}`)
    }
  }
  console.log(`[locais] gravado: ${linhas.length} evidências; locais novos ${novos}, atualizados ${atualizados}, manuais mantidos ${manuaisMantidos}`)
}

main().catch(err => { console.error('[locais] ERRO', err); process.exit(1) })
