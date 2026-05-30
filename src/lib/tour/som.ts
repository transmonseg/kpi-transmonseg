// Efeitos sonoros do tutorial via Web Audio (sem arquivos). Sons curtos e sutis.
// O AudioContext só "destrava" após um gesto do usuário — por isso `ativarSom()`
// é chamado no primeiro clique do tour.

let ctx: AudioContext | null = null

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!ctx) ctx = new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Toca um tom curto com envelope suave (ataque rápido, decay exponencial). */
function tom(freq: number, dur: number, delay = 0, tipo: OscillatorType = 'sine', vol = 0.06) {
  const c = ac()
  if (!c) return
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = tipo
  osc.frequency.setValueAtTime(freq, t0)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

/** "Destrava" o áudio — chamar no primeiro gesto (clique) do tour. */
export function ativarSom(): void {
  ac()
}

/** Pop suave ao avançar de passo. */
export function somPasso(): void {
  tom(660, 0.10, 0, 'sine', 0.05)
  tom(990, 0.08, 0.035, 'sine', 0.03)
}

/** Ding ascendente de conclusão. */
export function somFim(): void {
  tom(523.25, 0.16, 0.0, 'sine', 0.06)   // C5
  tom(659.25, 0.16, 0.10, 'sine', 0.06)  // E5
  tom(783.99, 0.30, 0.20, 'sine', 0.07)  // G5
}
