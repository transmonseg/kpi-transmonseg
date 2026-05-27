# U2 — Normalizar VEICULOS_INATIVOS (ALTO)

## Causa raiz

`src/lib/kpi/veiculos-inativos.ts` tem lista negra de 31 placas, todas COM hífen (`'ALS-4H33', 'AMI-1562', 'AMW-4D50', 'DDI-6J90'...`).

Parser Unitrac normaliza removendo hífens. Função `isVeiculoInativo` compara placa do GPS (sem hífen, ex: `ALS4H33`) contra lista (com hífen, ex: `ALS-4H33`) — comparação falha em 100% dos casos. Lista negra é totalmente ineficaz.

## Solução

Aplicar `normalizaPlaca` (já existe em `src/lib/utils/placa.ts`) na função `isVeiculoInativo` E na construção da lista. Match passa a comparar formato normalizado de ambos os lados.

## Arquivos a tocar

- `src/lib/kpi/veiculos-inativos.ts` — uma função, ~5 linhas

## Critério de aceite

- [ ] `isVeiculoInativo('ALS4H33')` retorna `true` (testar formato sem hífen)
- [ ] `isVeiculoInativo('ALS-4H33')` retorna `true` (formato original)
- [ ] Lista negra das 31 placas finalmente funciona em produção
- [ ] Suite vitest 303+/303+ (2 testes novos)

## Teste vitest novo

```typescript
import { describe, it, expect } from 'vitest'
import { isVeiculoInativo } from './veiculos-inativos'

describe('U2 — VEICULOS_INATIVOS normalizado', () => {
  it('aceita placa sem hifen (formato Unitrac)', () => {
    expect(isVeiculoInativo('ALS4H33')).toBe(true)
    expect(isVeiculoInativo('AMW4D50')).toBe(true)
  })
  it('continua aceitando placa com hifen (formato manual)', () => {
    expect(isVeiculoInativo('ALS-4H33')).toBe(true)
  })
  it('rejeita placa NÃO listada', () => {
    expect(isVeiculoInativo('XYZ9999')).toBe(false)
  })
})
```

## Rollback

`git revert`. Volta à lista inefetiva (estado atual). Sem risco.
