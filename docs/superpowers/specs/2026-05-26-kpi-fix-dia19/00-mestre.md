# Spec mestre — Correção 7 padrões de bug KPI dia 19/05/2026

**Data:** 2026-05-26
**Autor:** Claude Code + user
**Base:** auditoria completa em `docs/auditoria/dia-19-todas-redes/`
**Status:** 📋 Aprovado (aguardando writing-plans)

## Contexto

Auditoria placa-por-placa do dia 19 (9 redes, 242 lojas) identificou 8 padrões de bug. O padrão 7 (convenção Tia Érica ASSAI SL=fim-rota) não é bug de código. Os outros 7 são alvo deste spec.

## Métrica global

| Métrica | Atual | Meta |
|---------|-------|------|
| % aceitável dia 19 | 190/242 (78.5%) | ≥218/242 (90%) |
| Vitest | 282/282 | 282+/282+ |
| Typecheck | 0 erros | 0 erros |
| Não-regressão dia 20 | 47/198 (24%) ✅ | ≥47 |
| Não-regressão dia 21 | 29/173 (17%) ✅ | ≥29 |

## Princípio de "aceite híbrido"

- **Bugs de timing** (multi-trip, SL curta): tolerante Δ≤7min CHD, Δ≤10min SL.
- **Bugs estruturais** (placa trocada, loja faltando, carro 2º, alteração propagada): estrito — match exato de placa/loja/presença.
- **Falsos positivos**: GPS + raio cadastrado + parada LOJA = sistema certo, mesmo se manual diz NÃO_FOI.

## Ordem de ataque (sequencial, 1 por vez)

| # | Bug | Causa hipotética | Sub-spec |
|---|-----|-------------------|----------|
| 1 | Padrão 3 — Alteração PDF propagada | PARSER PDF tabular pega `loja_raw` genérico | [bug-1](./bug-1-pdf-alteracao.md) |
| 2 | Padrão 8 — Placa trocada | PARSER + MATCHER (OCR + plate-swap) | [bug-2](./bug-2-placa-trocada.md) |
| 3 | Padrão 1 — Multi-trip parada errada | MATCHER assignment escolhe parada wrong | [bug-3](./bug-3-multi-trip.md) |
| 4 | Padrão 6 — Lojas faltando | MATCHER (várias causas) | [bug-4](./bug-4-lojas-faltando.md) |
| 5 | Padrão 4 — Carro 2º faltando | MATCHER multi-row | [bug-5](./bug-5-carro-2.md) |
| 6 | Padrão 2 — SL muito curta | MATCHER estender `estendeSaidaPorForaBase` | [bug-6](./bug-6-sl-curta.md) |
| 7 | Padrão 5 — Falso positivo | Filtros + GPS=autoridade | [bug-7](./bug-7-falso-positivo.md) |

## Workflow por bug

Para cada bug, segue 14 etapas:
1. Branch isolada (`using-git-worktrees`)
2. Feedback loop minimal (`diagnose`)
3. Hipótese explícita (`systematic-debugging`)
4. Bisseção (`diagnose`)
5. Confirmar com dados crus (`pdf`/`xlsx` quando aplicável)
6. Grill: interrogar fix (`grill-me`)
7. Sub-plano (`writing-plans`)
8. Teste vitest FAILING (`test-driven-development`)
9. Implementação mínima (`executing-plans`)
10. Teste PASSING + full suite (`tdd`)
11. Verificação real (`verification-before-completion`)
12. Code review (`requesting-code-review` + Agent)
13. Aplicar feedback (`receiving-code-review`)
14. Merge + push (`finishing-a-development-branch`)

## Rollback global

Cada fix é um commit atômico em branch própria. Se algum quebrar:
- `git revert <hash>` do commit específico
- Re-rodar suite vitest
- Re-rodar `regerar_local.ts` pra confirmar volta ao baseline

## Não-objetivos

- ❌ Refatorar `matcher.ts` (1600+ linhas). Só fixes pontuais.
- ❌ Mexer em `mcp/server.ts` exceto se essencial.
- ❌ Resolver Padrão 7 (convenção SL=fim-rota ASSAI) — documentado como ressalva.

## Critério de "pronto"

- [ ] Todos os 7 bugs com PR commitado em main
- [ ] Métrica global atingida (≥90% dia 19)
- [ ] STATE.md + FLUXO-ATIVO.md atualizados
- [ ] User testou no Vercel e aprovou
