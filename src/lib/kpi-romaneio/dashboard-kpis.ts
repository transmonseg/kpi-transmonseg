import { createServiceClient } from '@/lib/supabase/service'
import { BUCKET_KPI_ROMANEIO } from './xlsx-gerado'
import { extrairKpiCompleto, type NfResumo, type ResumoGeracao } from './resumo-dashboard'

// Dashboard por cliente (04/10/2026): só analisa o KPI que alguém INSERE
// (botão Inserir KPI), igual a Benassi. Um por cliente por dia; reinserir
// substitui. Tabela kpi_dashboard_kpis.

export const CLIENTES_DASH = ['nutrimax', 'rioquality', 'portefrio'] as const
export type ClienteDash = (typeof CLIENTES_DASH)[number]
export const clienteDashValido = (c: string): c is ClienteDash => (CLIENTES_DASH as readonly string[]).includes(c)

export type DiaKpi = {
  data: string
  resumo: ResumoGeracao
  arquivoNome: string | null
  inseridoPor: string | null
  inseridoEm: string
}

export async function listarDias(cliente: ClienteDash, de: string, ate: string): Promise<DiaKpi[]> {
  const svc = createServiceClient()
  const { data, error } = await svc
    .from('kpi_dashboard_kpis')
    .select('data, resumo, arquivo_nome, inserido_por, inserido_em')
    .eq('cliente', cliente)
    .gte('data', de)
    .lte('data', ate)
    .order('data', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => ({
    data: r.data, resumo: r.resumo as ResumoGeracao,
    arquivoNome: r.arquivo_nome, inseridoPor: r.inserido_por, inseridoEm: r.inserido_em,
  }))
}

export async function nfsDoDia(cliente: ClienteDash, data: string): Promise<NfResumo[]> {
  const svc = createServiceClient()
  const { data: row, error } = await svc
    .from('kpi_dashboard_kpis').select('nfs').eq('cliente', cliente).eq('data', data).maybeSingle()
  if (error) throw new Error(error.message)
  return (row?.nfs as NfResumo[] | undefined) ?? []
}

/** Histórico: todos os dias inseridos (sem o detalhe), mais recentes primeiro. */
export async function historico(cliente: ClienteDash): Promise<DiaKpi[]> {
  const svc = createServiceClient()
  const { data, error } = await svc
    .from('kpi_dashboard_kpis')
    .select('data, resumo, arquivo_nome, inserido_por, inserido_em')
    .eq('cliente', cliente)
    .order('data', { ascending: false })
    .limit(400)
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => ({
    data: r.data, resumo: r.resumo as ResumoGeracao,
    arquivoNome: r.arquivo_nome, inseridoPor: r.inserido_por, inseridoEm: r.inserido_em,
  }))
}

export type ResultadoInsercao =
  | { ok: true; data: string; taxa: number | null; nfs: number; cargas: number; substituiu: boolean }
  | { ok: false; erro: string }

/** Lê a planilha, grava o arquivo no Storage e o resumo + NFs no banco. A
 *  data vem da própria planilha; `dataInformada` só vale se ela não tiver. */
export async function inserirKpi(params: {
  cliente: ClienteDash
  arquivo: Buffer
  nomeArquivo: string
  inseridoPor: string | null
  dataInformada?: string | null
}): Promise<ResultadoInsercao> {
  let lido
  try {
    lido = await extrairKpiCompleto(params.arquivo)
  } catch {
    return { ok: false, erro: 'Não consegui ler o arquivo. Envie a planilha .xlsx do KPI gerado pelo sistema.' }
  }
  const data = lido.data ?? params.dataInformada ?? null
  if (!data) return { ok: false, erro: 'Não encontrei a data do KPI na planilha. Escolha a data e envie de novo.' }
  if (lido.resumo.cargas.length === 0 && lido.nfs.length === 0) {
    return { ok: false, erro: 'A planilha não tem cargas nem NFs. Confira se é o arquivo do KPI.' }
  }

  const svc = createServiceClient()
  const { data: existente } = await svc.from('kpi_dashboard_kpis').select('id').eq('cliente', params.cliente).eq('data', data).maybeSingle()
  const caminho = `dashboard/${params.cliente}/${data}-${crypto.randomUUID()}.xlsx`
  const up = await svc.storage.from(BUCKET_KPI_ROMANEIO).upload(caminho, params.arquivo, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const { error } = await svc.from('kpi_dashboard_kpis').upsert({
    cliente: params.cliente,
    data,
    resumo: lido.resumo,
    nfs: lido.nfs,
    arquivo_storage_path: up.error ? null : caminho,
    arquivo_nome: params.nomeArquivo,
    inserido_por: params.inseridoPor,
    inserido_em: new Date().toISOString(),
  }, { onConflict: 'cliente,data' })
  if (error) return { ok: false, erro: `Falha ao salvar: ${error.message}` }
  return { ok: true, data, taxa: lido.resumo.taxa, nfs: lido.nfs.length, cargas: lido.resumo.cargas.length, substituiu: !!existente }
}

export async function arquivoDoDia(cliente: ClienteDash, data: string): Promise<{ buf: Buffer; nome: string } | null> {
  const svc = createServiceClient()
  const { data: row } = await svc
    .from('kpi_dashboard_kpis').select('arquivo_storage_path, arquivo_nome').eq('cliente', cliente).eq('data', data).maybeSingle()
  if (!row?.arquivo_storage_path) return null
  const dl = await svc.storage.from(BUCKET_KPI_ROMANEIO).download(row.arquivo_storage_path)
  if (dl.error || !dl.data) return null
  return { buf: Buffer.from(await dl.data.arrayBuffer()), nome: row.arquivo_nome || `KPI-${cliente}-${data}.xlsx` }
}

export async function excluirDia(cliente: ClienteDash, data: string): Promise<void> {
  const svc = createServiceClient()
  const { error } = await svc.from('kpi_dashboard_kpis').delete().eq('cliente', cliente).eq('data', data)
  if (error) throw new Error(error.message)
}
