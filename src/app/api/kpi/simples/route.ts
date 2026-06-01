import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac, variantesOcr, setSemGeo } from '@/lib/kpi/matcher'
import { aplicarAlteracoes } from '@/lib/kpi/aplicar-alteracoes'
import { gerarKpi, type LinhaParaKpi } from '@/lib/kpi/gerador-kpi'
import { gerarKpiPdf } from '@/lib/kpi/gerador-pdf'
import { REDE_NOMES_CANONICOS } from '@/lib/kpi/kpi-styles'
import { derivarStatus, type StatusRota } from '@/lib/kpi/status-rota'
import { partitionSettled } from '@/lib/utils/partition-settled'
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
  tempo_loja_min: number | null
  confianca: 'HIGH' | 'LOW' | 'UNMATCHED'
  algoritmo: string
  anomalias: string[]
  status: StatusRota
  revisar: boolean
  motivoRevisao: string | null
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

function rotaToLinha(rota: RotaKpi, escala: LinhaEscala, ordem: number): LinhaParaKpi {
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
    placa: rota.placa_norm,
    carro_ordem: escala.carro_ordem,
    saida_cd: rota.saida_cd,
    chd_loja_1: p1?.chegada ?? null,
    saida_loja_1: p1?.saida ?? null,
    tempo_loja_1_min: p1?.duracao_min ?? null,
    chd_loja_2: p2?.chegada ?? null,
    saida_loja_2: p2?.saida ?? null,
    tempo_loja_2_min: p2?.duracao_min ?? null,
    chd_loja_3: p3?.chegada ?? null,
    saida_loja_3: p3?.saida ?? null,
    tempo_loja_3_min: p3?.duracao_min ?? null,
    observacao: null,
    anomalias_codigos: rota.anomalias_codigos,
    motorista_codigo: escala.motorista_codigo,
    rota_status: rota.status,
  }
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

  const { escalaBucketPath, escalaBucketPaths, unitracBucketPath, unitracBucketPaths, data, alteracoes = [], lineEdits = [], skipSave = false } = body as {
    escalaBucketPath?: string
    escalaBucketPaths?: string[]
    unitracBucketPath?: string
    unitracBucketPaths?: string[]
    data: string
    alteracoes?: AltConfirmada[]
    lineEdits?: LineEdit[]
    skipSave?: boolean
  }

  // Normalize to array
  const escalaPaths: string[] = escalaBucketPaths ?? (escalaBucketPath ? [escalaBucketPath] : [])
  if (escalaPaths.length === 0) return new NextResponse('"escalaBucketPath" ou "escalaBucketPaths" obrigatório.', { status: 400 })
  const rawUnitracPaths: string[] = unitracBucketPaths ?? (unitracBucketPath ? [unitracBucketPath] : [])
  if (rawUnitracPaths.length === 0) return new NextResponse('"unitracBucketPath" ou "unitracBucketPaths" obrigatório.', { status: 400 })

  // PDF é OBRIGATÓRIO (fonte primária — Tia Érica usa só PDF, é mais completo).
  // XLSX é OPCIONAL (fallback que pode ter parsing mais limpo em alguns casos).
  // Antes exigíamos os dois, mas Tia Érica trabalha só com PDF, então o sistema
  // deve refletir esse fluxo.
  const temPdf = rawUnitracPaths.some(p => p.toLowerCase().endsWith('.pdf'))
  if (!temPdf) {
    return new NextResponse(
      'Suba o relatório Unitrac em PDF (formato principal). XLSX é opcional como fallback.',
      { status: 400 },
    )
  }

  const unitracPaths = Array.from(new Set(rawUnitracPaths))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida. Use YYYY-MM-DD.', { status: 400 })

  const svc = createServiceClient()

  // Baixa e parseia cada escala, acumulando todas as linhas
  let escalaLinhas: LinhaEscala[] = []
  const MIN = 3

  for (const escalaPath of escalaPaths) {
    const { data: escalaBlob, error: escalaErr } = await svc.storage.from('escalas-raw').download(escalaPath)
    if (escalaErr || !escalaBlob) {
      return new NextResponse(`Erro ao baixar escala: ${escalaErr?.message ?? 'não encontrado'}`, { status: 400 })
    }
    const escalaBuffer = await escalaBlob.arrayBuffer()

    let linhasDoArquivo: LinhaEscala[] = []
    try {
      if (escalaPath.endsWith('.pdf')) {
        const { parseEscalaGuanabaraPdf } = await import('@/lib/parsers/escala-guanabara-pdf')
        linhasDoArquivo = await parseEscalaGuanabaraPdf(Buffer.from(escalaBuffer), data)
      } else {
        const tentativas: Array<() => Promise<LinhaEscala[]>> = [
          () => parseEscalaZonaSul(escalaBuffer, data),
          () => parseEscalaArmazemGrao(escalaBuffer, data),
          () => parseEscalaPax(escalaBuffer, data),
          () => parseEscalaGeral(escalaBuffer, data),
        ]
        for (const fn of tentativas) {
          try {
            const r = await fn()
            if (r.length >= MIN) { linhasDoArquivo = r; break }
          } catch { /* próximo */ }
        }
      }
    } catch {
      // arquivo não reconhecido — continua com o próximo
    }

    escalaLinhas.push(...linhasDoArquivo)
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

  // Baixa e parseia todos os arquivos Unitrac, mergeando os veículos
  // (suporta XLSX + PDF simultâneos para cobrir formatos diferentes do mesmo dia)

  // T1: Alterações são puramente INLINE (estado da UI no body do request).
  // Sem busca no banco — cada geração de KPI carrega o que o operador adicionou
  // naquele momento. Tabela `alteracoes` deixou de ser usada pra esse fluxo.
  if (alteracoes.length > 0) {
    escalaLinhas = aplicaAlteracoes([...escalaLinhas], alteracoes)
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
  const { data: placasHist } = await svc
    .from('unitrac_paradas')
    .select('placa_norm')
    .not('placa_norm', 'is', null)
  if (placasHist) {
    for (const r of placasHist) {
      if (r.placa_norm) cadastroPlacas.add(String(r.placa_norm))
    }
  }

  // Parse unitrac — baixa e parseia cada arquivo, mergeia por placa
  const veiculosMap = new Map<string, import('@/lib/types/unitrac').ResumoVeiculo>()
  for (const unitracPath of unitracPaths) {
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
  if (veiculos.length === 0)
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
    }))
  )

  // Carrega lojas operacionais (resolveLojaId) e canonical_loja com geo
  // (geo fallback para paradas FORA_BASE sem geofence — Categoria B do plano-90%).
  // Em paralelo: trgm-lookup usa o supabase client para enriquecer matches fuzzy.
  // Também carrega janelas operacionais das redes pra ativar ANOM-11.
  const [lojasRes, canonicalRes, redesRes] = await Promise.all([
    svc
      .from('lojas')
      .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, endereco, bairro, municipio, numero')
      .eq('ativo', true),
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
    const settled = await Promise.allSettled(
    redesEntries.map(async ([rede_id, { rotas: redeRotas, escala: redeEscala }]) => {
      const sorted = redeRotas
        .map((r, i) => ({ rota: r, esc: redeEscala[i] }))
        .sort((a, b) => {
          const cmp = a.esc.loja_nome_raw.localeCompare(b.esc.loja_nome_raw, 'pt-BR')
          return cmp !== 0 ? cmp : a.esc.carro_ordem - b.esc.carro_ordem
        })

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

      const linhas: LinhaParaKpi[] = sorted.map(({ rota, esc }, idx) =>
        rotaToLinha(rota, esc, idx + 1)
      )

      const rede_nome = REDE_NOMES_CANONICOS[rede_id] ?? rede_id
      const qtd_sem_gps = linhas.filter(l => !l.saida_cd && !l.chd_loja_1).length

      const preview: PreviewLinha[] = sorted.map(({ rota, esc }, idx) => {
        const p0 = rota.paradas[0]
        const temGps = !!(rota.saida_cd || rota.paradas.length > 0)
        const ficouNaBase = rota.status === 'sem_entrega' && !!esc.placa_norm
        const statusInfo = derivarStatus({
          temGps,
          ficouNaBase,
          paradas: rota.paradas.map(p => ({ classificacao: p.classificacao, loja_id: p.loja_id ?? null })),
          viaGeo: rota._matchMeta?.algorithm === 'geo',
        })
        const saidaLoja = p0 && p0.chegada && p0.duracao_min != null
          ? new Date(p0.chegada.getTime() + p0.duracao_min * 60_000)
          : null
        return {
          ordem: idx + 1,
          loja_nome: esc.loja_nome_raw,
          placa: rota.placa_norm,
          motorista: esc.motorista_nome,
          turno: esc.turno,
          tem_gps: temGps,
          ficou_na_base: ficouNaBase,
          saida_cd_fmt: fmtHoraBRT(rota.saida_cd),
          chegada_loja_fmt: fmtHoraBRT(rota.paradas[0]?.chegada),
          tempo_loja_min: rota.paradas[0]?.duracao_min ?? null,
          confianca: rota._matchMeta?.confidence ?? 'UNMATCHED',
          algoritmo: rota._matchMeta?.algorithm ?? 'none',
          anomalias: rota.anomalias_codigos,
          status: statusInfo.status,
          revisar: statusInfo.revisar,
          motivoRevisao: statusInfo.motivoRevisao,
          saida_loja_fmt: fmtHoraBRT(saidaLoja),
        }
      })

      const [xlsxBuffer, pdfBuffer] = await Promise.all([
        gerarKpi({ rede_id, data, linhas }),
        gerarKpiPdf({ rede_id, rede_nome, data, linhas: linhas as KpiLinha[] }),
      ])

      const anomCounts = anomaliasPorRede[rede_id] ?? { high: 0, medium: 0, low: 0 }

      return {
        rede_id,
        rede_nome,
        qtd_rotas: linhas.length,
        qtd_sem_gps,
        qtd_anomalias_high: anomCounts.high,
        qtd_anomalias_medium: anomCounts.medium,
        qtd_anomalias_low: anomCounts.low,
        xlsxBase64: xlsxBuffer.toString('base64'),
        pdfBase64: pdfBuffer.toString('base64'),
        preview,
      }
    })
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
  }

  return NextResponse.json({ redes: results, redes_com_erro, geracao_id: geracaoId })
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
