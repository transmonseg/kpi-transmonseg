# Estado AO VIVO no beta (em rota / na base / entregue) — Design

**Data:** 2026-06-13
**Status:** aprovado ("só faz"), pronto pro plano
**Escopo:** ADIÇÃO no beta (KPI beta + Dashboard API beta). Normal NÃO é tocado.

## Problema (real, de hoje 13/06)

A operação PRECISA gerar o KPI cedo (madrugada/início da manhã). Mas o relatório
das 6:36 mostrou 151/164 "sem GPS" porque os caminhões ainda não tinham rodado.
Vira "mar de vermelho" e parece que "tudo deu erro" — quando na verdade só estava
cedo. Nenhum sistema mostra entrega futura, mas dá pra mostrar o ANDAMENTO honesto.

## Ideia

No beta (que usa a API ao vivo), classificar cada linha pelo ANDAMENTO em vez de
um "não foi" prematuro:

| Estado | Regra | 
|---|---|
| **ENTREGUE** | já casou entrega (parada na loja, geo, ou alvo/NF feito) |
| **EM_ROTA** | não entregou ainda, mas a placa SAIU da base (tem ≥1 parada FORA_BASE/LOJA hoje) |
| **NA_BASE** | não entregou e a placa NÃO saiu da base (só BASE / sem paradas) |
| **SEM_SINAL** | placa não está na frota da API (sem dado) |

O sinal "saiu da base" já é computado (helper `saiu`). É expor + mapear.

## Arquitetura

### Função pura (núcleo) — `src/lib/kpi/situacao-viva.ts` (novo)
```
type SituacaoViva = 'ENTREGUE' | 'EM_ROTA' | 'NA_BASE' | 'SEM_SINAL'
situacaoViva(args: { entregue: boolean; naApi: boolean; saiuDaBase: boolean }): SituacaoViva
```
- entregue → ENTREGUE
- !naApi → SEM_SINAL
- saiuDaBase → EM_ROTA
- senão → NA_BASE

Pura, testável, sem I/O.

### KPI beta (rota + tela)
- `src/app/api/kpi/beta/route.ts`: por linha, computa `situacaoViva` (entregue =
  status ENTREGUE/ENTREGUE_GEO ou tem parada com loja_id; naApi = placa na frota;
  saiuDaBase = helper já existente). Adiciona `situacaoViva` no preview.
- `src/app/painel/kpi/beta/page.tsx`: quando NÃO entregue, o selo mostra
  "Em rota" (azul) / "Na base" (cinza) / "Sem sinal" — em vez do vermelho de "não
  foi". Entregue segue como hoje.

### Dashboard API beta (fonte + agregação + tela)
- `src/lib/kpi/dashboard-api-fonte.ts`: a linha do dashboard ganha `situacaoViva`
  (calculada no `gerarDiaApi`). Persiste no JSON do dia.
- `src/app/api/dashboard/beta/route.ts` (GET): além das métricas, devolve a
  contagem por situação viva (entregue / em rota / na base / sem sinal).
- `src/app/painel/dashboard/beta/page.tsx`: mostra "X entregue · Y em rota · Z na
  base" no topo (andamento do dia). Re-puxar atualiza.

## Por que isso resolve

- Gerar cedo deixa de ser "tudo deu erro": vira andamento real.
- Re-puxar durante o dia move NA_BASE → EM_ROTA → ENTREGUE sozinho (API é viva).
- Não inventa entrega futura (impossível); só rotula honestamente o estado atual.

## Isolamento
- Normal (`/api/kpi/simples`, dashboard normal, `kpi_manual_entradas`) intocado.
- Só beta: rota/tela kpi beta + rota/fonte/tela dashboard beta + 1 módulo novo puro.

## Testes
- Unit puro de `situacaoViva` (4 ramos + combinações).
- Suíte existente verde.
- Validação: gerar dia 13 no beta e ver os 4 estados aparecerem.

## Não-objetivos (YAGNI)
- Não cria status "NÃO FOI" definitivo no beta cedo (sem evidência de conclusão).
  Fica EM_ROTA até entregar ou até o operador julgar. (Evita falso "não foi".)
- Não mexe no normal nem na lógica de `derivarStatus` de produção.
