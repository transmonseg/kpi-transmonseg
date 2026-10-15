import { describe, it, expect, vi } from 'vitest'
import { decidirReparo, repararDia, urlContagem, COD_MONITORAMENTO_NUTRY, type DepsReparo } from './reparar-dia'

describe('decidirReparo', () => {
  it('Ao vivo sem o dia e geração com romaneio: preenche o Ao vivo', () => {
    expect(decidirReparo({ aoVivoTemDia: false, geracaoTemDia: true, monitoramentoTemRomaneio: true })).toBe('preencher_ao_vivo')
    expect(decidirReparo({ aoVivoTemDia: false, geracaoTemDia: true, monitoramentoTemRomaneio: false })).toBe('preencher_ao_vivo')
    expect(decidirReparo({ aoVivoTemDia: false, geracaoTemDia: true, monitoramentoTemRomaneio: null })).toBe('preencher_ao_vivo')
  })
  it('nunca sobrescreve dia já guardado no Ao vivo', () => {
    expect(decidirReparo({ aoVivoTemDia: true, geracaoTemDia: true, monitoramentoTemRomaneio: true })).toBe('nada')
    expect(decidirReparo({ aoVivoTemDia: true, geracaoTemDia: true, monitoramentoTemRomaneio: false })).not.toBe('preencher_ao_vivo')
    expect(decidirReparo({ aoVivoTemDia: true, geracaoTemDia: false, monitoramentoTemRomaneio: null })).toBe('nada')
  })
  it('dia existe e monitoramento sem romaneio: reenvia os PDFs da geração', () => {
    expect(decidirReparo({ aoVivoTemDia: true, geracaoTemDia: true, monitoramentoTemRomaneio: false })).toBe('enviar_monitoramento')
  })
  it('monitoramento sem romaneio mas sem geração (sem PDFs): nada', () => {
    expect(decidirReparo({ aoVivoTemDia: true, geracaoTemDia: false, monitoramentoTemRomaneio: false })).toBe('nada')
  })
  it('monitoramento desconhecido (consulta falhou): nunca reenvia', () => {
    expect(decidirReparo({ aoVivoTemDia: true, geracaoTemDia: true, monitoramentoTemRomaneio: null })).toBe('nada')
  })
  it('sem nada em lugar nenhum: nada', () => {
    expect(decidirReparo({ aoVivoTemDia: false, geracaoTemDia: false, monitoramentoTemRomaneio: false })).toBe('nada')
  })
})

function deps(o: Partial<DepsReparo> & { aoVivo?: boolean; geracao?: boolean; linhas?: number | null } = {}) {
  let aoVivo = o.aoVivo ?? false
  const d: DepsReparo = {
    aoVivoTemDia: vi.fn(async () => aoVivo),
    geracaoTemDia: vi.fn(async () => o.geracao ?? true),
    linhasNoMonitoramento: vi.fn(async () => (o.linhas === undefined ? 0 : o.linhas)),
    preencherAoVivo: vi.fn(async () => { aoVivo = true }),
    reenviarAoMonitoramento: vi.fn(async () => ({ ok: true })),
    ...o,
  }
  return d
}
const DIA = '2026-10-10'

describe('repararDia', () => {
  it('preenche o Ao vivo e, no mesmo tick, reenvia uma única vez se o monitoramento está vazio', async () => {
    const d = deps({ aoVivo: false, geracao: true, linhas: 0 })
    const r = await repararDia(d, DIA, () => {})
    expect(r).toEqual(['preencher_ao_vivo', 'enviar_monitoramento'])
    expect(d.preencherAoVivo).toHaveBeenCalledTimes(1)
    expect(d.reenviarAoMonitoramento).toHaveBeenCalledTimes(1)
  })
  it('Ao vivo já tem o dia e monitoramento tem romaneio: não faz nada', async () => {
    const d = deps({ aoVivo: true, linhas: 30 })
    expect(await repararDia(d, DIA, () => {})).toEqual([])
    expect(d.preencherAoVivo).not.toHaveBeenCalled()
    expect(d.reenviarAoMonitoramento).not.toHaveBeenCalled()
  })
  it('não preenche por cima quando o dia aparece entre a checagem e a escrita', async () => {
    const d = deps({ aoVivo: false, geracao: true, linhas: 5 })
    const checks = [false, true]
    d.aoVivoTemDia = vi.fn(async () => checks.shift() ?? true)
    expect(await repararDia(d, DIA, () => {})).toEqual([])
    expect(d.preencherAoVivo).not.toHaveBeenCalled()
  })
  it('falha no reenvio é registrada e não propaga', async () => {
    const log = vi.fn()
    const d = deps({ aoVivo: true, linhas: 0, reenviarAoMonitoramento: vi.fn(async () => ({ ok: false, erro: 'HTTP 500' })) })
    await expect(repararDia(d, DIA, log)).resolves.toEqual(['enviar_monitoramento'])
    expect(log).toHaveBeenCalledWith(expect.stringContaining('HTTP 500'))
  })
  it('exceção em qualquer dependência não derruba (fail-open)', async () => {
    const log = vi.fn()
    const d = deps({ aoVivoTemDia: vi.fn(async () => { throw new Error('banco fora') }) })
    await expect(repararDia(d, DIA, log)).resolves.toEqual([])
    expect(log).toHaveBeenCalledWith(expect.stringContaining('banco fora'))
  })
  it('uma tentativa de reenvio por dia: se ja tentou, nao reenvia de novo (nao desfaz o Reverter)', async () => {
    const d = deps({ aoVivo: true, linhas: 0, jaTentouReenvio: vi.fn(() => true) })
    expect(await repararDia(d, DIA, () => {})).toEqual([])
    expect(d.reenviarAoMonitoramento).not.toHaveBeenCalled()
  })
  it('marca a tentativa ao reenviar', async () => {
    const marcar = vi.fn()
    const d = deps({ aoVivo: true, linhas: 0, jaTentouReenvio: vi.fn(() => false), marcarTentativaReenvio: marcar })
    expect(await repararDia(d, DIA, () => {})).toEqual(['enviar_monitoramento'])
    expect(marcar).toHaveBeenCalledWith(DIA)
  })
  it('Ao vivo enviado por pessoa e monitoramento vazio: nao reenvia a geracao (versao pode ser outra)', async () => {
    const log = vi.fn()
    const d = deps({ aoVivo: true, linhas: 0, aoVivoEnviadoPorPessoa: vi.fn(async () => true) })
    expect(await repararDia(d, DIA, log)).toEqual([])
    expect(d.reenviarAoMonitoramento).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('enviado por pessoa'))
  })
  it('monitoramento inalcançável (null): não reenvia', async () => {
    const d = deps({ aoVivo: true, linhas: null })
    expect(await repararDia(d, DIA, () => {})).toEqual([])
    expect(d.reenviarAoMonitoramento).not.toHaveBeenCalled()
  })
})

// KP-04 (auditoria 15/10): a contagem do monitoramento somava a Rio Quality, entao
// "monitoramento tem romaneio" nunca ficava falso mesmo com a Nutry sem nada.
describe('urlContagem', () => {
  it('pede a contagem so da Nutry quando recebe o cod', () => {
    expect(urlContagem('http://127.0.0.1:3010', '2026-10-15', COD_MONITORAMENTO_NUTRY))
      .toBe('http://127.0.0.1:3010/api/romaneio/contagem?data=2026-10-15&cod=4096')
  })
  it('sem cod mantem a consulta do dia inteiro', () => {
    expect(urlContagem('http://x', '2026-10-15')).toBe('http://x/api/romaneio/contagem?data=2026-10-15')
  })
})
