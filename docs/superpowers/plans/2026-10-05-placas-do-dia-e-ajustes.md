# Placas do dia + ajustes de 05/10 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver os 4 pontos levantados nos grupos em 05/10: dashboard 02/10 com a versão corrigida, tela para a operação registrar placa sem rastreador e troca de placa, endereços do Romaneio do Pão sem cidade no sistema de desvio, e KPI Rio Quality 02/10 com a regra nova de sem rastreador.

**Architecture:** (1) e (4) são operações de dados com scripts já existentes (`inserirKpi`, `gerar-rioquality-real-arquivo.ts`). (2) cria a tabela `kpi_troca_placa`, uma função pura `aplicarTrocasDePlaca` aplicada logo depois do parse (rota + script de regeração) e uma tela `/painel/nutrimax/placas` com API `/api/kpi/nutrimax/placas` (lê/grava `kpi_placa_sem_rastreador` e `kpi_troca_placa`). (3) porta a regra bairro→município do KPI (`parse-pao.ts`) pro parser tabular do monitoramento, gerando endereço no formato `RUA, NUM - BAIRRO, CIDADE`, e reprocessa os pontos do pão do dia.

**Tech Stack:** Next.js (versão do repo), Supabase self-hosted (PostgREST), Vitest, PostgreSQL no transmonseg-vps.

**Spec:** pedidos no WhatsApp de 05/10 (DESVIO DE ROTA: "KPI ainda não tem espaço de alteração na Nutry", "necessário informar diária o que está na escala em rastreador", "os carros com rotas trocadas"; endereços do pão "falhou"; KPI AJUSTES: 02/10 inserido com 95,3%).

## Global Constraints

- Sem rastreador conta como CORRETA na taxa (regra de 04/10) — não mudar.
- Empresa no `kpi_placa_sem_rastreador` da Nutry é o literal `'NUTRY MAX'` (`EMPRESA_NUTRIMAX`).
- Acesso: `podeOperarEmpresa(perfil, 'nutrimax')` (admin ou operador com nutrimax).
- Todo commit do KPI vai também pro KPI TEMP (cherry-pick); monitoramento: push do definitivo e TEMP.
- Deploy KPI só via `scripts/deploy-sem-queda.sh`. Deploy monitoramento manual (git pull + build + pm2 restart do `transmonseg-definitivo`).
- Nunca mandar mensagem pra Ana/grupo sem OK.

## Review Focus

- Troca registrada com placa da escala que não existe no dia → não quebra a geração, só não troca nada.
- Placa digitada com hífen/minúscula (`rqv-5f67`) → normaliza (`RQV5F67`) antes de gravar e de comparar.
- Duas trocas pra mesma placa no mesmo dia/carga → a mais recente vence (sem duplicar NFs).
- Bairro do pão ambíguo (`CENTRO`, `MANGUINHOS`) sem pista no nome do cliente → cai em RIO DE JANEIRO (comportamento atual), nunca inventa outra cidade.
- Endereço do pão sem vírgula (`ARISTIDES FIGUEIREDO N 59`) → número extraído e formato `RUA, 59 - BAIRRO, CIDADE` válido pro `extrairCidadeDoEndereco`.

---

### Task 1: Reinserir 02/10 corrigido no dashboard

**Files:** nenhum no repo (operação). Arquivo: `/tmp/kpi-reg-out/KPI-Nutry-Max-2026-10-02.xlsx` no servidor (97,0%, gerado em 04/10 após as correções de coordenada).

- [ ] Rodar `scripts/_tmp-inserir.ts` só com `["02"]` em `/srv/kpi-transmonseg` (`inseridoPor: "regerado pelo Claude (versão corrigida, 05/10)"`).
- [ ] Conferir `select resumo->>'taxa' from kpi_dashboard_kpis where cliente='nutrimax' and data='2026-10-02'` = 97.

### Task 2: `aplicarTrocasDePlaca` (função pura)

**Files:**
- Create: `src/lib/kpi-romaneio/trocas-placa.ts`
- Test: `src/lib/kpi-romaneio/trocas-placa.test.ts`

**Interfaces:**
- Produces: `type TrocaPlaca = { carga: string | null; placaEscala: string; placaReal: string }`; `aplicarTrocasDePlaca<R extends { carga: string; placa: string }, E extends { carga: string; placaRaw: string; placaNorm: string }>(romaneio: R[], escala: E[], trocas: TrocaPlaca[]): { romaneio: R[]; escala: E[]; aplicadas: number }`; `normalizarPlacaDigitada(s: string): string`.

- [ ] Teste: troca sem carga substitui a placa em todas as linhas do romaneio e da escala daquela placa; com carga, só daquela carga; placa inexistente → `aplicadas: 0` e listas iguais; `normalizarPlacaDigitada('rqv-5f67 ') === 'RQV5F67'`.
- [ ] Implementar com `normPlaca` de `@/lib/unitrac-api`; última troca da lista vence.
- [ ] `npx vitest run src/lib/kpi-romaneio/trocas-placa.test.ts` passa; commit.

### Task 3: Tabela + leitura das trocas na geração

**Files:**
- Create: `supabase/migrations/20261005000000_kpi_troca_placa.sql` — `kpi_troca_placa(id bigserial pk, empresa text not null, data date not null, carga text, placa_escala text not null, placa_real text not null, responsavel text not null, criado_em timestamptz default now())`, RLS on sem policy, `grant all to service_role`, índice `(empresa, data)`.
- Modify: `src/lib/kpi-romaneio/trocas-placa.ts` — `buscarTrocasDoDia(empresa, data): Promise<TrocaPlaca[]>` (fail-open, igual `buscarPlacasSemRastreador`).
- Modify: `src/app/api/kpi/nutrimax/gerar/route.ts` e `scripts/gerar-nutrimax-real-arquivo.ts` — aplicar logo depois de montar `romaneioCompleto`/escala, antes do geocode.

- [ ] Aplicar migration no `kpi_transmonseg` + `NOTIFY pgrst, 'reload schema'`.
- [ ] Teste de rota existente continua passando (mock de `buscarTrocasDoDia` → `[]`).

### Task 4: API + tela "Placas do dia"

**Files:**
- Create: `src/app/api/kpi/nutrimax/placas/route.ts` — GET `?data=` → `{ semRastreador: PlacaSemRastreadorRow[] (vigentes no dia), trocas: linhas do dia }`; POST `{ tipo: 'sem_rastreador', placa, inicio, fim?, motivo? }` ou `{ tipo: 'troca', data, placaEscala, placaReal, carga? }`; PATCH `{ tipo:'sem_rastreador', id, fim }` (encerrar); DELETE `?tipo=troca&id=`. Responsável = e-mail do usuário. Acesso `podeOperarEmpresa(perfil,'nutrimax')`.
- Create: `src/app/painel/nutrimax/placas/page.tsx` (client) — data no topo; card "Sem rastreador" (lista + form + botão "Voltou a rastrear"); card "Troca de placa" (lista do dia + form + remover); aviso "depois de registrar, gere o KPI do dia de novo".
- Modify: `src/app/painel/nav.tsx` (item "Placas do dia" no grupo Nutry Max), `src/lib/supabase/middleware.ts` (operador: `path.startsWith('/api/kpi/nutrimax/')`), `src/app/painel/header-title.tsx` se tiver mapa de títulos.
- Test: `src/app/api/kpi/nutrimax/placas/route.test.ts` — 403 sem permissão; POST normaliza placa; POST troca com placaEscala === placaReal → 400.

### Task 5: Pão com cidade no monitoramento

**Files (repo monitoramento):**
- Create: `src/lib/romaneio-pao-municipio.ts` — `municipioDoPao(bairro, clienteNome): string` (listas do KPI + pistas no nome do cliente: BUZIOS→ARMACAO DOS BUZIOS, ARARUAMA, BOM JESUS→BOM JESUS DO ITABAPOANA, MARICA, CABO FRIO, NITEROI, SAO GONCALO, MACAE, ITABORAI, RIO BONITO, SAQUAREMA; default RIO DE JANEIRO) e `montarEnderecoPao(endereco, bairro, clienteNome): string` → `RUA, NUM - BAIRRO, CIDADE`.
- Modify: `src/lib/romaneio-tabular.ts:96` usar `montarEnderecoPao`.
- Test: `src/lib/romaneio-pao-municipio.test.ts` com os 12 casos reais de 05/10.
- Depois do deploy: atualizar `endereco_bruto` + `geocode_status='pendente'` dos pontos `origem='escala_pao'` de 05/10 com o formato novo e conferir quantos resolvem.

### Task 6: Rio Quality 02/10 com a regra nova

- [ ] `npx tsx --env-file=.env.production scripts/gerar-rioquality-real-arquivo.ts --completo /tmp/rq-inv/rq-02-entrada.xlsx 2026-10-02 /tmp/rq-inv/KPI-Rio-Quality-2026-10-02.xlsx` em `/srv/kpi-transmonseg`.
- [ ] Inserir no dashboard (`inserirKpi` cliente `rioquality`), copiar pra `~/ClaudeGerado/kpi-03-10/`; conferir KZA2F01/LNH8A80 como "sem rastreador" contadas como corretas.
