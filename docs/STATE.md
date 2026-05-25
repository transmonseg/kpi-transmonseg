# KPI Perfeição — Estado Atual

> **Para retomar a sessão após compactação:** leia este arquivo PRIMEIRO. Tudo aqui aponta para a verdade.

**Última atualização:** 2026-05-25
**Spec mestre:** `docs/superpowers/specs/2026-05-24-kpi-perfeicao-rede-por-rede-design.md`
**V2.1 plano:** `docs/correcao-sistema/PLANO-CADASTRO-E-V21.md`
**V2.1 validação:** `docs/correcao-sistema/validacao-pos-v21.md`
**Status global:** V2.1 rollout. Cadastro 295→330 ativas. Bugs 1-4 fixados. Reforços 5-7 aplicados. 282 testes vitest. Dia18: 108/127=85%, Dia19: 152/218=70% (excl. ZONA_SUL). GUANABARA 37/37, PRINCESA dia19 26/26, SENDAS 8/9.

---

## Estado atual por rede (dias 18 e 19)

| Rede | dia18 OK | dia19 OK | Obs |
|------|---------|---------|-----|
| ZONA_SUL | 24/70 | 19/55 | iter2 concluído, restante estrutural |
| PREZUNIC | 5/40 | 30/58 | 2 turnos estrutural em dia18 |
| ASSAI | 35/40 | 16/40 | SC-skip+SEM — restante estrutural |
| FEIRA_NOVA | 11/12 | 2/13 | dia18 quase perfeito, dia19 estrutural |
| SUPER_PAX | 12/12 | 7/13 | dia18 perfeito, dia19 2 turnos |
| SENDAS | 9/10 | 8/9 | SEM_OK(dia18)+BLANK_OK(dia19) |
| ARMAZEM_GRAO | 8/14 | 7/14 | REGINA 4 linhas/1 parada estrutural |
| VIANENSE | 4/4 | 2/4 | dia18 perfeito, dia19 offset 16min |
| SAMS_CLUB | 3/3 | 3/3 | perfeito |
| CARREFOUR | 8/10 | 4/8 | restante structural |
| SUPERPRIX | 8/9 | 0/9 | dia18 quase perfeito, dia19 GPS±timing |
| PRINCESA | 3/26 | 26/26 | dia18 estrutural, dia19 perfeito |
| GUANABARA | N/A | 37/37 | BLANK_OK: '---' manual = OK |
| ATACADAO | 2/2 | 1/2 | SC_SKIP dia18, dia19 FB-as-LOJA |
| MUNDIAL | 1/1 | 1/1 | perfeito (SEM/SEM/SEM) |
| CAB_PETROPOLIS | 0/1 | — | estrutural |
| SUPERCOMPRAS | 0/1 | — | estrutural |

---

## Redes com potencial residual

| Rede | Padrão | Ganho estimado | Complexidade |
|------|--------|----------------|--------------|
| PRINCESA dia18 | 3/26. CHD/SL diferem 10-40 min (GPS exato vs manual arredondado) | 0 | estrutural |
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
| PRINCESA | SEM_OK + BLANK_OK + SC_SKIP → dia18: +2, dia19: +2 | +4 | 522c1ef, 35cae2e |
| SENDAS | BLANK_OK dia19 (+5), SEM_OK dia18 (+2) | +7 | 65081d4, ac77e19 |
| ATACADAO | SC_SKIP → Belford Roxo CHD/SL batem | +1 | ba2dff7 |

---

## Snapshots gerados

| Timestamp | Descrição | Arquivo |
|-----------|-----------|---------|
| 2026-05-24T07:29Z | Baseline pré-rede-1 (17 redes, 218 OK / 526 total) | `docs/snapshots/2026-05-24-baseline.json` |
| 2026-05-24 | ZONA_SUL iter2-post (114/229=50%) | `docs/snapshots/2026-05-24-zona_sul-iter2-post.json` |
| 2026-05-24 | FEIRA_NOVA iter1-post | `docs/snapshots/2026-05-24-feiranoa-iter1-post.json` |
