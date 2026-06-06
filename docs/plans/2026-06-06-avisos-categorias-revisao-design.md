# Design — Avisos e categorias de revisão no KPI

**Data:** 2026-06-06
**Status:** aprovado (Joaquim)

## Problema

Casos que hoje viram `NAO_FOI_AO_CLIENTE` genérico (ou pior, "entregue" errado)
parecem **erro do sistema**, quando na verdade são **dado faltando / ambiguidade /
operação divergente**. Comprovado no E2E real do 06.06 (PREZUNIC SPID):

- **Méier** — 2 lojas Prezunic coladas (~80m: `PREZUNIC MEIER` 7000729 + `PREZUNIC
  SPID MÉIER` 7000737); relatório sem código → geo não decide qual.
- **Jacarepaguá / Parque das Rosas** — loja sem `codigo_unitrac`/coord → impossível
  rastrear.
- **Freguesia** — caminhão entregou na Vista Alegre (loja fora da escala) → matcher
  credita a entrega à linha errada.
- **Glória / Centro** — relatório parcial (gerado cedo); já tem banner.

## Objetivo

Classificar cada motivo de revisão numa **categoria** com **natureza**, e usar essa
classificação em 3 formas de aviso, pra o operador/Tia Érica saber exatamente o que
resolver. **Não altera o matching** — só classificação e exibição.

## Categorias

| Categoria | Detecção | Natureza | Texto |
|---|---|---|---|
| `LOJA_SEM_CADASTRO` | loja esperada sem `codigo_unitrac` OU sem coord, e linha sem parada | `dado` | "Loja sem cadastro no Unitrac — impossível rastrear. Cadastrar." |
| `LOJA_AMBIGUA` | existe outra loja da mesma rede (fungível) a ≤120m da esperada, linha sem parada | `dado` | "2 lojas no mesmo ponto ({outra}). Relatório sem código — confirmar qual." |
| `ENTREGOU_FORA_ESCALA` | parada LOJA casada com `codigo_loja` cujo nome diverge muito (matchScore > 4) da loja da escala | `operacao` | "Entregou em loja fora da escala ({lojaReal}). Conferir rota." |
| `RELATORIO_PARCIAL` | reaproveita o `avisoParcial` já existente (rede) | `relatorio` | (banner atual) |

**Natureza** (`dado` / `operacao` / `relatorio` / `sistema`) separa "não é erro do
sistema" de "erro real" — sem feature extra. Categorias existentes (placa
desatualizada, mudou de rota, sem rastreador, troca) recebem natureza também, pra
o resumo ser completo.

## Arquitetura / fluxo de dados

1. **`status-rota.ts`**
   - Novo tipo `CategoriaRevisao` e `NaturezaRevisao`.
   - `DadosStatusRota` ganha flags: `lojaSemCadastroUnitrac?`, `lojaAmbiguaComGemea?: {outra: string} | null`, `entregouLojaForaEscala?: {lojaReal: string} | null`.
   - `ResultadoStatus` ganha `categoria: CategoriaRevisao | null` e `natureza: NaturezaRevisao | null`.
   - `derivarStatus` emite categoria+natureza+motivo pras novas detecções (prioridade ALTA — antes dos fallbacks genéricos `NAO_FOI_AO_CLIENTE`). Função continua pura/testável.
   - Mapas `CATEGORIA_LABEL`, `CATEGORIA_NATUREZA`, `NATUREZA_STYLE` (cor/ícone) pra UI.

2. **`route.ts` (kpi/simples)** — computa as flags novas onde já tem `lojas` + loja esperada:
   - sem-cadastro: esperada `codigo_unitrac == null || lat/lng == null`.
   - ambígua: varre `lojas` da rede fungível, acha outra (≠ esperada) a ≤120m.
   - fora-escala: a parada LOJA casada resolve a uma loja cujo `matchScore` vs `loja_nome_raw` > 4.
   - Passa pro `derivarStatus`. Acrescenta `categoria`/`natureza` no objeto da linha.

3. **`types/kpi.ts`** — `KpiLinha` ganha `categoriaRevisao` + `natureza`.

4. **UI `page.tsx`**
   - Per-linha: selo colorido pela `natureza` + o `motivoRevisao` (já renderizado).
   - Painel-resumo no topo da rede: agrupa contagem por categoria das linhas que `revisar`. Ex: "⚠️ 2 lojas sem cadastro · 1 ambígua · 1 fora da escala".

## Erros / bordas
- Sem loja esperada resolvida → nenhuma categoria nova (cai no comportamento atual).
- `LOJA_AMBIGUA` só quando linha sem parada (se casou, não é problema).
- Prioridade: sem-cadastro > ambígua (se as duas baterem, sem-cadastro vence).
- Categorias novas só refinam linhas que JÁ iriam pra revisão — não criam falso "erro" novo nem mudam status de entrega confiável.

## Testes
- `status-rota.test.ts`: 1 caso por categoria nova (sem-cadastro, ambígua, fora-escala) + checagem de natureza.
- Detecção de ambígua/fora-escala (helper) com coords reais (Méier).
- Suíte inteira verde (regressão).

## Não-objetivos (YAGNI)
- Não muda o matcher nem o resgate geo.
- Não cria tela nova — reaproveita a de revisão.
- Não persiste categorias no banco (derivadas em tempo de geração).
