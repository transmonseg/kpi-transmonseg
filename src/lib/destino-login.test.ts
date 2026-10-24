import { describe, it, expect } from 'vitest'
import { destinoAposLogin, avisoContaAdmin } from './destino-login'

// F3-12 (AC-07): o operador cai direto no Ao vivo depois de entrar; admin e os
// outros papéis continuam no painel. Aviso discreto quando um admin sobe romaneio
// (16 a 23/10: toda a operação rodou na conta admin compartilhada).

const op = (empresas: string[]) => ({ papel: 'operador' as const, empresas })

describe('destinoAposLogin', () => {
  it('operador com Nutry ou Rio Quality cai no Ao vivo', () => {
    expect(destinoAposLogin(op(['nutrimax']), null, false)).toBe('/painel/ao-vivo')
    expect(destinoAposLogin(op(['rioquality']), null, false)).toBe('/painel/ao-vivo')
  })
  it('operador sem Nutry/Rio Quality e os outros papéis vão ao painel', () => {
    expect(destinoAposLogin(op(['portefrio']), null, false)).toBe('/painel')
    expect(destinoAposLogin({ papel: 'admin', empresas: [] }, null, false)).toBe('/painel')
    expect(destinoAposLogin({ papel: 'gerente', empresas: ['nutrimax'] }, null, false)).toBe('/painel')
    expect(destinoAposLogin(null, null, false)).toBe('/painel')
  })
  it('volta seguro tem prioridade; app desktop mantém o Gerar KPI', () => {
    expect(destinoAposLogin(op(['nutrimax']), '/painel/nutrimax/historico', false)).toBe('/painel/nutrimax/historico')
    expect(destinoAposLogin(op(['nutrimax']), '//mal.com', false)).toBe('/painel/ao-vivo')
    expect(destinoAposLogin(op(['nutrimax']), '/painel/ao-vivo', true)).toBe('/painel/kpi/simples')
  })
})

describe('avisoContaAdmin', () => {
  it('só aparece para admin', () => {
    expect(avisoContaAdmin('admin')).toMatch(/conta administrativa/i)
    expect(avisoContaAdmin('operador')).toBeNull()
    expect(avisoContaAdmin(null)).toBeNull()
  })
})
