# Melhorias do KPI a partir do Relatório Final da Ana (23-24/09) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os pontos concretos que a operação (Ana) apontou no KPI Nutry Max de 22-23/09: sem rastreador, parada curta confirmando endereços errados, transferência para placa fora do romaneio, resolução manual que some na regeração e falta de evidência exposta por NF.

**Architecture:** Mudanças no KPI (`KPI transmonseg`, repo definitivo; espelhar em `../KPI TEMP`). Nada na ponte de monitoramento, exceto se a Task 3 provar necessidade. Status automático continua sendo calculado igual; a resolução manual é uma camada NOVA que não apaga o automático.

**Tech Stack:** Next.js 16 (ler `node_modules/next/dist/docs/` antes de mexer em rota/página), TypeScript, Vitest, PostgREST/Postgres self-hosted (`kpi_transmonseg` no transmonseg-vps), exceljs no gerador.

**Spec:** Documentos da Ana (scratchpad da sessão, cópias em `~/ClaudeGerado/kpi-regen-0922/ana/` — copiar no início da execução): `Relatorio_Final_Nutry_Max.pdf` (seções 5 e 6 = requisitos P0/P1 e critérios de aceite), `Validacao_Romaneio_Paradas_KPI_22-09-2026.xlsx` (gabarito por código de cliente: 1.185 NFs), mensagens de 23/09 07:11 e 24/09 07:14-07:32 (DM).

## Global Constraints

- Fuso: convenção existente (ponte UTC real; KPI mascara BRT como UTC; feitoISO = dígitos BRT). Não criar conversão nova.
- Nunca mandar mensagem pra ninguém; deploy só com OK do usuário; TEMP + definitivo sempre juntos.
- Rótulos visíveis continuam em MAIÚSCULAS no padrão atual (`'ENTREGUE - ... - CONFERIR'`).
- Nenhuma mudança de regra de classificação vai pra produção sem medir contra o gabarito da Ana (1.185 NFs com código do cliente na parada da mesma placa, 22/09): chegada ≤2 min hoje = 79% (938), ≤10 min = 93% (1.103), sem horário = 29. Não pode piorar.
- Resolução manual NUNCA é sobrescrita por regeração; automático original sempre preservado.

## Review Focus

- Placa sem rastreador gerada DURANTE o dia (rota em andamento): deve sair "SEM RASTREADOR", não "AGUARDANDO" (Task 1 testa).
- Placa com rastreador mas sem nenhuma posição só ATÉ agora, dia em andamento: continua "AGUARDANDO" (não acusar equipamento cedo demais) (Task 1 testa).
- Parada curta compartilhada onde UM dos endereços é de fato o do cliente (a 30 m): esse continua ENTREGUE; só os outros perdem (Task 2 testa).
- Resolução manual registrada para NF que some do romaneio numa regeração: não pode dar erro nem apagar a resolução (Task 4 testa).
- Duas resoluções manuais para a mesma NF: vale a mais recente, histórico guarda as duas (Task 4 testa).

---

### Task 1: SEM RASTREADOR prevalece sobre AGUARDANDO e sai do denominador

Causa confirmada: `src/lib/kpi-romaneio/agregacao.ts:519-521` aplica `'AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO'` por último e sobrescreve `'SEM RASTREADOR - NENHUMA POSIÇÃO REPORTADA NO DIA - CONFERIR EQUIPAMENTO'` (L492-494). Caso de aceite: TTL5J17 em 23/09 (22 NFs, Cachoeiras de Macacu) — Ana: "5j17 está sem rastreador, não contabiliza".

**Files:**
- Modify: `src/lib/kpi-romaneio/agregacao.ts` (bloco das observações, ~L480-521)
- Modify: `src/lib/kpi-romaneio/gerador-xlsx.ts` (cálculo da taxa de confirmação — localizar com `grep -n "confirmado_gps" src/lib/kpi-romaneio/gerador-xlsx.ts`)
- Test: `src/lib/kpi-romaneio/agregacao.test.ts`, `src/lib/kpi-romaneio/gerador-xlsx.test.ts`

**Interfaces:**
- Produces: observação `'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO'` para a placa sem rastreador (`temRastreador === false`, ou `temRastreador` true mas zero posições no dia inteiro com o dia JÁ encerrado). NFs com essa observação ficam fora do numerador E do denominador da taxa; o resumo mostra a contagem à parte ("NFs sem rastreador: N").

- [ ] **Step 1: Testes que falham** — em `agregacao.test.ts`, usando os builders já existentes no arquivo (`grep -n "function " src/lib/kpi-romaneio/agregacao.test.ts` para achar o helper de linha/resumo): (a) `temRastreador=false`, `diaEmAndamento=true`, sem paradas → observação da placa sem rastreador, não AGUARDANDO; (b) `temRastreador=true`, `diaEmAndamento=true`, `paradasPorOutraPlaca.has(placa)` e zero paradas próprias → continua AGUARDANDO; (c) `temRastreador=false`, `diaEmAndamento=false` → observação sem rastreador. Em `gerador-xlsx.test.ts`: 10 NFs, 8 confirmadas, 2 sem rastreador → taxa = 8/8 = 100% e linha "NFs sem rastreador: 2".
- [ ] **Step 2:** `npx vitest run src/lib/kpi-romaneio/agregacao.test.ts src/lib/kpi-romaneio/gerador-xlsx.test.ts` → (a) e a taxa falham.
- [ ] **Step 3: Implementar** — no bloco final: `if (status === 'pendente' && diaEmAndamento && !semRastreadorNoDia) observacao = 'AGUARDANDO - ...'`, com `semRastreadorNoDia = !temRastreador`. No gerador, excluir do denominador as linhas cuja observação começa com `'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO'`.
- [ ] **Step 4:** suíte completa `npx vitest run` verde.
- [ ] **Step 5:** conferir no dado real: regenerar 23/09 em disco (Task 6 tem o comando) e ver TTL5J17 com 22 NFs rotuladas e fora da taxa. Se TTL5J17 tiver `cv` na frota (temRastreador=true), registrar no ledger e tratar pela regra "zero posições no dia inteiro com dia encerrado".
- [ ] **Step 6: Commit** `fix(kpi): placa sem rastreador nao vira AGUARDANDO e sai da taxa`

### Task 2: Parada curta compartilhada não confirma endereço que não é dela

Caso de aceite: RQQ5B81 / NF 2386225 (23/09) — KPI marcou `ENTREGUE - PARADA CURTA (ATÉ 3MIN) CONFIRMOU VÁRIOS ENDEREÇOS...`, equipe: "não esteve no local". Ana: 39 das 78 ressalvas de 23/09 são desse tipo.

**Files:**
- Modify: `src/lib/kpi-romaneio/agregacao.ts` (~L415-428, `enderecosPorChaveDeParada`)
- Test: `src/lib/kpi-romaneio/agregacao.test.ts`
- Create: `scripts/medir-contra-gabarito-ana.py` (medição; lê o xlsx da Ana e um xlsx do KPI)

- [ ] **Step 1: Diagnóstico real antes de codar** — para NF 2386225 e para as 39 de 23/09: no GPS bruto (`posicoes_historico`, ssh transmonseg-vps, só SELECT) e no relatório da Unitrac, medir distância entre a parada curta e CADA endereço do grupo. Registrar no ledger: em quantos grupos o endereço mais próximo está ≤150 m e os demais >300 m.
- [ ] **Step 2: Teste que falha** — grupo de 3 NFs com endereços distintos compartilhando a mesma visita (mesmo `chegada|saida`, duração ≤3 min); a parada está a 30 m do endereço A e a 600 m de B e C. Esperado: A = `ENTREGUE - PARADA CURTA ...` (mantém), B e C = `status 'pendente'` com observação `'PARADA CURTA DE OUTRO ENDEREÇO - NÃO CONFIRMA ESTE CLIENTE - CONFERIR'`. Segundo teste: todos a ≤150 m → os 3 mantêm o rótulo atual.
- [ ] **Step 3:** implementar usando a coordenada da parada (se `visita` não carrega lat/lng, usar a distância já calculada no fluxo — `grep -n "distPropria" agregacao.ts`); limiar: perdem confirmação os endereços do grupo a >300 m da parada quando existe outro endereço do grupo a ≤150 m.
- [ ] **Step 4:** `scripts/medir-contra-gabarito-ana.py <xlsx_ana> <xlsx_kpi>` imprime N, ≤2/≤10 min, sem horário e, para o subconjunto "ENTREGUE" do KPI, quantos a Ana marca como "SEM VÍNCULO". Rodar antes/depois em 22/09. Critério: métricas de horário não pioram; NFs removidas pela regra que a Ana tem com "CÓDIGO DO CLIENTE NA MESMA PLACA" ≤ 2 (senão afinar limiar, registrar a decisão).
- [ ] **Step 5:** suíte verde; commit `fix(kpi): parada curta compartilhada so confirma o endereco perto dela`

### Task 3: Transferência para placa fora do romaneio

Caso de aceite: RQU5J45 / NF 215999 (CD Supermercado Zona Sul) entregue por TUS1B06, placa que não está no romaneio. Hoje `paradasPorOutraPlaca` (agregacao.ts:76) só contém placas do romaneio.

**Files:**
- Modify: `src/app/api/kpi/nutrimax/gerar/route.ts` e `scripts/gerar-nutrimax-real-arquivo.ts` (montagem de `paradasPorOutraPlaca`)
- Test: `src/app/api/kpi/nutrimax/gerar/route.test.ts` ou helper novo testado

- [ ] **Step 1: Verificar a fonte** — no snapshot `kpi_alvos_snapshot` de 23/09, o alvo com `documento` 215999 está na placa TUS1B06? (`sudo -u postgres psql kpi_transmonseg`, SELECT). Se SIM: seguir. Se NÃO: registrar no ledger que a transferência só é resolvível manualmente e pular para a Task 4 (a resolução manual com tipo `entregue_outra_placa` + campo placa executora cobre).
- [ ] **Step 2: Teste que falha** — helper puro `placasExtrasPorAlvo(alvos, placasRomaneio, nfsRomaneio): string[]` devolve placas de alvos cujo `documento` é NF do romaneio e cuja placa não está no romaneio.
- [ ] **Step 3:** implementar; incluir essas placas na busca de paradas (mesma chamada existente) só para alimentar `paradasPorOutraPlaca`; nunca criar cargas novas para elas.
- [ ] **Step 4:** rótulo resultante já existe: `ENTREGUE POR OUTRA PLACA (TUS1B06) - CARGA TRANSFERIDA`. Suíte verde, commit `feat(kpi): transferencia para placa fora do romaneio via alvos Unitrac`.

### Task 4: Resolução manual por NF que sobrevive à regeração

Requisito P0 do PDF: "persistir status automático ORIGINAL, resolução manual, responsável, data/hora, documento e histórico; nova execução não pode apagar". Hoje não existe tabela de resolução por NF.

**Files:**
- Create: `supabase/migrations/20260924000000_kpi_resolucao_nf.sql`
- Create: `src/lib/kpi-romaneio/resolucoes.ts` (+ `.test.ts`)
- Create: `scripts/importar-ocorrencias.ts` (importa a planilha "Ocorrencias KPI DD-MM.xlsx" da equipe)
- Modify: `src/lib/kpi-romaneio/gerador-xlsx.ts` (colunas novas)

- [ ] **Step 1: Migration**

```sql
create table if not exists kpi_nf_resolucao (
  id bigserial primary key,
  empresa text not null,
  data date not null,
  nf text not null,
  resolucao text not null check (resolucao in ('entregue','entregue_tempo_conferido','entregue_rastro_oscilante','entregue_outra_placa','nao_esteve_no_local','desatualizado')),
  placa_executora text,
  observacao text,
  responsavel text not null,
  documento text,
  criado_em timestamptz not null default now()
);
create index if not exists kpi_nf_resolucao_busca on kpi_nf_resolucao (empresa, data, nf, criado_em desc);
```

Linhas nunca são atualizadas nem apagadas: cada nova resolução é um INSERT (histórico = todas as linhas; vigente = a mais recente).

- [ ] **Step 2: Testes que falham** (`resolucoes.test.ts`): `resolucaoVigente(linhas)` devolve a de maior `criado_em`; `aplicarResolucoes(detalhe, vigentes)` adiciona `resolucaoManual`/`responsavel` sem alterar `status`/`observacao` automáticos; NF resolvida que não está no detalhe é ignorada sem erro.
- [ ] **Step 3:** implementar `buscarResolucoes(empresa, data)` (PostgREST, service client), `resolucaoVigente`, `aplicarResolucoes`.
- [ ] **Step 4:** gerador: colunas `STATUS AUTOMÁTICO` (atual), `RESOLUÇÃO OPERAÇÃO`, `RESPONSÁVEL`; resumo mostra as duas taxas — automática e "após conferência da operação" — nunca somando no automático.
- [ ] **Step 5:** `scripts/importar-ocorrencias.ts <xlsx> <AAAA-MM-DD> --responsavel <nome> [--aplicar]`: lê a planilha (descobrir colunas NF/resolução no arquivo real de 23/09 — pedir ao usuário se não estiver no scratchpad), mapeia os textos da equipe ("Entregue no local", "Não esteve no local", "Entregue por outra placa", "Desatualizado"…) para o enum; sem `--aplicar` só imprime.
- [ ] **Step 6:** suíte verde; commit `feat(kpi): resolucao manual por NF persistente com historico`.

### Task 5: Evidência exposta por NF

Requisito P0: "expor origem, método e distância; não equiparar parada em rua semelhante a entrega".

**Files:**
- Modify: `src/lib/kpi-romaneio/agregacao.ts` (campo novo no detalhe), `src/lib/kpi-romaneio/gerador-xlsx.ts` (2 colunas)
- Test: ambos os `.test.ts`

- [ ] **Step 1: Teste que falha** — o detalhe de cada NF ganha `evidencia: 'parada_no_endereco' | 'parada_no_cadastro_unitrac' | 'raio_ampliado' | 'vizinhanca' | 'parada_curta_compartilhada' | 'outra_placa' | 'alvo_feito_unitrac' | 'sem_evidencia' | 'sem_rastreador'` e `distParadaM: number | null`. Um teste por valor, a partir dos marcadores que já existem (`viaRaioAmpliado`, `viaVizinhanca`, `porOutraPlaca`, `confirmado_unitrac`).
- [ ] **Step 2:** a ponte já escolhe entre geocode e `latAlt`; para distinguir `parada_no_endereco` de `parada_no_cadastro_unitrac` sem mudar a ponte, comparar a distância da parada ao geocode e ao cadastro no KPI (o mais perto vence).
- [ ] **Step 3:** gerador: colunas `EVIDÊNCIA` (texto legível: "PARADA NO ENDEREÇO", "PARADA NO CADASTRO UNITRAC", …) e `DIST. PARADA (m)`.
- [ ] **Step 4:** suíte verde; commit `feat(kpi): evidencia e distancia da parada por NF no xlsx`.

### Task 6: Verificação com dado real, espelho e rollout

- [ ] **Step 1:** no servidor, `/srv/kpi-transmonseg`: `npx tsx --env-file=.env.production scripts/gerar-nutrimax-real-arquivo.ts <escala> <romaneio> 2026-09-23 /tmp/kpi-regen-0923/novo.xlsx` (PDFs de 23/09 do storage do KPI) e o mesmo para 22/09 com `/tmp/kpi-regen-0922/*.pdf`. Só em disco.
- [ ] **Step 2:** `scripts/medir-contra-gabarito-ana.py` em 22/09: não piorar (≤2 min 938, ≤10 min 1.103, sem horário 29). Em 23/09 conferir os 5 casos de referência do PDF: TTL5J17 (sem rastreador, fora da taxa), RQQ5B81/2386225 (não confirmada), RQU5J45/215999 (TUS1B06 ou resolução manual), RBG8J72/2387832 e RQU1B50/2387652 (evidência exposta).
- [ ] **Step 3:** cherry-pick dos commits no `../KPI TEMP`, suíte, push nos dois.
- [ ] **Step 4:** relatório ao usuário (números antes/depois + 5 casos) e pedir OK de deploy (`git pull --ff-only`, build em background com `BUILD_EXIT`, `pm2 restart kpi-transmonseg`, HTTP 200). Migration da Task 4 aplicada no `kpi_transmonseg` só junto com o deploy.

## Fora deste plano (registrar, não fazer)

- Chaves da API Fulltrack coladas na DM: guardar no cofre `chaves-apis-joaquim`; integração Fulltrack é plano próprio.
- P1 "coleta auditável" (persistir intervalo, filtros, paginação da consulta Unitrac) e "estado parcial/final da rota": plano próprio depois deste.
- Tela no painel para a equipe registrar resolução (Task 4 entrega importação por planilha, que é o fluxo que a equipe já usa).

---

## Adendo (24/09 noite) — achados da Task 6 e da análise de erros restantes

Fontes: `.superpowers/sdd/2026-09-24-melhorias-relatorio-final-ana/task-6-report.md` e `~/ClaudeGerado/kpi-regen-0922/analise-erros-restantes.md`. Mesmas Global Constraints. Medição de não-regressão: gabarito da Ana 22/09 com o código atual = 988 ≤2 min, 1104 ≤10 min, 29 sem horário.

### Task 7: Snapshot noturno das paradas Unitrac (/stops) + "sem movimento" robusto

Problema: `/stops` da Unitrac só guarda 48 h. Gerar um dia depois disso traz paradas incompletas → `nuncaSaiuDaBase` (`agregacao.ts:560`) vira true e 54 NFs de 22/09 (17 placas que rodaram >50 km) saem "VEÍCULO SEM MOVIMENTO"; 3 transferências somem.

**Files:** Create `supabase/migrations/20260924010000_kpi_paradas_snapshot.sql`, `src/lib/kpi-romaneio/paradas-snapshot.ts` (+ test), `scripts/snapshot-paradas-noturno.ts`; Modify `src/app/api/kpi/nutrimax/gerar/route.ts`, `scripts/gerar-nutrimax-real-arquivo.ts`, `src/lib/kpi-romaneio/agregacao.ts:560-561`.

- [ ] Migration:
```sql
create table if not exists kpi_paradas_snapshot (
  empresa text not null,
  data date not null,
  placa text not null,
  paradas jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (empresa, data, placa)
);
alter table kpi_paradas_snapshot enable row level security;
```
- [ ] `paradas-snapshot.ts`: `mesclarParadas(a, b)` (união deduplicada pela chave `_data` + lat/lng arredondado a 5 casas, ordenada por `_data`), `lerSnapshotParadas(empresa, data): Map<placa, UnitracParadaRow[]>`, `salvarSnapshotParadas(empresa, data, porPlaca)` (upsert mesclando com o que já existe — nunca encolhe), `paradasEfetivas(empresa, data, daApi)`: se `data` < hoje BR, mescla API + snapshot; se hoje, salva e devolve a API. Testes: mescla sem duplicar; snapshot maior que a API (dia antigo) prevalece; falha de leitura do snapshot não quebra (loga, devolve a API).
- [ ] `scripts/snapshot-paradas-noturno.ts`: para cada placa da frota Nutry Max (`buscarFrota(COD_USER_NUTRIMAX)`), busca `/stops` de 48 h (`buscarParadasDoDia` com horas=48), agrupa por dia BR (hoje e ontem) e salva mesclando. `--dry` só imprime. Mesmo padrão de erro do `snapshot-alvos-noturno.ts`.
- [ ] Geração (route + CLI): usar `paradasEfetivas` onde hoje usa o resultado cru de `buscarParadasDoDia`.
- [ ] `agregacao.ts`: `semMovimento = (kmPercorrido != null && kmPercorrido < LIMITE_KM_SEM_MOVIMENTO) || (nuncaSaiuDaBase && (kmPercorrido == null || kmPercorrido < LIMITE_KM_SEM_MOVIMENTO))` — km do GPS contínuo acima do limite desmente "nunca saiu da base". Teste: placa com todas as paradas BASE mas km=80 → não é "sem movimento".
- [ ] Cron (só no deploy, com OK): mesma cadência do snapshot de alvos (`50 3` e `50 4` no crontab do transmonseg-vps, servidor em CEST).
- [ ] Suíte verde; commit `feat(kpi): snapshot noturno das paradas Unitrac e sem-movimento desmentido pelo km`.

### Task 8: Placa declarada sem rastreador pela operação (TTL5J17)

Problema: TTL5J17 tem `cv` na Unitrac e paradas só na BASE → cai em "VEÍCULO SEM MOVIMENTO" e fica na taxa. Pelo dado é indistinguível de caminhão parado; a informação "sem rastreador" vem da operação.

**Files:** Create `supabase/migrations/20260924020000_kpi_placa_sem_rastreador.sql`, `src/lib/kpi-romaneio/placas-sem-rastreador.ts` (+ test); Modify route.ts e CLI (onde monta `temRastreadorPorPlaca`).

- [ ] Migration:
```sql
create table if not exists kpi_placa_sem_rastreador (
  id bigserial primary key,
  empresa text not null,
  placa text not null,
  inicio date not null,
  fim date,
  motivo text,
  responsavel text not null,
  criado_em timestamptz not null default now()
);
alter table kpi_placa_sem_rastreador enable row level security;
```
- [ ] `placasSemRastreadorNoDia(linhas, data): Set<placaNorm>` (inicio ≤ data e (fim null ou ≥ data), placa normalizada com `normPlaca`), `buscarPlacasSemRastreador(empresa)` com falha de leitura não quebrando a geração. Testes de vigência (antes do início, dentro, depois do fim, fim null).
- [ ] Geração: placa no conjunto → `temRastreador=false` (reusa o rótulo da Task 1 `SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO`, fora da taxa automática). Teste de integração no helper que monta o mapa.
- [ ] Seed de TTL5J17 (inicio 2026-09-23, motivo "informado pela operação 24/09", responsavel "Ana") só no deploy, com OK.
- [ ] Suíte verde; commit `feat(kpi): placa declarada sem rastreador pela operacao`.

### Task 9: Evidência nos rótulos por distância própria + coluna "PARADAS REAIS"

Problema: rótulos derivados de `distPropria` ("PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA", "NÃO FOI AO CLIENTE", "PARADA PRÓXIMA (500m-2km)") saem sem evidência/distância (69 NFs em 23/09). A coluna "PARADAS REAIS" (`gerador-xlsx.ts:16`, calculada em `agregacao.ts:~320`) conta NFs confirmadas, não paradas físicas — confundiu a operação ("KPI 3 × relatório 4").

**Files:** Modify `src/lib/kpi-romaneio/agregacao.ts`, `src/lib/kpi-romaneio/gerador-xlsx.ts`; tests.

- [ ] Enum `evidencia` ganha `'passagem_sem_parada'` (rótulo PASSOU NO ENDEREÇO…) e `'parada_proxima_fora_raio'` (PARADA PRÓXIMA 500m-2km); "NÃO FOI AO CLIENTE" fica `'sem_evidencia'`. Para os três, `distParadaM = Math.round(distPropria)` quando `distPropria` existe e a geo é confiável; senão null. Texto legível: "PASSAGEM SEM PARADA", "PARADA PRÓXIMA FORA DO RAIO". Testes por rótulo.
- [ ] Coluna "PARADAS REAIS" → "NF CONFIRMADAS" (mesmo valor) e nova coluna "PARADAS FORA DA BASE" = número de paradas próprias da placa com `classificacao === 'FORA_BASE'` na carga. Teste com 3 NFs confirmadas em 2 paradas físicas → 3 e 2.
- [ ] Suíte verde; commit `feat(kpi): evidencia nos rotulos por distancia e coluna de paradas fisicas`.

### Task 10: Horário pela parada Unitrac quando o GPS contínuo falhou

Problema: ~27 NFs de 22/09 que a Ana vincula por código do cliente saem "ENTREGUE" sem horário porque o feed GPS contínuo congela/some na parada; 24 delas estão no `/stops` da Unitrac.

**Files:** Modify `src/lib/kpi-romaneio/agregacao.ts` (ou `visitas.ts`, onde `confirmado_unitrac` sem visita é decidido); tests.

- [ ] NF `confirmado_unitrac` sem visita GPS: procurar nas paradas Unitrac da própria placa (após a Task 7, já mescladas com o snapshot) a parada que contém o `feitoISO` (convenção existente: dígitos BRT + 'Z', mesma do restante do arquivo) com tolerância de 10 min antes da chegada / depois da saída, e cujo centro está a ≤500 m do cadastro Unitrac ou do geocode confiável. Achou: chegada/saída = da parada, `distParadaM` preenchida, evidência continua `alvo_feito_unitrac`. Não achou: comportamento atual (sem horário).
- [ ] Testes: parada contém o feito e está a 100 m → horário preenchido; parada contém o feito mas a 2 km → sem horário; feito fora de qualquer parada → sem horário; fuso: feito "2026-09-22T10:05:00Z" (dígitos BRT) casa com parada 10:00–10:20 na mesma convenção.
- [ ] Medir com `scripts/medir-contra-gabarito-ana.py`: "sem horário" deve cair (esperado ~29 → ≤10), ≤2/≤10 min não podem piorar.
- [ ] Suíte verde; commit `feat(kpi): horario pela parada Unitrac quando o GPS continuo falhou`.

### Task 11: Verificação final do adendo

- [ ] Regenerar 22/09 e 23/09 fora de produção (cópia em /tmp no servidor, como na Task 6), medir contra o gabarito, conferir: 0 "VEÍCULO SEM MOVIMENTO" em placa com km > limite; TTL5J17 como sem rastreador (via seed temporário só na cópia — ou teste com override se não puder escrever); 69 NFs com evidência; "sem horário" menor.
- [ ] Cherry-pick no `../KPI TEMP`, suíte verde, sem push.
