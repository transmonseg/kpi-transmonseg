import { describe, it, expect } from 'vitest'
import { derivarStatus, tierEfetivo, TIER_DE_STATUS, MOTIVO_CURTO, STATUS_LABEL, type StatusRota } from './status-rota'

const base = { temGps: true, ficouNaBase: false, paradas: [] as { classificacao: string; loja_id: string | null }[] }

const TODOS_STATUS: StatusRota[] = ['ENTREGUE', 'ENTREGUE_GEO', 'MUDOU_DE_ROTA', 'SEM_RASTREADOR', 'DESATUALIZADO', 'NAO_SAIU_DA_BASE', 'NAO_FOI_AO_CLIENTE', 'FORA_DE_BASE']

describe('DESATUALIZADO', () => {
  const baseSemGps = { temGps: false, ficouNaBase: false, paradas: [] as { classificacao: string; loja_id: string | null }[] }
  it('placa fora do relatório + desatualizada na API → DESATUALIZADO', () => {
    expect(derivarStatus({ ...baseSemGps, placaDesatualizadaApi: true }).status).toBe('DESATUALIZADO')
  })
  it('placa fora do relatório sem sinal de API → continua SEM_RASTREADOR', () => {
    expect(derivarStatus({ ...baseSemGps }).status).toBe('SEM_RASTREADOR')
  })
  it('placa fora do relatório mas na frota da API + transmitindo → NAO_FOI_AO_CLIENTE (tem rastreador)', () => {
    expect(derivarStatus({ ...baseSemGps, placaTemRastreadorApi: true }).status).toBe('NAO_FOI_AO_CLIENTE')
  })
  it('tem label e tier', () => {
    expect(STATUS_LABEL.DESATUALIZADO).toBe('Desatualizado')
    expect(TIER_DE_STATUS.DESATUALIZADO).toBe('conferir')
  })
})

describe('tiers de certeza', () => {
  it('todo status tem tier base, MOTIVO_CURTO e STATUS_LABEL', () => {
    for (const s of TODOS_STATUS) {
      expect(TIER_DE_STATUS[s]).toBeDefined()
      expect(MOTIVO_CURTO[s]).toBeTruthy()
      expect(STATUS_LABEL[s]).toBeTruthy()
    }
  })
  it('tierEfetivo: entregue confirmado, no-show não-entregou', () => {
    expect(tierEfetivo({ status: 'ENTREGUE', revisar: false })).toBe('confirmado')
    expect(tierEfetivo({ status: 'NAO_SAIU_DA_BASE', revisar: false })).toBe('nao_entregou')
    expect(tierEfetivo({ status: 'MUDOU_DE_ROTA', revisar: true })).toBe('conferir')
  })
  it('tierEfetivo: geo fora do raio e no-show revisável caem em conferir', () => {
    expect(tierEfetivo({ status: 'ENTREGUE_GEO', revisar: true })).toBe('conferir')
    expect(tierEfetivo({ status: 'ENTREGUE_GEO', revisar: false })).toBe('confirmado')
    expect(tierEfetivo({ status: 'NAO_FOI_AO_CLIENTE', revisar: true })).toBe('conferir')
  })
  it('tierEfetivo: relatório parcial é conferir', () => {
    expect(tierEfetivo({ status: 'NAO_FOI_AO_CLIENTE', revisar: true, categoria: 'RELATORIO_PARCIAL' })).toBe('conferir')
  })
  it('tierEfetivo: no-show revisável (placa divergente no Unitrac) cai em conferir', () => {
    // placaDivergeUnitrac → SEM_RASTREADOR + revisar=true. Não é "não entregou":
    // o veículo tem rastreador, é placa errada no cadastro.
    expect(tierEfetivo({ status: 'SEM_RASTREADOR', revisar: true })).toBe('conferir')
    expect(tierEfetivo({ status: 'NAO_SAIU_DA_BASE', revisar: true })).toBe('conferir')
  })
  it('tierEfetivo: no-show NÃO revisável continua não-entregou', () => {
    expect(tierEfetivo({ status: 'SEM_RASTREADOR', revisar: false })).toBe('nao_entregou')
    expect(tierEfetivo({ status: 'NAO_SAIU_DA_BASE', revisar: false })).toBe('nao_entregou')
  })
})

describe('relatório parcial', () => {
  it('saiu da base e relatório cortou antes → categoria RELATORIO_PARCIAL, natureza relatorio', () => {
    const r = derivarStatus({ ...base, relatorioParcial: true, saidaBaseParcial: '15:04' })
    expect(r.categoria).toBe('RELATORIO_PARCIAL')
    expect(r.natureza).toBe('relatorio')
    expect(r.revisar).toBe(true)
    expect(r.motivoRevisao).toContain('15:04')
  })
  it('NÃO sobrepõe quando houve entrega real', () => {
    const r = derivarStatus({ ...base, relatorioParcial: true, paradas: [{ classificacao: 'LOJA', loja_id: 'l1' }] })
    expect(r.categoria).toBeNull()
    expect(r.status).toBe('ENTREGUE')
  })
})

describe('derivarStatus', () => {
  it('SEM_RASTREADOR quando não tem GPS', () => {
    expect(derivarStatus({ ...base, temGps: false })).toEqual({ status: 'SEM_RASTREADOR', revisar: false, motivoRevisao: null, categoria: null, natureza: null })
  })

  it('NAO_FOI_AO_CLIENTE quando ficou na base e saiu da base (sem flag de só-base)', () => {
    expect(derivarStatus({ ...base, ficouNaBase: true, placaSaiuDaBase: true })).toEqual({ status: 'NAO_FOI_AO_CLIENTE', revisar: false, motivoRevisao: null, categoria: null, natureza: null })
  })

  // Correção 2026-06-04: placa NO relatório (tem rastreador) só com parada na base.
  it('NAO_SAIU_DA_BASE quando a placa está no relatório mas só ficou na base', () => {
    expect(derivarStatus({ ...base, ficouNaBase: true, placaSaiuDaBase: false })).toEqual({ status: 'NAO_SAIU_DA_BASE', revisar: false, motivoRevisao: null, categoria: null, natureza: null })
  })

  it('FORA_DE_BASE quando parou fora da base sem loja e não visitou loja, e marca revisão', () => {
    const r = derivarStatus({ ...base, paradas: [{ classificacao: 'FORA_BASE', loja_id: null }] })
    expect(r.status).toBe('FORA_DE_BASE')
    expect(r.revisar).toBe(true)
    expect(r.motivoRevisao).toBeTruthy()
  })

  it('ENTREGUE quando visitou a loja, mesmo havendo parada fora de base', () => {
    const r = derivarStatus({ ...base, paradas: [{ classificacao: 'LOJA', loja_id: 'l1' }, { classificacao: 'FORA_BASE', loja_id: null }] })
    expect(r).toEqual({ status: 'ENTREGUE', revisar: false, motivoRevisao: null, categoria: null, natureza: null })
  })

  it('SEM_RASTREADOR tem precedência sobre ficouNaBase', () => {
    expect(derivarStatus({ ...base, temGps: false, ficouNaBase: true }).status).toBe('SEM_RASTREADOR')
  })
})

describe('derivarStatus — ENTREGUE_GEO', () => {
  it('FORA_BASE com loja_id e viaGeo → ENTREGUE_GEO + revisar', () => {
    const r = derivarStatus({ temGps: true, ficouNaBase: false, viaGeo: true, paradas: [{ classificacao: 'FORA_BASE', loja_id: 'zs7' }] })
    expect(r.status).toBe('ENTREGUE_GEO')
    expect(r.revisar).toBe(true)
  })
  it('sem viaGeo, FORA_BASE com loja_id → ENTREGUE normal', () => {
    const r = derivarStatus({ temGps: true, ficouNaBase: false, paradas: [{ classificacao: 'FORA_BASE', loja_id: 'zs7' }] })
    expect(r.status).toBe('ENTREGUE')
  })

  // Pedido Joaquim 2026-06-04: geo DENTRO do nosso limite de metros aparece no KPI.
  it('viaGeo + geoConfiavel (dentro do raio) → ENTREGUE_GEO SEM revisão (entra no KPI)', () => {
    const r = derivarStatus({ temGps: true, ficouNaBase: false, viaGeo: true, geoConfiavel: true, paradas: [{ classificacao: 'FORA_BASE', loja_id: 'gbiraja' }] })
    expect(r.status).toBe('ENTREGUE_GEO')
    expect(r.revisar).toBe(false)
    expect(r.motivoRevisao).toBeNull()
  })
  it('viaGeo fora do raio (geoConfiavel false) → continua pedindo revisão', () => {
    const r = derivarStatus({ temGps: true, ficouNaBase: false, viaGeo: true, geoConfiavel: false, paradas: [{ classificacao: 'FORA_BASE', loja_id: 'gbiraja' }] })
    expect(r.status).toBe('ENTREGUE_GEO')
    expect(r.revisar).toBe(true)
  })
})

describe('derivarStatus — MUDOU_DE_ROTA', () => {
  it('troca de carro sem alteração informada → MUDOU_DE_ROTA + revisar', () => {
    const r = derivarStatus({ temGps: true, ficouNaBase: false, viaTroca: true, placaReal: 'ABC1D23', paradas: [{ classificacao: 'LOJA', loja_id: 'l1' }] })
    expect(r.status).toBe('MUDOU_DE_ROTA')
    expect(r.revisar).toBe(true)
    expect(r.motivoRevisao).toContain('ABC1D23')
  })
  it('troca COM alteração informada → ENTREGUE normal (esperado)', () => {
    const r = derivarStatus({ temGps: true, ficouNaBase: false, viaTroca: true, alteracaoInformada: true, paradas: [{ classificacao: 'LOJA', loja_id: 'l1' }] })
    expect(r.status).toBe('ENTREGUE')
  })
  it('ficou na base MAS a placa rodou outra rota → MUDOU_DE_ROTA (não "não foi")', () => {
    const r = derivarStatus({ ...base, ficouNaBase: true, placaFoiAlgumLugar: true })
    expect(r.status).toBe('MUDOU_DE_ROTA')
    expect(r.revisar).toBe(true)
  })
  it('ficou na base de verdade (placa no relatório, só base) → NAO_SAIU_DA_BASE', () => {
    const r = derivarStatus({ ...base, ficouNaBase: true, placaFoiAlgumLugar: false, placaSaiuDaBase: false })
    expect(r.status).toBe('NAO_SAIU_DA_BASE')
  })
})

describe('derivarStatus — pulou loja vs mudou de rota (placaEntregouPropriaEscala)', () => {
  // Caso real CXA-7B36 / KQR-2J11: a placa entregou outras lojas DA PRÓPRIA escala e
  // pulou esta. Antes saía como "mudou de rota" (errado) — agora é "não foi ao cliente".
  it('entregou própria escala + linha sem parada (ficou na base) → NAO_FOI_AO_CLIENTE', () => {
    const r = derivarStatus({ ...base, ficouNaBase: true, placaFoiAlgumLugar: true, placaEntregouPropriaEscala: true })
    expect(r.status).toBe('NAO_FOI_AO_CLIENTE')
    expect(r.revisar).toBe(true)
  })
  it('entregou própria escala + linha sem parada (branch vazia) → NAO_FOI_AO_CLIENTE', () => {
    const r = derivarStatus({ ...base, placaFoiAlgumLugar: true, placaSaiuDaBase: true, placaEntregouPropriaEscala: true })
    expect(r.status).toBe('NAO_FOI_AO_CLIENTE')
  })
  it('NÃO entregou nenhuma própria + rodou → continua MUDOU_DE_ROTA', () => {
    const r = derivarStatus({ ...base, ficouNaBase: true, placaFoiAlgumLugar: true, placaEntregouPropriaEscala: false })
    expect(r.status).toBe('MUDOU_DE_ROTA')
  })
})

describe('derivarStatus — placa divergente no Unitrac (typo) e rastreador travado', () => {
  // KWV-7E49 (escala) x KWV-7E89 (Unitrac): não é "sem rastreador", é cadastro errado.
  it('sem GPS mas com placa divergente → SEM_RASTREADOR com motivo + revisão', () => {
    const r = derivarStatus({ ...base, temGps: false, placaDivergeUnitrac: 'KWV7E89' })
    expect(r.status).toBe('SEM_RASTREADOR')
    expect(r.revisar).toBe(true)
    expect(r.motivoRevisao).toContain('KWV7E89')
  })
  it('sem GPS e sem divergência → SEM_RASTREADOR limpo (sem revisão)', () => {
    const r = derivarStatus({ ...base, temGps: false })
    expect(r.status).toBe('SEM_RASTREADOR')
    expect(r.revisar).toBe(false)
  })
  // LCE-4337: 1 ponto o dia todo, rastreador travado, nenhuma entrega casada.
  it('rastreador travado + sem parada casada → NAO_FOI_AO_CLIENTE com revisão', () => {
    const r = derivarStatus({ ...base, rastreadorTravado: true, placaFoiAlgumLugar: true })
    expect(r.status).toBe('NAO_FOI_AO_CLIENTE')
    expect(r.revisar).toBe(true)
    expect(r.motivoRevisao).toContain('travado')
  })
})

describe('derivarStatus — categorias + natureza (avisos)', () => {
  const base = { temGps: true, ficouNaBase: false, paradas: [] as { classificacao: string; loja_id: string | null }[] }

  it('LOJA_SEM_CADASTRO: linha sem entrega + loja sem cadastro → natureza dado', () => {
    const r = derivarStatus({ ...base, placaSaiuDaBase: true, lojaSemCadastroUnitrac: true })
    expect(r.categoria).toBe('LOJA_SEM_CADASTRO')
    expect(r.natureza).toBe('dado')
    expect(r.revisar).toBe(true)
    expect(r.motivoRevisao).toContain('sem cadastro no Unitrac')
  })

  it('LOJA_AMBIGUA: linha sem entrega + loja-gêmea → natureza dado, cita a outra', () => {
    const r = derivarStatus({ ...base, placaSaiuDaBase: true, lojaAmbiguaComGemea: { outra: 'PREZUNIC MEIER' } })
    expect(r.categoria).toBe('LOJA_AMBIGUA')
    expect(r.natureza).toBe('dado')
    expect(r.motivoRevisao).toContain('PREZUNIC MEIER')
  })

  it('ENTREGOU_FORA_ESCALA: entregou loja com código fora da escala → MUDOU_DE_ROTA, operacao', () => {
    const r = derivarStatus({ ...base, paradas: [{ classificacao: 'LOJA', loja_id: 'va' }], entregouLojaForaEscala: { lojaReal: 'PREZUNIC VISTA ALEGRE' } })
    expect(r.status).toBe('MUDOU_DE_ROTA')
    expect(r.categoria).toBe('ENTREGOU_FORA_ESCALA')
    expect(r.natureza).toBe('operacao')
    expect(r.motivoRevisao).toContain('VISTA ALEGRE')
  })

  it('sem flags novas: categoria null e natureza só quando revisar', () => {
    const ok = derivarStatus({ ...base, paradas: [{ classificacao: 'LOJA', loja_id: 'l1' }] })
    expect(ok.categoria).toBeNull()
    expect(ok.natureza).toBeNull()
    const rev = derivarStatus({ ...base, viaTroca: true, placaReal: 'ABC1D23', paradas: [{ classificacao: 'LOJA', loja_id: 'l1' }] })
    expect(rev.natureza).toBe('operacao')
  })

  it('loja sem cadastro NÃO sobrepõe quando houve entrega real', () => {
    const r = derivarStatus({ ...base, paradas: [{ classificacao: 'LOJA', loja_id: 'l1' }], lojaSemCadastroUnitrac: true })
    expect(r.status).toBe('ENTREGUE')
    expect(r.categoria).toBeNull()
  })
})

describe('sugestão de troca ALTA reclassifica para MUDOU_DE_ROTA', () => {
  const semGps = { temGps: false, ficouNaBase: false, paradas: [] as { classificacao: string; loja_id: string | null }[] }

  it('base "não foi" + sugestão ALTA → MUDOU_DE_ROTA, revisar, motivo com a placa', () => {
    const r = derivarStatus({ temGps: true, ficouNaBase: true, paradas: [], placaSaiuDaBase: true,
      sugestaoTrocaAlta: { placa: 'LTQ0783', hora: '06:17' } })
    expect(r.status).toBe('MUDOU_DE_ROTA')
    expect(r.revisar).toBe(true)
    expect(r.motivoRevisao).toContain('LTQ0783')
    expect(r.motivoRevisao).toContain('06:17')
    expect(tierEfetivo(r)).toBe('conferir')
  })

  it('base "sem rastreador" + sugestão ALTA → MUDOU_DE_ROTA', () => {
    expect(derivarStatus({ ...semGps, sugestaoTrocaAlta: { placa: 'AAA1A11', hora: null } }).status)
      .toBe('MUDOU_DE_ROTA')
  })

  it('sem sugestão → status base inalterado (não foi ao cliente)', () => {
    expect(derivarStatus({ temGps: true, ficouNaBase: true, paradas: [], placaSaiuDaBase: true }).status)
      .toBe('NAO_FOI_AO_CLIENTE')
  })

  it('entrega confirmada ignora sugestão ALTA (não rebaixa entrega)', () => {
    const r = derivarStatus({ temGps: true, ficouNaBase: false,
      paradas: [{ classificacao: 'LOJA', loja_id: 'x' }],
      sugestaoTrocaAlta: { placa: 'AAA1A11', hora: '06:00' } })
    expect(r.status).toBe('ENTREGUE')
  })
})
