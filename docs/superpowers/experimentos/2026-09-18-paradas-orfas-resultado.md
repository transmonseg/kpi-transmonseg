# Experimento: paradas órfãs na rota (resultado)

Data: 2026-09-18. Regra testada: pendente com parada órfã (parada do caminhão sem NF associada) a até R metros do endereço vira "ENTREGUE - PARADA ÓRFÃ NA ROTA - CONFERIR".

## Método e limitações

- 5 dias reprocessados offline no VPS (09, 11, 15, 16, 17/09) a partir dos PDFs do grupo KPI AJUSTES; dump exportado por `EXPORTAR_DUMP`, análise com `scripts/exp-paradas-orfas.ts`.
- Reprocessar dia passado NÃO tem os alvos da Unitrac (servidos só no próprio dia): todos os dias estão no cenário "sem alvos", então a taxa identificada tende a sair MENOR que a da produção (17/09: 86,9% contra 92,5% na produção), mas não sempre: 11/09 reprocessado deu 86,6% contra 84,3% da produção e 15/09 deu 86,2% contra 86,1%. Limitação assumida no plano.
- 09/09 e 11/09 (>48 h) usam só a ponte de GPS.
- O gabarito da Ana é minúsculo (7 entregues e 2 sem evidência achadas nos dumps, casadas por NF).

## Resultado por dia (raio 1500 m)

| Dia | NFs | Identificadas (reprocessado) | Pendentes | Órfãs | Pendentes com órfã | Com órfã exclusiva |
|---|---|---|---|---|---|---|
| 09/09 | 2361 | 88,6% | 268 | 301 | 27 (10,1%) | 16 (6,0%) |
| 11/09 | 2224 | 86,6% | 297 | 307 | 30 (10,1%) | 24 (8,1%) |
| 15/09 | 2293 | 86,2% | 317 | 272 | 24 (7,6%) | 19 (6,0%) |
| 16/09 | 1960 | 84,3% | 308 | 110 | 8 (2,6%) | 7 (2,3%) |
| 17/09 | 2058 | 86,9% | 270 | 533 | 65 (24,1%) | 55 (20,4%) |

Mediana de 15, 16 e 17/09 (exclusivas a 1500 m): **6,0%** (valores 6,0 / 2,3 / 20,4).

## Saída completa do CLI

```

=== 2026-09-09: 2361 NFs | identificadas 88.6% | pendentes 268 (12 sem coordenada) | paradas orfas 301
  raio  500m: pendentes com orfa   0 (0.0%) | exclusivas   0 (0.0%)
  raio 1000m: pendentes com orfa   6 (2.2%) | exclusivas   6 (2.2%)
  raio 1500m: pendentes com orfa  27 (10.1%) | exclusivas  16 (6.0%)
  raio 2000m: pendentes com orfa  40 (14.9%) | exclusivas  26 (9.7%)
  raio 3000m: pendentes com orfa  58 (21.6%) | exclusivas  38 (14.2%)
     [1500m] não foi ao cliente     pendentes  65 | com orfa   0 (0.0%)
     [1500m] coordenada imprecisa   pendentes 109 | com orfa   7 (6.4%)
     [1500m] parada 500m-2km        pendentes  53 | com orfa  20 (37.7%)
     [1500m] sem confirmação        pendentes  12 | com orfa   0 (0.0%)
     [1500m] ilha                   pendentes   2 | com orfa   0 (0.0%)
     [1500m] outra                  pendentes  27 | com orfa   0 (0.0%)

=== 2026-09-11: 2224 NFs | identificadas 86.6% | pendentes 297 (21 sem coordenada) | paradas orfas 307
  raio  500m: pendentes com orfa   0 (0.0%) | exclusivas   0 (0.0%)
  raio 1000m: pendentes com orfa   7 (2.4%) | exclusivas   6 (2.0%)
  raio 1500m: pendentes com orfa  30 (10.1%) | exclusivas  24 (8.1%)
  raio 2000m: pendentes com orfa  40 (13.5%) | exclusivas  32 (10.8%)
  raio 3000m: pendentes com orfa  59 (19.9%) | exclusivas  45 (15.2%)
     [1500m] coordenada imprecisa   pendentes 133 | com orfa   9 (6.8%)
     [1500m] sem confirmação        pendentes  21 | com orfa   0 (0.0%)
     [1500m] não foi ao cliente     pendentes  81 | com orfa   0 (0.0%)
     [1500m] parada 500m-2km        pendentes  53 | com orfa  21 (39.6%)
     [1500m] ilha                   pendentes   9 | com orfa   0 (0.0%)

=== 2026-09-15: 2293 NFs | identificadas 86.2% | pendentes 317 (15 sem coordenada) | paradas orfas 272
  raio  500m: pendentes com orfa   0 (0.0%) | exclusivas   0 (0.0%)
  raio 1000m: pendentes com orfa   2 (0.6%) | exclusivas   2 (0.6%)
  raio 1500m: pendentes com orfa  24 (7.6%) | exclusivas  19 (6.0%)
  raio 2000m: pendentes com orfa  38 (12.0%) | exclusivas  30 (9.5%)
  raio 3000m: pendentes com orfa  57 (18.0%) | exclusivas  41 (12.9%)
     [1500m] coordenada imprecisa   pendentes 114 | com orfa   7 (6.1%)
     [1500m] parada 500m-2km        pendentes  66 | com orfa  17 (25.8%)
     [1500m] não foi ao cliente     pendentes  71 | com orfa   0 (0.0%)
     [1500m] sem confirmação        pendentes  15 | com orfa   0 (0.0%)
     [1500m] outra                  pendentes  47 | com orfa   0 (0.0%)
     [1500m] ilha                   pendentes   4 | com orfa   0 (0.0%)

=== 2026-09-16: 1960 NFs | identificadas 84.3% | pendentes 308 (12 sem coordenada) | paradas orfas 110
  raio  500m: pendentes com orfa   0 (0.0%) | exclusivas   0 (0.0%)
  raio 1000m: pendentes com orfa   2 (0.6%) | exclusivas   2 (0.6%)
  raio 1500m: pendentes com orfa   8 (2.6%) | exclusivas   7 (2.3%)
  raio 2000m: pendentes com orfa  14 (4.5%) | exclusivas  12 (3.9%)
  raio 3000m: pendentes com orfa  24 (7.8%) | exclusivas  19 (6.2%)
     [1500m] outra                  pendentes 222 | com orfa   0 (0.0%)
     [1500m] não foi ao cliente     pendentes  17 | com orfa   0 (0.0%)
     [1500m] sem confirmação        pendentes   2 | com orfa   0 (0.0%)
     [1500m] parada 500m-2km        pendentes  15 | com orfa   5 (33.3%)
     [1500m] coordenada imprecisa   pendentes  49 | com orfa   3 (6.1%)
     [1500m] ilha                   pendentes   3 | com orfa   0 (0.0%)

=== 2026-09-17: 2058 NFs | identificadas 86.9% | pendentes 270 (16 sem coordenada) | paradas orfas 533
  raio  500m: pendentes com orfa  39 (14.4%) | exclusivas  33 (12.2%)
  raio 1000m: pendentes com orfa  50 (18.5%) | exclusivas  40 (14.8%)
  raio 1500m: pendentes com orfa  65 (24.1%) | exclusivas  55 (20.4%)
  raio 2000m: pendentes com orfa  88 (32.6%) | exclusivas  74 (27.4%)
  raio 3000m: pendentes com orfa 107 (39.6%) | exclusivas  89 (33.0%)
     [1500m] coordenada imprecisa   pendentes 130 | com orfa   9 (6.9%)
     [1500m] sem confirmação        pendentes  16 | com orfa   0 (0.0%)
     [1500m] passou sem parar       pendentes  36 | com orfa  35 (97.2%)
     [1500m] não foi ao cliente     pendentes  26 | com orfa   0 (0.0%)
     [1500m] parada 500m-2km        pendentes  57 | com orfa  21 (36.8%)
     [1500m] ilha                   pendentes   5 | com orfa   0 (0.0%)

=== Gabarito da Ana (so dias com dump) ===
  raio  500m: recall entregue 0/6 (0.0%) | falso-confirmado 1/1 (100.0%) | ja confirmadas 1 | nao encontradas 7
  raio 1000m: recall entregue 0/6 (0.0%) | falso-confirmado 1/1 (100.0%) | ja confirmadas 1 | nao encontradas 7
  raio 1500m: recall entregue 1/6 (16.7%) | falso-confirmado 1/1 (100.0%) | ja confirmadas 1 | nao encontradas 7
  raio 2000m: recall entregue 1/6 (16.7%) | falso-confirmado 1/1 (100.0%) | ja confirmadas 1 | nao encontradas 7
  raio 3000m: recall entregue 1/6 (16.7%) | falso-confirmado 1/1 (100.0%) | ja confirmadas 1 | nao encontradas 7

CSV de candidatas (raio 1500m): /private/tmp/claude-501/-Users-joaquimsalles/43f3d9c2-79a4-4525-b647-10dd95cc3a2d/scratchpad/exp/candidatas-orfas.csv (154 linhas)
```

## Gabarito da Ana (casado por NF, raio 1500 m)

**Correção:** a versão anterior desta seção casava os rótulos pela data (`data` do JSON), que mistura a data da entrega com a data em que a Ana postou a análise; 7 das 15 etiquetas de dias com dump não eram achadas e 4 delas estão no dump do dia anterior. Agora o casamento é por NF em qualquer dump. Os números do CLI anexado acima (bloco "Gabarito da Ana") são da versão antiga; os corretos são estes (recalculados com o CLI corrigido; coincidem com a previsão do revisor):

- Recall das entregues: 2/7 = **28,6%** (0/7 até 1000 m).
- Falso-confirmado (sem evidência com órfã): 1/2 = **50%** (n=2, sem valor estatístico).
- Já confirmadas pelo motor atual: 3, sendo 2 corretas (rótulo `entregue`) e 1 falsa (rótulo `sem_evidencia`, NF 2372384: o motor atual já confirma uma entrega que a Ana marcou sem evidência).
- 15 NFs rotuladas não aparecem em nenhum dos 5 dumps (dias sem dump).

## Observações

- Dia 17/09 destoa: 533 órfãs e 97% dos "passou sem parar" com órfã. Os outros dias têm poucas órfãs (110 a 307) e quase nenhuma em 500 m; o ganho em 17 parece específico do dia (vale investigar se é artefato dos dados/ausência de alvos), não estrutural.
- A categoria "parada 500m-2km" concentra o efeito (26 a 40% com órfã), justamente onde o casamento por distância já é ambíguo.
- Amostra p/ a Ana: 28 linhas (10 em 15/09, 8 em 16/09 = todas as candidatas do dia, 10 em 17/09), em `amostra-ana.csv` no scratch da sessão; abaixo dos 30 pares exigidos pela condição 4.

## Confundidores e limites da evidência

1. **Regime de dados diferente por dia.** 09, 11 e 15/09 foram reprocessados fora da janela de 48 h da Unitrac (só ponte de GPS); 17/09 foi o único reprocessado com paradas da Unitrac + ponte, que é o regime da produção. 16/09 está na fronteira da janela.
2. **16/09 é anômalo e não deve entrar como evidência.** No `dump-16` há 186 pendentes "VEÍCULO SEM MOVIMENTO NO DIA" + 36 "SEM DADO DE GPS" (222 de 308 pendentes; a categoria "outra" da saída do CLI), enquanto o KPI em produção nesse dia (`scratchpad/hist/kpi16post.xlsx`) não tem nenhum status "SEM MOVIMENTO". O GPS bruto de 16/09 está completo (`posicoes_historico`: 353-354 veículos reportando em todas as 24 horas). Hipótese, NÃO verificada: paradas parciais da Unitrac na fronteira de 48 h combinadas com o flag de apagão de sinal em `resolverParadas` (`if (apagaoDeSinal && daUnitrac.length > 0) return daUnitrac`).
3. **Condição 1 sem o dia 16:** com só 15/09 (6,0%) e 17/09 (20,4%) a mediana é 13,2%, ainda abaixo de 30%. O NO-GO provisório se mantém pela regra do plano, mas a evidência é fraca: só 1 dia (17/09) é comparável à produção, o gabarito cobre 7 entregues + 2 sem evidência (n minúsculo) e o resultado não mede o regime real.
4. **Pista para a próxima hipótese (não conclusão):** em 17/09, 97,2% dos "passou sem parar" (35 de 36) têm parada órfã a até 1500 m, e 36,8% das "parada 500m-2km" (21 de 57).
5. **Recomendação metodológica:** experimentos futuros precisam de dumps do MESMO regime da produção: gerados dentro de 48 h do dia ou, melhor, salvos automaticamente toda noite junto com a foto dos alvos da Unitrac, formando um conjunto histórico comparável e associado aos rótulos da Ana.

6. **Deriva de versão do código.** A guarda territorial só entrou em produção em 13/09, então os dias de produção 09–11/09 rodaram um motor diferente do reprocessado hoje; comparar a taxa reprocessada com a de produção nesses dias mistura efeito de versão com efeito de "sem alvos".
7. **Regime da guarda de GPS próprio.** O script do gerador é 100% sequencial e, por isso, os dumps já foram produzidos no regime em que a guarda `validarParadasContraGpsProprio` age em todas as placas (regime pós-limite-de-concorrência), enquanto a produção atual pula essa guarda nas placas em que a chamada à ponte devolve HTTP 500 (fail-open).

### Curva de sensibilidade de `raioReivindicadaM` (pendentes com órfã a 1500 m)

Rodada com `RAIO_REIVINDICADA_M` = 200, 400, 800 (padrão) e 1500 m; % de pendentes com órfã a 1500 m:

| raioReivindicadaM | 09/09 | 11/09 | 15/09 | 16/09 | 17/09 |
|---|---|---|---|---|---|
| 200 m | 14,9% | 15,5% | 16,1% | 5,5% | 30,7% |
| 400 m | 11,9% | 14,5% | 12,6% | 3,2% | 28,1% |
| 800 m (padrão) | 10,1% | 10,1% | 7,6% | 2,6% | 24,1% |
| 1500 m | 5,2% | 6,7% | 5,7% | 1,3% | 19,3% |

Os números conferem com os obtidos pelo revisor. Isso ENFRAQUECE o NO-GO mas não o inverte: a mediana de 15–17/09 sobe de 7,6% (800 m) para 16,1% (200 m), ainda abaixo dos 30%. A métrica de 6,0% da condição 1 (exclusivas a 800 m) não é diretamente comparável com a curva, que mede "com órfã" e não "exclusivas"; o que a curva mostra é que, afrouxando o raio de reivindicação, a mediana de "com órfã" de 15–17/09 sobe de 7,6% (800 m) para 16,1% (200 m). Viés a ter em mente: com `raioReivindicadaM` fixo em 800 m, a 500 m só pode aparecer órfã para pendente a >300 m de toda NF confirmada, por isso 4 dos 5 dias dão 0,0% a 500 m.

## Proposta de reformulação do portão (para congelar ANTES do próximo experimento)

A condição 1 mede todos os pendentes, mas 17–79% deles (39,6%, 37,4%, 43,2%, 79,2% e 17,4% em 09, 11, 15, 16 e 17/09; o 79,2% é o dia anômalo de 16/09) são categorias que a regra nunca deve tocar ("não foi ao cliente", "ilha", "sem confirmação", "sem movimento", "sem dado de GPS"). Proposta: medir o portão só nas categorias-alvo "parada 500m-2km", "passou sem parar" e "coordenada imprecisa". Números por dia, a 1500 m e raio de reivindicação 800 m (saída do CLI), como `com órfã / pendentes`:

| Dia | parada 500m-2km | passou sem parar | coordenada imprecisa | Total-alvo |
|---|---|---|---|---|
| 09/09 | 20/53 (37,7%) | 0/0 | 7/109 (6,4%) | 27/162 (16,7%) |
| 11/09 | 21/53 (39,6%) | 0/0 | 9/133 (6,8%) | 30/186 (16,1%) |
| 15/09 | 17/66 (25,8%) | 0/0 | 7/114 (6,1%) | 24/180 (13,3%) |
| 16/09 | 5/15 (33,3%) | 0/0 | 3/49 (6,1%) | 8/64 (12,5%) |
| 17/09 | 21/57 (36,8%) | 35/36 (97,2%) | 9/130 (6,9%) | 65/223 (29,1%) |

Isto é uma PROPOSTA que só vale se for congelada antes de rodar em dumps do regime da produção: não reinterprete o NO-GO atual com um critério escolhido depois de ver o resultado. A decisão continua "NO-GO provisório com evidência fraca".

## Decisão

| Condição | Meta | Medido | Status |
|---|---|---|---|
| 1. Mediana pendentes com órfã exclusiva | ≥ 30% | 6,0% | FALHA |
| 2. Recall gabarito | ≥ 70% | 28,6% (n=7) | FALHA |
| 3. Falso-confirmado gabarito | ≤ 15% | 50% (n=2) | FALHA (amostra mínima) |
| 4. Precisão da amostra da Ana | ≥ 80% em ≥ 30 pares | AGUARDANDO validação da Ana (o usuário vai trazer as respostas) | pendente |

**NO-GO provisório com evidência fraca: reabrir com dumps no regime da produção.** As condições 1 e 2 falham por larga margem (6% contra 30%; 29% contra 70%), então mesmo precisão 100% na amostra da Ana não reverte: o teto do ganho seria mediana 6,0% × 100% de precisão × ~300 pendentes / ~2100 NFs, isto é, cerca de +0,9 p.p. na taxa identificada (com precisão 80%, cerca de +0,7 p.p.); no melhor dia (17/09, 20,4%) o teto seria ~+2,7 p.p. (100%) ou ~+2,1 p.p. (80%). Ganho da mediana é pequeno demais para justificar a regra.

O que falta para fechar: as respostas da Ana à amostra (condição 4), que só mudariam o valor do ganho, não a decisão, a menos que se argumente que o gabarito (n=7) é pequeno demais para valer; nesse caso ampliar o gabarito antes de desistir.

Próximas hipóteses se o NO-GO for confirmado: coordenada aprendida a partir de paradas confirmadas; desambiguação de ruas homônimas no mesmo bairro (cada uma com plano próprio).
