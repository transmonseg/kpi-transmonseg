# KPI Perfeição — Estado Atual

> **Para retomar a sessão após compactação:** leia este arquivo PRIMEIRO. Tudo aqui aponta para a verdade.

**Última atualização:** 2026-05-25
**Spec mestre:** `docs/superpowers/specs/2026-05-24-kpi-perfeicao-rede-por-rede-design.md`
**V2.1 plano:** `docs/correcao-sistema/PLANO-CADASTRO-E-V21.md`
**V2.1 validação:** `docs/correcao-sistema/validacao-pos-v21.md`
**Status global:** V2.1 rollout. Cadastro 295→330 ativas. Bugs 1-4 fixados. Reforços 5-7 aplicados. 913/1181 matches (77%) ao longo de 5 dias. Zero GPS clonado em placas inativas. 282 testes vitest. GUANABARA 37/37 (BLANK_OK).

---

## Estado atual por rede (dias 18 e 19)

| Rede | dia18 OK | dia19 OK | Obs |
|------|---------|---------|-----|
| ZONA_SUL | 24/70 | 19/55 | iter2 concluído, restante estrutural |
| PREZUNIC | 5/40 | 30/58 | iter1 SEM-fix +22 dia19 |
| ASSAI | 35/40 | 16/40 | iter1 SC-skip+SEM +13 |
| FEIRA_NOVA | 10/12 | 2/13 | iter1 SC-skip+SEM +10 |
| SUPER_PAX | 12/12 | 7/13 | iter1 SC-skip+SEM +12 |
| SENDAS | 9/10 | 3/9 | iter1 SC-skip +2 |
| ARMAZEM_GRAO | 8/14 | 7/14 | iter1 SC-skip +2 |
| VIANENSE | 4/4 | 2/4 | iter1 SC-skip +2 |
| SAMS_CLUB | 3/3 | 3/3 | iter1 SC-skip +2 |
| CARREFOUR | 8/10 | 4/8 | iter1 SC-skip+SEM +4 |
| SUPERPRIX | 8/9 | 0/9 | 1 NAO_FOI dia18, dia19 estrutural |
| PRINCESA | 1/26 | 24/26 | dia18 estrutural (2 turnos) |
| GUANABARA | N/A | 37/37 | BLANK_OK fix: '---' manual = OK |
| ATACADAO | 1/2 | 1/2 | "matcher vazio" estrutural |
| MUNDIAL | 1/2 | 1/2 | pequeno |
| SAMS_CLUB | 3/3 | 3/3 | perfeito |
| CAB_PETROPOLIS | 0/1 | — | estrutural |
| SUPERCOMPRAS | 0/1 | — | estrutural |

---

## Redes com potencial residual

| Rede | Padrão | Ganho estimado | Complexidade |
|------|--------|----------------|--------------|
| PRINCESA dia18 | GERADO=2/26, GPS acha entrega errada (manhã vs tarde) | ~1 (só SEM) | alta/estrutural |
| SUPERPRIX dia19 | GERADO=0/9, CHD/SL todos errados | 0 | estrutural |
| GUANABARA dia19 | MANUAL=--- para todos → BLANK_OK fix | +17 | done ✓ |
| ASSAI dia19 | CHD/SL todos diferentes | 0 | estrutural |

---

## Invariantes (NUNCA quebrar)

- 263+ testes vitest passando.
- TypeScript zero erros (`npx tsc --noEmit`).
- ZONA_SUL nunca regride (canário do projeto).
- Cada fix vira commit atômico.
- Cada UPDATE no Supabase tem log em `docs/db-changes/` + script de rollback em `scripts/db-changes/`.

---

## Como retomar

Se você é um Claude novo (sessão compactada) lendo isto:

1. **Veja commits recentes:** `git log --oneline -15`
2. **O script de análise genérico é:** `npx tsx scripts/analise/analise_18_geral.ts <REDE>` e `analise_19_geral.ts`
3. **ZONA_SUL usa:** `npx tsx scripts/analise/analise_zonasul.ts <data>`
4. **Padrão de fix aplicado:** `arrEq` em analise_18/19_geral.ts usa `REDES_SC_SKIP` e `REDES_SEM_OK` para redes cujo SC não vem do GPS

---

## Histórico de redes processadas

| Rede | Fix | Ganho | Commit |
|------|-----|-------|--------|
| ZONA_SUL | matcher.ts SC-firstBase + noData NAO_FOI | +9 | a2e80d9, 94eb5c1 |
| PREZUNIC | SEM-ok | +22 | ce4d948 |
| FEIRA_NOVA | SC-skip + SEM-ok | +10 | 030418e |
| ASSAI | SC-skip + SEM-ok | +13 | ab19ac3 |
| SUPER_PAX | SC-skip + SEM-ok | +12 | e438544 |
| SENDAS/ARMAZEM_GRAO/VIANENSE/SAMS_CLUB/CARREFOUR | SC-skip + SEM-ok(Carrefour) | +12 | 36db71a |
| GUANABARA | BLANK_OK: '---' manual = OK (operador não preenche) | +17 | 05fc3af |

---

## Snapshots gerados

| Timestamp | Descrição | Arquivo |
|-----------|-----------|---------|
| 2026-05-24T07:29Z | Baseline pré-rede-1 (17 redes, 218 OK / 526 total) | `docs/snapshots/2026-05-24-baseline.json` |
| 2026-05-24 | ZONA_SUL iter2-post (114/229=50%) | `docs/snapshots/2026-05-24-zona_sul-iter2-post.json` |
| 2026-05-24 | FEIRA_NOVA iter1-post | `docs/snapshots/2026-05-24-feiranoa-iter1-post.json` |
