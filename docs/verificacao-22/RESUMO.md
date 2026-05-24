# RESUMO — Verificação completa KPIs dia 22/05/2026

> Análise das 17 KPIs do dia 22 com 7 checks por rede (motorista, contagem, alterações, colunas, lat/lng, slots, matcher vs KPI).

## Estatísticas globais

| Categoria | Total |
|---|---|
| KPIs analisadas | 17 |
| KPIs sem problemas | 7 (MUNDIAL, VIANENSE, SAMS_CLUB, SUPERPRIX, SUPER_PAX, ATACADAO, SENDAS) |
| KPIs com problemas | 10 |
| Problemas Check 1 (motorista) | 10 (8 ZONA_SUL + 2 PREZUNIC) |
| Problemas Check 2 (contagem) | 12 (lojas faltantes/extras em PREZUNIC, CARREFOUR, ASSAI, PRINCESA) |
| Problemas Check 3 (alterações) | 4 (falsos positivos do meu script — alterações realmente aplicadas) |
| Problemas Check 7 (timestamps) | 36 |

---

## Status por rede

| # | Rede | Problemas | Status |
|---|------|-----------|--------|
| 1 | MUNDIAL | 0 | ✓ PERFEITO |
| 2 | SENDAS | 2 falsos positivos do matcher local | ⚠ KPI OK, matcher local com bug |
| 3 | VIANENSE | 0 | ✓ PERFEITO |
| 4 | SAMS_CLUB | 0 | ✓ PERFEITO |
| 5 | CAB_PETROPOLIS | 1 (KPI antigo, fix aplicado) | ⚠ Regerar KPI |
| 6 | PRINCESA | 4 | ⚠ Investigar |
| 7 | PREZUNIC | ~10 | ❌ MUITO |
| 8 | SUPERCOMPRAS | 1 (questão de escala) | ⚠ Investigar |
| 9 | SUPERPRIX | 0 | ✓ PERFEITO |
| 10 | CARREFOUR | 2 (1 falso positivo, 1 loja extra) | ⚠ KPI quase OK |
| 11 | ATACADAO | 0 | ✓ PERFEITO |
| 12 | ASSAI | 4 (CHD adiantado, 1 falso positivo) | ⚠ Investigar |
| 13 | SUPER_PAX | 0 | ✓ PERFEITO |
| 14 | ARMAZEM_GRAO | 5 (2 trips no mesmo dia) | ⚠ Investigar |
| 15 | ZONA_SUL | 18 (8 motoristas + 10 timestamps) | ❌ MUITO |
| 16 | EMANUEL | 4 (operação em loja-base) | ⚠ Investigar |
| 17 | FEIRA_NOVA | 1 (caso Santo Agostinho) | ⚠ KPI quase OK |

---

## Problemas CATEGORIZADOS para correção

### Categoria A — Falso positivo do MEU SCRIPT (não é problema do KPI real)

**A1. Check 3 — Fuzzy match de alterações pegando loja errada**
- Onde: PREZUNIC (2 falsos), CARREFOUR (2 falsos)
- Sintoma: Script reporta "alteração não aplicada" quando na verdade FOI aplicada
- Causa: `kpiLinhas.find(k => normalizaNome(k.loja).includes(normalizaNome(lojaNome.split('-')[0])))` pega a primeira loja com nome similar
- **Fix:** melhorar fuzzy match para retornar todos os candidatos e validar pela placa também

### Categoria B — Falso positivo do MATCHER LOCAL após fix isEstacionamentoNoturno (commit 2a491f4)

**B1. Matcher pega loja errada quando placa visita múltiplas lojas**
- Casos identificados:
  - SENDAS Americanas (LKV-5067): matcher pegou SENDAS SÃO JOÃO DE MERITI como sendo a Americanas
  - SENDAS Central (KRB-2J76): matcher pegou MATRIZ CD DUQUE
  - EMANUEL CACHAMORRA (LKV-5067, mesma placa): matcher pegou SENDAS SÃO JOÃO DE MERITI
  - ASSAI Macaé Loja 232: matcher CHD 02:59 (madrugada)
  - SUPERCOMPRAS COSMOS (EYL-8B91): matcher pegou MERCADO SANTO AGOSTINHO o dia todo
- **Causa raiz suspeita:** o fix do `isEstacionamentoNoturno` agora aceita paradas que vão de madrugada até a tarde, mas isso permite que o matcher associe paradas longas a lojas erradas via algum mecanismo (geo ou nome).
- **Fix:** revisar a lógica de `isEstacionamentoNoturno` ou adicionar critério adicional (ex: parada longa só conta se for da loja-alvo da rede atual)

### Categoria C — KPI gerado com CHD adiantado vs GPS real

**C1. CHD adiantado em 24-106 minutos vs GPS, SL bate**
- Casos:
  - PRINCESA Pechincha (CHD adiantado 41min)
  - PRINCESA Maricá 1 2ª (24min)
  - PRINCESA Cabo Frio 1 1ª (43min)
  - ASSAI Bangu II (94min)
  - ASSAI Carioca Shopping (42min)
  - ASSAI Cesário de Melo (65min)
  - ASSAI Petrópolis 181 (106min)
  - PREZUNIC Fonseca (86min)
- **Padrão:** KPI tem timestamp ANTES da chegada GPS real, mas SL bate
- **Hipótese:** KPI usa fonte de chegada diferente do parser Unitrac atual (talvez o "primeiro evento na região" em vez de "geofence detectado")
- **A investigar:** comparar logs de geração do KPI com parser atual

### Categoria D — Lojas faltantes/extras no KPI

**D1. Loja na escala mas faltando no KPI**
- PRINCESA Iguaba 1ª Entrega (escala diz "1º" masculino, KPI diz "1ª" feminino — **divergência de grafia**)
- ASSAI Ilha do Governador Loja 29 (escala "AssaÍ", KPI "Assaí")
- **Fix:** normalizar grafias no parser de escala

**D2. Lojas extras no KPI sem escala**
- PREZUNIC: 7 lojas extras (Depósito Central + 6 SPID)
- CARREFOUR: 1 loja extra (Espírito Santo)
- ASSAI: 2 lojas extras (Cordovil 231 + 1 grafia)
- **A investigar:** essas lojas vêm de algum lugar (template do Excel? sistema separado?)

### Categoria E — Trocas de motorista não registradas em alterações PDF

**E1. ZONA_SUL com 8 motoristas diferentes da escala**
- MEGA BOX 01, MEGA BOX 02, Lojas 07, 11, 46, 34, 03, 26
- **Causa:** trocas foram aplicadas no KPI mas o PDF de alterações não as continha (talvez vieram de WhatsApp/email do gestor)
- **Fix:** estender parser de alterações pra outras fontes (texto WhatsApp, email)

### Categoria F — Casos especiais: motorista opera em loja-base o dia inteiro

**F1. Motorista passa o dia em uma única loja (sem ir ao CD Transmonseg)**
- CAB_PETROPOLIS (ZOZIMO KNS-8D26): 14 paradas todas no CAB. Fix `isEstacionamentoNoturno` aplicado (commit 2a491f4). Matcher agora gera 00:00/13:14, KPI atual ainda tem valor antigo.
- EMANUEL PEDRA_GUARATIBA (JULIO KNC-5J75): 16 paradas todas em Pedra Guaratiba
- EMANUEL SANTA_MARIA: motorista passa 17h na loja
- SUPERCOMPRAS Cosmos / FEIRA_NOVA Santo Agostinho (RAFAEL SOARES EYL-8B91): mesma situação
- **A definir com gestão:** qual é a semântica correta nesses casos (CHD=primeira chegada vs janela específica)

### Categoria G — Paradas múltiplas mesma placa em loja específica

**G1. KPI copiou timestamps entre lojas atendidas pela mesma placa**
- PREZUNIC Barra Marapendi: KPI usou timestamps de Jardim Oceanico (mesma placa MARCELO KNC-1I34)
- **Fix:** desambiguar quando placa tem múltiplas entregas

### Categoria H — Multi-trip no mesmo dia

**H1. Motorista faz 2 ou mais trips ao mesmo conjunto de lojas**
- ARMAZEM_GRAO: GILSON UBO-5E05 fez trip madrugada (BARRA DO IMBUY) + trip tarde (3 REGINAs)
- ZONA_SUL: 4 casos de 2 turnos (manhã vs tarde) detectados no Check 7
- **A definir:** qual trip o KPI deve refletir (primeiro? maior? gestão decide)

---

## Ações recomendadas

### Curto prazo (Fase 4)

1. **Investigar Categoria B** (falsos positivos do matcher após fix isEstacionamentoNoturno) — pode ser regressão do fix do CAB
2. **Corrigir Check 3 do meu script** (falso positivo de fuzzy match)
3. **Investigar Categoria D2** (de onde vêm as 10+ lojas extras no KPI)
4. **Regerar KPI CAB_PETROPOLIS** com o sistema atual pra confirmar fix

### Médio prazo (Fase 5)

1. **Categoria C** — investigar por que KPI gerado tem CHD adiantado em vários casos
2. **Categoria E** — estender parser de alterações (WhatsApp/email)
3. **Categoria F** — definir semântica de "operação em loja-base" com gestão
4. **Categoria G** — desambiguar timestamps quando mesma placa tem múltiplas entregas
5. **Categoria H** — definir qual trip mostrar em multi-trips

---

## Conclusão

- **7 KPIs perfeitas** (MUNDIAL, VIANENSE, SAMS_CLUB, SUPERPRIX, ATACADAO, SUPER_PAX, SENDAS*)
- **10 KPIs com problemas** mas a maioria são casos específicos (motorista em loja-base, 2 turnos, falsos positivos)
- **Sistema está em bom estado geral**, mas tem **regressão** após o fix do CAB Petrópolis (falsos positivos do matcher em casos de múltiplas lojas mesma placa)

*SENDAS aparece com 2 "divergências" mas ambas são falsos positivos do matcher local — KPI gerado está correto.
