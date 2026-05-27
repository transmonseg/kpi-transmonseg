/**
 * Bug 7 v3 — Classificacao definitiva.
 *
 * Roda matcher real do dia 19 nas redes dos 8 casos, captura parada_id da
 * rota e usa pra recuperar a parada bruta diretamente.
 *
 * Lookup de cadastro: busca por loja_id retornado pelo matcher quando rota OK,
 * fallback pra match por nome (token significativo da escala).
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { cruzaEscalaUnitrac, variantesOcr, type EscalaLinhaRow, type UnitracParadaRow, type LojaRow } from '@/lib/kpi/matcher'
import { haversine } from '@/lib/utils/geo'
import type { LinhaEscala } from '@/lib/types/escala'
import type { ParadaUnitrac } from '@/lib/types/unitrac'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'
const OUT = 'docs/auditoria/dia-19-reanalise'
const DATA = '2026-05-19'
mkdirSync(OUT, { recursive: true })

function fmtT(d: any): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getUTCHours()).padStart(2, '0')}:${String(dt.getUTCMinutes()).padStart(2, '0')}`
}
function durMin(seg: number | null | undefined): string {
  if (seg == null) return '---'
  return `${Math.round(seg / 60)}min`
}
function norm(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim()
}

function toEscalaRow(l: LinhaEscala, idx: number): EscalaLinhaRow {
  return {
    id: `fake-${idx}`,
    rede_id: l.rede_id, placa_norm: l.placa_norm, loja_nome_raw: l.loja_nome_raw,
    loja_codigo_raw: l.loja_codigo_raw, motorista_nome: l.motorista_nome,
    carro_ordem: l.carro_ordem, data_entrega: l.data_entrega, sub_rede: (l as any).sub_rede ?? null,
  }
}
function toParadaRow(p: ParadaUnitrac, idx: number): UnitracParadaRow {
  return {
    id: `p-${idx}`, placa_norm: p.placa_norm,
    chegada: p.chegada instanceof Date ? p.chegada.toISOString() : String(p.chegada),
    saida: p.saida instanceof Date ? p.saida.toISOString() : (p.saida ? String(p.saida) : null),
    duracao_seg: p.duracao_seg ?? null, local_parada: p.local_parada ?? '',
    codigo_loja: p.codigo_loja ?? null, nome_loja: p.nome_loja ?? null,
    lat: p.lat ?? null, lng: p.lng ?? null,
    classificacao: p.classificacao, ordem: p.ordem,
  }
}

interface Caso {
  rede: string
  loja_token: string
  loja_label: string
  manualStatus: string
  geradoCL: string
  geradoSL: string
  placaEsperada: string
  cadastroId?: string  // se conhecido, usar diretamente
}

const CASOS: Caso[] = [
  { rede: 'ZONA_SUL',  loja_token: 'LEBLON|14',                        loja_label: 'ZS Loja 14 Leblon',           placaEsperada: 'UBO5E05', manualStatus: 'NAO_FOI', geradoCL: '15:53', geradoSL: '16:41' },
  { rede: 'ZONA_SUL',  loja_token: 'LARANJEIRAS|32',                   loja_label: 'ZS Loja 32 Laranjeiras',      placaEsperada: 'QAH2H50', manualStatus: 'SEM',     geradoCL: '04:54', geradoSL: '05:31' },
  { rede: 'ASSAI',     loja_token: 'BARRA',                            loja_label: 'ASSAI Barra I',               placaEsperada: 'UBO5E01', manualStatus: 'NAO_FOI', geradoCL: '06:08', geradoSL: '06:36' },
  { rede: 'ASSAI',     loja_token: 'BANGU',                            loja_label: 'ASSAI Bangu II',              placaEsperada: 'AMW3424', manualStatus: 'NAO_FOI', geradoCL: '09:33', geradoSL: '09:37' },
  { rede: 'PREZUNIC',  loja_token: 'BOTAFOGO.*SERRA|SERRA AZUL.*BOTAFOGO|BOTAFOGO',  loja_label: 'PREZUNIC Botafogo Serra Azul', placaEsperada: 'KWB6998', manualStatus: 'SEM', geradoCL: '10:42', geradoSL: '10:59' },
  { rede: 'PREZUNIC',  loja_token: 'JAURU',                            loja_label: 'PREZUNIC Jauru',              placaEsperada: 'LUP1F13', manualStatus: 'SEM',     geradoCL: '14:37', geradoSL: '14:45' },
  { rede: 'PREZUNIC',  loja_token: 'TAQUARA',                          loja_label: 'PREZUNIC Taquara',            placaEsperada: 'LUP1F13', manualStatus: 'SEM',     geradoCL: '14:50', geradoSL: '14:53' },
]

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  console.log('Carregando Unitrac dia 19...')
  const files = readdirSync(BASE)
  const xlsxName = files.find((f) => /relatorio.*\.xlsx$/i.test(f))
  const veiculos = await parseUnitrac(readFileSync(`${BASE}/${xlsxName!}`))
  const paradasRaw = veiculos.flatMap(v => v.paradas)
  const paradas = paradasRaw.map(toParadaRow)
  console.log(`  ${veiculos.length} veiculos, ${paradas.length} paradas`)

  const paradaById = new Map<string, UnitracParadaRow>()
  for (const p of paradas) paradaById.set(p.id, p)
  const gpsByPlaca = new Map<string, UnitracParadaRow[]>()
  for (const p of paradas) {
    const arr = gpsByPlaca.get(p.placa_norm) ?? []
    arr.push(p)
    gpsByPlaca.set(p.placa_norm, arr)
  }

  const { data: lojasRaw } = await sb.from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)
  const lojas: LojaRow[] = (lojasRaw ?? []) as LojaRow[]
  console.log(`  ${lojas.length} lojas ativas`)

  const lojaById = new Map(lojas.map(l => [l.id, l]))

  // Roda matcher para cada rede dos casos
  const redes = new Set(CASOS.map(c => c.rede))
  const escalaByRede = new Map<string, EscalaLinhaRow[]>()
  const rotasByRede = new Map<string, any[]>()

  for (const rede of redes) {
    console.log(`\nProcessando rede ${rede}...`)
    let escalaAll: LinhaEscala[]
    if (rede === 'ZONA_SUL') {
      escalaAll = await parseEscalaZonaSul(readFileSync(`${BASE}/ESCALA ZONA SUL - MAIO (6).xlsx`), DATA)
    } else {
      escalaAll = await parseEscalaGeral(readFileSync(`${BASE}/ESCALA GERAL DE MAIO 1 (6).xlsx`), DATA)
    }
    const escala = escalaAll.filter(l => l.rede_id === rede).map(toEscalaRow)
    console.log(`  ${escala.length} linhas`)
    escalaByRede.set(rede, escala)
    const rotas = await cruzaEscalaUnitrac(escala, paradas, lojas)
    rotasByRede.set(rede, rotas)
  }

  // Lookup do cadastro DA LOJA ESCALADA (nao da loja da parada atribuida).
  // Importante: pra diagnostico de falso positivo precisamos da loja
  // que MANUAL refere ("Jauru"), pra medir distancia da parada atribuida pelo matcher.
  // Usar loja_id da parada seria circular (matcher pode estar atribuindo loja errada).
  // Estrategia: rede + nome_normalizado tokens com peso (palavras curtas/repetidas
  // valem menos). "JAURU" pesa mais que "SERRA"/"AZUL" porque sao raros.
  const STOPLOJA = new Set([
    'ZONA','SUL','LOJA','ASSAI','ASSAÍ','PREZUNIC','CARREFOUR','SUPERPRIX',
    'GUANABARA','PRINCESA','ATACADAO','GRAO','ARMAZEM','FEIRA','NOVA','SUPER',
    'PAX','EMANUEL','SAMS','SENDAS','SERRA','AZUL','LTDA','LTDA','REDE',
    // bairros genericos comuns que multiplas lojas compartilham
  ])
  // Calcula raridade do token na rede (1 / quantas lojas tem ele)
  function lookupCadastro(rede: string, escalaLinha: EscalaLinhaRow | null): LojaRow | null {
    if (!escalaLinha) return null
    const lojaRaw = norm(escalaLinha.loja_nome_raw || '')
    const tokens = lojaRaw.split(' ').filter(t => t.length >= 4 && !STOPLOJA.has(t))
    if (tokens.length === 0) return null

    // Conta ocorrencia de cada token nas lojas da rede
    const ocorr = new Map<string, number>()
    const lojasRede = lojas.filter(l => l.rede_id === rede)
    for (const t of tokens) {
      let c = 0
      for (const l of lojasRede) if (norm(l.nome).includes(t)) c++
      ocorr.set(t, c)
    }
    // Token "raro" (1-3 ocorrencias) vale 10. Comum (>10) vale 1.
    const peso = (t: string) => {
      const c = ocorr.get(t) ?? 0
      if (c === 0) return 0
      if (c <= 3) return 10
      if (c <= 10) return 3
      return 1
    }

    let melhor: { loja: LojaRow; score: number } | null = null
    for (const cand of lojasRede) {
      const candN = norm(cand.nome)
      let s = 0
      for (const t of tokens) if (candN.includes(t)) s += peso(t)
      if (s === 0) continue
      if (!melhor || s > melhor.score) melhor = { loja: cand, score: s }
    }
    if (!melhor) return null
    // exige score >= 10 (pelo menos 1 token raro)
    if (melhor.score < 10) return null
    return melhor.loja
  }

  interface Result {
    caso: Caso
    escalaLinha: EscalaLinhaRow | null
    lojaCadastro: { id: string; nome: string; lat: number | null; lng: number | null; raio: number | null } | null
    rota: any | null
    paradaLojaRota: any | null
    paradaBruta: UnitracParadaRow | null
    distMetros: number | null
    raioCadastrado: number
    dentroRaio: boolean
    subCausa: '7A' | '7B' | '7C' | '???'
    acao: string
    detalhe: string
  }

  const results: Result[] = []

  for (const caso of CASOS) {
    const escala = escalaByRede.get(caso.rede) || []
    const rotas = rotasByRede.get(caso.rede) || []

    const lojaRe = new RegExp(caso.loja_token, 'i')
    const linhasCandidatas = escala.filter(l => lojaRe.test(l.loja_nome_raw || ''))
    let escalaLinha: EscalaLinhaRow | null = null
    for (const l of linhasCandidatas) {
      if (l.placa_norm === caso.placaEsperada) {
        escalaLinha = l
        break
      }
    }
    if (!escalaLinha && linhasCandidatas.length > 0) escalaLinha = linhasCandidatas[0]

    const rota = escalaLinha ? rotas.find(r => r.escala_linha_id === escalaLinha!.id) : null
    const paradaLojaRota = (rota?.paradas && rota.paradas.length > 0)
      ? rota.paradas.find((p: any) => p.classificacao === 'LOJA') ?? rota.paradas[0]
      : null

    // Lookup cadastro (loja escalada — usa raw da escala, nao loja_id da parada,
    // pq loja_id da parada eh o que MATCHER decidiu — pode ser errado)
    const lojaCad = lookupCadastro(caso.rede, escalaLinha)
    const lojaInfo = lojaCad
      ? { id: lojaCad.id, nome: lojaCad.nome, lat: lojaCad.lat, lng: lojaCad.lng, raio: lojaCad.raio_metros }
      : null

    // Pega parada bruta pelo parada_id (autoridade)
    let paradaBruta: UnitracParadaRow | null = null
    if (paradaLojaRota?.parada_id) {
      paradaBruta = paradaById.get(paradaLojaRota.parada_id) ?? null
    }

    let dist: number | null = null
    let dentroRaio = false
    const raio = lojaInfo?.raio ?? 200
    if (lojaInfo?.lat != null && paradaBruta?.lat != null) {
      dist = Math.round(haversine(lojaInfo.lat, lojaInfo.lng!, paradaBruta.lat, paradaBruta.lng!))
      dentroRaio = dist <= raio
    }

    let subCausa: '7A' | '7B' | '7C' | '???' = '???'
    let acao = ''
    let detalhe = ''

    if (!escalaLinha) {
      subCausa = '???'
      acao = 'Linha de escala nao encontrada'
      detalhe = `Token ${caso.loja_token} nao bateu em nenhuma linha de escala`
    } else if (!rota || !paradaLojaRota) {
      subCausa = '7A_resolved'  as any
      acao = 'Matcher ATUAL nao gera CL/SL — falso positivo ja resolvido'
      detalhe = `Rota=${rota ? 'OK' : 'sem rota'}, paradas=${rota?.paradas?.length || 0}. O fix do mestre ja eliminou o falso positivo.`
    } else if (!lojaInfo) {
      subCausa = '???'
      acao = 'Cadastro nao encontrado'
      detalhe = `${caso.loja_label} sem cadastro identificavel`
    } else if (lojaInfo.lat == null) {
      subCausa = '???'
      acao = 'Cadastro sem coords — impossivel validar'
      detalhe = `${lojaInfo.nome} sem lat/lng`
    } else if (!paradaBruta) {
      subCausa = '???'
      acao = 'Parada bruta nao encontrada por parada_id'
      detalhe = `parada_id=${paradaLojaRota.parada_id} nao bate com paradas brutas`
    } else if (paradaBruta.lat == null) {
      subCausa = '???'
      acao = 'Parada Unitrac sem coords'
      detalhe = `Parada ${fmtT(paradaBruta.chegada)} classif=${paradaBruta.classificacao} sem lat/lng no XLSX Unitrac`
    } else if (dentroRaio) {
      subCausa = '7A'
      acao = 'Aceitar — manual errado (GPS comprova entrega)'
      detalhe = `Parada ${fmtT(paradaBruta.chegada)}→${fmtT(paradaBruta.saida)} a ${dist}m de ${lojaInfo.nome} (raio ${raio}m), classif=${paradaBruta.classificacao}`
    } else {
      subCausa = '7B'
      acao = 'Matcher atribuiu parada fora do raio — bug'
      detalhe = `Parada ${fmtT(paradaBruta.chegada)}→${fmtT(paradaBruta.saida)} a ${dist}m de ${lojaInfo.nome} (raio ${raio}m), classif=${paradaBruta.classificacao}, local="${(paradaBruta.local_parada || '').slice(0, 80)}"`
    }

    results.push({
      caso, escalaLinha, lojaCadastro: lojaInfo, rota, paradaLojaRota, paradaBruta,
      distMetros: dist, raioCadastrado: raio, dentroRaio,
      subCausa, acao, detalhe,
    })

    // Diagnose detalhado
    const lines: string[] = []
    lines.push(`# Bug 7 diagnose v3 — ${caso.loja_label}`)
    lines.push('')
    lines.push(`Spec: manual=${caso.manualStatus}, gerado=${caso.geradoCL}/${caso.geradoSL}, placa=${caso.placaEsperada}`)
    lines.push('')
    if (escalaLinha) {
      lines.push(`Escala atual: placa=${escalaLinha.placa_norm}, loja_raw="${escalaLinha.loja_nome_raw}", motorista=${escalaLinha.motorista_nome}, carro=${escalaLinha.carro_ordem}`)
    }
    lines.push(`Cadastro: ${lojaInfo?.nome ?? '(nao encontrado)'}, lat=${lojaInfo?.lat ?? '---'}, raio=${raio}m`)
    lines.push('')
    lines.push(`## Classificacao: ${subCausa}`)
    lines.push(`Acao: ${acao}`)
    lines.push(`Detalhe: ${detalhe}`)
    lines.push('')
    if (rota) {
      lines.push(`## Rota gerada (matcher atual)`)
      lines.push(`- placa=${rota.placa_norm}, status=${rota.status}, anomalias=[${(rota.anomalias_codigos || []).join(',')}]`)
      lines.push(`- meta: ${JSON.stringify(rota._matchMeta || {})}`)
      lines.push(`- ${rota.paradas?.length || 0} paradas:`)
      for (const p of rota.paradas || []) {
        const b = p.parada_id ? paradaById.get(p.parada_id) : null
        const d = (lojaInfo?.lat != null && b?.lat != null)
          ? Math.round(haversine(lojaInfo.lat, lojaInfo.lng!, b.lat, b.lng!))
          : null
        lines.push(`  - ${p.classificacao} ${fmtT(p.chegada)}→${fmtT(p.saida)} dur=${p.duracao_min}min loja_id=${p.loja_id} nome="${p.nome}" dist→loja=${d == null ? '---' : `${d}m`} parada_id=${p.parada_id}`)
      }
    }
    lines.push('')
    if (rota?.placa_norm) {
      const gps = gpsByPlaca.get(rota.placa_norm) || []
      lines.push(`## Todas paradas dia 19 da placa ${rota.placa_norm} (${gps.length})`)
      lines.push('| # | classif | chegada | saida | dur | dist→cadastro | codigo | local |')
      lines.push('|---|---------|---------|-------|-----|---------------|--------|-------|')
      for (let i = 0; i < gps.length; i++) {
        const p = gps[i]
        const d = (lojaInfo?.lat != null && p.lat != null)
          ? Math.round(haversine(lojaInfo.lat, lojaInfo.lng!, p.lat, p.lng!))
          : null
        const marker = paradaBruta?.id === p.id ? ' ← atribuida' : ''
        lines.push(`| ${i} | ${p.classificacao} | ${fmtT(p.chegada)} | ${fmtT(p.saida)} | ${durMin(p.duracao_seg)} | ${d == null ? '---' : `${d}m`} | ${p.codigo_loja || '---'} | ${(p.local_parada || '').slice(0, 50)}${marker} |`)
      }
    }

    const safeName = `${caso.rede}-${caso.loja_label.replace(/[^a-zA-Z0-9_-]/g, '_')}`
    writeFileSync(`${OUT}/bug-7-${safeName}-diagnose.txt`, lines.join('\n'))
    console.log(`  ${OUT}/bug-7-${safeName}-diagnose.txt (${subCausa})`)
  }

  // Consolidado
  const consol: string[] = []
  consol.push(`# Bug 7 — Classificacao dos 8 casos (matcher real, dia ${DATA})`)
  consol.push('')
  consol.push(`Regra autoridade: GPS + raio + cadastro = autoridade. Se parada atribuida pelo matcher esta dentro do raio cadastrado, sys CERTO (manual errado).`)
  consol.push('')
  const c7A = results.filter(c => c.subCausa === '7A').length
  const c7A_res = results.filter(c => (c.subCausa as any) === '7A_resolved').length
  const c7B = results.filter(c => c.subCausa === '7B').length
  const c7C = results.filter(c => c.subCausa === '7C').length
  const cUnk = results.filter(c => c.subCausa === '???').length
  consol.push('## Resumo')
  consol.push(`- 7A (manual errado, sys certo, ainda gera): **${c7A}**`)
  consol.push(`- 7A_resolved (falso positivo eliminado pelo fix do mestre): **${c7A_res}**`)
  consol.push(`- 7B (bug matcher persistente): **${c7B}**`)
  consol.push(`- 7C (convencao): **${c7C}**`)
  consol.push(`- ??? (sem dados): **${cUnk}**`)
  consol.push('')
  consol.push('## Tabela detalhada')
  consol.push('')
  consol.push('| Loja | Placa | Manual | Spec gerou | Matcher atual gera | Dist→cadastro | Raio | Sub-causa |')
  consol.push('|------|-------|--------|-----------|--------------------|---------------|------|-----------|')
  for (const r of results) {
    const placa = r.rota?.placa_norm ?? r.escalaLinha?.placa_norm ?? '---'
    const matchCL = r.paradaLojaRota ? fmtT(r.paradaLojaRota.chegada) : 'NAO GERA'
    const matchSL = r.paradaLojaRota ? fmtT(r.paradaLojaRota.saida) : 'NAO GERA'
    const distStr = r.distMetros == null ? '---' : `${r.distMetros}m`
    consol.push(`| ${r.caso.loja_label} | ${placa} | ${r.caso.manualStatus} | ${r.caso.geradoCL}/${r.caso.geradoSL} | ${matchCL}/${matchSL} | ${distStr} | ${r.raioCadastrado}m | **${r.subCausa}** |`)
  }
  consol.push('')
  consol.push('## Detalhes por caso')
  consol.push('')
  for (const r of results) {
    consol.push(`### ${r.caso.loja_label}`)
    if (r.escalaLinha) consol.push(`- Escala: placa=${r.escalaLinha.placa_norm}, raw="${r.escalaLinha.loja_nome_raw}"`)
    consol.push(`- Cadastro: ${r.lojaCadastro?.nome ?? '(NAO ENCONTRADO)'}${r.lojaCadastro ? `, lat=${r.lojaCadastro.lat}, raio=${r.lojaCadastro.raio ?? 200}m` : ''}`)
    if (r.rota && r.paradaLojaRota) {
      consol.push(`- Matcher: ${fmtT(r.paradaLojaRota.chegada)}→${fmtT(r.paradaLojaRota.saida)} (classif=${r.paradaLojaRota.classificacao}), dist→cadastro=${r.distMetros ?? '---'}m`)
      consol.push(`  - meta: ${JSON.stringify(r.rota._matchMeta || {})}`)
    } else {
      consol.push(`- Matcher: SEM rota/parada — falso positivo ja eliminado`)
    }
    consol.push(`- **${r.subCausa}** — ${r.acao}`)
    consol.push(`- ${r.detalhe}`)
    consol.push('')
  }

  writeFileSync(`${OUT}/bug-7-classificacao.md`, consol.join('\n'))
  console.log(`\n  ${OUT}/bug-7-classificacao.md`)
  console.log(`\nResumo: 7A=${c7A}, 7A_resolved=${c7A_res}, 7B=${c7B}, 7C=${c7C}, ???=${cUnk}`)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
