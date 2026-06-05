# Design — 3 melhorias de robustez no KPI TransMonSeg

> Brainstorming → design aprovado pelo Joaquim (2026-06-05). Três melhorias
> escolhidas por ele. Contexto levantado nesta sessão.

## #2 — Banner forte de "relatório parcial"

**Problema:** o KPI gerado cedo demais (antes das entregas terminarem) é a maior
causa de falso erro percebido pela cliente. Hoje existe um `avisoParcial` por rede,
mas é uma nota pequena (fácil ignorar) e só dispara com ≥5 veículos e <20% entregue
— rede pequena (PAX, 12 linhas) ou meio-parcial não avisa.

**Solução:**
- Backend (`src/app/api/kpi/simples/route.ts`): baixar o limiar de `rastreados >= 5`
  para `>= 3` (pega rede pequena). Demais condições iguais.
- Frontend (`src/app/painel/kpi/simples/page.tsx`): **banner âmbar grande no topo**
  do resultado quando ≥1 rede tem `avisoParcial`: "⚠ N de M redes parecem geradas
  cedo — as entregas ainda não terminaram. Considere gerar de novo mais tarde."
  Mantém as notas por rede.
- Sem bloqueio de geração. YAGNI: nada de confirmar-antes-de-gerar.

**Teste:** visual + a mudança de limiar não quebra nada (lógica existente preservada).

## #3 — Parser de texto livre das alterações (heurística, SEM IA)

**Problema:** o parser de texto (`parseAlteracoesV2`) só entende prosa estruturada;
texto em formato de tabela ou frase livre dá zero. O usuário cola alteração em
qualquer formato (loja + frase com motorista/placa).

**Solução:** nova função `parseAlteracaoTextoLivre(texto, ctx)`:
- **Segmenta por placa**: acha TODA placa no texto (regex `[A-Z]{3}-?\d[A-Z0-9]\d{2}`).
  Cada placa âncora uma alteração (resolve "uma ou várias de uma vez").
- Por bloco (a linha/trecho ao redor da placa) extrai:
  - **placa** (âncora), **código** (2-7 dígitos próximos),
  - **loja**: casa o trecho contra as lojas conhecidas (reusa o `ctx`/lookup que o
    endpoint já monta com `buildLookupContext`),
  - **motorista**: tokens que parecem nome (não-loja, não-placa, não-código),
  - **rede**: inferida da loja casada.
- **Confiança**: alta se loja+placa; média/baixa se faltar algo. Baixa/sem-loja cai
  no aviso vermelho "não consegui identificar" (UI já existe).
- **Integração** (`analisar-alt/route.ts`, caminho de texto): roda a heurística +
  o parser de prosa atual e **mescla com dedupe** (por loja+placa) — não regride o
  que já funciona. Depois `inferirSaiDaEscala` preenche o "sai" (já funciona).

**Teste:** unit tests com vários formatos — frase solta, lista de várias, texto
grudado, com/sem código.

## #4 — Faxina de cadastro (seguro, sem chute)

**Problema:** ~57 lojas ativas sem `codigo_unitrac`. Algumas têm gêmea óbvia no
Unitrac (seguro preencher), outras têm coordenada embolada (ex: Atlantico Sul em
cima do Empório) e precisam de confirmação humana.

**Solução:** NÃO mexer em massa. Gerar um **relatório categorizado** das null-code:
- (a) gêmea clara no export do Unitrac → seguro preencher `codigo_unitrac`;
- (b) coordenada ambígua/embolada → Joaquim confirma caso a caso;
- (c) sem ponto no Unitrac → deixa como está (casa via geo).
Entregar a lista; Joaquim aprova as (a); migrar só essas via `apply_migration`.
(Parte de risco zero — 2 códigos fantasma — já foi feita hoje.)

## Não-objetivos (YAGNI)
- Sem IA em nenhuma das três.
- #2 não bloqueia geração. #4 não faz merge/dedup automático de cadastro.

## Ordem de execução
#2 (rápido, alto retorno) → #3 (maior, mais teste) → #4 (relatório + decisão do Joaquim).
