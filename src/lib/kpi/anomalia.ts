import type { RotaKpi, AnomaliaDetectada } from '@/lib/types/kpi'

type ParadaIndexEntry = {
  id: string
  classificacao: string
  chegada: Date
  saida: Date | null
  duracao_seg: number | null
  lat: number | null
  lng: number | null
}

type DetectaParams = {
  rotas: RotaKpi[]
  escalaLinhas: Array<{
    id: string
    placa_norm: string | null
    rede_id: string
    data_entrega: string
  }>
  paradasIndex: Map<string, ParadaIndexEntry[]>
  janelasRede: Map<string, { janela_inicio: string; janela_fim: string }>
  data: string
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function dateToMinutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

export function detectaAnomalias(params: DetectaParams): AnomaliaDetectada[] {
  const { rotas, escalaLinhas, paradasIndex, janelasRede, data } = params
  const anomalias: AnomaliaDetectada[] = []

  const escalaPlacas = new Set(
    escalaLinhas.filter((l) => l.placa_norm).map((l) => l.placa_norm as string),
  )

  // ANOM-02: GPS sem escala — plaques in unitrac but not in escala
  const placasUnitrac = new Set(paradasIndex.keys())
  for (const placa of placasUnitrac) {
    if (!escalaPlacas.has(placa)) {
      anomalias.push({
        kpi_rota_id: null,
        parada_id: null,
        data,
        codigo: 'ANOM-02',
        severidade: 'LOW',
        descricao: `Placa ${placa} encontrada no GPS (Unitrac) mas não possui linha de escala para ${data}.`,
        sugestao: 'Verificar se a placa está na escala ou se houve erro de digitação.',
        payload: { placa },
      })
    }
  }

  for (const rota of rotas) {
    const rotaId = null as string | null

    // ANOM-01: placa com escala mas sem paradas GPS
    if (rota.placa_norm && rota.paradas.length === 0 && rota.status !== 'sem_entrega') {
      const temParadas = paradasIndex.has(rota.placa_norm)
      if (!temParadas) {
        anomalias.push({
          kpi_rota_id: rotaId,
          parada_id: null,
          data,
          codigo: 'ANOM-01',
          severidade: 'HIGH',
          descricao: `Placa ${rota.placa_norm} está na escala mas não possui nenhum dado GPS no Unitrac para ${data}.`,
          sugestao: 'Verificar se o rastreador estava ativo ou se a placa está correta na escala.',
          payload: { placa: rota.placa_norm, escala_linha_id: rota.escala_linha_id },
        })
      }
    }

    // ANOM-03: FORA_BASE com duração >= 10min e sem loja_id
    for (const parada of rota.paradas) {
      if (parada.classificacao === 'FORA_BASE' && parada.duracao_min * 60 >= 600 && !parada.loja_id) {
        anomalias.push({
          kpi_rota_id: rotaId,
          parada_id: parada.parada_id,
          data,
          codigo: 'ANOM-03',
          severidade: 'MEDIUM',
          descricao: `Parada fora de geofence por ${parada.duracao_min} min em "${parada.nome}" (placa ${rota.placa_norm}) sem loja identificada.`,
          sugestao: 'Verificar localização da parada e cadastrar loja caso seja ponto recorrente.',
          payload: {
            placa: rota.placa_norm,
            nome_parada: parada.nome,
            duracao_min: parada.duracao_min,
            chegada: parada.chegada.toISOString(),
          },
        })
      }
    }

    // ANOM-04: tempo negativo (saida < chegada)
    for (const parada of rota.paradas) {
      if (parada.saida < parada.chegada) {
        anomalias.push({
          kpi_rota_id: rotaId,
          parada_id: parada.parada_id,
          data,
          codigo: 'ANOM-04',
          severidade: 'HIGH',
          descricao: `Parada em "${parada.nome}" (placa ${rota.placa_norm}) com saída anterior à chegada — dado GPS inconsistente.`,
          sugestao: 'Verificar dados brutos no Unitrac para esta parada.',
          payload: {
            placa: rota.placa_norm,
            nome_parada: parada.nome,
            chegada: parada.chegada.toISOString(),
            saida: parada.saida.toISOString(),
          },
        })
      }
    }

    // ANOM-05: divergência de rota (paradas LOJA != 1 quando loja única na escala)
    // Only applies when loja_nome_raw represents a single store (heuristic: no "/" or "E " separator)
    const lojaRaw = escalaLinhas.find((l) => l.id === rota.escala_linha_id)?.data_entrega
    const escalaLinha = escalaLinhas.find((l) => l.id === rota.escala_linha_id)
    if (escalaLinha) {
      const lojaStr = (escalaLinha as unknown as { loja_nome_raw?: string }).loja_nome_raw ?? ''
      const isMultiLoja = /\s*[/\\]\s*|\s+E\s+/i.test(lojaStr)
      if (!isMultiLoja) {
        const qtdLojaParadas = rota.paradas.filter((p) => p.classificacao === 'LOJA').length
        if (qtdLojaParadas !== 1 && rota.paradas.length > 0) {
          anomalias.push({
            kpi_rota_id: rotaId,
            parada_id: null,
            data,
            codigo: 'ANOM-05',
            severidade: 'MEDIUM',
            descricao: `Rota de ${rota.placa_norm} tem ${qtdLojaParadas} parada(s) em loja, esperado 1 para "${lojaStr}".`,
            sugestao: 'Confirmar se a entrega foi feita na loja correta ou se há paradas duplicadas.',
            payload: {
              placa: rota.placa_norm,
              loja_nome_raw: lojaStr,
              qtd_paradas_loja: qtdLojaParadas,
            },
          })
        }
      }
    }

    // ANOM-06: saida_cd ausente mas há paradas
    if (rota.paradas.length > 0 && !rota.saida_cd) {
      anomalias.push({
        kpi_rota_id: rotaId,
        parada_id: null,
        data,
        codigo: 'ANOM-06',
        severidade: 'HIGH',
        descricao: `Placa ${rota.placa_norm} possui paradas registradas mas não há saída do CD identificada no GPS.`,
        sugestao: 'Verificar se a base/CD está cadastrada no geofence do Unitrac.',
        payload: { placa: rota.placa_norm, qtd_paradas: rota.paradas.length },
      })
    }

    // ANOM-07: chegada na primeira parada antes da saída do CD
    if (rota.saida_cd && rota.paradas.length > 0) {
      const primeiraParada = rota.paradas[0]
      if (primeiraParada.chegada < rota.saida_cd) {
        anomalias.push({
          kpi_rota_id: rotaId,
          parada_id: primeiraParada.parada_id,
          data,
          codigo: 'ANOM-07',
          severidade: 'HIGH',
          descricao: `Placa ${rota.placa_norm}: chegada na primeira parada (${primeiraParada.chegada.toISOString()}) é anterior à saída do CD (${rota.saida_cd.toISOString()}).`,
          sugestao: 'Verificar dados GPS — possível inversão de timestamps ou parada fora da sequência.',
          payload: {
            placa: rota.placa_norm,
            saida_cd: rota.saida_cd.toISOString(),
            chegada_primeira_parada: primeiraParada.chegada.toISOString(),
          },
        })
      }
    }

    // ANOM-08: tempo em loja excessivo (> 4h = 240 min)
    for (const parada of rota.paradas) {
      if (parada.duracao_min > 240) {
        anomalias.push({
          kpi_rota_id: rotaId,
          parada_id: parada.parada_id,
          data,
          codigo: 'ANOM-08',
          severidade: 'MEDIUM',
          descricao: `Parada em "${parada.nome}" (placa ${rota.placa_norm}) com duração excessiva de ${parada.duracao_min} min (limite: 240 min).`,
          sugestao: 'Verificar com motorista se houve ocorrência na entrega.',
          payload: {
            placa: rota.placa_norm,
            nome_parada: parada.nome,
            duracao_min: parada.duracao_min,
            chegada: parada.chegada.toISOString(),
            saida: parada.saida.toISOString(),
          },
        })
      }
    }

    // ANOM-10: EMANUEL com loja não normalizada
    if (rota.rede_id === 'EMANUEL') {
      for (const parada of rota.paradas) {
        if (!parada.loja_id) {
          anomalias.push({
            kpi_rota_id: rotaId,
            parada_id: parada.parada_id,
            data,
            codigo: 'ANOM-10',
            severidade: 'LOW',
            descricao: `Rede EMANUEL: parada "${parada.nome}" (placa ${rota.placa_norm}) não corresponde a nenhuma loja cadastrada.`,
            sugestao: 'Cadastrar loja no catálogo ou revisar nome no Unitrac.',
            payload: { placa: rota.placa_norm, nome_parada: parada.nome },
          })
        }
      }
    }

    // ANOM-11: saída do CD fora da janela da rede
    if (rota.saida_cd) {
      const janela = janelasRede.get(rota.rede_id)
      if (janela) {
        const inicioMin = timeToMinutes(janela.janela_inicio)
        const fimMin = timeToMinutes(janela.janela_fim)
        const saidaMin = dateToMinutesOfDay(rota.saida_cd)
        const foraJanela =
          fimMin > inicioMin
            ? saidaMin < inicioMin || saidaMin > fimMin
            : saidaMin < inicioMin && saidaMin > fimMin
        if (foraJanela) {
          anomalias.push({
            kpi_rota_id: rotaId,
            parada_id: null,
            data,
            codigo: 'ANOM-11',
            severidade: 'LOW',
            descricao: `Placa ${rota.placa_norm} saiu do CD às ${rota.saida_cd.toISOString()} fora da janela operacional da rede ${rota.rede_id} (${janela.janela_inicio}–${janela.janela_fim}).`,
            sugestao: 'Verificar se houve autorização para saída fora do horário previsto.',
            payload: {
              placa: rota.placa_norm,
              rede_id: rota.rede_id,
              saida_cd: rota.saida_cd.toISOString(),
              janela_inicio: janela.janela_inicio,
              janela_fim: janela.janela_fim,
            },
          })
        }
      }
    }
  }

  // ANOM-09: skipped (needs alteracoes integration)

  return anomalias
}
