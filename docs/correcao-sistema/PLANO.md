# Plano Mestre — Correção do Sistema KPI

> **Princípio:** fases sequenciais, cada uma com critério de sucesso claro, reversível, e validada antes de avançar.

---

## Visão geral

| Fase | Nome | Duração estimada | Bloqueia próxima? |
|------|------|------------------|-------------------|
| 0 | Sanitização do cadastro de lojas | 4-6h | ✓ Sim |
| 1 | Pipeline de alterações robusto | 2-3h | ✓ Sim |
| 2 | Matcher simplificado | 6-8h | ✓ Sim |
| 3 | Validação rede por rede | 8-12h | ✓ Sim |
| 4 | Casos especiais | 4-6h | Não |
| 5 | Validação final + rollout | 2-3h | — |

**Total estimado:** ~30-40h de trabalho efetivo, dividido em sessões.

---

## FASE 0 — Sanitização do cadastro de lojas (FUNDAÇÃO)

**Problema:** 37% das lojas sem `codigo_unitrac`, 58% sem `nome_unitrac`. Sem esses campos, qualquer matcher (atual ou novo) precisa cair em fallbacks que geram bugs.

**Objetivo:** chegar a <10% de lojas sem identificadores Unitrac.

**Subtarefas:**
- 0.1. Script `auto_preencher_unitrac.ts` — cross-ref Unitrac (dias 18-22) × escalas pra detectar `codigo_unitrac` mais frequente de cada loja
- 0.2. Aplicar updates no Supabase com confirmação (não silencioso)
- 0.3. Auditoria de duplicatas / cadastros suspeitos (gerar lista pra revisão manual)
- 0.4. Re-rodar auditoria — verificar % final

**Critério de sucesso:**
- <10% sem `codigo_unitrac`
- <20% sem `nome_unitrac`
- Lista de exceções documentada (lojas que NÃO foi possível preencher)

**Validação:**
- Rodar `verificar_kpi_22_completo.ts` em todas 17 redes com cadastro novo
- Comparar com baseline (`docs/verificacao-22/RESUMO.md`)
- ZONA_SUL canário não pode regredir

**Reversibilidade:** salvar SQL de UPDATE em `docs/db-changes/` antes de aplicar; rollback script disponível.

**Detalhes:** ver `FASE-0-cadastro.md`.

---

## FASE 1 — Pipeline de alterações robusto

**Problema:** alterações do PDF tabular precisam ser aplicadas ANTES do matching. Hoje o matcher recebe a escala original; quando há alteração, o sistema pode pegar a placa errada.

**Objetivo:** garantir que o conceito "escala efetiva do dia" funcione.

```
escala_efetiva = aplica_alteracoes(escala_original, pdf_alteracoes, texto_alteracoes)
```

**Subtarefas:**
- 1.1. Função `aplicarAlteracoes(escala, alteracoes) → escala_efetiva` — substitui linhas correspondentes (match por rede + loja + carro_ordem)
- 1.2. Testes unitários (vitest) cobrindo casos: substituição completa, troca de motorista só, troca de placa só, alteração não encontrada
- 1.3. Integrar no pipeline do MCP (geração KPI) — entrada do matcher passa a ser `escala_efetiva`
- 1.4. Atualizar `verificar_kpi_22_completo.ts` Check 3 pra checar a alteração na escala efetiva (não no fuzzy match atual)

**Critério de sucesso:**
- Testes vitest novos passando
- Dia 22 PREZUNIC (Caxias Centro + Centenário) e CARREFOUR (Campo Grande) refletindo alterações corretamente
- Check 3 reportando 0 falsos positivos

**Validação:**
- Rodar `verificar_kpi_22_completo PREZUNIC` e `CARREFOUR` — Check 3 deve dar OK

**Reversibilidade:** commit atômico; revert se quebrar.

**Detalhes:** ver `FASE-1-alteracoes.md`.

---

## FASE 2 — Matcher simplificado

**Problema:** matcher atual tem 1200+ linhas com fallback geo, scorePair, parada compartilhada, hybrid match. Esses fallbacks geram falsos positivos (Categoria B do RESUMO).

**Objetivo:** matcher de ~100 linhas com lógica simples:
```
Pra cada linha da escala efetiva:
  placa = linha.placa
  Se placa não está no Unitrac → SEM
  Senão:
    Buscar parada com codigo_loja == loja.codigo_unitrac OU nome_loja ~= loja.nome_unitrac
    Se achou → SC/CHD/SL
    Senão → em branco
```

**Estratégia:**
- **Branch separada** `feat/matcher-v2-simplificado`
- Implementa matcher novo lado a lado com antigo
- Testa nos dias 18-22 que temos baseline
- Compara: regressões aceitas (em branco) vs ganhos (zero falso positivo)
- Decide merge baseado em métricas

**Subtarefas:**
- 2.1. Criar branch
- 2.2. Implementar `matcher-v2.ts` (não substitui o antigo ainda)
- 2.3. Manter testes vitest passando + adicionar testes específicos do v2
- 2.4. Script comparativo: rodar v1 e v2 nos dias 18-22, gerar tabela de diffs
- 2.5. Decisão go/no-go: se ganhos > custos → merge

**Critério de sucesso:**
- Zero falso positivo Categoria B
- ZONA_SUL canário não piora
- Regressões aceitas estão documentadas (lista de "em branco honesto" novos)

**Validação:**
- Rodar verificar_kpi_22_completo nas 17 redes
- Comparar matrix antiga vs nova

**Reversibilidade:** branch separada — se ruim, descarta sem afetar main.

**Detalhes:** ver `FASE-2-matcher.md`.

---

## FASE 3 — Validação rede por rede

**Problema:** cada rede tem padrões próprios (PRINCESA tem múltiplas entregas; ARMAZEM_GRAO tem REGINA sharing; ZONA_SUL tem trocas; etc). Validar uma de cada vez.

**Ordem (do mais simples ao mais complexo):**
1. MUNDIAL (1 loja)
2. CAB_PETROPOLIS (1)
3. ATACADAO (2)
4. SAMS_CLUB (3)
5. VIANENSE (5)
6. EMANUEL (8)
7. SENDAS (10)
8. CARREFOUR (15)
9. ARMAZEM_GRAO (15)
10. GUANABARA (17)
11. SUPERPRIX (18)
12. SUPER_PAX (21)
13. FEIRA_NOVA (21)
14. ASSAI (41)
15. PRINCESA (41)
16. PREZUNIC (48)
17. ZONA_SUL (44)

**Pra cada rede:**
- a. Rodar `verificar_kpi_22_completo.ts <REDE>`
- b. Identificar padrões da rede
- c. Categorizar problemas restantes
- d. Decidir: corrigir agora / aceitar / levar pra Fase 4
- e. **Aprovação do dono** antes de avançar pra próxima

**Critério de sucesso (por rede):**
- 0 problemas resolvíveis automaticamente
- Padrões documentados em `FASE-3-redes.md`

**Detalhes:** ver `FASE-3-redes.md`.

---

## FASE 4 — Casos especiais

Edge cases que não cabem no matcher simples:

| # | Caso | Redes afetadas | Decisão pendente |
|---|------|----------------|------------------|
| 4.1 | Operação em loja-base (motorista passa o dia numa loja sem ir ao CD) | CAB_PETROPOLIS, EMANUEL, FEIRA_NOVA Santo Agostinho, SUPERCOMPRAS | CHD = primeira chegada ou janela específica? |
| 4.2 | Multi-trip (mesma placa visita conjuntos diferentes) | ARMAZEM_GRAO REGINA | KPI mostra trip 1 ou trip 2? |
| 4.3 | 2 turnos manhã+tarde | ZONA_SUL | Qual turno priorizar? |
| 4.4 | Lojas SPID / extra no template | PREZUNIC (7 SPID), CARREFOUR (Espírito Santo) | Filtrar ou aceitar? |
| 4.5 | Grafia inconsistente (1º vs 1ª, AssaÍ vs Assaí) | PRINCESA, ASSAI | Normalização no parser |

**Cada caso requer decisão do dono.** Discutir caso a caso, documentar regra, implementar.

**Detalhes:** ver `FASE-4-casos-especiais.md`.

---

## FASE 5 — Validação final + rollout

**Objetivo:** confirmar que tudo funciona em produção.

**Subtarefas:**
- 5.1. Rodar `verificar_kpi_22_completo.ts` nas 17 redes com sistema completo
- 5.2. Comparar com baseline e gerar tabela de mudanças
- 5.3. Regerar KPIs em produção pra dia 22
- 5.4. Documentar processo de rollout pros dias seguintes
- 5.5. Aprovação final da gestão (Tia Érica)

**Critério de sucesso:**
- Aprovação manual da gestão
- 17 KPIs do dia 22 sem problemas Categoria B
- Documentação completa do sistema novo

**Detalhes:** ver `FASE-5-validacao.md`.

---

## Regras gerais

1. **Sempre pedir aprovação** antes de aplicar correção no banco ou alterar lógica
2. **Sempre commitar atômico** com mensagem clara explicando o que mudou
3. **Sempre rodar testes** (vitest) antes de avançar fase
4. **Sempre atualizar STATUS.md** após cada passo importante
5. **Sempre criar/atualizar MDs** pra sobreviver compactação
6. **ZONA_SUL canário** — verificar dia 19 não regride após cada mudança no matcher

## Próximo passo

Ver `STATUS.md`.
