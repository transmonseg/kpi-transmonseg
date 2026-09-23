// Runner NOTURNO, report-only, da correcao de geocode por alvo (ver
// scripts/corrigir-geocode-por-alvo.ts). NUNCA aplica -- so' gera os CSVs
// pra revisao humana, um dia atras do dia rodado.
//
// Uso: npx tsx --env-file=.env.production scripts/correcao-geocode-noturna.ts [AAAA-MM-DD]
// Sem argumento: usa "ontem" no fuso de Brasilia. Com argumento: usa a data
// passada (util pra rodar manualmente/reprocessar um dia especifico).
//
// Fluxo: acha a geracao mais recente do KPI da Nutry Max (tabela
// kpi_romaneio_geracoes) pra aquela data_referencia que tenha o Romaneio
// original guardado no Storage, baixa o PDF, roda a mesma logica de
// sugestao de correcao SEM aplicar (aplicar: false sempre) e escreve os
// CSVs em relatorios-geocode/<data>/.
//
// Sem geracao pra aquele dia: loga e sai com codigo 0 (nao e' erro -- so'
// nao rodou o KPI naquele dia). Qualquer outra falha (download, parse,
// etc.) sai com codigo 1.
import path from 'path'
import { createServiceClient } from '../src/lib/supabase/service'
import { hojeBR } from '../src/lib/data-br'
import { rodarCorrecao } from './corrigir-geocode-por-alvo'

const CLIENTE = 'nutrimax'
const BUCKET = 'kpi-romaneio-inputs'

/** Subtrai um dia de calendario de uma data AAAA-MM-DD (pura, sem fuso --
 *  a data ja e' um dia de calendario, nao um instante). Usa UTC internamente
 *  so' pra deixar o Date fazer a aritmetica de virada de mes/ano por nos. */
export function diaAnterior(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const dt = new Date(Date.UTC(ano, mes - 1, dia))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return dt.toISOString().slice(0, 10)
}

export type GeracaoRow = { id: string; gerado_em: string; romaneio_storage_path: string | null }

/** Entre as geracoes de um mesmo dia (pode ter mais de uma -- regeracao
 *  manual, reprocessamento), escolhe a mais recente (gerado_em) que tenha
 *  o Romaneio original guardado. Geracoes antigas sem o PDF guardado
 *  (romaneio_storage_path null) nao servem -- nao da pra rodar a correcao
 *  sem o PDF. Sem nenhuma geracao utilizavel, retorna null. */
export function escolherGeracao(rows: GeracaoRow[]): GeracaoRow | null {
  const utilizaveis = rows.filter(r => r.romaneio_storage_path != null)
  if (utilizaveis.length === 0) return null
  return utilizaveis.reduce((melhor, r) => (r.gerado_em > melhor.gerado_em ? r : melhor))
}

async function main() {
  const argData = process.argv[2]
  if (argData && !/^\d{4}-\d{2}-\d{2}$/.test(argData)) {
    console.error('Uso: correcao-geocode-noturna.ts [AAAA-MM-DD]')
    process.exit(1)
    return
  }
  const data = argData ?? diaAnterior(hojeBR())

  const svc = createServiceClient()
  const { data: rows, error } = await svc
    .from('kpi_romaneio_geracoes')
    .select('id, gerado_em, romaneio_storage_path')
    .eq('cliente', CLIENTE)
    .eq('data_referencia', data)
  if (error) throw new Error(`falha ao buscar geracoes: ${error.message}`)

  const geracao = escolherGeracao(rows ?? [])
  if (!geracao) {
    console.log(`[correcao-geocode-noturna] sem geracao de ${CLIENTE} com romaneio guardado pra ${data} -- nada a fazer`)
    return
  }

  const { data: download, error: erroDownload } = await svc.storage.from(BUCKET).download(geracao.romaneio_storage_path as string)
  if (erroDownload || !download) {
    throw new Error(`falha ao baixar romaneio do Storage (${geracao.romaneio_storage_path}): ${erroDownload?.message ?? 'sem dados'}`)
  }
  const romaneioBuf = Buffer.from(await download.arrayBuffer())

  const dirSaida = path.join(process.cwd(), 'relatorios-geocode', data)
  const resultado = await rodarCorrecao(romaneioBuf, data, { aplicar: false, dirSaida })

  console.log(`[correcao-geocode-noturna] data=${data} geracao=${geracao.id} sugestoes=${resultado.sugestoes} rejeicoes=${JSON.stringify(resultado.rejeicoes)}`)
  console.log(`[correcao-geocode-noturna] arquivos: ${resultado.arquivos.join(', ')}`)
}

if (process.env.VITEST !== 'true') main().catch(e => { console.error(e); process.exit(1) })
