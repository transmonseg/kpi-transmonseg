# KPI Perfeição — Estado Atual

> **Para retomar a sessão após compactação:** leia este arquivo PRIMEIRO. Tudo aqui aponta para a verdade.

**Última atualização:** 2026-05-24
**Spec mestre:** `docs/superpowers/specs/2026-05-24-kpi-perfeicao-rede-por-rede-design.md`
**Plano ativo:** `docs/superpowers/plans/2026-05-24-rede-ZONA_SUL.md`
**Status global:** ZONA_SUL iter 2 concluído → próxima: iter 3 ou encerrar ZONA_SUL e ir para PREZUNIC

---

## Onde estamos AGORA

- **Rede atual:** ZONA_SUL — iter 2 concluído
- **Iteração atual:** iter 3 (ou encerrar)
- **Última iteração concluída:** iter 2 — noData NAO_FOI fix (+6 ZONA_SUL, +14 geral)
- **Último commit relevante:** ver `git log --oneline -5`

### ZONA_SUL após iter 2

| Dia | OK | DIFF | Total | % |
|-----|----|----|-------|---|
| 2026-05-18 | 24 | 46 | 70 | 34% |
| 2026-05-19 | 19 | 36 | 55 | 35% |
| 2026-05-20 | 36 | 16 | 52 | 69% |
| 2026-05-21 | 35 | 17 | 52 | 67% |
| **TOTAL** | **114** | **115** | **229** | **50%** |

### Análise dos 115 DIFFs restantes ZONA_SUL

| Padrão | Total | Corrigível? |
|--------|-------|-------------|
| P4: GPS:SIM + match=none | 36 | Maioria cross-rede (não corrigível) |
| P6: SC próximo, CHD/SL errado | 31 | Complexo, risco alto |
| P3: Falso positivo (matcher tem horário + SEM/NAO_FOI manual) | 14 | Não corrigível por código |
| P5: SC >3h diferente (viagem errada) | 14 | Não corrigível facilmente |
| P1: GPS:NAO + match=none + manual tem dados | 13 | Não corrigível |
| P9a: GPS:SIM + MATCHER tem horário + MANUAL=--- | 5 | Irrelevante (sem referência) |

**Conclusão iter 3:** Os 115 DIFFs restantes são em sua maioria estruturais (cross-rede vehicles, GPS sem BASE, múltiplos escala lines por loja/slot, GPS codes imprecisos). Há pouco ganho marginal sem risco de regressão. **Recomendar encerrar ZONA_SUL e iniciar PREZUNIC** (98 total, 13% OK — maior potencial).

### Snapshot iter2 por rede (pós-fix NAO_FOI)

| Rede | OK | DIFF | Total | % | vs baseline |
|------|----|----|-------|---|------------|
| ZONA_SUL (4 dias) | 114 | 115 | 229 | 50% | +43 vs baseline iter1-pre |
| ASSAI | 35 | 45 | 80 | 44% | +3 dia18 |
| PRINCESA | 25 | 27 | 52 | 48% | - |
| GUANABARA | 19 | 18 | 37 | 51% | - |
| PREZUNIC | 13 | 85 | 98 | 13% | - |
| ARMAZEM_GRAO | 13 | 15 | 28 | 46% | +1 |
| SENDAS | 10 | 9 | 19 | 53% | +1 |
| SUPERPRIX | 8 | 10 | 18 | 44% | - |
| CARREFOUR | 8 | 10 | 18 | 44% | - |
| SUPER_PAX | 7 | 18 | 25 | 28% | - |
| SAMS_CLUB | 4 | 2 | 6 | 67% | +1 |
| FEIRA_NOVA | 2 | 23 | 25 | 8% | - |
| ATACADAO | 2 | 2 | 4 | 50% | - |
| MUNDIAL | 2 | 0 | 2 | 100% | - |
| VIANENSE | 4 | 4 | 8 | 50% | +2 |
| CAB_PETROPOLIS | 0 | 1 | 1 | 0% | - |
| SUPERCOMPRAS | 0 | 1 | 1 | 0% | - |

## Próximo passo concreto

1. **Encerrar ZONA_SUL**: escrever report `docs/kpi-fixes/2026-05-24-rede-ZONA_SUL-report.md`
2. **Iniciar PREZUNIC**: 98 total, 13% OK (85 DIFFs em dia18 + 50 em dia19 = 135 DIFFs)

---

## Como retomar (passo a passo)

Se você é um Claude novo (sessão compactada) lendo isto:

1. **Leia o spec:** `docs/superpowers/specs/2026-05-24-kpi-perfeicao-rede-por-rede-design.md`
2. **Veja commits recentes:** `git log --oneline -15`
3. **Último snapshot:** `docs/snapshots/2026-05-24-zona_sul-iter2-post.json`
4. **Continue do "Próximo passo concreto" acima**

---

## Invariantes (NUNCA quebrar)

- 263+ testes vitest passando.
- TypeScript zero erros (`npx tsc --noEmit`).
- ZONA_SUL nunca regride (canário do projeto).
- Cada fix vira commit atômico.
- Cada UPDATE no Supabase tem log em `docs/db-changes/` + script de rollback em `scripts/db-changes/`.

---

## Histórico de redes processadas

| Rede | Iterações | Antes | Depois | Commit final | Report |
|------|-----------|-------|--------|--------------|--------|
| ZONA_SUL | 2 | 105/229=46% | 114/229=50% | (ver git log) | pendente |

---

## Snapshots gerados

| Timestamp | Descrição | Arquivo |
|-----------|-----------|---------|
| 2026-05-24T07:29Z | Baseline pré-rede-1 (17 redes, 218 OK / 526 total) | `docs/snapshots/2026-05-24-baseline.json` |
| 2026-05-24 | ZONA_SUL iter1-pre (105/229=46%) | `docs/snapshots/2026-05-24-zona_sul-iter1-pre.json` |
| 2026-05-24 | ZONA_SUL iter1-post (108/229=47%, +3 dia18) | `docs/snapshots/2026-05-24-zona_sul-iter1-post.json` |
| 2026-05-24 | ZONA_SUL iter2-post (114/229=50%, +14 geral) | `docs/snapshots/2026-05-24-zona_sul-iter2-post.json` |
