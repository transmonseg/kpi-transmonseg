import type { AlvoApi } from '@/lib/unitrac-api/alvos'
import type { ResumoVeiculo, ParadaUnitrac } from '@/lib/types/unitrac'
import type { LinhaEscalaNutrimax, LinhaKpiLojaNutrimax } from './types'
import { montaResumoViagemPorPlaca } from './resumo-viagem'

function acharSaidaBase(paradas: ParadaUnitrac[]): string | null {
  const bases = paradas.filter(p => p.classificacao === 'BASE')
  return bases.length > 0 ? bases[0].saida.toISOString() : null
}

// Só conta como "voltou" se existe uma 2ª permanência em base DEPOIS de ter
// saído — uma única parada BASE o dia inteiro não é ida-e-volta, é "nunca saiu".
function acharChegadaBase(paradas: ParadaUnitrac[]): string | null {
  const bases = paradas.filter(p => p.classificacao === 'BASE')
  return bases.length > 1 ? bases[bases.length - 1].chegada.toISOString() : null
}

function diffMin(inicioIso: string | null, fimIso: string | null): number | null {
  if (!inicioIso || !fimIso) return null
  const min = Math.round((new Date(fimIso).getTime() - new Date(inicioIso).getTime()) / 60000)
  return min >= 0 ? min : null
}

/** Cruza Escala (motorista/placa) + alvos da Unitrac (loja/NF/confirmação) +
 *  GPS clusterizado (saída/chegada de base, saída da loja) numa linha por
 *  loja visitada. `alvos` e `resumosVeiculo` já devem vir filtrados pras
 *  placas da escala (mesmo padrão de buscarResumosViagemViaApi). */
export function montaKpiLojaNutrimax(
  escala: LinhaEscalaNutrimax[],
  alvos: AlvoApi[],
  resumosVeiculo: ResumoVeiculo[],
): LinhaKpiLojaNutrimax[] {
  const motoristaPorPlaca = new Map(escala.map(e => [e.placaNorm, e.motorista]))
  const resumoPorPlaca = new Map(resumosVeiculo.map(r => [r.placa_norm, r]))
  const kmPorPlaca = new Map(montaResumoViagemPorPlaca(resumosVeiculo).map(r => [r.placaNorm, r.kmPercorrido]))

  const alvosPorPlaca = new Map<string, AlvoApi[]>()
  for (const a of alvos) {
    const arr = alvosPorPlaca.get(a.placaNorm) ?? []
    arr.push(a)
    alvosPorPlaca.set(a.placaNorm, arr)
  }

  const linhas: LinhaKpiLojaNutrimax[] = []

  for (const e of escala) {
    const placaNorm = e.placaNorm
    if (!placaNorm) continue
    const motorista = motoristaPorPlaca.get(placaNorm) ?? e.motorista
    const alvosDaPlaca = alvosPorPlaca.get(placaNorm)

    if (!alvosDaPlaca || alvosDaPlaca.length === 0) {
      linhas.push({
        loja: '—', motorista, placaNorm,
        saidaBase: null, chegadaLoja: null, saidaLoja: null, tempoNaLojaMin: null,
        chegadaBase: null, tempoOperacaoMin: null, kmPercorrido: null,
        status: 'sem_rastreador',
      })
      continue
    }

    const paradas = resumoPorPlaca.get(placaNorm)?.paradas ?? []
    const saidaBase = acharSaidaBase(paradas)
    const chegadaBase = acharChegadaBase(paradas)
    const km = kmPorPlaca.get(placaNorm) ?? null

    // Agrupa por loja (codigoUnitrac) — 2 NFs pro mesmo ponto viram 1 linha,
    // não 2 idênticas (visto em dado real: mesmo cliente, 2 documentos, 1 visita).
    const porLoja = new Map<string, AlvoApi[]>()
    for (const a of alvosDaPlaca) {
      const chave = a.codigoUnitrac || 'SEM_CODIGO'
      const arr = porLoja.get(chave) ?? []
      arr.push(a)
      porLoja.set(chave, arr)
    }

    const linhasDaPlaca: LinhaKpiLojaNutrimax[] = []
    for (const [codigoUnitrac, grupo] of porLoja) {
      const confirmados = grupo
        .filter(a => a.situacao === 1 && a.feitoISO)
        .sort((a, b) => a.feitoISO!.localeCompare(b.feitoISO!))
      const chegadaLoja = confirmados[0]?.feitoISO ?? null

      const paradaGps = paradas.find(p => p.classificacao === 'LOJA' && p.codigo_loja === codigoUnitrac)
      const saidaLoja = paradaGps ? paradaGps.saida.toISOString() : null

      linhasDaPlaca.push({
        loja: grupo[0].nome, motorista, placaNorm,
        saidaBase, chegadaLoja, saidaLoja,
        tempoNaLojaMin: diffMin(chegadaLoja, saidaLoja),
        chegadaBase, tempoOperacaoMin: diffMin(saidaBase, chegadaBase),
        kmPercorrido: km,
        status: chegadaLoja ? 'confirmado' : 'pendente',
      })
    }

    // Ordena por horário de chegada — lojas ainda pendentes (sem horário) no final.
    linhasDaPlaca.sort((a, b) => {
      if (!a.chegadaLoja && !b.chegadaLoja) return 0
      if (!a.chegadaLoja) return 1
      if (!b.chegadaLoja) return -1
      return a.chegadaLoja.localeCompare(b.chegadaLoja)
    })
    linhas.push(...linhasDaPlaca)
  }

  return linhas
}
