# App desktop offline (MVP-first) — design

**Data:** 2026-06-06 · **Decisão:** Joaquim (offline importante; site fica intocado; começar pelo MVP)

## Objetivo
Adicionar um **app de computador (Windows)** que **gera o KPI do dia mesmo sem
internet** — e sobe os resultados quando a internet volta. O **site (Vercel +
Supabase) continua exatamente como está**; o desktop é um cliente ADICIONAL.

## Princípio que torna isso viável
O "cérebro" já é **Node e offline-capable**: `src/lib/parsers/*` (escala/Unitrac),
`src/lib/kpi/matcher`, `gerador-kpi` (XLSX), `gerador-pdf`. O que prende na nuvem é
só o **banco** (cadastro de lojas, persistência). Logo: rodar o cérebro local +
um **snapshot local do cadastro** = geração offline. Sem reescrever o site.

## Arquitetura (MVP)
- **Electron** (não Tauri): o app é pesado em Node (pdf-parse, pdfjs, ExcelJS,
  matcher) — Electron roda esse código direto, sem ponte Rust.
- **Mesmo repo, sem quebrar o site:** o desktop importa o `src/lib` que já existe
  (parsers/matcher/geradores são framework-agnostic). Nada do Next muda.
- **Snapshot local do cadastro:** ao abrir online, baixa `lojas` + `veiculos` do
  Supabase pra um arquivo local (`cadastro.sqlite` ou `cadastro.json`). Offline, o
  matcher usa esse snapshot.
- **Fluxo offline:** escolhe escala(s) + Unitrac → roda o pipeline (mesmo da rota
  `kpi/simples`, mas local) → gera **XLSX + PDF** salvos no disco. Funciona 100%
  sem internet.
- **Fila de upload:** os KPIs/escala gerados ficam numa fila local; quando há
  internet, sobem pro Supabase (aparecem no dashboard do site). Single-writer →
  conflito ~zero.
- **Login leve:** 1º login online cacheia a sessão (token no keychain do SO);
  offline usa o cache; revalida ao reconectar. (Pro MVP pode até ser sem login —
  decisão de produto.)

## Fora do MVP (fase futura)
- **Offline completo via PowerSync** (todo o app — dashboard, histórico — offline
  com sync bidirecional). Só se a geração-offline não bastar.

## Riscos / cuidados
- Reusar `src/lib` no Electron: resolver os aliases `@/` no build do Electron
  (esbuild/vite + tsconfig paths). Os geradores usam o template `kpi-template.xlsx`
  (asset) — empacotar junto.
- `pdf-parse`/`pdfjs-serverless`/`ExcelJS` em Electron main/worker (Node) — ok, são
  Node. Rodar o processamento no **main process / worker**, não no renderer.
- Tamanho do app (Electron ~100MB) — aceitável pra ferramenta interna.
- O site NÃO muda — só extraímos/reusamos `src/lib`; se precisar mover algo pra um
  pacote compartilhado, fazer sem alterar os imports do site (path alias).

## Fases (valor)
1. **Núcleo reusável + Electron shell** — empacota e roda o pipeline local com um
   cadastro de teste; gera XLSX/PDF a partir de arquivos escolhidos.
2. **Snapshot do cadastro** (baixa online, usa offline).
3. **Fila de upload** (sobe os KPIs gerados quando online).
4. **Login/sessão cacheada** (ou decisão de pular no MVP).
5. **Empacotar instalador** (.exe via electron-builder) + teste end-to-end offline.

## Skills
Planejamento (writing-plans) + a referência da pesquisa (PowerSync/Electron) salva
nesta pasta. Implementação: vercel/react não se aplica (é Electron+Node).
