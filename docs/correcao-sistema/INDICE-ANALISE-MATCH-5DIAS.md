# Índice — Análise match placa-por-placa (5 dias)

Verificação manual: para cada placa única, comparou-se a escala (todas as redes — Geral, PAX, Armazém, Zona Sul, Guanabara) com as paradas LOJA do Unitrac.

## Regra de negócio (do fundador)

1. **Escala TEM + Unitrac TEM paradas LOJA** → matcher tenta casar:
   - `OK_FULL` (tudo bate) / `OK_PARCIAL` (parcial) / `FALHA_MATCH` (paradas existem mas nada bate)
2. **Escala TEM + Unitrac NÃO TEM paradas LOJA** (placa só BASE ou ausente do Unitrac) → `SEM_RASTREADOR`
   - Linha vai pro KPI, mas sem horários do GPS (preenchimento manual ou em branco)
3. **Escala NÃO TEM + Unitrac TEM** → `IGNORAR`
   - Não vai pro KPI. Sem escala, não tem rota esperada pra preencher.

## Critério de match (igual ao matcher V2.1)

1. `codigo_escala` exato com `codigo_loja` (ou suffix-match com prefixo de rede)
2. Se não, tokens de nome em comum (ignorando palavras genéricas: LOJA, SUL, ASSAI, etc)
3. Códigos em ROTAS_GIGANTES descartados do match exato (raio ≥ 5km, ver `rotas-gigantes.ts`)

## Sumário consolidado dos 5 dias

| Diagnóstico | Dia 18 | Dia 19 | Dia 20 | Dia 21 | Dia 22 | **Total** | % | Vai pro KPI? |
|-------------|--------|--------|--------|--------|--------|-----------|---|---|
| **OK_FULL** (todas rotas batem) | 68 | 56 | 71 | 61 | 74 | **330** | 39% | ✓ sim com horários |
| **OK_PARCIAL** (parte das rotas) | 16 | 24 | 14 | 19 | 15 | **88** | 10% | ✓ sim, parcial |
| **FALHA_MATCH** (paradas ≠ escala) | 4 | 4 | 6 | 6 | 3 | **23** | 3% | ✓ sim sem horários |
| **SEM_RASTREADOR** (escala sim, Unitrac sem LOJA) | 46 | 52 | 47 | 44 | 37 | **226** | 27% | ✓ sim sem horários |
| **IGNORAR** (Unitrac sim, escala não) | 39 | 28 | 38 | 31 | 39 | **175** | 21% | ✗ não vai |
| **Total placas únicas** | 173 | 164 | 176 | 161 | 168 | **842** | | |

### Detalhe SEM_RASTREADOR
- 176 placas: escala diz que rodaria mas a placa nem está no Unitrac
- 50 placas: placa está no Unitrac mas só com paradas BASE BENASSI (CD-only)

Ambas significam: a Tia Érica precisa preencher horários manualmente OU deixar em branco no KPI.

## Interpretação

- **OK_FULL (39%)** + **OK_PARCIAL (10%)** + **FALHA_MATCH (3%)** = 441 placas (52%) onde o veículo rodou de verdade. Dessas, 330 (75% dos rodados) têm match 100%. O matcher V2.1 acerta 75% dos casos onde tem dado.
- **SEM_RASTREADOR (27%)**: o KPI gerado precisa mostrar essas linhas SEM horários do GPS — tia Érica preenche manual. Hoje o sistema vai jogar essas linhas como "unmatched" no KPI — precisa marcar como "SEM RASTREADOR" pra ela não confundir com erro de match.
- **IGNORAR (21%)**: placas Unitrac sem escala. Hoje o sistema não gera linha pra elas (correto). Pode ser:
  - Substituição não anotada nas alterações
  - Veículo de apoio do CD que saiu
  - Escala de outra rede não importada

## Arquivos por dia

- [Dia 18 — 173 placas](./analise-match-dia-18.md)
- [Dia 19 — 164 placas](./analise-match-dia-19.md)
- [Dia 20 — 176 placas](./analise-match-dia-20.md)
- [Dia 21 — 161 placas](./analise-match-dia-21.md)
- [Dia 22 — 168 placas](./analise-match-dia-22.md)

## Ações priorizadas

### Prioridade 1 — Atacar OK_PARCIAL (88 casos)
Placa rodou, Unitrac tem paradas LOJA, mas o matcher só casou parte das rotas escaladas.

Padrões esperados:
- Loja com nome divergente entre Escala e Unitrac (ex: "Mercado de Santa" vs "9966101 SUPERMARKET COELHO NETO")
- Rota gigante bloqueando match exato (ex: parada `5353012 REGINA` cobre 4 lojas da escala)
- Lojas com codigo_unitrac faltando no cadastro

### Prioridade 2 — FALHA_MATCH (23 casos)
Paradas LOJA existem no Unitrac mas nenhuma casa com escala. Quase tudo é Armazém do Grão BOA VISTA/POSSE/16 DE MARÇO/MATRIZ — paradas reais aparecem como REGINA (rota gigante 5353012/14/16) no Unitrac.

Solução: cadastrar codigo_unitrac REGINA nas lojas Armazém físicas que dividem o mesmo geofence.

### Prioridade 3 — Garantir SEM_RASTREADOR no KPI (226 casos)
O matcher hoje deixa essas linhas como UNMATCHED. Verificar se o gerador de KPI marca explicitamente como "SEM RASTREADOR" em vez de só pular ou mostrar branco.

### Prioridade 4 — Reduzir IGNORAR via alterações (175 casos)
Investigar substituições não anotadas. Pode ser que escala diz placa X mas no dia mudou pra placa Y do mesmo motorista — alteração não foi importada.
