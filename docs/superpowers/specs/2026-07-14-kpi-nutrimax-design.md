# KPI Nutrimax — geração de KPI pra um segundo cliente

## Contexto

Hoje o sistema gera KPI só pro Benassi: escala (por rede/loja) + relatório Unitrac (PDF) →
matcher (`cruzaEscalaUnitrac`) → status por rota/loja (`derivarStatus`) → XLSX/PDF por rede →
upload manual pro dashboard (`kpi_manual_entradas`).

O Transmonseg vai passar a gerar KPI também pro **Nutrimax** (distribuidora de alimentos —
Nutry Max), outro cliente que roda no mesmo Unitrac (conta separada) mas com documentos de
entrada completamente diferentes e sem o conceito de "rede de supermercado".

## Diferenças estruturais Benassi × Nutrimax

| | Benassi | Nutrimax |
|---|---|---|
| Unidade de negócio | 18 redes de supermercado, cada uma com lojas cadastradas (`lojas`, lat/lng conhecido) | 1 cliente só, ~70-80 rotas/dia ("cargas"), cada uma cobrindo uma cidade/região do RJ |
| Documento de escala | Escala por rede/loja (XLSX/PDF) | **Escala de Rota** — 1 linha por carga: veículo, placa, motorista, ajudante(s), destino (cidade), peso, contagem de entregas (ENT) e notas fiscais (NF) |
| Documento de detalhe | (o mesmo doc da escala já lista as lojas) | **Romaneio de Entrega** — 1 bloco por carga/placa, listando cada cliente: NF, código, nome, endereço completo |
| Volume de paradas | ~473 lojas cadastradas no total | Milhares de clientes distintos (mercearias, açougues, restaurantes, bares — pequeno varejo), muitos aparecendo uma vez só |
| Cadastro de geofence | Tabela `lojas` mantida manualmente | **Já existe no Unitrac** — não precisa cadastrar nada (ver abaixo) |
| Granularidade do KPI | Por loja | Por rota/placa (confirmado com o usuário: "é por placa, igual o outro") |

## Descoberta chave: Unitrac já tem os pontos do Nutrimax cadastrados

A API interna do Unitrac (`datalayer.portalunitrac.com`, sem autenticação, só precisa do
`codUser` da conta) já é usada pelo Benassi via `src/lib/unitrac-api/`. Confirmado ao vivo:

- `codUser` Nutrimax = **4096** (Benassi = 4586). Descoberto navegando o portal
  (`www.portalunitrac.com`, login `erica.rastreamento`) até a tela de mapa, que carrega
  `GET /veiculos/masn/4096` — retorna a frota completa com `ne: "NUTRY MAX"`, batendo com as
  placas da Escala de Rota.
- O endpoint `/mapa_servicos/alvos` (o mesmo que o Benassi usa pra geofences de loja) já
  devolve, pra qualquer `cv` do Nutrimax, uma lista de **alvos por cliente já geocodificados**:
  `alvodocumento` (NF), `pontonome` (nome do cliente), `pontolatitude`/`pontolongitude`,
  `alvosituacaoservico` (0=pendente, 1=feito), `alvodatarealizado` (hora de conclusão).

**Conclusão prática: não precisa construir nenhum sistema de geocoding nem cadastro de
cliente.** O Unitrac já resolve isso — inclusive já calcula "entregue/não entregue" por
cliente (`alvosituacaoservico`). O trabalho do nosso sistema é: parsear os documentos do
Nutrimax, buscar os alvos via API, cruzar com o romaneio (pra pegar o que o Unitrac não tem
ou não bateu), e agregar por placa/rota pro KPI final.

## Arquitetura proposta

### 1. Unitrac API — parametrizar por conta

`src/lib/unitrac-api/frota.ts`: `buscarFrota()` está hardcoded pra `COD_USER = '4586'`. Trocar
pra `buscarFrota(codUser: string = COD_USER)`, adicionar `COD_USER_NUTRIMAX = '4096'`. As
outras funções (`buscarAlvos`, `buscarPontos`, `buscarPosicoes`, `buscarStopsCru`) já recebem
`cv`/`cvs` como parâmetro — funcionam pra qualquer conta sem mudança, desde que os `cv`s
venham da frota certa.

### 2. Parsers novos

- `parseEscalaRotaNutrimax` — lê o PDF "Escala de Rota" (8081), agrupado por seção "Comboio"/
  "Retirada", extrai por linha: carga, placa, destino, peso, ENT, NF, motorista, ajudante(s).
- `parseRomaneioNutrimax` — lê o PDF "Romaneio de Entrega" (8012), agrupado por bloco
  `CARGA/DESTINO` + `PLACA/MOTORISTA`, extrai cada linha `NF/CLIENTE` + endereço.
- Ambos os PDFs referenciam a mesma `CARGA` — é a chave de junção entre os dois documentos.

### 3. Matcher/status — mais simples que o do Benassi

Como o Unitrac já resolve "entregue ou não" por cliente via `alvosituacaoservico`, o motor
novo (`cruzaRotaUnitracNutrimax` ou similar) faz, por placa/carga:

1. Busca os alvos do dia pro(s) `cv`(s) da carga.
2. Casa cada alvo com uma linha do romaneio por NF (`alvodocumento` ↔ `NF / CLIENTE` do
   romaneio) — quando bate, o status vem direto do Unitrac.
3. Clientes do romaneio sem alvo correspondente → sinalizados (dado sem match, não
   necessariamente erro — mesma filosofia de "natureza=dado" do Benassi).
4. Agrega por CARGA/placa: % de clientes entregues, horário de saída/retorno (via
   `buscarStopsCru`, mesma lógica de paradas do Benassi), tempo de rota.

Não precisa da árvore de decisão rica do `derivarStatus` do Benassi (geofence vs troca de
veículo vs base) porque o Unitrac já faz esse trabalho — o KPI aqui é mais um agregador e
cross-checker do que um motor de inferência de status.

### 4. Dados — tabelas novas, paralelas às do Benassi

Sem misturar com `kpi_manual_entradas` (schema incompatível — lá é por rede/loja, aqui é por
carga/cliente). Propostas (nomes provisórios, revisar no plano de implementação):

- `kpi_nutrimax_entradas` — granularidade cliente: `data`, `carga`, `destino`, `placa`,
  `motorista`, `nf`, `cliente_nome`, `endereco`, `lat`, `lng`, `status`, `hora_realizado`,
  `uploaded_by`, `created_at`.
- `kpi_nutrimax_geracoes` (equivalente a `kpi_simples`) — histórico de gerações.

### 5. UI

- **Tela "Gerar KPI" é a mesma** (confirmado com o usuário: "vai ser tudo mesma tela, eu jogo
  lá a escala, o sistema identifica o que é"). O endpoint de geração detecta pelo formato do
  PDF (cabeçalho "Escala de Rota" vs escala Benassi) qual pipeline rodar.
- **Dashboard e histórico ficam em área separada** (confirmado antes: item de menu próprio,
  sem misturar com as redes do Benassi no mesmo painel).

## Decisões confirmadas com o usuário

- **Fluxo de dados do dashboard**: igual ao Benassi — Gerar KPI produz XLSX/PDF por rota, o
  operador sobe manual pra uma tabela persistida (equivalente ao "Inserir Manual"), o
  dashboard lê dessa tabela. Não é live-query direto na API do Unitrac (mesmo o Unitrac já
  tendo o dado pronto — mantém consistência operacional com o processo já conhecido).
- **Conteúdo do dashboard**: replica as mesmas seções do Benassi (visão geral, tempo médio de
  rota/loja→rota, mapa de risco, rankings, evolução temporal), substituindo a dimensão
  rede→loja por rota→placa (não existe dimensão "rede" no Nutrimax — é cliente único). Onde o
  Benassi tem "por rede", o equivalente natural é "por destino/praça" (cidade da carga) já que
  não há segunda camada de agrupamento.

## Decisões de implementação (a cargo do dev, seguindo padrão existente)

- Nome de tabelas: `kpi_nutrimax_entradas` (granularidade cliente/NF, populada pelo upload
  manual) e `kpi_nutrimax_geracoes` (histórico de gerações, equivalente a `kpi_simples`).
- `codUser` do Nutrimax fica como constante no código (`COD_USER_NUTRIMAX = '4096'`), mesmo
  padrão do Benassi hoje (`COD_USER = '4586'` em `src/lib/unitrac-api/frota.ts`) — não é env
  var nem segredo (é só um ID de conta, não uma credencial).
