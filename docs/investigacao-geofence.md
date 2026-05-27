# Investigação: Geofence local — quando é necessário, quando é problema

**Data:** 2026-05-27
**Contexto:** user questionou: "o geofence não deveria ser necessário"

---

## Como funciona hoje

O sistema usa 3 camadas pra atribuir parada Unitrac → loja escalada:

### Camada 1: Unitrac classificou como LOJA com código
```
Parada {classificacao: 'LOJA', codigo_loja: '9039104'}
→ Match direto se `codCasa(escala.loja_codigo_raw, '9039104')` retorna true
```
**Confiabilidade: alta.** Unitrac tem geofence próprio configurado pra essa loja.

### Camada 2: Match por nome (trgm-lookup, levenshtein)
```
Parada {nome_loja: 'PREZUNIC VILA ISABEL'}
→ Match com escala 'Prezunic - Vila Isabel' se `matchScore <= 1`
```
**Confiabilidade: média.** Depende de cadastro `nome_unitrac` no banco.

### Camada 3: Geofence local (cadastro `lojas.lat/lng/raio_metros`)
```
Parada {classificacao: 'FORA_BASE', lat, lng}
+ Loja escalada {lat, lng, raio_metros: 150}
→ Match se `haversine(parada, loja) <= raio_metros`
```
**Confiabilidade: baixa.** Onde a maioria dos "inventados" do dia 19 vem.

---

## Quando o geofence ajuda

Casos legítimos onde a camada 3 salva:

1. **Unitrac sem cadastro pra loja específica:** Lojas pequenas, novas, ou de redes menores (Mundial, Sams Club, Vianense) frequentemente não têm geofence no Unitrac. GPS reporta `FORA_BASE` mesmo dentro da loja. Geofence local resolve.

2. **OCR ambíguo (variante de placa):** placa LCO-0978 vs LCO-0J78 (posição 4 confundida pelo OCR). Sistema usa geofence pra confirmar que a placa OCR-confundida ESTEVE dentro do raio das lojas escaladas (ex: ZS Loja 33 Humaitá), confirmando substituição.

3. **Sub-cadastro Unitrac com nome diferente:** ex Unitrac cadastra como "EMPORIO BARRA TOWER" mas escala diz "Prezunic Barra da Tijuca" (mesma loja física, nomes diferentes).

---

## Quando o geofence ATRAPALHA (bugs descobertos)

### Bug A: cross-rede via mesma cidade
Caso KMZ-7057 dia 19:
- Parada Unitrac: cod 560038 SENDAS Petrópolis Lj 38, lat/lng dentro do raio da loja
- Sistema atribuiu a Assaí Petrópolis Loja 181 (rede DIFERENTE)
- Causa: ambas em Petrópolis, raio 150m sobreposto

**Fix mergeado (commit 51eb2bd):** se `p.codigo_loja` existe no cadastro como pertencente a OUTRA rede, **bloquear** geo fallback. `redesFungiveis()` valida exceções (ex: ASSAI×SENDAS são fungíveis no transporte mas não no destino).

### Bug B: geofence sobreposto entre lojas próximas
Caso ARMAZEM dia 20 QSZ9A20:
- 4 lojas REGINA têm geofence Unitrac unificado (cod 5353012)
- Paradas reais distam 2-3km entre si
- Sistema atribuía mesma parada a 4 lojas (GPS clonado)

**Fix existente** (matcher.ts:265-270): exige distância ≤500m entre coordenadas pra consolidar como mesma loja.

### Bug C: parada FORA_BASE longe da loja real
Caso teórico: motorista para 300m da loja num restaurante (FORA_BASE), depois entra/sai da loja sem GPS. Geofence local pode capturar errado se o restaurante está mais perto do que o estacionamento real.

**Sem fix.** Risco assumido (raio 150m é conservador).

---

## Resposta à pergunta do user

> "o geofence não deveria ser necessário"

**Em mundo ideal, sim.** Se Unitrac tivesse:
- Cadastro completo de TODAS lojas escaladas (todas redes)
- Geofence preciso por loja (sem overlap)
- Classificação `LOJA` consistente

…então a Camada 3 não seria necessária.

**Mas na prática:**
- ~37 das 279 lojas dia 19 são reconhecidas SÓ via geofence local (Unitrac classifica FORA_BASE)
- Remover Camada 3 = perder 37 lojas de rastreamento (13% do volume diário)
- Trade-off: aceitar 4-5 bugs cross-rede vs perder 37 lojas legítimas

**Decisão atual:** manter geofence + adicionar guarda cross-rede (commit 51eb2bd).

---

## Validação proposta

Pra validar se o geofence está atuando corretamente nos 37 casos do dia 19:
1. Pra cada "inventado" identificado, conferir lat/lng da parada FORA_BASE
2. Conferir lat/lng da loja escalada no cadastro
3. Distância <150m + rede igual → match legítimo
4. Distância 150-500m → suspeito (raio talvez largo demais)
5. Distância >500m → bug real (não deveria casar)

Esse trabalho requer ler PDF Unitrac com lat/lng (não disponível no JSON atual gerado pelo parser do projeto). Pode ser feito numa próxima sessão se o user quiser auditoria mais granular.
