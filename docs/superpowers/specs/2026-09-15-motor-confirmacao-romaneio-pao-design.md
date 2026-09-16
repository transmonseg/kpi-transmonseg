# Incluir a "escala do pão" (PROGRAMAÇÃO JAC CONGELADO) no KPI Nutry Max

**Data:** 2026-09-15
**Pedido:** Érica, grupo WhatsApp KPI AJUSTES, 15/09 10:27-10:41 ("não entra as entregas do PÃO... TEMOS QUE INCLUIR A ESCALA DO PÃO").

## Contexto

A Nutry Max opera, além do romaneio principal já suportado pelo KPI, um segundo
fluxo de entregas de hortifruti/padaria distribuído em um documento chamado
"PROGRAMAÇÃO JAC (CONGELADO)" — mandado separadamente todo dia pela Érica.
Hoje essas entregas não aparecem em relatório nenhum: o motorista sai, faz as
duas rotas no mesmo dia, mas só a rota do romaneio principal é confirmada por
GPS e reportada.

**Achado que definiu o design**: as 10 placas usadas na amostra da "escala do
pão" (14 e 15/09) **já estão todas cadastradas na frota Nutry Max** na
Unitrac (confirmado via `buscarFrota`). Não é uma frota nem um cliente
diferente — são os mesmos caminhões fazendo uma segunda rota no mesmo turno.
Isso muda o problema de "onboardar um cliente novo" (como foi feito com Rio
Quality) para "somar uma segunda fonte de cargas à mesma placa/dia" — o GPS
já buscado para aquela placa serve para confirmar as duas rotas.

## Formato do documento "PROGRAMAÇÃO JAC (CONGELADO)"

Um único PDF por dia serve como escala **e** romaneio ao mesmo tempo — não
há um par de arquivos como no fluxo Nutry Max principal.

Estrutura (confirmada em duas amostras reais, 14/09 e 15/09):

```
DATA        15/09/2026

ROMANEIO           1                                    MOTORISTA        AJUDANTE
  CARRO           36        TTI-9B98                     Luis Paulo       -
 ORDEM  NOTA FISCAL   CLIENTE                  ENDEREÇO              BAIRRO   QTD CAIXAS  PESO BRUTO  PESO LÍQUIDO  VALOR BRUTO
    5   215602        HORTIFRUTI PASSAGEM      RUA DA PASSAGEM,133   BOTAFOGO      38        277,4        266      R$ 2.741,04
    ...
                                                                              300      2162,9       2073      R$ 20.241,71   <- linha de total, ignorar

ROMANEIO           2  ...
```

- `ROMANEIO N` é o identificador da rota do dia — funciona como "carga" no
  vocabulário do KPI, mas o número **não** é globalmente único nem
  relacionado aos números de carga do romaneio Nutry Max (que são
  ~97000-98000). É só 1, 2, 3... reiniciando todo dia.
- `CARRO` traz código interno (irrelevante pro KPI) + placa + motorista +
  ajudante (`-` quando vazio).
- Cada linha de entrega: ORDEM (sequência da rota, não usado), NOTA FISCAL,
  CLIENTE, ENDEREÇO (rua + número, às vezes colados sem separador limpo —
  ver "Risco técnico" abaixo), BAIRRO (coluna própria — o romaneio Nutry Max
  não tem isso separado, o bairro já vem embutido no endereço), QTD
  CAIXAS/PESO BRUTO/PESO LÍQUIDO/VALOR BRUTO (não usados pelo KPI hoje).
- Linha de total ao fim de cada ROMANEIO (soma das colunas numéricas, sem
  NOTA FISCAL) — descartar.
- Cidade não aparece como coluna — nas duas amostras, sempre Rio de Janeiro
  (bairros como Botafogo, Leblon, Barra da Tijuca, Campo Grande, etc., mais
  Niterói na amostra de 14/09 — Badu/Piratininga/Itaipu são bairros de
  Niterói, não do Rio). **Não assumir sempre "Rio de Janeiro"** — usar o
  bairro pra inferir o município certo quando possível, e cair pra "RIO DE
  JANEIRO" só como default de baixa confiança quando o bairro não bater com
  nenhum outro município conhecido.

### Risco técnico: extração de tabela via PDF

`pdftotext -layout` reproduz a tabela relativamente bem, mas coluna
ENDEREÇO pode colidir com a coluna seguinte quando o nome do cliente é
longo (`RUA DA PASSAGEM ,133135` na amostra real — dois valores prováveis
grudados). Antes de escrever o parser: testar extração baseada em posição
(`pdf-parse` expõe coordenadas x/y por item de texto, não só string) para
separar colunas por faixa de x em vez de por espaços — mais robusto que
regex sobre texto já "achatado". Se posição por x não for viável no prazo,
cair pra regex sobre `-layout` com faixas de coluna calibradas nas duas
amostras reais e sinalizar (log, não erro) qualquer linha onde o número
extraído pareça implausível (mais de 6 dígitos, por exemplo) para revisão
manual — nunca inventar um número plausível a partir de um valor suspeito.

## Design

### 1. Novo parser: `src/lib/kpi-romaneio/parse-pao.ts`

```ts
export function parsePaoTexto(texto: string, data: string): LinhaRomaneio[]
export async function parsePao(buffer: Buffer, data: string): Promise<LinhaRomaneio[]>
```

Devolve `LinhaRomaneio[]` — o **mesmo tipo** que `parseRomaneio` já produz
para a Nutry Max — para que todo o resto do pipeline (geocodificação,
agrupamento por placa, `agregarPorCarga`, `montarDetalheEntregas`) funcione
sem nenhuma mudança. Campos preenchidos a partir do formato do pão:

| Campo `LinhaRomaneio` | Origem no PDF do pão |
|---|---|
| `carga` | `PAO-{N}` onde N é o número do ROMANEIO — prefixo garante que nunca colide com carga da Nutry Max (~97xxx) e fica visualmente identificável no relatório |
| `destino` | Nome do bairro da primeira entrega do romaneio (aproximação — não há campo de destino explícito no documento) |
| `placa` | Da linha CARRO |
| `motorista` | Da linha CARRO (`-` vira string vazia, mesmo padrão de `parseRomaneio`) |
| `ajudantes` | Da linha CARRO (`-` vira `[]`) |
| `nf` | Coluna NOTA FISCAL |
| `clienteCodigo` | Não existe no documento — usar a própria NF como código (nunca deixar vazio: `montarDetalheEntregas`/`agregacao.ts` não esperam string vazia aqui, ver uso atual) |
| `clienteNome` | Coluna CLIENTE |
| `endereco` | `` `${ruaNumero} - ${bairro}, ${municipioInferido} - *` `` — mesmo formato de string que `geocodificarEnderecos`/`kpi_romaneio_geocode_cache` já usam, pra reusar a cascata de geocode inteira (CNEFE + guarda territorial) sem nenhuma mudança lá |

Precisa de `data` como parâmetro pra confirmar contra o cabeçalho `DATA` do
próprio PDF (mesma checagem de sanidade que outros parsers já fazem) —
rejeitar com erro claro se a data do arquivo não bater com a data pedida no
formulário, em vez de silenciosamente gerar um relatório com dado do dia
errado.

### 2. Ponto de integração — `route.ts` (e `scripts/gerar-nutrimax-real-arquivo.ts`)

```ts
const romaneioPaoBuf = ... // novo campo do form, opcional
const [escala, romaneio, romaneioPao] = await Promise.all([
  escalaBuf ? parseEscala(escalaBuf) : Promise.resolve([]),
  parseRomaneio(romaneioBuf),
  romaneioPaoBuf ? parsePao(romaneioPaoBuf, data) : Promise.resolve([]),
])
const romaneioCompleto = [...romaneio, ...romaneioPao]
```

Daí em diante, `romaneioCompleto` substitui `romaneio` em todo o resto da
função — geocodificação em lote, `linhasPorPlaca`, `cargasPorChave`,
`pontosPorPlacaBridge`. Nenhuma outra mudança estrutural: uma entrega do
pão para a placa RQV-8A12 vira só mais uma "carga" na aba já existente de
RQV-8A12, confirmada pelo mesmo GPS que o resto do dia dela já usa.

**Por que isso funciona sem mudar `agregarPorCarga`/`montarDetalheEntregas`**:
as duas funções já operam por `(carga, placaNorm)` de forma genérica, sem
qualquer suposição sobre a origem da carga. `paradasPorPlaca`/`kmPorPlaca`
já são calculados **por placa**, cobrindo o dia inteiro dela — já enxergam
naturalmente as paradas feitas durante a rota do pão, mesmo sem essa
mudança.

### 3. Evitar aviso falso de "sem escala"

`detectarDescasamentos` compara Escala × Romaneio por `carga::placa` — sem
tratamento, toda carga `PAO-N` apareceria como "sem escala" (falso alarme,
não é descasamento real, é só um documento que não tem escala própria).
Sintetizar uma `LinhaEscala` equivalente por ROMANEIO do pão, direto do
próprio cabeçalho CARRO (placa/motorista já estão lá; `pesoKg`/
`entPlanejado`/`nfPlanejado` ficam `null` — informação que o documento do
pão não tem e o pipeline já trata como opcional) e concatenar em `escala`
do mesmo jeito que `romaneioCompleto` acima. Só roda quando o Romaneio do
Pão foi de fato enviado — mesma guarda condicional que já existe pra não
gerar aviso quando a Escala Nutry Max normal não vem.

### 4. Painel — `/painel/nutrimax/gerar`

Novo campo de upload opcional, um PDF só ("Romaneio do Pão — opcional,
serve como escala e romaneio juntos"), ao lado dos dois campos já
existentes. Não bloqueia geração (como a Escala já não bloqueia hoje) — sem
ele, o relatório sai igual ao que já é hoje.

### 5. Testes

- `parse-pao.test.ts`: parsing puro (função `parsePaoTexto`, sem PDF real)
  contra o texto extraído das duas amostras reais (14 e 15/09) já
  disponíveis — cobre múltiplos ROMANEIOs por arquivo, ajudante/motorista
  vazio (`-`), linha de total descartada, cidade inferida por bairro
  conhecido (Niterói) vs default (Rio de Janeiro), e o caso de colisão de
  coluna já observado (dado real, não sintético).
- `route.test.ts`: cobrir que uma carga `PAO-N` aparece na aba da placa
  certa, com status calculado a partir do MESMO `paradasPorPlaca` que as
  cargas normais da Nutry Max, e que a ausência do campo (upload opcional
  não enviado) não muda nada do comportamento atual.

## Fora do escopo desta fase

- Suporte a QTD CAIXAS/PESO BRUTO/PESO LÍQUIDO/VALOR BRUTO no relatório —
  o KPI de hoje não expõe peso de carga em lugar nenhum (mesma decisão já
  tomada pra Escala principal, ver comentário em `nutrimax/gerar/route.ts`).
- Reconciliar “destino” de verdade quando o documento não traz — usar o
  bairro da primeira entrega é aproximação aceita nesta fase.
- Detecção automática de qual município cada bairro pertence além de
  Rio de Janeiro/Niterói (as duas cidades vistas até agora) — lista curta
  hardcoded, ampliar sob demanda quando aparecer bairro de outro município.
