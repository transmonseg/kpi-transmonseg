# Melhorias restantes (sinal do rastreador, duas cargas, geocode noturno) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Não acusar o caminhão quando o problema é o sinal do rastreador (RQU4B93: 282 posições com até 145 min de atraso em 28/09; equipe diz "entregue" em 23, 24 e 28). (2) Não acusar quando a mesma placa tem duas cargas em regiões diferentes (TOS5E38: 98861 Volta Redonda + PAO-14 Niterói). (3) Ligar a correção automática de coordenada toda noite, só com a regra de prova mais forte, com teto e backup.

**Architecture:** Tasks 1 e 2 em `src/lib/kpi-romaneio/agregacao.ts` (opt-in `modoPrecisao`, Nutry Max); sem mudança na ponte (o campo `apagaoDeSinal` já chega ao KPI e ao `montarDetalheEntregas` como `apagaoDeSinalPropriaPlaca`). Task 3 em `scripts/correcao-geocode-noturna.ts` e `scripts/corrigir-geocode-por-alvo.ts`.

**Tech Stack:** TypeScript, Vitest, Python (trava), cron no servidor.

**Spec:** `~/ClaudeGerado/kpi-regen-0922/verificacao-28-09-36-erros.md`, conversa com a Ana de 29/09 (áudios: "veículo não saiu da base é interessante… quando coloca 'não foi entregue' parece que você não conseguiu buscar, mesmo sendo informação de que você não é responsável"; "o rastreador estar lá no mato e não atualizar… a KPI não vai ter como identificar mesmo").

## Global Constraints

- Nenhum texto "OUTRA PLACA"; rodízio permanece DESLIGADO (`reconhecerRodizio=false` em route.ts e CLI).
- Os rótulos novos NÃO confirmam entrega e continuam contando na taxa como não confirmados (só o rótulo muda) — exceto onde o plano disser o contrário.
- Trava obrigatória (`scripts/verificar-kpi-gabaritos.py` com 22,23,24 + `--dia` 25,26,28 + `--gabarito-ana`): sai 0; nenhum "nao_entregue" da equipe vira confirmado. Gabarito Ana 22/09 ≥988/≥1104/≤29.
- Rio Quality/Porte Frio idênticos. Fuso: convenção existente.

## Review Focus

- RQU4B93 (rastreador com atraso) em 28/09: NFs 'PASSOU NO ENDEREÇO…' saem 'SINAL DO RASTREADOR COM FALHA NO DIA - CONFERIR', não confirmadas (Task 1 testa).
- Placa com sinal normal e 'NÃO FOI' real (RQU1G17 2394872…): continua 'NÃO FOI AO CLIENTE' (Task 1 testa).
- NF confirmada (ENTREGUE) de placa com falha de sinal: continua ENTREGUE (Task 1 testa).
- TOS5E38 28/09: NF 216155 da carga PAO-14 (Niterói) sai 'PLACA COM DUAS CARGAS EM REGIÕES DIFERENTES - CONFERIR PROGRAMAÇÃO', não 'NÃO FOI' (Task 2 testa); placa que visitou as duas regiões normalmente: nada muda.
- Correção automática noturna: nunca sobrescreve fonte `manual`/`verificacao_manual`; acima do teto não grava nada; sempre grava backup antes (Task 3 testa).

---

### Task 1: "SINAL DO RASTREADOR COM FALHA NO DIA"

**Files:** Modify `src/lib/kpi-romaneio/agregacao.ts` (bloco de classificação; usar `apagaoDeSinalPropriaPlaca`), `src/lib/kpi-romaneio/gerador-xlsx.ts` se houver mapeamento de rótulos/confiança; Test `agregacao.test.ts`.

- [ ] Testes que falham: com `modoPrecisao` e `apagaoDeSinalPropriaPlaca=true`, NF pendente com rótulo 'PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA - CONFERIR', 'NÃO FOI AO CLIENTE (…)' ou 'SEM CONFIRMAÇÃO' → observação exata `SINAL DO RASTREADOR COM FALHA NO DIA - CONFERIR`, status pendente, sem horário; 'PARADA PRÓXIMA (500m-2km)…' e 'ENDEREÇO COM COORDENADA IMPRECISA…' NÃO mudam (têm evidência de posição); NF já ENTREGUE não muda; com `apagaoDeSinalPropriaPlaca=false` nada muda; sem `modoPrecisao` nada muda; SEM RASTREADOR / NÃO SAIU DA BASE / AGUARDANDO mantêm precedência.
- [ ] Implementar. Motivo/confiança internos: 'REVISAR'. Fica dentro da taxa (não confirmada). `npx vitest run` verde. Commit `feat(kpi): sinal do rastreador com falha no dia nao acusa o caminhao`.

### Task 2: Placa com duas cargas em regiões diferentes

**Files:** Modify `agregacao.ts`; Test `agregacao.test.ts`.

- [ ] Testes que falham (fixtures resumidas do caso real 28/09): placa com carga A (≥10 NFs, centróide dos clientes com geocode confiável) e carga B (poucas NFs, centróide a >60 km de A); a placa tem ≥50% das NFs de A confirmadas e nenhuma NF de B confirmada, com menor distância do trajeto da placa às NFs de B > 2 km → as NFs pendentes de B com rótulo 'NÃO FOI AO CLIENTE', 'SEM CONFIRMAÇÃO' ou 'PASSOU NO ENDEREÇO…' saem `PLACA COM DUAS CARGAS EM REGIÕES DIFERENTES - CONFERIR PROGRAMAÇÃO`; placa que visitou as duas regiões (NFs confirmadas em B) → nada muda; cargas a <60 km → nada muda; sem `modoPrecisao` → nada muda.
- [ ] Implementar (opt-in `modoPrecisao`, sem nova opção posicional). `npx vitest run` verde. Commit `feat(kpi): placa com duas cargas em regioes diferentes vira conferir programacao`.

### Task 3: Correção de coordenada noturna ligada, com teto e backup

**Files:** Modify `scripts/correcao-geocode-noturna.ts` (+ `.test.ts`), `scripts/corrigir-geocode-por-alvo.ts` se preciso; sem mudança de banco.

- [ ] Hoje o runner noturno roda `rodarCorrecao(..., { aplicar: false })`. Passar a aplicar SOMENTE quando a variável de ambiente `GEOCODE_NOTURNO_APLICAR=1` estiver presente (padrão continua só relatório) e SOMENTE as sugestões cuja fonte é o cadastro Unitrac confirmado por parada GPS (regra H+K1: parada da própria placa ≤300 m do cadastro no horário do feito, nossa coordenada >500 m da parada). Guardas: teto de 30 correções por noite (acima disso não grava NADA e escreve no log 'excedeu o teto — revisão manual'); nunca sobrescreve `fonte` `manual` ou `verificacao_manual`; grava backup CSV (`endereco;lat;lng;confiavel;fonte;motivo` anteriores) em `relatorios-geocode/AAAA-MM-DD/backup-antes-aplicar.csv` ANTES do upsert; falha em qualquer upsert → sai com erro e loga quais gravou.
- [ ] Testes: montagem do lote (filtro de fonte/regra, teto, proteção de fontes), backup gerado antes do upsert (mock), variável ausente → não grava. `npx vitest run` verde. Commit `feat(kpi): correcao noturna de geocode aplica so regra forte, com teto e backup`.
- [ ] O cron só recebe `GEOCODE_NOTURNO_APLICAR=1` no deploy, depois de rodar uma vez manualmente para o dia anterior e conferir o CSV.

### Task 4: Medição, revisão e deploy

- [ ] Gerar 22/23/24/25/26/28 numa cópia (PDFs 22–25 em `/tmp/kd/`; 26 e 28 pelo storage / `/tmp/kd/e28.pdf r28.pdf`); trava → 0; reportar por dia a linha TAXA (hoje: 22 95,4 · 23 93,2 · 24 94,9 · 25 91,2 · 26 96,8 · 28 95,6), quantas NFs receberam cada rótulo novo, quais placas, e que nenhum "entregue da equipe" virou pior.
- [ ] Revisão final. Deploy com OK dado em 29/09 ("melhora tudo"): push definitivo + TEMP, pull/build/restart, HTTP 200; ligar `GEOCODE_NOTURNO_APLICAR=1` no cron só depois do teste manual.
