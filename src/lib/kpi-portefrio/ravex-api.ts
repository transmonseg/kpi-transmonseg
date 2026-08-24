import { obterTokenRavex } from './ravex-auth'
import type { EventoRavex } from './types'

const BASE_URL = 'https://sistema.ravex.com.br/odata1'
const TOP_HISTORICO = 5000

async function chamarRavex(path: string): Promise<unknown | null> {
  try {
    const token = await obterTokenRavex()
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

/** Fail-open: placa nao encontrada ou qualquer erro devolve null, nunca
 *  lanca (autenticacao quebrada e' a UNICA excecao que propaga, e isso
 *  acontece dentro de obterTokenRavex, nao aqui). */
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
