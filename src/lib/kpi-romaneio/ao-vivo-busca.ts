// Busca e filtro de notas no Ao vivo (06/10, tia Érica: "um campo para digitar
// nome de um cliente ou número da nota para buscar e confirmar se já foi
// entregue" + "filtro para ver as notas pendentes e realizadas").
import type { NfAoVivo, PlacaAoVivo } from './ao-vivo'

export type FiltroNf = 'todas' | 'pendentes' | 'entregues'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

export type AchadoNf = { placa: string; nf: NfAoVivo }

/** Notas do dia cujo número ou cliente contém o texto (>= 3 caracteres). */
export function buscarNfs(placas: PlacaAoVivo[], texto: string, limite = 30): AchadoNf[] {
  const q = norm(texto)
  if (q.replace(/[^0-9A-Z]/g, '').length < 3) return []
  const out: AchadoNf[] = []
  for (const p of placas) for (const n of p.nfs) {
    if (n.nf.includes(q) || norm(n.cliente).includes(q)) out.push({ placa: p.placa, nf: n })
    if (out.length >= limite) return out
  }
  return out
}

/** Pendentes = tudo que ainda não está entregue (pendente, a revisar, não foi...). */
export function filtrarNfs(nfs: NfAoVivo[], f: FiltroNf): NfAoVivo[] {
  if (f === 'entregues') return nfs.filter(n => n.situacao === 'entregue')
  if (f === 'pendentes') return nfs.filter(n => n.situacao !== 'entregue')
  return nfs
}
