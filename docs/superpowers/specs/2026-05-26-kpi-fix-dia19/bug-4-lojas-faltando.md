# Bug 4 — Lojas no manual ausentes do gerado

## Causa raiz hipotética

13 lojas estão no manual mas o gerado retorna vazio ou SEM. Sub-causas:

**4A:** Linha escala com `placa_norm=null` ou placa não-encontrada no Unitrac (mesmo com variantes OCR)
**4B:** Multi-row pra mesma loja (1ª + 2ª entrega) — matcher só processa uma
**4C:** Plate-swap T18 não dispara (placa tem GPS mas paradas não batem nome/código)

## Evidência (dia 19)

| Rede | Loja | Manual | Sub-causa |
|------|------|--------|-----------|
| ZS | 07 2ª (KQR-2J11) | 15:00/16:10 | 4B |
| ZS | 11 1ª (DBB-8D19) | 14:35/17:05 | 4B (DBB também faz Loja 31 1ª) |
| ZS | 19 1ª (LCO-0978) | 20:00/21:35 | 4C (placa só tem variante OCR LCO0J78) |
| ZS | 21 2ª NÃO_FOI | NÃO_FOI | linha LQE-5401 não emerge no output |
| ZS | MEGA BOX 2 noite (LNU-7733) | 19:30/20:10 | 4A |
| ZS | MEGA BOX 2 3ª (AKZ-2594) | 19:30/19:40 | 4B |
| ASSAI | Ceasa (EZU-9325) | 05:55/07:30 | 4A |
| ASSAI | Maracanã (GAR-0802) | 06:00/11:20 | 4A |
| GUANABARA | Caxias F.18 (GVH-1397) | 10:45/11:55 | 4C |
| GUANABARA | Santa Cruz F.28 (KTR-6724) | 09:20/10:05 | 4A |
| PREZUNIC | Cidade de Deus (KOP-4978) | 07:00/07:50 | 4B (mesma placa Campinho) |
| PREZUNIC | SPID Barra (LLJ-9C64) | 08:25/08:35 | 4B (LLJ faz várias SPID) |
| ARMAZEM | BOA VISTA (TML-9I75) | 15:30/15:55 | 4B (mesma placa POSSE) |

## Solução proposta

**Para 4A:** Investigar por que placa não tem GPS — pode ser que variante OCR errada, ou placa nunca uploadada.
**Para 4B:** Garantir que matcher emite UMA linha por entrada escala, mesmo quando 1 placa serve N lojas.
**Para 4C:** Estender T18 ou OCR-equate pra casos onde placa GPS bate por proximidade.

Cada sub-causa pode precisar abordagem diferente. Investigar com `diagnose` caso a caso.

## Arquivos a tocar

- `src/lib/kpi/matcher.ts` — assignment quando N linhas pra 1 placa
- `mcp/server.ts` — pode ser que processar_kpi descarte linhas

## Critério de aceite (estrito)

- [ ] 13 lojas emergem no gerado (tempo OU SEM, não vazio)
- [ ] Pelo menos 10/13 com Δ≤10min CHD

## Teste vitest

Caso: 1 placa com 4 paradas LOJA, 4 linhas escala mesma rede → 4 rotas emitidas no output.

## Rollback

`git revert`. Risco baixo pois é adicionar lojas que estão faltando.

## Status

🔍 Aguardando investigação
