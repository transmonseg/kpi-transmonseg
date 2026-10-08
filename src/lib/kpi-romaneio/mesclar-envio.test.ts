import { describe, expect, it } from 'vitest'
import { mesclarEnvio, type DiaGuardado } from './mesclar-envio'

const rom = (nf: string) => ({ nf }) as never
const esc = (carga: string) => ({ carga }) as never
const antes: DiaGuardado = { romaneio: [rom('1'), rom('2')], escala: [esc('A')], pao: { linhas: [rom('p1')], escala: [esc('PAO-1')] }, escalaEnviada: true, paoEnviado: true }

describe('mesclarEnvio (arquivo esquecido, 08/10)', () => {
  it('so\' o pao novo: romaneio e escala do dia continuam', () => {
    const r = mesclarEnvio(antes, { pao: { linhas: [rom('p9')], escala: [esc('PAO-9')] } })
    expect(r).toMatchObject({ romaneio: antes.romaneio, escala: antes.escala, escalaEnviada: true, paoEnviado: true })
    expect((r as DiaGuardado).pao.linhas).toEqual([rom('p9')])
  })
  it('so\' o romaneio novo: o pao e a escala ja enviados NAO somem', () => {
    const r = mesclarEnvio(antes, { romaneio: [rom('9')] }) as DiaGuardado
    expect(r.romaneio).toEqual([rom('9')])
    expect(r.pao).toEqual(antes.pao)
    expect(r.escala).toEqual(antes.escala)
    expect(r.paoEnviado && r.escalaEnviada).toBe(true)
  })
  it('so\' a escala nova: marca escalaEnviada e mantem o resto', () => {
    const base: DiaGuardado = { ...antes, escala: [], escalaEnviada: false }
    const r = mesclarEnvio(base, { escala: [esc('B')] }) as DiaGuardado
    expect(r.escala).toEqual([esc('B')])
    expect(r.escalaEnviada).toBe(true)
    expect(r.romaneio).toEqual(antes.romaneio)
  })
  it('primeiro envio do dia sem romaneio: erro (nada pra completar)', () => {
    expect(mesclarEnvio(null, { pao: { linhas: [], escala: [] } })).toEqual({ erro: 'Envie o Romaneio de Entrega (PDF).' })
  })
  it('primeiro envio do dia com romaneio: guarda so\' o que veio', () => {
    const r = mesclarEnvio(null, { romaneio: [rom('1')] }) as DiaGuardado
    expect(r).toMatchObject({ romaneio: [rom('1')], escala: [], escalaEnviada: false, paoEnviado: false, pao: { linhas: [], escala: [] } })
  })
  it('nenhum arquivo: erro', () => {
    expect(mesclarEnvio(antes, {})).toEqual({ erro: 'Escolha pelo menos um arquivo.' })
  })
})
