import { describe, it, expect } from 'vitest'
import { normalizaNome, achaClienteGeo, confirmaViaEndereco, type ClienteGeo } from './confirma-endereco'
import type { ParadaUnitrac } from '@/lib/types/unitrac'

function clienteGeo(overrides: Partial<ClienteGeo> = {}): ClienteGeo {
  return { nomeFantasia: 'WW CARNES MERCEARIA EIRELI', lat: -22.9, lng: -43.2, raioM: 150, ...overrides }
}

function parada(overrides: Partial<ParadaUnitrac> = {}): ParadaUnitrac {
  return {
    placa_norm: 'TTL7D40', chegada: new Date('2026-08-06T10:00:00Z'), saida: new Date('2026-08-06T10:15:00Z'),
    duracao_seg: 900, distancia_km: null, endereco: null, lat: -22.9, lng: -43.2,
    local_parada: 'FORA DE BASE', codigo_loja: null, nome_loja: null, classificacao: 'FORA_BASE', ordem: 1, ...overrides,
  }
}

describe('normalizaNome', () => {
  it('remove acento, pontuação, maiúsculas, espaço duplo', () => {
    expect(normalizaNome('Açougue São José - Ltda.')).toBe('ACOUGUE SAO JOSE LTDA')
  })
})

describe('achaClienteGeo', () => {
  const clientes = [clienteGeo({ nomeFantasia: 'WW CARNES MERCEARIA EIRELI' }), clienteGeo({ nomeFantasia: 'PADARIA CORREAS' })]

  it('acha por nome exato (ignorando acento/caixa)', () => {
    const r = achaClienteGeo('ww carnes mercearia eireli', clientes)
    expect(r?.nomeFantasia).toBe('WW CARNES MERCEARIA EIRELI')
  })

  it('acha por conteúdo quando um nome contém o outro', () => {
    const r = achaClienteGeo('WW CARNES', clientes)
    expect(r?.nomeFantasia).toBe('WW CARNES MERCEARIA EIRELI')
  })

  it('não acha quando não bate nada', () => {
    expect(achaClienteGeo('LOJA QUE NAO EXISTE', clientes)).toBeNull()
  })

  it('não acha por nome curto demais (evita colisão por acidente)', () => {
    expect(achaClienteGeo('WW', clientes)).toBeNull()
  })
})

describe('confirmaViaEndereco', () => {
  it('confirma quando uma parada FORA_BASE cai dentro do raio', () => {
    const p = parada({ lat: -22.9001, lng: -43.2001 })
    const r = confirmaViaEndereco([p], clienteGeo({ lat: -22.9, lng: -43.2, raioM: 150 }))
    expect(r).toBe(p)
  })

  it('não confirma quando a parada está fora do raio', () => {
    const p = parada({ lat: -22.95, lng: -43.25 }) // ~6-7km de distância
    const r = confirmaViaEndereco([p], clienteGeo({ lat: -22.9, lng: -43.2, raioM: 150 }))
    expect(r).toBeNull()
  })

  it('ignora paradas que não são FORA_BASE (BASE/LOJA já resolvidas de outro jeito)', () => {
    const p = parada({ classificacao: 'BASE', lat: -22.9001, lng: -43.2001 })
    const r = confirmaViaEndereco([p], clienteGeo({ lat: -22.9, lng: -43.2, raioM: 150 }))
    expect(r).toBeNull()
  })

  it('escolhe a parada mais cedo entre as que batem', () => {
    const cedo = parada({ chegada: new Date('2026-08-06T09:00:00Z'), lat: -22.9001, lng: -43.2001 })
    const tarde = parada({ chegada: new Date('2026-08-06T11:00:00Z'), lat: -22.9002, lng: -43.2002 })
    const r = confirmaViaEndereco([tarde, cedo], clienteGeo({ lat: -22.9, lng: -43.2, raioM: 150 }))
    expect(r).toBe(cedo)
  })
})
