# Fase 4 — Casos Especiais

> Edge cases que não cabem no matcher simples. Cada um requer decisão do dono antes de implementar.

## 4.1. Operação em loja-base

**Casos identificados (dia 22):**

| Rede | Loja | Placa | Padrão |
|------|------|-------|--------|
| CAB_PETROPOLIS | CAB Petrópolis | KNS-8D26 (ZOZIMO) | 14 paradas todas no CAB, 00:00→23:57 |
| EMANUEL | PEDRA_GUARATIBA | KNC-5J75 (JULIO) | 16 paradas todas em Pedra de Guaratiba |
| EMANUEL | SANTA_MARIA | KVT-5427 (RAFAEL) | 15 paradas todas em Santa Maria, 17h |
| EMANUEL | CACHAMORRA | LKV-5067 (DANIEL) | 15 paradas Cachamorra + 2 outras |
| FEIRA_NOVA | Mercado Santo Agostinho | EYL-8B91 (RAFAEL SOARES) | 13 paradas Santo Agostinho, 00:05→23:56 |
| SUPERCOMPRAS | COSMOS | EYL-8B91 | Mesma placa Santo Agostinho |

**Pergunta a decidir:**
- O motorista opera DA loja (não vai ao CD principal). Qual é o KPI correto?
  - Opção A: CHD = primeira chegada (00:05), SL = última saída (23:56) — janela TOTAL
  - Opção B: CHD = primeira chegada, SL = primeira saída longa (entrega original)
  - Opção C: Manter em branco (motorista não cumpriu "entrega tradicional")
- O fix `isEstacionamentoNoturno` aplicado pro CAB resolve A. **Mas pode estar causando falsos positivos em outras redes**.

**Decisão pendente:** padronizar com gestão. Pode variar por rede.

## 4.2. Multi-trip no mesmo dia

**Caso identificado:**
- ARMAZEM_GRAO: GILSON UBO-5E05
  - Trip 1 (madrugada): apenas REGINA BARRA DO IMBUY (02:21 → 08:02)
  - Trip 2 (tarde): visitou 3 REGINAs (11:46 → 14:41)
- KPI gerado pegou trip 1, matcher v1 atual pega trip 2

**Pergunta a decidir:**
- Quando há 2+ trips, qual o KPI mostra?
  - Opção A: Primeira chegada de cada loja (mais antigo)
  - Opção B: Maior duração de cada loja (entrega "principal")
  - Opção C: Gerar 2 linhas no KPI (uma por trip) — mas escala só tem 1

**Decisão pendente.**

## 4.3. 2 turnos manhã + tarde

**Casos (ZONA_SUL dia 22):**
- Loja 07 Leblon: matcher v1=13:05 tarde, KPI=05:20 manhã
- Loja 11 Leblon: matcher v1=11:17, KPI=13:54
- Loja 20 Botafogo: matcher v1=17:58, KPI=15:43
- + outros 1

**Pergunta a decidir:** quando a placa faz a MESMA loja 2 vezes (turno manhã + turno tarde), qual mostrar?
- Já existe `SC-PRIMEIRA-BASE` pra ZONA_SUL ≤ 2026-05-18. Convenção atual: T16 (última base antes da entrega).
- Pode ser que a Tia Érica quer ambos turnos (uma linha cada) — mas a escala mostra só 1.

**Decisão pendente.**

## 4.4. Lojas SPID / extras no KPI

**Casos:**
- PREZUNIC: 7 lojas extras no KPI (Depósito Central + 6 SPID)
- CARREFOUR: 1 loja extra (Espírito Santo)
- ASSAI: 2 lojas extras (Cordovil 231 + grafia)

**Origem provável:**
- Templates do KPI Excel que têm linhas pré-preenchidas
- Sistema antigo que tinha essas redes
- Lojas que existem mas não foram escaladas naquele dia

**Pergunta a decidir:**
- Opção A: filtrar — KPI gerado só tem lojas da escala efetiva
- Opção B: aceitar — sistema gera linhas pra todas as lojas cadastradas da rede, marcando SEM/--- as que não tem escala
- Opção C: investigar o template Excel e remover as linhas órfãs

**Decisão pendente:** depende do que a Tia Érica espera ver no KPI.

## 4.5. Grafia inconsistente

**Casos identificados:**
- PRINCESA: escala "1º Entrega" vs KPI "1ª Entrega" (masculino vs feminino)
- ASSAI: escala "AssaÍ" vs KPI "Assaí" (acento)

**Resolução:** normalização no parser:
- Trim, lowercase pra comparação
- Remover variações de ordinal (1º == 1ª == 1)
- Normalização Unicode (NFD + remover diacritics)

**Pode ser implementado direto** (não requer decisão), apenas atenção a não criar matches falsos.

## 4.6. CHD adiantado vs GPS (Categoria C)

**Casos (8 identificados no dia 22):**
- PRINCESA Pechincha: KPI=03:50, GPS=04:31 (-41min)
- PRINCESA Maricá 1 2ª: KPI=04:52, GPS=05:16 (-24min)
- PRINCESA Cabo Frio 1: KPI=04:39, GPS=05:22 (-43min)
- ASSAI Bangu II: KPI=07:44, GPS=09:18 (-94min)
- ASSAI Carioca: KPI=05:10, GPS=05:52 (-42min)
- ASSAI Cesário: KPI=04:06, GPS=05:11 (-65min)
- ASSAI Petrópolis 181: KPI=02:42, GPS=04:28 (-106min)
- PREZUNIC Fonseca: KPI=04:51, GPS=06:17 (-86min)

**Investigar:** de onde vem o CHD adiantado? Hipóteses:
- Fonte alternativa (planilha mestre integrada)
- Parser diferente que detecta entrada na região antes do geofence detectar a parada
- Bug em algum lugar do pipeline

**Decisão pendente:** identificar a fonte e decidir se mantém ou corrige.

## 4.7. Trocas de motorista não no PDF (ZONA_SUL)

**Caso ZONA_SUL dia 22:**
- 8 lojas com motoristas diferentes no KPI vs escala
- Alterações não estavam no PDF tabular

**Origem provável:**
- Trocas comunicadas por WhatsApp/email durante o dia
- Sistema de gestão paralelo

**Pergunta a decidir:**
- Aceitar que o PDF não captura tudo
- Adicionar parser de WhatsApp/email pra capturar
- Permitir entrada manual de alterações na UI

**Decisão pendente.**

## Ordem sugerida de resolução

1. **4.5 Grafia** (simples, baixo risco) — fazer primeiro
2. **4.6 CHD adiantado** (investigação) — pode ser ao mesmo tempo
3. **4.4 Lojas SPID** (decisão UX) — perguntar gestão
4. **4.1 Loja-base** (semântica) — perguntar gestão
5. **4.2 Multi-trip** (semântica) — perguntar gestão
6. **4.3 2 turnos** (semântica) — perguntar gestão
7. **4.7 Trocas fora do PDF** (input source) — decisão estratégica
