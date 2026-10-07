// Resumo da investigação por placa (usado pela tela; sem imports de servidor).
import type { PlacaAoVivo } from './ao-vivo'
import type { CategoriaInvestigacao } from './investigacao'

export type ResumoInvestigacao = {
  /** Não entregues com a rota encerrada (pendente fica de fora). */
  total: number
  aguardando: number
  porCategoria: Partial<Record<CategoriaInvestigacao, number>>
  placas: { placa: string; naoEntregues: number; porCategoria: Partial<Record<CategoriaInvestigacao, number>> }[]
}

export function resumirInvestigacao(placas: PlacaAoVivo[]): ResumoInvestigacao {
  const r: ResumoInvestigacao = { total: 0, aguardando: 0, porCategoria: {}, placas: [] }
  for (const p of placas) {
    const linha = { placa: p.placa, naoEntregues: 0, porCategoria: {} as Partial<Record<CategoriaInvestigacao, number>> }
    for (const n of p.nfs) {
      if (n.situacao === 'entregue') continue
      if (n.situacao === 'pendente') { r.aguardando++; continue }
      const c = n.investigacao?.categoria
      if (!c) continue
      r.total++
      linha.naoEntregues++
      r.porCategoria[c] = (r.porCategoria[c] ?? 0) + 1
      linha.porCategoria[c] = (linha.porCategoria[c] ?? 0) + 1
    }
    if (linha.naoEntregues > 0) r.placas.push(linha)
  }
  r.placas.sort((a, b) => b.naoEntregues - a.naoEntregues || a.placa.localeCompare(b.placa))
  return r
}

