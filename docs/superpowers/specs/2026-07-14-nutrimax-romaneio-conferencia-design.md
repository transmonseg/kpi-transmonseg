# Romaneio Nutry — Conferência Escala x Romaneio (design)

## Contexto

O plano `2026-07-14-kpi-nutrimax-design.md` (mesmo dia, sessão anterior) descreveu e
implementou um pipeline de KPI do Nutrimax nos moldes do Benassi: gera XLSX cliente a
cliente cruzado com status de entrega do Unitrac, sobe de volta pro banco
(`kpi_nutrimax_entradas`), alimenta um Dashboard. **Esse pipeline continua existindo,
intacto, sem nenhuma mudança** — telas `/painel/nutrimax/gerar`, `/painel/nutrimax/inserir`
e `/painel/nutrimax/dashboard`.

Só que o usuário queria outra coisa, num modelo diferente: não o fluxo do Benassi
(gera → sobe de volta → dashboard com status de entrega via GPS), e sim o fluxo do módulo
**Cozinha** (`/painel/cozinha`) — sobe um arquivo, processa uma vez, mostra um relatório de
conferência na hora, sem reupload nem consulta a GPS/Unitrac.

Esta spec cobre **essa segunda coisa**, como uma feature nova e separada: "Romaneio Nutry".

## O que é

Confere a Escala de Rota (o planejado: qual placa vai pra qual destino, quantos clientes/NFs
previstos) contra o Romaneio de Entrega (o executado: quem realmente foi carregado, cliente a
cliente) — sem tocar no Unitrac. Devolve **um XLSX com uma aba "Resumo" + uma aba por placa**
(a "aba de Excel" que o usuário pediu, não aba de navegador), cada aba de placa com o resumo
da rota + a lista de clientes daquela placa.

## Decisões confirmadas com o usuário

- **Sem status de entrega real (Unitrac/GPS)** — é auditoria de dados entre dois documentos,
  não rastreamento. (Confirmado explicitamente: "não, só conferência de dados".)
- **Conteúdo de cada aba**: cabeçalho da rota (carga, placa, destino, motorista, ajudantes,
  peso, NF planejado x NF recebido, status) + tabela de clientes da placa (NF, cliente,
  endereço). (Confirmado: "cabeçalho da rota + lista de clientes".)
- **"Abas" = abas de planilha Excel** (sheets) — não um componente de UI com abas. O usuário
  foi explícito: "é um excel com abas embaixo, cada aba é uma placa".
- **Tela separada**, não deve alterar em nada o pipeline existente (Gerar KPI / Inserir KPI /
  Dashboard do Nutrimax) nem o KPI do Benassi. Verificado após a mudança: Benassi continua
  pixel-idêntico e sem erros de console.
- **Nome no menu**: "Romaneio Nutry" (grupo Nutrimax já existe na nav).
- Reaproveita os parsers já escritos e validados contra os PDFs reais nesta mesma sessão:
  `parse-escala.ts` (71/71 cargas reconhecidas) e `parse-romaneio.ts` (2060 clientes,
  69 cargas). Nenhum dos dois muda.

## Arquitetura

Novo módulo `src/lib/kpi-nutrimax/romaneio-conferencia.ts`: recebe
`LinhaEscalaNutrimax[]` + `LinhaRomaneioNutrimax[]`, devolve uma lista de
`RelatorioPlacaNutrimax` (um por carga da escala) com status `'ok' | 'divergente' | 'ausente'`
e os clientes daquela carga agrupados. Reusa a mesma lógica de comparação já validada em
`cobertura.ts` (carga ausente / placa divergente / entregas incompletas), só que em vez de
devolver uma lista plana de avisos, agrupa por carga pra virar uma aba.

Novo gerador `src/lib/kpi-nutrimax/gerador-romaneio-conferencia.ts` (ExcelJS): primeira aba
`"Resumo"` — uma linha por carga, colunas Carga/Placa/Destino/Status, pra bater o olho sem
precisar abrir aba por aba (validado nos dados reais: sem essa aba, achar 3 problemas em 71
abas exigiria clicar nas 71). Depois, uma `workbook.addWorksheet(...)` por item do relatório.
Nome da aba = `"PLACA (carga)"` (ex: `"TTL7D40 (92593)"`) — não só a placa, porque duas cargas
podem usar a mesma placa no mesmo dia (não observado no PDF de exemplo, mas plausível: um
caminhão fazendo duas rotas curtas) e nome de aba duplicado quebraria o Excel. Sanitiza pras
regras do Excel (máx. 31 caracteres, sem `\ / ? * [ ] :`) por segurança, mesmo as placas já
cabendo tranquilamente.

Nova rota `POST /api/kpi/nutrimax/romaneio` — mesmo contrato de autenticação das rotas
existentes (`createClient()` + `getUser()`), recebe os 2 PDFs (`escala`, `romaneio`) + `data`,
devolve JSON `{ resumo: { total, ok, divergentes, ausentes }, xlsxBase64, filename }`. Sem
escrita no banco — é um relatório efêmero, não precisa de tabela nova.

Nova tela `src/app/painel/nutrimax/romaneio/page.tsx`: reusa o `FileDropzone` compartilhado
(Passo 1 Escala, Passo 2 Romaneio, mesma data), mostra os cards de resumo (Total / OK /
Divergentes / Ausentes, no estilo dos cards `AlertasResumo` da Cozinha) depois de processar, e
um botão de baixar o XLSX gerado.

Nav: adiciona `{ href: '/painel/nutrimax/romaneio', label: 'Romaneio Nutry' }` ao grupo
Nutrimax já existente em `src/app/painel/nav.tsx`.

## O que fica de fora (v1)

- Cargas do Romaneio sem nenhuma carga correspondente na Escala (órfãs) não geram aba própria
  — não observado nos dados reais (Escala é sempre superset), mas se acontecer a linha
  simplesmente não aparece em nenhuma aba. Documentado aqui como limitação conhecida, não
  como bug — se virar problema real, dá pra adicionar uma aba "Fora da Escala" depois.
- Sem persistência — roda de novo a cada upload, não fica salvo em lugar nenhum.
- Sem edição inline (diferente da Cozinha, que permite editar motorista/placa direto na
  tabela) — é só conferência, não correção de dados.
