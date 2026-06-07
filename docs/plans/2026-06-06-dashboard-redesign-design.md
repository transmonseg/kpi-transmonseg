# Redesign do Dashboard — design

**Data:** 2026-06-06 · **Decisão:** Joaquim (direção aprovada na conversa)

## Problema
A aba "Visão geral" é **um scroll gigante com ~10 seções empilhadas** (hero, mix de
status, por rede, 5 métricas de tempo, evolução, horário de volta, rotas demoradas,
maior tempo, por motorista, entregas/dia). Sem hierarquia executivo×detalhe → confuso.
O relatório PDF (`/api/dashboard/relatorio`) também é básico.

## Princípio (pesquisa 2024-2025)
Overview + drilldown: **1 tela executiva** (o que se olha todo dia) + caminhos de
detalhe. Tabs por tarefa (≤4). Filtros em header fixo. Hero tiles com variação vs
período anterior + cor. Backend (`dashboard-metricas`) JÁ calcula tudo → é 99%
reorganização de frontend, baixo risco.

## Solução — 3 sub-views dentro da "Visão geral"
Segmented control (Resumo · Por rede · Detalhe) logo abaixo dos filtros. Mapeamento
das seções atuais de `Conteudo` (dashboard-client.tsx):

| Sub-view | Seções (das atuais) |
|---|---|
| **Resumo** (executivo, default) | hero tiles (`data-tour=resumo`) · mix de status · loja com mais problema (`agir`) · entregas por dia (tendência) |
| **Por rede** | Desempenho por rede (com meta/cor) |
| **Detalhe** | 5 métricas de tempo + evolução dos tempos · horário de retorno · rotas mais demoradas · maior tempo parado · visão por motorista |

### Header de filtros "fixo"
Período + input de data + chips de rede ficam num bloco `sticky top-0` (com leve
blur/sombra) — não somem ao rolar. O botão **"Gerar relatório"** fica ao lado.

### Hero tiles com variação
Cada tile (taxa de entrega, não foi, sem rastreador, tempo médio loja, tempo médio
rota): número grande + **"▲12% vs período anterior"** (de `mAnt`, já buscado) + cor
(verde/âmbar/vermelho conforme a métrica). Hoje o `mAnt` é subutilizado.

### Relatório PDF — melhorar o atual (react-pdf, SEM dependência externa)
`/api/dashboard/relatorio` passa a render: **capa + resumo executivo (1 pág com os 5
KPIs + variação) + snapshot por rede + apêndice de definições**. NÃO usar
`elegant-reports` (API externa Nutrient + chave = fragilidade/custo). Mantém react-pdf.

## Não-objetivos (YAGNI)
- Não mexer no cálculo das métricas (`dashboard-metricas`) — já está certo/testado.
- Não criar abas top-level novas (mantém geral/inserir/histórico).
- Não adicionar dependência de gráfico nova se o que existe já desenha.

## Fases (ordem de valor)
1. **Layout:** quebrar `Conteudo` nas 3 sub-views + header sticky. (80% do "menos confuso".)
2. **Hero tiles** com variação vs período anterior + cor.
3. **Relatório PDF** executivo melhorado.

## Skills
`ui-ux-pro-max` (design) + `frontend-design` (build). Pula `elegant-reports`.

## Testes/validação
- tsc + lint + build verdes; o backend já tem testes (`dashboard-metricas.test`).
- Conferência visual local por fase (é UI).
