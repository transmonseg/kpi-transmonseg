// 12/11 (ideia da Érica, pedido da Rio Quality): o motorista seguiu a ordem da
// roteirização? A ordem planejada vem do relatório da Fusion com ORDEM
// (parse-ordem-rota.ts); a real é a hora de chegada que o KPI já mediu pelo GPS.
//
// Regra, por romaneio (uma viagem): entregas feitas, ordenadas pela chegada.
// "Na ordem" = a maior sequência delas que respeita a ordem planejada (maior
// subsequência não decrescente). As demais foram feitas fora da ordem -- o
// motorista pulou e voltou, ou inverteu. Pura: aplicada por cima do cálculo na
// hora de servir a tela, como as conferências (nunca gravada no cálculo).

export type OrdemPlanejada = { nf: string; romaneio: string; ordem: number; previsaoInicio: string | null }

export type OrdemDaNf = { planejada: number; real: number; naOrdem: boolean; romaneio: string; previsao: string | null }
export type ResumoOrdem = { entregas: number; naOrdem: number; pct: number; /** viagens feitas de trás pra frente (sequência inversa bate bem melhor) */ invertidas?: number }

/** Viagem feita ao contrário: a sequência inversa cobre >= 70% e mais que a direta. */
export function viagemInvertida(ordens: number[]): boolean {
  if (ordens.length < 4) return false
  const inversa = naOrdemIndices(ordens.map(o => -o)).size
  return inversa >= 0.7 * ordens.length && inversa > naOrdemIndices(ordens).size
}

type Nf = { nf: string; situacao: string; chegada: string | null; ordemRota?: OrdemDaNf }
type Placa = { nfs: Nf[]; ordemRota?: ResumoOrdem }
type ComPlacas = { placas: Placa[]; resumo?: object; marca?: string; calculadoEm: string }

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0)

/** Índices (na lista dada) que formam a maior subsequência não decrescente. */
export function naOrdemIndices(ordens: number[]): Set<number> {
  const caudas: number[] = [] // índice do último elemento de cada tamanho
  const anterior = new Array<number>(ordens.length).fill(-1)
  for (let i = 0; i < ordens.length; i++) {
    let lo = 0, hi = caudas.length
    while (lo < hi) { const m = (lo + hi) >> 1; if (ordens[caudas[m]] <= ordens[i]) lo = m + 1; else hi = m }
    if (lo > 0) anterior[i] = caudas[lo - 1]
    caudas[lo] = i
  }
  const s = new Set<number>()
  for (let k = caudas.length ? caudas[caudas.length - 1] : -1; k >= 0; k = anterior[k]) s.add(k)
  return s
}

/** Previsão "DD/MM/AAAA HH:MM:SS" -> "HH:MM". */
const hora = (p: string | null) => (p && /\d{2}:\d{2}/.test(p) ? p.match(/(\d{2}:\d{2})/)![1] : null)

export function marcaComOrdem(marca: string, enviadoEm: string | null): string {
  return enviadoEm ? `${marca}#ordem-${enviadoEm}` : marca
}

export function aplicarOrdemRota<R extends ComPlacas>(r: R, planejada: OrdemPlanejada[], enviadoEm: string | null = null): R & { ordemRota?: ResumoOrdem } {
  if (!planejada.length) return r
  const porNf = new Map(planejada.map(p => [p.nf, p]))
  let totE = 0, totOk = 0
  const placas = r.placas.map(p => {
    const nfs = p.nfs.map(n => ({ ...n }))
    const porRomaneio = new Map<string, { n: Nf; o: OrdemPlanejada }[]>()
    for (const n of nfs) {
      const o = porNf.get(n.nf)
      if (!o || n.situacao !== 'entregue' || !n.chegada) continue
      const l = porRomaneio.get(o.romaneio) ?? []
      l.push({ n, o })
      porRomaneio.set(o.romaneio, l)
    }
    let e = 0, ok = 0, invertidas = 0
    for (const lista of porRomaneio.values()) {
      // Mesma chegada (várias notas do mesmo cliente): desempata pela planejada.
      lista.sort((a, b) => (a.n.chegada! < b.n.chegada! ? -1 : a.n.chegada! > b.n.chegada! ? 1 : a.o.ordem - b.o.ordem))
      const certos = naOrdemIndices(lista.map(x => x.o.ordem))
      lista.forEach((x, i) => {
        x.n.ordemRota = { planejada: x.o.ordem, real: i + 1, naOrdem: certos.has(i), romaneio: x.o.romaneio, previsao: hora(x.o.previsaoInicio) }
      })
      e += lista.length; ok += certos.size
      if (viagemInvertida(lista.map(x => x.o.ordem))) invertidas++
    }
    totE += e; totOk += ok
    return e ? { ...p, nfs, ordemRota: { entregas: e, naOrdem: ok, pct: pct(ok, e), ...(invertidas ? { invertidas } : {}) } } : { ...p, nfs }
  })
  return {
    ...r, placas,
    ordemRota: { entregas: totE, naOrdem: totOk, pct: pct(totOk, totE) },
    marca: marcaComOrdem(r.marca ?? r.calculadoEm, enviadoEm),
  }
}
