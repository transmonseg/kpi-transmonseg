// F4-07 (GEO-24, D-08): grava e desfaz a correção do ponto do cliente.
// Grava kpi_cliente_local com fonte 'manual' (o aprendizado noturno nunca
// troca manual) e uma linha de trilha em kpi_cliente_local_correcao com o
// estado anterior (o "backup" das guardas do aplicarCadastroNoturno),
// responsável, evidência e anexo. Sem a trilha (migration não aplicada) nada
// é gravado. O repositório é injetado: o de produção está em
// ponto-cliente-servico.ts.
import { CLIENTE_PONTO, decidirCorrecao, type AcaoPonto, type PainelPonto, type PedidoPonto } from './ponto-cliente'

export type LinhaLocal = {
  empresa: string
  cliente_codigo: string
  cliente_nome: string | null
  lat: number
  lng: number
  raio_m: number | null
  fonte: 'manual' | 'entrega_confirmada' | 'parada_orfa'
  confirmacoes: number
  endereco_ref: string | null
  observacao: string | null
  atualizado_em: string
}

export type CorrecaoPonto = {
  id: number
  empresa: string
  cliente_codigo: string
  acao: AcaoPonto
  lat: number
  lng: number
  endereco_ref: string | null
  evidencia: Record<string, unknown>
  documento: string | null
  observacao: string | null
  responsavel: string
  anterior: LinhaLocal | null
  criado_em: string
  desfeita_em: string | null
  desfeita_por: string | null
}
export type NovaCorrecao = Omit<CorrecaoPonto, 'id' | 'criado_em' | 'desfeita_em' | 'desfeita_por'>

/** A tabela da trilha ainda não existe (migration pendente): correção desligada. */
export class TrilhaIndisponivel extends Error {
  constructor() { super('trilha de correções de ponto indisponível (migration kpi_cliente_local_correcao não aplicada)') }
}

export type RepoPonto = {
  lerLocal(codigo: string): Promise<LinhaLocal | null>
  gravarLocal(linha: LinhaLocal): Promise<void>
  apagarLocal(codigo: string): Promise<void>
  inserirCorrecao(c: NovaCorrecao): Promise<CorrecaoPonto>
  lerCorrecao(id: number): Promise<CorrecaoPonto | null>
  marcarDesfeita(id: number, por: string): Promise<void>
}

type Quem = { email: string; admin: boolean }
const OBS_MAX = 500

export async function aplicarCorrecaoPonto(
  repo: RepoPonto, painel: PainelPonto, pedido: PedidoPonto, quem: Quem & { documento: string | null }, agoraIso = new Date().toISOString(),
): Promise<{ ok: true; correcao: CorrecaoPonto } | { ok: false; status: number; erro: string }> {
  const d = decidirCorrecao(painel, pedido, { admin: quem.admin, temAnexo: !!quem.documento })
  if (!d.ok) return d
  const anterior = await repo.lerLocal(painel.codigo)
  const observacao = (pedido.observacao ?? '').trim().slice(0, OBS_MAX) || null
  const correcao = await repo.inserirCorrecao({
    empresa: CLIENTE_PONTO, cliente_codigo: painel.codigo, acao: pedido.acao, lat: d.lat, lng: d.lng,
    endereco_ref: painel.endereco || null, evidencia: d.evidencia, documento: quem.documento, observacao,
    responsavel: quem.email, anterior,
  })
  const linha: LinhaLocal = {
    empresa: CLIENTE_PONTO, cliente_codigo: painel.codigo, cliente_nome: painel.nome || anterior?.cliente_nome || null,
    lat: d.lat, lng: d.lng, raio_m: d.raioM, fonte: 'manual', confirmacoes: Math.max(1, d.confirmacoes),
    endereco_ref: painel.endereco || anterior?.endereco_ref || null,
    observacao: `corrigido na tela (F4-07, correção ${correcao.id}) por ${quem.email} em ${agoraIso.slice(0, 10)}: ${d.resumo}${observacao ? ` -- ${observacao}` : ''}`.slice(0, 1000),
    atualizado_em: agoraIso,
  }
  try {
    await repo.gravarLocal(linha)
  } catch (e) {
    try { await repo.marcarDesfeita(correcao.id, 'sistema: gravação do ponto falhou') } catch { /* a trilha fica aberta; o ponto não mudou */ }
    throw e
  }
  return { ok: true, correcao }
}

const MESMO = (a: number, b: number) => Math.abs(a - b) < 1e-7

export async function desfazerCorrecaoPonto(
  repo: RepoPonto, codigo: string, id: number, quem: Quem,
): Promise<{ ok: true } | { ok: false; status: number; erro: string }> {
  const c = await repo.lerCorrecao(id)
  if (!c || c.cliente_codigo !== codigo || c.empresa !== CLIENTE_PONTO) return { ok: false, status: 404, erro: 'Correção não encontrada.' }
  if (c.desfeita_em) return { ok: false, status: 409, erro: 'Esta correção já foi desfeita.' }
  const atual = await repo.lerLocal(codigo)
  // Só desfaz se o ponto ainda é o que esta correção gravou (senão outra
  // correção veio depois e desfazer esta apagaria aquela).
  if (!atual || atual.fonte !== 'manual' || !MESMO(atual.lat, c.lat) || !MESMO(atual.lng, c.lng)) {
    return { ok: false, status: 409, erro: 'O ponto mudou depois desta correção. Desfaça a mais recente primeiro.' }
  }
  if (c.anterior) await repo.gravarLocal(c.anterior)
  else await repo.apagarLocal(codigo)
  await repo.marcarDesfeita(id, quem.email)
  return { ok: true }
}
