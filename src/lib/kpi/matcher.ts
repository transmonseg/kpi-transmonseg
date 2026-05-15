import { levenshtein, normalizaNome } from '@/lib/utils/texto'
import { haversine } from '@/lib/utils/geo'
import type { RotaKpi, ParadaKpi } from '@/lib/types/kpi'

type EscalaLinhaRow = {
  id: string
  rede_id: string
  placa_norm: string | null
  loja_nome_raw: string
  loja_codigo_raw: string | null
  motorista_nome: string | null
  carro_ordem: number
  data_entrega: string
}

type UnitracParadaRow = {
  id: string
  placa_norm: string
  chegada: string
  saida: string | null
  duracao_seg: number | null
  local_parada: string
  codigo_loja: string | null
  nome_loja: string | null
  lat: number | null
  lng: number | null
  classificacao: string
  ordem: number
}

type LojaRow = {
  id: string
  rede_id: string
  nome: string
  nome_normalizado: string
  codigo_escala: string | null
  codigo_unitrac: string | null
  nome_unitrac: string | null
  lat: number | null
  lng: number | null
  raio_metros: number
}

/**
 * Consolida paradas LOJA consecutivas com mesmo codigo_loja em UMA só parada.
 *
 * Cenário (confirmado pela Tia Érica nos vídeos): quando o caminhão entrega
 * num cliente, ele pode "pular pra rua lateral" e voltar, gerando 2-3
 * registros consecutivos com o mesmo Local da Parada no Unitrac. A
 * interpretação correta é UMA parada: chegada = primeira, saída = última.
 *
 * Mantém ordem temporal, só junta paradas LOJA com codigo_loja não-nulo iguais.
 */
function consolidarParadasMesmoCliente(paradas: UnitracParadaRow[]): UnitracParadaRow[] {
  const out: UnitracParadaRow[] = []
  for (const p of paradas) {
    const last = out[out.length - 1]
    const mesmaLoja =
      last &&
      last.classificacao === 'LOJA' &&
      p.classificacao === 'LOJA' &&
      last.codigo_loja &&
      p.codigo_loja &&
      last.codigo_loja === p.codigo_loja
    if (mesmaLoja && last.saida && p.saida && last.chegada) {
      last.saida = p.saida
      last.duracao_seg = Math.round(
        (new Date(p.saida).getTime() - new Date(last.chegada).getTime()) / 1000,
      )
    } else {
      out.push({ ...p })
    }
  }
  return out
}

function resolveLojaId(
  parada: UnitracParadaRow,
  lojas: LojaRow[],
  redeId: string,
): string | null {
  const redeLojas = lojas.filter((l) => l.rede_id === redeId)

  // Priority 1: exact code match
  if (parada.codigo_loja) {
    const byCode = redeLojas.find((l) => l.codigo_unitrac === parada.codigo_loja)
    if (byCode) return byCode.id
  }

  // Priority 2: levenshtein on normalized name ≤ 2
  if (parada.nome_loja) {
    const normParada = normalizaNome(parada.nome_loja)
    const byName = redeLojas.find(
      (l) => levenshtein(normParada, l.nome_normalizado) <= 2,
    )
    if (byName) return byName.id
  }

  // Priority 3: geo proximity
  if (parada.lat != null && parada.lng != null) {
    const byGeo = redeLojas.find(
      (l) =>
        l.lat != null &&
        l.lng != null &&
        haversine(parada.lat!, parada.lng!, l.lat, l.lng) <= l.raio_metros,
    )
    if (byGeo) return byGeo.id
  }

  return null
}

export function cruzaEscalaUnitrac(
  escalaLinhas: EscalaLinhaRow[],
  paradaRows: UnitracParadaRow[],
  lojas: LojaRow[],
): RotaKpi[] {
  const paradaByPlaca = new Map<string, UnitracParadaRow[]>()
  for (const p of paradaRows) {
    const list = paradaByPlaca.get(p.placa_norm) ?? []
    list.push(p)
    paradaByPlaca.set(p.placa_norm, list)
  }
  for (const [placa, list] of paradaByPlaca) {
    paradaByPlaca.set(
      placa,
      list.sort((a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime()),
    )
  }

  const rotas: RotaKpi[] = []

  for (const linha of escalaLinhas) {
    if (!linha.placa_norm) {
      rotas.push({
        escala_linha_id: linha.id,
        data: linha.data_entrega,
        rede_id: linha.rede_id,
        placa_norm: null,
        saida_cd: null,
        paradas: [],
        anomalias_codigos: [],
        status: 'sem_entrega',
      })
      continue
    }

    const todasParadas = paradaByPlaca.get(linha.placa_norm) ?? []
    const semFake = todasParadas.filter((p) => p.classificacao !== 'FAKE_EXIT')

    const firstNonBase = semFake.find((p) => p.classificacao !== 'BASE')
    const firstNonBaseTime = firstNonBase ? new Date(firstNonBase.chegada).getTime() : Infinity

    let saida_cd: Date | null = null
    for (const p of semFake) {
      if (p.classificacao === 'BASE' && p.saida) {
        const saidaDate = new Date(p.saida)
        if (saidaDate.getTime() < firstNonBaseTime) {
          if (!saida_cd || saidaDate.getTime() > saida_cd.getTime()) {
            saida_cd = saidaDate
          }
        }
      }
    }

    const nonBaseParadasRaw = semFake.filter((p) => p.classificacao !== 'BASE')
    const nonBaseParadas = consolidarParadasMesmoCliente(nonBaseParadasRaw).slice(0, 10)

    const paradas: ParadaKpi[] = nonBaseParadas.map((p) => {
      const chegada = new Date(p.chegada)
      const saida = p.saida ? new Date(p.saida) : chegada
      const duracao_min = Math.round((p.duracao_seg ?? 0) / 60)
      const loja_id = resolveLojaId(p, lojas, linha.rede_id)

      return {
        parada_id: p.id,
        loja_id,
        nome: p.nome_loja ?? p.local_parada,
        chegada,
        saida,
        duracao_min,
        classificacao: p.classificacao === 'LOJA' ? 'LOJA' : 'FORA_BASE',
      }
    })

    rotas.push({
      escala_linha_id: linha.id,
      data: linha.data_entrega,
      rede_id: linha.rede_id,
      placa_norm: linha.placa_norm,
      saida_cd,
      paradas,
      anomalias_codigos: [],
      status: 'pendente',
    })
  }

  return rotas
}
