# Status — Plano de Correção do Sistema

> **Atualizar a cada passo importante.** Leia `CONTEXTO.md` e `PLANO.md` primeiro.

## Estado global

- **Fase atual:** Fase 0 em andamento (autorização recebida)
- **Modelo de validação final:** MANUAL — dono entra no sistema, gera KPIs, envia pra comparação
- **Última atualização:** sessão atual

## Status por fase

| Fase | Status | Início | Fim | Notas |
|------|--------|--------|-----|-------|
| 0 — Sanitização cadastro | 🚧 Em andamento | 2026-05-24 | - | Autorizado pelo dono |
| 1 — Pipeline alterações | ⏳ Pendente | - | - | Bloqueada por Fase 0 |
| 2 — Matcher v2 | ⏳ Pendente | - | - | - |
| 3 — Validação rede a rede | ⏳ Pendente | - | - | - |
| 4 — Casos especiais | ⏳ Pendente | - | - | - |
| 5 — Validação final | ⏳ Pendente | - | - | Manual pelo dono |

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
