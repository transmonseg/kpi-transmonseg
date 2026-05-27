# Veredito — Auditoria externa Claude.ai 27/05/2026

> **Análise crítica feita por Claude Code após leitura completa de `AUDITORIA_DEFINITIVA_extracted.txt` (538 linhas) e verificação bug-por-bug no main `29d7644`.**

## Resumo: CONCORDO COM A AUDITORIA

A auditoria externa identificou corretamente a causa raiz dos erros em produção. Os 4 bugs URGENTES (U1-U4) estão **TODOS CONFIRMADOS** no código atual. Os bugs IMPORTANTES (I1-I4) e os 12 secundários (N1-N12) também foram verificados — a grande maioria procede.

**Insight chave que valida a auditoria:** os 7 bugs que corrigimos na FASE 4 (sessão 26/05) atacaram **efeitos no matcher e no agrupador** — não a causa raiz no parser de alterações. Por isso o ganho foi modesto (-28 erros nos 3 dias), enquanto a auditoria projeta **Super Prix 8,6% → 95%** apenas com U1.

## Verificação bug-por-bug

### ✅ URGENTES (procedem em 100%, somam 8h)

#### U1 — Parser v1 fallback implícito + v2 não conectado (CRÍTICO)
**Confirmado em:**
- `src/lib/parsers/alteracao-text.ts:208-218` — fallback implícito captura PRIMEIRA placa como `entra`
- `src/app/api/kpi/simples/analisar-alt/route.ts:3` — importa `parseAlteracaoText` (v1)
- `src/lib/parsers/alteracoes-v2.ts` — v2 existe (parser melhor) mas nenhuma rota chama

**Mecânica do bug (validada):**
```typescript
// alteracao-text.ts:211
if (!entra && !sai) {
  for (const linha of linhas) {
    if (/altera[çc][aã]o/i.test(linha)) continue
    const slot = parseSlot(linha)
    if (slot?.placa_norm) {
      entra = slot      // ← bug: primeira placa sempre vira "entra"
      break
    }
  }
}
```

Quando mensagem WhatsApp não tem "Entra:" e "Sai:" explícitos, a primeira placa vira "entra". Combinado com `lookupSlot` (U3), produz motorista invertido sistemicamente.

**Concordo 100%. Esse é O bug principal.**

#### U2 — VEICULOS_INATIVOS com hífen (ALTO)
**Confirmado em `src/lib/kpi/veiculos-inativos.ts`:**
```
'ALS-4H33', 'AMI-1562', 'AMR-9986', 'AMW-4D50', 'DDI-6J90'... (31 placas)
```
Parser Unitrac normaliza placa removendo hífen — comparação falha silenciosamente em 100% dos casos. Lista negra completamente ineficaz.

**Concordo 100%. Fix de 30min com `normalizaPlaca`.**

#### U3 — lookupSlot prioriza placa sobre nome (ALTO)
**Confirmado em `src/lib/parsers/lookup-canonical.ts:55-60`:**
```typescript
export function lookupSlot(input: LookupInput, ctx: ParseContext): SlotVeiculo {
  const { placas, codigos, nomeHint } = input
  let match: Associacao | null = null
  if (placas.length > 0) { ... }  // ← placa primeiro
```

Resultado: quando WhatsApp diz "BRUNO + placa TML-7D61" mas TML-7D61 estava recentemente associada a ERALDO no banco, retorna ERALDO ignorando "BRUNO".

**Concordo 100%. Esse é o caso Catete/Princesa.**

#### U4 — Promise.all sem isolamento (MÉDIO)
**Confirmado em `src/app/api/kpi/simples/route.ts:449`:**
```typescript
results = await Promise.all(...)  // ← 1 erro derruba tudo
```

Operador gera 6 redes, 1 falha por bug isolado, perde os 5 prontos. Fix trivial: `Promise.allSettled`.

**Concordo 100%.**

### ✅ IMPORTANTES (I1-I4, somam 8h)

| # | Bug | Verificação | Veredito |
|---|-----|-------------|----------|
| I1 | computeSaidaCd em 2 lugares (unitrac.ts vs matcher.ts) | Confirmado: divergem em fallback | Concordo |
| I2 | Warning alteracoes vazias ausente | Confirmado: aplicaAlteracoes pulado silenciosamente | Concordo |
| I3 | inferirSaiDaEscala usa createClient (RLS) | Confirmado: `analisar-alt/route.ts:123` | Concordo |
| I4 | 3ª linha agrupar-por-loja descartada silenciosamente | Confirmado: ANOM-13 falta | Concordo |

### ✅ N1-N12 (BAIXOS/MÉDIOS, somam 12h)

| # | Bug | Veredito |
|---|-----|----------|
| N1 | parsedToConfirmada mapeia loja_nome_raw → loja_raw | Concordo. Confirmado linha 143. |
| N2 | VEICULOS_INATIVOS hífen | Mesmo bug do U2 |
| N3 | ZS data_entrega D+1 + aplicarAlteracoes não considera cross-day | Concordo. Confirmado `FILIAIS_D1_FIXAS`. |
| N4 | agrupar-por-loja 3ª linha descartada | Mesmo do I4 |
| N5 | unitrac-pdf REPAIR regex pode consumir paradas seguintes | Plausível, não testei |
| N6 | inferirSaiDaEscala RLS | Mesmo do I3 |
| N7 | variantesOcr só posição 4 | Concordo, mas é trade-off conhecido |
| N8 | lineEdits indexado por ordem | Plausível, não testei |
| N9 | PARADA_REGEX endereço não-greedy | Plausível |
| N10 | alteracao.ts terceiro parser morto | Confirmado: 5912 bytes no main |
| N11 | lineEdits sorted por loja_nome_raw | Plausível |
| N12 | unitrac.ts computeSaidaCd fallback | Concordo. Igual I1. |

### Bugs estruturais e código morto

| Item | Veredito |
|------|----------|
| 4 arquivos código morto (consolidador.ts, analisador-ia.ts, alteracao.ts, unitrac-pdf-coord.ts) | Confirmado. ~680 linhas. |
| 110+ scripts debug em `scripts/analise/_tmp_*` | **Já arquivei** em `scripts/_archive/` (58 movidos) |
| 3 parsers paralelos (v0/v1/v2) | Confirmado |

## Comparação: nossos fixes FASE 4 vs auditoria externa

| Nosso fix | Atacou bug da auditoria? |
|-----------|---------------------------|
| Bug 1 — aplicar-alteracoes match estrito por filial | **NÃO** — é efeito downstream. Causa raiz (U1) intocada. |
| Bug 2A — paradaRedeInfer 2-pass | NÃO listado na auditoria. Provavelmente bug menor que não apareceu na amostragem dia 25. |
| Bug 2B — parser GUANABARA lookbehind | NÃO listado. Bug real mas em parser diferente. |
| Bug 3 — temLojaOrfa pós-consolidação | NÃO listado. Bug menor. |
| Bug 4 — NO-OP | OK |
| Bug 5 — agrupar-por-loja resiliente | Conexão fraca com I4 (ANOM-13). Atacou parte do problema. |
| Bug 6 — estendeSaidaPorForaBase expandido | NÃO listado. Melhoria genuína mas marginal. |
| Bug 7 — T18-X2 ambiguidade | NÃO listado. Provavelmente bug menor. |

**Conclusão:** os 7 fixes da FASE 4 são **legítimos** (resolvem bugs reais) mas **não atacam a causa raiz dos erros do dia 25** (parser v1 + lookupSlot).

## Discordâncias / observações

1. **N7 (variantesOcr só posição 4):** a auditoria sugere que poderia ser mais amplo. Discordo parcialmente — `corrigeOcrPlaca` em `placa.ts` JÁ tem mapa mais amplo e roda no parse, e a limitação de posição 4 no matcher é proteção contra explosão combinatorial.

2. **Tempo total 28h:** subestimado. U1 (3-4h) provavelmente vai requerer adaptação de tipos + migração de testes, podendo chegar a 6-8h sozinho. Estimativa realista: **40-50h totais.**

3. **Auditoria diz "tela de revisão pré-KPI já tem infra":** confirmei task #181 marcada completed mas vale verificar se a UI realmente existe — pode ser falsa premissa.

## Plano de execução proposto

### Hoje (sistema tem que ficar pronto)

**Bloco URGENTE — 4 commits atômicos sequenciais (subagent-driven, ~10h):**

1. **U1** (subagent): conectar parser v2
   - branch `fix/parser-v2-em-producao`
   - investigação → grill-me → TDD → fix → review → merge
   
2. **U2** (subagent): normalizar VEICULOS_INATIVOS
   - branch `fix/veiculos-inativos-norm`
   - 30min total
   
3. **U3** (subagent): lookupSlot priorizar nome
   - branch `fix/lookupslot-prefere-nome`
   
4. **U4** (subagent): Promise.allSettled
   - branch `fix/promise-allsettled`

### Amanhã (FASE 5 final)

- I1-I4 (8h)
- Limpeza código morto (3h, D1-D2)
- Validação dia 25 placa-por-placa (revisão definitiva)

## Status

✅ Veredito completo. Pronto pra começar U1 imediatamente.

---

**Próxima ação:** despachar subagent pra Bug U1 (parser v2 em produção).
