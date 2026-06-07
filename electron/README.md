# KPI TransMonSeg — App Desktop (offline)

App Electron (Windows) que **gera o KPI do dia mesmo sem internet** e sobe os
resultados quando a conexão volta. É um **adicional** ao site — o site Next.js/
Vercel continua exatamente como está. O app reusa o mesmo "cérebro" (`src/lib`:
parsers, matcher, geradores) via `gerarKpiLocal`.

## Como funciona

1. **Online (1ª vez / sempre que abre):** baixa um *snapshot* do cadastro
   (`lojas` + `veiculos` ativos) do Supabase pra `cadastro.json` em `userData`.
2. **Gerar KPI (offline-capable):** você escolhe a(s) escala(s) + o(s) relatório(s)
   Unitrac, a data, e clica **Gerar**. O processamento roda no *main process*
   (Node) — `parseEscalaArquivo` → `cruzaEscalaUnitrac` (com o snapshot) →
   `gerarKpi`/`gerarKpiPdf` → salva **XLSX + PDF** na pasta que você escolher.
3. **Fila de envio:** cada geração entra numa fila local. Quando há internet, os
   arquivos sobem pro bucket `kpis-gerados` do Supabase (botão *Sincronizar* ou
   automático ao abrir). Single-writer → sem conflito; nada se perde offline.

## Rodar em desenvolvimento

```bash
npm run app:dev      # bundla (esbuild) e abre o app
npm run app:bundle   # só (re)bundla electron/dist/{main,preload}.cjs
npm run app:typecheck
```

O `app:dev` carrega `.env.local` do repo (Supabase URL/chave) automaticamente.

## Empacotar o instalador (.exe)

```bash
npm run app:build    # gera release/KPI TransMonSeg-<versão>-setup.exe (NSIS)
```

O template do KPI (`src/assets/kpi-template.xlsx`) + logo vão em `resources/assets`
(o app seta `KPI_ASSETS_DIR` pra lá quando empacotado).

## Configuração do cadastro (chave do Supabase)

A chave é lida do **ambiente em runtime** (nunca embutida no código). Ordem:

1. `KPI_SUPABASE_URL` + `KPI_SUPABASE_KEY` (recomendado em produção)
2. `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (dev, via `.env.local`)
3. `NEXT_PUBLIC_SUPABASE_ANON_KEY` (fallback — RLS pode retornar cadastro vazio)

Sem chave/sem internet, o app usa o **último snapshot** baixado. Se nunca baixou,
ainda gera o KPI (só com menos enriquecimento de loja).

> Distribuição p/ a operação: definir `KPI_SUPABASE_*` no ambiente da máquina, ou
> evoluir pro login com sessão cacheada (fora do MVP — ver design).

## Arquivos

- `main.ts` — janela + IPC + orquestração.
- `preload.ts` — ponte segura `window.api` (contextIsolation).
- `cadastro.ts` — snapshot local do cadastro.
- `fila-upload.ts` — fila + sync pro Supabase.
- `build.mjs` — bundler esbuild (resolve `@/`, externaliza node_modules).
- `renderer/` — UI mínima (HTML/JS, CSP estrita).
- `smoke.ts` — harness headless de validação (cadastro + geração + fila).

## Fora do MVP (futuro)

- Login/sessão cacheada (keychain).
- Offline completo (dashboard/histórico) via PowerSync.
- Integração da fila direto no dashboard (hoje sobe pro storage `kpis-gerados`).
