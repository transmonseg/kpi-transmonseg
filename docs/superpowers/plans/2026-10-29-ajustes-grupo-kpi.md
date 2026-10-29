# Ajustes do grupo KPI AJUSTES (16–29/10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o que a operação (Ana) reportou no grupo KPI AJUSTES nas duas últimas semanas.

**Architecture:** Mudanças pequenas e isoladas no KPI (branch `ajustes-grupo-2910` a partir da main `47b9224`, que é o que está em produção; o branch `fase4` NÃO entra). Ponte da Fusion corrigida na infra (sshd do servidor + LaunchAgent do Mac). Deploy manual no transmonseg-vps + espelho no TEMP.

**Tech Stack:** Next.js 16, TypeScript, Vitest, pdfjs-serverless, pm2/Caddy no Contabo, launchd no Mac.

**Spec:** levantamento do grupo nesta conversa (58 mensagens, 16 prints, 5 arquivos; mídias em scratchpad `kpiaj/`).

## Global Constraints

- Nunca inventar dado: linha do PDF que não fecha (sem NF ou sem placa) é descartada, não preenchida.
- Formato antigo da Porte Frio continua aceito (fallback), sem mudar a saída dele.
- Dia fechado só é regravado com OK do dono — a investigação do 23/10 (Task 5) é só leitura.
- Troca de placa nunca é aplicada sozinha (princípio de `sugerir-trocas.ts`) — o item "RQO5E38 recorrente" fica como está.
- Textos de tela em PT-BR simples, para a operadora (sem hash de commit).

## Review Focus

- PDF novo com linha quebrada (endereço longo em 2 linhas, ex. "ESTRADA DA BARRA DA TIJUCA, EM FRENTE AO…") → a NF continua uma linha só, endereço completo.
- Placa com hífen ("RBI-1J86") → normalizada para "RBI1J86" (é o que a Ravex resolve).
- Mesmo cliente com 2 NFs no mesmo carro → 2 linhas, cada uma com sua visita (chave = NF).
- Arquivo da Rio Quality errado (Relatório de Custos) → mensagem diz qual arquivo foi subido e qual é o certo.
- Ponte da Fusion: Mac troca de rede → túnel volta em ≤ 2 min (sessão morta no servidor cai sozinha).

---

### Task 1: Parser do formato novo da Porte Frio ("PROGRAMAÇÃO JAC")

**Files:**
- Create: `src/lib/kpi-portefrio/parse-programacao.ts`
- Modify: `src/lib/kpi-portefrio/parse-romaneio.ts` (`parseRomaneioPortefrio` tenta o antigo; 0 linhas → tenta o novo)
- Test: `src/lib/kpi-portefrio/parse-programacao.test.ts` (fixture: PDF real de 27/10 em `src/lib/kpi-portefrio/__fixtures__/programacao-jac-2026-10-27.pdf`)

**Interfaces:**
- Produces: `parseProgramacaoPortefrioTexto(itens: ItemComPagina[]): LinhaRomaneioPortefrio[]`
- Mapeamento: `placa` = placa do bloco CARRO sem hífen; `codigoCliente` = NF; `razaoSocial` = CLIENTE; `nomeInformal` = ''; `endereco`/`numero` = ENDEREÇO separado na última vírgula (sem vírgula → tudo em `endereco`); `bairro` = BAIRRO; `cidade` = 'RIO DE JANEIRO'; `uf` = 'RJ'; `cep` = ''; `ordem` = ORDEM.
- Colunas por posição x calibradas pelo cabeçalho de cada bloco (ORDEM, NOTA FISCAL, CLIENTE, ENDEREÇO, BAIRRO, QTD CAIXAS); linha-âncora = a que tem NF de 6+ dígitos na coluna NOTA FISCAL; linhas sem âncora juntam na âncora mais próxima em Y (mesma técnica do parser antigo).

- [ ] Teste: fixture de 27/10 → 58 linhas; 10 placas distintas; primeira = `{placa:'RBI1J86', codigoCliente:'217646', razaoSocial:'HORTIFRUTI HUMAITA', endereco:'RUA DO HUMAITA', numero:'150', bairro:'HUMAITA', ordem:5}`; NF 217622 com endereço começando em 'ESTRADA DA BARRA DA TIJUCA, EM FRENTE AO'; nenhuma linha com `codigoCliente` vazio.
- [ ] Teste: `parseRomaneioPortefrio` no fixture antigo (testes existentes) continua igual.
- [ ] Rodar → falha; implementar; rodar → passa.
- [ ] Rodar gerar ponta a ponta a seco (geocode + Ravex) no PDF de 27/10 via script local e conferir que sai xlsx com visitas.
- [ ] Commit.

### Task 2: Mensagem certa quando a Rio Quality sobe o arquivo errado

**Files:**
- Modify: `src/lib/kpi-rioquality/pipeline.ts:270` e o parser do arquivo único (expor os cabeçalhos lidos)
- Test: `src/lib/kpi-rioquality/*.test.ts` existente da pipeline

- [ ] Teste: planilha com cabeçalho de Relatório de Custos (colunas de custo/frete, sem Endereço/Bairro) → erro `'Esse arquivo parece ser o Relatório de Custos. Suba o Relatório de Entregas do dia (colunas Razão Social, Cidade, UF, Destino, Motorista, Placa, Endereço e Bairro).'`; outro arquivo qualquer → mensagem atual + `Colunas encontradas: …` (até 8).
- [ ] Implementar, passar, commit.

### Task 3: Textos do Ao vivo que confundem

**Files:**
- Modify: `src/lib/kpi-romaneio/versao-regras-aviso.ts` (+ teste), `src/app/painel/ao-vivo/fila-conferir.tsx:98`

- [ ] Aviso de versão sem hash: sem versão → `'Este dia foi calculado antes da atualização das regras de 24/10. A taxa dele pode não bater com a dos dias mais novos.'`; versão diferente → `'Este dia foi calculado com regras anteriores às atuais. A taxa dele pode não bater com a dos dias mais novos.'` (hash vai só no `title`).
- [ ] "faltam N para a meta" passa a dizer o que é: `faltam N entregas no dia para a meta de 97% (contando as que ainda estão aguardando)`.
- [ ] Testes passam, commit.

### Task 4: Ponte da Fusion volta sozinha (infra)

- [ ] Servidor: `ClientAliveInterval 30` + `ClientAliveCountMax 3` em `/etc/ssh/sshd_config.d/90-clientalive.conf`, `sshd -t`, `systemctl reload ssh` (backup não necessário: arquivo novo).
- [ ] Mac: instalar o plist do repo (`tunnel.sh` com data em cada linha) — `launchctl bootout` + copiar + `bootstrap`; conferir `curl -x http://127.0.0.1:8899 https://fusiondms.com.br/login.html` = 200 no servidor.
- [ ] Teste: matar o túnel (`kill` do ssh) → em ≤ 2 min o servidor volta a responder 200.

### Task 5: Investigar o 23/10 da Nutry (91,09% da Ana × 93,7% no calendário) — só leitura

- [ ] Abrir a geração de 23/10 e a planilha da Ana (`KPI-Nutry-Max-2026-10-23.xlsx`): explicar a diferença de denominador (fora da conta / sem rastreador).
- [ ] Para RQU2G47, TOS0G53, RBJ2J67, RBI0J25: o GPS mostra outra placa nos endereços (troca não confirmada)? Listar, com números, e o quanto a taxa mudaria. Não regravar — levar ao dono.

### Task 6: Verificar, deploy, espelho

- [ ] `npx vitest run` + `npx tsc --noEmit` + `npm run build` no worktree.
- [ ] Merge na main, push, `deploy.sh` no transmonseg-vps, pm2 ok, tela Porte Frio gera com o PDF de 27/10 em produção.
- [ ] Espelhar no KPI TEMP (diff de árvore) e push.
- [ ] Atualizar memória.
