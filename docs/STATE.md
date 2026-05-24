# KPI Perfeição — Estado Atual

> **Para retomar a sessão após compactação:** leia este arquivo PRIMEIRO. Tudo aqui aponta para a verdade.

**Última atualização:** 2026-05-24
**Spec mestre:** `docs/superpowers/specs/2026-05-24-kpi-perfeicao-rede-por-rede-design.md`
**Plano ativo:** `docs/superpowers/plans/2026-05-24-pre-flight-infrastructure.md` (concluído)
**Status global:** Pre-flight concluído → próxima: criar plano ZONA_SUL

---

## Onde estamos AGORA

- **Rede atual:** Pre-flight concluído → próxima rede: **ZONA_SUL**
- **Iteração atual:** —
- **Última iteração concluída:** Pre-flight infra (snapshot+regression-check+inventory)
- **Último commit relevante:** ver `git log --oneline -5`
- **Baseline snapshot:** `docs/snapshots/2026-05-24-baseline.json` (17 redes, 526 total, 218 OK = 41%)

### Baseline por rede (do snapshot)

| Rede | OK | DIFF | Total | % |
|------|----|----|-------|---|
| ZONA_SUL | 71 | 33 | 104 | 68% |
| ASSAI | 35 | 45 | 80 | 44% |
| PRINCESA | 25 | 27 | 52 | 48% |
| GUANABARA | 19 | 18 | 37 | 51% |
| PREZUNIC | 13 | 85 | 98 | 13% |
| ARMAZEM_GRAO | 12 | 16 | 28 | 43% |
| SENDAS | 9 | 10 | 19 | 47% |
| SUPERPRIX | 8 | 10 | 18 | 44% |
| CARREFOUR | 8 | 10 | 18 | 44% |
| SUPER_PAX | 7 | 18 | 25 | 28% |
| SAMS_CLUB | 3 | 3 | 6 | 50% |
| FEIRA_NOVA | 2 | 23 | 25 | 8% |
| ATACADAO | 2 | 2 | 4 | 50% |
| MUNDIAL | 2 | 0 | 2 | 100% |
| VIANENSE | 2 | 6 | 8 | 25% |
| CAB_PETROPOLIS | 0 | 1 | 1 | 0% |
| SUPERCOMPRAS | 0 | 1 | 1 | 0% |

## Próximo passo concreto

1. Invocar `writing-plans` para criar `docs/superpowers/plans/2026-05-24-rede-ZONA_SUL.md`.
2. Executar plano ZONA_SUL (5 iterações max).
3. Após concluir ZONA_SUL: PREZUNIC (próxima por volume).

---

## Como retomar (passo a passo)

Se você é um Claude novo (sessão compactada) lendo isto:

1. **Leia o spec:** `docs/superpowers/specs/2026-05-24-kpi-perfeicao-rede-por-rede-design.md` — a fonte de verdade do que estamos fazendo.
2. **Veja commits recentes:** `git log --oneline -15`
3. **Veja tasks ativas:** use a tool `TaskList`
4. **Veja último snapshot:** `ls -lt docs/snapshots/ | head -3` se a pasta existir
5. **Valide baseline:** `npx vitest run` deve passar todos os testes
6. **Continue do "Próximo passo concreto" acima**

---

## Invariantes (NUNCA quebrar)

- 263+ testes vitest passando.
- TypeScript zero erros (`npx tsc --noEmit`).
- ZONA_SUL nunca regride (canário do projeto).
- Cada fix vira commit atômico.
- Cada UPDATE no Supabase tem log em `docs/db-changes/` + script de rollback em `scripts/db-changes/`.

---

## Histórico de redes processadas

(Será preenchido conforme cada rede for finalizada)

| Rede | Iterações | Antes | Depois | Commit final | Report |
|------|-----------|-------|--------|--------------|--------|

---

## Snapshots gerados

| Timestamp | Descrição | Arquivo |
|-----------|-----------|---------|
| 2026-05-24T07:29Z | Baseline pré-rede-1 (17 redes, 218 OK / 526 total) | `docs/snapshots/2026-05-24-baseline.json` |

---

## Atualizações deste arquivo

Atualize SEMPRE que:
- Iniciar uma nova rede
- Concluir uma iteração
- Aplicar um fix significativo
- Gerar snapshot
- Encontrar bloqueador
