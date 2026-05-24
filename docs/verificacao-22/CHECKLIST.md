# Checklist dos 6 Checks por KPI

> Cada análise de KPI deve passar por TODOS estes checks. Saída em `<REDE>.md`.

**Observação:** o antigo "Check 7 — Anomalias do sistema" foi REMOVIDO. Era de uma versão antiga do KPI que já foi descontinuada. O fluxo atual não usa anomalias.

## Check 1 — Motorista (escala vs KPI)

**Fonte 1:** `escala.motorista_nome` (string da escala)
**Fonte 2:** `kpi.motorista1` ou `kpi.motorista2` (coluna 2 ou 8 do Excel)

**Validação:** comparar strings normalizadas (uppercase, sem acentos). Se diferentes, flag.

**Exemplo de problema:** escala diz "RENATO", KPI diz "JOÃO" com a mesma placa → motorista divergente.

## Check 2 — Contagem global (escala vs KPI)

**Fonte 1:** quantidade de linhas na escala filtrada pela rede
**Fonte 2:** quantidade de linhas no KPI Excel

**Validação:**
- Se escala N > KPI N → listar lojas faltantes
- Se escala N < KPI N → listar lojas extras
- Match exato → OK

## Check 3 — Alterações aplicadas

**Fonte 1:** alterações do PDF para a rede atual (do parser tabular)
**Fonte 2:** KPI gerado (motorista/placa por loja)

**Validação:** para cada alteração no PDF (nova placa/motorista para uma loja), verificar se:
- A loja aparece no KPI
- Motorista no KPI = motorista da alteração
- Placa no KPI = placa da alteração

Se divergente → flag "alteração não aplicada".

## Check 4 — Todas colunas do KPI Excel

**Atualmente lendo:** loja (col 1), motorista (col 2/8), placa (col 4/10), SC (col 5/11), CHD (col 6/12), SL (col 7/13)

**Ler também:**
- Colunas 14-20 (se existirem) — provavelmente status, obs, anomalia
- Identificar qual coluna tem cada coisa lendo o cabeçalho (linhas 1-4)

**Validação:** mostrar valores das colunas extras. Flag se status/obs sugerir problema.

## Check 5 — Lat/lng das paradas

**Fonte 1:** cada `parada.lat` / `parada.lng` (do Unitrac)
**Fonte 2:** `loja.lat` / `loja.lng` / `loja.raio_metros` (cadastro DB)

**Validação:**
- Calcular distância haversine entre parada e loja-alvo
- Se distância > `raio_metros` → flag "parada fora do raio"
- Pode indicar match GPS errado mesmo quando o `nome_loja` parece bater

## Check 6 — Ambos slots da linha do KPI

**Cada loja no KPI Excel** tem 2 colunas de carro: 1º carro (cols 2-7) e 2º carro (cols 8-13).

**Validação:** validar SC/CHD/SL de AMBOS, não só do slot da linha de escala. Se 2º carro tem dados mas não tem escala correspondente → flag.

## Formato do relatório `<REDE>.md`

```markdown
# Análise <REDE> — Dia 22/05/2026

## Resumo executivo
- Total escala: N
- Total KPI: M
- ✓ OK: X | ⚠ Problemas: Y

## Check 1 — Motorista
(resultados)

## Check 2 — Contagem global
(resultados)

...

## Lojas analisadas (detalhe)

### Loja A
- Status: ✓ OK / ⚠ PROBLEMA
- Detalhe: ...

## Problemas identificados
1. ...
2. ...

## Itens a investigar/corrigir em lote
- ...
```
