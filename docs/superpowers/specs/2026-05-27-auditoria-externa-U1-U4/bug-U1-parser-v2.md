# U1 — Conectar parser v2 em produção (CRÍTICO)

## Causa raiz

`src/lib/parsers/alteracao-text.ts:208-218` tem fallback que captura PRIMEIRA placa do texto como `entra`, independente de contexto. Quando WhatsApp chega sem labels `Entra:` / `Sai:` explícitos, troca motorista/placa de modo invertido.

```typescript
// alteracao-text.ts:211 — bug confirmado
if (!entra && !sai) {
  for (const linha of linhas) {
    if (/altera[çc][aã]o/i.test(linha)) continue
    const slot = parseSlot(linha)
    if (slot?.placa_norm) {
      entra = slot      // ← bug: primeira placa SEMPRE vira "entra"
      break
    }
  }
}
```

Parser v2 (`src/lib/parsers/alteracoes-v2.ts`, 346 linhas, 30+ testes) **já existe** mas zero rotas de produção chamam.

## Evidência (dia 25/05/2026)

Super Prix 91% de erro. 9 lojas com cascata de motoristas:
- Barra: manual=ERALDO+TML-7D61, sistema=MATHEUS SANDES
- Icaraí: manual=BRUNO, sistema=BRUNO está em Ipanema
- Recreio: manual=WILLIAM, sistema=WILLIAM está em Tijuca

Padrão idêntico ao Atacadão (Belford Roxo ↔ Manilha inversão completa).

## Solução

Substituir `parseAlteracaoText` por `parseAlteracoesV2` em:
- `src/app/api/kpi/simples/analisar-alt/route.ts` linhas 3, 19, 31, 34-36, 144-145, 158-159 (9 referências total)

**Cuidado:** v2 retorna `AlteracaoBloco[]` (shape diferente de `AlteracaoParsed[]` do v1). Precisa adapter ou ajustar consumidor.

## Arquivos a tocar

- `src/app/api/kpi/simples/analisar-alt/route.ts` — substituir import + call
- Possivelmente criar adapter `AlteracaoBloco → AlteracaoParsed` ou ajustar frontend

## Critério de aceite

- [ ] Endpoint `/api/kpi/simples/analisar-alt` chama `parseAlteracoesV2` (NÃO v1)
- [ ] Teste E2E com input WhatsApp dia 25 Super Prix Barra produz `entra={motorista: 'ERALDO', placa: 'TML7D61'}` (não invertido)
- [ ] Frontend ainda recebe shape compatível
- [ ] Suite vitest 302+/302+ (1 teste novo)

## Teste vitest novo

```typescript
import { describe, it, expect } from 'vitest'
import { POST } from '@/app/api/kpi/simples/analisar-alt/route'

describe('U1 — parser v2 em producao', () => {
  it('WhatsApp sem labels: BRUNO TROCANDO COM ERALDO NA BARRA - PLACA TML-7D61', async () => {
    const body = JSON.stringify({ texto: 'BRUNO TROCANDO LUGAR COM ERALDO NA BARRA - PLACA TML-7D61 ENTRA AGORA' })
    const req = new Request('http://test/api/kpi/simples/analisar-alt', { method: 'POST', body, headers: { 'content-type': 'application/json' } }) as any
    const res = await POST(req)
    const data = await res.json()
    expect(data).toHaveLength(1)
    // ERALDO entra (não BRUNO), porque o WhatsApp diz "TROCANDO COM ERALDO ENTRA"
    expect(data[0].entra?.motorista_nome).toMatch(/ERALDO/i)
    expect(data[0].entra?.placa_norm).toBe('TML7D61')
  })
})
```

## Rollback

`git revert` do commit. Volta pro v1 buggy. Backup safety.
