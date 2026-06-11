# KPI (API Beta) — Validação e correção via API do Unitrac

**Data:** 2026-06-11
**Autor:** Joaquim Salles (via brainstorming)
**Status:** Design aprovado, aguardando plano de implementação

---

## Contexto e problema

O KPI Transmonseg cruza escalas de motorista com o relatório de rastreamento do Unitrac (hoje importado manualmente em PDF/XLSX) para gerar o KPI de entregas por rede. O matching de loja e a leitura de placas/horários falham em alguns casos, que caem na revisão manual.

O Unitrac expõe uma API interna (`datalayer.portalunitrac.com`, sem autenticação) que serve os mesmos dados em tempo real e estruturados. Uma auditoria cruzando o cadastro do KPI com essa API (gabarito) revelou bugs concretos:

- **2 lojas com coordenada errada** (Zona Sul Jd Botânico: 1.738 m de erro; Superprix Tijuquinha: 880 m) → matching geográfico falha sempre.
- **30 lojas sem coordenada** → matching geo impossível.
- **28 lojas com rede "DESCONHECIDO"** → classificação falhou.
- **118 lojas com raio divergente** do cadastrado no Unitrac.

A ideia: usar a API como fonte de verdade para corrigir esses dados e validar o KPI no momento da geração, **numa versão de teste isolada** que não toca o sistema de produção até ser validada.

## Decisões tomadas (brainstorming)

1. **A API é a fonte da verdade.** É o relatório oficial; quando o sistema detectar algo estranho/incompleto, puxa a API, corrige e **marca a origem do dado como "via API"** (rastreável visualmente).
2. **Quatro gatilhos** disparam a consulta automática à API:
   - Placa incompleta / não reconhecida
   - Parada sem loja identificada
   - Rota "concluída" suspeita
   - Horário de chegada/saída faltando ou estranho
3. **Fonte de dados:** conta Benassi (`transmonseg`, codUser **4586**) na API `datalayer.portalunitrac.com`.
4. **Timing:** KPI é gerado no mesmo dia da operação (D0), após a rota fechar. A API está sempre atualizada e tem os dados do dia, então a validação sempre funciona. Se o carro ainda está rodando, o KPI não fecha (comportamento correto, mantido).
5. **Isolamento (aprovado):** a versão beta **NÃO altera o banco de produção**. As correções valem só no cálculo do KPI beta. Correções de cadastro (coordenadas, raios) são exibidas num quadro "correções que eu aplicaria", aplicadas no banco real só após aprovação manual futura.
6. **Best-effort:** se a API não responder, o KPI beta funciona idêntico ao KPI normal — nunca quebra a geração.

## Arquitetura

Abordagem escolhida: **Motor de API + checagem nos pontos de gatilho** (Opção 1), encapsulada numa **versão beta isolada** da tela de geração.

### Componentes

**1. Motor de API — `src/lib/unitrac-api/`** (novo módulo, isolado e testável)
- `client.ts` — acesso HTTP ao `datalayer.portalunitrac.com` (best-effort, timeout curto, sem throw para o chamador).
- `frota.ts` — `buscarFrota(codUser)` → lista de placas/cv (cache curto em memória por execução).
- `pontos.ts` — `buscarPontos(cvs)` → pontos de entrega (alvos) com `pontoidentificador`, nome, lat/lon, raio. Chave de cruzamento: `codigo_unitrac` (KPI) ↔ `pontoidentificador` (API).
- `paradas.ts` — `buscarParadas(cv, horas)` → paradas reais com início e duração.
- `posicoes.ts` — `buscarPosicoes(cvs)` → posição ao vivo (para validar rota concluída).
- `index.ts` — fachada com as 4 funções de gatilho que recebem o caso suspeito e devolvem a correção (ou `null` se a API não ajudou).

**2. UI Beta — `src/app/painel/kpi/beta/page.tsx`** (espelho da `kpi/simples`)
- Mesma experiência de upload/geração da tela atual.
- Selo "BETA" no cabeçalho.
- Campos corrigidos via API exibem um marcador visual **"via API"**.
- Contador no topo: "N correções via API neste KPI".
- Quadro separado "Correções de cadastro que eu aplicaria" (read-only, não grava).

**3. Rota de geração — `src/app/api/kpi/beta/route.ts`** (espelho de `api/kpi/simples`)
- Roda o mesmo pipeline de geração do KPI simples.
- Instrumenta os 4 pontos de gatilho chamando o motor de API.
- Anota cada correção com `origem: 'api'` no resultado retornado (não persiste no banco de produção).

**4. Navegação — `src/app/painel/nav.tsx`**
- Adiciona o leaf `{ href: '/painel/kpi/beta', label: 'Gerar KPI (API Beta)' }` no grupo "KPI".

### Os 4 gatilhos (onde o motor liga)

| Gatilho | Detecção (no pipeline atual) | Ação do motor | Dado da API |
|---------|------------------------------|---------------|-------------|
| Placa incompleta | parser não normalizou / placa ausente no cadastro | completa pela frota | `buscarFrota(4586)` |
| Parada sem loja | parada não casou com nenhuma loja | acha loja pela coordenada (raio) | `buscarPontos` |
| Rota concluída suspeita | KPI marca concluído mas há sinal estranho | confere posição/entregas pendentes | `buscarPosicoes` / `buscarPontos` |
| Horário faltando/estranho | chegada/saída ausente ou fora de faixa | usa início+duração da parada real | `buscarParadas(cv, 48)` |

### Fluxo de dados

1. Usuário sobe escalas + relatório na tela **KPI (API Beta)**.
2. Pipeline de geração roda igual ao KPI simples.
3. Em cada um dos 4 pontos de gatilho, o caso suspeito é passado ao motor de API.
4. Motor consulta `datalayer` (Benassi 4586), devolve correção ou `null`.
5. Correções entram no resultado marcadas `origem: 'api'`.
6. Tela mostra o KPI com os selos "via API" e o quadro de correções de cadastro sugeridas.
7. Nada é gravado no banco de produção.

### Tratamento de erro

- Toda chamada à API é best-effort: timeout curto, captura de exceção, retorno `null`.
- Falha de API nunca interrompe a geração — o caso segue o comportamento atual (revisão manual).
- A indisponibilidade da API (ela é aberta e pode ser fechada a qualquer momento) é tratada como "sem correção", não como erro.

## Como validar

- A equipe gera o mesmo dia nas duas telas (KPI normal e KPI API Beta).
- Comparar: a beta deve ter **menos casos na revisão** e **mais matchs corretos**.
- O contador "N correções via API" e os selos tornam visível o que a API resolveu.
- O quadro de correções de cadastro permite conferir manualmente as 2 coordenadas erradas e as 30 sem coord antes de qualquer alteração real.

## Fora de escopo (YAGNI)

- **Não** integrar o motor no KPI normal (produção) — só na beta.
- **Não** gravar correções no banco de produção (cadastro de lojas) — apenas sugerir.
- **Não** implementar comandos/ações (bloqueio etc.) — só leitura.
- **Não** substituir o parser de PDF/XLSX — a API é validação/complemento, não troca a entrada.
- **Não** depender da API para a geração funcionar — best-effort sempre.

## Riscos

- A API `datalayer` é aberta e sem auth; pode ser fechada/alterada a qualquer momento. Mitigação: best-effort + isolamento na beta (não cria dependência em produção).
- Mapeamento `codigo_unitrac` ↔ `pontoidentificador` validado na auditoria (formatos batem), mas pode ter exceções; tratar não-match como "sem correção".
