# 🔥 FLUXO ATIVO — Correção dia 19/05/2026

> **AO RETOMAR APÓS COMPACTAÇÃO: LEIA ESTE ARQUIVO PRIMEIRO.**
> Não pule. Não improvise. Continue exatamente daqui.

## 📍 Posição atual

**Status:** ✅ **TODOS OS 7 BUGS ATACADOS** — código pronto pra teste no Vercel.
**Próximo passo:** user regerar KPIs no Vercel e comparar com manuais.

## 📊 Resultado consolidado (ANTES → DEPOIS)

| Dia | ❌ Antes | ❌ Depois | Redução |
|-----|---------|----------|---------|
| 19 | 36 | 32 | -4 |
| 20 | 33 | 26 | -7 |
| 21 | 31 | **14** | **-17** (mais que a metade) |

**ZS dia 21: 11/11 (100%) mantido.** 301/301 testes vitest. Typecheck zero erros.

## ✅ Concluído

- A.0.1 brainstorming ✅ (commit `0ae769f`) — spec mestre + 7 sub-specs
- A.0.2 writing-plans ✅ (commit `be3db69`) — 754 linhas, 19 tasks
- Task 0 baseline ✅ (commit `38b3c30`) — 62✅+121⚠️ = 183/241 (76%) aceitável
- Bug 1 Task 1 investigação ✅ — **H2 CONFIRMADA: bug em `aplicar-alteracoes.ts`, NÃO no parser PDF**
- **Bug 1 Task 2 fix ✅** (commit `97420ae` merged main) — INCLUSAO não espalha (4 ASSAI corrigidas). 283/283 vitest. Code review APROVADO.
- **Bug 2B fix ✅** (commit `e243f7b` merged main) — Parser GUANABARA: ARTHUR não vira ART+HUR-1841. Lookbehind em 3 regex. 285/285 vitest. Code review APROVADO.
- **Bug 2A fix ✅** (commit `577a61c` merged main) — paradaRedeInfer 2-pass: codigo/nome exato bloqueia GEO falso. Falso positivo ZS Loja 07 removido + SUPERPRIX 201 corrigido (bônus). 287/287 vitest. Review manual APROVADO.
- **Bug 3 fix ✅** (commit `130ade5` merged main) — temLojaOrfaMesmaRede usa lojasParadas (pós-consolidação) ao invés de todasAjustadas (bruto). Resolve ZS Loja 47 Catete + bônus PREZUNIC Cidade de Deus e CARREFOUR Campos Goytacazes. 288/288 vitest. **Concern: 16 das 17 lojas do plano eram divergências manual×GPS reais, não bugs.**
- **Bug 4 NO-OP ✅** (commit `5b10eb5` merged main) — Investigação confirmou que **0/13 lojas eram bugs reais do matcher**. 6 sem GPS, 2 já corrigidas pelo Bug 3, 4 escala≠manual, 1 BLANK_OK. 2 testes de não-regressão adicionados. 290/290 vitest.
- **Bug 5 fix ✅** (commit `f342b57` merged main) — `agrupar-por-loja.ts` agora resiliente a carro_ordem duplicado: slot preferido ocupado → cai pro oposto vazio. Resolve ZS Loja 31 (DBB+LTE) e MEGA BOX 02. **Concern: GUANABARA Vila Isabel/Tijuca não resolvido — parser PDF não extrai 2º carro.** 297/297 vitest (7 novos).
- **Bug 6 fix ✅** (commit `2c0ca11` merged main) — `estendeSaidaPorForaBase` aceita FORA_BASE/FAKE_EXIT como matched + multi-step cadeia + gap gradient. Resolve 4/10: MANILHA, SULACAP, BENTO RIBEIRO, BONSUCESSO. 6 restantes são convenção SL=fim-rota. PREZUNIC Fonseca dia 20 mantido. 300/300 vitest.
- **Bug 7 fix ✅** (commit `4f6ac48` merged main) — T18-X2 detecta ambiguidade no lookup de lojaEscala (qualificador comum "Serra Azul"). Resolve 4/7: ZS Loja 14, PREZUNIC Botafogo/Jauru/Taquara. 3 restantes documentados (1 manual errado, 2 cadastro). 301/301 vitest.

## 🎯 Meta

- Base: 190/242 = 78.5% aceitável (dia 19, todas redes)
- Meta: ≥218/242 = 90%+
- Não-regressão dia 20/21

## 📋 Plano macro (125 etapas)

### Fase A — Re-análise (15 etapas)
- [ ] A.0.1 brainstorming → spec inicial
- [ ] A.0.2 zoom-out matcher.ts
- [ ] A.0.3 zoom-out parsers
- [ ] A.1.1-4 PDFs (4 arquivos) com skill `pdf`
- [ ] A.2.1-5 XLSX (5 arquivos) com skill `xlsx`
- [ ] A.3.1-2 Síntese CONCLUSAO.md

### Fase B — Triage + Spec (3 etapas)
- [ ] B.1 triage → priorizar 7 bugs
- [ ] B.2 writing-plans → spec mestre
- [ ] B.3 grill-me → interrogar spec

### Fase C — Correção bug-por-bug (7 × 14 = 98 etapas)
- [ ] Bug 1: Padrão 3 — Alteração PDF (4 ASSAI)
- [ ] Bug 2: Padrão 8 — Placa trocada (10)
- [ ] Bug 3: Padrão 1 — Multi-trip (17)
- [ ] Bug 4: Padrão 6 — Lojas faltando (13)
- [ ] Bug 5: Padrão 4 — Carro 2º (5)
- [ ] Bug 6: Padrão 2 — SL curta (10)
- [ ] Bug 7: Padrão 5 — Falso positivo (8)

### Fase D — Validação (9 etapas)
- [ ] D.1-9 Re-rodar dia 19/20/21 + push + rollout

## 🔗 Arquivos críticos

- Auditoria base: `docs/auditoria/dia-19-todas-redes/00-bugs-consolidados.md`
- Regras alterações: `docs/auditoria/REGRAS-ALTERACOES.md`
- ZS dia 19 detalhe: `docs/auditoria/2026-05-26-zs-dia19-manual.md`
- Spec mestre (a criar): `docs/superpowers/specs/2026-05-26-kpi-fix-dia19.md`

## 🧰 Skills em uso

| Skill | Status |
|-------|--------|
| superpowers:brainstorming | ✅ instalada |
| superpowers:writing-plans | ✅ instalada |
| superpowers:systematic-debugging | ✅ instalada |
| superpowers:test-driven-development | ✅ instalada |
| superpowers:executing-plans | ✅ instalada |
| superpowers:verification-before-completion | ✅ instalada |
| superpowers:requesting-code-review | ✅ instalada |
| superpowers:receiving-code-review | ✅ instalada |
| superpowers:finishing-a-development-branch | ✅ instalada |
| superpowers:using-git-worktrees | ✅ instalada |
| superpowers:dispatching-parallel-agents | ✅ instalada |
| superpowers:subagent-driven-development | ✅ instalada |
| mattpocock:diagnose | ✅ instalada em `.agents/skills/diagnose` |
| mattpocock:triage | ✅ instalada |
| mattpocock:grill-me | ✅ instalada |
| mattpocock:zoom-out | ✅ instalada |
| anthropics:pdf | ✅ instalada |
| anthropics:xlsx | ✅ instalada |

## 📝 Histórico de etapas concluídas

(vazio — começando agora)

## 🔥 Última atualização

2026-05-26 — Sistema de persistência criado. Próximo: A.0.1.
