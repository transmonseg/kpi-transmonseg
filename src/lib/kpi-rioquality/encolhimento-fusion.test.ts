// Revisao Fase 2 (F2-REV-02): a Fusion envia o dia ao monitoramento em modo
// "substituir" a cada tick. Romaneio que volta sem rows (resposta anomala)
// sumia do dia e o monitoramento apagava os pontos dele, com a presenca.
// Caso real: 20/10 (fonte fusion), 2.450 NFs em 88 romaneios; o romaneio
// 1167566 (RKQ4E88) tem 40 NFs. Sem ele o envio tem 2.410 (98%) e passa pela
// trava de 50% do monitoramento (motivoParaNaoSubstituirRQ).
import { describe, it, expect } from 'vitest'
import { romaneiosQueEncolheram, decidirEncolhimentoFusion, LEITURAS_PARA_ACEITAR_ENCOLHIMENTO } from './encolhimento-fusion'
import type { EntregaRioQualityCompleta } from './parse-planilhas'

const nfs = (romaneio: string, placaNorm: string, n: number, base: number) =>
  Array.from({ length: n }, (_, i) => ({ romaneio, placaNorm, nf: String(base + i) }) as unknown as EntregaRioQualityCompleta)

// 20/10: RKQ4E88 com 40 NFs + o resto do dia (2.410 NFs) em outros romaneios
const outros = Array.from({ length: 87 }, (_, k) => nfs(String(1167000 + k), `PLC${k}`, k < 61 ? 28 : 27, 6000000 + k * 100)).flat()
const dia2010 = [...nfs('1167566', 'RKQ4E88', 40, 6072000), ...outros]

describe('romaneiosQueEncolheram (F2-REV-02)', () => {
  it('20/10: o romaneio 1167566 (RKQ4E88, 40 NFs) volta sem rows -> encolheu 40 -> 0, mesmo com 98% do dia', () => {
    expect(dia2010).toHaveLength(2450)
    expect(outros).toHaveLength(2410)
    expect(romaneiosQueEncolheram(dia2010, outros)).toEqual([{ romaneio: '1167566', placa: 'RKQ4E88', antes: 40, agora: 0 }])
  })

  it('romaneio que volta com parte das NFs tambem conta; dia que so cresce nao', () => {
    const parcial = [...nfs('1167566', 'RKQ4E88', 10, 6072000), ...outros]
    expect(romaneiosQueEncolheram(dia2010, parcial)).toEqual([{ romaneio: '1167566', placa: 'RKQ4E88', antes: 40, agora: 10 }])
    expect(romaneiosQueEncolheram(dia2010, [...dia2010, ...nfs('1169999', 'NOV1A11', 3, 7000000)])).toEqual([])
    expect(romaneiosQueEncolheram([], outros)).toEqual([])
  })

  it('NF reatribuida a outro romaneio (20/10: 81 NFs trocaram de carro) nao e encolhimento: ela continua no dia', () => {
    const [primeira, ...resto] = nfs('1167566', 'RKQ4E88', 40, 6072000)
    const movida = { ...primeira, romaneio: '1167753', placaNorm: 'SRE7B39' } as EntregaRioQualityCompleta
    expect(romaneiosQueEncolheram(dia2010, [...resto, movida, ...outros])).toEqual([])
  })
})

describe('decidirEncolhimentoFusion (F2-REV-02)', () => {
  const enc = [{ romaneio: '1167566', placa: 'RKQ4E88', antes: 40, agora: 0 }]

  it('1a e 2a leitura igual: recusa (dia guardado e mapa ficam); a 3a seguida aceita (cancelamento de verdade)', () => {
    const a = decidirEncolhimentoFusion(enc, null)
    expect(a.aceitar).toBe(false)
    expect(a.mensagem).toContain('1167566 (RKQ4E88) 40 -> 0')
    expect(a.mensagem).toContain(`1/${LEITURAS_PARA_ACEITAR_ENCOLHIMENTO}`)
    const b = decidirEncolhimentoFusion(enc, a.estado)
    expect(b.aceitar).toBe(false)
    const c = decidirEncolhimentoFusion(enc, b.estado)
    expect(c.aceitar).toBe(true)
    expect(c.mensagem).toContain('aceito')
    expect(c.estado).toBeNull()
  })

  it('encolhimento diferente recomeca a contagem; sem encolhimento limpa o estado', () => {
    const a = decidirEncolhimentoFusion(enc, null)
    const outro = decidirEncolhimentoFusion([{ romaneio: '1167753', placa: 'SRE7B39', antes: 41, agora: 0 }], a.estado)
    expect(outro.aceitar).toBe(false)
    expect(outro.mensagem).toContain(`1/${LEITURAS_PARA_ACEITAR_ENCOLHIMENTO}`)
    expect(decidirEncolhimentoFusion([], a.estado)).toEqual({ aceitar: true, estado: null, mensagem: null })
  })
})
