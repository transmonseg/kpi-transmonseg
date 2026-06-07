/**
 * gerarKpiLocal — núcleo PURO de geração do KPI (offline, sem Supabase/HTTP).
 *
 * Extraído do miolo de `src/app/api/kpi/simples/route.ts` pra ser reusado pelo
 * app desktop Electron: dados os arquivos (escala[] + Unitrac[]) + um snapshot
 * do cadastro (lojas + frota), gera os buffers XLSX e PDF do KPI por rede, 100%
 * em memória/Node — sem tocar a nuvem.
 *
 * O site Next.js continua usando a rota (com preview/persistência/anomalia); este
 * núcleo é a versão enxuta que roda em qualquer processo Node. `rotaToLinha` é
 * exportado daqui e reusado pela rota pra não duplicar a regra.
 */
import { parseEscalaArquivo } from '@/lib/parsers/escala-arquivo'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import {
  cruzaEscalaUnitrac,
  setSemGeo,
  type LojaRow,
} from '@/lib/kpi/matcher'
import { aplicarAlteracoes, type AltConfirmada } from '@/lib/kpi/aplicar-alteracoes'
import { gerarKpi, type LinhaParaKpi } from '@/lib/kpi/gerador-kpi'
import { gerarKpiPdf } from '@/lib/kpi/gerador-pdf'
import { REDE_NOMES_CANONICOS } from '@/lib/kpi/kpi-styles'
import type { KpiLinha, RotaKpi } from '@/lib/types/kpi'
import type { LinhaEscala } from '@/lib/types/escala'

export type ArquivoEntrada = { nome: string; buffer: Buffer }

/** Cadastro local que o snapshot fornece (mesmo shape do matcher + frota). */
export type CadastroLocal = {
  lojas: LojaRow[]
  /** Frota rastreada (placas com rastreador) — autoritativa pra "sem rastreador". */
  veiculos: { placa_norm: string }[]
}

export type SaidaRede = {
  rede_id: string
  rede_nome: string
  xlsx: Buffer
  /** XLSX com a coluna "Chegada CD" (variante usada por algumas redes). */
  xlsx_com_cd: Buffer
  pdf: Buffer
  pdf_com_cd: Buffer
  linhas: number
}

export type GerarKpiLocalOpts = {
  escalas: ArquivoEntrada[]
  unitracs: ArquivoEntrada[]
  cadastro: CadastroLocal
  /** Data do KPI no formato ISO 'YYYY-MM-DD'. */
  data: string
  alteracoes?: AltConfirmada[]
}

/**
 * Converte uma RotaKpi (saída do matcher) + a linha de escala numa LinhaParaKpi
 * (entrada dos geradores). Regra ÚNICA, compartilhada com a rota `kpi/simples`.
 */
export function rotaToLinha(rota: RotaKpi, escala: LinhaEscala, ordem: number): LinhaParaKpi {
  const p1 = rota.paradas[0] ?? null
  const p2 = rota.paradas[1] ?? null
  const p3 = rota.paradas[2] ?? null

  const motorista = escala.motorista_nome ?? null

  return {
    kpi_id: 'simples',
    escala_linha_id: rota.escala_linha_id,
    ordem,
    loja_nome: escala.loja_nome_raw,
    motorista,
    placa: rota.placa_real ?? rota.placa_norm,
    carro_ordem: escala.carro_ordem,
    saida_cd: rota.saida_cd,
    chegada_base: rota.chegada_base ?? null,
    chd_loja_1: p1?.chegada ?? null,
    saida_loja_1: p1?.saida ?? null,
    tempo_loja_1_min: p1?.duracao_min ?? null,
    chd_loja_2: p2?.chegada ?? null,
    saida_loja_2: p2?.saida ?? null,
    tempo_loja_2_min: p2?.duracao_min ?? null,
    chd_loja_3: p3?.chegada ?? null,
    saida_loja_3: p3?.saida ?? null,
    tempo_loja_3_min: p3?.duracao_min ?? null,
    observacao: rota.placa_real
      ? `Troca de carro: entregue pela placa ${rota.placa_real} (escala: ${rota.placa_norm ?? '—'}).`
      : null,
    anomalias_codigos: rota.anomalias_codigos,
    motorista_codigo: escala.motorista_codigo,
    rota_status: rota.status,
  }
}

/**
 * Gera os KPIs (XLSX + PDF, com e sem "Chegada CD") por rede, offline.
 *
 * Replica o miolo da rota `kpi/simples` SEM: Supabase, preview, lineEdits,
 * detecção de anomalia extra e persistência. Usa o snapshot do cadastro no lugar
 * das queries ao banco. Geo: `setSemGeo(true)` (mesma decisão de produção) — o
 * resgate geo restrito à escala (≤500m) continua rodando dentro do matcher.
 */
export async function gerarKpiLocal(opts: GerarKpiLocalOpts): Promise<SaidaRede[]> {
  const { escalas, unitracs, cadastro, data, alteracoes } = opts

  // 1) Escala(s) → LinhaEscala[] (auto-detecta o formato por arquivo).
  let escalaLinhas: LinhaEscala[] = []
  for (const arq of escalas) {
    const linhas = await parseEscalaArquivo(arq.buffer, arq.nome, data)
    escalaLinhas = escalaLinhas.concat(linhas)
  }
  if (escalaLinhas.length === 0) {
    throw new Error('Nenhuma linha de escala reconhecida nos arquivos enviados.')
  }

  // Aplica alterações (substituições/inclusões) sobre a escala, se houver.
  if (alteracoes && alteracoes.length > 0) {
    escalaLinhas = aplicarAlteracoes(escalaLinhas, alteracoes)
  }

  // 2) Cadastro de placas conhecidas (alimenta o OCR do parser PDF): placas da
  //    escala (fonte primária, sem OCR) + frota do snapshot.
  const cadastroPlacas = new Set<string>()
  for (const l of escalaLinhas) {
    if (l.placa_norm) cadastroPlacas.add(l.placa_norm)
  }
  for (const v of cadastro.veiculos) {
    if (v.placa_norm) cadastroPlacas.add(String(v.placa_norm))
  }

  // 3) Unitrac(s) → ResumoVeiculo[], mergeando por placa (prefere a parada mais
  //    informativa quando a mesma placa vem em XLSX + PDF).
  const veiculosMap = new Map<string, import('@/lib/types/unitrac').ResumoVeiculo>()
  for (const arq of unitracs) {
    let parsed
    if (arq.nome.toLowerCase().endsWith('.pdf')) {
      const { parseUnitracPdf } = await import('@/lib/parsers/unitrac-pdf')
      parsed = await parseUnitracPdf(arq.buffer, cadastroPlacas)
    } else {
      parsed = await parseUnitrac(arq.buffer)
    }
    for (const v of parsed) {
      const existing = veiculosMap.get(v.placa_norm)
      if (!existing) {
        veiculosMap.set(v.placa_norm, v)
        continue
      }
      const byKey = new Map<string, typeof existing.paradas[number]>()
      const toKey = (p: typeof existing.paradas[number]) => {
        const cheg = p.chegada instanceof Date ? p.chegada.toISOString() : String(p.chegada)
        const sai = p.saida instanceof Date ? p.saida.toISOString() : String(p.saida ?? '')
        return `${cheg}|${sai}`
      }
      const informatividade = (p: typeof existing.paradas[number]) =>
        p.classificacao === 'LOJA' ? (p.codigo_loja ? 4 : 3) :
        p.classificacao === 'FORA_BASE' ? 2 :
        p.classificacao === 'BASE' ? 1 : 0
      for (const p of [...existing.paradas, ...v.paradas]) {
        const k = toKey(p)
        const prev = byKey.get(k)
        if (!prev || informatividade(p) > informatividade(prev)) byKey.set(k, p)
      }
      veiculosMap.set(v.placa_norm, { ...existing, paradas: Array.from(byKey.values()) })
    }
  }
  const veiculos = Array.from(veiculosMap.values())
  if (veiculos.length === 0) {
    throw new Error('Nenhum veículo encontrado no relatório Unitrac.')
  }

  // 4) Monta as entradas do matcher.
  const escalaMap = new Map<string, LinhaEscala>()
  const escalaRows = escalaLinhas.map((l, i) => {
    const id = `esc-${i}`
    escalaMap.set(id, l)
    return {
      id,
      rede_id: l.rede_id,
      placa_norm: l.placa_norm || null,
      loja_nome_raw: l.loja_nome_raw,
      loja_codigo_raw: l.loja_codigo_raw,
      motorista_nome: l.motorista_nome,
      carro_ordem: l.carro_ordem,
      data_entrega: l.data_entrega,
    }
  })

  const paradaRows = veiculos.flatMap((v, vi) =>
    v.paradas.map((p, pi) => ({
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
      endereco: p.endereco,
      classificacao: p.classificacao,
      ordem: p.ordem,
    })),
  )

  // 5) Cruza escala × Unitrac. Sem `supabase` (trgm) e sem `geoStores` — offline.
  //    O resgate geo restrito à escala (≤500m) roda no matcher mesmo sem geoStores.
  setSemGeo(true)
  const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, cadastro.lojas, undefined, undefined, {
    geoEndereco: true,
  })

  // 6) Agrupa por rede, mantendo a linha de escala pareada com cada rota.
  const redeMap = new Map<string, { rotas: RotaKpi[]; escala: LinhaEscala[] }>()
  for (const rota of rotas) {
    const escala = escalaMap.get(rota.escala_linha_id)
    if (!escala) continue
    const rede_id = escala.rede_id
    if (!redeMap.has(rede_id)) redeMap.set(rede_id, { rotas: [], escala: [] })
    redeMap.get(rede_id)!.rotas.push(rota)
    redeMap.get(rede_id)!.escala.push(escala)
  }

  // 7) Por rede: rotaToLinha → linhas → gera XLSX + PDF (com e sem Chegada CD).
  const saidas: SaidaRede[] = []
  for (const [rede_id, grupo] of redeMap.entries()) {
    const rede_nome = REDE_NOMES_CANONICOS[rede_id] ?? rede_id
    const linhas = grupo.rotas.map((rota, idx) => rotaToLinha(rota, grupo.escala[idx], idx + 1))

    const [xlsx, xlsx_com_cd, pdf, pdf_com_cd] = await Promise.all([
      gerarKpi({ rede_id, data, linhas }),
      gerarKpi({ rede_id, data, linhas, comChegadaCd: true }),
      gerarKpiPdf({ rede_id, rede_nome, data, linhas: linhas as KpiLinha[] }),
      gerarKpiPdf({ rede_id, rede_nome, data, linhas: linhas as KpiLinha[], comChegadaCd: true }),
    ])

    saidas.push({ rede_id, rede_nome, xlsx, xlsx_com_cd, pdf, pdf_com_cd, linhas: linhas.length })
  }

  return saidas
}
