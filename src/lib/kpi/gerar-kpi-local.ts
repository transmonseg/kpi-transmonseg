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
  resolverLojaEsperada,
  lojaNomeDivergeDaEscala,
  type LojaRow,
} from '@/lib/kpi/matcher'
import { aplicarAlteracoes, type AltConfirmada } from '@/lib/kpi/aplicar-alteracoes'
import { gerarKpi, type LinhaParaKpi } from '@/lib/kpi/gerador-kpi'
import { textoSugestaoTroca } from './sugestao-troca'
import { gerarKpiPdf } from '@/lib/kpi/gerador-pdf'
import { REDE_NOMES_CANONICOS } from '@/lib/kpi/kpi-styles'
import { derivarStatus, type StatusRota, type CategoriaRevisao, type NaturezaRevisao } from '@/lib/kpi/status-rota'
import { haversine } from '@/lib/utils/geo'
import type { KpiLinha, RotaKpi } from '@/lib/types/kpi'
import type { LinhaEscala } from '@/lib/types/escala'
import type { ResumoVeiculo } from '@/lib/types/unitrac'

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
      : rota.placa_sugerida
        ? textoSugestaoTroca(rota.placa_sugerida, rota.sugestao_confianca ?? 'baixa', rota.sugestao_hora ?? null)
        : null,
    sugestao_troca_alta: rota.sugestao_confianca === 'alta',
    anomalias_codigos: rota.anomalias_codigos,
    motorista_codigo: escala.motorista_codigo,
    rota_status: rota.status,
  }
}

/** Maior timestamp de parada do relatório = horizonte/corte (quando foi emitido). */
function corteRelatorioMs(veiculos: ResumoVeiculo[]): number {
  let max = 0
  for (const v of veiculos) for (const p of v.paradas) {
    const t = p.saida instanceof Date ? p.saida.getTime() : 0
    if (t > max) max = t
  }
  return max
}

/**
 * Saída de base de um caminhão que estava EM ROTA quando o relatório cortou.
 * Caso KOP-4978 (09/06): o caminhão deixou a base e estava dirigindo (sem parada
 * nova porque ainda não chegou). Retorna a saída da ÚLTIMA parada BASE ou null.
 *
 * Robustez (incidente dia 15): pega a última BASE mesmo que DEPOIS dela venham
 * blips FAKE_EXIT (ruído de GPS perto da base) ou trechos FORA_BASE "em rota" — o
 * relatório só cortou no meio do caminho, a saída de base continua sendo fato.
 * Antes exigia que a última parada fosse BASE, e o merge da API (parada em rota
 * depois da saída) zerava a saída → "saída em branco" que a cliente reclamou.
 * Conservador: se houve ENTREGA (LOJA) depois da base, NÃO é "em rota a partir da
 * base" → null. Nunca conclui entrega; só expõe a saída que comprovadamente houve.
 */
export function saidaBaseSeEmRota(
  paradas: ReadonlyArray<{ classificacao: string; chegada: Date; saida: Date | null }> | undefined,
  corteMs: number,
): Date | null {
  if (!paradas || paradas.length === 0) return null
  const ord = [...paradas].sort((a, b) => a.chegada.getTime() - b.chegada.getTime())
  // Saída de base da viagem PENDENTE (mesma regra de saidaBaseConhecida): quando há
  // duas viagens no dia, pega a PARTIDA da 1ª, não a 2ª. Incidente KNC-1I34 (20/06):
  // a saída oscilava entre 05:26 (de manhã, 1 viagem) e 11:15 (à tarde, 2ª partida)
  // conforme o relatório avançava — fonte da inconsistência que a cliente reportou.
  const saida = saidaBaseConhecida(ord)
  if (!saida) return null // nunca saiu pra rota / nunca parou na base → não afirma saída
  // Guard de corte (KOP-4978): se a saída coincide com o corte (<15min) e NÃO há
  // parada de rota depois dela, pode ser só o último ping na base (ainda não partiu).
  const saiuDepois = ord.some(p =>
    (p.classificacao === 'FORA_BASE' || p.classificacao === 'LOJA') && p.chegada.getTime() > saida.getTime())
  if (!saiuDepois && corteMs - saida.getTime() < 15 * 60_000) return null
  return saida
}

/**
 * Saída de base CONHECIDA pra exibição de linha "em rota" (sem entrega reconhecida).
 *
 * Regra: a saída que importa é a PARTIDA da primeira "viagem" do dia que NÃO terminou
 * em entrega reconhecida (LOJA). Uma viagem é a saída da última BASE de um bloco
 * seguida de um trecho de rota (FORA_BASE/LOJA) até voltar à base; FAKE_EXIT (blips de
 * GPS junto à base) é ruído e não conta. Casos reais que essa regra cobre:
 *  - FHO-5F88: a 1ª viagem entregou (LOJA) e o caminhão saiu de novo → a saída em-rota
 *    é a 2ª partida (a 1ª já está "resolvida").
 *  - KNC-1I34 (20/06): a 1ª viagem foi à loja mas ela não foi reconhecida (virou
 *    FORA_BASE), o caminhão voltou e saiu de novo à tarde → a saída da linha (entrega
 *    da manhã) é a PARTIDA da manhã (05:26), não a 2ª saída (11:15).
 *  - UBO-5E05 (20/06): voltou no fim do dia e o relatório cortou em cima da volta → a
 *    1ª viagem (sem loja) ganha, então usa a partida (02:56), não a volta.
 * A última base sem rota depois (em rota AGORA, ainda não chegou) conta como partida
 * da viagem corrente — caso original KOP-4978. `corteMs` não é mais necessário (a
 * regra é estrutural); mantido na assinatura por compatibilidade dos chamadores.
 */
export function saidaBaseConhecida(
  paradas: ReadonlyArray<{ classificacao: string; chegada: Date; saida: Date | null }>,
  _corteMs?: number,
): Date | null {
  if (paradas.length === 0) return null
  const ord = [...paradas].sort((a, b) => a.chegada.getTime() - b.chegada.getTime())
  const ehRota = (c: string) => c === 'FORA_BASE' || c === 'LOJA'
  if (!ord.some(p => ehRota(p.classificacao))) return null // nunca saiu pra rota → não operou

  let ultimaPartida: Date | null = null
  let i = 0
  while (i < ord.length) {
    if (ord[i].classificacao !== 'BASE') { i++; continue }
    // última BASE consecutiva do bloco — a saída dela é a partida candidata.
    let j = i
    while (j + 1 < ord.length && ord[j + 1].classificacao === 'BASE') j++
    const partida = ord[j].saida ?? ord[j].chegada
    // o que vem depois da base, pulando blips FAKE_EXIT?
    let k = j + 1
    while (k < ord.length && ord[k].classificacao === 'FAKE_EXIT') k++
    if (k < ord.length && ehRota(ord[k].classificacao)) {
      ultimaPartida = partida
      // a viagem vai até voltar à base; teve entrega reconhecida (LOJA)?
      let m = k, temLoja = false
      while (m < ord.length && ord[m].classificacao !== 'BASE') {
        if (ord[m].classificacao === 'LOJA') temLoja = true
        m++
      }
      if (!temLoja) return partida // 1ª viagem pendente → essa é a saída de base
      i = m // entregou: pula pro próximo bloco de base
      continue
    }
    // base sem rota depois: se não há mais rota em lugar nenhum, é a última base —
    // o caminhão está em rota AGORA a partir dela (viagem corrente sem loja). FHO/KOP.
    if (!ord.slice(j + 1).some(p => ehRota(p.classificacao))) return partida
    i = j + 1
  }
  return ultimaPartida
}

/** Marca a linha como "relatório parcial" quando a placa estava em rota no corte e
 *  esta linha não teve entrega. Só dispara se o relatório acabou ANTES da janela da
 *  rede (relatorioCedo) — evita falso-positivo em relatório de fim de dia. */
function aplicarParcial(
  linha: LinhaParaKpi, rota: RotaKpi,
  paradasPorPlaca: Map<string, ResumoVeiculo['paradas']>,
  relatorioCedo: boolean, corteMs: number,
): void {
  if (!relatorioCedo) return
  if (rota.paradas.some(p => p.loja_id != null)) return // teve entrega → não é parcial
  const saida = saidaBaseSeEmRota(paradasPorPlaca.get(rota.placa_norm ?? ''), corteMs)
  if (!saida) return
  linha.relatorio_parcial = true
  linha.saida_base_parcial = saida
  linha.saida_cd = saida // saída de base é fato — alimenta PDF e contagem de GPS
  const hhmm = `${String(saida.getUTCHours()).padStart(2, '0')}:${String(saida.getUTCMinutes()).padStart(2, '0')}`
  linha.observacao = [linha.observacao, `Relatório parcial — saiu da base ${hhmm}, ainda em rota no corte.`].filter(Boolean).join(' ')
}

type RedeGrupo = { rotas: RotaKpi[]; escala: LinhaEscala[] }
type Pipeline = {
  data: string
  veiculos: ResumoVeiculo[]
  redeMap: Map<string, RedeGrupo>
  lojas: LojaRow[]
}

/**
 * Pipeline compartilhado (parse escala/Unitrac → matcher → agrupa por rede).
 * É o miolo comum de `gerarKpiLocal` e `gerarKpiLocalComPreview` — sem Supabase,
 * usando o snapshot do cadastro. Geo: `setSemGeo(true)` (decisão de produção); o
 * resgate geo restrito à escala (≤500m) roda dentro do matcher.
 */
async function prepararPipeline(opts: GerarKpiLocalOpts): Promise<Pipeline> {
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
  const veiculosMap = new Map<string, ResumoVeiculo>()
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
  const redeMap = new Map<string, RedeGrupo>()
  for (const rota of rotas) {
    const escala = escalaMap.get(rota.escala_linha_id)
    if (!escala) continue
    const rede_id = escala.rede_id
    if (!redeMap.has(rede_id)) redeMap.set(rede_id, { rotas: [], escala: [] })
    redeMap.get(rede_id)!.rotas.push(rota)
    redeMap.get(rede_id)!.escala.push(escala)
  }

  return { data, veiculos, redeMap, lojas: cadastro.lojas }
}

/**
 * Gera os KPIs (XLSX + PDF, com e sem "Chegada CD") por rede, offline.
 *
 * Replica o miolo da rota `kpi/simples` SEM: Supabase, preview, lineEdits,
 * detecção de anomalia extra e persistência.
 */
export async function gerarKpiLocal(opts: GerarKpiLocalOpts): Promise<SaidaRede[]> {
  const { data, veiculos, redeMap } = await prepararPipeline(opts)

  // Corte do relatório + paradas por placa (pra detectar "relatório parcial").
  const corteMs = corteRelatorioMs(veiculos)
  const corteHora = corteMs ? new Date(corteMs).getUTCHours() + new Date(corteMs).getUTCMinutes() / 60 : 24
  const paradasPorPlaca = new Map<string, ResumoVeiculo['paradas']>()
  for (const v of veiculos) paradasPorPlaca.set(v.placa_norm, v.paradas)

  // Por rede: rotaToLinha → linhas → gera XLSX + PDF (com e sem Chegada CD).
  const saidas: SaidaRede[] = []
  for (const [rede_id, grupo] of redeMap.entries()) {
    const rede_nome = REDE_NOMES_CANONICOS[rede_id] ?? rede_id
    const relatorioCedo = corteHora < (JANELA_FIM[rede_id] ?? 12)
    const linhas = grupo.rotas.map((rota, idx) => {
      const linha = rotaToLinha(rota, grupo.escala[idx], idx + 1)
      aplicarParcial(linha, rota, paradasPorPlaca, relatorioCedo, corteMs)
      return linha
    })

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

// ─── Variante COM preview (pro app desktop renderizar a tela igual ao site) ────

/** Linha do preview — espelha o contrato que a tela `painel/kpi/simples` consome. */
export type PreviewLinhaLocal = {
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
  geo_dist_metros?: number | null
  anomalias: string[]
  status: StatusRota
  revisar: boolean
  motivoRevisao: string | null
  categoria: CategoriaRevisao | null
  natureza: NaturezaRevisao | null
  saida_loja_fmt: string | null
}

export type SaidaRedeComPreview = SaidaRede & {
  qtd_sem_gps: number
  avisoParcial: string | null
  preview: PreviewLinhaLocal[]
}

// Parsers guardam BRT como Date.UTC(...) — ler getUTCHours direto (convenção do sistema).
function fmtHoraBRT(d: Date | null | undefined): string | null {
  if (!d) return null
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** Hora de fim da janela de entrega por rede (informada pela operação). Usada pra
 *  saber se o relatório foi gerado ANTES das entregas (parcial). Exportada e reusada
 *  pelo route da web pra os dois caminhos não divergirem. */
export const JANELA_FIM: Record<string, number> = {
  PREZUNIC: 12, CARREFOUR: 12, PRINCESA: 12, ASSAI: 12, SUPERPRIX: 12, ATACADAO: 12,
  GUANABARA: 15, SUPER_PAX: 17, FEIRA_NOVA: 17, EMANUEL: 17, ARMAZEM_GRAO: 18, ZONA_SUL: 23,
}

/**
 * Igual a `gerarKpiLocal`, mas também devolve o preview por linha (status,
 * horários, avisos) — pra o app desktop renderizar a MESMA tela do site offline.
 *
 * O preview reusa `derivarStatus` (mesma regra do site). Os mapas auxiliares
 * (rastreada, foi-a-algum-lugar, entregou-própria-escala, redes-por-placa) são
 * derivados do próprio relatório/escala offline. Casos raros que no site dependem
 * de sinais extras (rastreador travado, placa-typo no Unitrac) caem no default
 * seguro — o status fica correto para a grande maioria das linhas.
 */
export async function gerarKpiLocalComPreview(opts: GerarKpiLocalOpts): Promise<SaidaRedeComPreview[]> {
  const { data, veiculos, redeMap, lojas } = await prepararPipeline(opts)

  // Mapas auxiliares derivados do relatório/escala (espelham os do route).
  const rastreadas = new Set(veiculos.map(v => v.placa_norm))
  const paradasPorPlaca = new Map<string, ResumoVeiculo['paradas']>()
  for (const v of veiculos) paradasPorPlaca.set(v.placa_norm, v.paradas)
  const foiAlgumLugar = (placa: string | null) => {
    const ps = placa ? paradasPorPlaca.get(placa) : null
    return !!ps && ps.some(p => p.classificacao === 'LOJA' || p.classificacao === 'FORA_BASE')
  }
  // Placas que entregaram ≥1 loja (parada com loja_id) em qualquer rota da escala.
  const placasComEntrega = new Set<string>()
  const redesPorPlaca = new Map<string, Set<string>>()
  let reportMaxHora = 0
  for (const v of veiculos) {
    for (const p of v.paradas) {
      const arr = [p.chegada, p.saida].filter(Boolean) as Date[]
      for (const d of arr) reportMaxHora = Math.max(reportMaxHora, d.getUTCHours() + d.getUTCMinutes() / 60)
    }
  }
  const corteMs = corteRelatorioMs(veiculos)
  for (const [rede_id, grupo] of redeMap.entries()) {
    grupo.rotas.forEach((rota, i) => {
      const placa = rota.placa_norm
      if (placa) {
        if (!redesPorPlaca.has(placa)) redesPorPlaca.set(placa, new Set())
        redesPorPlaca.get(placa)!.add(grupo.escala[i].rede_id ?? rede_id)
        if (rota.paradas.some(p => p.loja_id != null)) placasComEntrega.add(placa)
      }
    })
  }
  const lojaById = new Map(lojas.map(l => [l.id, l]))

  const saidas: SaidaRedeComPreview[] = []
  for (const [rede_id, grupo] of redeMap.entries()) {
    const rede_nome = REDE_NOMES_CANONICOS[rede_id] ?? rede_id

    // Ordena igual ao site (loja, depois carro_ordem) pra a numeração bater.
    const sorted = grupo.rotas
      .map((rota, i) => ({ rota, esc: grupo.escala[i] }))
      .sort((a, b) => {
        const cmp = a.esc.loja_nome_raw.localeCompare(b.esc.loja_nome_raw, 'pt-BR')
        return cmp !== 0 ? cmp : a.esc.carro_ordem - b.esc.carro_ordem
      })

    const relatorioCedo = reportMaxHora < (JANELA_FIM[rede_id] ?? 12)
    const linhas = sorted.map(({ rota, esc }, idx) => {
      const linha = rotaToLinha(rota, esc, idx + 1)
      aplicarParcial(linha, rota, paradasPorPlaca, relatorioCedo, corteMs)
      return linha
    })
    const qtd_sem_gps = linhas.filter(l => !l.saida_cd && !l.chd_loja_1).length

    const preview: PreviewLinhaLocal[] = sorted.map(({ rota, esc }, idx) => {
      const p0 = rota.paradas[0]
      const temGps = rota.paradas.length > 0 || rastreadas.has(rota.placa_norm ?? '')
      const ficouNaBase = rota.status === 'sem_entrega' && !!esc.placa_norm

      // Avisos de loja (não mudam o match — explicam o motivo).
      const esperada = resolverLojaEsperada(esc, lojas)
      const temEntrega = rota.paradas.some(p => p.loja_id != null)
      const lojaSemCadastroUnitrac = !temEntrega &&
        (!esperada || esperada.codigo_unitrac == null || esperada.lat == null || esperada.lng == null)
      let lojaAmbiguaComGemea: { outra: string } | null = null
      if (!temEntrega && !lojaSemCadastroUnitrac && esperada && esperada.lat != null && esperada.lng != null) {
        const gemea = lojas.find(l =>
          l.id !== esperada.id && l.rede_id === esperada.rede_id &&
          l.lat != null && l.lng != null &&
          haversine(esperada.lat!, esperada.lng!, l.lat, l.lng) <= 120)
        if (gemea) lojaAmbiguaComGemea = { outra: gemea.nome }
      }
      let entregouLojaForaEscala: { lojaReal: string } | null = null
      const pLoja = rota.paradas.find(p => p.classificacao === 'LOJA' && p.loja_id)
      if (pLoja?.loja_id) {
        const lr = lojaById.get(pLoja.loja_id)
        if (lr && lojaNomeDivergeDaEscala(esc.loja_nome_raw, lr)) entregouLojaForaEscala = { lojaReal: lr.nome }
      }

      const saidaParcial = relatorioCedo && !temEntrega
        ? saidaBaseSeEmRota(paradasPorPlaca.get(rota.placa_norm ?? ''), corteMs)
        : null

      const statusInfo = derivarStatus({
        temGps,
        ficouNaBase,
        paradas: rota.paradas.map(p => ({ classificacao: p.classificacao, loja_id: p.loja_id ?? null })),
        viaGeo: rota._matchMeta?.algorithm === 'geo',
        viaTroca: rota._matchMeta?.algorithm === 'troca',
        placaReal: rota.placa_real ?? null,
        geoConfiavel: rota.geo_confiavel ?? false,
        placaFoiAlgumLugar: foiAlgumLugar(rota.placa_norm),
        placaSaiuDaBase: foiAlgumLugar(rota.placa_norm),
        placaEntregouPropriaEscala: placasComEntrega.has(rota.placa_norm ?? ''),
        lojaSemCadastroUnitrac,
        lojaAmbiguaComGemea,
        entregouLojaForaEscala,
        relatorioParcial: !!saidaParcial,
        saidaBaseParcial: saidaParcial ? fmtHoraBRT(saidaParcial) : null,
        sugestaoTrocaAlta: rota.sugestao_confianca === 'alta' && rota.placa_sugerida
          ? { placa: rota.placa_sugerida, hora: rota.sugestao_hora ?? null }
          : null,
      })

      const saidaLoja = p0 && p0.chegada && p0.duracao_min != null
        ? new Date(p0.chegada.getTime() + p0.duracao_min * 60_000)
        : null
      const placaDesatualizada = !!rota.placa_unitrac && !!rota.placa_norm && rota.placa_unitrac !== rota.placa_norm
      const notaDesatualizada = placaDesatualizada
        ? `Placa da escala (${rota.placa_norm}) desatualizada — no Unitrac é Mercosul (${rota.placa_unitrac}). Pedir atualização da escala.`
        : null
      const ehErro = statusInfo.status !== 'ENTREGUE' && statusInfo.status !== 'ENTREGUE_GEO'
      const outrasRedes = rota.placa_norm
        ? [...(redesPorPlaca.get(rota.placa_norm) ?? new Set<string>())].filter(r => r !== rede_id)
        : []
      const notaMultiEscala = ehErro && outrasRedes.length > 0 && placasComEntrega.has(rota.placa_norm ?? '')
        ? `Placa também escalada em ${outrasRedes.map(r => REDE_NOMES_CANONICOS[r] ?? r).join(', ')} e entregou lá — pode ser a 2ª rota do dia (não necessariamente erro).`
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
        saida_cd_fmt: fmtHoraBRT(rota.saida_cd) ?? (saidaParcial ? fmtHoraBRT(saidaParcial) : null),
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
      }
    })

    const [xlsx, xlsx_com_cd, pdf, pdf_com_cd] = await Promise.all([
      gerarKpi({ rede_id, data, linhas }),
      gerarKpi({ rede_id, data, linhas, comChegadaCd: true }),
      gerarKpiPdf({ rede_id, rede_nome, data, linhas: linhas as KpiLinha[] }),
      gerarKpiPdf({ rede_id, rede_nome, data, linhas: linhas as KpiLinha[], comChegadaCd: true }),
    ])

    // Aviso de relatório parcial (mesma heurística do site).
    const janelaFim = JANELA_FIM[rede_id] ?? 12
    const rastreados = preview.filter(p => p.tem_gps)
    const entregaram = rastreados.filter(p => p.chegada_loja_fmt)
    const avisoParcial = rastreados.length >= 3 && reportMaxHora < janelaFim && entregaram.length / rastreados.length < 0.2
      ? `Relatório parece parcial: só ${entregaram.length}/${rastreados.length} veículos rastreados com entrega e o relatório vai até ~${String(Math.floor(reportMaxHora)).padStart(2, '0')}h, mas as entregas desta rede vão até ${janelaFim}h. Gere de novo depois das entregas.`
      : null

    saidas.push({
      rede_id, rede_nome, xlsx, xlsx_com_cd, pdf, pdf_com_cd,
      linhas: linhas.length, qtd_sem_gps, avisoParcial, preview,
    })
  }

  return saidas
}
