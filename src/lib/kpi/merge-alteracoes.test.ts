import { describe, it, expect } from 'vitest'
import { mergeAlteracoes, type AltEntry } from './merge-alteracoes'

const baseEntra = (over: Partial<NonNullable<AltEntry['entra']>> = {}) => ({
  motorista_nome: null,
  motorista_codigo: null,
  placa_raw: null,
  placa_norm: null,
  ...over,
})

const baseSai = (over: Partial<NonNullable<AltEntry['sai']>> = {}) => ({
  motorista_nome: null,
  placa_norm: null,
  ...over,
})

describe('mergeAlteracoes', () => {
  it('inline sem placa + db com mesmo motorista+rede → retorna 0 (dedup pelo fallback motorista)', () => {
    const inline: AltEntry[] = [
      {
        tipo: 'SUBSTITUICAO',
        rede_id: 'rede-1',
        loja_raw: 'Filial 12',
        entra: baseEntra({ motorista_nome: 'João Silva' }),
        sai: baseSai({ motorista_nome: 'Pedro Souza' }),
      },
    ]
    const db: AltEntry[] = [
      {
        tipo: 'SUBSTITUICAO',
        rede_id: 'rede-1',
        loja_raw: 'Filial 12',
        entra: baseEntra({ motorista_nome: 'JOÃO SILVA' }),
        sai: baseSai({ motorista_nome: 'pedro souza' }),
      },
    ]

    const merged = mergeAlteracoes(inline, db)
    // ambas deduplicadas: resta apenas a do inline (1 entrada total)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toBe(inline[0])
  })

  it('inline com placa + db com mesma placa → dedup por placa (sem duplicação)', () => {
    const inline: AltEntry[] = [
      {
        tipo: 'SUBSTITUICAO',
        rede_id: 'rede-1',
        loja_raw: null,
        entra: baseEntra({ placa_norm: 'ABC1D23' }),
        sai: baseSai({ placa_norm: 'XYZ9W87' }),
      },
    ]
    const db: AltEntry[] = [
      {
        tipo: 'SUBSTITUICAO',
        rede_id: 'rede-1',
        loja_raw: null,
        entra: baseEntra({ placa_norm: 'ABC1D23' }),
        sai: baseSai({ placa_norm: 'XYZ9W87' }),
      },
    ]

    const merged = mergeAlteracoes(inline, db)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toBe(inline[0])
  })

  it('inline diferente do db → mantém ambos (sem dedup)', () => {
    const inline: AltEntry[] = [
      {
        tipo: 'SUBSTITUICAO',
        rede_id: 'rede-1',
        loja_raw: null,
        entra: baseEntra({ placa_norm: 'ABC1D23' }),
        sai: baseSai({ placa_norm: 'XYZ9W87' }),
      },
    ]
    const db: AltEntry[] = [
      {
        tipo: 'SUBSTITUICAO',
        rede_id: 'rede-2',
        loja_raw: null,
        entra: baseEntra({ placa_norm: 'QQQ1Q11' }),
        sai: baseSai({ placa_norm: 'ZZZ2Z22' }),
      },
    ]

    const merged = mergeAlteracoes(inline, db)
    expect(merged).toHaveLength(2)
    expect(merged[0]).toBe(inline[0])
    expect(merged[1]).toBe(db[0])
  })

  it('inline sem placa + db com motorista diferente → mantém ambos', () => {
    const inline: AltEntry[] = [
      {
        tipo: 'SUBSTITUICAO',
        rede_id: 'rede-1',
        loja_raw: null,
        entra: baseEntra({ motorista_nome: 'João Silva' }),
        sai: baseSai({ motorista_nome: 'Pedro Souza' }),
      },
    ]
    const db: AltEntry[] = [
      {
        tipo: 'SUBSTITUICAO',
        rede_id: 'rede-1',
        loja_raw: null,
        entra: baseEntra({ motorista_nome: 'Carlos Mendes' }),
        sai: baseSai({ motorista_nome: 'Pedro Souza' }),
      },
    ]

    const merged = mergeAlteracoes(inline, db)
    expect(merged).toHaveLength(2)
  })

  it('inline sem placa + db com mesmo motorista mas rede diferente → mantém ambos', () => {
    const inline: AltEntry[] = [
      {
        tipo: 'SUBSTITUICAO',
        rede_id: 'rede-1',
        loja_raw: null,
        entra: baseEntra({ motorista_nome: 'João Silva' }),
        sai: baseSai({ motorista_nome: 'Pedro Souza' }),
      },
    ]
    const db: AltEntry[] = [
      {
        tipo: 'SUBSTITUICAO',
        rede_id: 'rede-2',
        loja_raw: null,
        entra: baseEntra({ motorista_nome: 'João Silva' }),
        sai: baseSai({ motorista_nome: 'Pedro Souza' }),
      },
    ]

    const merged = mergeAlteracoes(inline, db)
    expect(merged).toHaveLength(2)
  })
})
