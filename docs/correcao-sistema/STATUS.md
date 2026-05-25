# Status — Plano de Correção do Sistema

> **Atualizar a cada passo importante.** Leia `CONTEXTO.md` e `PLANO.md` primeiro.

## Estado global

- **Fase atual:** Fase 0 em andamento (autorização recebida)
- **Modelo de validação final:** MANUAL — dono entra no sistema, gera KPIs, envia pra comparação
- **Última atualização:** sessão atual

## Status por fase

| Fase | Status | Início | Fim | Notas |
|------|--------|--------|-----|-------|
| 0 — Sanitização cadastro | ✓ Concluída | 2026-05-24 | 2026-05-24 | 52 duplicatas mescladas + auto-preencher aplicado + aliases salvos. 347→295 ativas. |
| 1 — Pipeline alterações | 🚧 Próxima | - | - | - |
| 2 — Matcher v2 | ⏳ Pendente | - | - | - |
| 3 — Validação rede a rede | ⏳ Pendente | - | - | - |
| 4 — Casos especiais | ⏳ Pendente | - | - | - |
| 5 — Validação final | ⏳ Pendente | - | - | Manual pelo dono |

## Resultado Fase 0

**Aplicado no banco:**
- ✓ 18 UPDATEs `nome_unitrac` (1ª rodada, pré-merge)
- ✓ 52 duplicatas mescladas (ID com mais dados mantido, outro desativado)
- ✓ 5 UPDATEs adicionais pós-merge (codigo/nome_unitrac)
- ✓ 52 aliases salvos em `docs/db-changes/loja-aliases.json`

**Estado FINAL Fase 0:**
- Total lojas ATIVAS: 295 (era 347 — 52 desativadas como duplicata)
- Sem codigo_unitrac: 79 (27%) — caiu de 37%
- Sem nome_unitrac: 125 (42%) — caiu de 58%

**Validação com dia 22 — sem regressão:**

| Rede | Baseline | Pós-Fase 0 |
|------|---------|------------|
| MUNDIAL/VIANENSE/SAMS_CLUB/SUPER_PAX/ATACADAO | 0 | 0 ✓ |
| SENDAS/CAB/EMANUEL/FEIRA_NOVA/ARMAZEM/ZONA_SUL | 1-2 | igual ✓ |
| PREZUNIC/CARREFOUR | 4/2 | 4/2 ✓ |
| PRINCESA/ASSAI/SUPERPRIX | 4/4/0 | 5/5/1 (matcher melhorou, KPI antigo precisa regerar) |

Sem regressão real. Novas divergências são casos onde matcher local agora identifica match correto, mas KPI gerado antigo ainda mostra SEM.

**Próximo passo:** Fase 1 (parser de alterações), depois Fase 2 (matcher v2).

## Baseline (antes de qualquer correção)

**Dia 22/05/2026 — 17 KPIs verificadas:**

| Status | Quantidade | Redes |
|--------|-----------|-------|
| ✓ PERFEITO | 7 | MUNDIAL, VIANENSE, SAMS_CLUB, SUPERPRIX, ATACADAO, SUPER_PAX, SENDAS |
| ⚠ Problemas | 10 | CAB_PETROPOLIS, PRINCESA, PREZUNIC, SUPERCOMPRAS, CARREFOUR, ASSAI, ARMAZEM_GRAO, ZONA_SUL, EMANUEL, FEIRA_NOVA |

**Total de problemas categorizados:** 62 issues (ver `docs/verificacao-22/RESUMO.md`)

**Cadastro de lojas (auditoria inicial):**
- 347 lojas ativas
- 37% sem `codigo_unitrac` (129 lojas)
- 58% sem `nome_unitrac` (200 lojas)
- 2% sem lat/lng (8 lojas)

## Métricas que devem MELHORAR

| Métrica | Baseline | Meta após plano |
|---------|----------|-----------------|
| KPIs perfeitas dia 22 | 7/17 | 14+/17 |
| Lojas sem `codigo_unitrac` | 37% | <10% |
| Lojas sem `nome_unitrac` | 58% | <20% |
| Falsos positivos Categoria B | 5+ casos | 0 |
| ZONA_SUL dia 19 OK count | 19/55 | ≥19 (não pode regredir) |

## Ações tomadas (histórico)

| Data | Ação | Commit |
|------|------|--------|
| 2026-05-24 | Verificação completa dia 22 — 17 KPIs analisadas | `cf1bef0` |
| 2026-05-24 | Fix `isEstacionamentoNoturno` aplicado (CAB Petrópolis) | `2a491f4` |
| 2026-05-24 | Parser PDF tabular alterações | `aad2697` |
| 2026-05-24 | **Plano criado** — aguardando aprovação | (próximo commit) |
