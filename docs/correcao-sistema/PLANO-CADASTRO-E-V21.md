# Plano — Cadastro de Lojas + Matcher V2.1

> Base: análise das 1.036 placas em `ANALISE-COMPLETA-1039-PLACAS.md` + plano de bugs em `.claude/plans/adaptive-strolling-perlis.md` + estado FASE 0–5 em `docs/STATE.md`.
>
> Objetivo: levar o KPI de "razoável" pra **perfeito**. Duas frentes paralelas:
> 1. **Cadastro de lojas** — a única camada de tradução que controlamos (escala e Unitrac são externos)
> 2. **Matcher V2.1** — algoritmo refinado para casar escala × Unitrac com base no cadastro corrigido

---

## Parte 1 — Cadastro de lojas

### Princípio
Cadastro é fonte da verdade. Cada loja na escala precisa de:
- `codigo_unitrac` correto (quando existir geofence individual no Unitrac)
- `lat`/`lng` corretos (para matching geo quando o veículo não pega geofence)
- `raio_metros` realista (para tolerância de match geo)
- `nome_normalizado` consistente (para fallback por nome)

### Etapa 1.1 — Cadastro em massa das 234 LOJAS_INDIVIDUAIS
Input: lista em `lojas-no-unitrac.json` (já gerado), classificacao = `LOJA_INDIVIDUAL`.

Para cada código:
1. Procurar no cadastro por:
   - `codigo_unitrac` exato → match direto, atualiza nome/lat/lng se divergir
   - `nome_normalizado` similar → flagueia "candidato a match", revisão manual
   - lat/lng dentro de 150m do centro do geofence → flagueia "candidato geo"
2. Se nenhum candidato: **cadastrar nova loja** com:
   - `codigo_unitrac` = código do Unitrac
   - `nome` = nome canônico do JSON
   - `lat`/`lng` = centro do geofence (`latMedio`, `lngMedio`)
   - `raio_metros` = max(`raio_metros` do JSON, 100m) — 100m mínimo pra cobrir GPS drift
   - `rede` = inferida pelo prefixo do código (560xxx=SENDAS, 9039xxx=ZONA SUL, 8590xxx=PRINCESA, etc.)
3. Salvar log de ações em `docs/correcao-sistema/cadastro-em-massa.log.md` (criadas vs atualizadas vs ignoradas).

**Saída esperada**: cadastro vai de ~295 ativas pra ~400-450 ativas. Cobertura `codigo_unitrac` sobe de 73% pra 90%+.

### Etapa 1.2 — Resolver as 11 duplicatas detectadas

| # | Códigos | Decisão proposta |
|---|---------|------------------|
| 1 | 5353012, 5353014, 5353016, 5353017 (REGINA + ABASTECEDORA GRÃO) | Consolidar em 1 cadastro `REGINA CD` com 4 aliases em `codigo_unitrac_aliases` |
| 2 | 17659000–004 + 25140000 + 11139000 (O BOM / EMANUEL grupo) | Confirmar com Fecchio (WhatsApp 5571981969087) quais são loja física × CD × rota |
| 3 | 2019003 + 2019007 (DISPOSIÇÃO Janauba/Mundial) | Lat/lng caem no CD — investigar, provável geofence Unitrac mal cadastrado. Ignorar até confirmar |
| 4 | 3030013 vs 3030113 (SUPERPRIX 13 TIJUQUINHA vs NITEROI) | Padronizar nomes: `SUPERPRIX TIJUQUINHA LJ 13` e `SUPERPRIX NITEROI LJ 13` |
| 5 | 8590559+560+569 (PRINCESA ARRAIAL 1/2/3) | 3 cadastros distintos, lat/lng difere por 50-100m |
| 6 | 8590563+564+571 (PRINCESA BUZIOS 1/2/3) | Idem |
| 7 | 8590565+566+567 (PRINCESA CABO FRIO 1/2/3) + 560017 (SENDAS Cabo Frio) | 4 cadastros, atenção pra não cruzar matching |
| 8 | 8590002+003 + 7000749 (MARICÁ) | 3 cadastros distintos |
| 9 | 9039003+004+005+018+019+027+110 (ZS Copacabana cluster) | Confirmar quantas lojas reais existem em Copacabana — se forem todas reais, manter 7. Se for fantasma, consolidar |
| 10 | 23080000 + 15755000 (MERCADO SANTO AGOSTINHO + ITAGIBA COSMOS) | Sempre overlapping no mesmo veículo. Investigar se é mesma operação |
| 11 | 560026 SENDAS CEASA LJ 42 (lat dentro do raio do CD) | Risco de colidir com BASE BENASSI. Reduzir raio do CD ou da loja |

Cada decisão registrada em `docs/correcao-sistema/decisoes-duplicatas.md` antes de qualquer alteração de banco.

### Etapa 1.3 — Lista negra de ROTAS_GIGANTES
Adicionar coluna `is_rota_gigante boolean` ou tabela `unitrac_rotas_gigantes` com os 38 códigos identificados:
```
2018001, 2018002, 2018005, 2018006, 2018007, 2018008, 2018009, 2018013, 2018014,
2018016, 2018018, 2018019, 2018022, 2018023, 2018035, 2018038, 2018040,
5353012, 5353014, 5353016, 5353017, 7012010, 9039124, 11139000, 13156084,
15755000, 17659000, 17659001, 17659002, 17659003, 17659004, 20577000,
21468000, 21469000, 23080000, 25140000, 25414000, 28023000
```
O matcher V2.1 vai pular esses códigos no matching exato (fallback pra geo).

### Etapa 1.4 — Lista negra de placas CD-only
Tabela `veiculos_inativos` ou flag `is_apoio` nos veículos. Lista das 31 placas:
```
ALS-4H33, AMI-1562, AMR-9986, AMW-4D50, DDI-6J90, DJB-6D42, EOF-4331,
EOF-4951, EVU-7F71, EZU-9325, EZU-9D26, EZU-9D27, EZU-9J51, FTV-6F42,
GAR-0802, GBC-6E12, GBG-5C11, GEB-9H31, KPT-5B20, LQD-9H59, LRA-9C40,
LRA-9C41, PVA-1H61, QSO-8D04, SFG-2F72, SFG-2F73, UBF-5G32, UBF-5G33,
UBF-5G36, UBG-7F79, UFL-5C85
```
Matcher V2.1: se placa estiver na lista, ignorar (não tentar casar com escala).

### Etapa 1.5 — Validação final
Pós-cadastro, conferir métricas em `validacao-cadastro-pos-fase0.md`:
- Cobertura `codigo_unitrac` ≥ 90%
- Cobertura `nome_unitrac` ≥ 80%
- 0 lojas ativas sem lat/lng
- 0 lojas ativas com raio_metros inválido (< 5 ou > 500)
- 0 colisões: nenhum par de lojas a < 50m sem aliases configurados

---

## Parte 2 — Matcher V2.1

### Princípio
V2.1 = V2 (já em branch) + correções dos 4 bugs do plano + 3 reforços novos detectados na leitura das placas.

### Bug 1 — GPS Clonado (P1) — fix de 1 linha
**Arquivo**: `src/lib/kpi/matcher.ts:867`
```typescript
// ANTES
if (scorePair(linha, p) < Infinity) return true  // BUG

// DEPOIS
if (scorePair(linha, p) === 0) return true  // só match exato via codCasa
```
Impacto: elimina P1 (clone de parada única em múltiplas lojas) e parcialmente P2/P4/P6.

### Bug 2 — saída_cd = chegada (P5)
**Arquivo**: `src/lib/kpi/matcher.ts:306`
```typescript
// ANTES
return lastBaseSaida ?? lastNonLojaSaida ?? new Date(paradaAlvo.chegada)  // BUG

// DEPOIS
return lastBaseSaida ?? lastNonLojaSaida ?? null
```

### Bug 3 — fallback MCP errado (P5)
**Arquivo**: `mcp/server.ts:521–531`
Remover bloco inteiro do fallback que sobrescreve `r.saida_cd = chegada da primeira loja`.

### Bug 4 — filtro noturno (P2/P4)
**Arquivo**: `src/lib/kpi/matcher.ts:363`
```typescript
// ANTES
const NOITE_DUR_SEG = 4 * 3600

// DEPOIS
const NOITE_DUR_SEG = 3 * 3600
```

### Reforço 5 — matching com geofences sobrepostos (NOVO da leitura)
**Arquivo**: novo helper em `src/lib/kpi/matcher.ts` (extrair função `parseLocalDaParada`)

Padrão observado: campo Local pode ter múltiplos códigos:
```
"BASE BENASSI - BASE BENASSI, 7012010 - CAB - PETROPOLIS, 17659000 - O BOM ATACADISTA"
```

Lógica:
1. Split por `,(?=\s*\d)` (vírgula seguida de dígitos)
2. Para cada parte, descartar:
   - `BASE BENASSI...` (CD)
   - `FORA DE BASE...` (sem geofence)
   - Códigos na lista negra de ROTAS_GIGANTES
3. Resto: candidatos ao match. Escolher o que bate com `codigo_unitrac` da linha da escala.
4. Se ainda > 1 candidato após filtro: usar matching geo como tie-breaker (distância da lat/lng da parada à lat/lng do cadastro).

### Reforço 6 — matching geo robusto para FORA DE BASE (NOVO)
**Arquivo**: `src/lib/kpi/matcher.ts` — função `matchByGeo`

50% das paradas estão FORA DE BASE (sem geofence). Pra essas, atual matcher tenta nome. V2.1:
1. Para cada parada FORA DE BASE no Unitrac, calcular distância haversine pra cada loja-alvo da escala
2. Se dentro do `raio_metros` cadastrado + 50m de tolerância: match aceito
3. Se múltiplas lojas-alvo dentro do raio: priorizar a com menor distância
4. Tempo deve fazer sentido (chegada Unitrac vs janela esperada da escala — não casar parada de 06:00 com loja de turno 18:00)

### Reforço 7 — descarte de placas CD-only
**Arquivo**: `src/lib/kpi/matcher.ts` — início da pipeline
1. Carregar lista de placas inativas (FASE 1.4)
2. Se placa na lista, pular processamento (não gerar linha do KPI)
3. Logar quantas placas foram puladas por dia (sanity check)

---

## Parte 3 — Ordem de execução

### Sprint A — cadastro (estimativa 4-6h)
1. Etapa 1.1 cadastro em massa (script seguro com dry-run + apply)
2. Etapa 1.2 resolver 11 duplicatas (mensagem pra Fecchio sobre #2)
3. Etapa 1.3 lista negra ROTAS_GIGANTES
4. Etapa 1.4 lista negra placas CD-only
5. Etapa 1.5 validação

### Sprint B — matcher V2.1 (estimativa 6-8h)
6. Bug 1 (1 linha)
7. Bug 2 (1 linha)
8. Bug 3 (remover bloco)
9. Bug 4 (1 número)
10. Reforço 5 (overlap parsing) + testes vitest
11. Reforço 6 (matching geo) + testes vitest
12. Reforço 7 (descarte CD-only) + testes vitest

### Sprint C — validação (estimativa 4-6h)
13. Rodar `processar_kpi` para 18, 19, 20, 21, 22/05 com V2.1 + cadastro novo
14. Gerar Excel via `gerar_kpi` e comparar com KPIs manuais
15. Validar especificamente:
    - LQE-5401: timestamps DIFERENTES por loja
    - KOP-4978 dia 21: saída_cd null
    - LTQ-0783 dia 21: lojas 09/15/27 com timestamps diferentes
    - 31 placas CD-only: NÃO aparecem em nenhum KPI
    - Paradas overlapping (KNC-5J75 etc): casam com loja correta, não com rota gigante
16. Métrica de sucesso: ≥ 95% match entre KPI sistema e KPI manual em todos os 5 dias

### Sprint D — rollout (estimativa 2h)
17. Merge branch V2 → main após validação
18. Tag v2.1
19. Deploy
20. Documentar em `docs/STATE.md` que FASE 2 está concluída

---

## Parte 4 — Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Cadastro em massa quebra lojas existentes | Dry-run obrigatório + log antes de apply; rollback via backup do JSON do cadastro |
| Lista negra ROTAS_GIGANTES descarta loja real | Revisar lista com Fecchio antes de aplicar |
| Bug fix muda comportamento de outros dias (regressão) | Rodar dias 18-22 ANTES e DEPOIS, comparar diff |
| Reforço 6 (geo) casa erradamente lojas próximas | Limitar tolerância a `raio_metros + 50m` e priorizar menor distância |
| 31 placas CD-only descartadas erradamente quebram dia em que elas saem | Confirmar com Fecchio se essas placas TÊM operação ocasional, e se sim, criar exceção por dia |

---

## Parte 5 — Saídas esperadas

1. **Cadastro saneado** com 400-450 lojas, 90%+ codigo_unitrac, 80%+ nome_unitrac, 0 colisões
2. **Matcher V2.1** com 7 mudanças (4 bugs + 3 reforços), 100% testes vitest passando
3. **Validação 5 dias** com ≥ 95% match contra KPIs manuais
4. **Documentação**:
   - `docs/correcao-sistema/cadastro-em-massa.log.md` (o que foi criado/atualizado)
   - `docs/correcao-sistema/decisoes-duplicatas.md` (11 decisões)
   - `docs/correcao-sistema/validacao-pos-v21.md` (métricas finais)

---

## Parte 6 — O que NÃO está nesse plano

- Reescrita do pipeline de alterações (já entregue em FASE 1)
- Mudanças no extrator de PDF/XLSX (estável)
- Migração de schema (cadastro só recebe INSERTs e UPDATEs)
- UI / dashboard (escopo separado)
- Importar dados históricos (anteriores a 18/05/2026)

---

## Aguardando aprovação

Nada será executado até confirmação. Próxima ação proposta após aprovação:
**iniciar Sprint A — Etapa 1.1 com dry-run do cadastro em massa** (gera diff sem aplicar; revisa; depois apply).
