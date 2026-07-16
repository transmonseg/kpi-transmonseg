# Modo API no Gerar KPI Nutry Max — Design

**Status:** Aprovado
**Data:** 2026-07-15

## Contexto

O "Gerar KPI" do Benassi (`/painel/kpi/simples`) não depende só do PDF do
Unitrac — ele sempre completa os dados com a API ao vivo do Unitrac
(`buscarStopsCru` + `consolidaParadasApi`), e tem um toggle "Modo API" que
dispensa o PDF inteiramente, puxando as paradas só da API. O usuário pediu
que o "Gerar KPI" da Nutry Max funcione "literalmente igual".

Investigação prévia (ver `docs/superpowers/specs/2026-07-15-...` anteriores e
histórico de conversa) mostrou que boa parte do mecanismo do Benassi depende
de um cadastro de lojas com geofence que a Nutry Max não tem (modelo por
carga/placa, não por loja fixa) — então a réplica "literal" se aplica à parte
que É agnóstica de loja: buscar paradas reais via API como fonte alternativa
ou complementar ao PDF.

Durante a investigação também foi achado e corrigido um bug real e
independente: o marcador de texto que identifica "parada na garagem/CD" no
parser de PDF estava fixo em `"BASE BENASSI"`; a Nutry Max usa
`"BASE - BASE GARAGEM"`. Corrigido em `unitrac-pdf.ts` (parâmetro
`marcadorBase`, default Benassi inalterado) — commit `a13331c`. A coordenada
da base da Nutry Max foi derivada dos próprios dados reais após o fix:
aproximadamente `(-22.816, -43.278)`.

## Escopo

- **Modo normal (com PDF)**: passa a sempre tentar completar as paradas do
  PDF com as paradas ao vivo da API (best-effort — API fora do ar não
  bloqueia, segue só com o PDF).
- **Modo API** (toggle "Beta", igual ao Benassi visualmente): dispensa o
  upload do Relatório Parada e Serviço. Escala sozinha libera o botão de
  gerar. As paradas vêm 100% da API.
- Os dois modos alimentam o pipeline **já existente e inalterado**
  (`montaResumoViagemPorPlaca`, `montaKpiViagemPorCarga`,
  `gerarKpiViagemXlsx`) — a mudança fica isolada em como as paradas chegam
  até esse pipeline, não no que o pipeline faz com elas.
- **Fora de escopo**: "Gerar Romaneio" (conferência por cliente) continua só
  PDF, sem modo API, por decisão explícita. Os truques do Benassi que
  dependem de "loja esperada" pelo cadastro (gabarito de horário por loja,
  correção de saída de CD comparando com loja prevista, confirmação por
  geofence esperada) não têm equivalente na Nutry Max e não entram aqui.
- **Limitação aceita**: a API ao vivo não devolve km percorrido por parada
  (isso só existe no cálculo do relatório PDF). Em modo API puro,
  `kmPercorrido` sai `null` — mesmo tratamento de "sem dado" já usado hoje
  quando nenhuma parada tem `distancia_km`.

## Arquitetura

### Módulo novo: `src/lib/kpi-nutrimax/api-paradas.ts`

```ts
export async function buscarResumosViagemViaApi(
  placasEscala: Set<string>,
  data: string,
): Promise<ResumoVeiculo[]>
```
Pipeline: `buscarFrota(COD_USER_NUTRIMAX)` → filtra pelas placas presentes em
`placasEscala` → `buscarPontos(cvs)` + `buscarStopsCru(cv, 48)` por veículo
(paralelo, `mapLimitSettled` com limite 8, mesmo padrão do Benassi) →
`consolidaParadasApi(eventos, pontos, data, placaNorm, BASE_COORD_NUTRIMAX)`
por veículo → converte o `UnitracParadaRow[]` resultante pra `ParadaUnitrac[]`
(parse de `chegada`/`saida` de volta pra `Date`, `distancia_km: null`) →
agrupa por placa em `ResumoVeiculo[]` (`qtd_paradas` = `paradas.length`,
`inicio_viagem`/`fim_viagem` = primeira chegada / última saída observadas,
`saida_cd: null` — não é consumido por `montaKpiViagemPorCarga`, não precisa
ser calculado).

```ts
export function mesclarResumosPdfApi(
  pdfResumos: ResumoVeiculo[],
  apiResumos: ResumoVeiculo[],
): ResumoVeiculo[]
```
Por placa: converte `paradas` (dos dois lados) pra `UnitracParadaRow[]`,
reaproveita `mesclarParadas` (de `@/lib/kpi/merge-paradas`, já existente,
agnóstica de loja/cadastro) pra deduplicar por coordenada+janela de tempo,
converte o resultado de volta pra `ParadaUnitrac[]`. Placas que só aparecem
de um lado entram como estão.

### Constantes novas em `src/lib/kpi-nutrimax/constants.ts`

```ts
export const BASE_COORD_NUTRIMAX = { lat: -22.816007, lng: -43.277827 }
```
(`MARCADOR_BASE_NUTRIMAX` já existe, commit `a13331c`.)

### Rota `src/app/api/kpi/nutrimax/gerar/route.ts`

- Recebe `modoApi?: boolean` do form (default `false`).
- Se `!modoApi`: exige o Relatório PDF como hoje; depois de parsear
  (`parseUnitracPdf`), tenta enriquecer com `buscarResumosViagemViaApi` +
  `mesclarResumosPdfApi` num bloco `try/catch` best-effort (API falhar não
  quebra a geração — segue só com o PDF, mesmo padrão do Benassi).
- Se `modoApi`: Relatório PDF vira opcional/ignorado; `resumosVeiculo` vem
  direto de `buscarResumosViagemViaApi`. Sem guard de "zero resultado
  bloqueia" — se a API não devolver nada, a geração segue e o KPI reflete
  isso (`sem_rastreador` pra todo mundo), igual à filosofia "em branco
  honesto > erro escondido" já usada no projeto.

### Tela `src/app/painel/nutrimax/gerar/page.tsx`

- Novo estado `modoApi` (switch, badge "Beta"), mesmo texto do Benassi:
  desligado → *"Ativar para gerar KPI só com a escala (sem PDF do
  Unitrac)"*; ligado → *"Paradas puxadas direto da API Unitrac — sem PDF
  necessário"*.
- Quando ligado, o dropzone do Relatório Parada e Serviço vira um card
  informativo (mesmo padrão visual do Benassi — ícone de wifi, texto "As
  paradas serão puxadas direto da API Unitrac em tempo real. Nenhum arquivo
  necessário.").
- `pronto = escala.length > 0 && (modoApi || relatorio.length > 0) && !!data`.

## Testes

- `api-paradas.test.ts`: `buscarResumosViagemViaApi` mockando
  `buscarFrota`/`buscarPontos`/`buscarStopsCru`/`consolidaParadasApi` —
  filtra por placa da escala, agrupa corretamente, `distancia_km: null`
  sempre. `mesclarResumosPdfApi`: paradas duplicadas (mesma coordenada+janela)
  descartadas do lado API, paradas só-API mantidas, placas exclusivas de um
  lado preservadas.
- `route.ts` (Gerar KPI): sem teste de integração direto (mesmo padrão do
  resto do projeto) — smoke test manual via chrome-devtools-mcp cobre os 2
  modos antes do push.
