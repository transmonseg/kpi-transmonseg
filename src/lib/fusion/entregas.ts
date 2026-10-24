// src/lib/fusion/entregas.ts
import { fusionPost } from './client'
import type { RomaneioFusion, EntregaFusionRaw } from './tipos'
import { parseEntregasCompletasDeLinhas, type EntregaRioQualityCompleta } from '../kpi-rioquality/parse-planilhas'

type Grid<T> = { total: number | string; rows: T[] }
// Revisao Fase 2 (F2-REV-02): JSON 200 sem `rows` virava romaneio vazio
// (`g.rows ?? []`) e o romaneio sumia do dia em silencio. Agora e' erro.
function linhasDaGrade<T>(g: Grid<T> | null | undefined, path: string): T[] {
  if (!g || !Array.isArray(g.rows)) throw new Error(`Fusion: resposta sem rows em ${path}`)
  return g.rows
}

const PARAMS = (data: string) => ({ data_inicial: data, data_final: data, romaneio_id: '', carga_erp_id: '', pedidos_faturados: '0' })

export async function buscarRomaneiosDoDia(data: string): Promise<RomaneioFusion[]> {
  const path = '/php/dashboard/dashreentregas/get_grid_romaneios.php'
  return linhasDaGrade(await fusionPost<Grid<RomaneioFusion>>(path, PARAMS(data)), path)
}

export async function buscarEntregasDoRomaneio(romaneioId: string): Promise<EntregaFusionRaw[]> {
  const path = '/php/dashboard/dashreentregas/get_grid_entregas_realizadas.php'
  return linhasDaGrade(await fusionPost<Grid<EntregaFusionRaw>>(path, { romaneio_id: romaneioId }), `${path} (romaneio ${romaneioId})`)
}

export async function buscarEntregasDoDia(data: string) {
  const romaneios = await buscarRomaneiosDoDia(data)
  const entregas: EntregaFusionRaw[] = []
  for (const r of romaneios) entregas.push(...await buscarEntregasDoRomaneio(r.t10_id))
  return { romaneios, entregas }
}

// F4-09 (KRQ-02): "Relatório de Entregas" de 55 colunas -- o mesmo arquivo
// que a Érica exporta da Fusion e sobe à mão (NF real, Cod ERP Cliente,
// Bairro, Romaneio, Rota, check-in). Achado em 24/10 na tela "3.5. Gestão de
// Entregas" (track/gestaoentregas.html -> Relatórios -> Relatório de
// Entregas -> relatorioEntregasFlex -> relatorioBI em js/util/main.js): POST
// com o "json" do relatório em form-urlencoded aninhado (jQuery), resposta
// {success, data: {dados: [esquema, ...linhas]}}. dados[0] é o esquema do
// FlexMonster ({coluna: {type, caption}}), as linhas vêm como objetos com o
// nome da coluna. Filtro pela Data de Saída do dia: em 22/10 deu as mesmas
// 2.881 NFs da planilha da Érica, 100% com bairro. ~35 s e ~5 MB por dia
// cheio, uma requisição só (a grade faz 1 + uma por romaneio, ~110).
export const PATH_RELATORIO_ENTREGAS = '/php/relatorios_flex/gestaoentrega/relatorio_entregas-json.php'

/** Colunas sem as quais o relatório não serve (o formato mudou na Fusion). */
const COLUNAS_OBRIGATORIAS_55 = ['Nota Fiscal', 'Bairro', 'Placa', 'Endereço', 'Razão Social', 'Cidade', 'Numero Pedido ERP']

export function corpoRelatorioEntregas(data: string): Record<string, string> {
  const filtros: Record<string, string> = {
    dtPedido_ini: '', dtPedido_fin: '', dtFaturamento_ini: '', dtFaturamento_fin: '',
    dtSaida_ini: data, dtSaida_fin: data, praca: '', rota: '', filiais_ids: '', filial_expedicao_ids: '',
    ignoreCrossdocking: 'N',
  }
  const corpo: Record<string, string> = {
    'json[titulo]': 'Relatório de Entregas',
    'json[url]': 'gestaoentrega/relatorio_entregas-json.php',
    'json[t121_identificador]': PATH_RELATORIO_ENTREGAS,
    'json[options][type]': 'flat',
    'json[options][defautSort]': 'unsorted',
  }
  for (const [k, v] of Object.entries(filtros)) corpo[`json[filtros][${k}]`] = v
  return corpo
}

type RespostaRelatorio = { success?: boolean; message?: string; status?: string; data?: { dados?: unknown } }

/** Cabeçalho + linhas (formato de planilha) a partir da resposta do relatório. Lança se não for o relatório de 55 colunas. */
export function linhasDoRelatorioEntregas(r: RespostaRelatorio | null | undefined): unknown[][] {
  if (!r || r.success === false || r.status === 'error') throw new Error(`Fusion: relatório de entregas recusado (${r?.message ?? 'sem mensagem'})`)
  const dados = r.data?.dados
  if (!Array.isArray(dados) || dados.length === 0 || typeof dados[0] !== 'object' || dados[0] == null) {
    throw new Error('Fusion: relatório de entregas sem dados (formato inesperado)')
  }
  const cabecalho = Object.keys(dados[0] as Record<string, unknown>)
  const faltam = COLUNAS_OBRIGATORIAS_55.filter(c => !cabecalho.includes(c))
  if (faltam.length > 0) throw new Error(`Fusion: relatório de entregas sem a(s) coluna(s) ${faltam.join(', ')}`)
  const linhas = (dados.slice(1) as Record<string, unknown>[]).map(o => cabecalho.map(c => o?.[c] ?? null))
  return [cabecalho, ...linhas]
}

export async function buscarRelatorioEntregasFusion(data: string): Promise<EntregaRioQualityCompleta[]> {
  const r = await fusionPost<RespostaRelatorio>(PATH_RELATORIO_ENTREGAS, corpoRelatorioEntregas(data))
  return parseEntregasCompletasDeLinhas(linhasDoRelatorioEntregas(r))
    // RQ-04: a mesma regra da grade -- placa de preenchimento não é veículo.
    .map(e => (placaFicticia(e.placaNorm) ? { ...e, placaNorm: '' } : e))
}

/** Auditoria 20/10 (RQ-04): a Fusion aceita placa de preenchimento (XXX5678,
 *  108 NFs em 15/10). Nao e' veiculo nenhum: a regra "sem rastreador conta
 *  como correto" (04/10) e' pra caminhao real sem rastreador. Vira carga sem
 *  placa -- fora da taxa, com aviso pra operacao. */
export function placaFicticia(placaNorm: string): boolean {
  return /^XXX/.test(placaNorm)
}
