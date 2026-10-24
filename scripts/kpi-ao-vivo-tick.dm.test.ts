// Revisao F3-07 (R5): o alertar-dm.mjs do monitoramento sai SEMPRE com codigo
// 0 ("nunca derruba o cron"), inclusive quando o envio pelo WhatsApp falha
// (so' escreve "envio falhou" no stderr). O aviso de romaneio gravava
// dm: 'enviado' e o log dizia "enviado ao dono" sem nova tentativa. Aqui o
// enviarAlertaDm real roda scripts falsos com a saida do alertar-dm.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { enviarAlertaDm } from './kpi-ao-vivo-tick'

let dir = ''
const script = (nome: string, corpo: string) => { const p = join(dir, nome); writeFileSync(p, corpo); return p }

beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'alertar-dm-')) })
afterAll(() => { rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs() })

describe('enviarAlertaDm (R5)', () => {
  it('envio ok ("alerta X enviado") => true', async () => {
    vi.stubEnv('KPI_ALERTAR_DM_SCRIPT', script('ok.mjs', 'console.log(`alerta ${process.argv[2]} enviado`)'))
    expect(await enviarAlertaDm('romaneio-ausente-2026-10-21-0630', 'x')).toBe(true)
  })
  it('ja enviado nas ultimas 6 h (o dono ja recebeu) => true', async () => {
    vi.stubEnv('KPI_ALERTAR_DM_SCRIPT', script('dedup.mjs', 'console.log(`alerta ${process.argv[2]}: ja\' enviado nas ultimas 6 h, nao repete`)'))
    expect(await enviarAlertaDm('romaneio-ausente-2026-10-21-0630', 'x')).toBe(true)
  })
  it('WhatsApp falhou com saida 0 ("envio falhou" no stderr) => false', async () => {
    vi.stubEnv('KPI_ALERTAR_DM_SCRIPT', script('falhou.mjs', 'console.error(`alerta ${process.argv[2]}: envio falhou (255) ssh: connect refused`); process.exit(0)'))
    expect(await enviarAlertaDm('romaneio-ausente-2026-10-21-0630', 'x')).toBe(false)
  })
  it('script ausente ou quebrado => false', async () => {
    vi.stubEnv('KPI_ALERTAR_DM_SCRIPT', join(dir, 'nao-existe.mjs'))
    expect(await enviarAlertaDm('k', 'x')).toBe(false)
  })
})
