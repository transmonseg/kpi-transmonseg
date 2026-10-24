import { describe, it, expect, vi } from 'vitest'
import { decidirReparo, repararDia, repararDiaRQ, urlContagem, COD_MONITORAMENTO_NUTRY, type DepsReparo, type DepsReparoRQ } from './reparar-dia'

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

// F2-04 (MON-01, AC-04): o reparo cobre a Rio Quality. 21/10: planilha manual
// guardada no Ao vivo e 0 linhas da RQ no monitoramento o dia todo; 22 e
// 23/10: o mapa ficou com a versao da Fusion das 05h (2.803 linhas) e o KPI
// com a manual (2.824 NFs, outra numeracao).
describe('repararDiaRQ', () => {
  const entrega = (nf: string, placaNorm = 'LNH9C10') => ({ placaNorm, nf, rua: 'R', bairro: '', cidade: 'C', uf: 'RJ', clienteNome: 'X', destino: '', motorista: '' })
  const deps = (o: Partial<DepsReparoRQ> & { linhas?: number | null } = {}) => {
    const reenviar = vi.fn(async () => ({ ok: true }))
    const marcar = vi.fn()
    const d: DepsReparoRQ = {
      diaGuardado: async () => ({ entregas: [entrega('5557757'), entrega('5557758'), entrega('5557759', '')], enviadoPor: 'erica@x.com', fonte: 'manual' }),
      linhasNoMonitoramento: async () => (o.linhas === undefined ? 0 : o.linhas),
      reenviar, lerEstado: () => null, gravarEstado: marcar,
      ...o,
    }
    return { d, reenviar, marcar }
  }

  it('21/10: dia manual guardado e 0 linhas no monitoramento -> reenvia com o e-mail de quem subiu', async () => {
    const { d, reenviar, marcar } = deps({ linhas: 0 })
    const log = vi.fn()
    expect(await repararDiaRQ(d, '2026-10-21', log)).toBe('reenviado')
    expect(reenviar).toHaveBeenCalledWith('2026-10-21', expect.any(Array), 'erica@x.com')
    expect(marcar).toHaveBeenCalledWith('2026-10-21', expect.objectContaining({ esperados: [2] }))
    expect(log.mock.calls[0][0]).toContain('rioquality 2026-10-21')
  })

  it('contagem diverge (2.803 da Fusion x 2 NFs com placa da manual) -> reenvia; igual -> nada', async () => {
    expect(await repararDiaRQ(deps({ linhas: 2803 }).d, '2026-10-23', () => {})).toBe('reenviado')
    const igual = deps({ linhas: 2 })
    expect(await repararDiaRQ(igual.d, '2026-10-23', () => {})).toBe('nada')
    expect(igual.reenviar).not.toHaveBeenCalled()
  })

  it('monitoramento indisponivel (null), dia nao guardado, ou ja reenviado com a mesma divergencia -> nada', async () => {
    expect(await repararDiaRQ(deps({ linhas: null }).d, '2026-10-23', () => {})).toBe('nada')
    expect(await repararDiaRQ(deps({ diaGuardado: async () => null }).d, '2026-10-23', () => {})).toBe('nada')
    const ja = deps({ linhas: 5, lerEstado: () => ({ esperados: [2], residual: null }) })
    expect(await repararDiaRQ(ja.d, '2026-10-23', () => {})).toBe('nada')
    expect(ja.reenviar).not.toHaveBeenCalled()
  })

  it('falha do reenvio vira log, nunca lanca', async () => {
    const { d } = deps({ linhas: 0, reenviar: async () => ({ ok: false, erro: 'HTTP 500' }) })
    const log = vi.fn()
    expect(await repararDiaRQ(d, '2026-10-23', log)).toBe('falhou')
    expect(log.mock.calls[0][0]).toContain('HTTP 500')
    const quebra = deps({ diaGuardado: async () => { throw new Error('banco') } })
    expect(await repararDiaRQ(quebra.d, '2026-10-23', log)).toBe('nada')
  })
})

// F2-REV-06 (revisao independente da Fase 2): a contagem do monitoramento so'
// soma a frota da RQ + linhas sem veiculo. Placa da RQ cadastrada no MON em
// veiculo de OUTRO cliente nunca entra -- a divergencia e' permanente e cada
// mudanca da contagem (a Fusion cresce o dia) reenviava o dia inteiro com
// 'substituir'. Numeros de 22/10 (2.862 linhas da frota + 18 da KZA2F01, que
// aqui esta' no veiculo de outro cliente). Hoje nenhuma placa da RQ esta' em
// veiculo de outro cliente no MON (conferido 24/10) -- caso montado.
describe('F2-REV-06: repararDiaRQ estavel', () => {
  const entrega = (nf: string, placaNorm: string) => ({ placaNorm, nf, rua: 'R', bairro: '', cidade: 'C', uf: 'RJ', clienteNome: 'X', destino: '', motorista: '' })
  const dia = (frota: number, kza: number) => [
    ...Array.from({ length: frota }, (_, i) => entrega(String(5_000_000 + i), 'BKF6I55')),
    ...Array.from({ length: kza }, (_, i) => entrega(String(6_000_000 + i), 'KZA2F01')),
  ]
  // Monitoramento simulado: so' conta a frota (a KZA2F01 esta' em veiculo de outro cliente).
  function cenario() {
    let entregas = dia(2862, 18)
    let noMon = 0
    const estado = new Map<string, unknown>()
    const reenviar = vi.fn(async (_d: string, es: { placaNorm: string }[]) => { noMon = es.filter(e => e.placaNorm !== 'KZA2F01').length; return { ok: true } })
    const log = vi.fn()
    const d: DepsReparoRQ = {
      diaGuardado: async () => ({ entregas, enviadoPor: 'cron-fusion', fonte: 'fusion' }),
      linhasNoMonitoramento: async () => noMon,
      reenviar,
      lerEstado: data => (estado.get(data) as ReturnType<DepsReparoRQ['lerEstado']>) ?? null,
      gravarEstado: (data, e) => { estado.set(data, e) },
    }
    return { d, reenviar, log, crescer: (frota: number, kza: number) => { entregas = dia(frota, kza); noMon = frota }, setMon: (n: number) => { noMon = n } }
  }
  it('1 reparo; depois a diferença das placas fora da frota é tolerada mesmo com a contagem mudando', async () => {
    const c = cenario()
    expect(await repararDiaRQ(c.d, '2026-10-22', c.log)).toBe('reenviado')
    expect(c.log.mock.calls.map(x => x[0]).join('\n')).toMatch(/18 linha\(s\).*persiste/)
    // ticks seguintes: mesma divergencia (2.880 x 2.862) -> nada
    expect(await repararDiaRQ(c.d, '2026-10-22', c.log)).toBe('nada')
    // a Fusion cresce o dia e o envio dela atualiza o MON (2.900 da frota): diferenca igual -> nada
    c.crescer(2900, 18)
    expect(await repararDiaRQ(c.d, '2026-10-22', c.log)).toBe('nada')
    expect(c.reenviar).toHaveBeenCalledTimes(1)
  })
  it('mesma contagem esperada nunca é reparada 2x no dia, mesmo se o MON mudar', async () => {
    const c = cenario()
    expect(await repararDiaRQ(c.d, '2026-10-22', c.log)).toBe('reenviado')
    c.setMon(100)
    expect(await repararDiaRQ(c.d, '2026-10-22', c.log)).toBe('nada')
    expect(c.reenviar).toHaveBeenCalledTimes(1)
  })
})
