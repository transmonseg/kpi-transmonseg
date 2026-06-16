# Funil placa-por-placa + saída em rota + horário exato — Design

**Data:** 2026-06-16
**Origem:** reclamações da operação (Érica, Cecília) sobre o KPI da manhã + caso FHO-5F88.

## Problema

A geração da manhã (relatório Unitrac emitido cedo) mostra informação incompleta ou
falsa, e depois (gerando à tarde) aparece certa. Três sintomas, uma raiz comum
(decidir o estado de cada placa olhando SÓ o PDF, sem a API como gabarito):

1. **Em rota esconde o que já sabe.** FHO-5F88 saiu "EM ROTA / EM ROTA / EM ROTA" nas
   3 colunas de horário, mesmo o relatório já tendo a saída de base 08:20. A tarde
   mostrou "Saída CD 8:20". Regra do operador: *em rota mostra tudo que já sabe, só a
   chegada fica em branco.*
2. **"Sem rastreador" é informação FALSA pra placa desatualizada** (Érica). Uma placa
   que TEM rastreador mas está sem transmitir (precisa manutenção) cai como "sem
   rastreador" — confunde "não tem equipamento" com "tem mas precisa manutenção".
3. **Horário não bate exato.** O matcher acha a entrega (positivo), mas o horário às
   vezes erra muito (BBH1C94 PDF 05:34 vs API/mapa 06:54 = 80 min; CEJ3426 69 min;
   GBG5C11 67 min). O PDF marca uma passagem rápida (drive-by) perto da loja como
   "chegada", em vez da parada real de entrega. ~10% das entregas erram >5min.

## Decisões (validadas com o fundador)

- **Abordagem:** funil único placa-por-placa via API (não remendos separados).
- **Tem rastreador x não tem:** está na frota da API = TEM rastreador (nunca "sem
  rastreador"); não está na frota da API = SEM RASTREADOR.
- **Onde aparece:** tela (preview) + XLSX do cliente + dashboard, coerentes.
- **Desatualizado:** detecção automática pela API (sem checklist manual). Aceita-se
  que "oscilação de GPS" não fica 100%, mas a verdade principal a API crava.

## O funil (árvore de decisão por linha da escala)

Para cada linha (placa + loja esperada), nesta ordem:

**A. A placa apareceu no relatório Unitrac (PDF) ou no merge com a API:**
- Entregou na loja certa (parada GPS na loja, OU confirmada por coordenada da
  geofence autoritativa da API, OU por NF/alvo) → **ENTREGUE**, com horários.
  - **Horário pelo gabarito:** quando a API confirma a entrega e o horário do PDF
    diverge >15min do horário da parada consolidada da API, usa o **horário da API**
    (parada real), não o do PDF (drive-by). Resolve o sintoma 3.
- Saiu da base, sem entrega ainda → **EM ROTA**, mostrando a **saída CD conhecida**
  (saída da última parada BASE no GPS); só chegada/saída loja em branco. Resolve o 1.
- Foi a outra loja → **MUDOU DE ROTA** (com saída).
- Só ficou na base → **NÃO SAIU DA BASE**.

**B. A placa NÃO apareceu no relatório (nenhuma parada) → consulta a API:**
- **Não está na frota da API** → **SEM RASTREADOR** (não tem equipamento).
- **Está na frota + transmitindo hoje** (GPS recente, atraso baixo) → tem rastreador
  OK: se a API mostra movimento fora da base = **EM ROTA**; senão = **NÃO FOI AO
  CLIENTE**. Nunca "sem rastreador".
- **Está na frota + sem transmitir** (último GPS antigo / atraso alto, limiar a
  definir na implementação, ponto de partida: sem comunicar no dia) → **DESATUALIZADO
  / SEM TRANSMISSÃO** (tem equipamento, precisa manutenção). Resolve o 2.

## Componentes (unidades isoladas)

1. **`classificarPlacaViaApi(placa, frotaApi, posicoesApi)` (puro, TDD):** dado a
   placa e os mapas da API, devolve `'sem_rastreador' | 'desatualizado' | 'rastreado'`.
   Regra: não na frota → sem_rastreador; na frota + datagps/atraso stale → desatualizado;
   senão → rastreado. Sem I/O.
2. **`saidaBaseConhecida(paradas)` (puro, TDD):** saída da última parada BASE da placa
   (sem o guard de 15min quando há movimento depois). Já parcialmente feito em
   `saidaBaseSeEmRota`; revisar pra cobrir o caso FHO (saída ≈ corte mas em rota).
3. **`horarioEntregaGabarito(pdfParada, apiParadas, pontosApi)` (puro, TDD):** dada a
   parada do PDF e as paradas da API na mesma loja, devolve o horário a usar (API
   quando confirma e diverge >15min do PDF). Sem I/O.
4. **Novo status `DESATUALIZADO`** em `status-rota.ts` (StatusRota, label, tier
   "conferir") + legenda no `gerador-kpi.ts` (XLSX) + badge na tela + contagem no
   dashboard.
5. **Fios na rota `/api/kpi/simples`** (e em `dashboard-api-fonte.ts`): chamar o funil
   por placa, best-effort (API fora = comportamento de hoje), sem derrubar a geração.

## Onde aparece (os 3 lugares)

- **Tela (preview):** badge "Desatualizado" (âmbar) / "Sem rastreador" / "Em rota ·
  saída HH:MM"; tooltip explicando.
- **XLSX do cliente:** `legendaSlot` passa a devolver "DESATUALIZADO" (ou "SEM
  TRANSMISSÃO") em vez de "SEM RASTREADOR" pros casos certos; "EM ROTA" com a saída CD
  preenchida na coluna SAÍDA CD.
- **Dashboard:** "sem rastreador" só conta quem realmente não está na frota da API;
  "desatualizado" vira sua própria categoria.

## Resiliência

Tudo via API é best-effort (try/catch + guardas por vazio). API fora do ar = funil
não roda, KPI sai pelo PDF como hoje. Nenhum caminho de API derruba a geração.

## Critérios de aceite (casos reais)

- **FHO-5F88 (manhã, relatório 10351):** passa de "EM ROTA/EM ROTA/EM ROTA" para
  "EM ROTA · saída 08:20".
- **Placa fora da frota da API:** "SEM RASTREADOR".
- **Placa na frota mas sem transmitir:** "DESATUALIZADO", nunca "sem rastreador".
- **BBH1C94 / CEJ3426 / GBG5C11:** horário de chegada passa a bater com a API/mapa
  (usa a parada real, não o drive-by), erro cai de >60min para ≤5min.
- **API fora do ar:** geração completa pelo PDF, sem travar (regressão zero vs hoje).

## Fora de escopo (YAGNI)

- Ingestão do checklist manual (decidido: API sozinha).
- Detecção fina de "oscilação de GPS" por histórico (aceito ficar aproximado).
- Painel de segurança (pânico/baú/jammer) e trajeto no mapa — frentes separadas.
