# Bug 6 — Padrões observados nos 10 casos de SL curta dia 19

## Casos categorizados

| Caso | Manual SL | Sys SL | Δ | Tipo do match | LOJA dur | Próxima parada | Próx dur | Dist→loja | Gap | Categoria |
|------|-----------|--------|-----|---------------|----------|----------------|----------|-----------|-----|-----------|
| ZS 43 Barra | 16:55 | 16:20 | 35min | LOJA (parada #9) | 11min | (fim do dia) | --- | --- | --- | **FIM-DE-ROTA** |
| ZS 45 Flamengo | 18:00 | 16:19 | 101min | LOJA | 17min | (fim do dia) | --- | --- | --- | **FIM-DE-ROTA** |
| ATACADAO MANILHA | 10:20 | 08:07 | 133min | **FORA_BASE #4** | 106min | FORA_BASE #5 | 129min | 44m | 1min | **FORA_BASE-cadeia** |
| CARREFOUR SULACAP | 07:15 | 06:32 | 43min | **FORA_BASE #2** | 15min | FORA_BASE #3+#4 | 25+16min | 179m+7m | 1min | **FORA_BASE-cadeia** |
| PREZUNIC CAXIAS CENTRO | 06:30 | 06:17 | 13min | LOJA | 15min | LOJA OUTRA | 27min | 1277m | 7min | **OUTRA LOJA (tolerável)** |
| GUANABARA BENTO RIBEIRO | 12:50 | 10:36 | 134min | **FAKE_EXIT #5** | 3min | FORA_BASE #6+#7 | 19+95min | 56m+0m | 2min | **FORA_BASE-cadeia (após FAKE_EXIT)** |
| GUANABARA BONSUCESSO | 11:55 | 10:50 | 65min | **FAKE_EXIT #8** | 5min | FORA_BASE #9 | 62min | 0m | 2min | **FORA_BASE-cadeia (após FAKE_EXIT)** |
| ASSAI MACAÉ | 10:30 | 06:21 | 249min | (placa não localizada) | --- | --- | --- | --- | --- | **DESCONHECIDO** |
| PRINCESA BUZIOS 1 (2ª) | 17:30 | 06:32 | 658min | LOJA #4 | 18min | LOJA #5+#6+#7 | 63+178min | 342m+31m | 1min | **MULTI-TRIP (fim-de-dia)** |
| ASSAI GALEÃO (inverso) | 06:15 | 11:37 | -322min | --- | --- | --- | --- | --- | --- | **ASSAI convenção SL=fim-rota** |

## Padrões identificados

### Padrão A: FORA_BASE-cadeia (matched = FORA_BASE ou FAKE_EXIT)

**Características:**
- Não existe geofence LOJA no GPS — loja sem cadastro de geofence no Unitrac
- O matcher casa por proximidade/codigo um **FORA_BASE** ou **FAKE_EXIT** (não LOJA)
- A SL real é a saída do **ÚLTIMO FORA_BASE da cadeia adjacente** dentro de 200-300m
- Saída do FORA_BASE escolhido pelo matcher é cedo demais (≈ saída do primeiro de N na cadeia)

**Casos:** MANILHA, SULACAP, BENTO RIBEIRO, BONSUCESSO (4 lojas)

**Critério atual de `estendeSaidaPorForaBase`:**
```ts
if (matched.classificacao !== 'LOJA') return null  // bloqueia FORA_BASE/FAKE_EXIT
```
→ **Não ativa pra esses casos.**

**Fix proposto:** aceitar `matched.classificacao === 'FORA_BASE' || matched.classificacao === 'FAKE_EXIT'` quando
- matched.lat/lng disponíveis
- matched já está perto da loja (dist do match < 300m da loja)
- seguir cadeia FORA_BASE adjacente (≤300m do matched, gap ≤5min)

### Padrão B: Fim-de-rota (LOJA é última parada do dia)

**Características:**
- Última parada do dia é LOJA com duração razoável
- Manual marca SL mais tarde → motorista permaneceu na loja sem GPS gerar nova parada, OU foi pra outra atividade não capturada

**Casos:** ZS 43, ZS 45 (2 lojas)

**Critério atual:** funciona corretamente — sem FORA_BASE seguinte, não estende.
**Fix:** **NÃO É FIXÁVEL** via `estendeSaidaPorForaBase`. Δ aceitável.

### Padrão C: Multi-trip/convenção (motorista volta no fim do dia)

**Casos:** BUZIOS 1 2ª (Δ658min)

**Critério:** convenção Tia Érica registra fim-do-dia ou último timestamp como SL pra entregas de 2ª passada. NÃO é bug do matcher.

### Padrão D: Outra LOJA seguinte (próxima entrega adjacente)

**Casos:** CAXIAS CENTRO (Δ13min — já dentro de tolerância)

**Critério:** SL termina na 1ª loja antes de seguir pra próxima. Δ pequeno.

### Padrão E: ASSAI fim-rota convenção (já mapeado no plano em outro bug)

**Casos:** GALEÃO (Δ inverso) — fora de escopo.

## Conclusão

**Casos endereçáveis pelo Bug 6:** 4 (MANILHA, SULACAP, BENTO RIBEIRO, BONSUCESSO).

**Critério ajustado:** generalizar `estendeSaidaPorForaBase` para também aceitar matched=FORA_BASE/FAKE_EXIT (quando perto da loja) e seguir cadeia adjacente FORA_BASE.
