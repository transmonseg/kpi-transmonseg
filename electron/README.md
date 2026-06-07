# KPI TransMonSeg — App Desktop (sistema real embutido)

App Electron (Windows) que roda **o próprio sistema** (o site Next.js, idêntico)
dentro de uma janela desktop. Não é uma tela nova: é o mesmo painel (Dashboard,
Gerar KPI, Histórico, Lojas, Cozinha). A diferença é que a **geração do KPI
funciona sem internet**.

## Como funciona

O Electron empacota um **build standalone do Next** (`server.js` + `.next` +
`node_modules` + `static/public`) e o sobe num servidor local (`127.0.0.1:<porta
livre>`), carregando `/painel`. Ou seja, a interface é byte a byte a mesma do site.

- **Com internet:** tudo funciona igual ao site (login, dashboard, histórico,
  lojas, cozinha e a geração na nuvem). É literalmente o site.
- **Sem internet:** a tela **Gerar KPI** detecta que está offline e gera local —
  roda `gerarKpiLocalComPreview` (mesmo motor/regra do site: parsers → matcher →
  geradores) sobre um **snapshot do cadastro** baixado antes. Devolve o mesmo
  preview por rede + XLSX/PDF pra baixar. As demais telas (que leem o banco na
  nuvem) só funcionam online.
- **Fila:** cada geração offline entra numa fila local e sobe pro bucket
  `kpis-gerados` do Supabase quando a internet volta.

Mudanças no código compartilhado do site são todas **desktop-guarded** (olham
`process.env.DESKTOP_APP === '1'`) → no site (Vercel) são no-op:
- `next.config.ts`: `output:'standalone'` só sob `NEXT_OUTPUT=standalone`.
- `middleware` + `painel/layout`: offline, caem pra sessão local (não expulsam
  pro /login quem já logou) — via `resolveUserDesktopAware`.
- `painel/kpi/simples`: branch offline que chama `window.api.gerarOffline`.

## Rodar em desenvolvimento

```bash
npm run app:web      # build standalone do Next + copia static/public
npm run app:bundle   # bundla electron/dist/{main,preload}.cjs (esbuild)
npm run app:dev      # faz os dois acima e abre o app (electron .)
npm run app:typecheck
```

`app:dev` carrega `.env.local` (Supabase URL/chave) automaticamente.

## Empacotar o instalador (.exe)

```bash
npm run app:build    # build-web + bundle + electron-builder → release/*-setup.exe
```

O instalador inclui o site standalone em `resources/standalone` e os assets do
KPI (`kpi-template.xlsx` + logo) em `resources/assets`.

## Configuração do cadastro (chave do Supabase)

A chave é lida do **ambiente em runtime** (nunca embutida no código). Ordem:

1. `KPI_SUPABASE_URL` + `KPI_SUPABASE_KEY` (recomendado em produção)
2. `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (dev, via `.env.local`)
3. `NEXT_PUBLIC_SUPABASE_ANON_KEY` (fallback — RLS pode retornar cadastro vazio)

Sem chave/sem internet, o app usa o **último snapshot** baixado.

## Arquivos

- `main.ts` — sobe o servidor Next standalone + IPC (cadastro/fila/geração offline).
- `preload.ts` — ponte segura `window.api` (contextIsolation).
- `gerar-offline.ts` — adapta a geração local pro formato `RedeResult[]` da tela.
- `cadastro.ts` — snapshot local do cadastro.
- `fila-upload.ts` — fila + sync pro Supabase.
- `build-web.mjs` — build standalone do Next (cross-platform) + prepare.
- `prepare-standalone.mjs` — copia static/public pra dentro do standalone.
- `build.mjs` — bundler esbuild do main/preload.
- `smoke.ts` — harness headless (cadastro + geração + fila) no Node real.

## Fora do MVP (futuro)

- Login/sessão cacheada robusta p/ distribuição (keychain) — hoje o snapshot do
  cadastro depende da chave no ambiente da máquina.
- Offline completo do dashboard/histórico (leem o banco) via PowerSync.
