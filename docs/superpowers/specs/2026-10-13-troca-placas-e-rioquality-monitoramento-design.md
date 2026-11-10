# Troca de placas (3 modos) + Rio Quality no mapa de Monitoramento — Design

**Data:** 2026-10-13
**Origem:** reclamações da operação (Tia Erica) via WhatsApp, 13/10.

## Problema

Duas frentes, ambas na operação ao vivo:

1. **Troca de carga só tem um modo.** Hoje o "carro trocado / redirecionar carga" (tela Ao vivo) só faz **redirecionar uma carga de A → B** (um sentido). Quando dois caminhões **trocam a carga entre si** (A↔B), não dá: depois de mover a carga do A pro B, o B já é reconhecido com a carga do A e não há como mover a carga original do B pro A. A operação precisa **escolher o modo** ao clicar.

2. **Rio Quality não aparece no mapa de Monitoramento.** No banco do monitoramento (`transmonseg`), a Rio Quality está cadastrada e ativa (`cod_user_unitrac=598`, 121 veículos) e tem **118 posições GPS frescas** — mas **zero romaneio** (`romaneio_pontos` de hoje são 100% Nutry Max). O mapa, no modo "Romaneio", só mostra veículos com romaneio do dia; logo a RQ aparece zero. A Nutry Max funciona (tem romaneio + GPS).

## Objetivo

- Troca de carga com **3 modos à escolha** ao clicar, válida para **Nutry Max e Rio Quality**.
- **Rio Quality aparecer no mapa de Monitoramento** no modo Romaneio, como a Nutry Max.

## Fora de escopo

- A instabilidade da ponte Fusion (tratada à parte).
- Redesenho do mapa de monitoramento.
- O incidente do `fonte` (já corrigido).

---

## Frente A — Troca de carga com 3 modos

### Estado atual (como funciona hoje)

- UI: `src/app/painel/ao-vivo/page.tsx` — `RedirecionarCarga` (:677) e `TrocasSugeridas` (:633), renderizados **só para `cliente === 'nutrimax'`** (:285, :288).
- Rota: `POST /api/kpi/ao-vivo/troca` (`src/app/api/kpi/ao-vivo/troca/route.ts`) — recebe `{carga, placaEscala, placaReal}`, grava em `kpi_troca_placa` (1 linha = 1 carga num sentido), chama `trocarNoMonitoramento` (move as NFs da carga de `placaDe → placaPara`) e recalcula. Gate `acessoAoVivo('nutrimax')` (:18).
- Serviço: `src/lib/kpi-romaneio/trocas-placa.ts` (`decidirTrocaManual`, `aplicarTrocasDePlaca`).
- Modelo: `kpi_troca_placa (empresa, data, carga nullable, placa_escala, placa_real, responsavel)`. Sem UNIQUE. `carga` nulo = vale pra todas as cargas da placa.

### Causa-raiz da limitação

- Modelo **unidirecional por carga**; não existe "troca mútua".
- A UI monta as opções a partir das placas **já recalculadas com a troca aplicada** (:678), então após o 1º lado a placa de destino re-rotula e o 2º lado fica ambíguo.
- Fallback frágil: se as NFs da carga não casam, `trocar-veiculo` move a **placa inteira** (route.ts).

### Desenho

Ao acionar a troca, a operação escolhe **1 de 3 modos**:

1. **Redirecionar (um sentido)** — comportamento atual: a carga selecionada de A vai pra B. (mantém)
2. **Troca mútua (A↔B)** — dois caminhões trocam: as cargas de A vão pra B **e** as de B vão pra A, numa operação **atômica**, sempre ancorada nas **placas de escala original** (nunca no estado já trocado). No monitoramento, move os dois conjuntos de NFs na ordem certa (sem o fallback de placa inteira).
3. **Substituir placa** — a placa A não saiu; **as cargas atuais de A saem e entram as da placa B** (troca em nível de placa). Equivale a trocar a placa A pela B para todas as cargas.

Regras comuns:
- Ancorar sempre na **escala original** (guardar/usar a placa de escala de cada carga), não no estado recalculado — elimina a ambiguidade do 2º lado.
- Endurecer a ponte do monitoramento: quando o modo exigir mover NFs específicas e elas não forem achadas, **falhar explicitamente** em vez de mover a placa inteira silenciosamente.
- **Estender para Rio Quality**: remover o gate `nutrimax`-only (UI + rota). Verificar que o romaneio RQ guardado em `kpi_ao_vivo_dia` tem os campos necessários (`placa`, `carga`/equivalente, `nf`); se a RQ não tiver conceito de "carga", a troca RQ opera em **nível de placa** (modos 1-only-placa e 3).

### Dados

- Reusar `kpi_troca_placa`. Uma troca mútua = duas linhas por carga, aplicadas juntas e ancoradas na escala original. "Substituir placa" = linha(s) com `carga` nulo (vale pra placa toda).
- Avaliar (no plano) um `UNIQUE (empresa, data, carga)` + upsert para deixar "a última vence" explícito, sem quebrar o modo placa (carga nulo).

### Contrato da rota

`POST /api/kpi/ao-vivo/troca` ganha `modo: 'redirecionar' | 'mutua' | 'substituir'` e, para `mutua`/`substituir`, a **segunda placa** (`placaB`). Resposta mantém `{ok, acao, monitoramento}`; para mútua retorna o resultado dos dois lados.

---

## Frente B — Rio Quality no mapa de Monitoramento

### Causa-raiz

A ponte KPI→monitoramento (`enviarAoMonitoramento`, `src/lib/kpi-romaneio/enviar-monitoramento.ts`) **nunca roda para a Rio Quality**: a rota `/api/kpi/ao-vivo/romaneio` (`route.ts:24-35`) trata o caminho `rioquality` e **retorna antes** de chamar a ponte (que só roda no caminho Nutry Max, :66-71). Logo a RQ não gera `romaneio_pontos` no monitoramento e o mapa (modo Romaneio, filtra `romaneio_data = hoje`) mostra zero carro. Risco adicional de **data**: o parser genérico do monitoramento pode fixar `romaneio_data` numa data do conteúdo diferente de hoje.

### Desenho

Fazer o romaneio da Rio Quality (placas + NFs + pontos de entrega já geocodificados que o KPI tem em `kpi_ao_vivo_dia`) chegar ao monitoramento **com a data fixada em "hoje" (America/Sao_Paulo)**, para os veículos RQ ganharem `tem_romaneio_hoje` e aparecerem no modo Romaneio — como a Nutry Max (118 carros já têm GPS lá).

Mecanismo (decisão no plano): endpoint estruturado no monitoramento que recebe `{cliente: 'rioquality', data, pontos: [{placa, nf, lat, lng}]}` e insere em `romaneio_pontos` (casando placa→veiculo pela frota RQ), **com `romaneio_data` = a data recebida** (não re-parsear/re-inferir). O KPI chama esse endpoint na sincronização da RQ (manual e no tick), autenticado por `x-motor-key`/`MOTOR_SECRET`.

### Pré-requisito já confirmado

RQ cadastrada e ativa no monitoramento (`clientes.cod_user_unitrac=598`), 118 posições GPS frescas. Em modo "Tudo" os carros RQ já aparecem; o que falta é o romaneio (modo Romaneio).

---

## Testes (a detalhar no plano)

- Troca: cada modo (redirecionar/mútua/substituir) aplica as placas certas no Ao vivo e manda as NFs certas ao monitoramento; mútua ancorada na escala original não embola; substituir troca em nível de placa; modo funciona para nutrimax e rioquality.
- RQ monitoramento: a sincronização da RQ gera `romaneio_pontos` com `romaneio_data = hoje`; veículos RQ ficam com `tem_romaneio_hoje`; data do documento não sobrescreve a data enviada.

## Review Focus

- Troca mútua com NFs não encontradas: deve falhar explícito, nunca mover placa inteira.
- Data da RQ: documento com data antiga não pode zerar os carros (sempre usar a data enviada = hoje).
- RQ sem campo "carga": troca RQ cai pra nível de placa sem quebrar.
- Idempotência: reenviar o romaneio RQ do dia não duplica `romaneio_pontos`.
