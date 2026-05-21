import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { cruzaEscalaUnitrac, variantesOcr } from '@/lib/kpi/matcher'
import { gerarKpi, type LinhaParaKpi } from '@/lib/kpi/gerador-kpi'
import { gerarKpiPdf } from '@/lib/kpi/gerador-pdf'
import { REDE_NOMES_CANONICOS } from '@/lib/kpi/kpi-styles'
import { mergeAlteracoes } from '@/lib/kpi/merge-alteracoes'
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
  saida_cd_fmt: string | null
  chegada_loja_fmt: string | null
  tempo_loja_min: number | null
  confianca: 'HIGH' | 'LOW' | 'UNMATCHED'
  algoritmo: string
  anomalias: string[]
}

function fmtHoraBRT(d: Date | null | undefined): string | null {
  if (!d) return null
  const h = (d.getUTCHours() - 3 + 24) % 24
  const m = d.getUTCMinutes()
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// HH:MM (BRT) → Date UTC ancorado em `dataIso` (YYYY-MM-DD)
function brtHHMMtoDate(dataIso: string, hhmm: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1]), mn = Number(m[2])
  if (h < 0 || h > 23 || mn < 0 || mn > 59) return null
  const d = new Date(`${dataIso}T00:00:00.000Z`)
  d.setUTCHours(h + 3, mn, 0, 0)
  return d
}

type LineEdit = {
  rede_id: string
  ordem: number
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
  }
}

function aplicaAlteracoes(linhas: LinhaEscala[], alts: AltConfirmada[]): LinhaEscala[] {
  // Snapshot das placas originais antes de qualquer mutação: impede que uma
  // alteração anterior altere os critérios de match de uma posterior (cascata).
  // Necessário para SWAP mútuo: Filial 23 LQA5883↔LTE0A64 + Filial 43 LTE0A64↔LQA5883
  // sem snapshot, a 2ª alt encontraria a placa já substituída pela 1ª.
  const placasOriginais: (string | null)[] = linhas.map(l => l.placa_norm || null)
  const motoristasOriginais: (string | null)[] = linhas.map(l => l.motorista_nome || null)

  for (const alt of alts) {
    const tipoOk = alt.tipo === 'SUBSTITUICAO' || alt.tipo === 'INCLUSAO' || alt.tipo === 'SWAP'
    if (!tipoOk) continue
    if (!alt.entra) continue

    // Predicado de match: usa snapshot original, não o valor atual (anti-cascata)
    const matches = (l: LinhaEscala, i: number): boolean => {
      // Filtra por rede quando disponível — impede contaminação cross-rede
      if (alt.rede_id && l.rede_id !== alt.rede_id) return false
      if (alt.sai?.placa_norm && placasOriginais[i] === alt.sai.placa_norm) return true
      if (alt.sai?.motorista_nome) {
        const needle = alt.sai.motorista_nome.toLowerCase().split(' ')[0]
        if (needle.length >= 3 && motoristasOriginais[i]?.toLowerCase().includes(needle)) return true
      }
      // Match por loja/filial: quando não há info em sai, mas o operador informou
      // loja_raw (ex: "Filial 23"), casa a linha pelo número da filial dentro da rede.
      // Permite alteração de placa sem precisar saber quem estava escalado originalmente.
      if (!alt.sai?.placa_norm && !alt.sai?.motorista_nome && alt.loja_raw) {
        const filialM = alt.loja_raw.match(/\b(\d{1,3})\b/)
        if (filialM) {
          const filialInt = parseInt(filialM[1], 10)
          const codInt = parseInt(l.loja_codigo_raw ?? '', 10)
          if (!isNaN(filialInt) && !isNaN(codInt) && filialInt === codInt) return true
        }
      }
      return false
    }

    if (alt.tipo === 'SWAP') {
      // SWAP: troca APENAS a placa entre dois slots, mantém motoristas intactos.
      // entra.placa_norm = nova placa que entra na linha que tinha sai.placa_norm.
      // Só modifica placa_norm/placa_raw — motorista permanece.
      for (let i = 0; i < linhas.length; i++) {
        if (!matches(linhas[i], i)) continue
        const l = { ...linhas[i] }
        if (alt.entra.placa_norm) l.placa_norm = alt.entra.placa_norm
        if (alt.entra.placa_raw) l.placa_raw = alt.entra.placa_raw
        linhas[i] = l
        // SWAP afeta apenas a linha da placa que sai — não continua pro loop inteiro
        break
      }
    } else {
      // SUBSTITUICAO / INCLUSAO: atualiza TODAS as linhas que casam com a placa/motorista
      // (uma placa pode servir múltiplas lojas na mesma rede — ex: Zona Sul filial 23 e 45).
      for (let i = 0; i < linhas.length; i++) {
        if (!matches(linhas[i], i)) continue
        const l = { ...linhas[i] }
        if (alt.entra.placa_norm) l.placa_norm = alt.entra.placa_norm
        if (alt.entra.placa_raw) l.placa_raw = alt.entra.placa_raw
        if (alt.entra.motorista_nome) l.motorista_nome = alt.entra.motorista_nome
        if (alt.entra.motorista_codigo !== null && alt.entra.motorista_codigo !== undefined)
          l.motorista_codigo = String(alt.entra.motorista_codigo)
        linhas[i] = l
      }
    }
  }
  return linhas
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return new NextResponse('Body JSON inválido.', { status: 400 })

  const { escalaBucketPath, escalaBucketPaths, unitracBucketPath, data, alteracoes = [], lineEdits = [], skipSave = false } = body as {
    escalaBucketPath?: string
    escalaBucketPaths?: string[]
    unitracBucketPath: string
    data: string
    alteracoes?: AltConfirmada[]
    lineEdits?: LineEdit[]
    skipSave?: boolean
  }

  // Normalize to array
  const escalaPaths: string[] = escalaBucketPaths ?? (escalaBucketPath ? [escalaBucketPath] : [])
  if (escalaPaths.length === 0) return new NextResponse('"escalaBucketPath" ou "escalaBucketPaths" obrigatório.', { status: 400 })
  if (!unitracBucketPath) return new NextResponse('"unitracBucketPath" obrigatório.', { status: 400 })
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

  // Baixa unitrac do Storage
  const { data: unitracBlob, error: unitracErr } = await svc.storage.from('unitrac-raw').download(unitracBucketPath)
  if (unitracErr || !unitracBlob)
    return new NextResponse(`Erro ao baixar unitrac: ${unitracErr?.message ?? 'não encontrado'}`, { status: 500 })
  const unitracBuffer = await unitracBlob.arrayBuffer()

  // Carrega alterações persistidas no banco pra essa data (qualquer status
  // não-cancelada). Mergea com as alterações in-memory do request (UI atual),
  // priorizando as in-memory em caso de duplicata.
  const { data: altsDb } = await svc
    .from('alteracoes')
    .select('tipo, rede_id, loja_raw, motorista_entra, motorista_entra_codigo, placa_entra_norm, motorista_sai, placa_sai_norm')
    .eq('data_alteracao', data)
    .neq('status', 'cancelada')
  const altsFromDb: AltConfirmada[] = (altsDb ?? []).map(r => ({
    tipo: r.tipo as string,
    rede_id: (r.rede_id as string | null) ?? null,
    loja_raw: (r.loja_raw as string | null) ?? null,
    entra: r.placa_entra_norm || r.motorista_entra ? {
      motorista_nome: r.motorista_entra as string | null,
      motorista_codigo: r.motorista_entra_codigo ? parseInt(r.motorista_entra_codigo as string, 10) : null,
      placa_raw: r.placa_entra_norm as string | null,
      placa_norm: r.placa_entra_norm as string | null,
    } : null,
    sai: r.placa_sai_norm || r.motorista_sai ? {
      motorista_nome: r.motorista_sai as string | null,
      placa_norm: r.placa_sai_norm as string | null,
    } : null,
  }))

  // Mergea inline + banco deduplicando por placa (ou motorista+rede como fallback).
  // Lógica extraída para src/lib/kpi/merge-alteracoes.ts (testada em isolamento).
  const altsFinal = mergeAlteracoes(alteracoes, altsFromDb)

  if (altsFinal.length > 0) {
    escalaLinhas = aplicaAlteracoes([...escalaLinhas], altsFinal)
    console.log(`[/api/kpi/simples] Aplicando ${altsFinal.length} alterações (${alteracoes.length} inline, ${altsFromDb.length} do banco)`)
  }

  // Parse unitrac
  let veiculos
  try {
    if (unitracBucketPath.endsWith('.pdf')) {
      const { parseUnitracPdf } = await import('@/lib/parsers/unitrac-pdf')
      veiculos = await parseUnitracPdf(Buffer.from(unitracBuffer))
    } else {
      veiculos = await parseUnitrac(unitracBuffer)
    }
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : 'Erro ao ler Unitrac.', { status: 400 })
  }
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
      .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
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
  }))

  const geoStores = (canonicalRes.data ?? []).map(c => ({
    id: c.id as string,
    name: c.name as string,
    lat: c.lat as number,
    lng: c.lng as number,
    raio_metros: (c.raio_metros as number | null) ?? 150,
  }))

  const rotas = await cruzaEscalaUnitrac(escalaRows, paradaRows, lojasParaMatcher, svc, geoStores)

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

  const results = await Promise.all(
    Array.from(redeMap.entries()).map(async ([rede_id, { rotas: redeRotas, escala: redeEscala }]) => {
      const sorted = redeRotas
        .map((r, i) => ({ rota: r, esc: redeEscala[i] }))
        .sort((a, b) => {
          const cmp = a.esc.loja_nome_raw.localeCompare(b.esc.loja_nome_raw, 'pt-BR')
          return cmp !== 0 ? cmp : a.esc.carro_ordem - b.esc.carro_ordem
        })

      // Apply per-line overrides from frontend edits
      for (const edit of lineEdits) {
        if (edit.rede_id !== rede_id) continue
        const i = edit.ordem - 1
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

      const preview: PreviewLinha[] = sorted.map(({ rota, esc }, idx) => ({
        ordem: idx + 1,
        loja_nome: esc.loja_nome_raw,
        placa: rota.placa_norm,
        motorista: esc.motorista_nome,
        turno: esc.turno,
        tem_gps: !!(rota.saida_cd || rota.paradas.length > 0),
        saida_cd_fmt: fmtHoraBRT(rota.saida_cd),
        chegada_loja_fmt: fmtHoraBRT(rota.paradas[0]?.chegada),
        tempo_loja_min: rota.paradas[0]?.duracao_min ?? null,
        confianca: rota._matchMeta?.confidence ?? 'UNMATCHED',
        algoritmo: rota._matchMeta?.algorithm ?? 'none',
        anomalias: rota.anomalias_codigos,
      }))

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
        unitrac_path: unitracBucketPath,
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

  return NextResponse.json({ redes: results, geracao_id: geracaoId })
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
