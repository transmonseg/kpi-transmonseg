# Bug 7 — Falso positivo (sys diz FOI, manual diz NÃO_FOI / SEM)

## Causa raiz hipotética

Sys atribui parada quando manual marca NÃO_FOI ou SEM. Sub-casos:

**7A: GPS comprova FOI, manual errado** → sys está CERTO. Aceitar conforme decisão do user (GPS+raio+cadastro = autoridade).
**7B: GPS NÃO comprova mas matcher inventa** → bug do matcher (geo fallback agressivo, plate-swap ruim).
**7C: Convenção** — operador passou perto mas não entregou.

## Evidência (dia 19)

| Rede | Loja | Manual | Gerado | Sub-caso esperado |
|------|------|--------|--------|------------------|
| ZS | 14 Leblon | NÃO_FOI | 15:53/16:41 (UBO-5E05) | 7A (GPS confirma 18m da loja) |
| ZS | 32 Laranjeiras | SEM | 04:54/05:31 (QAH-2H50) | investigar |
| ASSAI | Barra I | NÃO_FOI | 06:08/06:36 (UBO-5E01) | investigar |
| ASSAI | Bangu II | NÃO_FOI | 09:33/09:37 (AMW-3424) | 7B (cascata do bug 1) |
| PREZUNIC | Botafogo Serra Azul | SEM | 10:42/10:59 (KWB-6998) | investigar |
| PREZUNIC | Jauru | SEM | 14:37/14:45 (LUP-1F13) | investigar |
| PREZUNIC | Taquara | SEM | 14:50/14:53 (LUP-1F13) | investigar |

## Solução proposta

Pra cada caso, classificar (7A/7B/7C) com `diagnose`:
- **7A:** aceitar sys, marcar caso como "manual errado" em log de auditoria
- **7B:** corrigir matcher (estreitar critério de match)
- **7C:** convenção, aceitar discrepância

## Arquivos a tocar

Depende do diagnóstico. Pode ser:
- `src/lib/kpi/matcher.ts` (filtros de geo fallback / T18)
- Apenas docs (caso 7A)

## Critério de aceite

- [ ] Cada um dos 7 casos classificado e ação tomada
- [ ] Casos 7A documentados em `docs/auditoria/manual-discrepancias-dia19.md`
- [ ] Casos 7B reduzidos a 0
- [ ] Casos 7C documentados como ressalva

## Teste vitest

Pra cada caso 7B identificado, criar teste que confirma sys retorna SEM agora.

## Rollback

`git revert`. Risco: pode remover entregas legítimas.

## Status

🔍 Aguardando investigação
