# Relatório PDF honesto e nível consultoria (Benassi · Transmonseg)

Data: 2026-06-17
Status: aprovado (brainstorming) · aguardando review da spec

## Problema

O dashboard normal foi reformulado para ser honesto (taxa definitiva, 7 categorias,
"em análise" visível, selo provisório/final, alerta de baixa completude). O PDF
gerado em `src/lib/relatorio/Relatorio.tsx` NÃO acompanhou e hoje está atrás do
dashboard, com contradições internas:

1. O apêndice define "Taxa de entrega = realizadas ÷ programadas", mas o número
   impresso já é a taxa definitiva (`entregue/(entregue+não foi)`). A definição
   escrita contradiz o número mostrado.
2. Não mostra "em análise" (indefinido), "em rota" nem "desatualizado". Vive nas
   3 categorias antigas (entregue / não foi / sem rastreador).
3. A capa mistura denominadores: "X programadas · Y% entregues" lado a lado, sem
   dizer que Y% é só das conferíveis.
4. Não tem selo provisório/final.
5. Não tem métrica de completude/visibilidade (quanto da operação é verificável).
6. Não tem visualização do mix de status (o donut do dashboard não tem par).
7. Usa travessão "—" como placeholder de "sem dado" (viola a regra de não usar
   travessão).

A rota `src/app/api/dashboard/relatorio/route.ts` já alimenta o componente com
`calcularMetricas` atualizado, então os campos novos (`em_rota`, `indefinido`,
`taxaEntregaDefinitiva`, `porRede` definitivo etc.) JÁ chegam no `ctx.m`. Falta o
`Relatorio.tsx` e a narrativa usarem esses campos.

## Objetivo, público e sucesso

- Público: documento entregue ao cliente (Benassi). Tom institucional, impecável.
  Honestidade é argumento de confiança, não fraqueza.
- Sucesso: relatório nível consultoria, visualmente elevado, internamente
  consistente com o dashboard, sem nenhuma métrica inflada nem categoria escondida,
  validado vendo o PDF renderizado de verdade (não só build/tsc).

## Decisões aprovadas

1. **Métrica-estrela = visibilidade + taxa das conferíveis.** Separa falha de
   entrega (não foi) de pendência de rastreador (sem GPS / em análise). Formato:

   ```
   ENTREGAS CONFIRMADAS
   98%  (1.176 de 1.200 conferíveis)
   Visibilidade GPS: 73% da operação
   327 linhas sem confirmação: 280 sem rastreador · 47 em análise
   ```

   Isto protege o serviço: sem rastreador é pendência de cadastro, não culpa de
   entrega. "Conferíveis" = `entregue + não foi`.

2. **Escopo = redesign completo + honestidade.** Repagina capa e layout, eleva
   tipografia e acabamento, adiciona os elementos novos. Vira nível consultoria.

3. **Organização "confiança primeiro".** Logo após o sumário, uma página de
   confiança estabelece quanto da operação é verificável antes de qualquer taxa.

## Definições de métrica (fonte única da verdade)

Reaproveitam o que já existe em `dashboard-metricas.ts` (nada recalculado do zero):

- **Conferíveis** = `entregue + nao_foi` (denominador da taxa).
- **Taxa de entrega (definitiva)** = `taxaEntregaDefinitiva` = `entregue / conferíveis`.
  É o mesmo número que o dashboard mostra no hero. Igual a `m.pctEntregue`.
- **Fora da conferência** = `total - conferíveis` = `em_rota + mudou_de_rota +
  desatualizado + sem_rastreador + indefinido`.
- **Visibilidade GPS** = `com_rastreador / total` (cobertura de rastreamento).
- **Provisório** = existe `em_rota > 0` (mesma regra de `resumoDia`).
- **7 categorias** (somam exatamente `total`): entregue, em rota, não foi, mudou
  de rota, desatualizado, sem rastreador, em análise (indefinido).

Regra de honestidade transversal: o numerador nunca conta linha não confirmada; o
denominador da taxa nunca inclui "fora da conferência"; missing nunca vira zero
(linhas sem legenda nem horário aparecem como "em análise", não somem).

## Estrutura (8 páginas)

### 1. Capa
- Wordmark Benassi · Transmonseg (tipográfico; encaixa logo se houver depois).
- Título "Relatório de Operação" + período por extenso.
- **Selo Provisório/Final** (âmbar com "N em rota" / verde "Final").
- Uma frase de valor que resume o período em linguagem de dono.
- Rodapé fixo (Transmonseg · gerado em · página X de Y) em todas as páginas.

### 2. Sumário executivo
- 3 a 4 bullets em linguagem de dono, vindos da narrativa reescrita:
  métrica de ouro (confirmadas + visibilidade), maior oportunidade, top exceção,
  comparação vs período anterior quando houver.

### 3. Painel de confiança (página nova)
- **Barra empilhada de status** (componente novo `StackedBarPdf`) com as 7
  categorias somando 100%, legenda com rótulo + contagem + %.
- Tabela das 7 categorias (categoria, quantidade, % do total) que fecha no total.
- Três números de destaque: Confiáveis (taxa definitiva), Visibilidade GPS,
  Fora da conferência.
- Caixa curta "como lemos a taxa" (resumo do método; detalhe completo no apêndice).

### 4. Scorecard
- KpiCards com delta vs período anterior e uma linha de interpretação cada:
  Taxa de entrega (definitiva, com "de N conferíveis"), Não realizadas,
  Visibilidade GPS, Em análise, Tempo total, Tempo de rota, Tempo em loja.
- Desempenho por rede usando a **taxa definitiva** (`r.pctEntregue` já é definitiva).
  Colunas: Rede, Entregas, % entrega, Sem confirmação, Tempo médio.

### 5. Tendências
- Entregas por dia: coluna empilhada por status (entregue / em rota / não foi /
  sem rastreador / outros), fechando com o total do dia. Usa os campos que
  `PontoSerie` já tem (entregue, nao_foi, sem_rastreador, em_rota) e deriva
  "outros" = `total - esses` no componente, então a interface não muda.
- Evolução dos tempos (linha multi-série, já existe).
- Horário de saída do CD (coluna, já existe).
- Captions que respondem "o que isso implica" (pico de volume, pico de saída).

### 6. Exceções
- Lojas com mais ocorrências: cruza sem GPS + não foi + em análise (hoje só sem
  GPS + não foi). Colunas: Loja, Rede, Sem GPS, Não foi, Em análise.
- Rotas mais demoradas (barra horizontal, já existe).
- Maior tempo parado em loja (barra horizontal, já existe).

### 7. Recomendações
- Cards de ação vindos da narrativa, com foco em impacto. Inclui recomendação de
  reduzir "sem rastreador / em análise" (cadastro e instalação de rastreador), que
  é o que mais derruba a visibilidade, além das já existentes (recuperar taxa,
  otimizar rotas críticas).

### 8. Apêndice
- Top motoristas (tabela, já existe).
- **Definições corretas**: Taxa de entrega = entregue ÷ (entregue + não foi);
  Visibilidade GPS; Conferíveis; Fora da conferência; tempos; e o glossário das
  7 categorias (o que cada uma significa).
- **Caixa de cálculo auditável**: mostra os números exatos do período
  (entregue, não foi, conferíveis, taxa, total, fora da conferência por categoria),
  para o cliente reproduzir a conta.
- Nota de data/cobertura (período, redes incluídas, gerado em, % de visibilidade).

## Mudanças técnicas (arquivos)

- `src/lib/relatorio/tema.ts`: paleta de status (cores das 7 categorias, alinhadas
  ao dashboard: entregue=ok, em rota=info, não foi=bad, mudou/desatualizado=warn,
  sem rastreador=muted, em análise=muted claro). `fmtMin`/placeholder trocam "—"
  por "s/d". Helvetica nativa mantida.
- `src/lib/relatorio/charts-pdf.tsx`: novo `StackedBarPdf` (barra horizontal única
  empilhada por segmento, com legenda) e `StackedColumnPdf` (colunas empilhadas por
  status para a série diária). Reaproveita a matemática de escala existente.
- `src/lib/kpi/relatorio-narrativa.ts`: reescrita para o modelo de 7 categorias +
  taxa definitiva + visibilidade + completude. Sem travessão. Bullets em linguagem
  de dono. Recomendação nova para visibilidade baixa.
- `src/lib/relatorio/Relatorio.tsx`: nova capa com selo, página de confiança,
  scorecard e tabela por rede com taxa definitiva, tendências empilhadas, exceções
  com "em análise", apêndice com definições corretas + caixa de cálculo + glossário.
- `src/lib/kpi/dashboard-metricas.ts`: ganha apenas `topIndefinido`
  (`agrupaLoja('indefinido')`, reusando o helper que já existe) para a página de
  Exceções poder cruzar "em análise" por loja. `PontoSerie` NÃO muda: o empilhado
  diário deriva "outros" = `total - (entregue + nao_foi + sem_rastreador + em_rota)`
  no próprio componente, usando os campos que `PontoSerie` já expõe.

## Constraints

- Zero custo (free tier), sem dependência paga.
- `@react-pdf/renderer`, paleta navy, A4. Fontes nativas Helvetica.
- Português correto com acentos. **Nunca travessão** (placeholder = "s/d").
- Não recalcular métricas: tudo vem de `calcularMetricas`. XLSX/modelo oficial
  não é afetado (isto é só o PDF).

## Testes e verificação

- TDD onde fizer sentido: testes de unidade para a narrativa reescrita (bullets
  corretos, sem travessão, recomendação de visibilidade) e para o novo gráfico
  (escala/segmentos somam o total). O smoke de render do PDF (`relatorio.test.tsx`)
  continua passando com os mocks atualizados.
- `tsc --noEmit` limpo, `vitest run` verde, `npm run build` exit 0.
- **Verificação visual obrigatória**: renderizar o PDF de verdade (via rota ou
  script) e olhar página por página em screenshots antes de dar por pronto.

## Fora de escopo

- Mudanças no XLSX gerado (modelo oficial intocado).
- Mudanças no dashboard (já reformulado).
- Registrar fontes customizadas (pode vir depois, se o cliente quiser).
- Logo: usa wordmark tipográfico enquanto não houver arquivo de logo.
