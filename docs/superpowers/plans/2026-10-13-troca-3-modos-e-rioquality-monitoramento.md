# Troca de placas (3 modos) + Rio Quality no Monitoramento — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Goal:** Dar à operação 3 modos de troca de carga (redirecionar / mútua / substituir placa) nos dois clientes, e fazer os carros da Rio Quality aparecerem no mapa de Monitoramento.

**Architecture:** Duas frentes independentes. Frente B (Rio Quality): o KPI passa a enviar o romaneio da RQ ao Monitoramento por um endpoint estruturado novo, com a data fixada em "hoje" (SP). Frente A (troca): a rota e a UII de troca ganham um parâmetro `modo` e a lógica de serviço ancora as trocas nas placas de escala original.

**Tech Stack:** Next.js 16 (App Router) + TS + Vitest (KPI e Monitoramento), Postgres self-hosted (KPI via Supabase/PostgREST; Monitoramento via `pg` cru), auth servidor-a-servidor por `x-motor-key`/`MOTOR_SECRET`.

**Spec:** `docs/superpowers/specs/2026-10-13-troca-placas-e-rioquality-monitoramento-design.md`

**Repos:**
- KPI: `/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg`
- Monitoramento: `/Users/joaquimsalles/Projects/Transmonseg/monitoramento/MONITORAMENTO transmonseg`

## Global Constraints

- TEMP + definitivo sempre espelhados e pushados juntos (KPI e Monitoramento têm seus pares TEMP).
- Datas sempre em `America/Sao_Paulo`: KPI `hojeBR()` (`src/lib/data-br.ts`), Monitoramento `hojeSP()`.
- Auth das rotas servidor-a-servidor: header `x-motor-key` == `process.env.MOTOR_SECRET`.
- Nada de migration sem recarregar o schema cache do PostgREST (vale pro KPI/Supabase); o Monitoramento usa `pg` cru, sem esse passo.
- `next build` roda `tsc` do código de app (não dos `.test.ts`); manter tipos limpos.

## Review Focus

- Troca mútua com NFs não encontradas no romaneio do dia: deve **falhar explícito**, nunca mover a placa inteira (hoje `route.ts` cai no fallback de placa inteira). — Task A2.
- Data da RQ: documento/entregas com data diferente de hoje não pode zerar os carros; o receptor usa SEMPRE a data enviada. — Task B1.
- Idempotência: reenviar o romaneio RQ do dia (tick a cada 10 min) não pode duplicar `romaneio_pontos`. — Task B1.
- RQ sem campo "carga": a troca RQ opera em nível de placa sem quebrar. — Task A3.
- Pontos RQ sem lat/lng (geocode falhou): não entram como ponto válido, mas não derrubam o envio. — Task B2.

---

# Frente B — Rio Quality no mapa de Monitoramento

Independentemente testável e é o que "faz a Rio Quality funcionar". Fazer primeiro.

### Task B1: Monitoramento — endpoint que recebe o romaneio estruturado da RQ

**Files:**
- Create: `src/app/api/romaneio/rioquality/route.ts` (repo Monitoramento)
- Test: `src/app/api/romaneio/rioquality/route.test.ts`
- Referência de padrões: `src/app/api/romaneio/upload/route.ts` (auth `x-motor-key` linhas ~102-106; casamento placa→`veiculo_id` por placa normalizada ~213-226; `hojeSP()` ~29-31), `src/app/api/romaneio/trocar-veiculo/route.ts` (contrato de resposta `{ok, pontos, erro}`).

**Interfaces:**
- Consome: POST JSON `{ data: string (YYYY-MM-DD), pontos: Array<{ placa: string; nf: string; lat: number; lng: number }> }`, header `x-motor-key`.
- Produz: `{ ok: true, inseridos: number, placasNaoEncontradas: string[] }` ou `{ ok:false, erro }` (status 401 sem key, 400 payload inválido).

**Comportamento:**
- Autenticar por `x-motor-key` == `MOTOR_SECRET` (copiar de `upload/route.ts`).
- Resolver `cliente_id` da Rio Quality por `cod_user_unitrac='598'` (mesma query do mapa; NÃO hardcodar o UUID).
- Para cada ponto: normalizar a placa (mesma `normalizarPlaca` do upload), achar `veiculo_id` em `veiculos (cliente_id RQ, ativo)`; placa sem veículo → acumular em `placasNaoEncontradas`, não inserir.
- Inserir em `romaneio_pontos` com `romaneio_data = data` (a recebida, nunca inferida), `modo_teste=false`, `veiculo_id`, `nf`, `lat`, `lng`. Pontos sem `lat/lng` são ignorados.
- **Idempotência:** antes de inserir, apagar os pontos RQ daquele `romaneio_data` (`delete from romaneio_pontos where romaneio_data=$1 and veiculo_id in (veiculos da RQ)`) e reinserir — reenvio do dia não duplica.

- [ ] **Step 1: Teste — 401 sem x-motor-key.** POST sem header → 401. Rodar, ver falhar (rota não existe), implementar o guard, passar.
- [ ] **Step 2: Teste — insere pontos e casa placa→veiculo.** Seed de 1 veículo RQ (placa conhecida). POST com 2 pontos (1 placa conhecida, 1 desconhecida) → `{ok:true, inseridos:1, placasNaoEncontradas:[<desconhecida>]}`; linha em `romaneio_pontos` com `romaneio_data` = a enviada.
- [ ] **Step 3: Teste — idempotência.** Dois POSTs iguais → total de `romaneio_pontos` do dia não dobra.
- [ ] **Step 4: Teste — data respeitada.** `data` = ontem → a linha fica com `romaneio_data` = ontem (prova que não usa `hojeSP()`).
- [ ] **Step 5: Implementar a rota** (seguindo os padrões citados). Rodar os 4 testes → passam.
- [ ] **Step 6: Commit** (`feat(romaneio): endpoint estruturado rioquality`). Espelhar no MONITORAMENTO TEMP.

### Task B2: KPI — montar os pontos RQ e enviar ao Monitoramento

**Files:**
- Create: `src/lib/kpi-rioquality/enviar-monitoramento-rq.ts` (repo KPI)
- Test: `src/lib/kpi-rioquality/enviar-monitoramento-rq.test.ts`
- Modify: `scripts/kpi-ao-vivo-tick.ts` (função `sincronizarFusionRioQuality`, ~:23-37) — após guardar o dia, enviar os pontos.
- Modify: `src/app/api/kpi/ao-vivo/romaneio/route.ts` (ramo `rioquality`, ~:24-35) — enviar também no upload manual, antes do `return`.
- Referência: de onde sai o lat/lng dos pontos RQ — conferir em `src/lib/kpi-rioquality/*` e `calcularAoVivo` como a RQ é geocodificada; usar os pontos já com coordenada (não a entrega crua da Fusion sem lat/lng).

**Interfaces:**
- Produz: `enviarRioQualityAoMonitoramento(data: string, pontos: Array<{placa:string; nf:string; lat:number; lng:number}>): Promise<{ok:boolean; inseridos?:number; erro?:string}>` — POST para `${MONITORAMENTO_URL ?? 'http://127.0.0.1:3010'}/api/romaneio/rioquality` com `x-motor-key`, `AbortSignal.timeout(20_000)`. **Fail-open:** nunca lança (retorna `{ok:false, erro}`), igual às outras pontes do tick.
- Consome: a lista de pontos RQ já geocodificados do dia (placa + nf + lat + lng).

- [ ] **Step 1: Teste — monta o POST certo.** Stub `fetch`; chamar com 2 pontos e `data` → verifica URL, header `x-motor-key`, body `{data, pontos}`. Pontos sem lat/lng são filtrados fora.
- [ ] **Step 2: Teste — fail-open.** `fetch` rejeita → retorna `{ok:false}` sem lançar.
- [ ] **Step 3: Implementar `enviar-monitoramento-rq.ts`.** Rodar testes → passam.
- [ ] **Step 4: Fiar no tick.** Em `sincronizarFusionRioQuality`, depois do `guardarDiaAoVivo`, obter os pontos RQ geocodificados do dia e chamar `enviarRioQualityAoMonitoramento(data, pontos)`; logar resultado (sem derrubar o tick). Teste do tick (`scripts/kpi-ao-vivo-tick.fusion.test.ts`) atualizado: quando a sincronização RQ roda, a função de envio é chamada com `data`.
- [ ] **Step 5: Fiar no upload manual.** No ramo `rioquality` da rota, antes do `return`, chamar o envio com os pontos do dia e `data`. Teste da rota (`.../romaneio/route.test.ts` se houver, senão criar o caso) cobrindo a chamada.
- [ ] **Step 6: Commit** (`feat(fusion): enviar romaneio RQ ao monitoramento com data fixa`). Espelhar no KPI TEMP.

---

# Frente A — Troca de carga com 3 modos (Nutry Max + Rio Quality)

### Task A1: Serviço — lógica dos 3 modos ancorada na escala original

**Files:**
- Modify: `src/lib/kpi-romaneio/trocas-placa.ts` (`decidirTrocaManual` ~:98-109; adicionar `decidirTroca(modo, ...)`)
- Test: `src/lib/kpi-romaneio/trocas-placa.test.ts`

**Interfaces:**
- Produz: `type ModoTroca = 'redirecionar' | 'mutua' | 'substituir'`.
- Produz: `decidirTroca(modo: ModoTroca, params): { linhas: Array<{placaEscala:string; placaReal:string; carga?:string}>; movimentos: Array<{de:string; para:string; carga?:string}> } | { erro: string }` — onde `linhas` são as linhas a gravar em `kpi_troca_placa` e `movimentos` o que mandar ao monitoramento. **Sempre ancorado na placa de escala original**, nunca no estado recalculado.
  - `redirecionar`: 1 linha (carga de A→B), 1 movimento. (equivale ao atual)
  - `mutua`: para A↔B — 2 conjuntos de linhas/movimentos (cargas de A→B e cargas de B→A), ambos pela escala original.
  - `substituir`: nível placa (carga nula) — todas as cargas de A→B e todas de B→A (ou só A→B se "a placa A não saiu e B assumiu"; confirmar a semântica exata do cliente: "as cargas atuais de A saem e entram as de B" = swap de placa completo A↔B).

- [ ] **Step 1: Teste `redirecionar`** reproduz o comportamento atual (1 linha, 1 movimento A→B).
- [ ] **Step 2: Teste `mutua`** gera 2 linhas/movimentos ancorados na escala original; aplicar os dois não re-rotula de forma a desfazer o 1º lado.
- [ ] **Step 3: Teste `substituir`** troca em nível de placa (carga nula), A↔B completo.
- [ ] **Step 4: Implementar `decidirTroca` + `ModoTroca`.** Rodar → passam. Manter `decidirTrocaManual` ou reescrever chamando `decidirTroca('redirecionar',...)`.
- [ ] **Step 5: Commit** (`feat(troca): decidirTroca com 3 modos`). Espelhar no KPI TEMP.

### Task A2: Rota — aceitar `modo`/`placaB`, aplicar e endurecer a ponte

**Files:**
- Modify: `src/app/api/kpi/ao-vivo/troca/route.ts` (POST ~:17-51; `trocarNoMonitoramento` ~:64-78; `nfsDaCarga` ~:55-62)
- Test: `src/app/api/kpi/ao-vivo/troca/route.test.ts` (criar se não houver)

**Interfaces:**
- Consome: body `{ modo?: ModoTroca; carga?; placaEscala?; placaReal?; placaB? }`. `modo` default `'redirecionar'` (compat). `mutua`/`substituir` usam `placaB`.
- Produz: `{ ok, modo, movimentos: Array<{de,para,monitoramento:{ok,pontos?,erro?}}> }`.

- [ ] **Step 1: Teste — `redirecionar` mantém o comportamento atual** (grava 1 linha, 1 POST ao monitoramento). Stubs de supabase e fetch.
- [ ] **Step 2: Teste — `mutua`** grava as 2 linhas e faz os 2 `trocar-veiculo` com as NFs certas de cada carga.
- [ ] **Step 3: Teste — NFs não encontradas → erro explícito.** Quando `nfsDaCarga` volta vazio num modo que exige NFs, a rota responde erro (400/409) e NÃO chama o fallback de placa inteira. (remover/guardar o fallback atual de `route.ts` que manda sem `nfs`).
- [ ] **Step 4: Teste — `substituir`** (nível placa).
- [ ] **Step 5: Implementar** usando `decidirTroca`. Aplicar `linhas` em `kpi_troca_placa`; para cada `movimento`, `trocarNoMonitoramento` com as NFs da carga (ou da placa). Recalcular `calcularAoVivo` do cliente.
- [ ] **Step 6: Commit** (`feat(troca): rota com modo e ponte endurecida`). Espelhar no TEMP.

### Task A3: UI — seletor de modo + liberar para Rio Quality

**Files:**
- Modify: `src/app/painel/ao-vivo/page.tsx` — `RedirecionarCarga` (~:677-724) vira seletor de modo; gate `cliente === 'nutrimax'` (~:285, :288) liberado para `rioquality` também; `acesso` da rota (`src/app/api/kpi/ao-vivo/troca/route.ts` ~:18 e `.../acesso.ts`) aceitar o cliente da requisição.
- Test: componente/render conforme padrão de testes de UI do repo (se houver; senão, cobrir a lógica de montagem do payload numa função pura testável).

**Interfaces:**
- Consome: `decidirTroca`/rota com `modo`.

- [ ] **Step 1:** Extrair a montagem do payload de troca para uma função pura `montarPayloadTroca(modo, selecao, placaB)` e testá-la (os 3 modos → body certo).
- [ ] **Step 2:** UI: ao acionar, mostrar os 3 modos (Redirecionar / Troca mútua / Substituir placa); para mútua/substituir, pedir a 2ª placa. POST com `modo`.
- [ ] **Step 3:** Liberar o gate para `rioquality` (UI + `acessoAoVivo`); se a RQ não tiver `carga` no romaneio guardado, só habilitar os modos em nível de placa (substituir e redirecionar-placa).
- [ ] **Step 4:** Rodar a suíte relevante; validar manualmente no painel.
- [ ] **Step 5: Commit** (`feat(troca): seletor de modo na UI + Rio Quality`). Espelhar no TEMP.

---

## Ordem de execução sugerida

1. B1 → B2 (faz a Rio Quality aparecer no mapa).
2. A1 → A2 → A3 (troca 3 modos).

Cada task termina com deliverable testável e commit. Deploy: migrations (se houver) + recarregar schema cache do PostgREST (KPI) + `deploy.sh` do KPI + deploy do Monitoramento; validar ao vivo.
