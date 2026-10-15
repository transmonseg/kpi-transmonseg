import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { instanteDeFeitoISO } from './correcao-por-alvo'

// KM-04 (auditoria 15/10): feitoISO da Unitrac vem SEM fuso ('2026-10-14T19:27:41.958526',
// digitos ja em BRT). `new Date(feitoISO)` le no fuso da MAQUINA: no servidor (CEST)
// desloca 2 h, no Mac (BRT) +3 h, e a janela de prova / inferencia temporal
// compara na convencao "BRT mascarado como Z". Todo consumidor usa
// instanteDeFeitoISO.
describe('feitoISO no fuso certo (KM-04)', () => {
  it('instanteDeFeitoISO le os digitos como BRT-mascarado-como-Z, independente do TZ da maquina', () => {
    expect(instanteDeFeitoISO('2026-10-14T19:27:41.958526')).toBe(Date.parse('2026-10-14T19:27:41.958526Z'))
    expect(instanteDeFeitoISO('2026-10-14T19:27:41Z')).toBe(Date.parse('2026-10-14T19:27:41Z'))
  })

  it('nenhum arquivo de src/lib/kpi-romaneio constroi Date direto de feitoISO', () => {
    const dir = join(__dirname)
    const ofensores: string[] = []
    for (const nome of readdirSync(dir)) {
      if (!nome.endsWith('.ts') || nome.endsWith('.test.ts')) continue
      const linhas = readFileSync(join(dir, nome), 'utf8').split('\n')
      linhas.forEach((l, i) => {
        if (/^\s*(\/\/|\*)/.test(l)) return
        if (/new Date\([^)]*feitoISO/.test(l)) ofensores.push(`${nome}:${i + 1}: ${l.trim()}`)
      })
    }
    expect(ofensores).toEqual([])
  })
})
