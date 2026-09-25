// Resolucao manual por NF (Task 4, plano 2026-09-24-melhorias-relatorio-final-ana)
// -- camada humana persistida em `kpi_nf_resolucao` (ver migration) por cima do
// status automatico calculado em agregacao.ts. Requisito P0 do PDF da Ana:
// "persistir status automatico ORIGINAL, resolucao manual, responsavel,
// data/hora, documento e historico; nova execucao nao pode apagar".
//
// Linhas nunca sao UPDATE/DELETE -- cada resolucao nova e' um INSERT.
// `resolucaoVigente` escolhe a de maior `criado_em` dentro de um grupo (mesma
// NF); `aplicarResolucoes` agrupa o historico completo por NF e aplica so' a
// vigente de cada uma em cima do `detalhe` do dia, sem nunca tocar em
// `status`/`observacao` (que continuam sendo o veredito automatico original --
// Global Constraint do plano: "Resolucao manual NUNCA e' sobrescrita por
// regeracao; automatico original sempre preservado").
import { createServiceClient } from '@/lib/supabase/service'
import type { LinhaDetalheEntrega, ResolucaoNf } from './types'

/** Formato exato da linha em `kpi_nf_resolucao` (colunas da migration,
 *  snake_case -- e' o que o PostgREST devolve de `select('*')`). */
export type ResolucaoNfRow = {
  id: number
  empresa: string
  data: string
  nf: string
  resolucao: ResolucaoNf
  placa_executora: string | null
  observacao: string | null
  responsavel: string
  documento: string | null
  criado_em: string // ISO
}

/** Payload de um INSERT novo -- tudo que `registrarResolucao` precisa alem do
 *  que o banco preenche sozinho (id, criado_em). */
export type NovaResolucaoNf = Omit<ResolucaoNfRow, 'id' | 'criado_em'>

/** Dentro de um grupo de linhas (mesma NF), a vigente e' sempre a de maior
 *  `criado_em` -- histórico continua tendo todas, so' a mais recente "vale"
 *  pro relatorio (Review Focus do plano: "duas resolucoes manuais para a
 *  mesma NF: vale a mais recente, historico guarda as duas"). */
export function resolucaoVigente(linhas: ResolucaoNfRow[]): ResolucaoNfRow | null {
  if (linhas.length === 0) return null
  return linhas.reduce((maisRecente, atual) =>
    new Date(atual.criado_em).getTime() > new Date(maisRecente.criado_em).getTime() ? atual : maisRecente)
}

/** Aplica o historico de resolucoes manuais (de UM OU MAIS dias/NFs, ja
 *  filtrado por empresa+data em `buscarResolucoes`) em cima do `detalhe`
 *  automatico do dia. Agrupa por NF, pega a vigente de cada grupo
 *  (`resolucaoVigente`) e so' ENXERTA campos novos (`resolucaoManual`,
 *  `responsavelResolucao`, etc) -- `status`/`observacao` do automatico saem
 *  identicos ao que entraram.
 *
 *  NF com resolucao registrada que nao aparece em `detalhe` (sumiu do
 *  romaneio numa regeracao -- Review Focus do plano) e' simplesmente
 *  ignorada: nenhum erro, a resolucao continua guardada na tabela pra quando
 *  a NF voltar a aparecer. */
export function aplicarResolucoes(
  detalhe: LinhaDetalheEntrega[],
  historicoResolucoes: ResolucaoNfRow[],
): LinhaDetalheEntrega[] {
  const porNf = new Map<string, ResolucaoNfRow[]>()
  for (const linha of historicoResolucoes) {
    const grupo = porNf.get(linha.nf)
    if (grupo) grupo.push(linha)
    else porNf.set(linha.nf, [linha])
  }

  const vigentePorNf = new Map<string, ResolucaoNfRow>()
  for (const [nf, linhas] of porNf) {
    const vigente = resolucaoVigente(linhas)
    if (vigente) vigentePorNf.set(nf, vigente)
  }

  return detalhe.map(d => {
    const vigente = vigentePorNf.get(d.nf)
    if (!vigente) return d
    return {
      ...d,
      resolucaoManual: vigente.resolucao,
      responsavelResolucao: vigente.responsavel,
      placaExecutoraResolucao: vigente.placa_executora,
      documentoResolucao: vigente.documento,
    }
  })
}

/** Le TODO o historico de resolucoes de uma empresa+dia (nao so' a vigente --
 *  quem decide o vigente por NF e' `aplicarResolucoes`). Chamadores (route.ts,
 *  o CLI de geracao) devem envolver esta chamada em try/catch: a tabela ainda
 *  nao existe em producao ate' o deploy desta migration, e uma geracao nao
 *  pode quebrar so' porque a camada de resolucao manual ainda nao esta' no
 *  ar. */
export async function buscarResolucoes(empresa: string, data: string): Promise<ResolucaoNfRow[]> {
  const { data: linhas, error } = await createServiceClient()
    .from('kpi_nf_resolucao')
    .select('*')
    .eq('empresa', empresa)
    .eq('data', data)
    .order('criado_em', { ascending: true })
  if (error) throw new Error(error.message)
  return (linhas ?? []) as ResolucaoNfRow[]
}

/** INSERT novo -- nunca UPDATE/DELETE (ver comentario do arquivo). Usado pelo
 *  importador (scripts/importar-ocorrencias.ts) quando chamado com
 *  `--aplicar`. */
export async function registrarResolucao(nova: NovaResolucaoNf): Promise<void> {
  const { error } = await createServiceClient().from('kpi_nf_resolucao').insert(nova)
  if (error) throw new Error(error.message)
}
