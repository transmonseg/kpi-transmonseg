// F3-02 / F3-09 (lado KPI): carrega o que o Resumo do dia precisa -- só
// leitura. O resultado do dia é o mesmo que o Ao vivo mostra (hoje: último
// cálculo; dia passado: lerDiaHistorico, que já ignora a versão escondida do
// F3-04). Os dias anteriores vêm só de kpi_ao_vivo_calculo.
import { createServiceClient } from '@/lib/supabase/service'
import { hojeBR } from '@/lib/data-br'
import { metaDoCliente } from '@/lib/kpi/metas'
import { buscarFrotaRioQuality } from '@/lib/kpi-rioquality/frota'
import { lerEstadoAoVivo, NOME_CLIENTE_AO_VIVO, type ClienteAoVivo, type ResultadoAoVivo } from './ao-vivo-servico'
import { lerDiaHistorico } from './ao-vivo-historico'
import { buscarPlacasSemRastreador, placasProvisoriasNoDia } from './placas-sem-rastreador'
import { EMPRESA_NUTRIMAX } from './constants'
import { montarResumoDia, textoResumoDia, type DiaAnterior, type ResumoDia } from './resumo-dia'
import { ehFechamento } from './fechamento-dashboard'

/** Dias de operação anteriores lidos (com o dia, janela de 7 do bloco Rastreador). */
export const DIAS_ANTERIORES_RESUMO = 6
const DIAS_CORRIDOS_MAX = 14

const diasAntes = (data: string, n: number) => { const d = new Date(`${data}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10) }

export type ResumoDiaCarregado = { resumo: ResumoDia; texto: string; nomeCliente: string; avisos: string[] }

async function lerAnteriores(cliente: ClienteAoVivo, data: string): Promise<DiaAnterior[]> {
  const { data: linhas, error } = await createServiceClient().from('kpi_ao_vivo_calculo')
    .select('data, resumo:resultado->resumo, placas:resultado->placas, versaoRegras:resultado->versaoRegras, degradado:resultado->degradado')
    .eq('cliente', cliente).lt('data', data).gte('data', diasAntes(data, DIAS_CORRIDOS_MAX))
    .not('resultado', 'is', null).order('data', { ascending: false }).limit(DIAS_ANTERIORES_RESUMO)
  if (error) throw new Error(error.message)
  // F3-R03: dia anterior degradado não entra na comparação.
  return ((linhas ?? []) as unknown as { data: string; resumo: ResultadoAoVivo['resumo'] | null; placas: ResultadoAoVivo['placas'] | null; versaoRegras: string | null; degradado?: string | null }[])
    .filter(l => l.resumo && !l.degradado)
    .map(l => ({ data: l.data, resumo: l.resumo!, placas: l.placas ?? [], versaoRegras: l.versaoRegras ?? null }))
}

/** Dia passado: o fechamento do Ao vivo (versão oficial do F3-04, com a
 *  investigação das não entregues); sem ele, a última geração guardada. */
async function resultadoDoDiaPassado(cliente: ClienteAoVivo, data: string, avisos: string[], ressalvas: string[]): Promise<ResultadoAoVivo | null> {
  const { data: c, error } = await createServiceClient().from('kpi_ao_vivo_calculo').select('resultado').eq('cliente', cliente).eq('data', data).maybeSingle()
  if (error) throw new Error(error.message)
  if (c?.resultado) {
    const r = c.resultado as ResultadoAoVivo
    // F3-R03: mesmo critério do F3-01 -- só o cálculo feito a partir das
    // 00:30 do dia seguinte é o fechamento.
    if (!ehFechamento(r.calculadoEm, data)) ressalvas.push(ressalvaNaoFechamento(r.calculadoEm))
    return r
  }
  const h = await lerDiaHistorico(cliente, data)
  if (h) avisos.push('Dia sem cálculo do Ao vivo: resumo lido da planilha gerada, sem a lista "Conferir primeiro".')
  return h?.resultado ?? null
}

function ressalvaNaoFechamento(calculadoEm: string | null | undefined): string {
  const quando = calculadoEm && !Number.isNaN(Date.parse(calculadoEm))
    ? new Date(calculadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(', ', ' às ')
    : null
  return `Este número não é o fechamento do dia: o cálculo das 00:30 não rodou${quando ? ` (último cálculo em ${quando})` : ''}. Não é o número oficial.`
}

/** null = nada calculado nem guardado desse dia. */
export async function carregarResumoDia(cliente: ClienteAoVivo, data: string): Promise<ResumoDiaCarregado | null> {
  const hoje = hojeBR()
  const avisos: string[] = []
  const ressalvasExtras: string[] = []
  const resultado = data === hoje ? (await lerEstadoAoVivo(cliente, hoje)).resultado : await resultadoDoDiaPassado(cliente, data, avisos, ressalvasExtras)
  if (!resultado) return null
  const anteriores = await lerAnteriores(cliente, data).catch(e => {
    avisos.push(`Dias anteriores não lidos (${e instanceof Error ? e.message : String(e)}): sem comparação e sem recorrência.`)
    return [] as DiaAnterior[]
  })
  let provisorias: Set<string> | undefined
  let frotaComCv: Set<string> | null = null
  if (cliente === 'nutrimax') {
    provisorias = placasProvisoriasNoDia(await buscarPlacasSemRastreador(EMPRESA_NUTRIMAX, () => avisos.push('Cadastro de placas sem rastreador não lido: placa provisória pode aparecer como "sem sinal".')), data)
  } else {
    frotaComCv = await buscarFrotaRioQuality().then(m => new Set(m.keys())).catch(() => {
      avisos.push('Cadastro de rastreadores da Rio Quality não lido: "fora da frota" não separado de "sem sinal".')
      return null
    })
  }
  const resumo = montarResumoDia({ cliente, data, resultado, meta: metaDoCliente(cliente), anteriores, provisorias, frotaComCv, ressalvasExtras })
  const nomeCliente = NOME_CLIENTE_AO_VIVO[cliente]
  // F3-R03: os avisos do próprio cálculo (incompleto ou não) também vão à tela.
  const todos = [...resumo.ressalvas, ...(resultado.avisos ?? []), ...avisos]
  return { resumo, texto: textoResumoDia(resumo, nomeCliente), nomeCliente, avisos: [...new Set(todos)] }
}
