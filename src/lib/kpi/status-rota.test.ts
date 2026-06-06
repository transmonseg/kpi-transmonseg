import { describe, it, expect } from 'vitest'
import { derivarStatus } from './status-rota'

const base = { temGps: true, ficouNaBase: false, paradas: [] as { classificacao: string; loja_id: string | null }[] }

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
