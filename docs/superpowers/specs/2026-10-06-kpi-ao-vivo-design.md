# KPI ao vivo (Nutry Max e Rio Quality) — Design

Data: 06/10/2026. Status: aprovado em conversa, aguardando revisão desta spec.

## Objetivo

Uma tela no **sistema KPI** (não no monitoramento) onde, de manhã, a operação sobe o romaneio do dia e acompanha cada carro sendo entregue ao longo do dia, **com as mesmas regras do KPI**. A qualquer momento dá pra gerar a planilha do KPI com a situação até aquela hora; no fim do dia, o KPI gerado aqui tem que ser **idêntico** ao que sairia gerando do jeito de hoje.

## O que o usuário disse (requisitos)

1. Tudo no KPI; o monitoramento não entra nesta tela.
2. De manhã: subir romaneio (e escala / romaneio do pão quando houver) na tela ao vivo.
3. Guardar **só os dados extraídos** (NFs, placas, clientes, endereços…), **não o arquivo**.
4. Uma aba/visão por placa com as NFs coloridas (entregue, no cliente agora, pendente, não foi…).
5. Clicar na NF: cliente, endereço, chegada/saída e **tempo no cliente em tempo real** (cronômetro); mais de 1 h destacado.
6. Ver localização do carro e há quanto tempo está em rota.
7. Mesmas regras do KPI, inclusive parada a até 800 m, parada compartilhada, mesma rua, troca de placa, sem rastreador = correta. "Não fazer uma lógica diferente."
8. Gerar o KPI quando quiser; no fim do dia = mesmo resultado de gerar do jeito normal.
9. Seguro: não pode pesar no banco nem atrapalhar a operação.

## Clientes

- **Nutry Max** e **Rio Quality** (pedido do usuário em 06/10). A Nutry Max vai primeiro (fases 1-3); a Rio Quality entra na fase 4 com a mesma tela e o mesmo mecanismo, usando o pipeline dela (`gerarKpiRioQuality`, que já é uma função de biblioteca).
- Rio Quality: o arquivo é a planilha "Relatório de Entregas" (formato de 55 colunas). Guardar o resultado de `parseEntregasCompletas` (linhas), não o xlsx. `gerarKpiRioQuality` passa a aceitar as linhas já lidas além do buffer. Se a planilha da manhã ainda não trouxer check-in/status, tudo bem: o KPI da RQ classifica pelo GPS; subir de novo no mesmo dia substitui.
- Fonte de GPS da RQ é a Unitrac direta (não está na ponte do monitoramento); no dia corrente isso está dentro da janela de 48 h, então funciona igual à geração normal.

## Fora do escopo (primeira versão)

- Portefrio.
- Notificações (WhatsApp/apito). A tela só mostra.
- Link público pro cliente. Quem vê é login com a Nutry liberada (admin ou operador).

## Arquitetura

Duas camadas com papéis separados:

**Camada 1: classificação (a verdade).** É o cálculo completo do KPI da Nutry Max, rodando em segundo plano a cada 10 min das 05h às 21h (BRT) sobre os dados do dia guardados, e gravando o resultado. Toda cor/status de NF na tela vem só daqui.

**Camada 2: agora (indicador).** Ao abrir uma placa (e a cada ~30 s enquanto ela estiver aberta), consulta a posição atual **daquele caminhão** na Unitrac e diz se ele está parado e desde quando, e se está perto de alguma NF pendente. Mostra "chegou agora — confirma no próximo cálculo" e o cronômetro. **Nunca altera** status, taxa ou planilha.

### 1. Função única de geração (refatoração obrigatória)

Hoje o cálculo da Nutry Max existe duplicado em `src/app/api/kpi/nutrimax/gerar/route.ts` (720 linhas) e `scripts/gerar-nutrimax-real-arquivo.ts` (460 linhas), já com divergências pequenas corrigidas à mão (ex.: troca de placa, aviso de troca provável). Extrair para `src/lib/kpi-romaneio/gerar-nutrimax.ts`:

```ts
gerarKpiNutrimax(entrada: {
  data: string                    // AAAA-MM-DD
  escala: LinhaEscala[]           // já parseada (pode ser [])
  romaneio: LinhaRomaneio[]       // já parseado
  pao: { linhas: LinhaRomaneio[]; escala: LinhaEscala[] }
  hoje?: string                   // injetável p/ teste
  log?: (m: string) => void
}): Promise<{ xlsx: Buffer; detalhe: LinhaDetalheEntrega[]; linhasKpi: LinhaKpiRomaneio[]; avisos: AvisoDescasamento[]; resumoDashboard: ResumoGeracao }>
```

A rota (upload de PDF), o script de regeração e o ao vivo passam a chamar essa função. O parse dos PDFs fica fora dela (`parseEscala`, `parseRomaneio`, `parsePao`). Os testes atuais da rota e do script continuam passando sem mudar expectativa.

### 2. Dados guardados (sem arquivo)

Tabela `kpi_ao_vivo_dia`: `cliente text`, `data date`, `romaneio jsonb` (LinhaRomaneio[] na Nutry; linhas de `parseEntregasCompletas` na RQ), `escala jsonb`, `pao jsonb`, `enviado_por text`, `enviado_em timestamptz`, PK `(cliente, data)`. Subir de novo no mesmo dia substitui (o romaneio pode chegar em partes; a tela mostra quantas NFs/placas foram lidas antes de confirmar).

Tabela `kpi_ao_vivo_calculo`: `cliente`, `data`, `calculado_em`, `duracao_ms`, `status` ('ok' | 'erro'), `resultado jsonb` (por placa: NFs com status/rótulo/chegada/saída/tempo no cliente/coordenada; resumo), `erro text`. Guarda o último cálculo ok (substitui) e o último erro. Sem histórico intra-dia: tamanho fixo (~1–2 MB/dia).

### 3. Cálculo em segundo plano

`scripts/kpi-ao-vivo-tick.ts`, rodado pelo crontab do transmonseg-vps a cada 10 min, 05h–21h BRT:

- `flock` (um por vez; se o anterior não terminou, sai sem fazer nada);
- só roda se existir `kpi_ao_vivo_dia` de hoje;
- chama `gerarKpiNutrimax` com os dados guardados e grava `kpi_ao_vivo_calculo`;
- **não grava** em `kpi_romaneio_geracoes` nem no dashboard (só o botão "Gerar KPI" grava);
- falha da Unitrac/ponte: grava `status='erro'` e mantém o último ok; a tela mostra "dados de HH:MM".

### 4. Camada "agora"

`GET /api/kpi/ao-vivo/agora?placa=` → posição atual (lat/lng, velocidade, data GPS) via `buscarPosicoesPorCv` + início da parada atual. Cache em memória de 30 s por placa (duas pessoas olhando o mesmo carro = 1 consulta). Proximidade da NF usando a mesma distância/raio que o KPI usa pra casar visita (mesmas constantes de `kpi-romaneio`, sem cópia).

### 5. Tela `/painel/nutrimax/ao-vivo`

- **Topo:** data, "Atualizado às HH:MM" (ou aviso de erro), resumo parcial ("1.240 de 2.100 entregues — parcial"), botões **Subir romaneio do dia** e **Gerar KPI agora**.
- **Lista de placas:** barra de progresso por placa, status (em rota / no cliente / voltou à base), tempo em rota; ordenável; busca.
- **Placa aberta:** NFs com cor; ao clicar na NF, painel com cliente, endereço, chegada/saída, tempo no cliente (cronômetro no navegador a cada segundo quando está no cliente), destaque > 1 h; mapa pequeno com posição atual e a NF.
- Atualização: lista relê o cálculo a cada 60 s; placa aberta consulta "agora" a cada 30 s.
- Acesso: `podeOperarEmpresa(perfil, 'nutrimax')`; item "Ao vivo" no menu da Nutry Max.

### 6. Gerar KPI agora

Botão chama `gerarKpiNutrimax` na hora (não reaproveita o cálculo de até 10 min atrás, pra ser exato), gera o xlsx, salva em `kpi_romaneio_geracoes` como as gerações de hoje (com `resumo`) e baixa. NFs ainda não visitadas saem como hoje saem num dia em andamento ("AGUARDANDO - ROTA EM ANDAMENTO"). Não insere no dashboard sozinho (continua sendo "Inserir KPI", como combinado).

## Critério obrigatório: mesmo resultado

Antes de liberar, para um dia fechado (03/10/2026, PDFs em `/tmp/kpi-teste/in/`):

1. Gerar pela rota normal (PDFs) → planilha A.
2. Parsear os mesmos PDFs, gravar em `kpi_ao_vivo_dia`, gerar pela tela ao vivo → planilha B.
3. Comparar NF por NF (status, rótulo, chegada, saída) e a linha de TAXA. **Tem que ser idêntico.** Vira teste automatizado (fixtures) + conferência real no servidor.

## Segurança / carga

- O cálculo de 10 em 10 min faz as mesmas consultas de uma geração manual (Unitrac + ponte do monitoramento): ~6×/h em vez de 1–3×/dia. Medir duração e consultas no primeiro dia; se a duração passar de 5 min, alongar o intervalo.
- Camada "agora": 1 consulta de posição por placa aberta a cada 30 s, com cache.
- Pré-requisito no banco (feito em 06/10): índice BRIN em `posicoes_historico(criado_em)` + limpeza do motor 1×/h (rodava ~12×/h varrendo 11 GB), ajuste do Postgres (cache 3 GB, parâmetros de SSD, log de consulta > 2 s), backup diário dos dois bancos, swap 4 GB, limite de logs.
- O tick de 10 min da RQ e o da Nutry rodam em sequência no mesmo processo/lock, nunca em paralelo.
- Nada roda fora de 05h–21h; nada grava no histórico oficial sem o clique.

## Testes

- `gerarKpiNutrimax`: testes atuais da rota passam a exercitar a função; teste de equivalência (rota PDF vs dados guardados) com fixtures.
- Tick: lock (segunda execução sai), sem dados do dia (sai), erro (grava erro e mantém último ok).
- API agora: cache 30 s; placa sem CV; Unitrac fora.
- Tela: conferência visual (print) com dados reais do dia.

## Entrega em fases

1. Função única da Nutry Max + teste de equivalência (sem tela). Nada muda pro usuário.
2. Tabelas + subir romaneio do dia + tick de 10 min + tela (lista/placa/NF) + gerar agora — Nutry Max.
3. Camada "agora" (cronômetro ao vivo, posição).
4. Rio Quality na mesma tela (seletor de cliente), com teste de equivalência próprio (02/10/2026: 90,5%, 2.578 de 2.848).
