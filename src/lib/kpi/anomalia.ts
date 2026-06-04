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
    loja_nome_raw?: string
  }>
  paradasIndex: Map<string, ParadaIndexEntry[]>
  janelasRede: Map<string, { janela_inicio: string; janela_fim: string }>
  data: string
  /** Coords cadastradas por loja_id — usado p/ ANOM-13 (entrega longe) e ANOM-17
   * (saída-falsa perto de loja). Opcional: sem isso as checagens não rodam. */
  lojaCoords?: Map<string, { lat: number | null; lng: number | null; raio_metros: number | null; nome?: string; rede_id?: string }>
}

/** Distância de caracteres (mesmo comprimento). Usada p/ achar placa "quase igual". */
function charDist(a: string, b: string): number {
  if (a.length !== b.length) return 99
  let d = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++
  return d
}

function haversineM(a: number, b: number, c: number, d: number): number {
  const R = 6371000, t = (x: number) => (x * Math.PI) / 180
  const dp = t(c - a), dl = t(d - b)
  const x = Math.sin(dp / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// Converte timestamp pra minutos do dia em BRT.
// Parsers do Unitrac já armazenam BRT como Date.UTC(...) — usar getUTCHours
// direto (ver gerador-kpi.ts:23). Subtrair 3h aqui causava deslocamento duplo
// que gerava ANOM-11 falsa e timestamps errados na tela de revisão.
function dateToMinutesOfDay(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

export function detectaAnomalias(params: DetectaParams): AnomaliaDetectada[] {
  const { rotas, escalaLinhas, paradasIndex, janelasRede, data, lojaCoords } = params
  const anomalias: AnomaliaDetectada[] = []

  // GPS por parada_id (pra ANOM-13). A parada da rota não carrega lat/lng — vem daqui.
  const gpsByParadaId = new Map<string, { lat: number | null; lng: number | null }>()
  for (const list of paradasIndex.values()) for (const p of list) gpsByParadaId.set(p.id, { lat: p.lat, lng: p.lng })

  const escalaPlacas = new Set(
    escalaLinhas.filter((l) => l.placa_norm).map((l) => l.placa_norm as string),
  )
  // redes que cada placa atende (pra filtrar avisos cross-rede)
  const placaRedes = new Map<string, Set<string>>()
  for (const l of escalaLinhas) if (l.placa_norm) (placaRedes.get(l.placa_norm) ?? placaRedes.set(l.placa_norm, new Set()).get(l.placa_norm)!).add(l.rede_id)

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

  // ANOM-15: placa da escala NÃO está no GPS, mas existe uma placa quase igual (1
  // caractere de diferença) no relatório → provável erro de digitação no Unitrac.
  // Caso real KWV-7E49 (escala) x KWV-7E89 (Unitrac): 6 entregas sumiam como "sem
  // rastreador". Avisa o operador pra confirmar/corrigir a placa no painel.
  // Emite UM aviso por linha de escala da placa (kpi_rota_id = id da linha), pra o
  // alerta aparecer FIXADO em cada entrega afetada — não só no resumo do dia.
  const placasReport = [...placasUnitrac]
  const linhasPorPlaca = new Map<string, string[]>()
  for (const l of escalaLinhas) if (l.placa_norm) (linhasPorPlaca.get(l.placa_norm) ?? linhasPorPlaca.set(l.placa_norm, []).get(l.placa_norm)!).push(l.id)
  for (const ep of escalaPlacas) {
    if (placasUnitrac.has(ep)) continue
    const quase = placasReport.find((rp) => !escalaPlacas.has(rp) && charDist(ep, rp) === 1)
    if (quase) {
      const linhas = linhasPorPlaca.get(ep) ?? []
      const alvos = linhas.length ? linhas : [null]
      for (const linhaId of alvos) {
        anomalias.push({
          kpi_rota_id: linhaId,
          parada_id: null,
          data,
          codigo: 'ANOM-15',
          severidade: 'HIGH',
          descricao: `Placa ${ep} (escala) não está no Unitrac, mas há "${quase}" — 1 caractere diferente. Provável placa errada no Unitrac.`,
          sugestao: 'Confirmar/corrigir a placa no painel do Unitrac — as entregas dessa placa estão como "sem rastreador".',
          payload: { placa_escala: ep, placa_unitrac: quase },
        })
      }
    }
  }

  // ANOM-16: rastro suspeito — placa rastreada cujas paradas operacionais (loja/fora
  // de base) são TODAS de madrugada (<5h) ou só ponto isolado, sem entrega. Caso real
  // LCE-4337 (Caxias): 1 único ponto às 00:00 ("marcação arrastada"). Sinaliza
  // rastreador que provavelmente falhou/oscilou.
  for (const placa of escalaPlacas) {
    const lst = paradasIndex.get(placa)
    if (!lst) continue
    const op = lst.filter((p) => p.classificacao === 'LOJA' || p.classificacao === 'FORA_BASE')
    if (op.length === 0) continue
    const todasMadrugada = op.every((p) => p.chegada.getUTCHours() < 5)
    if (op.length <= 1 && todasMadrugada) {
      anomalias.push({
        kpi_rota_id: null,
        parada_id: null,
        data,
        codigo: 'ANOM-16',
        severidade: 'MEDIUM',
        descricao: `Placa ${placa} tem rastro suspeito: só ${op.length} ponto operacional e de madrugada (${op[0].chegada.toISOString().slice(11, 16)}). Rastreador pode ter falhado.`,
        sugestao: 'Conferir manualmente — possível marcação arrastada/oscilante; a rota real pode não ter sido registrada.',
        payload: { placa, qtd_pontos: op.length },
      })
    }
  }

  // ANOM-17: saída-falsa perto de loja — uma parada classificada FAKE_EXIT (saída
  // espúria do rastreador) está a ≤80m de uma loja cadastrada → possível entrega que
  // não foi contada. Caso real KQR Amoedo: ponto a 25m da loja, marcado FAKE_EXIT.
  if (lojaCoords) {
    const lojasArr = [...lojaCoords.values()].filter((l) => l.lat != null && l.lng != null && !(l.lat === 0 && l.lng === 0))
    for (const placa of escalaPlacas) {
      const lst = paradasIndex.get(placa)
      if (!lst) continue
      const redesDaPlaca = placaRedes.get(placa)
      for (const p of lst) {
        if (p.classificacao !== 'FAKE_EXIT' || p.lat == null || p.lng == null) continue
        // só considera lojas da MESMA rede que a placa atende (evita cross-rede: ex
        // placa Zona Sul pegando uma loja Carrefour/Assaí vizinha).
        let nl: typeof lojasArr[number] | null = null, nd = Infinity
        for (const l of lojasArr) { if (l.rede_id && redesDaPlaca && !redesDaPlaca.has(l.rede_id)) continue; const d = haversineM(p.lat, p.lng, l.lat!, l.lng!); if (d < nd) { nd = d; nl = l } }
        if (nl && nd <= 80) {
          anomalias.push({
            kpi_rota_id: null,
            parada_id: p.id,
            data,
            codigo: 'ANOM-17',
            severidade: 'MEDIUM',
            descricao: `Placa ${placa}: ponto a ${Math.round(nd)}m de "${nl.nome ?? 'loja cadastrada'}" foi classificado como saída-falsa pelo Unitrac — possível entrega não contada.`,
            sugestao: 'Conferir se houve entrega nessa loja (o ponto existe, mas o Unitrac marcou como saída espúria).',
            payload: { placa, loja: nl.nome, distancia_m: Math.round(nd) },
          })
        }
      }
    }
  }

  for (const rota of rotas) {
    const rotaId = rota.escala_linha_id  // resolved to DB kpi_rota id in processar/route

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
      } else {
        // GPS existe mas nenhuma parada casou com a escala (UNMATCHED com GPS disponível).
        // ANOM-01 não dispara (placa tem GPS), ANOM-06 não dispara (sem paradas matched).
        // Sem esta branch, a rota ficaria silenciosa — zero anomalias para um problema real.
        anomalias.push({
          kpi_rota_id: rotaId,
          parada_id: null,
          data,
          codigo: 'ANOM-01',
          severidade: 'HIGH',
          descricao: `Placa ${rota.placa_norm} possui dados GPS no Unitrac mas nenhuma parada pôde ser associada à escala para ${data}.`,
          sugestao: 'Verificar nomes de lojas na escala vs. Unitrac — possível divergência de nome ou código.',
          payload: { placa: rota.placa_norm, escala_linha_id: rota.escala_linha_id, tem_gps: true },
        })
      }
    }

    // ANOM-03: FORA_BASE com duração >= 10min e sem loja_id
    for (const parada of rota.paradas) {
      if (parada.classificacao === 'FORA_BASE' && parada.duracao_min >= 10 && !parada.loja_id) {
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

    // ANOM-04: tempo negativo (saida < chegada) ou duração zero (saida nula no Unitrac → saida=chegada)
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
      } else if (parada.duracao_min === 0 && parada.saida.getTime() === parada.chegada.getTime()) {
        // saida era null no Unitrac — route.ts definiu saida=chegada, duracao_min=0.
        // Usa ANOM-12 (não está em ANOMALIAS_HIGH) para não pintar a linha de vermelho
        // só porque o rastreador não fechou a parada.
        anomalias.push({
          kpi_rota_id: rotaId,
          parada_id: parada.parada_id,
          data,
          codigo: 'ANOM-12',
          severidade: 'MEDIUM',
          descricao: `Parada em "${parada.nome}" (placa ${rota.placa_norm}) sem saída registrada no Unitrac — duração zero.`,
          sugestao: 'Verificar se o rastreador fechou a parada corretamente ou se o veículo ainda estava no local.',
          payload: {
            placa: rota.placa_norm,
            nome_parada: parada.nome,
            chegada: parada.chegada.toISOString(),
            saida: parada.saida.toISOString(),
            duracao_min: 0,
          },
        })
      }
    }

    // ANOM-13: entrega geograficamente IMPLAUSÍVEL — a parada creditada está a >2km
    // da loja casada (coord do cadastro válida). Pega falso-positivo/super-contagem
    // (ex: transbordo "O BOM" creditado a 47km da loja real, ou coord trocada). Não
    // bloqueia (o operador confere) — só impede que info errada passe silenciosa.
    if (lojaCoords) {
      for (const parada of rota.paradas) {
        if (!parada.loja_id || !parada.parada_id) continue
        const lc = lojaCoords.get(parada.loja_id)
        const gps = gpsByParadaId.get(parada.parada_id)
        if (lc && lc.lat != null && lc.lng != null && !(lc.lat === 0 && lc.lng === 0) && gps?.lat != null && gps?.lng != null) {
          const dist = Math.round(haversineM(gps.lat, gps.lng, lc.lat, lc.lng))
          if (dist > 2000) {
            anomalias.push({
              kpi_rota_id: rotaId,
              parada_id: parada.parada_id,
              data,
              codigo: 'ANOM-13',
              severidade: 'MEDIUM',
              descricao: `Entrega de ${rota.placa_norm} em "${parada.nome}" está a ${(dist / 1000).toFixed(1)}km da loja cadastrada — distância implausível.`,
              sugestao: 'Conferir se a entrega é nessa loja mesmo ou se a coordenada do cadastro está errada (possível ponto de transbordo).',
              payload: { placa: rota.placa_norm, nome_parada: parada.nome, distancia_m: dist },
            })
          }
        }
      }
    }

    // ANOM-05: divergência de rota (paradas LOJA != 1 quando loja única na escala)
    // Only applies when loja_nome_raw represents a single store (heuristic: no "/" or "E " separator)
    const escalaLinha = escalaLinhas.find((l) => l.id === rota.escala_linha_id)
    if (escalaLinha) {
      const lojaStr = escalaLinha.loja_nome_raw ?? ''
      const isMultiLoja = /\s*[/\\]\s*|\s+E\s+/i.test(lojaStr)
      if (!isMultiLoja) {
        // Conta qualquer parada matched (LOJA ou FORA_BASE via geo) como visita a loja.
        // Antes contava só 'LOJA', disparando ANOM-05 para entregas resolvidas via geo.
        const qtdLojaParadas = rota.paradas.length
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
        // Janela normal (ex: 06:00-18:00): foraJanela se saída antes do início OU depois do fim.
        // Janela que vira meia-noite (ex: 22:00-06:00): está DENTRO se >= inicio OU <= fim.
        // foraJanela = NOT dentro = saidaMin < inicioMin AND saidaMin > fimMin.
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

  // ANOM-14: a MESMA placa creditada com duas entregas SOBREPOSTAS no tempo (em lojas
  // diferentes) — fisicamente impossível p/ um caminhão. Sinaliza super-contagem (ex:
  // transbordo creditado a 2 linhas ao mesmo tempo). Usa a placa que realmente entregou.
  const porPlaca = new Map<string, Array<{ ini: number; fim: number; nome: string; loja_id: string | null }>>()
  for (const rota of rotas) {
    const placa = rota.placa_real ?? rota.placa_norm
    if (!placa) continue
    for (const p of rota.paradas) {
      if (!p.loja_id) continue
      const arr = porPlaca.get(placa) ?? []
      arr.push({ ini: p.chegada.getTime(), fim: (p.saida ?? p.chegada).getTime(), nome: p.nome, loja_id: p.loja_id })
      porPlaca.set(placa, arr)
    }
  }
  for (const [placa, arr] of porPlaca) {
    arr.sort((a, b) => a.ini - b.ini)
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1], cur = arr[i]
      // sobreposição real (>1min) e em lojas distintas
      if (cur.ini < prev.fim - 60_000 && cur.loja_id !== prev.loja_id) {
        anomalias.push({
          kpi_rota_id: null,
          parada_id: null,
          data,
          codigo: 'ANOM-14',
          severidade: 'HIGH',
          descricao: `Placa ${placa} aparece entregando em "${prev.nome}" e "${cur.nome}" ao mesmo tempo — impossível para um caminhão.`,
          sugestao: 'Conferir: provável super-contagem (mesma parada/transbordo creditada a 2 lojas).',
          payload: { placa, loja_a: prev.nome, loja_b: cur.nome },
        })
      }
    }
  }

  // ANOM-09: skipped (needs alteracoes integration)

  return anomalias
}
