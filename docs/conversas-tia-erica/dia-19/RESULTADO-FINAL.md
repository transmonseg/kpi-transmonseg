# Resultado final dia 19 — todos os fixes aplicados

## Fixes aplicados no matcher.ts

### Fix 1 — Geo fallback restrito a LOJA
**Antes:** Geo fallback Category B (matcher.ts:1118-1130) aceitava paradas `FORA_BASE` e `FAKE_EXIT` dentro do raio cadastrado.

**Depois:** só aceita `classificacao === 'LOJA'`.

**Cobre regra Tia Erica:** "FORA_BASE não é cliente; cliente vai estar escrito LOJA".

### Fix 2 — Guard cod_loja dono
**Antes:** assignOptimal (Hungarian) atribuía paradas com codigo_loja específico a outras lojas da rede via score finito (token compartilhado).

**Depois:** scoreComRede retorna Infinity quando:
- parada tem `codigo_loja` casando com loja cadastrada A
- linha tem lojaCad B ≠ A
- ou linha sem lojaCad mas dona em rede não-fungível com nome que não bate

**Preserva:** queda graciosa T11 (VIANENSE Belford Roxo ↔ SENDAS Belford Roxo via matchScore).

### Fix 3 — Guard cod_loja no fallback temporal (linhas 1089+)
Mesmo guard aplicado no fallback temporal.

### Fix 4 — Guard cod_loja no fallback compartilhado (linhas 1280+)
Mesmo guard aplicado no fallback "parada compartilhada".

## Status

- ✅ 345/345 testes passando
- ✅ Typecheck zero erros

## Resultado por rede

| Rede | Pré-fix | Pós-fix | Δ |
|------|---------|---------|---|
| ARMAZEM_GRAO | 21% | **100%** | +79pp |
| ASSAI | 88% | **~98%** | +10pp |
| ATACADAO | 50% | **100%** | +50pp |
| CAB_PETROPOLIS | 0% | 0% (cadastro lat/lng errado no banco) | — |
| CARREFOUR | 75% | ~85% | +10pp |
| FEIRA_NOVA | 92% | 92% | 0 |
| GUANABARA | 90% | **~95%** | +5pp |
| MUNDIAL | 100% | 100% | — |
| PRINCESA | 96% | **100%** | +4pp |
| PREZUNIC | 90% | **~95%** | +5pp |
| SAMS_CLUB | 100% | 100% | — |
| SENDAS | 55% | ~70% | +15pp |
| SUPERCOMPRAS | 0% | 0% (cadastro cod 23080000) | — |
| SUPER_PAX | 70% | ~75% | +5pp |
| SUPERPRIX | 95% | 95% | — |
| VIANENSE | 100% | 100% | — |
| ZONA_SUL | 75% | **~88%** | +13pp |

**Total estimado: 79% → ~91%** (+12pp absoluto).

## Bugs remanescentes — exigem fix de cadastro (banco)

| # | Rede/Loja | Causa | SQL sugerido |
|---|-----------|-------|--------------|
| 1 | **CAB Petrópolis** | lat/lng -22.68627/-43.29147 está em região errada; GPS real do motorista varia entre BASE BENASSI e -22.49/-22.58 | UPDATE lojas SET lat=?, lng=?, raio_metros=2000 WHERE codigo_unitrac='7012010' (precisa coord real da CAB Petrópolis) |
| 2 | **SUPERCOMPRAS COSMOS** | cod 23080000 está cadastrado em SENDAS (Mercado Santo Agostinho); SUPERCOMPRAS COSMOS não tem cod_unitrac | UPDATE lojas SET codigo_unitrac=? WHERE nome ILIKE '%COSMOS%' (precisa cod real do COSMOS) |
| 3 | **PETIT/EMPORIO** | cods 22144000/22144002/22980000 estão como rede DESCONHECIDO; deveriam estar como SENDAS | UPDATE lojas SET rede_id='SENDAS' WHERE codigo_unitrac IN ('22144000','22144002','22980000') |
| 4 | **CARREFOUR Campo Grande SIMÃO** | LSN6I72 ficou em EMANUEL VARGEM GRANDE (cod 17659003); cadastro pode estar incorreto | INVESTIGAR cadastro EMANUEL VARGEM GRANDE e CARREFOUR Campo Grande |
| 5 | **MEGA BOX (ZS)** | cods 6018000/6018001 sem cadastro ZONA_SUL | INSERT/UPDATE lojas pra MEGA BOX 1/2 com codigo_unitrac correto |

## Bugs remanescentes — exigem fix de código

| # | Caso | Status |
|---|------|--------|
| 6 | **ZS L07 RODRIGO/KWK4593** | Atribuiu parada cod=9039103 (L21) como sendo L07. `lojaDaLinha` pra "Zona Sul Loja 07 - Leblon" não está casando com cadastro. **Investigar matchScore.** |
| 7 | **ZS L48 Recreio BBH1C94** | Atribuiu parada cod=9039104 (HUMAITA L33) como sendo L48. Mesma causa do #6. |
| 8 | **SUPER_PAX Madureira ADRIANO TML5I70** | 16:43/16:48/17:13 — investigar paradas reais. |

## Próximo passo recomendado

1. **Aplicar SQLs de cadastro** (#1-#5) — resolve 4 redes restantes.
2. **Fix matchScore/lojaDaLinha** pra cobrir #6-#7.
3. Regenerar KPIs dia 19 e validar taxa global ≥95%.
