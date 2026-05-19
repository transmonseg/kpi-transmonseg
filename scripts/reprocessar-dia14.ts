/**
 * Reprocessa o dia 14/05 completo via service role (sem HTTP auth).
 * Faz tudo que os routes fazem: parse escalas + Unitrac, insere no DB,
 * cruzamento, anomalias e gera XLSX.
 *
 * Executa com: npx tsx scripts/reprocessar-dia14.ts
 */
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const BASE_ESCALA = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/escalas'
const BASE_UNITRAC = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/relatorios-unitrac'
const DATA = '2026-05-14'
const FAKE_USER_ID = 'c76b6f16-a988-480b-84e9-3c2e9038559a' // gerenciamento@transmonseg.com.br

const SUPABASE_URL = 'https://luhwpsckvbctxynifryk.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1aHdwc2NrdmJjdHh5bmlmcnlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODcwMzE0MSwiZXhwIjoyMDk0Mjc5MTQxfQ.t4R0Rxs4l9VH6YoR-8aE6Bno7hRr86m6FQq35CaD6bQ'

import { parseEscalaZonaSul } from '../src/lib/parsers/escala-zona-sul'
import { parseEscalaGeral } from '../src/lib/parsers/escala-geral'
import { parseEscalaArmazemGrao } from '../src/lib/parsers/escala-armazem-grao'
import { parseEscalaPax } from '../src/lib/parsers/escala-pax'
import { parseUnitrac } from '../src/lib/parsers/unitrac'
import { cruzaEscalaUnitrac } from '../src/lib/kpi/matcher'
import { detectaAnomalias } from '../src/lib/kpi/anomalia'
import { gerarKpi } from '../src/lib/kpi/gerador-kpi'

const svc = createClient(SUPABASE_URL, SERVICE_KEY)

function ok(msg: string) { console.log('  ✓', msg) }
function info(msg: string) { console.log(' ', msg) }
function sep(s: string) { console.log(`\n── ${s} ──`) }

;(async () => {
  // ── PASSO 1: Limpar dados do dia 14 ─────────────────────────────────────
  sep('Limpando dados existentes do dia ' + DATA)

  const { data: uploadsExist } = await svc.from('escala_uploads').select('id').eq('data_escala', DATA)
  if (uploadsExist && uploadsExist.length > 0) {
    const ids = uploadsExist.map(u => u.id as string)
    await svc.from('escala_linhas').delete().in('escala_upload_id', ids)
    await svc.from('escala_uploads').delete().in('id', ids)
    ok(`Deletados ${uploadsExist.length} uploads antigos`)
  } else {
    ok('Nenhum upload anterior')
  }

  const { data: unitracExist } = await svc.from('unitrac_uploads').select('id').eq('data_relatorio', DATA)
  if (unitracExist && unitracExist.length > 0) {
    const ids = unitracExist.map(u => u.id as string)
    await svc.from('unitrac_paradas').delete().in('unitrac_upload_id', ids)
    await svc.from('unitrac_uploads').delete().in('id', ids)
    ok(`Deletados ${unitracExist.length} uploads unitrac antigos`)
  }

  // Limpar kpis do dia (cascades via kpi_rotas e anomalias)
  const { data: kpisExist } = await svc.from('kpis').select('id').eq('data', DATA)
  if (kpisExist && kpisExist.length > 0) {
    const kpiIds = kpisExist.map(k => k.id as string)
    const { data: rotasExist } = await svc.from('kpi_rotas').select('id').eq('data', DATA)
    if (rotasExist && rotasExist.length > 0) {
      await svc.from('anomalias').delete().in('kpi_rota_id', rotasExist.map(r => r.id as string))
      await svc.from('kpi_rotas').delete().eq('data', DATA)
    }
    await svc.from('kpi_linhas').delete().in('kpi_id', kpiIds)
    await svc.from('kpis').delete().eq('data', DATA)
    ok(`Deletados ${kpisExist.length} KPIs antigos`)
  }

  // ── PASSO 2: Upload e parse das escalas ──────────────────────────────────
  sep('Fazendo upload e parse das escalas')

  const escalas = [
    { tipo: 'ZONA_SUL', arquivo: 'ESCALA ZONA SUL - MAIO.xlsx', parser: parseEscalaZonaSul },
    { tipo: 'GERAL',    arquivo: 'ESCALA GERAL DE MAIO 1.xlsx', parser: parseEscalaGeral },
    { tipo: 'ARMAZEM_GRAO', arquivo: 'ESCALA DO ARMAZÉM DO GRÃO MAIO.xlsx', parser: parseEscalaArmazemGrao },
    { tipo: 'PAX',      arquivo: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO.xlsx', parser: parseEscalaPax },
  ] as const

  let totalEscalaLinhas = 0

  for (const { tipo, arquivo, parser } of escalas) {
    const buf = readFileSync(path.join(BASE_ESCALA, arquivo))
    const linhas = await (parser as (b: Buffer, d: string) => Promise<import('../src/lib/types/escala').LinhaEscala[]>)(buf, DATA)

    if (linhas.length === 0) {
      info(`${tipo}: sem linhas para ${DATA}`)
      continue
    }

    // Inserir upload
    const { data: upload, error: upErr } = await svc.from('escala_uploads').insert({
      tipo,
      data_escala: DATA,
      nome_arquivo: arquivo,
      arquivo_path: `${DATA}/${arquivo}`,
      qtd_linhas: linhas.length,
      status: 'processado',
      uploaded_by: FAKE_USER_ID,
      processado_em: new Date().toISOString(),
    }).select('id').single()

    if (upErr || !upload) throw new Error(`Erro ao inserir upload ${tipo}: ${upErr?.message}`)

    // Inserir linhas
    const rows = linhas.map(l => ({
      escala_upload_id: upload.id,
      rede_id: l.rede_id,
      loja_id: null,
      data_entrega: l.data_entrega,
      loja_nome_raw: l.loja_nome_raw,
      loja_codigo_raw: l.loja_codigo_raw,
      placa_norm: l.placa_norm || null,
      placa_raw: l.placa_raw,
      motorista_nome: l.motorista_nome,
      motorista_codigo: l.motorista_codigo,
      tipo_carro: l.tipo_carro,
      carro_ordem: l.carro_ordem,
      turno: l.turno,
      obs: l.obs,
      restricao: l.restricao,
      peso_kg: l.peso_kg,
      paletes: l.paletes,
      raw_row_num: l.raw_row_num,
      raw_json: l,
    }))

    const { error: lErr } = await svc.from('escala_linhas').insert(rows)
    if (lErr) throw new Error(`Erro ao inserir linhas ${tipo}: ${lErr.message}`)

    ok(`${tipo}: ${linhas.length} linhas inseridas`)
    totalEscalaLinhas += linhas.length
  }

  info(`Total escala_linhas: ${totalEscalaLinhas}`)

  // ── PASSO 3: Upload e parse do Unitrac ───────────────────────────────────
  sep('Fazendo upload e parse do Unitrac DIA14')

  const unitracBuf = readFileSync(path.join(BASE_UNITRAC, 'relatorio_unitrac_9086_DIA14.xlsx'))
  const veiculos = await parseUnitrac(unitracBuf)

  const veiculosComParadas = veiculos.filter(v => v.paradas.length > 0)
  info(`${veiculosComParadas.length} veículos com paradas (de ${veiculos.length} total)`)

  const unitracParadaRows = veiculosComParadas.flatMap(v =>
    v.paradas.map(p => ({
      placa_norm: p.placa_norm,
      chegada: p.chegada.toISOString(),
      saida: p.saida?.toISOString() ?? null,
      duracao_seg: p.duracao_seg,
      distancia_km: p.distancia_km,
      endereco: p.endereco,
      lat: p.lat,
      lng: p.lng,
      local_parada: p.local_parada,
      codigo_loja: p.codigo_loja,
      nome_loja: p.nome_loja,
      classificacao: p.classificacao,
      ordem: p.ordem,
    }))
  )

  const { data: unitracUpload, error: uuErr } = await svc.from('unitrac_uploads').insert({
    data_relatorio: DATA,
    arquivo_path: `${DATA}/relatorio_unitrac_9086_DIA14.xlsx`,
    qtd_abas: veiculosComParadas.length,
    qtd_paradas: unitracParadaRows.length,
    status: 'processado',
    uploaded_by: FAKE_USER_ID,
    processado_em: new Date().toISOString(),
  }).select('id').single()

  if (uuErr || !unitracUpload) throw new Error(`Erro ao inserir unitrac upload: ${uuErr?.message}`)

  const paradaRows = unitracParadaRows.map(p => ({ ...p, unitrac_upload_id: unitracUpload.id }))

  const BATCH = 500
  for (let i = 0; i < paradaRows.length; i += BATCH) {
    const { error: pErr } = await svc.from('unitrac_paradas').insert(paradaRows.slice(i, i + BATCH))
    if (pErr) throw new Error(`Erro ao inserir paradas: ${pErr.message}`)
  }
  ok(`${paradaRows.length} paradas inseridas`)

  // ── PASSO 4: Processar KPI (cruzamento + anomalias) ──────────────────────
  sep('Processando KPI')

  // Buscar dados do DB (como o route faz)
  const { data: escalaLinhas } = await svc.from('escala_linhas')
    .select('id, rede_id, placa_norm, loja_nome_raw, loja_codigo_raw, motorista_nome, carro_ordem, data_entrega')
    .eq('data_entrega', DATA)

  const placas = [...new Set((escalaLinhas ?? []).filter(l => l.placa_norm).map(l => l.placa_norm as string))]

  const { data: paradaRows2 } = await svc.from('unitrac_paradas')
    .select(`id, placa_norm, chegada, saida, duracao_seg, distancia_km, endereco, lat, lng, local_parada, codigo_loja, nome_loja, classificacao, loja_id, ordem, unitrac_uploads!inner(data_relatorio)`)
    .eq('unitrac_uploads.data_relatorio', DATA)
    .in('placa_norm', placas.length > 0 ? placas : ['__nenhuma__'])

  const { data: lojas } = await svc.from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)

  const { data: redes } = await svc.from('redes').select('id, nome, janela_inicio, janela_fim')

  const janelasRede = new Map(
    (redes ?? []).filter(r => r.janela_inicio && r.janela_fim)
      .map(r => [r.id as string, { janela_inicio: r.janela_inicio as string, janela_fim: r.janela_fim as string }])
  )

  info(`escala_linhas: ${(escalaLinhas ?? []).length}`)
  info(`unitrac_paradas: ${(paradaRows2 ?? []).length}`)
  info(`lojas: ${(lojas ?? []).length}`)

  const redeIds = [...new Set((escalaLinhas ?? []).filter(l => l.rede_id).map(l => l.rede_id as string))]
  info(`Redes a processar: ${redeIds.join(', ')}`)

  let totalAnomalias = { HIGH: 0, MEDIUM: 0, LOW: 0 }
  const kpiSummary: { rede_id: string; kpi_id: string; qtd_rotas: number; qtd_anomalias: number }[] = []

  for (const rid of redeIds) {
    const linhasRede = (escalaLinhas ?? []).filter(l => l.rede_id === rid)
    const placasRede = new Set(linhasRede.filter(l => l.placa_norm).map(l => l.placa_norm as string))
    const paradasRede = (paradaRows2 ?? []).filter(p => placasRede.has(p.placa_norm as string))

    const rotas = cruzaEscalaUnitrac(
      linhasRede,
      paradasRede,
      (lojas ?? []).filter(l => l.rede_id === rid) as Parameters<typeof cruzaEscalaUnitrac>[2]
    )

    const paradasIndex = new Map<string, Array<{id: string; classificacao: string; chegada: Date; saida: Date | null; duracao_seg: number | null; lat: number | null; lng: number | null}>>()
    for (const p of paradasRede) {
      const list = paradasIndex.get(p.placa_norm as string) ?? []
      list.push({ id: p.id as string, classificacao: p.classificacao as string, chegada: new Date(p.chegada as string), saida: p.saida ? new Date(p.saida as string) : null, duracao_seg: p.duracao_seg as number | null, lat: p.lat as number | null, lng: p.lng as number | null })
      paradasIndex.set(p.placa_norm as string, list)
    }

    const anomalias = detectaAnomalias({ rotas, escalaLinhas: linhasRede, paradasIndex, janelasRede, data: DATA })

    // Inserir KPI
    const kpiPayload = {
      data: DATA,
      rede_id: rid,
      status: 'rascunho',
      qtd_linhas: rotas.length,
      qtd_anomalias_high: anomalias.filter(a => a.severidade === 'HIGH').length,
      qtd_anomalias_medium: anomalias.filter(a => a.severidade === 'MEDIUM').length,
      qtd_anomalias_low: anomalias.filter(a => a.severidade === 'LOW').length,
      gerada_em: new Date().toISOString(),
      gerada_por: FAKE_USER_ID,
    }

    const { data: kpiNew, error: kpiErr } = await svc.from('kpis').insert(kpiPayload).select('id').single()
    if (kpiErr || !kpiNew) throw new Error(`Erro ao criar KPI ${rid}: ${kpiErr?.message}`)

    const kpiId = kpiNew.id as string

    // Inserir kpi_rotas
    const rotaRows = rotas.map(r => ({
      escala_linha_id: r.escala_linha_id,
      data: r.data,
      rede_id: r.rede_id,
      placa_norm: r.placa_norm,
      saida_cd: r.saida_cd?.toISOString() ?? null,
      paradas_json: r.paradas.map(p => ({ parada_id: p.parada_id, loja_id: p.loja_id, nome: p.nome, chegada: p.chegada.toISOString(), saida: p.saida.toISOString(), duracao_min: p.duracao_min, classificacao: p.classificacao })),
      anomalias_codigos: [],
      status: r.status,
    }))

    if (rotaRows.length > 0) {
      const { error: rErr } = await svc.from('kpi_rotas').insert(rotaRows)
      if (rErr) throw new Error(`Erro ao inserir kpi_rotas ${rid}: ${rErr.message}`)
    }

    // Re-fetch kpi_rota ids para anomalias
    const { data: rotasDb } = await svc.from('kpi_rotas').select('id, escala_linha_id').in('escala_linha_id', rotas.map(r => r.escala_linha_id))
    const rotaIdByEscalaLinhaId = new Map((rotasDb ?? []).map(r => [r.escala_linha_id as string, r.id as string]))

    // Deletar anomalias antigas
    const kpiRotaIds = [...rotaIdByEscalaLinhaId.values()]
    if (kpiRotaIds.length > 0) {
      await svc.from('anomalias').delete().in('kpi_rota_id', kpiRotaIds)
    }

    // Inserir anomalias
    if (anomalias.length > 0) {
      const anomaliaRows = anomalias.map(a => ({
        data: a.data,
        kpi_rota_id: a.kpi_rota_id ? rotaIdByEscalaLinhaId.get(a.kpi_rota_id) ?? null : null,
        parada_id: a.parada_id,
        codigo: a.codigo,
        severidade: a.severidade,
        descricao: a.descricao,
        sugestao: a.sugestao,
        payload_json: a.payload,
        status: 'pendente',
      }))

      const { error: aErr } = await svc.from('anomalias').insert(anomaliaRows)
      if (aErr) throw new Error(`Erro ao inserir anomalias ${rid}: ${aErr.message}`)

      // Escrever anomalias_codigos de volta em kpi_rotas
      const codigosByRotaId = new Map<string, string[]>()
      for (const a of anomalias) {
        const rotaId = a.kpi_rota_id ? rotaIdByEscalaLinhaId.get(a.kpi_rota_id) ?? null : null
        if (!rotaId) continue
        const list = codigosByRotaId.get(rotaId) ?? []
        list.push(a.codigo)
        codigosByRotaId.set(rotaId, list)
      }
      for (const [rotaId, codigos] of codigosByRotaId) {
        await svc.from('kpi_rotas').update({ anomalias_codigos: codigos }).eq('id', rotaId)
      }
    }

    totalAnomalias.HIGH += anomalias.filter(a => a.severidade === 'HIGH').length
    totalAnomalias.MEDIUM += anomalias.filter(a => a.severidade === 'MEDIUM').length
    totalAnomalias.LOW += anomalias.filter(a => a.severidade === 'LOW').length
    kpiSummary.push({ rede_id: rid, kpi_id: kpiId, qtd_rotas: rotas.length, qtd_anomalias: anomalias.length })

    process.stdout.write(`  ✓ ${rid}: ${rotas.length} rotas, ${anomalias.length} anomalias (kpi=${kpiId.substring(0,8)})\n`)
  }

  // ── PASSO 5: Gerar XLSX para PRINCESA ────────────────────────────────────
  sep('Gerando XLSX — PRINCESA')

  const princesaKpi = kpiSummary.find(k => k.rede_id === 'PRINCESA')
  if (!princesaKpi) {
    info('KPI PRINCESA não encontrado')
  } else {
    const { data: rotasKpi, error: rotasErr } = await svc.from('kpi_rotas')
      .select('id, escala_linha_id, placa_norm, saida_cd, paradas_json, anomalias_codigos, escala_linhas(motorista_nome, loja_nome_raw, carro_ordem)')
      .eq('data', DATA).eq('rede_id', 'PRINCESA')
    if (rotasErr) throw new Error(`Erro ao buscar kpi_rotas PRINCESA: ${rotasErr.message}`)

    type ParadaJson = { loja_id: string | null; nome: string; chegada: string; saida: string; duracao_min: number; classificacao: string }

    const linhas = (rotasKpi ?? []).map((rota, idx) => {
      const escala = rota.escala_linhas as { motorista_nome?: string | null; loja_nome_raw?: string; carro_ordem?: number } | null
      const paradas = (rota.paradas_json ?? []) as ParadaJson[]
      const carroOrdem = (escala?.carro_ordem ?? 1) as 1 | 2
      const p1 = paradas[0] ?? null
      return {
        kpi_id: princesaKpi.kpi_id,
        escala_linha_id: rota.escala_linha_id as string,
        ordem: idx + 1,
        loja_nome: escala?.loja_nome_raw ?? '',
        motorista: escala?.motorista_nome ?? null,
        placa: rota.placa_norm as string | null,
        carro_ordem: carroOrdem,
        saida_cd: rota.saida_cd ? new Date(rota.saida_cd as string) : null,
        chd_loja_1: p1 ? new Date(p1.chegada) : null,
        saida_loja_1: p1 ? new Date(p1.saida) : null,
        tempo_loja_1_min: p1?.duracao_min ?? null,
        chd_loja_2: paradas[1] ? new Date(paradas[1].chegada) : null,
        saida_loja_2: paradas[1] ? new Date(paradas[1].saida) : null,
        tempo_loja_2_min: paradas[1]?.duracao_min ?? null,
        chd_loja_3: paradas[2] ? new Date(paradas[2].chegada) : null,
        saida_loja_3: paradas[2] ? new Date(paradas[2].saida) : null,
        tempo_loja_3_min: paradas[2]?.duracao_min ?? null,
        observacao: null,
        anomalias_codigos: (rota.anomalias_codigos as string[] | null) ?? [],
      }
    })

    info(`Linhas para XLSX: ${linhas.length}`)

    const xlsxBuf = await gerarKpi({
      rede_id: 'PRINCESA',
      data: DATA,
      linhas,
    })

    const outPath = path.join('scripts', `KPI_PRINCESA_${DATA}.xlsx`)
    writeFileSync(outPath, xlsxBuf)
    ok(`XLSX gerado: ${outPath} (${Math.round(xlsxBuf.length / 1024)}KB)`)
  }

  // ── RESUMO FINAL ─────────────────────────────────────────────────────────
  sep('RESUMO FINAL')
  console.log(`Data processada: ${DATA}`)
  console.log(`KPIs criados: ${kpiSummary.length}`)
  console.log(`Anomalias: HIGH=${totalAnomalias.HIGH} MEDIUM=${totalAnomalias.MEDIUM} LOW=${totalAnomalias.LOW}`)
  console.log('')
  kpiSummary.sort((a, b) => b.qtd_rotas - a.qtd_rotas).forEach(k =>
    console.log(`  ${k.rede_id.padEnd(20)} rotas=${k.qtd_rotas} anomalias=${k.qtd_anomalias}`)
  )

  // Verificar anomalias_codigos populados
  const { data: rotasComCodigos } = await svc.from('kpi_rotas')
    .select('placa_norm, anomalias_codigos')
    .eq('data', DATA)
    .neq('anomalias_codigos', '{}')

  console.log(`\nkpi_rotas com anomalias_codigos preenchidos: ${(rotasComCodigos ?? []).length}`)
  ;(rotasComCodigos ?? []).slice(0, 5).forEach(r =>
    console.log(`  ${r.placa_norm}: ${JSON.stringify(r.anomalias_codigos)}`)
  )

  console.log('\n✅ Processamento completo!\n')
})().catch(e => { console.error('\n❌ ERRO:', e.message); console.error(e.stack?.split('\n').slice(0,8).join('\n')); process.exit(1) })
