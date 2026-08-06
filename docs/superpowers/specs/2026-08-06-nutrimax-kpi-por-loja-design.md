# Nutry Max — "Gerar KPI" por loja

## Contexto

Hoje o "Gerar KPI" da Nutry Max (`/api/kpi/nutrimax/gerar`) gera uma linha por **carga/placa** (agregado — peso, entregas planejadas, NFs planejados, km, início/fim de viagem), sem granularidade por loja. Quem lista cliente por cliente hoje é só o "Gerar Romaneio", e mesmo assim depende do upload manual de um segundo PDF (Romaneio de Entrega) e casa a confirmação de entrega via geofence bruta (`buscarPontos` + clustering de GPS).

O cliente quer que o "Gerar KPI" da Nutri passe a ter o mesmo formato do KPI do Benassi: uma linha por loja, com saída/chegada de base, chegada/saída da loja, tempos e km — **sem exigir upload extra**.

## Descoberta que muda o desenho

Testado ao vivo contra a conta real da Nutry Max (113 veículos, `COD_USER_NUTRIMAX = '4096'`) em 2026-08-06: o endpoint `/mapa_servicos/alvos` (`buscarAlvos()`, já implementado em `src/lib/unitrac-api/alvos.ts` e já usado pelo KPI do **Benassi** em `src/app/api/kpi/simples/route.ts`) devolve, por veículo, a lista de entregas do dia com **nome da loja, nota fiscal (`documento`), situação (feito/pendente/outro) e hora de conclusão (`feitoISO`)** — já preenchido pra Nutry Max:

- 2015 alvos no momento do teste, **100% com NF preenchida**.
- 1241/2015 já confirmados (`situacao === 1`) com `feitoISO` real.
- Nomes de loja reais (restaurantes, açougues, padarias, postos — bate com o perfil de cliente pulverizado da Nutry Max).

Isso elimina a necessidade de geocodificar a planilha de clientes ou de exigir o Romaneio como segundo upload — o próprio Unitrac já entrega a granularidade por loja, do mesmo jeito que já sustenta o KPI do Benassi.

**Duas ressalvas confirmadas no teste, que o desenho abaixo assume como limitação conhecida da fonte (não como bug a corrigir):**

1. `inicioISO` ("início da rota") é um **horário fixo agendado** (idêntico pra toda a frota no dia, ex. `07:00:00`), não uma medição real — **não serve** pra "saída da base". Saída/chegada de base continuam vindo do GPS clusterizado (`consolidaParadasApi`), como já é hoje.
2. Quando várias lojas ficam geograficamente próximas, o Unitrac às vezes confirma várias de uma vez com o mesmo timestamp (diferença de milissegundos) — "confirmação em lote/proximidade", não um scan individual. Mesmo padrão já documentado no código do Benassi (`EntradaNutrimax.status`, comentário sobre `situacao=98`). O desenho não tenta "consertar" isso — mostra a hora que a API deu.

Também existe já um par de módulos "mortos" (`src/lib/kpi-nutrimax/matcher.ts` + `gerador.ts`, sem caller em nenhuma rota ativa) que já implementava exatamente esse padrão de join — `cruzaRomaneioAlvosNutrimax()` casa linhas do Romaneio com `alvos` por `placaNorm:documento`. O desenho abaixo reaproveita esse padrão de join (`statusPorSituacao`, chave `placaNorm:documento`), mas troca a origem das linhas: em vez de vir do Romaneio (upload extra), vem dos próprios `alvos` agrupados por placa — o Romaneio deixa de ser necessário pra essa tela.

## Escopo

Só o **"Gerar KPI"** da Nutry Max (`/api/kpi/nutrimax/gerar` + `src/app/painel/nutrimax/gerar/page.tsx`). O "Gerar Romaneio" (upload de Escala + Romaneio, conferência por cliente com endereço) **não muda** — continua como está, gerando arquivo.

A tabela por-carga que existe hoje no "Gerar KPI" é **substituída** pela tabela por-loja (confirmado com o usuário) — não fica como aba extra.

## Arquitetura

```
Escala de Rota (PDF, upload — já obrigatório hoje)
  → parseEscalaNutrimax()  →  LinhaEscalaNutrimax[]   (placa, motorista, carga, destino, ENT/NF planejado)
                                        │
Unitrac API (COD_USER_NUTRIMAX)        │
  buscarFrota → cvs                    │
  buscarAlvos(cvs)  →  AlvoApi[]       │   (nome loja, NF, situação, feitoISO — por placa)
  buscarStopsCru + consolidaParadasApi │   (GPS clusterizado: BASE / LOJA / FORA_BASE, já existe)
                                        │
                                        ▼
                         montaKpiLojaNutrimax(escala, alvos, paradasGps)
                                        │
                         enriquecerComKmReal()  (ORS, já implementado)
                                        │
                                        ▼
                         gerarKpiLojaXlsx()  →  KPI-Nutry-Max-{data}.xlsx
                                        │
                                        ▼
                         salvarGeracao()  (kpi_nutrimax_geracoes + Storage, já existe)
```

## Componentes novos/alterados

- **`src/lib/kpi-nutrimax/types.ts`** — novo tipo `LinhaKpiLojaNutrimax` (ver colunas abaixo).
- **`src/lib/kpi-nutrimax/kpi-loja.ts`** (novo) — `montaKpiLojaNutrimax(escala, alvos, paradasGps): LinhaKpiLojaNutrimax[]`. Substitui `montaKpiViagemPorCarga` como o que a rota `gerar/route.ts` chama (o arquivo `kpi-viagem.ts` atual pode ficar, sem caller, ou ser removido — decidir no plano).
- **`src/lib/kpi-nutrimax/gerador-kpi-loja.ts`** (novo) — Excel com as colunas na ordem pedida, reaproveitando o estilo visual de `gerador-kpi-viagem.ts`.
- **`src/app/api/kpi/nutrimax/gerar/route.ts`** — passa a chamar `buscarFrota`/`buscarAlvos` (hoje só chama `buscarResumosViagemViaApi`, que é GPS puro); monta linhas por loja em vez de por carga.
- **`src/lib/unitrac-api/alvos.ts`** — sem mudança (já pronto, só passa a ser usado também pela Nutry Max).

## Colunas da tabela (ordem confirmada)

| # | Coluna | Fonte |
|---|---|---|
| 1 | Loja | `alvos[].nome` |
| 2 | Motorista | Escala (`LinhaEscalaNutrimax.motorista`, casado por placa) |
| 3 | Placa | Escala / `alvos[].placaNorm` |
| 4 | Saída da base | GPS: primeiro evento `BASE` do dia pra essa placa |
| 5 | Chegada na loja | `alvos[].feitoISO` quando `situacao === 1`; senão vazio |
| 6 | Saída da loja | Próxima parada de GPS clusterizada após a chegada (mesmo princípio do clustering atual: saída de um cluster = chegada do próximo) |
| 7 | Tempo na loja | Saída da loja − Chegada na loja |
| 8 | Chegada na base | GPS: último evento `BASE` do dia pra essa placa (volta) |
| 9 | Tempo total da operação | Chegada na base − Saída da base |
| 10 | Quilometragem | Soma via ORS entre paradas sequenciais do dia (`enriquecerComKmReal`, já existe) |

## Tratamento de erro / ambiguidade

- **Alvo pendente** (`situacao !== 1`) sem GPS correspondente → linha aparece com "Chegada na loja" vazia e um marcador de status "pendente" (não confirmado) — não inventa horário, não esconde a loja.
- **Confirmação em lote** (timestamps idênticos entre lojas vizinhas) → aceito como está, sem tentativa de "desempatar"; é limitação documentada da fonte.
- **Placa da Escala sem nenhum alvo** (offline, sem rastreador, ou fora da conta) → linha(s) daquela placa aparecem com tudo vazio + status `sem_rastreador` (mesmo enum que já existe em `KpiViagemNutrimax.status`).
- **Contagem planejado × realizado** (ENT/NF da Escala vs qtd de linhas geradas por placa) → vira um aviso agregado no topo do relatório (mesmo espírito de `AvisoCoberturaNutrimax`, já existe o tipo), não bloqueia a geração.

## Testes

- Unitário pra `montaKpiLojaNutrimax`: dado escala+alvos+paradas sintéticos, produzir as linhas certas — casos: alvo confirmado com GPS correspondente, alvo pendente sem GPS, placa sem nenhum alvo (sem_rastreador), duas lojas com timestamp idêntico (lote) não devem quebrar o cálculo de "saída da loja" da seguinte.
- Reaproveita os testes existentes de `km-ors.ts`/`consolidaParadasApi` sem alteração (não mudam de comportamento).
- Teste manual: gerar KPI real pra uma data recente (hoje/ontem, dentro do `foraDoAlcanceApi`) e conferir contra o que já foi visualmente confirmado no teste ao vivo desta sessão.

## Fora de escopo (não mexer agora)

- "Gerar Romaneio" — continua como está.
- Geocodificação da planilha de 577 clientes — não é necessária pro match funcionar; pode voltar como enriquecimento futuro (endereço bonito no relatório) se o usuário pedir depois.
- Base cadastrada como constante em `constants.ts` — continua hardcoded (Penha + Campos), sem UI/tabela nova.
- Saída em tela ("Ver KPIs" style, como foi feito pro Benassi) — não foi pedido; a saída continua sendo arquivo Excel.
