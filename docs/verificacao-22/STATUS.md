# Status — Verificação KPIs Dia 22 (FINAL)

> Análise completa de TODAS as 17 KPIs concluída. Ver `RESUMO.md` para consolidação.

## Status

- **Fase atual:** Fase 4 (consolidação) — CONCLUÍDA
- **KPIs analisadas com análise completa:** 17 / 17 ✓
- **Próximo passo:** correções em lote (ver categorias no RESUMO.md)

## Tabela final

| # | Rede | Análise completa | Problemas |
|---|------|------------------|-----------|
| 1 | MUNDIAL | ✓ FEITA | 0 — PERFEITO |
| 2 | SENDAS | ✓ FEITA | 2 falsos positivos do matcher local após fix `isEstacionamentoNoturno` |
| 3 | VIANENSE | ✓ FEITA | 0 — PERFEITO |
| 4 | SAMS_CLUB | ✓ FEITA | 0 — PERFEITO |
| 5 | CAB_PETROPOLIS | ✓ FEITA | 1 — KPI gerado ANTES do fix `2a491f4`, regerar resolve |
| 6 | PRINCESA | ✓ FEITA | 4 — Iguaba grafia, 3 lojas com CHD adiantado vs GPS |
| 7 | PREZUNIC | ✓ FEITA | ~10 — 2 alterações OK (script falso positivo), 7 lojas SPID extras, 5 timestamps |
| 8 | SUPERCOMPRAS | ✓ FEITA | 1 — motorista RAFAEL SOARES no Santo Agostinho o dia todo |
| 9 | SUPERPRIX | ✓ FEITA | 0 — PERFEITO |
| 10 | CARREFOUR | ✓ FEITA | 2 — Loja Espírito Santo extra, falso positivo no Check 3 |
| 11 | ATACADAO | ✓ FEITA | 0 — PERFEITO |
| 12 | ASSAI | ✓ FEITA | 4 — Cordovil 231 extra, grafia Ilha Governador, 6 CHDs adiantados |
| 13 | SUPER_PAX | ✓ FEITA | 0 — PERFEITO |
| 14 | ARMAZEM_GRAO | ✓ FEITA | 5 — GILSON fez 2 trips (madrugada + tarde), KPI pegou trip 1, matcher pegou trip 2 |
| 15 | ZONA_SUL | ✓ FEITA | 18 — 8 motoristas trocados (não no PDF), 10 timestamps |
| 16 | EMANUEL | ✓ FEITA | 4 — motoristas operam em loja-base + CACHAMORRA com falso positivo (mesma placa SENDAS) |
| 17 | FEIRA_NOVA | ✓ FEITA | 1 — Santo Agostinho (mesmo caso SUPERCOMPRAS) |

## Achados consolidados

Ver `RESUMO.md` com 8 categorias de problemas:
- **Categoria A:** Falso positivo do MEU script (Check 3 fuzzy match)
- **Categoria B:** Falso positivo do MATCHER LOCAL após fix `isEstacionamentoNoturno`
- **Categoria C:** KPI com CHD adiantado vs GPS (8 casos)
- **Categoria D:** Lojas faltantes/extras (grafias + SPID)
- **Categoria E:** Trocas de motorista não no PDF (ZONA_SUL)
- **Categoria F:** Operação em loja-base
- **Categoria G:** Timestamps copiados entre lojas (PREZUNIC Marapendi)
- **Categoria H:** Multi-trip no mesmo dia

## Correções pendentes para aplicar em lote

Ver seção "Ações recomendadas" no `RESUMO.md`.
