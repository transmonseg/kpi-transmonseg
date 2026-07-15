# Romaneio Nutry Max com GPS real (3º arquivo) — Design

**Status:** Aprovado
**Data:** 2026-07-15

## Contexto

O módulo "Gerar Romaneio" do Nutry Max hoje cruza 2 arquivos — Escala de Rota
(planejado) e Romaneio de Entrega (executado, cliente a cliente) — e gera um
XLSX com uma aba Resumo + uma aba por placa, mostrando se cada carga bateu
NF/clientes planejados.

Esse cruzamento é só documental: compara o que a escala previu com o que o
romaneio registrou como entregue, mas não confirma fisicamente que o caminhão
esteve no cliente. O Relatório Parada e Serviço do Unitrac (mesmo PDF já usado
no "Gerar KPI") traz isso — paradas reais por GPS, com km, horário de chegada
e saída, e (quando é uma loja) o código da loja visitada.

O pedido: incorporar esse 3º arquivo ao Gerar Romaneio pra ter, no mesmo
relatório, o planejado (Escala) + o documental (Romaneio) + o físico/GPS
(Relatório Parada e Serviço) — com o máximo de informação possível e um
visual à altura.

## Escopo

- Os 3 arquivos passam a ser **obrigatórios** para gerar o romaneio.
- Cruzamento por código de loja: cada parada GPS classificada como `LOJA` tem
  um `codigo_loja`; cada cliente do romaneio tem um `clienteCodigo` na mesma
  origem de cadastro. Casam diretamente pelo código, sem heurística de nome.
- Por carga/placa, dados agregados do GPS (km percorrido, qtd de paradas
  reais, início/fim de viagem) — mesmo cálculo já usado no "Gerar KPI"
  (`montaResumoViagemPorPlaca`).
- Por cliente dentro da carga, confirmação individual: se uma parada GPS bateu
  o código daquele cliente, mostra chegada/saída/km; senão, "sem confirmação
  GPS". Essa informação é aditiva — **não muda** o status atual
  (`ok`/`divergente`/`ausente`) do romaneio, que continua baseado só em
  Escala x Romaneio.
- Paradas GPS classificadas como `LOJA` que não batem com nenhum cliente do
  romaneio daquela carga aparecem à parte ("paradas sem cliente
  identificado") — evita esconder anomalias (parada em loja errada, cliente
  sem cadastro batendo, etc.).
- Fora de escopo: não recalcular o status de divergência a partir do GPS, não
  tentar casar paradas `BASE`/`FORA_BASE`/`FAKE_EXIT` com clientes (só `LOJA`
  importa pra esse cruzamento).

## Arquitetura

### Tipos (`src/lib/kpi-nutrimax/types.ts`)

```ts
export type ParadaConferidaNutrimax = {
  chegada: string // ISO
  saida: string // ISO
  distanciaKm: number | null
  localParada: string
  codigoLoja: string | null
  nomeLoja: string | null
}

export type ClienteConferidoNutrimax = {
  nf: string
  clienteNome: string
  endereco: string | null
  parada: ParadaConferidaNutrimax | null // null = sem confirmação GPS
}
```

`RelatorioPlacaNutrimax` ganha:

```ts
  clientes: ClienteConferidoNutrimax[] // era ClienteRomaneioResumo[], agora com `parada`
  kmPercorrido: number | null
  qtdParadasReal: number
  inicioViagem: string | null // ISO
  fimViagem: string | null // ISO
  paradasSemCliente: ParadaConferidaNutrimax[]
```

`ClienteRomaneioResumo` é removido (substituído por `ClienteConferidoNutrimax`,
que é um superconjunto — mesmos 3 campos + `parada`).

### Cruzamento (`src/lib/kpi-nutrimax/romaneio-conferencia.ts`)

`montaRelatorioPorPlaca` ganha um 3º parâmetro, `resumosVeiculo: ResumoVeiculo[]`
(saída direta de `parseUnitracPdf`, sem passar por `montaResumoViagemPorPlaca`
— aqui a função precisa das paradas individuais, não só do agregado).

Para cada placa da escala:
1. Acha o `ResumoVeiculo` da placa (por `placa_norm`). Se não achar, todos os
   campos de GPS ficam vazios (`kmPercorrido: null`, `qtdParadasReal: 0`,
   `inicioViagem/fimViagem: null`, `clientes[].parada: null` pra todos,
   `paradasSemCliente: []`).
2. Filtra as paradas do veículo com `classificacao === 'LOJA'` e
   `codigo_loja != null`. Monta um `Map<codigoLoja, ParadaUnitrac>` — se dois
   códigos colidirem (parada repetida na mesma loja), fica a primeira por
   `ordem`.
3. Para cada cliente do romaneio daquela carga, busca no Map pelo
   `clienteCodigo`. Se achar, marca a parada como "usada" (por referência) e
   preenche `parada`. Se não achar, `parada: null`.
4. Paradas de loja que sobraram sem "uso" (não bateram nenhum
   `clienteCodigo` da carga) viram `paradasSemCliente`.
5. `kmPercorrido`/`qtdParadasReal`/`inicioViagem`/`fimViagem`: mesmo cálculo
   de `montaResumoViagemPorPlaca` (soma de `distancia_km`, `qtd_paradas`,
   `inicio_viagem`/`fim_viagem` do `ResumoVeiculo`).

### Rota (`src/app/api/kpi/nutrimax/romaneio/route.ts`)

- Passa a exigir os 3 arquivos (`escala`, `romaneio`, `relatorio`), 400 se
  faltar qualquer um.
- Roda os 3 parsers, valida cada um (mesmo padrão de erro 422 já usado no
  Gerar KPI: "Nenhum veículo reconhecido no relatório...").
- `linhas` (prévia JSON) ganha `kmPercorrido` e `qtdParadasReal` por carga.

### Gerador XLSX (`src/lib/kpi-nutrimax/gerador-romaneio-conferencia.ts`)

**Aba Resumo:** 2 colunas novas entre NFS e STATUS — `KM` e `PARADAS GPS`.
Linha TOTAL ganha a soma de km (mesmo padrão do gerador do Gerar KPI:
`Math.round(kmTotal * 10) / 10`).

**Aba de cada placa** — bloco de cabeçalho (linhas tipo `CARGA`/`PLACA`/...)
ganha 3 linhas novas: `KM PERCORRIDO`, `INÍCIO VIAGEM`, `FIM VIAGEM` (formato
`HH:MM` extraído do ISO, mesmo padrão de exibição já usado na tela do Gerar
KPI).

Tabela de clientes ganha 3 colunas: `CONFIRMADO GPS` (SIM/NÃO, verde/âmbar,
mesmo padrão de cor de `STATUS_COR`), `CHEGADA` (HH:MM ou vazio), `KM` (da
parada, ou vazio).

Se `paradasSemCliente.length > 0`, depois da tabela de clientes: título
"PARADAS SEM CLIENTE IDENTIFICADO" + mini-tabela (LOCAL, CHEGADA, KM).

### Tela (`src/app/painel/nutrimax/romaneio/page.tsx`)

- 3º `FileDropzone` — "Passo 3: Relatório Parada e Serviço" (mesmo hint do
  Gerar KPI: "PDF do Unitrac · paradas e km reais por placa"). Data vira
  "Passo 4".
- `pronto` passa a exigir os 3 arquivos.
- Tabela de prévia ganha 2 colunas: `KM` e `PARADAS` (real via GPS), no
  mesmo lugar/estilo das colunas NFS/Clientes existentes.

## Testes

- `romaneio-conferencia.test.ts` (existente, estende): casos novos — cliente
  com parada batendo por código, cliente sem parada correspondente, parada de
  loja sem cliente correspondente vira `paradasSemCliente`, placa sem
  `ResumoVeiculo` (sem rastreador) zera todos os campos de GPS, parada
  repetida no mesmo código de loja usa a primeira por ordem.
- `gerador-romaneio-conferencia.test.ts` (existente, estende): novas colunas
  na aba Resumo e na aba de placa, cor verde/âmbar de confirmação GPS, seção
  de paradas sem cliente aparece só quando há itens.
- `route.ts`: sem teste de integração direto hoje (mesmo padrão do resto do
  projeto — cobertura via unit nos módulos de lib); smoke test manual via
  chrome-devtools-mcp antes do push, como de costume.
