import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseEscalaArquivo } from '@/lib/parsers/escala-arquivo'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac, variantesOcr, variantesPlaca, setSemGeo, resolverLojaEsperada, lojaNomeDivergeDaEscala, type UnitracParadaRow } from '@/lib/kpi/matcher'
import { mesclarParadas } from '@/lib/kpi/merge-paradas'
import { buscarFrota, buscarPontos, buscarStopsCru, consolidaParadasApi, buscarAlvos, confirmaPorAlvo, confirmaEntregaViaApi, buscarPosicoes, classificarPlacaViaApi, type AlvoApi, type MapaPontos, type MapaPosicoes } from '@/lib/unitrac-api'
import { horarioEntregaGabarito } from '@/lib/kpi/horario-gabarito'
import { situacaoViva, type SituacaoViva } from '@/lib/kpi/situacao-viva'
import { validarEscala } from '@/lib/parsers/validar-escala'
import { haversine } from '@/lib/utils/geo'
import { aplicarAlteracoes, parsedToConfirmada } from '@/lib/kpi/aplicar-alteracoes'
import type { AlteracaoParsed } from '@/lib/parsers/alteracao-text'
import { gerarKpi, type LinhaParaKpi } from '@/lib/kpi/gerador-kpi'
import { gerarKpiPdf } from '@/lib/kpi/gerador-pdf'
import { rotaToLinha, saidaBaseSeEmRota, saidaBaseConhecida, JANELA_FIM } from '@/lib/kpi/gerar-kpi-local'
import { montarResumoDeParadaRows, salvarResumoSeMelhor } from '@/lib/kpi/dashboard-api-fonte'
import { isRotaGigante } from '@/lib/kpi/rotas-gigantes'
import { REDE_NOMES_CANONICOS } from '@/lib/kpi/kpi-styles'
import { derivarStatus, type StatusRota, type CategoriaRevisao, type NaturezaRevisao } from '@/lib/kpi/status-rota'
import { partitionSettled } from '@/lib/utils/partition-settled'
import { mapLimitSettled } from '@/lib/utils/map-limit'
import type { KpiLinha, RotaKpi } from '@/lib/types/kpi'
import type { LinhaEscala } from '@/lib/types/escala'

export const runtime = 'nodejs'
export const maxDuration = 120

type PreviewLinha = {
  ordem: number
  loja_nome: string
  placa: string | null
  motorista: string | null
  turno: string
  tem_gps: boolean
  ficou_na_base: boolean
  saida_cd_fmt: string | null
  chegada_loja_fmt: string | null
  chegada_base_fmt: string | null
  tempo_loja_min: number | null
  confianca: 'HIGH' | 'LOW' | 'UNMATCHED'
  algoritmo: string
  /** Distância em metros quando casou por geo (até 500m). Mostra no preview. */
  geo_dist_metros?: number | null
  anomalias: string[]
  status: StatusRota
  revisar: boolean
  motivoRevisao: string | null
  categoria: CategoriaRevisao | null
  natureza: NaturezaRevisao | null
  situacaoViva?: SituacaoViva
  /** Min sem comunicar (API) quando a placa É rastreada mas saiu como "sem rastreador"
   *  — pra mostrar "sem comunicação há X min" em vez de "sem rastreador" na tela. */
  semComunicacaoMin?: number | null
  saida_loja_fmt: string | null
}

// Parsers do Unitrac armazenam BRT como Date.UTC(...) — ler getUTCHours direto.
// Esta convenção é a verdade do sistema (ver gerador-kpi.ts:23). Subtrair 3h aqui
// produzia duplo deslocamento que aparecia como 06:27 → 03:27 na tela de revisão.
function fmtHoraBRT(d: Date | null | undefined): string | null {
  if (!d) return null
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// HH:MM (BRT) → Date com BRT mascarado como UTC (mesma convenção dos parsers)
function brtHHMMtoDate(dataIso: string, hhmm: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1]), mn = Number(m[2])
  if (h < 0 || h > 23 || mn < 0 || mn > 59) return null
  const d = new Date(`${dataIso}T00:00:00.000Z`)
  d.setUTCHours(h, mn, 0, 0)
  return d
}

type LineEdit = {
  rede_id: string
  ordem: number
  /**
   * Bugs N8+N11 (auditoria 2026-05-27): match por `ordem` é frágil — se a
   * geração tem alteração nova entre o preview e o re-gerar, o sort interno
   * pode mudar e o índice referencia linha errada.
   *
   * Frontend pode (opcionalmente) enviar `match_loja_nome_raw` +
   * `match_placa_norm` + `match_carro_ordem` pra fazer match estável por
   * (rede + loja + placa + carro_ordem). Se presentes, têm prioridade
   * sobre o índice numérico.
   */
  match_loja_nome_raw?: string
  match_placa_norm?: string | null
  match_carro_ordem?: 1 | 2
  placa?: string
  motorista?: string
  loja?: string
  turno?: string
  saida_cd?: string         // HH:MM
  chegada_loja?: string     // HH:MM
  tempo_loja_min?: number | null
}

type AltConfirmada = {
  tipo: string
  rede_id: string | null
  loja_raw: string | null
  entra: { motorista_nome: string | null; motorista_codigo: number | null; placa_raw: string | null; placa_norm: string | null } | null
  sai: { motorista_nome: string | null; placa_norm: string | null } | null
}

// Wrapper para a função canônica (em src/lib/kpi/aplicar-alteracoes.ts)
// Mantém assinatura local pra evitar churn nos call sites deste arquivo.
function aplicaAlteracoes(linhas: LinhaEscala[], alts: AltConfirmada[]): LinhaEscala[] {
  return aplicarAlteracoes(linhas, alts)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return new NextResponse('Body JSON inválido.', { status: 400 })

  const { escalaBucketPath, escalaBucketPaths, unitracBucketPath, unitracBucketPaths, data, alteracoes = [], lineEdits = [], skipSave = false, modoApi = false } = body as {
    escalaBucketPath?: string
    escalaBucketPaths?: string[]
    unitracBucketPath?: string
    unitracBucketPaths?: string[]
    data: string
    alteracoes?: AlteracaoParsed[]
    lineEdits?: LineEdit[]
    skipSave?: boolean
    /** Beta: pula o PDF do Unitrac e usa a API diretamente como fonte de paradas. */
    modoApi?: boolean
  }

  // Normalize to array
  const escalaPaths: string[] = escalaBucketPaths ?? (escalaBucketPath ? [escalaBucketPath] : [])
  if (escalaPaths.length === 0) return new NextResponse('"escalaBucketPath" ou "escalaBucketPaths" obrigatório.', { status: 400 })
  const rawUnitracPaths: string[] = unitracBucketPaths ?? (unitracBucketPath ? [unitracBucketPath] : [])

  // Em modoApi (beta), o PDF do Unitrac é opcional — usamos a API como fonte primária.
  if (!modoApi) {
    if (rawUnitracPaths.length === 0) return new NextResponse('"unitracBucketPath" ou "unitracBucketPaths" obrigatório.', { status: 400 })
    const temPdf = rawUnitracPaths.some(p => p.toLowerCase().endsWith('.pdf'))
    if (!temPdf) {
      return new NextResponse(
        'Suba o relatório Unitrac em PDF (formato principal). XLSX é opcional como fallback.',
        { status: 400 },
      )
    }
  }

  const unitracPaths = Array.from(new Set(rawUnitracPaths))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida. Use YYYY-MM-DD.', { status: 400 })

  const svc = createServiceClient()

  // Baixa e parseia cada escala, acumulando todas as linhas
  let escalaLinhas: LinhaEscala[] = []

  for (const escalaPath of escalaPaths) {
    const { data: escalaBlob, error: escalaErr } = await svc.storage.from('escalas-raw').download(escalaPath)
    if (escalaErr || !escalaBlob) {
      return new NextResponse(`Erro ao baixar escala: ${escalaErr?.message ?? 'não encontrado'}`, { status: 400 })
    }
    const escalaBuffer = await escalaBlob.arrayBuffer()
    escalaLinhas.push(...await parseEscalaArquivo(escalaBuffer, escalaPath, data))
  }

  if (escalaLinhas.length === 0)
    return new NextResponse('Não foi possível detectar o tipo da escala. Verifique se os arquivos são escalas suportadas.', { status: 400 })

  // Deduplicação multi-escala: quando GERAL + PAX cobrem a mesma rede,
  // PAX tem placa real enquanto GERAL tem placa vazia.
  // Para redes com ao menos uma linha com placa, remove linhas sem placa
  // (exceto SEM PEDIDO, que é ausência legítima de entrega).
  const redesComPlaca = new Set(escalaLinhas.filter(l => l.placa_norm).map(l => l.rede_id))
  escalaLinhas = escalaLinhas.filter(l =>
    l.placa_norm ||
    !redesComPlaca.has(l.rede_id) ||
    l.obs === 'SEM PEDIDO'
  )

  // Dedup de DUPLICATA EXATA entre escalas: quando GERAL traz SUPER_PAX/FEIRA_NOVA/
  // EMANUEL já COM placa preenchida (acontece em parte das semanas) e o PAX também
  // cobre a rede, a mesma entrega aparecia 2x → contagem inflada. Colapsa linhas
  // idênticas em (rede, loja, carro, placa) mantendo a 1ª. Só remove o que é
  // genuinamente redundante — entregas distintas (carro_ordem ou placa diferentes)
  // permanecem intactas.
  const normLojaKey = (s: string | null | undefined) =>
    (s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const vistosDup = new Set<string>()
  escalaLinhas = escalaLinhas.filter(l => {
    if (!l.placa_norm) return true
    const k = `${l.rede_id}|${normLojaKey(l.loja_nome_raw)}|${l.carro_ordem ?? ''}|${l.placa_norm}`
    if (vistosDup.has(k)) return false
    vistosDup.add(k)
    return true
  })

  // Sanidade pós-parse: se a escala parece lida errada (placa/loja/rede em massa),
  // AVISA (não bloqueia — pode ser caso legítimo). Devolvido no response p/ a tela.
  const avisosEscala = validarEscala(escalaLinhas).avisos

  // Baixa e parseia todos os arquivos Unitrac, mergeando os veículos
  // (suporta XLSX + PDF simultâneos para cobrir formatos diferentes do mesmo dia)

  // T1: Alterações são puramente INLINE (estado da UI no body do request).
  // Sem busca no banco — cada geração de KPI carrega o que o operador adicionou
  // naquele momento. Tabela `alteracoes` deixou de ser usada pra esse fluxo.
  if (alteracoes.length > 0) {
    escalaLinhas = aplicaAlteracoes([...escalaLinhas], alteracoes.map(parsedToConfirmada))
    console.log(`[/api/kpi/simples] Aplicando ${alteracoes.length} alterações inline`)
  }

  // Bug A (auditoria dia 25 2026-05-27): persiste escala_linhas com estado
  // EFETIVO do dia (pos-alteracoes). Sem isso, inferirSaiDaEscala (U5) so
  // achava historico antigo e o KPI saia com motoristas errados. Agora
  // dia 25 vira fonte de verdade pras alteracoes futuras do dia, e
  // regerar_local/dashboards veem o dia atual.
  //
  // Idempotente: deleta upload-fluxo-KPI anterior do mesmo dia antes (se houver).
  // Nao toca em uploads do fluxo /escalas/upload (tipos GERAL/ZONA_SUL/PAX/etc).
  try {
    const TIPO_FLUXO = 'KPI_SIMPLES'
    const { data: prev } = await svc
      .from('escala_uploads')
      .select('id')
      .eq('data_escala', data)
      .eq('tipo', TIPO_FLUXO)
      .maybeSingle()
    if (prev) await svc.from('escala_uploads').delete().eq('id', prev.id)

    const { data: upload, error: uplErr } = await svc
      .from('escala_uploads')
      .insert({
        data_escala: data,
        tipo: TIPO_FLUXO,
        arquivo_path: escalaPaths[0] ?? '/simples',
        nome_arquivo: `/api/kpi/simples ${data}`,
        qtd_linhas: escalaLinhas.length,
        status: 'processado',
        uploaded_by: user.id,
      })
      .select('id')
      .single()

    if (!uplErr && upload?.id) {
      const BATCH = 200
      for (let i = 0; i < escalaLinhas.length; i += BATCH) {
        const slice = escalaLinhas.slice(i, i + BATCH)
        const rows = slice.map(l => ({
          escala_upload_id: upload.id,
          rede_id: l.rede_id,
          loja_id: null,
          loja_nome_raw: l.loja_nome_raw,
          loja_codigo_raw: l.loja_codigo_raw,
          placa_norm: l.placa_norm || null,
          placa_raw: l.placa_raw,
          motorista_nome: l.motorista_nome,
          motorista_codigo: l.motorista_codigo,
          tipo_carro: l.tipo_carro,
          turno: l.turno,
          carro_ordem: l.carro_ordem,
          obs: l.obs,
          restricao: l.restricao,
          peso_kg: l.peso_kg,
          paletes: l.paletes,
          data_entrega: l.data_entrega ?? data,
          raw_row_num: l.raw_row_num,
          sub_rede: l.sub_rede ?? null,
          raw_json: l,
        }))
        const { error: insErr } = await svc.from('escala_linhas').insert(rows)
        if (insErr) {
          console.warn('[/api/kpi/simples] INSERT escala_linhas falhou:', insErr.message)
          break
        }
      }
    } else {
      console.warn('[/api/kpi/simples] INSERT escala_uploads falhou:', uplErr?.message)
    }
  } catch (e) {
    console.warn('[/api/kpi/simples] Persistencia escala_linhas erro:', e instanceof Error ? e.message : e)
  }

  // Cadastro de placas conhecidas (alimenta o parser PDF p/ corrigir OCR na pos-4):
  // - Placas das linhas da escala (fonte XLSX, sem OCR) — fonte primária.
  // - Histórico de `unitrac_paradas` no banco — reforço.
  const cadastroPlacas = new Set<string>()
  for (const l of escalaLinhas) {
    if (l.placa_norm) cadastroPlacas.add(l.placa_norm)
  }
  // Frota ativa (autoritativa, ~centenas de placas) + histórico de paradas (reforço
  // p/ OCR), buscados EM PARALELO. O histórico é limitado: sem cap, varríamos a
  // tabela `unitrac_paradas` INTEIRA a cada geração — e ela cresce todo dia, então
  // o custo degradava com o tempo. Com ~centenas de placas distintas, 20k linhas
  // cobrem todas com folga; a frota garante o conjunto autoritativo mesmo com o cap.
  // (frotaRastreada é reusada abaixo no cálculo de "sem rastreador".)
  const [frotaRes, placasHistRes] = await Promise.all([
    svc.from('veiculos').select('placa_norm').eq('ativo', true),
    svc.from('unitrac_paradas').select('placa_norm').not('placa_norm', 'is', null).limit(20000),
  ])
  const frotaRows = frotaRes.data ?? []
  const frotaRastreada = new Set(frotaRows.map(v => v.placa_norm as string))
  for (const v of frotaRows) {
    if (v.placa_norm) cadastroPlacas.add(String(v.placa_norm))
  }
  for (const r of (placasHistRes.data ?? [])) {
    if (r.placa_norm) cadastroPlacas.add(String(r.placa_norm))
  }

  // Parse unitrac — baixa e parseia cada arquivo, mergeia por placa.
  // Em modoApi (beta), pulamos o PDF — paradaRows vira [] e é preenchido pela API abaixo.
  const veiculosMap = new Map<string, import('@/lib/types/unitrac').ResumoVeiculo>()
  if (!modoApi) for (const unitracPath of unitracPaths) {
    const { data: unitracBlob, error: unitracErr } = await svc.storage.from('unitrac-raw').download(unitracPath)
    if (unitracErr || !unitracBlob) {
      console.warn(`[/api/kpi/simples] Unitrac ${unitracPath} não encontrado, pulando.`)
      continue
    }
    const unitracBuffer = await unitracBlob.arrayBuffer()
    try {
      let parsed
      if (unitracPath.endsWith('.pdf')) {
        const { parseUnitracPdf } = await import('@/lib/parsers/unitrac-pdf')
        parsed = await parseUnitracPdf(Buffer.from(unitracBuffer), cadastroPlacas)
      } else {
        parsed = await parseUnitrac(unitracBuffer)
      }
      for (const v of parsed) {
        if (!veiculosMap.has(v.placa_norm)) {
          veiculosMap.set(v.placa_norm, v)
        } else {
          // Mesma placa em dois arquivos (XLSX + PDF): deduplica por chegada+saída
          // e prefere a versão MAIS INFORMATIVA (com codigo_loja, ou classificação
          // LOJA vs FORA_BASE). XLSX e PDF do mesmo dia podem ter dados ligeiramente
          // diferentes — escolher o melhor de cada parada maximiza completude.
          const existing = veiculosMap.get(v.placa_norm)!
          const byKey = new Map<string, typeof existing.paradas[number]>()
          const toKey = (p: typeof existing.paradas[number]) => {
            const cheg = p.chegada instanceof Date ? p.chegada.toISOString() : String(p.chegada)
            const sai = p.saida instanceof Date ? p.saida.toISOString() : String(p.saida ?? '')
            return `${cheg}|${sai}`
          }
          const informatividade = (p: typeof existing.paradas[number]) => {
            // LOJA com código > LOJA sem código > FORA_BASE > BASE > FAKE_EXIT
            const tier = p.classificacao === 'LOJA' ? (p.codigo_loja ? 4 : 3) :
                         p.classificacao === 'FORA_BASE' ? 2 :
                         p.classificacao === 'BASE' ? 1 : 0
            return tier
          }
          for (const p of [...existing.paradas, ...v.paradas]) {
            const k = toKey(p)
            const prev = byKey.get(k)
            if (!prev || informatividade(p) > informatividade(prev)) byKey.set(k, p)
          }
          veiculosMap.set(v.placa_norm, { ...existing, paradas: Array.from(byKey.values()) })
        }
      }
    } catch (e) {
      return new NextResponse(e instanceof Error ? e.message : 'Erro ao ler Unitrac.', { status: 400 })
    }
  }
  const veiculos = Array.from(veiculosMap.values())
  if (veiculos.length === 0 && !modoApi)
    return new NextResponse('Nenhum veículo encontrado no Unitrac.', { status: 400 })

  // Build matcher inputs
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

  let paradaRows: UnitracParadaRow[] = veiculos.flatMap((v, vi) =>
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
    }))
  )

  // NORMAL: completa o PDF com as paradas ao vivo da API (best-effort). PDF manda
  // onde tem; a API preenche o que um relatório gerado cedo perdeu. API fora do ar
  // → segue só com o PDF (= comportamento de hoje). Paralelo com limite p/ não
  // estourar o tempo da função. `alvosApi` reusado no enriquecimento por NF abaixo.
  let alvosApi: AlvoApi[] = []
  // Geofences AUTORITATIVAS da API (vêm dos alvos: pontolat/long/raio). Reusadas
  // pra confirmar entrega por COORDENADA depois do matcher (gabarito da API, não o
  // cadastro furado — seguro mesmo com setSemGeo).
  let pontosApi: MapaPontos = {}
  // Posições ao vivo (por placa) — usamos `atraso` (min sem comunicar) pra explicar
  // "sem rastreador" como "sem comunicação há X min" quando a placa TEM rastreador
  // na API mas não mandou dado.
  let posicoesApi: MapaPosicoes = {}
  // Placas que TÊM rastreador (frota monitorada da API). Quem está aqui nunca é
  // "sem rastreador"; quem não está É sem rastreador. Base do funil placa-por-placa.
  let frotaApiPlacas = new Set<string>()
  // Paradas CONSOLIDADAS da API (por geofence + duração) — gabarito de horário pra
  // corrigir quando o PDF marca um drive-by em vez da parada real de entrega.
  let apiRowsConsolidadas: UnitracParadaRow[] = []
  try {
    const frotaApi = await buscarFrota()
    const cvs = frotaApi.map(v => v.cv)
    const [pontos, alvs, poss] = await Promise.all([buscarPontos(cvs), buscarAlvos(cvs), buscarPosicoes(cvs)])
    alvosApi = alvs
    pontosApi = pontos
    posicoesApi = poss
    frotaApiPlacas = new Set(frotaApi.map(v => v.placaNorm))
    const placasEscala = new Set(escalaLinhas.map(l => l.placa_norm).filter(Boolean) as string[])
    const veicEscala = frotaApi.filter(v => placasEscala.has(v.placaNorm))
    const settled = await mapLimitSettled(veicEscala, 8, (v) =>
      buscarStopsCru(v.cv, 48).then(ev => consolidaParadasApi(ev, pontos, data, v.placaNorm)))
    const apiRows: UnitracParadaRow[] = []
    for (const r of settled) if (r.status === 'fulfilled') apiRows.push(...r.value)
    apiRowsConsolidadas = apiRows
    paradaRows = modoApi ? apiRows : mesclarParadas(paradaRows, apiRows)
  } catch (e) {
    console.warn('[/api/kpi/simples] merge PDF+API falhou (segue só PDF):', e instanceof Error ? e.message : e)
  }

  // "Sem rastreador" = a PLACA não tem rastreador cadastrado (não está na frota
  // monitorada do Unitrac, tabela `veiculos`). FONTE AUTORITATIVA — não é "não
  // apareceu no relatório de hoje": um caminhão com rastreador que só não rodou
  // hoje NÃO é sem rastreador. Fallback: se a frota estiver vazia (não importada),
  // cai no "presente no relatório" pra não marcar tudo como sem rastreador.
  // (frotaRastreada já foi carregada lá em cima, junto do cadastro de placas.)
  const placasNoRelatorio = new Set(paradaRows.map(p => p.placa_norm))
  const temFrota = frotaRastreada.size > 0
  // Usa variantesPlaca (OCR + Mercosul): a escala pode ter a placa antiga (LKF-7079)
  // e o relatório a Mercosul (LKF-7A79) — sem isso a placa rastreada seria tida como
  // "sem rastreador" por engano. Se a placa aparece no relatório, ela TEM rastreador.
  const placaRastreada = (placa: string | null): boolean => {
    if (!placa) return false
    const base = temFrota ? frotaRastreada : placasNoRelatorio
    if (base.has(placa)) return true
    return variantesPlaca(placa).some(v => base.has(v))
  }
  // "Mudou de rota": placa rastreada que foi a alguma LOJA (entregou em outro lugar),
  // mas não na loja agendada desta linha. Distingue de "não saiu da base" (só base).
  const placasComLoja = new Set(paradaRows.filter(p => p.classificacao === 'LOJA').map(p => p.placa_norm))
  const placaFoiAlgumLugar = (placa: string | null): boolean => {
    if (!placa) return false
    if (placasComLoja.has(placa)) return true
    return variantesPlaca(placa).some(v => placasComLoja.has(v))
  }
  // "Saiu da base": tem QUALQUER parada LOJA ou FORA_BASE no relatório. Se a placa está
  // no relatório (tem rastreador) mas NÃO saiu da base, o caminhão só ficou no CD →
  // "NÃO SAIU DA BASE" (mais preciso que "não foi ao cliente").
  const placasSairam = new Set(
    paradaRows.filter(p => p.classificacao === 'LOJA' || p.classificacao === 'FORA_BASE').map(p => p.placa_norm),
  )
  const placaSaiuDaBase = (placa: string | null): boolean => {
    if (!placa) return false
    if (placasSairam.has(placa)) return true
    return variantesPlaca(placa).some(v => placasSairam.has(v))
  }
  // Minutos desde a última comunicação do rastreador (API), ou null se a placa não
  // está na API. Se está → TEM rastreador (mesmo sem dado no relatório de hoje), e
  // dá pra dizer "sem comunicação há X min" em vez do enganoso "sem rastreador".
  const semComunicacaoDe = (placa: string | null): number | null => {
    if (!placa) return null
    const p = posicoesApi[placa] ?? variantesPlaca(placa).map(v => posicoesApi[v]).find(Boolean)
    return p ? p.atraso : null
  }
  // Funil placa-por-placa: 'sem_rastreador' (não está na frota da API) | 'desatualizado'
  // (está na frota mas sem transmitir hoje) | 'rastreado'. Best-effort: API vazia →
  // frotaApiPlacas vazio → tudo 'sem_rastreador' (cai no comportamento de hoje).
  const classApiDaPlaca = (placa: string | null) =>
    placa ? classificarPlacaViaApi(placa, frotaApiPlacas, posicoesApi, data) : 'sem_rastreador'

  // Cat 3 (regra Tia Érica 05/06): uma placa pode estar em DUAS escalas no mesmo dia
  // (redes diferentes). Quando ela entrega numa rede e a linha da OUTRA rede aparece
  // como "erro", costuma ser a 2ª rota do dia (ainda vai/foi rodar), não erro real.
  // Mapeia placa → redes em que está escalada, pra sinalizar isso no motivo de revisão.
  const redesPorPlaca = new Map<string, Set<string>>()
  for (const l of escalaLinhas) {
    if (!l.placa_norm) continue
    const s = redesPorPlaca.get(l.placa_norm) ?? new Set<string>()
    s.add(l.rede_id)
    redesPorPlaca.set(l.placa_norm, s)
  }

  // Hora mais recente coberta pelo relatório (BRT mascarado como UTC → getUTCHours
  // = hora BR direto). Usada pra detectar RELATÓRIO PARCIAL: gerado de madrugada,
  // antes das entregas (caso Princesa 4h: caminhões saem 2h, entregam 5-6h, então
  // às 4h aparecem "saíram da base" sem entrega — não é erro, é relatório cedo).
  const reportMaxHora = paradaRows.reduce((mx, p) => {
    const iso = p.saida ?? p.chegada
    if (!iso) return mx
    const d = new Date(iso)
    return Math.max(mx, d.getUTCHours() + d.getUTCMinutes() / 60)
  }, 0)
  // Corte do relatório em ms (maior timestamp) — pra detectar "relatório parcial":
  // caminhão que saiu da base e estava em rota quando o relatório foi emitido.
  const corteMs = paradaRows.reduce((mx, p) => {
    const iso = p.saida ?? p.chegada
    const t = iso ? new Date(iso).getTime() : 0
    return t > mx ? t : mx
  }, 0)

  // Carrega lojas operacionais (resolveLojaId) e canonical_loja com geo
  // (geo fallback para paradas FORA_BASE sem geofence — Categoria B do plano-90%).
  // Em paralelo: trgm-lookup usa o supabase client para enriquecer matches fuzzy.
  // Também carrega janelas operacionais das redes pra ativar ANOM-11.
  const [lojasRes, canonicalRes, redesRes] = await Promise.all([
    svc
      .from('lojas')
      .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, endereco, bairro, municipio, numero')
      .eq('ativo', true)
      // ORDER BY estável: sem isso a ordem do Postgres é não-determinística e o
      // `.find()` do matcher pode escolher lojas diferentes entre execuções em
      // casos ambíguos (duplicatas). Ordena por id pra resultado reprodutível.
      .order('id', { ascending: true }),
    svc
      .from('canonical_loja')
      .select('id, name, lat, lng, raio_metros')
      .not('lat', 'is', null)
      .not('lng', 'is', null),
    svc
      .from('redes')
      .select('id, janela_inicio, janela_fim')
      .eq('ativo', true),
  ])

  const lojasParaMatcher = (lojasRes.data ?? []).map(l => ({
    id: l.id as string,
    rede_id: l.rede_id as string,
    nome: (l.nome as string) ?? '',
    nome_normalizado: (l.nome_normalizado as string) ?? '',
    codigo_escala: l.codigo_escala as string | null,
    codigo_unitrac: l.codigo_unitrac as string | null,
    nome_unitrac: l.nome_unitrac as string | null,
    lat: l.lat as number | null,
    lng: l.lng as number | null,
    raio_metros: (l.raio_metros as number | null) ?? 150,
    endereco: l.endereco as string | null,
    bairro: l.bairro as string | null,
    municipio: l.municipio as string | null,
    numero: l.numero as string | null,
  }))

  const geoStores = (canonicalRes.data ?? []).map(c => ({
    id: c.id as string,
    name: c.name as string,
    lat: c.lat as number,
    lng: c.lng as number,
    raio_metros: (c.raio_metros as number | null) ?? 150,
  }))

  // Modo sem geofence (decisão Tia Erica/William 27/05): cadastro do Unitrac tem
  // geofences sobrepostos/errados; sem geo o sistema só preenche o que o código
  // de loja prova e deixa o resto vazio em vez de inventar.
  setSemGeo(true)
  const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojasParaMatcher, svc, geoStores, { geoEndereco: true })

  // === Enriquecimento via API (geo + alvo/NF) — BEST-EFFORT, blindado ===
  // Se a API cair ou devolver dado estranho, captura e segue SÓ com o resultado do
  // matcher (PDF). A API nunca derruba a geração nem o KPI do cliente.
  try {
  // Confirmação por COORDENADA (gabarito da API): pra rota cuja loja esperada NÃO
  // casou no matcher, se o GPS da placa passou DENTRO da geofence autoritativa do
  // Unitrac daquela loja, confirma/resgata a entrega. Usa pontosApi (coords que a
  // própria Unitrac fornece), então é seguro mesmo com setSemGeo (não depende do
  // cadastro). Positivo-só: só confirma, nunca marca "não foi".
  if (Object.keys(pontosApi).length > 0) {
    const stopsPorPlaca = (placa: string | null) => {
      if (!placa) return []
      const vars = new Set([placa, ...variantesPlaca(placa)])
      return paradaRows.filter(p => vars.has(p.placa_norm))
    }
    const usadosGeo = new Set<string>()
    for (const rota of rotas) {
      const esc = escalaMap.get(rota.escala_linha_id)
      if (!esc) continue
      const esperada = resolverLojaEsperada(esc, lojasParaMatcher)
      if (!esperada?.codigo_unitrac) continue
      if (rota.paradas.some(p => p.loja_id === esperada.id)) continue // já casou na loja certa
      const conf = confirmaEntregaViaApi(esperada.codigo_unitrac, stopsPorPlaca(rota.placa_unitrac ?? rota.placa_norm), pontosApi)
      if (!conf || usadosGeo.has(conf.stopId)) continue
      const sp = paradaRows.find(p => p.id === conf.stopId)
      if (!sp) continue
      const chegada = new Date(sp.chegada)
      const saida = sp.saida ? new Date(sp.saida) : chegada
      rota.paradas = [{ parada_id: sp.id, loja_id: esperada.id, nome: esperada.nome, chegada, saida, duracao_min: Math.round((saida.getTime() - chegada.getTime()) / 60000), classificacao: 'LOJA' }]
      rota.status = 'ok'
      rota.geo_confiavel = true
      rota.geo_dist_metros = conf.distMetros
      rota._matchMeta = { score: 0.95, confidence: 'HIGH', requiresReview: false, algorithm: 'api' }
      usadosGeo.add(sp.id)
    }
  }

  // === HORÁRIO-GABARITO: corrige drive-by do PDF ===
  // Pra linha JÁ casada na loja certa, se a API tem a parada consolidada da mesma loja
  // e o horário diverge >15min (PDF marcou passagem rápida), usa o horário da API
  // (parada real por geofence + duração). Escolhe a parada API MAIS LONGA na loja (a
  // entrega de verdade, não um drive-by). Não muda a entrega, só o horário.
  if (apiRowsConsolidadas.length > 0) {
    for (const rota of rotas) {
      const esc = escalaMap.get(rota.escala_linha_id)
      if (!esc) continue
      const esperada = resolverLojaEsperada(esc, lojasParaMatcher)
      if (!esperada?.codigo_unitrac) continue
      const p0 = rota.paradas[0]
      if (!p0 || p0.loja_id !== esperada.id || !p0.chegada) continue // só linhas casadas na loja certa
      const vars = new Set([rota.placa_norm, rota.placa_unitrac, ...variantesPlaca(rota.placa_norm ?? '')].filter(Boolean) as string[])
      const candidatas = apiRowsConsolidadas.filter(p => vars.has(p.placa_norm) && p.codigo_loja === esperada.codigo_unitrac)
      if (candidatas.length === 0) continue
      // No modo API, o veículo pode ter múltiplas paradas na mesma loja (ex: fila
      // antes do doca). Usa a chegada da parada MAIS CEDO (o momento real da chegada
      // ao local). No modo PDF, usa a MAIS LONGA (parada real vs. drive-by curto do PDF).
      const apiStop = modoApi
        ? candidatas.reduce((a, b) => new Date(a.chegada).getTime() < new Date(b.chegada).getTime() ? a : b)
        : candidatas.reduce((a, b) => (b.duracao_seg ?? 0) > (a.duracao_seg ?? 0) ? b : a)
      const novaChegada = horarioEntregaGabarito(p0.chegada, new Date(apiStop.chegada))
      if (novaChegada.getTime() !== p0.chegada.getTime()) {
        const dur = p0.duracao_min ?? 0
        rota.paradas[0] = { ...p0, chegada: novaChegada, saida: new Date(novaChegada.getTime() + dur * 60000) }
      }
    }
  }

  // Confirma/resgata por ALVO+NF (best-effort). Se a API não respondeu (alvosApi
  // vazio), é no-op. Positivo-só: alvo pendente não vira entrega.
  //
  // NÃO usamos mais `alvodatainicio` como saída CD: ele é a hora PLANEJADA da rota
  // (madrugada, ou até a 2ª viagem da noite), não a saída física do caminhão —
  // dava saída 00:35/23:28 contra o GPS (incidente dia 15). A saída de base verdadeira
  // vem do GPS (relatório/saída parcial). Sem isso, fica em branco (honesto > inventado).
  if (alvosApi.length > 0) {
    for (const rota of rotas) {
      const esc = escalaMap.get(rota.escala_linha_id)
      if (!esc || !rota.placa_norm) continue
      const esperada = resolverLojaEsperada(esc, lojasParaMatcher)
      if (!esperada?.codigo_unitrac) continue
      const placaAlvo = rota.placa_unitrac ?? rota.placa_norm
      const c = confirmaPorAlvo(placaAlvo, esperada.codigo_unitrac, alvosApi)
      if (c && !rota.paradas.some(p => p.loja_id === esperada.id)) {
        const t = new Date(c.feitoISO + 'Z')
        rota.paradas = [{ parada_id: null, loja_id: esperada.id, nome: esperada.nome, chegada: t, saida: t, duracao_min: 0, classificacao: 'LOJA' }]
        rota.status = 'ok'
      }
    }
  }
  } catch (e) {
    console.warn('[/api/kpi/simples] enriquecimento via API falhou (segue com o PDF):', e instanceof Error ? e.message : e)
  }

  // Detecção de anomalias — gera codigos por escala_linha_id pra exibir/cor no preview.
  // Constrói paradasIndex direto dos paradaRows (em memória, sem ida ao DB).
  const { detectaAnomalias } = await import('@/lib/kpi/anomalia')
  const paradasIndex = new Map<string, Array<{ id: string; classificacao: string; chegada: Date; saida: Date | null; duracao_seg: number | null; lat: number | null; lng: number | null }>>()
  for (const p of paradaRows) {
    const list = paradasIndex.get(p.placa_norm) ?? []
    list.push({
      id: p.id,
      classificacao: p.classificacao,
      chegada: new Date(p.chegada),
      saida: p.saida ? new Date(p.saida) : null,
      duracao_seg: p.duracao_seg,
      lat: p.lat,
      lng: p.lng,
    })
    paradasIndex.set(p.placa_norm, list)
  }
  // Para placas Mercosul com OCR ambíguo (1↔B, 9↔J, 4↔E na posição 4), o
  // Unitrac pode gravar a variante diferente da escala. Sem este passo,
  // paradasIndex.has(escalaPlaca) = false → ANOM-01 HIGH falso.
  // Adicionamos apenas se a variante não estiver já no índice (evita clobber).
  for (const [placa, list] of [...paradasIndex]) {
    for (const variante of variantesOcr(placa)) {
      if (variante !== placa && !paradasIndex.has(variante)) {
        paradasIndex.set(variante, list)
      }
    }
  }
  const anomalias = detectaAnomalias({
    rotas,
    escalaLinhas: escalaRows.map(e => ({
      id: e.id, placa_norm: e.placa_norm, rede_id: e.rede_id,
      data_entrega: e.data_entrega, loja_nome_raw: e.loja_nome_raw,
    })),
    paradasIndex,
    janelasRede: new Map(
      (redesRes.data ?? [])
        .filter(r => r.janela_inicio && r.janela_fim)
        .map(r => [r.id as string, {
          janela_inicio: String(r.janela_inicio).slice(0, 5),
          janela_fim: String(r.janela_fim).slice(0, 5),
        }])
    ),
    lojaCoords: new Map(lojasParaMatcher.map(l => [l.id, { lat: l.lat, lng: l.lng, raio_metros: l.raio_metros, nome: l.nome, rede_id: l.rede_id }])),
    data,
  })
  // Indexa anomalias por rota_id pra anexar nos códigos
  const anomaliasPorRota = new Map<string, string[]>()
  // Agrega contagem por rede e severidade pra persistir no summary
  const anomaliasPorRede: Record<string, { high: number; medium: number; low: number }> = {}
  for (const a of anomalias) {
    if (a.kpi_rota_id) {
      const cur = anomaliasPorRota.get(a.kpi_rota_id) ?? []
      cur.push(a.codigo)
      anomaliasPorRota.set(a.kpi_rota_id, cur)
    }
    // Localiza rede via escala_linha_id (que é o kpi_rota_id no fluxo simples)
    const rota = a.kpi_rota_id ? rotas.find(r => r.escala_linha_id === a.kpi_rota_id) : null
    const redeKey = rota?.rede_id ?? '_extra'
    if (!anomaliasPorRede[redeKey]) anomaliasPorRede[redeKey] = { high: 0, medium: 0, low: 0 }
    if (a.severidade === 'HIGH') anomaliasPorRede[redeKey].high++
    else if (a.severidade === 'MEDIUM') anomaliasPorRede[redeKey].medium++
    else anomaliasPorRede[redeKey].low++
  }
  for (const rota of rotas) {
    const codigos = anomaliasPorRota.get(rota.escala_linha_id)
    if (codigos) rota.anomalias_codigos = codigos
  }

  // Sinais por placa pro status mais preciso (reaproveitam as anomalias já detectadas):
  //  • placaDivergeUnitrac: ANOM-15 (placa quase igual no Unitrac — typo de cadastro)
  //  • rastreadorTravado:   ANOM-16 (rastro degenerado — 1 ponto o dia todo)
  //  • placaEntregouEscala: a placa casou ≥1 das próprias linhas → linha sem parada
  //    dela é "não foi ao cliente" (pulou a loja), não "mudou de rota" (outra rota).
  const placaDivergeUnitrac = new Map<string, string>()
  const rastreadorTravado = new Set<string>()
  for (const a of anomalias) {
    const pl = a.payload as Record<string, unknown> | undefined
    if (a.codigo === 'ANOM-15' && pl?.placa_escala) placaDivergeUnitrac.set(String(pl.placa_escala), String(pl.placa_unitrac))
    if (a.codigo === 'ANOM-16' && pl?.placa) rastreadorTravado.add(String(pl.placa))
  }
  const placaEntregouEscala = new Map<string, boolean>()
  for (const r of rotas) {
    if (!r.placa_norm) continue
    const entregou = r.paradas.some(p => p.classificacao === 'LOJA' || (p.classificacao === 'FORA_BASE' && !!p.loja_id))
    if (entregou) placaEntregouEscala.set(r.placa_norm, true)
    else if (!placaEntregouEscala.has(r.placa_norm)) placaEntregouEscala.set(r.placa_norm, false)
  }

  const redeMap = new Map<string, { rotas: RotaKpi[]; escala: LinhaEscala[] }>()
  for (const rota of rotas) {
    const escala = escalaMap.get(rota.escala_linha_id)
    if (!escala) continue
    const rede_id = escala.rede_id
    if (!redeMap.has(rede_id)) redeMap.set(rede_id, { rotas: [], escala: [] })
    redeMap.get(rede_id)!.rotas.push(rota)
    redeMap.get(rede_id)!.escala.push(escala)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let results: any[] = []
  let redes_com_erro: { rede_id: string; erro_mensagem: string }[] = []
  try {
    const redesEntries = Array.from(redeMap.entries())
    const settled = await mapLimitSettled(
    redesEntries,
    2,
    async ([rede_id, { rotas: redeRotas, escala: redeEscala }]) => {
      const sorted = redeRotas
        .map((r, i) => ({ rota: r, esc: redeEscala[i] }))
        .sort((a, b) => {
          const cmp = a.esc.loja_nome_raw.localeCompare(b.esc.loja_nome_raw, 'pt-BR')
          return cmp !== 0 ? cmp : a.esc.carro_ordem - b.esc.carro_ordem
        })

      // Relatório gerado ANTES do fim da janela desta rede → entregas em andamento.
      const janelaFim = JANELA_FIM[rede_id] ?? 12
      const relatorioCedo = reportMaxHora < janelaFim
      // Saída de base de um caminhão em rota no corte (caso KOP-4978): só quando o
      // relatório foi cedo, a linha não teve entrega e a placa saiu da base.
      const saidaParcialDe = (rota: RotaKpi): Date | null => {
        if (!relatorioCedo || rota.paradas.some(p => p.loja_id != null)) return null
        return saidaBaseSeEmRota(paradasIndex.get(rota.placa_unitrac ?? rota.placa_norm ?? ''), corteMs)
      }

      // Apply per-line overrides from frontend edits
      for (const edit of lineEdits) {
        if (edit.rede_id !== rede_id) continue

        // Bugs N8+N11: prefere match por chave estavel (loja+placa+carro)
        // sobre indice numerico. Se frontend mandou match_*, usa eles.
        let i = -1
        if (edit.match_loja_nome_raw !== undefined) {
          i = sorted.findIndex(s => {
            if (edit.match_loja_nome_raw !== s.esc.loja_nome_raw) return false
            if (edit.match_carro_ordem !== undefined && edit.match_carro_ordem !== s.esc.carro_ordem) return false
            if (edit.match_placa_norm !== undefined && edit.match_placa_norm !== (s.rota.placa_norm ?? null)) return false
            return true
          })
        }
        if (i < 0) {
          // Fallback retrocompat: indice numerico
          i = edit.ordem - 1
        }
        if (i < 0 || i >= sorted.length) continue
        const cur = sorted[i]
        const nextRota = { ...cur.rota }
        const nextEsc = { ...cur.esc }
        if (edit.placa !== undefined) nextRota.placa_norm = edit.placa || null
        if (edit.motorista !== undefined) nextEsc.motorista_nome = edit.motorista || null
        if (edit.loja !== undefined) nextEsc.loja_nome_raw = edit.loja || ''
        if (edit.turno !== undefined) {
          const t = edit.turno.toUpperCase().trim()
          if (t === 'MANHA' || t === 'MANHÃ') nextEsc.turno = 'MANHA'
          else if (t === 'TARDE') nextEsc.turno = 'TARDE'
        }
        if (edit.saida_cd !== undefined)
          nextRota.saida_cd = edit.saida_cd ? brtHHMMtoDate(data, edit.saida_cd) : null
        if (edit.chegada_loja !== undefined || edit.tempo_loja_min !== undefined) {
          const paradas = [...nextRota.paradas]
          const p0 = paradas[0] ?? null
          const novaChegada =
            edit.chegada_loja !== undefined
              ? (edit.chegada_loja ? brtHHMMtoDate(data, edit.chegada_loja) : null)
              : (p0?.chegada ?? null)
          const novoTempo =
            edit.tempo_loja_min !== undefined
              ? edit.tempo_loja_min
              : (p0?.duracao_min ?? null)
          if (novaChegada) {
            const duracao = novoTempo ?? 0
            const saida = p0?.saida ?? new Date(novaChegada.getTime() + duracao * 60000)
            paradas[0] = {
              parada_id: p0?.parada_id ?? null,
              loja_id: p0?.loja_id ?? null,
              nome: p0?.nome ?? nextEsc.loja_nome_raw,
              chegada: novaChegada,
              saida,
              duracao_min: novoTempo ?? 0,
              classificacao: p0?.classificacao ?? 'LOJA',
            }
          } else if (edit.chegada_loja === '') {
            paradas.shift()
          }
          nextRota.paradas = paradas
        }
        sorted[i] = { rota: nextRota, esc: nextEsc }
      }

      const linhas: LinhaParaKpi[] = sorted.map(({ rota, esc }, idx) => {
        const l = rotaToLinha(rota, esc, idx + 1)
        l.placa_rastreada = placaRastreada(rota.placa_norm)
        l.placa_foi_algum_lugar = placaFoiAlgumLugar(rota.placa_norm)
        l.placa_saiu_da_base = placaSaiuDaBase(rota.placa_norm)
        l.relatorio_cedo = relatorioCedo
        // Placa fora do relatório + na frota da API sem transmitir hoje → desatualizado
        // (alimenta a legenda "DESATUALIZADO" no XLSX em vez de "SEM RASTREADOR").
        l.placa_desatualizada = !l.placa_rastreada && classApiDaPlaca(rota.placa_norm) === 'desatualizado'
        // Fora do relatório mas rastreador funcionando na API → "não foi", não "sem
        // rastreador" no XLSX (espelha a tela, que já usa placaTemRastreadorApi).
        l.placa_tem_rastreador_api = !l.placa_rastreada && classApiDaPlaca(rota.placa_norm) === 'rastreado'
        // Saída de base quando em rota: parcial estrito OU a saída conhecida (caso FHO,
        // onde o relatório cortou logo após a saída). Mostra a saída e marca "em rota".
        const semEntregaLinha = !rota.paradas.some(p => p.loja_id != null)
        const saidaParcial = saidaParcialDe(rota)
          ?? (relatorioCedo && semEntregaLinha
            ? saidaBaseConhecida(paradasIndex.get(rota.placa_unitrac ?? rota.placa_norm ?? '') ?? [], corteMs)
            : null)
        if (saidaParcial) {
          l.relatorio_parcial = true
          l.saida_base_parcial = saidaParcial
          l.saida_cd = saidaParcial // saída de base é fato — alimenta PDF e contagem de GPS
          const hhmm = `${String(saidaParcial.getUTCHours()).padStart(2, '0')}:${String(saidaParcial.getUTCMinutes()).padStart(2, '0')}`
          l.observacao = [l.observacao, `Saiu da base ${hhmm}, ainda em rota no relatório.`].filter(Boolean).join(' ')
        }
        return l
      })

      const rede_nome = REDE_NOMES_CANONICOS[rede_id] ?? rede_id
      const qtd_sem_gps = linhas.filter(l => !l.saida_cd && !l.chd_loja_1).length

      const lojaById = new Map(lojasParaMatcher.map(l => [l.id, l]))
      const preview: PreviewLinha[] = sorted.map(({ rota, esc }, idx) => {
        const p0 = rota.paradas[0]
        // temGps = a placa está no relatório (rastreada), não só esta linha ter casado.
        const temGps = rota.paradas.length > 0 || placaRastreada(rota.placa_norm)
        const ficouNaBase = rota.status === 'sem_entrega' && !!esc.placa_norm
        // Classificação dos avisos (não muda match — só explica o motivo):
        const esperada = resolverLojaEsperada(esc, lojasParaMatcher)
        const temEntrega = rota.paradas.some(p => p.loja_id != null)
        const saidaParcialPreview = saidaParcialDe(rota)
        // (a) loja sem cadastro no Unitrac → impossível rastrear
        const lojaSemCadastroUnitrac = !temEntrega &&
          (!esperada || esperada.codigo_unitrac == null || esperada.lat == null || esperada.lng == null)
        // (b) loja-gêmea: outra loja da mesma rede a ≤120m → relatório sem código não decide
        let lojaAmbiguaComGemea: { outra: string } | null = null
        if (!temEntrega && !lojaSemCadastroUnitrac && esperada && esperada.lat != null && esperada.lng != null) {
          const gemea = lojasParaMatcher.find(l =>
            l.id !== esperada.id && l.rede_id === esperada.rede_id &&
            l.lat != null && l.lng != null &&
            haversine(esperada.lat!, esperada.lng!, l.lat, l.lng) <= 120)
          if (gemea) lojaAmbiguaComGemea = { outra: gemea.nome }
        }
        // (c) entregou em loja com código que não bate a escala → rota ≠ escala
        let entregouLojaForaEscala: { lojaReal: string } | null = null
        const pLoja = rota.paradas.find(p => p.classificacao === 'LOJA' && p.loja_id)
        if (pLoja?.loja_id) {
          const lr = lojaById.get(pLoja.loja_id)
          if (lr && lojaNomeDivergeDaEscala(esc.loja_nome_raw, lr)) entregouLojaForaEscala = { lojaReal: lr.nome }
        }
        // Funil placa-por-placa: classifica a placa que não apareceu no relatório.
        const classApiLinha = !temGps && rota.placa_norm ? classApiDaPlaca(rota.placa_norm) : 'rastreado'
        const statusInfo = derivarStatus({
          temGps,
          ficouNaBase,
          paradas: rota.paradas.map(p => ({ classificacao: p.classificacao, loja_id: p.loja_id ?? null })),
          viaGeo: rota._matchMeta?.algorithm === 'geo',
          viaTroca: rota._matchMeta?.algorithm === 'troca',
          placaReal: rota.placa_real ?? null,
          // Geo dentro do raio cadastrado → entra no KPI sem revisão.
          geoConfiavel: rota.geo_confiavel ?? false,
          // Placa rodou outra rota (foi a clientes) e não a escalada → mudou de rota.
          // (Se houvesse alteração informada, a linha já teria a placa certa e não cairia aqui.)
          placaFoiAlgumLugar: placaFoiAlgumLugar(rota.placa_norm),
          // Placa no relatório mas só com parada na base → "não saiu da base".
          placaSaiuDaBase: placaSaiuDaBase(rota.placa_norm),
          // Entregou ≥1 das próprias lojas → linha sem parada é "não foi", não "mudou de rota".
          placaEntregouPropriaEscala: placaEntregouEscala.get(rota.placa_norm ?? '') ?? false,
          // Placa quase-igual no Unitrac (typo de cadastro) → não é "sem rastreador".
          placaDivergeUnitrac: placaDivergeUnitrac.get(rota.placa_norm ?? '') ?? null,
          // Rastro degenerado (1 ponto o dia todo) → rastreador travado.
          rastreadorTravado: rastreadorTravado.has(rota.placa_norm ?? ''),
          // Funil: placa fora do relatório mas na frota da API sem transmitir hoje →
          // DESATUALIZADO (tem rastreador, precisa manutenção), não "sem rastreador".
          placaDesatualizadaApi: classApiLinha === 'desatualizado',
          // Na frota da API + transmitindo, mas fora do relatório → tem rastreador,
          // "não foi ao cliente" (não "sem rastreador").
          placaTemRastreadorApi: classApiLinha === 'rastreado' && !temGps,
          // Sugestão de troca ALTA (T18 segurou): vira "mudou de rota" (amarelo) em vez
          // de "não foi" (vermelho), com a placa provável no motivo.
          sugestaoTrocaAlta: rota.sugestao_confianca === 'alta' && rota.placa_sugerida
            ? { placa: rota.placa_sugerida, hora: rota.sugestao_hora ?? null }
            : null,
          // Avisos: dado faltando / ambíguo / fora da escala.
          lojaSemCadastroUnitrac,
          lojaAmbiguaComGemea,
          entregouLojaForaEscala,
          relatorioParcial: !!saidaParcialPreview,
          saidaBaseParcial: saidaParcialPreview
            ? `${String(saidaParcialPreview.getUTCHours()).padStart(2, '0')}:${String(saidaParcialPreview.getUTCMinutes()).padStart(2, '0')}`
            : null,
        })
        const saidaLoja = p0 && p0.chegada && p0.duracao_min != null
          ? new Date(p0.chegada.getTime() + p0.duracao_min * 60_000)
          : null
        // Alerta "placa desatualizada na escala": a entrega só casou porque o sistema
        // converteu a placa antiga da escala pro padrão Mercosul do Unitrac. Sinaliza
        // pra operação pedir a atualização da escala (áudio Cecília 04/06).
        const placaDesatualizada = !!rota.placa_unitrac && !!rota.placa_norm && rota.placa_unitrac !== rota.placa_norm
        const notaDesatualizada = placaDesatualizada
          ? `Placa da escala (${rota.placa_norm}) desatualizada — no Unitrac é Mercosul (${rota.placa_unitrac}). Pedir atualização da escala.`
          : null
        // Cat 3: linha de erro cuja placa também está escalada em OUTRA rede e entregou
        // lá → provável 2ª rota do dia. Sinaliza pra operação não tratar como erro real.
        const ehErro = statusInfo.status !== 'ENTREGUE' && statusInfo.status !== 'ENTREGUE_GEO'
        const outrasRedes = rota.placa_norm
          ? [...(redesPorPlaca.get(rota.placa_norm) ?? new Set<string>())].filter(r => r !== rede_id)
          : []
        const notaMultiEscala = ehErro && outrasRedes.length > 0 && (placaEntregouEscala.get(rota.placa_norm ?? '') ?? false)
          ? `Placa também escalada em ${outrasRedes.map(r => REDE_NOMES_CANONICOS[r] ?? r).join(', ')} e entregou lá — pode ser a 2ª rota do dia (não necessariamente erro). Conferir a ordem das rotas.`
          : null
        const motivoRevisao = [statusInfo.motivoRevisao, notaDesatualizada, notaMultiEscala].filter(Boolean).join(' ') || null
        return {
          ordem: idx + 1,
          loja_nome: esc.loja_nome_raw,
          placa: rota.placa_real ?? rota.placa_norm,
          motorista: esc.motorista_nome,
          turno: esc.turno,
          tem_gps: temGps,
          ficou_na_base: ficouNaBase,
          // Em rota mostra a saída de base que JÁ sabe (regra do operador / caso FHO):
          // matcher → parcial estrito → saída de base conhecida (corteMs evita pegar a
          // volta no fim do dia como saída — incidente UBO-5E05).
          saida_cd_fmt: fmtHoraBRT(rota.saida_cd)
            ?? fmtHoraBRT(saidaParcialPreview)
            ?? (!temEntrega ? fmtHoraBRT(saidaBaseConhecida(paradasIndex.get(rota.placa_unitrac ?? rota.placa_norm ?? '') ?? [], corteMs)) : null),
          chegada_loja_fmt: fmtHoraBRT(rota.paradas[0]?.chegada),
          chegada_base_fmt: fmtHoraBRT(rota.chegada_base),
          tempo_loja_min: rota.paradas[0]?.duracao_min ?? null,
          confianca: rota._matchMeta?.confidence ?? 'UNMATCHED',
          algoritmo: rota._matchMeta?.algorithm ?? 'none',
          geo_dist_metros: rota.geo_dist_metros ?? null,
          anomalias: rota.anomalias_codigos,
          status: statusInfo.status,
          revisar: statusInfo.revisar || placaDesatualizada || !!notaMultiEscala,
          motivoRevisao,
          categoria: statusInfo.categoria,
          natureza: statusInfo.natureza,
          saida_loja_fmt: fmtHoraBRT(saidaLoja),
          situacaoViva: relatorioCedo
            ? situacaoViva({
                entregue: statusInfo.status === 'ENTREGUE' || statusInfo.status === 'ENTREGUE_GEO',
                naApi: placaRastreada(rota.placa_norm),
                saiuDaBase: placaSaiuDaBase(rota.placa_norm),
              })
            : undefined,
          // "Sem rastreador" mas a placa está viva na API → tem rastreador, só não
          // comunicou. Mostra "sem comunicação há X min" (verdade) em vez de acusar
          // ausência de equipamento.
          semComunicacaoMin: statusInfo.status === 'SEM_RASTREADOR' ? semComunicacaoDe(rota.placa_norm) : null,
        }
      })

      const [xlsxBuffer, xlsxComChegadaBuffer, pdfBuffer, pdfComChegadaBuffer] = await Promise.all([
        gerarKpi({ rede_id, data, linhas }),
        gerarKpi({ rede_id, data, linhas, comChegadaCd: true }),
        gerarKpiPdf({ rede_id, rede_nome, data, linhas: linhas as KpiLinha[] }),
        gerarKpiPdf({ rede_id, rede_nome, data, linhas: linhas as KpiLinha[], comChegadaCd: true }),
      ])

      const anomCounts = anomaliasPorRede[rede_id] ?? { high: 0, medium: 0, low: 0 }

      // Aviso de relatório parcial: a JANELA de entrega da rede ainda não fechou e
      // quase ninguém entregou → relatório gerado cedo demais (caso Princesa 4h).
      // Janelas informadas pela operação (Tia Érica): a maioria das redes entrega
      // 3:30–12:00; Guanabara 9–15; SuperPax/Feira Nova/Emanuel 13–17; Armazém do
      // Grão 12–18; Zona Sul 3:30–23. Por isso ZS/Armazém de manhã ter pouca entrega
      // é NORMAL, não erro — e o aviso reflete isso.
      const rastreados = preview.filter(p => p.tem_gps)
      const entregaram = rastreados.filter(p => p.chegada_loja_fmt)
      const avisoParcial = rastreados.length >= 3 && reportMaxHora < janelaFim && entregaram.length / rastreados.length < 0.2
        ? `Relatório parece parcial: só ${entregaram.length}/${rastreados.length} veículos rastreados com entrega e o relatório vai até ~${String(Math.floor(reportMaxHora)).padStart(2, '0')}h, mas as entregas desta rede vão até ${janelaFim}h. Gere de novo depois das entregas.`
        : null

      return {
        rede_id,
        rede_nome,
        qtd_rotas: linhas.length,
        qtd_sem_gps,
        avisoParcial,
        qtd_anomalias_high: anomCounts.high,
        qtd_anomalias_medium: anomCounts.medium,
        qtd_anomalias_low: anomCounts.low,
        xlsxBase64: xlsxBuffer.toString('base64'),
        xlsxComChegadaBase64: xlsxComChegadaBuffer.toString('base64'),
        pdfBase64: pdfBuffer.toString('base64'),
        pdfComChegadaBase64: pdfComChegadaBuffer.toString('base64'),
        preview,
      }
    }
    )

    const redeIds = redesEntries.map(([id]) => id)
    const { ok, falhas } = partitionSettled(settled, redeIds)
    results = ok
    redes_com_erro = falhas.map(f => ({ rede_id: f.key, erro_mensagem: f.erro_mensagem }))
    for (const f of falhas) {
      console.error(`[/api/kpi/simples] Rede ${f.key} falhou:`, f.erro_mensagem)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro interno ao gerar KPI.'
    console.error('[/api/kpi/simples] Erro fatal:', e)
    return new NextResponse(msg, { status: 500 })
  }

  // #36 — Lojas novas: códigos que aparecem como LOJA no Unitrac mas NÃO estão no
  // cadastro. Preventivo: avisa pra cadastrar antes do cadastro envelhecer (caso
  // clássico do código novo 560xxx). Match exato (código Unitrac↔Unitrac); exclui
  // geofences de rota gigante (não são lojas).
  const cadastroCods = new Set(lojasParaMatcher.map(l => l.codigo_unitrac).filter((c): c is string => !!c))
  const novasMap = new Map<string, { codigo: string; nome: string; vezes: number; placa: string }>()
  for (const p of paradaRows) {
    if (p.classificacao !== 'LOJA' || !p.codigo_loja) continue
    if (cadastroCods.has(p.codigo_loja) || isRotaGigante(p.codigo_loja)) continue
    const ex = novasMap.get(p.codigo_loja)
    if (ex) { ex.vezes++; if (!ex.nome && p.nome_loja) ex.nome = p.nome_loja }
    else novasMap.set(p.codigo_loja, { codigo: p.codigo_loja, nome: p.nome_loja ?? '', vezes: 1, placa: p.placa_norm })
  }
  const lojasNovas = [...novasMap.values()].sort((a, b) => b.vezes - a.vezes)

  // Persistência: registra a geração (apenas metadados leves, sem base64)
  let geracaoId: string | null = null
  if (!skipSave && results.length > 0) {
    const summary = results.map(r => ({
      rede_id: r.rede_id,
      rede_nome: r.rede_nome,
      qtd_rotas: r.qtd_rotas,
      qtd_sem_gps: r.qtd_sem_gps,
      qtd_anomalias_high: r.qtd_anomalias_high,
      qtd_anomalias_medium: r.qtd_anomalias_medium,
      qtd_anomalias_low: r.qtd_anomalias_low,
    }))
    const total_rotas = results.reduce((s, r) => s + r.qtd_rotas, 0)
    const total_sem_gps = results.reduce((s, r) => s + r.qtd_sem_gps, 0)

    const { data: inserted } = await svc
      .from('kpi_simples')
      .insert({
        data,
        gerado_por: user.id,
        escala_paths: escalaPaths,
        unitrac_path: unitracPaths[0] ?? null,
        alteracoes,
        line_edits: lineEdits,
        redes: summary,
        total_rotas,
        total_sem_gps,
      })
      .select('id')
      .single()
    geracaoId = (inserted?.id as string) ?? null

    // Risco da carga: do MESMO paradaRows (já mesclado PDF + API) calcula as paradas
    // indevidas e fixa o resumo do dia no storage — assim o mapa do dashboard funciona
    // pra QUALQUER dia gerado, sem depender da janela de 48h da API. Best-effort: se
    // falhar, não atrapalha a geração do KPI. Salva só se for mais completo (não regride).
    try {
      const placaRede = new Map(escalaLinhas.filter(l => l.placa_norm).map(l => [l.placa_norm as string, l.rede_id]))
      const placaMotorista = new Map(escalaLinhas.filter(l => l.placa_norm && l.motorista_nome).map(l => [l.placa_norm as string, l.motorista_nome as string]))
      const r = await salvarResumoSeMelhor(svc, data, montarResumoDeParadaRows(paradaRows, placaRede, placaMotorista))
      console.log(`[kpi/simples] resumo de risco ${data}: ${r.salvou ? 'atualizado' : 'mantido'} (antes ${r.antes}, agora ${r.agora} indevidas)`)
    } catch (e) {
      console.warn('[kpi/simples] salvar resumo de risco falhou (best-effort):', e instanceof Error ? e.message : e)
    }
  }

  return NextResponse.json({ redes: results, redes_com_erro, geracao_id: geracaoId, lojasNovas, avisosEscala })
}

// GET /api/kpi/simples?data=YYYY-MM-DD → lista histórico de gerações
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const url = new URL(req.url)
  const dataParam = url.searchParams.get('data')
  const svc = createServiceClient()

  let q = svc
    .from('kpi_simples')
    .select('id, data, gerado_por, gerado_em, redes, total_rotas, total_sem_gps')
    .order('gerado_em', { ascending: false })
    .limit(50)

  if (dataParam && /^\d{4}-\d{2}-\d{2}$/.test(dataParam)) q = q.eq('data', dataParam)

  const { data: rows, error } = await q
  if (error) return new NextResponse(error.message, { status: 500 })

  return NextResponse.json({ geracoes: rows ?? [] })
}
