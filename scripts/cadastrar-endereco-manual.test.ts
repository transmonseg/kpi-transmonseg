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
      endereco: 'RUA X, 10 - CENTRO',
      lat: -22.9,
      lng: -43.2,
      confiavel: true,
      motivo: null,
    })
  })

  it('normaliza o endereco (trim/uppercase/colapsa espaco) igual buscarNoCache/salvarNoCache', () => {
    expect(normalizarEndereco('  Rua   Das Flores, 1 - Centro  ')).toBe('RUA DAS FLORES, 1 - CENTRO')
  })
})
