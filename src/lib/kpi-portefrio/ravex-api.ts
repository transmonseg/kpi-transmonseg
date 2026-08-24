import { obterTokenRavex, invalidarTokenRavex } from './ravex-auth'
import type { EventoRavex } from './types'

const BASE_URL = 'https://sistema.ravex.com.br/odata1'
const TOP_HISTORICO = 5000

async function fetchFailOpen(path: string, token: string): Promise<Response | null> {
  try {
    return await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  } catch (e) {
    console.error('[kpi-portefrio/ravex-api] chamada falhou:', e instanceof Error ? e.message : String(e))
    return null
  }
}

async function chamarRavex(path: string): Promise<unknown | null> {
  // obterTokenRavex fica FORA de qualquer try/catch fail-open -- tanto o
  // login inicial quanto o relogin apos 401/403 abaixo. Falha de
  // autenticacao (credencial invalida, conta bloqueada, token revogado no
  // servidor) precisa propagar como erro explicito pro chamador, nunca
  // virar fail-open "sem GPS" pra frota inteira (ver spec, secao
  // "Tratamento de erro"). So' a chamada de rede e o parse da resposta sao
  // fail-open -- EXCETO 401/403 que persiste mesmo apos renovar o token,
  // que tambem propaga (mesmo motivo do login falho).
  let token = await obterTokenRavex()
  let res = await fetchFailOpen(path, token)
  if (!res) return null

  if (res.status === 401 || res.status === 403) {
    invalidarTokenRavex()
    token = await obterTokenRavex()
    res = await fetchFailOpen(path, token)
    if (!res) return null
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Ravex recusou o token mesmo apos renovar (HTTP ${res.status}) pra ${path}`)
    }
  }

  if (!res.ok) {
    console.error(`[kpi-portefrio/ravex-api] Ravex respondeu ${res.status} pra ${path}`)
    return null
  }

  try {
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

  return data.value
    .map(ev => ({
      dataHora: ev.EventoDatahora,
      lat: Number(ev.GPSLatitude),
      lng: Number(ev.GPSLongitude),
      temperatura: ev.CanRefrigeracao_CabineTemperatura ?? null,
    }))
    .filter(ev => Number.isFinite(ev.lat) && Number.isFinite(ev.lng))
}
