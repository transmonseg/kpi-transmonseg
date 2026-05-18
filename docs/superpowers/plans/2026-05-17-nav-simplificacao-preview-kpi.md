# Nav Simplificação + Preview KPI — Implementation Plan

> **Nota:** Este plano foi executado autonomamente na mesma sessão em que foi criado (usuário autorizou execução completa enquanto dormia). Registrado aqui para rastreabilidade.

**Goal:** Simplificar a nav para Home/Cozinha/KPI e adicionar preview tabular do KPI antes do download.

**Architecture:** Mudanças cirúrgicas em 3 arquivos: nav.tsx, route.ts, page.tsx. Sem novas rotas ou tabelas no banco.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind v4 (CSS vars), Phosphor Icons

---

## Task 1: Simplificar a Nav ✅

**Files:**
- Modify: `src/app/painel/nav.tsx`

### O que foi feito
- Removidos itens: Dia, Histórico, Revisar Anomalias, Alteração de Escala
- Mantidos: Início, Cozinha, KPI (Simples)
- Removidas seções ("KPI Benassi", "Outros") — agora é uma lista flat sem labels
- Removidos imports não usados: CalendarBlank, ClockCounterClockwise, FilePlus, MagnifyingGlass

---

## Task 2: Backend — Preview na Resposta da API ✅

**Files:**
- Modify: `src/app/api/kpi/simples/route.ts`

### O que foi feito
- Adicionado tipo `PreviewLinha` com campos: `ordem`, `loja_nome`, `placa`, `motorista`, `turno`, `tem_gps`, `saida_cd_fmt`, `chegada_loja_fmt`, `tempo_loja_min`
- Adicionada função `fmtHoraBRT(d: Date)` que converte UTC → BRT (UTC-3) em formato "HH:MM"
- `tem_gps` calculado como `!!(rota.saida_cd || rota.paradas.length > 0)`
- `preview: PreviewLinha[]` adicionado ao retorno de cada rede

---

## Task 3: Frontend — Tabela de Preview ✅

**Files:**
- Modify: `src/app/painel/kpi/simples/page.tsx`

### O que foi feito
- Adicionado tipo `PreviewLinha` e campo `preview` em `RedeResult`
- `RedeResultCard` e `DownloadChip` substituídos por `RedePreviewSection` e `PreviewRow`
- `RedePreviewSection`: card com header (nome da rede, % GPS, botões download) + tabela
- `PreviewRow`: linha da tabela com highlight vermelho (`danger-soft`) quando `!tem_gps`
- Colunas: #, Loja, Placa, Motorista, GPS (ícone WifiHigh/WifiSlash), Saída CD, Ch. Loja, Tempo
- Colunas responsivas: Motorista oculta em mobile (<sm), horários ocultos (<md), tempo (<lg)
- Botões de download permanecem no header de cada rede (funcionam via base64 como antes)

---

## Verificação Final ✅

- `npx tsc --noEmit` → zero erros
- `npx eslint` nos 3 arquivos → zero erros, zero warnings
- Commits e push realizados

---

## Resultado Final

**Nav:** 3 itens simples, sem seções, sem itens desnecessários.

**Preview KPI:** Após processar, cada rede mostra uma tabela completa com status GPS por rota. Linhas vermelhas indicam imediatamente onde estão os problemas antes de o usuário baixar o Excel.
