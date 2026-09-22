// Ponta a ponta do fuso: resposta CRUA da ponte (offset real) -> buscarHorariosBase
// (que mascara em digitos BRT + Z falso) -> sugerirCorrecoesPorAlvo com feitoISO
// da Unitrac (digitos BRT sem fuso). Os dois lados precisam estar na mesma convencao.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { buscarHorariosBase } from './base-horarios'
import { sugerirCorrecoesPorAlvo } from './correcao-por-alvo'
import type { AlvoApi } from '@/lib/unitrac-api'

beforeEach(() => {
  process.env.MOTOR_SECRET = 'segredo-teste'
  process.env.MONITORAMENTO_URL = 'http://127.0.0.1:3010'
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.MOTOR_SECRET
  delete process.env.MONITORAMENTO_URL
})

describe('correcao por alvo ponta a ponta (ponte crua -> casamento)', () => {
  it('parada 13:31-13:36+02:00 (08:31-08:36 BRT) casa com feito 08:35 BRT', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        resultados: [{
          placa: 'AAA1A11', saidaBase: null, chegadaBase: null, kmPercorrido: null,
          paradas: [{ chegada: '2026-09-21T13:31:00+02:00', saida: '2026-09-21T13:36:00+02:00', duracaoSeg: 300, lat: -21.8434, lng: -41.43, classificacao: 'FORA_BASE' }],
        }],
      }),
    } as Response)

    const horarios = await buscarHorariosBase(['AAA1A11'], '2026-09-21', new Map(), true)
    const paradas = horarios.get('AAA1A11')?.paradas ?? []
    expect(paradas).toHaveLength(1)

    const alvo: AlvoApi = {
      placaNorm: 'AAA1A11', codigoUnitrac: '136118', nome: 'LOJA', situacao: 1,
      feitoISO: '2026-09-21T08:35:00', documento: '100', inicioISO: '2026-09-21T06:00:00',
      ordem: 1, rota: 'R1', pontoLat: null, pontoLng: null,
    }
    const r = sugerirCorrecoesPorAlvo(
      [{ nf: '100', placaNorm: 'AAA1A11', endereco: 'EST DORES DE MACABU, 286 - DORES DE MACABU, CAMPOS DOS GOYT', latAtual: -21.88, lngAtual: -41.46, confiavelAtual: false, fonteAtual: null }],
      [alvo],
      new Map([['AAA1A11', paradas]]),
    )
    expect(r.rejeicoes).toEqual([])
    expect(r.sugestoes).toHaveLength(1)
    expect(r.sugestoes[0]).toMatchObject({ latNova: -21.8434, lngNova: -41.43, nfs: ['100'] })
  })
})
