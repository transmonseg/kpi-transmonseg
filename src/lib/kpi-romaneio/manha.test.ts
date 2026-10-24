import { describe, it, expect } from 'vitest'
import {
  MARCOS_AVISO_ROMANEIO, FROTA_RODANDO_MIN, minutoBR, marcoDaVez, registrarChegadas, partesPresentes,
  checklistDaManha, decidirAvisoRomaneio, bannersAvisoRomaneio, type EstadoAvisoRomaneio,
} from './manha'

// F3-07 (ACH-04). Casos reais (kpi_ao_vivo_dia / romaneio_pontos / replay do
// monitoramento, lidos em 24/10, só leitura):
//  - Nutry: romaneio chegou 14/10 09:40, 17/10 15:40, 21/10 10:30, 22/10 09:25,
//    23/10 09:40 BRT; as cargas saem entre 05:41 e 07:18.
//  - RQ 21/10: Fusion fora o dia todo (romaneio só às 15:01, subido à mão);
//    105 carros rodaram sem romaneio no replay.
//  - 19/10 (domingo): a Nutry não rodou (1 carro andando); a RQ rodou com 21.

const ms = (iso: string) => Date.parse(iso)
const AS_0631 = ms('2026-10-21T09:31:00Z') // 06:31 BRT
const AS_0629 = ms('2026-10-21T09:29:00Z')
const AS_0735 = ms('2026-10-21T10:35:00Z')

describe('relógio de Brasília (servidor em Europe/Berlin)', () => {
  it('minuto do dia em BRT independe do fuso do processo', () => {
    expect(minutoBR(AS_0631)).toBe(6 * 60 + 31)
    expect(minutoBR(ms('2026-10-21T02:59:00Z'))).toBe(23 * 60 + 59)
  })
  it('marcos 06:30 e 07:30', () => {
    expect(MARCOS_AVISO_ROMANEIO).toEqual(['06:30', '07:30'])
  })
})

describe('marcoDaVez (calculado no tick, não em horário fixo do cron)', () => {
  it('antes das 06:30 nada; 06:31 => 06:30; tick das 07:35 sem ter feito o das 06:30 => só o 07:30 (o 06:30 fica pulado)', () => {
    expect(marcoDaVez(null, AS_0629)).toBeNull()
    expect(marcoDaVez(null, AS_0631)).toEqual({ marco: '06:30', pulados: [] })
    expect(marcoDaVez(null, AS_0735)).toEqual({ marco: '07:30', pulados: ['06:30'] })
  })
  it('revisão F3-07 (R5): DM que falhou é tentada de novo no tick seguinte, até 3 vezes', () => {
    const falhou = (tentativas: number): EstadoAvisoRomaneio => ({ marcos: { '06:30': { em: '2026-10-21T09:31:00Z', faltando: [], dm: 'falhou', tentativas } } })
    expect(marcoDaVez(falhou(1), ms('2026-10-21T09:41:00Z'))).toEqual({ marco: '06:30', pulados: [] })
    expect(marcoDaVez(falhou(3), ms('2026-10-21T09:51:00Z'))).toBeNull()
  })
  it('marco já feito não repete', () => {
    const e: EstadoAvisoRomaneio = { marcos: { '06:30': { em: '2026-10-21T09:31:00Z', faltando: [], dm: null } } }
    expect(marcoDaVez(e, ms('2026-10-21T09:41:00Z'))).toBeNull()
    expect(marcoDaVez(e, AS_0735)).toEqual({ marco: '07:30', pulados: [] })
  })
})

describe('chegadas por item', () => {
  it('guarda a PRIMEIRA chegada de cada parte; reenvio não muda o horário', () => {
    const c1 = registrarChegadas(null, ['romaneio'], '2026-10-22T12:25:00Z')
    expect(c1).toEqual({ romaneio: '2026-10-22T12:25:00Z' })
    const c2 = registrarChegadas(c1, ['romaneio', 'pao'], '2026-10-22T13:00:00Z')
    expect(c2).toEqual({ romaneio: '2026-10-22T12:25:00Z', pao: '2026-10-22T13:00:00Z' })
    expect(registrarChegadas(c2, ['romaneio', 'pao'], '2026-10-22T14:00:00Z')).toBeNull() // nada novo, não grava
  })
  it('partes presentes no dia guardado', () => {
    expect(partesPresentes({ romaneio: [{}], pao: { linhas: [{}] }, escala_enviada: true, pao_enviado: true })).toEqual(['romaneio', 'pao', 'escala'])
    expect(partesPresentes({ romaneio: [], pao: { linhas: [] }, escala_enviada: false, pao_enviado: false })).toEqual([])
    expect(partesPresentes({ romaneio: [], pao: { linhas: [] }, escala_enviada: false, pao_enviado: true })).toEqual(['pao'])
  })
})

describe('checklistDaManha', () => {
  it('22/10 às 09:30: romaneio Nutry 09:25 ✓, pão e escala ✗, RQ 05:01 ✓', () => {
    const itens = checklistDaManha({
      clientes: ['nutrimax', 'rioquality'],
      dias: {
        nutrimax: { romaneio: [{}], pao: { linhas: [] }, escala_enviada: false, pao_enviado: false, enviado_em: '2026-10-22T12:25:00Z' },
        rioquality: { romaneio: [{}], pao: { linhas: [] }, escala_enviada: false, pao_enviado: false, enviado_em: '2026-10-22T13:00:00Z' },
      },
      chegadas: { nutrimax: { romaneio: '2026-10-22T12:25:00Z' }, rioquality: { romaneio: '2026-10-22T08:01:00Z' } },
    })
    expect(itens.map(i => [i.chave, i.rotulo, i.ok, i.hora])).toEqual([
      ['romaneio', 'Romaneio Nutry', true, '09:25'],
      ['pao', 'Pão (JAC)', false, null],
      ['escala', 'Escala', false, null],
      ['rq', 'Relatório RQ', true, '05:01'],
    ])
    expect(itens.find(i => i.chave === 'rq')!.cliente).toBe('rioquality')
  })
  it('sem o registro de chegada (dia antigo): usa o horário do último envio', () => {
    const itens = checklistDaManha({ clientes: ['nutrimax'], dias: { nutrimax: { romaneio: [{}], pao: { linhas: [] }, escala_enviada: true, pao_enviado: false, enviado_em: '2026-10-23T12:40:00Z' } }, chegadas: {} })
    expect(itens.map(i => [i.chave, i.ok, i.hora])).toEqual([['romaneio', true, '09:40'], ['pao', false, null], ['escala', true, '09:40']])
  })
  it('login só da RQ vê só o item da RQ', () => {
    expect(checklistDaManha({ clientes: ['rioquality'], dias: {}, chegadas: {} }).map(i => [i.chave, i.ok])).toEqual([['rq', false]])
  })
})

describe('decidirAvisoRomaneio', () => {
  it('21/10 06:30: Nutry sem romaneio com 42 carros rodando e RQ (Fusion fora) com 30 => aviso interno com os dois', () => {
    const d = decidirAvisoRomaneio({
      marco: '06:30',
      faltando: [{ cliente: 'nutrimax', emRota: 42 }, { cliente: 'rioquality', emRota: 30 }],
    })
    expect(d.avisar.map(a => a.cliente)).toEqual(['nutrimax', 'rioquality'])
    expect(d.texto).toBe('KPI 06:30: Nutry Max sem romaneio de hoje com 42 carros rodando; Rio Quality sem relatório de entregas de hoje com 30 carros rodando. '
      + 'O motor de desvio está sem os destinos desses carros: subir no Ao vivo (kpi.transmonseg.com.br/painel/ao-vivo).')
  })
  it('19/10 (domingo): Nutry parada (1 carro) não avisa; RQ com 21 avisa', () => {
    const d = decidirAvisoRomaneio({ marco: '06:30', faltando: [{ cliente: 'nutrimax', emRota: 1 }, { cliente: 'rioquality', emRota: 21 }] })
    expect(FROTA_RODANDO_MIN).toBe(3)
    expect(d.avisar.map(a => a.cliente)).toEqual(['rioquality'])
    expect(d.texto).toMatch(/^KPI 06:30: Rio Quality sem relatório de entregas de hoje com 21 carros rodando\./)
  })
  it('monitoramento fora (frota desconhecida) avisa assim mesmo, dizendo que não conferiu (nunca calado)', () => {
    const d = decidirAvisoRomaneio({ marco: '07:30', faltando: [{ cliente: 'nutrimax', emRota: null }] })
    expect(d.avisar).toEqual([{ cliente: 'nutrimax', emRota: null }])
    expect(d.texto).toMatch(/Nutry Max sem romaneio de hoje \(não consegui conferir a frota no monitoramento\)/)
  })
  it('revisão F3-07 (R3): romaneio parcial no KPI e 40 carros rodando sem destino no monitoramento => avisa (decide pelo monitoramento, não pelo documento do KPI)', () => {
    const d = decidirAvisoRomaneio({ marco: '06:30', faltando: [{ cliente: 'nutrimax', emRota: 75, semRomaneio: 40, kpiTemDocumento: true }] })
    expect(d.avisar.map(a => a.cliente)).toEqual(['nutrimax'])
    expect(d.texto).toMatch(/^KPI 06:30: Nutry Max com 40 carros rodando sem romaneio no monitoramento \(o romaneio de hoje está no KPI: incompleto ou não chegou ao monitoramento\)\./)
  })
  it('R3: romaneio no monitoramento e não no KPI (2 carros sem destino) => sem falso "sem romaneio"', () => {
    expect(decidirAvisoRomaneio({ marco: '06:30', faltando: [{ cliente: 'nutrimax', emRota: 70, semRomaneio: 2, kpiTemDocumento: false }] }).texto).toBeNull()
  })
  it('R3: sem documento no KPI e monitoramento respondeu => conta os carros SEM romaneio', () => {
    const d = decidirAvisoRomaneio({ marco: '06:30', faltando: [{ cliente: 'rioquality', emRota: 61, semRomaneio: 58, kpiTemDocumento: false }] })
    expect(d.texto).toMatch(/^KPI 06:30: Rio Quality sem relatório de entregas de hoje com 58 carros rodando\./)
  })
  it('nada faltando ou frota parada => sem aviso', () => {
    expect(decidirAvisoRomaneio({ marco: '06:30', faltando: [] })).toEqual({ avisar: [], texto: null })
    expect(decidirAvisoRomaneio({ marco: '06:30', faltando: [{ cliente: 'nutrimax', emRota: 0 }] }).texto).toBeNull()
  })
})

describe('bannersAvisoRomaneio (tela)', () => {
  const estado: EstadoAvisoRomaneio = { marcos: {
    '06:30': { em: '2026-10-21T09:31:00Z', faltando: [{ cliente: 'nutrimax', emRota: 42 }, { cliente: 'rioquality', emRota: 30 }], dm: 'desligado' },
  } }
  it('mostra o último marco, só dos clientes do login e só enquanto o item ainda falta', () => {
    expect(bannersAvisoRomaneio(estado, ['nutrimax', 'rioquality'], { nutrimax: false, rioquality: false })).toEqual([
      { cliente: 'nutrimax', texto: 'Motor de desvio sem romaneio da Nutry Max hoje: 42 carros rodando às 06:30.' },
      { cliente: 'rioquality', texto: 'Motor de desvio sem relatório de entregas da Rio Quality hoje: 30 carros rodando às 06:30.' },
    ])
    expect(bannersAvisoRomaneio(estado, ['rioquality'], { nutrimax: false, rioquality: true })).toEqual([])
    expect(bannersAvisoRomaneio(null, ['nutrimax'], { nutrimax: false })).toEqual([])
  })
  it('revisão F3-07 (R3): documento no KPI mas carros sem destino no monitoramento => banner até o próximo envio depois do aviso', () => {
    const e: EstadoAvisoRomaneio = { marcos: { '06:30': { em: '2026-10-21T09:31:00Z', faltando: [{ cliente: 'nutrimax', emRota: 75, semRomaneio: 40, kpiTemDocumento: true }, { cliente: 'rioquality', emRota: 61, semRomaneio: 0, kpiTemDocumento: true }], dm: 'desligado' } } }
    const banner = [{ cliente: 'nutrimax', texto: 'Motor de desvio sem destino de 40 carros da Nutry Max às 06:30: romaneio de hoje incompleto ou não chegou ao monitoramento.' }]
    expect(bannersAvisoRomaneio(e, ['nutrimax', 'rioquality'], { nutrimax: true, rioquality: true }, { nutrimax: '2026-10-21T09:00:00Z' })).toEqual(banner)
    expect(bannersAvisoRomaneio(e, ['nutrimax'], { nutrimax: true }, { nutrimax: '2026-10-21T09:45:00Z' })).toEqual([])
  })
})
