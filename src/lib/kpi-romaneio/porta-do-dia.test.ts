import { describe, it, expect } from 'vitest'
import { gravarHojeNutry, gravarHojeRQ, canonico, cabecalhosPorta, type DepsPortaNutry, type DepsPortaRQ } from './porta-do-dia'
import type { DiaGuardado } from './mesclar-envio'
import type { LinhaRomaneio, LinhaEscala } from './types'
import type { EntregaRioQualityCompleta } from '@/lib/kpi-rioquality/parse-planilhas'

// F3-05 (AC-13): caso real de 21/10 -- a Nutry entrou só pelo Gerar KPI (10:25
// BRT) e o Ao vivo/monitoramento só receberam pelo reparo às 15:30 CEST.
const HOJE = '2026-10-21'
const rom = (nf: string, placa = 'TOS1H26'): LinhaRomaneio => ({
  carga: '100710', destino: 'ITAPERUNA', placa, motorista: 'MAICON', ajudantes: [], nf, clienteCodigo: '135944', clienteNome: 'MERCADO DO LIZEU', endereco: 'TR ANTONINO ALVES, 16 - PRES. COSTA E SILVA, ITAPERUNA',
})
const esc = (carga: string): LinhaEscala => ({ carga, placaRaw: 'TOS1H26', placaNorm: 'TOS1H26', destino: 'ITAPERUNA', motorista: 'MAICON', ajudante1: null, ajudante2: null, pesoKg: 3471, entPlanejado: 40, nfPlanejado: 45 })
const pdf = (origem: 'romaneio' | 'escala_pao') => ({ buf: Buffer.from(origem), nome: `${origem}.pdf`, origem })

function depsNutry(guardado: DiaGuardado | null) {
  const log = { guardou: [] as unknown[], enviou: [] as { origens: string[]; por: string | null }[] }
  const deps: DepsPortaNutry = {
    lerDia: async () => guardado,
    guardar: async p => { log.guardou.push(p) },
    enviarMonitoramento: async (a, por) => { log.enviou.push({ origens: a.map(x => x.origem), por }); return a.map(x => ({ origem: x.origem, ok: true, linhas: 2327 })) },
  }
  return { deps, log }
}

describe('gravarHojeNutry (F3-05)', () => {
  const novo = { romaneio: [rom('2438872'), rom('2438873')], escala: [esc('100710')], pao: { linhas: [rom('217492', 'RBI1J86')], escala: [] } }

  it('21/10: Gerar KPI de hoje com o Ao vivo vazio grava o dia com o e-mail de quem gerou e manda romaneio e pão ao monitoramento', async () => {
    const { deps, log } = depsNutry(null)
    const r = await gravarHojeNutry(deps, { data: HOJE, hoje: HOJE, enviadoPor: 'erica@transmonseg.com', novo, pdfs: { romaneio: pdf('romaneio'), pao: pdf('escala_pao') } })
    expect(r.aoVivo).toBe('gravado')
    expect(log.guardou).toHaveLength(1)
    expect(log.guardou[0]).toMatchObject({ data: HOJE, enviadoPor: 'erica@transmonseg.com', escalaEnviada: true, paoEnviado: true })
    expect(log.enviou).toEqual([{ origens: ['romaneio', 'escala_pao'], por: 'erica@transmonseg.com' }])
    expect(cabecalhosPorta(r)).toEqual({ 'x-ao-vivo': 'gravado', 'x-monitoramento': 'ok' })
  })

  it('dia passado: nada vai ao Ao vivo nem ao monitoramento (o Gerar fica para dias passados)', async () => {
    const { deps, log } = depsNutry(null)
    const r = await gravarHojeNutry(deps, { data: '2026-10-20', hoje: HOJE, enviadoPor: 'e@x', novo, pdfs: { romaneio: pdf('romaneio') } })
    expect(r).toEqual({ aoVivo: 'nao', monitoramento: [] })
    expect(log.guardou).toHaveLength(0)
    expect(log.enviou).toHaveLength(0)
  })

  it('22/10 (duplicou): o mesmo romaneio já no Ao vivo -- com as chaves reordenadas pelo jsonb -- não é regravado nem reenviado', async () => {
    const reordenar = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).reverse()) as T
    const guardado: DiaGuardado = {
      romaneio: novo.romaneio.map(reordenar), escala: novo.escala.map(reordenar),
      pao: { escala: [], linhas: novo.pao.linhas.map(reordenar) }, escalaEnviada: true, paoEnviado: true,
    }
    const { deps, log } = depsNutry(guardado)
    const r = await gravarHojeNutry(deps, { data: HOJE, hoje: HOJE, enviadoPor: 'e@x', novo, pdfs: { romaneio: pdf('romaneio'), pao: pdf('escala_pao') } })
    expect(r.aoVivo).toBe('igual')
    expect(log.guardou).toHaveLength(0)
    expect(log.enviou).toHaveLength(0)
    expect(cabecalhosPorta(r)['x-monitoramento']).toBe('nao')
  })

  it('Ao vivo com o mesmo romaneio e sem o pão: grava o dia e manda só o pão ao monitoramento', async () => {
    const guardado: DiaGuardado = { romaneio: novo.romaneio, escala: novo.escala, pao: { linhas: [], escala: [] }, escalaEnviada: true, paoEnviado: false }
    const { deps, log } = depsNutry(guardado)
    const r = await gravarHojeNutry(deps, { data: HOJE, hoje: HOJE, enviadoPor: 'e@x', novo, pdfs: { romaneio: pdf('romaneio'), pao: pdf('escala_pao') } })
    expect(r.aoVivo).toBe('gravado')
    expect(log.enviou).toEqual([{ origens: ['escala_pao'], por: 'e@x' }])
  })

  it('geração sem pão nem escala não apaga o pão e a escala que já estavam no Ao vivo (mesma mesclagem do Ao vivo)', async () => {
    const guardado: DiaGuardado = { romaneio: [rom('1')], escala: novo.escala, pao: novo.pao, escalaEnviada: true, paoEnviado: true }
    const { deps, log } = depsNutry(guardado)
    const r = await gravarHojeNutry(deps, { data: HOJE, hoje: HOJE, enviadoPor: 'e@x', novo: { romaneio: novo.romaneio }, pdfs: { romaneio: pdf('romaneio') } })
    expect(r.aoVivo).toBe('gravado')
    expect(log.guardou[0]).toMatchObject({ escala: novo.escala, pao: novo.pao, escalaEnviada: true, paoEnviado: true })
    expect(log.enviou).toEqual([{ origens: ['romaneio'], por: 'e@x' }])
  })

  it('romaneio sem linhas: não toca no Ao vivo', async () => {
    const { deps, log } = depsNutry(null)
    expect((await gravarHojeNutry(deps, { data: HOJE, hoje: HOJE, enviadoPor: null, novo: { romaneio: [] }, pdfs: {} })).aoVivo).toBe('nao')
    expect(log.guardou).toHaveLength(0)
  })

  it('falha ao gravar no Ao vivo não lança (a geração segue; o reparo do tick cobre)', async () => {
    const { deps } = depsNutry(null)
    deps.guardar = async () => { throw new Error('guardar romaneio do dia: timeout') }
    const r = await gravarHojeNutry(deps, { data: HOJE, hoje: HOJE, enviadoPor: null, novo, pdfs: { romaneio: pdf('romaneio') } })
    expect(r).toMatchObject({ aoVivo: 'falhou', erro: 'guardar romaneio do dia: timeout' })
  })
})

// RQ 21/10: duas gerações (14:49 e 14:59 BRT) e a subida no Ao vivo às 15:01 --
// 3 envios do mesmo dia em 12 min.
describe('gravarHojeRQ (F3-05)', () => {
  const entrega = (nf: string): EntregaRioQualityCompleta => ({ placaNorm: 'LNH9C10', clienteNome: 'BAR', cidade: 'SAO GONCALO', uf: 'RJ', destino: 'X', motorista: 'M', rua: 'RUA IMBOASSU', bairro: 'IMBOASSU', nf, pedidoErp: '6081346', romaneio: '1158583', rota: 'NITEROI 1' })
  function depsRQ(guardadas: EntregaRioQualityCompleta[] | null) {
    const log = { guardou: [] as unknown[], enviou: [] as unknown[] }
    const deps: DepsPortaRQ = {
      lerEntregas: async () => guardadas,
      guardar: async (data, entregas, por) => { log.guardou.push({ data, n: entregas.length, por }) },
      enviarMonitoramento: async (data, entregas, por) => { log.enviou.push({ data, n: entregas.length, por }); return { ok: true, linhasDoDia: entregas.length } },
    }
    return { deps, log }
  }

  it('1ª geração de hoje: grava no Ao vivo e substitui o dia no monitoramento com quem gerou', async () => {
    const { deps, log } = depsRQ(null)
    const r = await gravarHojeRQ(deps, { data: HOJE, hoje: HOJE, enviadoPor: 'erica@x', entregas: [entrega('5557757'), entrega('5557758')] })
    expect(r).toEqual({ aoVivo: 'gravado', monitoramento: [{ origem: 'romaneio', ok: true, linhas: 2 }] })
    expect(log.guardou).toEqual([{ data: HOJE, n: 2, por: 'erica@x' }])
    expect(log.enviou).toEqual([{ data: HOJE, n: 2, por: 'erica@x' }])
  })

  it('2ª geração com a mesma planilha (14:59): nada é reenviado', async () => {
    const es = [entrega('5557757'), entrega('5557758')]
    const { deps, log } = depsRQ(es.map(e => Object.fromEntries(Object.entries(e).reverse()) as EntregaRioQualityCompleta))
    const r = await gravarHojeRQ(deps, { data: HOJE, hoje: HOJE, enviadoPor: 'erica@x', entregas: es })
    expect(r.aoVivo).toBe('igual')
    expect(log.guardou).toHaveLength(0)
    expect(log.enviou).toHaveLength(0)
  })

  it('dia passado não toca no Ao vivo', async () => {
    const { deps, log } = depsRQ(null)
    expect((await gravarHojeRQ(deps, { data: '2026-10-20', hoje: HOJE, enviadoPor: null, entregas: [entrega('1')] })).aoVivo).toBe('nao')
    expect(log.guardou).toHaveLength(0)
  })

  it('monitoramento fora: Ao vivo gravado, falha do monitoramento volta para a tela', async () => {
    const { deps } = depsRQ(null)
    deps.enviarMonitoramento = async () => ({ ok: false, erro: 'HTTP 502' })
    const r = await gravarHojeRQ(deps, { data: HOJE, hoje: HOJE, enviadoPor: null, entregas: [entrega('1')] })
    expect(r.aoVivo).toBe('gravado')
    expect(cabecalhosPorta(r)).toEqual({ 'x-ao-vivo': 'gravado', 'x-monitoramento': 'falhou' })
  })
})

describe('canonico', () => {
  it('ignora a ordem das chaves e mantém a ordem das listas', () => {
    expect(canonico({ b: 1, a: [{ y: 2, x: 1 }] })).toBe(canonico({ a: [{ x: 1, y: 2 }], b: 1 }))
    expect(canonico([1, 2])).not.toBe(canonico([2, 1]))
  })
})
