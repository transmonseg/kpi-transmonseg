// Task 8 (plano 2026-09-24-melhorias-relatorio-final-ana): placa declarada SEM
// RASTREADOR pela OPERACAO, nao pelo dado GPS -- caso TTL5J17: tem `cv` na
// Unitrac e paradas so' na BASE, o que pelo dado e' indistinguivel de caminhao
// parado (cai em "VEICULO SEM MOVIMENTO"). A informacao "sem rastreador" so'
// existe porque a operacao avisou (Ana, 24/09) -- persistida em
// `kpi_placa_sem_rastreador` (ver migration) com vigencia (inicio/fim).
//
// A declaracao manual VENCE qualquer fonte de dado: quando a placa esta no
// conjunto do dia, `temRastreador` sai `false` mesmo que `cv`/ponte digam que
// sim -- mesmo rotulo e mesmo comportamento (fora da taxa automatica) da Task 1
// (`SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO`).
import { createServiceClient } from '@/lib/supabase/service'
import { normPlaca } from '@/lib/unitrac-api'

/** Formato exato da linha em `kpi_placa_sem_rastreador` (colunas da migration,
 *  snake_case -- o que o PostgREST devolve de `select('*')`). */
export type PlacaSemRastreadorRow = {
  id: number
  empresa: string
  placa: string
  inicio: string // date 'YYYY-MM-DD'
  fim: string | null // date 'YYYY-MM-DD', null = sem previsao de volta
  motivo: string | null
  responsavel: string
  criado_em: string // ISO
}

/** Placas (normalizadas) declaradas sem rastreador NO DIA `data`. Vigencia
 *  fechada: `inicio <= data` e (`fim` null ou `fim >= data`). Comparacao
 *  lexicografica de strings ISO 'YYYY-MM-DD' equivale a comparacao de data. */
export function placasSemRastreadorNoDia(linhas: PlacaSemRastreadorRow[], data: string): Set<string> {
  const placas = new Set<string>()
  for (const l of linhas) {
    if (l.inicio > data) continue
    if (l.fim != null && l.fim < data) continue
    placas.add(normPlaca(l.placa))
  }
  return placas
}

/** Le o cadastro de placas sem rastreador da empresa. Falha de leitura (tabela
 *  ainda nao existe ate' o deploy da migration, Supabase fora do ar, etc) NAO
 *  quebra a geracao -- devolve vazio (nenhuma placa declarada), mesmo padrao
 *  fail-open de `alvosEfetivos` (alvos-snapshot.ts). */
export async function buscarPlacasSemRastreador(empresa: string): Promise<PlacaSemRastreadorRow[]> {
  try {
    const { data: linhas, error } = await createServiceClient()
      .from('kpi_placa_sem_rastreador')
      .select('*')
      .eq('empresa', empresa)
    if (error) throw new Error(error.message)
    return (linhas ?? []) as PlacaSemRastreadorRow[]
  } catch (err) {
    console.error('placas sem rastreador indisponivel:', err)
    return []
  }
}

/** Helper puro (usado por route.ts e pelo CLI `gerar-nutrimax-real-arquivo.ts`
 *  -- ambos montavam o mesmo calculo duplicado) que monta o mapa final de
 *  `temRastreadorPorPlaca`: comeca do calculo de hoje (cv na Unitrac OU
 *  entrada na ponte do monitoramento) e por cima aplica a declaracao manual da
 *  operacao, que VENCE qualquer fonte de dado (TTL5J17: tem `cv` e a ponte
 *  respondeu, mas a operacao confirmou que a placa nao tem rastreador no dia
 *  -- sem isso cairia em "VEICULO SEM MOVIMENTO"). */
export function montarTemRastreadorPorPlaca(
  placasNorm: string[],
  cvPorPlaca: Map<string, unknown>,
  horarioBasePorPlaca: Map<string, unknown>,
  placasSemRastreador: Set<string>,
): Map<string, boolean> {
  return new Map(placasNorm.map(p => [
    p,
    placasSemRastreador.has(p) ? false : (cvPorPlaca.has(p) || horarioBasePorPlaca.has(p)),
  ]))
}
