# Dashboard: reorganização + página de rankings + mapa enriquecido

**Data:** 2026-06-20
**Cliente:** Benassi (rastreamento/segurança de carga) — projeto kpi-transmonseg
**Status:** aprovado (design), aguardando revisão da spec

## Objetivo

O dashboard cresceu sem ordem clara, tem gráficos com espaço vazio ao lado, e todos os rankings são cortados em top-N sem como ver o resto. O cliente quer: ordem que faça sentido, visual sem buracos, ver **tudo** quando quiser, e o mapa de risco com o **máximo de informação útil**. Para um cliente de segurança de carga, o risco (paradas indevidas) deve ganhar destaque.

## Decisões aprovadas pelo cliente

1. **Nova ordem** com Segurança da carga subindo pro topo (logo após os números).
2. **"Ver tudo" = página separada** de rankings (`/painel/rankings`) com tabelas completas, ordenáveis e com busca.
3. **Mapa** ganha: ranking de placas que mais param + filtro por gravidade + contador total/por rede. (Endereço no popup ficou **fora** de escopo.)

## Escopo

### 1. Reordenar o dashboard (`dashboard-client.tsx`, componente `Conteudo`)

Nova ordem das seções:

| Nº | Seção | Origem hoje |
|----|-------|-------------|
| — | Resumo executivo + Alertas | mantém no topo |
| 01 | Números do dia | atual "01 Como foi a operação" |
| 02 | 🛡️ Segurança da carga (paradas indevidas + mapa) | atual "03" — **sobe** |
| 03 | Onde agir | atual "02" — **desce** |
| 04 | Por rede | atual "04" |
| 05 | Tendências & frota | atual "05" + ranking de placas mais ativas |

Mudança é só de **ordem e numeração** dos blocos JSX existentes (mover `<SecaoRiscoMapa>` pra antes de "Onde agir", renumerar os `SecaoHead n="..."`). Sem reescrever o conteúdo das seções.

### 2. Página de rankings (`/painel/rankings`)

**Arquivos:**
- `src/app/painel/rankings/page.tsx` — server component: checa auth (mesmo padrão do dashboard), renderiza o client.
- `src/app/painel/rankings/rankings-client.tsx` — client: lê `periodo`/`data`/`de`/`ate`/`redes` da URL (querystring), faz os mesmos fetches do dashboard (`/api/dashboard` → `Metricas`; `/api/dashboard/beta` → `resumoApi`), renderiza todas as tabelas.
- `src/app/painel/rankings/tabela-ranking.tsx` — componente genérico reutilizável (ver abaixo).

**Tabelas (todas completas, sem top-N):**
- Paradas indevidas (por placa: nº de paradas, tempo total, parada mais longa, hora, local)
- Placas que mais param (ranking por nº de paradas — derivado de `resumoApi.pontosRisco`/`topIndevidas` agrupado por placa)
- Lojas com problema (sem GPS + não foi)
- Rotas mais demoradas (CD → loja)
- Tempo em loja / Tempo total
- Motoristas
- Sem rastreador / Não foi / Em análise (lojas)
- Placas mais ativas (volume)

**Fonte de dados:** os arrays já existem em `Metricas` (`topSemRastreador`, `topNaoFoi`, `topIndefinido`, `topRotasDemoradas`, `topTempoEmLoja`, `topTempoTotal`, `topMotoristas`, `placasMaisAtivas`) — hoje cortados em 15/20. Para a página de rankings mostrar **tudo**, os cortes `.slice(0, N)` em `dashboard-metricas.ts` desses campos sobem para um teto alto (ex.: 500) ou são removidos; o dashboard continua cortando na exibição (top-15) via `.slice` local no `Conteudo`. Assim a fonte carrega tudo e cada tela decide quanto mostrar.

**Navegação:** cada ranking no dashboard ganha um link `Ver todos (N) →` apontando para `/painel/rankings?<mesma querystring>#<ancora>`. A página de rankings ancora (scroll) na tabela certa.

### 3. Componente `TabelaRanking` (genérico)

```ts
type ColunaRanking<T> = {
  chave: string
  titulo: string
  alinhar?: 'left' | 'right'
  numerico?: boolean                 // ordenação numérica + fonte tabular
  render?: (linha: T) => React.ReactNode
  valorOrd?: (linha: T) => number | string  // valor usado pra ordenar (default: linha[chave])
  buscavel?: boolean                 // entra no filtro de busca
  href?: (linha: T) => string        // linha clicável (ex.: detalhe da loja)
}

function TabelaRanking<T>(props: {
  titulo: string
  ancora: string                     // id pra deep-link (#paradas, #motoristas, ...)
  colunas: ColunaRanking<T>[]
  linhas: T[]
  buscaPlaceholder?: string
}): JSX.Element
```

- Estado interno: coluna de ordenação + direção (asc/desc), termo de busca.
- Clicar no cabeçalho ordena; clicar de novo inverte (com `aria-sort`).
- Input de busca filtra por colunas `buscavel`.
- Mostra contagem ("N resultados"); estado vazio amigável.
- Reaproveita tokens visuais do dashboard (CARD, cores, `text-numeric`).

### 4. Mapa enriquecido (`mapa-risco.tsx` + `SecaoRiscoMapa`)

- **`PontoRisco` ganha `rede?: string`** (preenchido no backend — ver item 6).
- **Estado de filtro por gravidade** vive em `SecaoRiscoMapa` (`'todas' | 'moderada' | 'alta' | 'critica'`); passa os pontos filtrados ao `MapaRisco`. A legenda do mapa vira **clicável** (toggle) e dispara o filtro via callback.
- **Cabeçalho do mapa**: total de paradas indevidas no período + quebra por rede (usa `ponto.rede`).
- **Ranking de placas que mais param** ao lado do mapa: agrupa pontos por placa → nº de paradas + tempo total parado, ordenado desc. Mostra top-N com `Ver todos →` pra `/painel/rankings#placas-param`.
- Layout: mapa + painel lateral (ranking) em grade que colapsa no mobile.

### 5. Zerar buracos de layout

Grades que podem deixar gráfico sozinho com vazio ao lado → padrão auto-fit já usado em Tendências:
- "Onde agir": `TopRotas` + `TopTempoLoja` (um pode ser null).
- "Por rede": `ComparativoRede` + `HeatmapDiaRede` (podem ser null) — confirmar auto-fit.
- `TempoStrip` com 3 tiles (evitar 2+1 vazio no mobile).

### 6. Backend: rede em cada parada de risco

- `montarResumoDeParadaRows(paradaRows, placaRede?: Map<string,string>)` passa a aceitar um mapa placa→rede e grava `rede` em cada item de `topIndevidas`/`pontosRisco`.
- O mapa placa→rede é montado a partir da escala do dia (`escalaRows` tem `rede_id` + `placa_norm`), disponível tanto em `gerarDiaApi` quanto em `/api/kpi/simples`.
- `ResumoDiaApi` ganha `rede?: string` nos itens; `carregarResumosApi` propaga.
- Compatibilidade: resumos antigos sem `rede` continuam válidos (campo opcional; quebra por rede mostra "sem rede" quando ausente).

### 7. Aproveitar dados ociosos

- `placasMaisAtivas` → tabela na página de rankings + bloco "frota" na seção 05.
- `topTempoTotal`, `topIndefinido` → tabelas na página de rankings.
- `andamentoPct` → badge "X% em andamento" perto da taxa (seção 01), quando > 0.

## Fora de escopo (YAGNI)

- Endereço/local no popup do mapa (cliente não pediu).
- Heatmap geográfico de zonas / clustering de pontos.
- Exportar tabelas (CSV/PDF) da página de rankings.
- Paginação nas tabelas (scroll + ordenação + busca bastam para os volumes atuais).

## Verificação

- `tsc --noEmit` e `eslint` limpos nos arquivos tocados.
- Validar **rodando** (screenshots via `scripts/dev/print-painel.mjs`): dashboard reordenado sem buracos; página `/painel/rankings` com tabelas ordenando/buscando; mapa com contador, filtro por gravidade e ranking de placas.
- Não regressar o fluxo crítico `/api/kpi/simples` (a mudança no backend é aditiva — `placaRede` opcional).
- Conferir dark mode (preto) em todas as telas novas.

## Riscos

- Página de rankings é tela nova com auth/layout próprios — seguir o shell do `/painel` pra herdar sidebar/tema.
- Remover os cortes de `Metricas` pode aumentar payload — limitar a um teto alto (ex.: 500) em vez de ilimitado.
- `rede` nos pontos depende da escala do dia estar presente no momento da geração; quando faltar, degradar pra "sem rede".
