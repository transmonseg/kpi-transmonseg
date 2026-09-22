import { describe, it, expect } from 'vitest'
import { montarPayloadCadastroManual, normalizarEndereco } from './cadastrar-endereco-manual'

// Finding 1 (fix wave 12/09): o cadastro manual e' o UNICO jeito de corrigir
// uma coordenada que a guarda territorial marcou confiavel=false. Sem
// resetar confiavel/motivo aqui, a marca fica pra sempre mesmo depois da
// correcao -- ver comentario em cadastrar-endereco-manual.ts.
describe('montarPayloadCadastroManual', () => {
  it('sempre marca confiavel=true e motivo=null -- humano corrigindo a mao vence a guarda automatica', () => {
    const payload = montarPayloadCadastroManual('rua x,  10 - centro', -22.9, -43.2)
    expect(payload).toEqual({
      endereco: 'RUA X,  10 - CENTRO',
      lat: -22.9,
      lng: -43.2,
      confiavel: true,
      motivo: null,
      fonte: 'manual',
    })
  })

  // Achado real 22/09: geocode.ts (buscarNoCache/salvarNoCache) NAO colapsa
  // espaco interno -- usa a string crua que parse-romaneio.ts produz, que
  // as vezes tem espaco duplo (campo vazio concatenado, ex. "LOTE  28
  // QUADRA  24"). normalizarEndereco colapsando esse espaco grava numa
  // chave DIFERENTE da que a geracao real le -- a correcao manual vira uma
  // linha orfa que nunca e' vista. So' trim (tira espaco das pontas) +
  // uppercase; nunca mexe no meio da string.
  it('so trim + uppercase -- NUNCA colapsa espaco interno (teria que bater a mesma chave que geocode.ts le, que nao normaliza)', () => {
    expect(normalizarEndereco('  Rua   Das Flores, 1 - Centro  ')).toBe('RUA   DAS FLORES, 1 - CENTRO')
  })

  it('espaco duplo no meio do endereco e preservado, nao colapsado pra simples', () => {
    expect(normalizarEndereco('AVENIDA MASCARENHAS DE MORAIS, SN - CHACARA RIO PETROPOLIS, DUQUE DE CAXIAS - LOTE  28  QUADRA  24'))
      .toBe('AVENIDA MASCARENHAS DE MORAIS, SN - CHACARA RIO PETROPOLIS, DUQUE DE CAXIAS - LOTE  28  QUADRA  24')
  })
})
