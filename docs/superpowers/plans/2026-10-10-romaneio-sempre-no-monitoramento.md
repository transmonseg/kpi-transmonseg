# Romaneio sempre no monitoramento e no Ao vivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Nenhum dia operacional fica sem romaneio no Ao vivo ou no monitoramento (motor de desvio cego em 09/10 e 10/10 até correção manual).

**Architecture:** O ciclo de 10 min (`scripts/kpi-ao-vivo-tick.ts`) passa a reparar sozinho: (1) Ao vivo vazio + geração do dia existente => preenche o Ao vivo (`entradaDaGeracao` + `guardarDiaAoVivo`); (2) Ao vivo com romaneio e monitoramento sem romaneio do dia => reenvia os PDFs guardados da geração (`enviarAoMonitoramento`). A auditoria diária avisa por WhatsApp se o dia ficou sem romaneio. A tela de troca do Ao vivo aceita digitar a placa.

**Tech Stack:** Next.js, TypeScript, vitest, Postgres (kpi_transmonseg / transmonseg), scripts via tsx no servidor.

**Spec:** conversa de 10/10 (pedido do usuário "aprimore e feche tudo funcionando").

## Global Constraints
- Nunca enviar mensagem a cliente/grupo; só DM ao dono via `scripts/alertar-dm.mjs`.
- Mudança de regra que afeta número de cliente exige medição; aqui nada muda número.
- Idempotente e fail-open: erro no reparo nunca derruba o tick.
- Só Nutry Max (`nutrimax`); Rio Quality fora.
- Espelhar em `KPI TEMP`; deploy com `bash scripts/deploy-sem-queda.sh` (feito pelo controlador, não pelos agentes).

## Review Focus
- Dia com Ao vivo já preenchido por humano nunca é sobrescrito.
- Reenvio ao monitoramento não duplica (UNIQUE data+placa+nf+modo_teste+origem) e não roda a cada tick.
- Dia passado/futuro não é tocado; só o dia de hoje (BRT).

### Task 1: Reparo no tick (Ao vivo + monitoramento)
**Files:** `scripts/kpi-ao-vivo-tick.ts`, novo `src/lib/kpi-romaneio/reparar-dia.ts` + `.test.ts`
- [ ] Teste: decisão pura `decidirReparo({aoVivoTemDia, geracaoTemDia, monitoramentoTemRomaneio})` -> `'preencher_ao_vivo' | 'enviar_monitoramento' | 'nada'`.
- [ ] Implementar a função e ligar no tick (fail-open, log `[reparo] ...`).
- [ ] Monitoramento: consultar `GET`/endpoint existente de contagem de romaneio do dia ou novo endpoint leve protegido por x-motor-key.

### Task 2: Auditoria avisa dia sem romaneio
**Files:** `scripts/auditoria-diaria.sh`, `scripts/auditar-dia.ts`
- [ ] Alerta DM quando total de NFs = 0 já existe; acrescentar verificação: dia sem romaneio no monitoramento (romaneio_pontos do dia = 0).

### Task 3: Digitar a placa na troca do Ao vivo
**Files:** `src/app/painel/ao-vivo/page.tsx` (+ teste se houver helper puro `completarPlaca`)
- [ ] Campo de texto com `completarPlaca` (já existe em `trocas-placa.ts`), mantendo a seleção atual.
