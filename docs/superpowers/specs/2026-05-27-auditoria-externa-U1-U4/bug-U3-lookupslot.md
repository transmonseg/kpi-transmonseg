# U3 — lookupSlot priorizar nome (ALTO)

## Causa raiz

`src/lib/parsers/lookup-canonical.ts:55-60`:

```typescript
export function lookupSlot(input: LookupInput, ctx: ParseContext): SlotVeiculo {
  const { placas, codigos, nomeHint } = input
  let match: Associacao | null = null
  if (placas.length > 0) {       // ← bug: placa antes de nome
    const candidatos = ctx.associacoes
      .filter(a => a.placa_norm === input.placas[0])
      .sort((a, b) => b.data_entrega.localeCompare(a.data_entrega))
    if (candidatos.length > 0) {
      return slotFromAssoc(candidatos[0])  // ← retorna histórico, ignora nomeHint
    }
  }
  // ... codigos > nome
}
```

Quando mensagem WhatsApp menciona `BRUNO + placa TML-7D61`, mas a placa TML-7D61 estava recentemente associada a ERALDO no banco, lookupSlot retorna ERALDO ignorando "BRUNO".

## Evidência

- Caso Catete (Princesa): RAFAEL/KVT-5427 escalado, mas placa antiga KQR-2J11 era do KANU. Manual ficou em branco — operador desconfiou.
- Cascata Super Prix: ERALDO/BRUNO/WILLIAM/RODRIGO embaralhados em 9 lojas.

## Solução

Adicionar parâmetro `preferNome?: boolean` em `lookupSlot`. Quando `preferNome=true` E `nomeHint` presente, tentar match por nome ANTES do match por placa. Frontend (que cola WhatsApp) passa `preferNome=true` porque o nome digitado é fonte primária.

Fallback: se nome não encontrar, cai pra match por placa (comportamento atual).

## Arquivos a tocar

- `src/lib/parsers/lookup-canonical.ts` — adicionar param + branch no início
- Caller (provavelmente em `alteracoes-v2.ts` ou `analisar-alt/route.ts`) — passar `preferNome=true`

## Critério de aceite

- [ ] `lookupSlot({ placas: ['TML7D61'], nomeHint: 'BRUNO' }, ctx, { preferNome: true })` retorna BRUNO (não histórico ERALDO)
- [ ] Sem `preferNome`, comportamento atual preservado (retrocompat)
- [ ] Suite 304+/304+ (1 teste novo)

## Teste vitest novo

```typescript
import { describe, it, expect } from 'vitest'
import { lookupSlot } from './lookup-canonical'

describe('U3 — lookupSlot prefereNome', () => {
  it('quando preferNome=true, ignora placa historica e usa nomeHint', () => {
    const ctx = {
      associacoes: [
        { placa_norm: 'TML7D61', motorista_nome: 'ERALDO', motorista_codigo: 100, data_entrega: '2026-05-20' },
      ],
      motoristas: [
        { codigo: 200, nome: 'BRUNO' },
      ],
    } as any
    const r = lookupSlot({ placas: ['TML7D61'], codigos: [], nomeHint: 'BRUNO' }, ctx, { preferNome: true })
    expect(r.motorista_nome).toMatch(/BRUNO/i)
    expect(r.placa_norm).toBe('TML7D61')
  })
  it('sem preferNome, comportamento atual: retorna historico', () => {
    // ... mesmo ctx ...
    const r = lookupSlot({ placas: ['TML7D61'], codigos: [], nomeHint: 'BRUNO' }, ctx)
    expect(r.motorista_nome).toMatch(/ERALDO/i)
  })
})
```

## Rollback

`git revert`. `preferNome` é opcional — sem ele, comportamento idêntico ao atual.
