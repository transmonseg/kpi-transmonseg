import { describe, it, expect } from 'vitest'
import { matchGeoEndereco, normRua, type LojaGeo, type ParadaGeo } from './match-geo-endereco'

// ZS Leblon real (registro Unitrac): -22.984 / -43.224, Rua Dias Ferreira
const ZS_LEBLON: LojaGeo = {
  id: 'zs7', rede_id: 'ZONA_SUL', nome: '07 - ZONA SUL - LEBLON',
  lat: -22.984, lng: -43.2272, endereco: 'RUA DIAS FERREIRA', bairro: 'LEBLON', municipio: 'RIO DE JANEIRO',
}
const ZS_CATETE: LojaGeo = {
  id: 'zs47', rede_id: 'ZONA_SUL', nome: '47 - ZONA SUL - CATETE',
  lat: -22.927, lng: -43.176, endereco: 'RUA DO CATETE', bairro: 'CATETE', municipio: 'RIO DE JANEIRO',
}

function fb(lat: number, lng: number, endereco: string | null): ParadaGeo {
  return { lat, lng, endereco, classificacao: 'FORA_BASE', codigo_loja: null }
}

describe('matchGeoEndereco', () => {
  it('1. FORA_BASE a ~29m da loja casa direto por coord', () => {
    const r = matchGeoEndereco(fb(-22.984, -43.2272, 'Rua Dias Ferreira, Leblon, Rio de Janeiro'), [ZS_LEBLON, ZS_CATETE])
    expect(r?.loja.id).toBe('zs7')
    expect(r?.via).toBe('coord')
  })

  it('2. FORA_BASE a ~200m mas rua confirma → casa coord+rua', () => {
    // ~200m ao norte de Catete, endereço cita "Catete"
    const r = matchGeoEndereco(fb(-22.9252, -43.176, 'Rua do Catete, 235 Catete, Rio de Janeiro'), [ZS_LEBLON, ZS_CATETE])
    expect(r?.loja.id).toBe('zs47')
    expect(r?.via).toBe('coord+rua')
  })

  it('3. FORA_BASE a ~200m e rua NÃO confirma → não casa', () => {
    const r = matchGeoEndereco(fb(-22.9252, -43.176, 'Praca Qualquer, Bairro Outro, Niteroi'), [ZS_LEBLON, ZS_CATETE])
    expect(r).toBeNull()
  })

  it('3b. reforço: a ~200m com SÓ a rua (sem bairro/município/número) → não casa', () => {
    const loja: LojaGeo = { id: 'x', rede_id: 'PREZUNIC', nome: 'PREZUNIC X', lat: -22.9252, lng: -43.178, endereco: 'AVENIDA DAS AMERICAS', bairro: 'BARRA DA TIJUCA', municipio: 'RIO DE JANEIRO', numero: '500' }
    // ~200m, endereço cita só a avenida, sem bairro/cidade/numero
    const r = matchGeoEndereco(fb(-22.9252, -43.176, 'Avenida das Americas'), [loja])
    expect(r).toBeNull()
  })

  it('4. FORA_BASE longe (>250m) → não casa (ruído)', () => {
    const r = matchGeoEndereco(fb(-22.90, -43.20, 'Rua do Catete'), [ZS_LEBLON, ZS_CATETE])
    expect(r).toBeNull()
  })

  it('5. parada sem lat/lng → não casa', () => {
    const r = matchGeoEndereco({ lat: null, lng: null, endereco: 'Rua Dias Ferreira', classificacao: 'FORA_BASE', codigo_loja: null }, [ZS_LEBLON])
    expect(r).toBeNull()
  })

  it('6. parada com codigo_loja não é processada aqui', () => {
    const r = matchGeoEndereco({ ...fb(-22.984, -43.2272, 'Rua Dias Ferreira'), codigo_loja: '9039007' }, [ZS_LEBLON])
    expect(r).toBeNull()
  })

  it('7. parada LOJA (não FORA_BASE) não é processada', () => {
    const r = matchGeoEndereco({ ...fb(-22.984, -43.2272, 'Rua Dias Ferreira'), classificacao: 'LOJA' }, [ZS_LEBLON])
    expect(r).toBeNull()
  })
})

describe('normRua', () => {
  it('remove prefixo de via, número e acento', () => {
    expect(normRua('Avenida Presidente João Goulart, 5001')).toBe('PRESIDENTE JOAO GOULART')
    expect(normRua('R. do Catete')).toBe('DO CATETE')
  })
})
