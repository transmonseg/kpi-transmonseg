# Resolução automática ≥94% (regras R1 e R2 do 24/09) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subir a resolução automática do KPI Nutry Max de 91,1% para ~94% no 24/09, cortando transferências falsas (R1) e confirmando pela parada Unitrac da própria placa (R2).

**Architecture:** Só no KPI (`src/lib/kpi-romaneio/agregacao.ts`, geração em `src/app/api/kpi/nutrimax/gerar/route.ts` e `scripts/gerar-nutrimax-real-arquivo.ts`, textos em `gerador-xlsx.ts`). Ambas as regras opt-in no fluxo Nutry Max (mesmo padrão da opção de sem rastreador); Rio Quality inalterado.

**Tech Stack:** TypeScript, Vitest.

**Spec:** Análise `~/ClaudeGerado/kpi-regen-0922/analise-24-09.md` (seções 1, 2 e 7) e relatório técnico da Ana de 25/09 (DM): meta >94% de resolução automática sem conferência, depois 97%; "na Nutry Max não existe troca de placa — outro carro parou perto".

## Global Constraints

- Fuso: paradas Unitrac e feitoISO em dígitos BRT comparados como dígitos+'Z'; não somar 3h.
- Rio Quality idêntico ao atual (opções desligadas por padrão).
- Gabarito da Ana 22/09 (`scripts/medir-contra-gabarito-ana.py`): não piorar 988 ≤2 min / 1104 ≤10 min / 29 sem horário.
- "Resolução automática" = NFs com status exatamente `ENTREGUE` ou `ENTREGUE POR OUTRA PLACA (...)` (sem `CONFERIR`) ÷ total.
- Sem push/deploy dentro das tasks; deploy só na Task 3 depois de medir.

## Review Focus

- Placa que realmente trocou de rota com outra (RBJ2J67 ↔ RQV6I51, 21 NFs em 24/09): continua `ENTREGUE POR OUTRA PLACA` (Task 1 testa).
- Outra placa que parou perto de um cliente só por acaso (RQU3F71 2388098/99 × RQU6E83): não confirma (Task 1 testa).
- Parada Unitrac da própria placa perto do cliente mas que está ainda mais perto de OUTRO cliente da mesma placa: não confirma este (Task 2 testa).
- NF de placa sem rastreador: R2 não se aplica (não há parada da própria placa); continua fora da taxa (Task 2 testa).
- NF já `ENTREGUE` pela ponte: R2 não muda horário nem status (Task 2 testa).

---

### Task 1: R1 — "outra placa" só quando é rota trocada

Hoje `acharParadaDeOutraPlaca` (agregacao.ts:189, usada ~L720) aceita qualquer parada de outra placa perto do cliente. Em 24/09: 31 NFs; 8 falsas (outra placa parou perto por acaso ou geocode errado), 23 reais (troca de rota).

**Files:** Modify `src/lib/kpi-romaneio/agregacao.ts`, `src/lib/kpi-romaneio/gerador-xlsx.ts` (se houver mapeamento de texto), route.ts e CLI (ligar a opção); Test `src/lib/kpi-romaneio/agregacao.test.ts`.

**Interfaces:** Produces: opção `exigirRotaTrocada?: boolean` (mesma forma das opções existentes de montarDetalheEntregas, ligada só no Nutry Max). Rótulo novo: `'ENTREGUE POR OUTRA PLACA (<PLACA>) - ROTA TROCADA'` (substitui `- CARGA TRANSFERIDA` quando a opção está ligada; desligada = comportamento atual).

- [ ] **Step 1: Testes que falham.** (a) Placa A com 6 NFs cujas paradas "por outra placa" apontam todas para a placa B, e nenhuma parada própria de A a ≤1.000 m de nenhum desses 6 clientes → as 6 saem `ENTREGUE POR OUTRA PLACA (B) - ROTA TROCADA`. (b) Placa A com 2 NFs casadas com a placa B (abaixo do mínimo) → nenhuma aceita como outra placa; seguem a classificação normal. (c) 6 NFs casadas com B, mas A teve parada própria a 300 m de um desses clientes → aquele cliente não aceita outra placa (os outros 5 continuam aceitos se ainda ≥5; senão nenhum). (d) Opção desligada → comportamento idêntico ao atual (`- CARGA TRANSFERIDA`, sem mínimo).
- [ ] **Step 2:** rodar e ver (a)(b)(c) falharem.
- [ ] **Step 3: Implementar.** Pré-passo antes do loop por NF: para cada placa original A, contar NFs de A cujo melhor candidato de outra placa é B (`acharParadaDeOutraPlaca`) e cuja distância de A (paradas próprias) ao cliente é >1.000 m ou inexistente. Par (A,B) é "rota trocada" se essa contagem ≥ 5. No loop, com a opção ligada, `porOutraPlaca` só vale se (A,B) é rota trocada E a própria A não esteve a ≤1.000 m desse cliente. Constantes: `MIN_NFS_ROTA_TROCADA = 5`, `RAIO_PROPRIA_PLACA_DESCARTA_TROCA_M = 1000`.
- [ ] **Step 4:** `npx vitest run` verde. **Step 5:** commit `feat(kpi): outra placa so vale como rota trocada na Nutry Max`.

### Task 2: R2 — confirmar pela parada Unitrac da própria placa

Hoje `acharParadaUnitracParaFeito` (agregacao.ts:243, ~L727) só roda para NF `confirmado_unitrac` sem visita. R2 generaliza: NF sem confirmação limpa usa a parada Unitrac CRUA da própria placa (`paradasUnitracCruasPropriaPlaca`, já existente).

**Files:** Modify `src/lib/kpi-romaneio/agregacao.ts`, `gerador-xlsx.ts` (texto de evidência), route.ts e CLI (ligar a opção); Test `agregacao.test.ts`.

**Interfaces:** Consumes: `paradasUnitracCruasPropriaPlaca` (Map placa → paradas Unitrac cruas), cadastro Unitrac do alvo casado (`pontoLat/pontoLng`), `linha.lat/lng` + `geoConfiavel`. Produces: opção `confirmarPorParadaUnitracPropria?: boolean`; novo valor de `evidencia`: `'parada_unitrac_propria'` (texto legível `'PARADA UNITRAC DA PRÓPRIA PLACA'`).

- [ ] **Step 1: Testes que falham.** Base: NF sem visita GPS, geo confiável. (a) Parada Unitrac da própria placa com duração ≥2 min a 150 m do geocode → status `ENTREGUE` (sem CONFERIR), chegada/saída = da parada, `evidencia='parada_unitrac_propria'`, `distParadaM=150`. (b) Parada a 150 m do cadastro Unitrac mas geocode não confiável → mesma confirmação, distância ao cadastro. (c) Parada a 250 m deste cliente e a 40 m do endereço de OUTRA NF da mesma placa → não confirma. (d) Parada de 1 min → não confirma. (e) NF que já era `ENTREGUE` pela ponte → nada muda. (f) NF com rótulo `ENTREGUE - PARADA CURTA (ATÉ 3MIN)...`, `ENTREGUE - PARADA PRÓXIMA (500-800m)...`, `PASSOU NO ENDEREÇO...`, `PARADA PRÓXIMA (500m-2km)...`, `NÃO FOI AO CLIENTE...` ou `ENDEREÇO COM COORDENADA IMPRECISA...` com parada válida → vira `ENTREGUE` com a evidência nova. (g) Placa sem rastreador (rótulo SEM RASTREADOR) → não se aplica. (h) Opção desligada → nada muda.
- [ ] **Step 2:** rodar e ver falhar.
- [ ] **Step 3: Implementar** um helper puro `acharParadaUnitracPropria(linha, cadastro, paradasCruas, outrosPontosDaPlaca)` que devolve a parada de maior duração entre as que têm duração ≥ `DURACAO_MIN_PARADA_UNITRAC_PROPRIA_MIN = 2`, centro a ≤ `RAIO_PARADA_UNITRAC_PROPRIA_M = 300` do geocode confiável OU do cadastro, e que não esteja mais perto de outro ponto (geocode confiável ou cadastro) de outra NF da mesma placa com endereço diferente. Aplicar DEPOIS de R1 e da visita da ponte, ANTES dos rótulos de ressalva/pendente; quando aplica, a NF sai como `ENTREGUE` limpo. Não sobrepõe `ENTREGUE` da ponte, `ENTREGUE POR OUTRA PLACA`, SEM RASTREADOR nem resolução manual.
- [ ] **Step 4:** `npx vitest run` verde. **Step 5:** commit `feat(kpi): confirma pela parada Unitrac da propria placa (R2)`.

### Task 3: Medição e deploy

- [ ] Regenerar 24/09 (PDFs `/tmp/kpi24/{escala,romaneio}.pdf` no servidor; se sumiram, copiar do storage `nutrimax/2026-09-24/5c44092a-...`) e 22/09 numa cópia fora de produção (rsync para /tmp, link de node_modules, `.env.production` de `/srv/kpi-transmonseg`). Critérios: 24/09 resolução automática ≥93,5% (esperado ~94%); das NFs que R2 confirmou, quantas têm `feitoISO` da Unitrac a >30 min da parada (proxy de falso positivo) — reportar; 22/09 gabarito sem piora; RQU3F71 2388098/99 não confirmadas por RQU6E83; RBJ2J67↔RQV6I51 mantidas.
- [ ] Revisão final do conjunto (modelo mais forte).
- [ ] Push definitivo + cherry-pick/push TEMP, `git pull --ff-only` + build (background, `BUILD_EXIT`) + `pm2 restart kpi-transmonseg` + HTTP 200 no Contabo. Deploy autorizado pelo usuário em 25/09 condicionado a não piorar os critérios.
