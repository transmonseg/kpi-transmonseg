# KPI Perfeição — Estado Atual

> **⚠️ FLUXO ATIVO:** se está retomando sessão, leia primeiro:
> `docs/auditoria/dia-19-reanalise/FLUXO-ATIVO.md`
> Depois volte aqui pra contexto histórico.

> **Para retomar a sessão após compactação:** leia este arquivo PRIMEIRO. Tudo aqui aponta para a verdade.

**Última atualização:** 2026-05-27 (sessão FASE 4 — 7 bugs do dia 19 atacados via subagent-driven)

## Sessão 27/05 — FASE 4 completa

7 bugs identificados na auditoria do dia 19 atacados sequencialmente via subagent-driven development. Cada bug em worktree isolada, com TDD rigoroso (test failing → fix → test passing), code review (quando subagent disponível) e merge atômico na main.

**Commits da sessão:**
- `97420ae` Bug 1: aplicar-alteracoes — match estrito por filial (4 ASSAI)
- `e243f7b` Bug 2B: parser GUANABARA lookbehind regex (ARTHUR)
- `577a61c` Bug 2A: paradaRedeInfer 2-pass code/geo (ZS Loja 07 + SUPERPRIX 201)
- `130ade5` Bug 3: temLojaOrfa usa pós-consolidação (ZS Loja 47 + 2 bônus)
- `5b10eb5` Bug 4 NO-OP: 0/13 eram bugs reais, 2 testes regressão
- `f342b57` Bug 5: agrupar-por-loja resiliente a carro_ordem dup (ZS Loja 31, MEGA BOX 02)
- `2c0ca11` Bug 6: estendeSaidaPorForaBase aceita FORA_BASE + multi-step (4/10)
- `4f6ac48` Bug 7: T18-X2 ambiguidade lookup lojaEscala (4/7)

**Resultados:**
| Dia | ❌ Antes | ❌ Depois | Δ |
|-----|---------|----------|---|
| 19 | 36 | 32 | -4 |
| 20 | 33 | 26 | -7 |
| 21 | 31 | **14** | **-17** |

- 301/301 testes vitest (eram 282 — +19 novos)
- Typecheck zero erros
- ZS dia 21: 100% mantido
- Spec mestre: `docs/superpowers/specs/2026-05-26-kpi-fix-dia19/`
- Plano: `docs/superpowers/plans/2026-05-26-kpi-fix-dia19-plan.md`
- Fluxo ativo: `docs/auditoria/dia-19-reanalise/FLUXO-ATIVO.md`

**Próximo:** user regerar KPIs no Vercel + comparar manual + FASE 5 (rollout).

---

**Última atualização anterior:** 2026-05-26 (sessão dias 19/20/21 — escalas faltantes + 3 fixes matcher)

## Sessão 26/05 — escalas faltantes + 3 fixes matcher

**Causa raiz descoberta:** 13 escalas faltavam no banco. KPIs gerados pelo user no Vercel estavam usando dados parciais. Subi via `scripts/analise/subir_escalas_faltantes.ts`.

**Fixes aplicados em `src/lib/kpi/matcher.ts`:**
1. `estendeSaidaPorForaBase` (linha 328): SL estendida quando LOJA curta (≤15min) seguida de FORA_BASE longo (≥30min, ≤300m, gap ≤10min). Caso PREZUNIC Fonseca: 05:31→09:28.
2. `resolvePlacaUnitrac` valida via geo (linha 870): aceita variante OCR mesmo com paradas só FORA_BASE quando geograficamente dentro do raio. Resolve 6 lojas ZS (LCO0978→LCO0J78 33/36/01, LJS2172→LJS2B72 34, EFU5704→EFU5H04 03/26).
3. T18-X (linha 1438): rejeita plate-swap quando parada candidata resolve loja CADASTRADA diferente da escalada. Resolve falsos positivos como ZS Loja 1129 não-cadastrada (matcher atribuía MEGA BOX OLARIA por token comum).

**Antes/Depois (% aceitável = ✅+⚠️ com BLANK_OK):**
| Dia | Antes | Depois |
|-----|-------|--------|
| 19  | 71%   | 74%    |
| 20  | 75%   | 79%    |
| 21  | 73%   | 75%    |
| ZS 20 | 17❌ → 5❌ |
| ZS 19 | 16❌ → 8❌ |
| ZS 21 | — → 100% (11/11) |

**Para user testar:** REGERAR KPIs no sistema web (Vercel) — o banco agora tem todas escalas + matcher corrigido.

**Pendências (❌ restantes principais):**
- ZS multi-trip assignment: 2 linhas mesma loja (Loja 07/11 dia 19, 20) pegam mesma parada
- ZS lojas não cadastradas com coord ok: Loja 14, 31 falsos positivos (parecido com 1129 — cadastro precisa atualizar)
- ZS Loja 03 Copacabana sem lat/lng — Loja 26 com coord 6km off (cadastro incompleto)
- ARMAZEM dia 21: GPS classifica paradas como cross-rede (PREZUNIC MARICÁ), matcher rejeita
- PRINCESA/PREZUNIC: muitos ⚠️ Δ≤3min são arredondamento manual (Tia Érica em múltiplos de 5min) — não-bug

---

**Última atualização anterior:** 2026-05-25 (sessão noturna ZS sweep)
**Spec mestre:** `docs/superpowers/specs/2026-05-24-kpi-perfeicao-rede-por-rede-design.md`
**Spec ZS:** `docs/superpowers/specs/2026-05-25-conserto-zona-sul.md`

## Sessão noturna 25/05 — resumo do que foi feito

**ARMAZEM (resolvido para dias 19, 20):**
- T18 plate-swap não ativa quando placa circulou
- T18-D guard de distância (≤5km da loja)
- Geo fallback atribui parada à linha pelo melhor matchScore
- T20: descarta paradas LOJA spurious (geofence Unitrac sobreposto >10km)
- Cadastro REGINA: triangulação GPS dia 20 (não Nominatim) — 4 lojas corretas
- Cadastro 16 DE MARÇO: GPS real (drift 3.8km vs Nominatim)
- Dia 19: 12/14 batem (1-3min off)
- Dia 20: 14/14 batem (1-2min off) ✓

**ZONA SUL (parcial):**
- lerKpi detecta layout dinamicamente (ZS sem coluna COD)
- T18 ativa pra placas ausentes do Unitrac (caso plate-swap real)
- T18-N removido (ZS faz entregas legítimas de madrugada)
- OCR-equate inteligente (só aceita se variante bate loja escalada)
- Loja 47 ZS coord corrigida (drift 19km)
- Sweep ZS dia 18: 17/34 (50%), dia 19: 13/37 (35%), dia 20: 20/36 (56%), dia 21: 3/10 (30%)
- 39 SEM_MATCH restantes — padrões: placas ausentes Unitrac (LJS2172, LCO0978), placa-manual ≠ placa-escala (Tia Érica troca), múltiplas lojas/placa, cross-day

**Pendências ZS:**
- Vídeo v43-2 documenta: caminhões 17h saem dia seguinte → matcher precisa usar data_entrega
- Múltiplas lojas/placa: BBH1C94 fez Loja 33+03+19, sistema só pega Loja 33 (parada LOJA)
- Lojas 02, 16, 24, 37, 39, 41 não aparecem em manual → provavelmente inativas
- Conflitos manual vs GPS (NÃO_FOI manual + GPS confirma FOI) precisam ser confirmados com Tia Érica

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
