# Status — Verificação KPIs Dia 22

> Atualizar este arquivo após cada análise. Leia CONTEXTO.md primeiro.

## Resumo

- **Fase atual:** Fase 1 — Implementando 7 checks no script
- **KPIs analisadas (rápido):** 6 / 17 (MUNDIAL, SENDAS, VIANENSE, SAMS_CLUB, CAB_PETROPOLIS, PRINCESA)
- **KPIs com análise COMPLETA (7 checks):** 0 / 17
- **Próxima rede:** após Fase 1 → refazer MUNDIAL com análise completa

## Status por rede

| # | Rede | Análise rápida | Análise completa | Problemas |
|---|------|----------------|------------------|-----------|
| 1 | MUNDIAL | ✓ Feita | ⏳ Pendente | Placa sem GPS (correto — SEM rastreador) |
| 2 | SENDAS | ✓ Feita | ⏳ Pendente | 5 issues investigados como aceitáveis (motoristas não foram, ou em outras redes) |
| 3 | VIANENSE | ✓ Feita | ⏳ Pendente | 2 lojas em branco corretas (Recreio/Freguesia — motorista TML-6D96 foi pra Prezunic Tijuca) |
| 4 | SAMS_CLUB | ✓ Feita | ⏳ Pendente | 1 loja em branco correta (Barra Ayrton Senna — placa foi pra Carrefour Alcantara) |
| 5 | CAB_PETROPOLIS | ✓ Feita | ⏳ Pendente | **FIX APLICADO** (commit 2a491f4): matcher agora retorna 00:00/13:14 ao invés de 14:49/23:57. KPI gerado original ainda tem valor antigo. Quando regerar virá correto. |
| 6 | PRINCESA | ✓ Feita | ⏳ Pendente | **4 problemas**: Pechincha CHD=03:50 vs GPS 04:31, Iguaba 1ª ausente do KPI, Maricá 1 2ª CHD=04:52 vs 05:16, Cabo Frio 1 1ª CHD=04:39 vs 05:22. Padrão: KPIs gerados têm CHD adiantado ~30-40min vs GPS. |
| 7 | PREZUNIC | ⏳ Pendente | ⏳ Pendente | — |
| 8 | SUPERCOMPRAS | ⏳ Pendente | ⏳ Pendente | — |
| 9 | SUPERPRIX | ⏳ Pendente | ⏳ Pendente | — |
| 10 | CARREFOUR | ⏳ Pendente | ⏳ Pendente | — |
| 11 | ATACADAO | ⏳ Pendente | ⏳ Pendente | — |
| 12 | ASSAI | ⏳ Pendente | ⏳ Pendente | — |
| 13 | SUPER_PAX | ⏳ Pendente | ⏳ Pendente | — |
| 14 | ARMAZEM_GRAO | ⏳ Pendente | ⏳ Pendente | — |
| 15 | ZONA_SUL | ⏳ Pendente | ⏳ Pendente | — |
| 16 | EMANUEL | ⏳ Pendente | ⏳ Pendente | — |
| 17 | FEIRA_NOVA | ⏳ Pendente | ⏳ Pendente | — |

## Achados consolidados (preencher na Fase 4)

(vazio até Fase 4)

## Correções pendentes para aplicar em lote (depois)

1. **PRINCESA** — investigar CHD adiantado em Pechincha/Maricá 1/Cabo Frio 1 (3 casos). Possível regressão se o KPI gerado original veio de outra fonte (planilha mestre integrada).
2. **PRINCESA** — Iguaba 1ª Entrega: linha ausente no KPI. Sistema só achou match geo=0.8 e descartou? Investigar.
