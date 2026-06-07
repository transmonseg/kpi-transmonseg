# App Desktop Offline (MVP) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** App Electron (Windows) que gera o KPI (XLSX+PDF) a partir de escala+Unitrac **100% offline**, usando um snapshot local do cadastro, e enfileira os resultados pra subir ao Supabase quando a internet volta — sem mudar o site.

**Architecture:** Extrai um `gerarKpiLocal` puro (reusa `src/lib` já existente: parsers, matcher, geradores) que NÃO depende de Supabase/HTTP. O Electron roda esse núcleo no main/worker (Node), com UI mínima no renderer. Cadastro vem de um snapshot local (baixado quando online). KPIs gerados vão pra uma fila local que sobe ao Supabase quando há internet. O site Next.js/Vercel não muda — só reusa o mesmo `src/lib`.

**Tech Stack:** Electron · TypeScript · Node · esbuild/electron-vite · electron-builder · reusa ExcelJS/pdf-parse/pdfjs-serverless/@react-pdf/renderer/talisman de `src/lib`.

**Gates:** `npm test` (núcleo testado com vitest) · `npx tsc` · o app abre e gera XLSX/PDF a partir de arquivos reais OFFLINE (desliga o wifi e testa).

---

## FASE 1 — Núcleo `gerarKpiLocal` (puro, testável, sem nuvem)

### Task 1.1 — Extrair `gerarKpiLocal`
**Files:** Create `src/lib/kpi/gerar-kpi-local.ts`; Test `src/lib/kpi/gerar-kpi-local.test.ts`
- Função pura:
  ```ts
  type ArquivoEntrada = { nome: string; buffer: Buffer }
  type LojaCadastro = LojaRow            // mesmo shape de matcher
  type SaidaRede = { rede_id: string; rede_nome: string; xlsx: Buffer; pdf: Buffer; linhas: number }
  async function gerarKpiLocal(opts: {
    escalas: ArquivoEntrada[]; unitracs: ArquivoEntrada[];
    lojas: LojaCadastro[]; veiculos: { placa_norm: string }[];
    data: string; alteracoes?: AltConfirmada[];
  }): Promise<SaidaRede[]>
  ```
- Replica o miolo da rota `kpi/simples` SEM Supabase/preview/lineEdits/anomalia:
  1. `parseEscalaArquivo` por escala → `escalaLinhas`; `aplicarAlteracoes` se houver.
  2. `cadastroPlacas` = placas da escala + `veiculos` (sem histórico de paradas — offline).
  3. parse unitrac: `.pdf` → `parseUnitracPdf(buf, cadastroPlacas)`; senão `parseUnitrac`.
  4. agrupa por `rede_id`; por rede: `setSemGeo(true)` + `cruzaEscalaUnitrac(rows, paradas, lojas, undefined, undefined, {geoEndereco:true})` → rotas.
  5. `rotaToLinha` (extrair/duplicar o helper da rota) → `LinhaParaKpi[]`.
  6. `gerarKpi({rede_id, data, linhas})` (XLSX) + `gerarKpiPdf(...)` (PDF).
  7. retorna `SaidaRede[]`.
- Teste: usa os arquivos reais (ESCALA GERAL + relatorio_10015/10023) + um `lojas.json` de fixture → espera ≥1 rede com xlsx.length>0 e pdf.length>0.
- Commit: `feat(kpi): gerarKpiLocal puro (offline, reusa o pipeline)`.

### Task 1.2 — (opcional, DRY) rota delegar ao núcleo
- Se sair limpo, `kpi/simples/route.ts` passa a chamar `gerarKpiLocal` no miolo (mantém preview/persistência por fora). Só se NÃO regredir os 502 testes. Senão, deixa duplicado (o núcleo é a fonte; baixo risco).

---

## FASE 2 — Electron shell + UI mínima

### Task 2.1 — Setup Electron no repo
**Files:** Create `electron/main.ts`, `electron/preload.ts`, `electron/tsconfig.json`, `electron-builder.yml`; Modify `package.json` (scripts `app:dev`, `app:build`; devDeps electron, electron-builder, electron-vite ou esbuild)
- Estrutura `electron/` separada do Next (não interfere no build do site).
- Build resolve os aliases `@/` → `src/*` (tsconfig paths no esbuild) e empacota `src/assets/kpi-template.xlsx`.
- `app:dev` abre uma janela em branco. Gate: janela abre.
- Commit: `chore(app): scaffold Electron (main/preload) sem tocar o site`.

### Task 2.2 — IPC: gerar KPI
**Files:** Modify `electron/main.ts`, `electron/preload.ts`; Create `electron/renderer/index.html` + `electron/renderer/app.ts`
- Renderer: pickers de arquivo (escala[], unitrac[]), input de data, botão "Gerar KPI", lista de saídas.
- `preload` expõe `window.api.gerar({escalaPaths, unitracPaths, data})`.
- `main`: lê os arquivos do disco (`fs`), chama `gerarKpiLocal` (cadastro: por ora um `lojas.json` local de teste), e oferece salvar os XLSX/PDF (`dialog.showSaveDialog`).
- **Processamento roda no main process (Node)** — pdf-parse/pdfjs/ExcelJS ok.
- Gate: escolhe arquivos reais → gera e salva XLSX+PDF OFFLINE.
- Commit: `feat(app): gerar KPI offline a partir de arquivos (IPC main↔renderer)`.

---

## FASE 3 — Snapshot local do cadastro

### Task 3.1 — Baixar e cachear cadastro
**Files:** Create `electron/cadastro.ts`; Modify `electron/main.ts`
- Quando online (no boot, best-effort): baixa `lojas` (ativo=true) + `veiculos` (ativo=true) do Supabase (REST com a anon/own key) → grava `cadastro.json` no `app.getPath('userData')`.
- Offline: `gerarKpiLocal` usa o `cadastro.json` cacheado. Mostra na UI a data do último snapshot.
- Gate: 1º boot online baixa; desliga o wifi; gera o KPI usando o cache.
- Commit: `feat(app): snapshot local do cadastro (baixa online, usa offline)`.

---

## FASE 4 — Fila de upload dos KPIs gerados

### Task 4.1 — Enfileirar + subir quando online
**Files:** Create `electron/fila-upload.ts`; Modify `electron/main.ts`
- Cada geração grava na fila local (`fila/<data>-<rede>.json` + os buffers) com status `pendente`.
- Ao detectar internet (ping no Supabase): sobe os pendentes (persistir escala_linhas/kpi no Supabase OU subir os arquivos ao storage — alinhar com o que o site espera) e marca `enviado`.
- UI mostra a fila (pendente/enviado) + botão "Sincronizar agora".
- Single-writer → sem resolução de conflito; só append.
- Gate: gera offline (vai pra fila); religa a internet → sobe e aparece no site.
- Commit: `feat(app): fila de upload dos KPIs (sobe quando online)`.

---

## FASE 5 — Empacotar o .exe

### Task 5.1 — electron-builder
**Files:** Modify `electron-builder.yml`, `package.json`
- `app:build` gera o instalador Windows (NSIS) com o template empacotado.
- Ícone + nome "KPI TransMonSeg".
- Gate: instalar o `.exe` numa pasta limpa, abrir SEM internet, gerar um KPI.
- Commit: `chore(app): instalador Windows (.exe) via electron-builder`.

---

## FASE 6 — Fechamento
- `npm test` (núcleo + site, todos verdes) · `tsc` · build do site OK (não regrediu).
- Teste end-to-end OFFLINE real (wifi desligado) → gera XLSX/PDF; religa → sincroniza.
- README curto do app em `electron/README.md`.

## Fora do MVP (fase futura, doc separado)
- Login/sessão cacheada (keychain) — por ora o MVP pode subir com a service key local OU sem auth (decisão de produto).
- Offline completo (dashboard/histórico) via PowerSync — só se a geração-offline não bastar.
