# Design — Upgrade visual das alterações (tela do operador)

> Brainstorming → design aprovado pelo Joaquim. Escopo travado: **só UI**, tudo em
> código (SEM IA, sem parser de texto, sem backend). Foco: a tela do operador
> (`painel/kpi/simples`) mostrar **com clareza o que foi alterado**.

## Problema
O `AlteracoesCard` mostrava Entra/Sai como texto plano; a lista de confirmadas nem
mostrava o "sai". O operador tinha que comparar de cabeça pra ver o que mudou.

## Solução (componente `AlteracaoDiff`)
Para cada alteração, compara `entra` × `sai` e mostra:
- **Badge do que mudou**: "Trocou o carro" / "Trocou o motorista" / "Trocou motorista
  e carro" / "Entrada nova" — com cor por tipo.
- **SAI → ENTRA** empilhado, com o **campo que mudou destacado** (placa nova ou nome
  novo em negrito/sublinhado) e dica "(mesmo motorista)" / "(mesmo carro)".
- **Aviso "Não consegui identificar"** (card vermelho) quando falta o essencial
  (loja ou quem entra), listando os problemas + o texto original pra conferência.
- **Avisos menores** (placa parece inválida, confiança baixa) numa linha âmbar.
- **Resumo no topo**: "4 alterações · 2 de carro · 1 de motorista · 1 inclusão".

Aplicado em DOIS lugares: lista de **confirmadas** (agora mostra o sai) e os
**previews** a confirmar.

## Não-objetivos (YAGNI)
- Sem IA, sem parser de texto livre, sem mudança no documento final do cliente,
  sem alteração de backend. Só apresentação.

## Implementação
Tudo em `src/app/painel/kpi/simples/page.tsx`: helpers `analisaMudanca`,
`MUDANCA_STYLE`, `resumoMudancas` + componentes `SlotView` e `AlteracaoDiff`.
Removidos `fmtSlot`/`TIPO_LABELS` (substituídos). tsc limpo, build OK, sem novo lint.
