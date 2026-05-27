# Spec mestre — Bugs URGENTES da auditoria externa (U1-U4)

**Data:** 2026-05-27 (tarde)
**Base:** auditoria externa Claude.ai em `docs/auditoria/AUDITORIA_DEFINITIVA_extracted.txt`
**Veredito:** `docs/auditoria/auditoria-27-05/00-veredito.md` (CONCORDO com auditoria)
**Status:** 📋 Aprovado pelo user — começar imediatamente

## Contexto

Auditoria externa identificou 22 bugs no repositório. Os 4 URGENTES atacam a CAUSA RAIZ dos erros de produção (parser v1 de alterações + lookupSlot priorizando placa). Os 7 fixes da FASE 4 atacaram efeitos secundários no matcher — não a causa raiz.

## Métrica global

| Indicador | Atual | Meta |
|-----------|-------|------|
| Acurácia Super Prix dia 25 | 8,6% | ≥95% |
| Acurácia Atacadão dia 25 | 69% | ≥95% |
| Testes vitest | 301/301 | 305+/305+ |
| Typecheck | 0 erros | 0 erros |
| Não-regressão dias 19/20/21 | ZS dia 21: 100% | manter |

## Princípio de aceite

Para cada bug, criterio é **estrito**: fix tem que resolver o caso reproduzível mencionado na auditoria + ter teste vitest cobrindo + não regredir suite atual.

## Ordem de ataque (sequencial)

| # | Bug | Causa | Sub-spec |
|---|-----|-------|----------|
| 1 | **U1** Parser v2 não conectado | `analisar-alt/route.ts` ainda usa `parseAlteracaoText` (v1 com fallback bugado) | [U1](./bug-U1-parser-v2.md) |
| 2 | **U2** VEICULOS_INATIVOS hífen | Lista negra com `'ALS-4H33'` mas Unitrac normaliza sem hífen | [U2](./bug-U2-veiculos-inativos.md) |
| 3 | **U3** lookupSlot prioriza placa | `lookup-canonical.ts:55` procura placa antes de nome — retorna motorista histórico errado | [U3](./bug-U3-lookupslot.md) |
| 4 | **U4** Promise.all sem isolamento | `kpi/simples/route.ts:449` — 1 rede falhar derruba 5 | [U4](./bug-U4-promise-allsettled.md) |

## Workflow por bug

Igual FASE 4: branch isolada → diagnose → TDD → fix → review → merge atômico. Skills: `mattpocock:diagnose`, `mattpocock:tdd`, `mattpocock:grill-me`, `superpowers:systematic-debugging`, `superpowers:verification-before-completion`.

## Critério de "pronto"

- [ ] 4 bugs URGENTES commitados em main
- [ ] User regerou KPI dia 25 no Vercel e Super Prix mostra ≥95%
- [ ] Suite vitest verde + typecheck zero
- [ ] STATE.md + FLUXO-ATIVO.md atualizados
