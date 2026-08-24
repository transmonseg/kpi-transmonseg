import { obterTokenRavex, invalidarTokenRavex } from './ravex-auth'
import type { EventoRavex } from './types'

const BASE_URL = 'https://sistema.ravex.com.br/odata1'
const TOP_HISTORICO = 5000

async function chamarRavex(path: string): Promise<unknown | null> {
  // obterTokenRavex fica FORA do try/catch de proposito -- falha de login
  // (credencial invalida, conta bloqueada) precisa propagar como erro
  // explicito pro chamador, nunca virar fail-open "sem GPS" (ver spec,
  // secao "Tratamento de erro"). Só o que vem depois (chamada de rede,
  // parse de resposta) e' fail-open -- EXCETO 401/403, que indicam que o
  // token que tinhamos em cache parou de funcionar (revogado/expirado no
  // servidor): nesse caso invalidamos o cache, tentamos UMA vez de novo
  // com token novo, e se persistir lancamos (mesmo motivo do login falho:
  // "sem GPS" pra frota inteira por token morto seria enganoso).
  let token = await obterTokenRavex()

  async function tentar(): Promise<Response> {
    return fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  }

  try {
    let res = await tentar()
    if (res.status === 401 || res.status === 403) {
      invalidarTokenRavex()
      token = await obterTokenRavex()
      res = await tentar()
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Ravex recusou o token mesmo apos renovar (HTTP ${res.status}) pra ${path}`)
      }
    }
    if (!res.ok) {
      console.error(`[kpi-portefrio/ravex-api] Ravex respondeu ${res.status} pra ${path}`)
      return null
    }
    return await res.json()
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Ravex recusou o token')) throw e
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
