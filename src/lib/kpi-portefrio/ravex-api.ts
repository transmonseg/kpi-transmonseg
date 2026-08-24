import { obterTokenRavex } from './ravex-auth'
import type { EventoRavex } from './types'

const BASE_URL = 'https://sistema.ravex.com.br/odata1'
const TOP_HISTORICO = 5000

async function chamarRavex(path: string): Promise<unknown | null> {
  // obterTokenRavex fica FORA do try/catch de proposito -- falha de login
  // (credencial invalida, conta bloqueada) precisa propagar como erro
  // explicito pro chamador, nunca virar fail-open "sem GPS" (ver spec,
  // secao "Tratamento de erro"). Só o que vem depois (chamada de rede,
  // parse de resposta) e' fail-open.
  const token = await obterTokenRavex()
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      console.error(`[kpi-portefrio/ravex-api] Ravex respondeu ${res.status} pra ${path}`)
      return null
    }
    return await res.json()
  } catch (e) {
    console.error('[kpi-portefrio/ravex-api] chamada falhou:', e instanceof Error ? e.message : String(e))
    return null
  }
}

/** Fail-open: placa nao encontrada ou erro de rede/parse depois do login
 *  devolve null, nunca lanca. Falha de LOGIN (obterTokenRavex) e' a UNICA
 *  excecao que propaga -- ver comentario em chamarRavex. */
export async function resolverIdVeiculo(placa: string): Promise<number | null> {
  const filtro = encodeURIComponent(`contains(tolower(PlacaNome),'${placa.toLowerCase()}')`)
  const data = await chamarRavex(`/Veiculo?$filter=${filtro}`) as { value?: Array<{ Id: number }> } | null
  return data?.value?.[0]?.Id ?? null
}

export async function buscarHistoricoVeiculo(
  idVeiculo: number,
  dataInicioUnix: number,
  dataFimUnix: number,
): Promise<EventoRavex[]> {
  const path = `/GetHistoricoVeiculoV2(idItem=${idVeiculo},veiculoOuEquipamento=false,dataInicial=${dataInicioUnix},dataFinal=${dataFimUnix})?$orderby=EventoDatahora&$top=${TOP_HISTORICO}`
  const data = await chamarRavex(path) as { value?: Array<{
    EventoDatahora: string
    GPSLatitude: number | string
    GPSLongitude: number | string
    CanRefrigeracao_CabineTemperatura: number | null
  }> } | null

  if (!data?.value) return []

  return data.value.map(ev => ({
    dataHora: ev.EventoDatahora,
    lat: Number(ev.GPSLatitude),
    lng: Number(ev.GPSLongitude),
    temperatura: ev.CanRefrigeracao_CabineTemperatura ?? null,
  }))
}
