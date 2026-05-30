export interface TourState { ativo: boolean; cap: number }

let estado: TourState = { ativo: false, cap: 0 }
const listeners = new Set<() => void>()

export function getTour(): TourState { return estado }
export function setTour(next: Partial<TourState>): void {
  estado = { ...estado, ...next }
  listeners.forEach(l => l())
}
export function subTour(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
export function iniciarTutorial(): void { setTour({ ativo: true, cap: 0 }) }
export function encerrarTutorial(): void {
  setTour({ ativo: false, cap: 0 })
  try { localStorage.setItem('kpi-tutorial-v2', 'done') } catch { /* ignore */ }
}
export function tourJaVisto(): boolean {
  try { return !!localStorage.getItem('kpi-tutorial-v2') } catch { return true }
}
