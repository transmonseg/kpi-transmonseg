# Confiabilidade do KPI Nutry Max: validação territorial de geocode e endurecimento da confirmação

Data: 2026-09-12
Origem: auditoria do KPI Nutry Max do dia 11/09 (2.225 NFs, 75 placas) e do cache
de geocode inteiro (8.744 endereços), pedida no grupo KPI AJUSTES.

## Problema

O relatório tira conclusões negativas fortes ("NÃO FOI AO CLIENTE", "CARGA
TRANSFERIDA") e conclusões positivas ("CONFIRMADO (GPS)") em cima de duas
fundações que a auditoria mostrou serem frágeis: a coordenada do cliente e a
parada do caminhão.

### Evidência 1 — coordenada em município errado (100 casos comprovados)

Detector: comparar cada coordenada do cache com a mediana do mesmo bairro+cidade
e arbitrar cada suspeito com reverse geocode independente.

- 304 endereços outliers, **294 marcados `confiavel = true`**
- Reverse geocode nos 304: **100 estão em município diferente do romaneio**
- Destinos errados mais comuns: Campos dos Goytacazes (22), Belford Roxo (12),
  São Gonçalo (10), Duque de Caxias (6), Magé (4)
- Mediana do erro: 19,2 km

No dia 11/09, 26 NFs caíram nesses endereços e **21 viraram "NÃO FOI AO
CLIENTE"** — de 109 no total.

**Não é só estoque velho.** Por data de criação: 44 em agosto, 56 em setembro, e
**9 criados no dia 12/09** com fonte `cnefe` e `local` — pelo motor atual, já com
o filtro rígido de município e a expansão de cidade truncada no ar. Ordem de
grandeza do vazamento contínuo: ~9 endereços novos por dia.

**Por que a defesa atual não pega.** A cascata (`romaneio-geocode.ts`) já tem
filtro rígido de `municipio_codigo` na consulta CNEFE (desde 12/08) e expansão de
cidade truncada com aliases e prefixo. O furo tem duas bocas:

1. `escolherCandidatoMaisProximo` aceita qualquer candidato a até
   `DISTANCIA_MAX_MATCH_LOCAL_M = 30 km` do ponto de referência da cidade. Na
   região metropolitana, 30 km em volta do centro do Rio contém São Gonçalo,
   Belford Roxo, Duque de Caxias, Magé e São João de Meriti inteiros — que são
   exatamente o topo da lista de destinos errados.
2. Google, Nominatim e o match OSM `local` **não têm filtro de município nenhum**
   — só esse teto de distância.

### Evidência 2 — coordenada em bairro errado dentro do município certo

O caso Galeão. `AVENIDA VINTE DE JANEIRO, S/N - GALEAO, RIO DE JANEIRO` está em
`-22.811137, -43.297583`. O vizinho CNEFE mais próximo dessa coordenada, a 0 m, é
`localidade = PARADA DE LUCAS`, `municipio_codigo = 3304557`. É o município certo
(Rio de Janeiro) e o bairro errado — **5.014 m** da Av. Vinte de Janeiro real, na
Ilha do Governador.

Consequência medida: a placa RBG-8J72 parou **33 minutos a 258 m do endereço
real** (09:34–10:07, velocidade 0, GPS bruto), e mesmo assim 4 NFs do aeroporto
saíram como "NÃO FOI AO CLIENTE" — a aproximação mínima do dia inteiro em
relação ao ponto errado foi 1.875 m.

Agravante: o ponto errado fica a 2.027 m da base da Penha, ou seja, perto de
creditar entrega de aeroporto para caminhão estacionado na base.

Segundo caso: `ILHA DA GIGOIA, - BARRA DA TIJUCA, RIO DE JANEIRO` a
`-23.007501, -43.531960`, **22.792 m** da Gigóia real — que o próprio cache tem
correta em outra linha (`ALAMEDA DALTON BARRETO (IA GIGOIA), 6`).

**Isto prova que a validação de município é necessária mas não suficiente.**

### Evidência 3 — colapso de coordenada (79 NFs)

31 pontos recebendo endereços de **rua ou número diferentes** (não é o caso
legítimo de shopping, onde o mesmo número tem várias lojas):

| Ponto | O que colapsou |
|---|---|
| -22.9266,-42.9248 | Rod. Ernani Amaral Peixoto 15187 (Inoã), 24468 (Mumbuca), 30994 (Ponta Negra) — ~15 km entre eles |
| -22.0980,-43.1721 | BR-040 KM 20, KM 22, KM 29 — três bairros de Três Rios |
| -22.9756,-43.6085 | Estrada da Ilha 4528 + Estrada do Magarça 2386 + Rua Jecê Valadão 56 |
| -22.1105,-41.4717 | 4 ruas diferentes do Centro de Quissamã |

Padrão: `S/N` em rodovia/avenida, e centroide de bairro em cidade pequena.

### Evidência 4 — uma parada curta confirmando várias notas

- **126 confirmações (7,3%) com ≤3 min de loja; 17 com ≤1 min**
- **40 NFs confirmadas por apenas 17 paradas** — a mesma parada validando várias

Caso verificado contra GPS bruto: RQV9E67, Rod. Amaral Peixoto, Rio das Ostras.
Cinco NFs de quatro clientes distintos (KM 157, KM 160, lotes diferentes)
confirmadas por **uma parada de 1 minuto às 15:59**. O GPS mostra velocidade 0
apenas entre 15:59:28 e 16:00:36, e a placa nunca mais chegou perto no dia. Os
quatro endereços colapsaram no mesmo ponto por serem `S/N` na rodovia.

Isto é exatamente o que a Érica levantou em áudio no dia 12/09 às 09:30: "tem
muitas entregas realizadas em 3 minutos... tem que parar o carro, abrir o
caminhão, tirar a carga, levar e voltar."

### Evidência 5 — passagem virando confirmação

O caso que a Ana montou no grupo às 07:58 (NF 2368077, PC Oliveira Figueiredo 22,
Barra do Piraí), verificado contra GPS bruto:

- **RQS2F79**, que o KPI creditou: passou 07:51–07:52 a 91 m, **a 27 e 19 km/h —
  nunca parou**. Único momento com velocidade 0 foi a 670–715 m, por ~1 min.
- **RQU0B47**, a placa do romaneio: parou **15:06–15:17, 11 minutos, a 0 m**.

A exigência de velocidade ≤5 km/h que já subimos vive em
`base-horarios/route.ts` (ponte do monitoramento). Em geração fresca a Nutry Max
usa as paradas da API da Unitrac (`consolidaParadasApi`), que **não têm
velocidade** — só um piso de 5 min aplicado sobre `durSeg`, que é o tempo até a
*próxima* parada, não a permanência real. **Esse caminho está desprotegido.**

### Evidência 6 — falsos negativos por recall

Veredito por GPS bruto das 333 NFs problemáticas do dia 11 (com coordenada):

| GPS mostra | NFs |
|---|---|
| Nunca chegou a 5 km | 78 (30 com coordenada outlier) |
| Chegou a 1,5–5 km | 76 |
| Chegou a 400–1500 m | 87 |
| Passou a ≤400 m sem parar | 61 |
| Parou <2 min a ≤400 m | 16 |
| **Parou ≥5 min a ≤400 m** | **12** |

Os 12 são falsos negativos: RQU1G17 com parada de 82 min a 8 m do cliente
marcada "SEM CONFIRMAÇÃO"; RQU9J17 com 40 min a 3 m, idem.

## Objetivos

Na ordem decidida com o usuário (12/09):

1. **Triagem antes de precisão.** Cada caso duvidoso cai num balde claro que a
   Ana resolve na mão — o modelo 95% automático / 5% manual que a Érica propôs
   no áudio das 09:09. Nenhuma afirmação negativa em cima de coordenada não
   validada.
2. **Depois, precisão automática** suficiente para o número sustentar um
   dashboard.

## Não-objetivos

- **Escopo é Nutry Max.** Rio Quality, Porte Frio e o motor de desvio de rota
  não mudam de comportamento nesta entrega. A validação nova entra desligada por
  padrão e a rota do Nutry Max liga.
- **Não reemitir dias já enviados ao cliente.** Os dias 09, 10 e 11/09 serão
  reprocessados apenas internamente, para medir o ganho.
- Não mexer na cascata `geocodificarEndereco` em si.
- Não resolver a contradição Unitrac × GPS (ver Em aberto).

## Decisões de arquitetura

### Abordagem escolhida: guarda de saída na rota-ponte, ligada por flag

A cascata roda exatamente como hoje. Depois que ela devolve uma coordenada, a
rota `/api/romaneio/geocode` confere se essa coordenada cai no território que o
romaneio pediu. Se não cair, a resposta sai com `validado: false` e um motivo.

Alternativas descartadas:

- **Endpoint separado de consulta com a decisão no KPI.** Separação mais limpa
  no papel, mas a decisão depende de dados que só a ponte tem, então o KPI vira
  intermediário sem ganhar nada, e custa uma chamada de rede a mais por lote.
- **Apertar a cascata na raiz** (trocar o teto de 30 km por checagem de município
  em todos os tiers). É o conserto verdadeiro e deve acontecer um dia, mas muda
  o comportamento de Rio Quality, Porte Frio e do motor de desvio — fora do
  escopo decidido.

O custo aceito da opção escolhida é uma flag que hoje só um cliente usa.

### Por que a política continua no KPI

A rota devolve fato (`validado`, `motivo`), não política. O que fazer com uma
coordenada não confiável continua em `agregacao.ts`, onde `geoConfiavel` já
suprime conclusões negativas. Isso mantém uma única sede de decisão.

## Desenho

### 1. Camadas de referência territorial

Duas camadas novas no banco `transmonseg`, ambas pequenas e estáveis. PostGIS
3.6 já está disponível.

**Municípios (contenção exata).** Malha oficial do IBGE:
`servicodados.ibge.gov.br/api/v3/malhas/estados/33?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=intermediaria`
— 92 features, 153 KB, cada uma com `codarea` igual ao código IBGE de 7 dígitos
já usado em `MUNICIPIO_CODIGO_IBGE` e em `cnefe_enderecos.municipio_codigo`. A
verificação é `ST_Contains(geom, ponto)`.

**Bairros (aproximada, via dados que já temos).** Não há fonte de polígono de
bairro confiável e acessível para todos os municípios atendidos — o endpoint do
data.rio respondeu 500 e os espelhos testados, 403/404. Em vez de ingerir mais
dados, usar o vizinho mais próximo em `cnefe_enderecos` e ler sua `localidade`.
Validado no caso Galeão: o vizinho mais próximo da coordenada suspeita está a
0 m e tem `localidade = PARADA DE LUCAS`, contra `GALEAO` no romaneio.

Isto exige um **índice espacial GiST** em `cnefe_enderecos` — hoje a tabela tem
8,8M linhas e só a PK, e uma consulta de vizinho mais próximo com bounding box
leva 1,36 s. Criar com `CONCURRENTLY` para não travar a tabela em produção.

### 2. Guarda de saída

Na rota `/api/romaneio/geocode`, depois da cascata, quando a flag estiver ligada:

- **Município diverge** → `validado: false`, `motivo: 'municipio_divergente'`.
  Regra dura: o município do romaneio é resolvido por
  `expandirCidadeTruncada` + `municipioCodigoIbge`, então quando ele resolve, ele
  é confiável. Se não resolver, não há o que comparar e a checagem não se aplica.
- **Bairro diverge** → `validado: false`, `motivo: 'bairro_divergente'`. Regra
  mais fraca, porque a comparação é por nome de `localidade` do CNEFE contra o
  bairro do romaneio, e nome de bairro varia de grafia. Só dispara com divergência
  inequívoca (nomes normalizados diferentes **e** vizinho CNEFE a menos de um
  raio pequeno, para não julgar coordenada em área sem cobertura CNEFE).
- `fonte = 'cnefe_bairro'` continua sempre `validado: false`, como hoje.

O `motivo` é campo novo na resposta e no cache do KPI. Serve à triagem: o rótulo
mostrado para a Ana diz **por que** a coordenada é suspeita.

### 3. Endurecimento da confirmação

**3a. Exigir velocidade também no caminho Unitrac.** As paradas de
`consolidaParadasApi` não têm velocidade. Cruzar cada parada candidata com
`posicoes_historico` da mesma placa (a frota da Nutry Max está cadastrada no
monitoramento — verificado: 1.326 leituras no dia, 06:00–19:59, gap máximo de
4 min). Uma parada só confirma se existir, na janela dela e dentro do raio, ao
menos uma leitura com velocidade ≤5 km/h. Sem cobertura de GPS na janela, a
parada é aceita como hoje (fail-open — não inventar negativa por falta de dado).

**3b. Uma parada não confirma N notas de endereços colapsados.** Quando duas ou
mais NFs de **endereços distintos** compartilham a mesma coordenada e a mesma
parada, e a permanência real (`fim_real − chegada`) é curta, a confirmação vira
rótulo de conferência em vez de confirmação. O limiar exato de permanência sai da
distribuição medida (mediana 14 min; 7,3% abaixo de 3 min) e será fixado no plano
de implementação, não aqui.

**3c. Recuperar os falsos negativos.** As 12 NFs com parada longa comprovada ao
lado do cliente indicam que o caminho de confirmação por histórico permanente
está deixando recall na mesa. Tratar depois de 3a e 3b, porque as duas primeiras
mudam a base de comparação.

### 4. Triagem

Marcar `confiavel = false` nas 100 coordenadas comprovadamente em município
errado, mais Galeão (12 variações) e Ilha da Gigóia. Isso é imediato, reversível
e independe do resto.

Categorias estruturais que não são erro nosso e precisam de rótulo próprio, não
de contagem como falha:

- **Acesso só por barco.** Vila do Abraão / Ilha Grande: conferi as 22 entradas
  do cache e as coordenadas estão certas; a placa RBG-2D21 chegou no máximo a
  11 km, passando pela costa a 75 km/h. São 9 NFs. A Ana confirmou em áudio no
  dia 12/09 às 09:03 que Ilha da Gigóia e Maricá têm o mesmo problema — mas no
  caso da Gigóia a coordenada também está errada, então são duas coisas
  sobrepostas.
- **Aeroporto.** 12 NFs no dia 11. Depois de corrigir a coordenada do Galeão,
  reavaliar quantas continuam sem confirmar; a hipótese da Ana ("eles vão parar
  do lado de fora") não se sustentou no caso testado — o caminhão parou 33 min a
  258 m do endereço real.

### 5. Medição

Reprocessar 09, 10 e 11/09 internamente com as correções e comparar contra o
relatório emitido. Nada é reemitido ao cliente. Métricas: quantos "NÃO FOI AO
CLIENTE" desaparecem, quantas confirmações curtas viram conferência, e o saldo
líquido no percentual de entrega.

## Faseamento

O escopo acima não cabe num plano de implementação só, e a ordem decidida com o
usuário já o divide naturalmente:

**Fase 1 — territorial e triagem** (seções 1, 2 e 4). Camadas de referência,
índice GiST, guarda de saída na ponte, campo `motivo` atravessando até o cache do
KPI, marcação das 100 + Galeão + Gigóia, rótulos de categoria estrutural. Entrega
sozinha: para de afirmar negativa em cima de coordenada errada e dá à Ana a lista
de triagem.

**Fase 2 — motor de confirmação** (seção 3). Velocidade no caminho Unitrac, uma
parada deixando de confirmar N notas colapsadas, recuperação dos falsos
negativos. Depende da Fase 1 porque a base de comparação muda.

A seção 5 (medição) roda ao fim de cada fase, contra os mesmos três dias.

## Riscos

- **O número de entrega pode cair antes de subir.** 3a e 3b removem confirmações
  falsas. Isso é correto, mas precisa ser explicado à Érica antes de qualquer
  relatório sair com o número novo.
- **A camada de bairro é aproximada.** Nome de `localidade` do CNEFE contra
  bairro do romaneio vai gerar divergência de grafia. Por isso ela só marca
  suspeita, nunca rejeita — e por isso o limiar precisa ser conservador.
- **A flag é uma costura artificial.** Enquanto só o Nutry Max usar, o código
  carrega um parâmetro de um cliente só.
- **O detector de mediana não serve de árbitro.** No Galeão a mediana está
  envenenada (12 endereços errados contra 3 certos) e o detector acusou os 3
  certos. Os 304 são um piso, não um teto. Só o reverse geocode / a camada
  territorial decide.

## Em aberto — não resolvido nesta spec

Nove NFs (Porciúncula, Guapimirim, Cachoeiras de Macacu, Sapucaia) onde o KPI diz
"PASSOU NO ENDEREÇO" — isto é, `distanciaAteParadaPropria` achou uma parada
Unitrac **da própria placa** a ≤500 m — enquanto `posicoes_historico` diz que a
placa nunca chegou a 5–18 km do ponto.

Descartado: buraco de sinal (1.326 leituras, gap máximo 4 min); cache alterado
depois da geração (as linhas foram gravadas em 12/09 06:52, durante a própria
geração); placa duplicada em `veiculos` (não há).

Resta: ou a Unitrac devolve stops com coordenada errada, ou o mapeamento
CV↔placa vindo de `buscarFrota` está trocado para essas placas. Fechar isso exige
consulta direta à API da Unitrac. Se for mapeamento trocado, contamina "carga
transferida" também — o que tornaria esta a descoberta mais grave das seis.
