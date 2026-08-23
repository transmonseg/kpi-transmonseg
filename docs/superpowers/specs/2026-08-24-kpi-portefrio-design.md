# KPI Portefrio (romaneio + Ravex) — Design

## Contexto

A Portefrio é a terceira empresa do sistema (`empresas.ts` já tem
`'portefrio'` cadastrada; nav, controle de acesso e telas placeholder
`/painel/portefrio/{gerar,historico}` já existem, criados junto com o
trabalho de escopo por empresa). Falta o pipeline de geração de KPI em si.

Diferente de Benassi/Nutry Max (que recebem status de entrega confirmado
via API da Unitrac e comparam contra um romaneio em PDF de texto livre), a
Portefrio usa uma frota rastreada pela **Ravex**, uma plataforma de
rastreamento diferente, com API própria (investigação completa registrada
no cofre `chaves-apis-joaquim/sistema-kpi/chaves.md`). O romaneio da
Portefrio também é estruturalmente mais simples: uma tabela por placa, sem
conceito de carga, motorista ou horário planejado — só uma lista ordenada
de clientes (`Ordem de atendimento`) que aquele veículo deve visitar no
dia.

A Ravex também expõe telemetria de refrigeração via CAN bus
(`CanRefrigeracao_CabineTemperatura`), o que a Unitrac não tem — pedido
explícito do usuário incluir isso desde a v1, mesmo sem uma regra de
conformidade definida ainda (só coletar/exibir o valor real).

## Achados da investigação técnica (feita antes deste design, com dado
real)

- **Login sem browser funciona.** `POST /Token` com
  `grant_type=password&username=<email>&password=<MD5 da senha>` devolve
  um Bearer token direto, sem precisar simular o SPA Angular. Token dura
  `expires_in=1209599` segundos (~14 dias).
- **Resolução placa→veículo funciona**: `GET
  /odata1/Veiculo?$filter=contains(tolower(PlacaNome),'<placa minúscula>')`
  devolve o `Id` interno usado no endpoint de histórico.
- **Cobertura de frota é um problema real, não de integração**: a Conta 1
  (`ana@portefrio.com`) só enxerga 6 veículos
  (`RJC8I17,RKT3A93,RKP5I45,LUE5C42,SRV9I06,TTD0G02`). Das ~10 placas que
  aparecem no romaneio real já visto, só `LUE5C42` e `RKT3A93` estão
  nessa conta. A Conta 2 (`hugocunha171@gmail.com`) está **bloqueada**
  administrativamente pela Ravex — não gera token, erro
  `acesso_bloqueado`. **Decisão do usuário**: construir o pipeline de
  forma genérica (qualquer placa, resolve o que a conta enxergar) em vez
  de travar num escopo de "só 2 placas" — hoje, na prática, só
  `LUE5C42`/`RKT3A93` terão GPS confirmado; as demais aparecem como "sem
  GPS" (mesmo padrão de fail-open que a Nutry Max já usa pra placa sem
  correspondência na frota Unitrac). Quando o usuário resolver o acesso
  (ou pedir a conta certa à Ravex), o resto passa a funcionar sem
  mudança de código.
- **Histórico de veículo sem atividade recente**: testado com `LUE5C42` e
  `RKT3A93` numa janela de 30 dias — devolveu vazio nos dois (200 OK,
  JSON válido, `value: []`). O cadastro do veículo tinha a observação
  "Sem Programação <PORTEFRIO>", sugerindo que esses veículos
  especificamente não estão rodando rota da Portefrio agora. Não é sinal
  de integração quebrada — é ausência de dado real no período testado. A
  validação de ponta a ponta com dado 100% real (endereço → GPS →
  confirmação) fica pendente de um dia em que uma dessas placas esteja
  de fato em rota — mesmo tipo de dependência que bloqueou a validação
  final da Nutry Max até haver Escala+Romaneio de um dia recente.

## Formato do romaneio (PDF real já visto,
`ROMANEIO PORTEFRIO.pdf`)

Tabela única (sem uma "Escala" separada), colunas: `Placa`, `Código`
(código do cliente), `CNPJ`, `Razão social`, `Nome informal`, `Endereço`,
`Número`, `CEP`, `Bairro`, `Cidade`, `UF`, `Ordem de atendimento`. Uma
placa pode ter dezenas de linhas (visto até 22 clientes numa única
placa), cada uma com uma ordem sequencial (1, 2, 3...) — é a rota
planejada daquele veículo no dia. Sem peso, sem NF, sem motorista, sem
horário planejado.

## Arquitetura

Mesmo formato de pipeline que a Nutry Max (parse → geocodifica →
confirma via GPS externo → agrega → gera XLSX), com dois componentes
trocados pela fonte de dado diferente:

```
PDF romaneio → parse-romaneio.ts → geocode.ts (reusado, já genérico)
                                          ↓
                        ravex-auth.ts + ravex-api.ts (novo)
                                          ↓
                              visitas.ts (novo, clusteriza
                              evento cru em visita — Ravex não
                              devolve parada pré-processada
                              como a Unitrac devolve)
                                          ↓
                              agregacao.ts (novo, por cliente,
                              inclui temperatura)
                                          ↓
                              gerador-xlsx.ts (novo)
```

## Componentes

**`src/lib/kpi-portefrio/parse-romaneio.ts`** — le o PDF tabular e devolve
`LinhaRomaneioPortefrio[]`: `{ placa, codigoCliente, cnpj, razaoSocial,
nomeInformal, endereco, numero, cep, bairro, cidade, uf, ordem }`.
Endereço completo pra geocodificação é a concatenação
`endereco, numero - bairro, cidade - uf`.

**`src/lib/kpi-portefrio/ravex-auth.ts`** — `obterToken(): Promise<string>`.
Faz `POST /Token` com usuário/senha (MD5) das envs `RAVEX_USUARIO`/
`RAVEX_SENHA` (mesmo padrão de secret-via-env de `MOTOR_SECRET`), guarda
o token e a data de expiração em memória do processo (module-level,
mesma vida do processo Node — reinicia ao reiniciar o PM2, aceitável
dado os ~14 dias de validade). Se o token guardado ainda for válido,
reusa; senão, refaz login. Se o login falhar (credencial errada, conta
bloqueada), lança erro explícito — não é fail-open aqui, autenticação
quebrada precisa aparecer, não virar silenciosamente "sem GPS" pra frota
inteira.

**`src/lib/kpi-portefrio/ravex-api.ts`** — `resolverIdVeiculo(placa):
Promise<number | null>` (null se a conta não enxerga essa placa — fail-open,
não lança) e `buscarHistoricoVeiculo(idVeiculo, dataInicioUnix,
dataFimUnix): Promise<EventoRavex[]>` (`GetHistoricoVeiculoV2`, devolve
`[]` em qualquer erro de rede/formato — mesmo fail-open que
`buscarParadasDoDia` já faz pro lado Unitrac). Cada `EventoRavex` traz
`{ dataHora, lat, lng, temperatura: number | null }` (mapeado de
`EventoDatahora`/`GPSLatitude`/`GPSLongitude`/
`CanRefrigeracao_CabineTemperatura`).

**`src/lib/kpi-portefrio/visitas.ts`** — `montarVisitas(eventos:
EventoRavex[], clientes: { codigoCliente, lat, lng }[]): Visita[]`. Pra
cada evento, calcula distância até cada cliente geocodificado; evento
dentro do raio (mesmo `RAIO_ENTREGA_METROS` que a Nutry Max já usa,
300m, valor conhecido e testado) conta como presença naquele ponto.
Clusteriza eventos consecutivos dentro do raio do MESMO cliente numa
única visita (chegada = primeiro evento do cluster, saída = último),
igual ao princípio de "perímetro próprio" já usado na Nutry Max, mas
escrito do zero aqui porque a entrada é stream de evento cru, não parada
pré-processada.

**`src/lib/kpi-portefrio/agregacao.ts`** — por cliente (chave
placa+codigoCliente): `{ placa, ordem, cliente, endereco, visitado:
boolean, horarioChegada: string | null, tempMin: number | null, tempMax:
number | null, tempMedia: number | null, ordemReal: number | null }`.
`ordemReal` é a posição do cliente na sequência de visitas confirmadas
por GPS (pra comparar contra `ordem` planejada) — `null` se não
visitado. Temperatura agregada só dos eventos dentro da janela da visita
confirmada; sem regra de conformidade (só os três números).

**`src/lib/kpi-portefrio/gerador-xlsx.ts`** — colunas: Placa, Ordem
Planejada, Ordem Real, Cliente, Endereço, Visitado, Horário Chegada, Temp
Mín (°C), Temp Máx (°C), Temp Média (°C), Status.

**`src/app/api/kpi/portefrio/gerar/route.ts`** — `POST`, um único upload
(o romaneio — não há Escala separada), `data` (YYYY-MM-DD). Admin-only
(`perfil.papel !== 'admin'` → 403, mesma regra da Nutry Max — geração é
sempre admin-only no sistema todo). Orquestra o pipeline inteiro, grava
auditoria em `kpi_romaneio_geracoes` com `cliente='portefrio'` (tabela já
existe, reusada sem migration nova — sua coluna `qtd_cargas` passa a
significar "quantidade de clientes/paradas planejadas" pra esse
cliente, sem renomear a coluna).

**`src/app/painel/portefrio/gerar/page.tsx`** — troca o conteúdo
placeholder atual pela tela real de upload (um único arquivo + campo de
data), mesmo componente `FileDropzone` já usado na Nutry Max.

**`src/app/painel/portefrio/historico/page.tsx`** — troca o placeholder
por uma listagem igual à de `/painel/nutrimax/historico`, filtrando
`cliente='portefrio'`.

## Tratamento de erro

- Placa do romaneio sem correspondência na Ravex (`resolverIdVeiculo`
  devolve `null`) → fica sem GPS, aparece como "não visitado" em todas as
  linhas daquela placa, não bloqueia o resto do romaneio.
- Falha de autenticação na Ravex (credencial inválida, conta bloqueada)
  → erro explícito na geração inteira (`500`, mensagem clara) — não
  mascara como "sem GPS", porque nesse caso NENHUMA placa teria GPS e
  isso enganaria quem está lendo o relatório.
- Endereço não geocodificado → mesmo fail-open que já existe em
  `geocode.ts` (reusado sem mudança) — cliente aparece sem confirmação
  de visita possível, mas a linha continua no relatório.
- Sem dado de temperatura no período da visita → `tempMin/Max/Media`
  ficam `null`, aparecem como "—" no XLSX, não travam a linha.
- Romaneio PDF em formato inesperado (0 linhas reconhecidas) → erro 422
  claro, mesmo padrão da Nutry Max.

## Testes

- `parse-romaneio.test.ts`: parser contra um fixture de texto extraído
  do PDF real (não commitar o PDF em si — extrair uma amostra
  representativa de 2-3 placas como fixture).
- `ravex-auth.test.ts`: mock de `fetch` — token reusado enquanto válido,
  refeito quando expirado, erro explícito propaga em caso de
  `acesso_bloqueado`/credencial inválida.
- `ravex-api.test.ts`: mock de `fetch` — placa não encontrada devolve
  `null` sem lançar, erro de rede devolve `[]` sem lançar.
- `visitas.test.ts`: clusterização pura, casos: evento dentro do raio
  vira visita, eventos consecutivos do mesmo cliente agrupam numa visita
  só, evento fora de qualquer raio não gera visita nenhuma.
- `agregacao.test.ts`: cálculo de `ordemReal`, temperatura min/max/média,
  caso "cliente não visitado" (todos os campos de confirmação `null`).
- `gerador-xlsx.test.ts`: snapshot das colunas.
- Validação com dado real (gate humano, como na Nutry Max): rodar contra
  o romaneio real já visto assim que `LUE5C42` ou `RKT3A93` estiverem
  ativos num dia real, ou assim que o usuário resolver o acesso a mais
  veículos da Ravex.

## Fora de escopo (explicitamente)

- Regra de conformidade de temperatura (limite aceitável) — usuário
  ainda não definiu o número; só coleta e exibe o dado real.
- Resolver o acesso bloqueado da Conta 2 ou pedir a conta com a frota
  completa à Ravex — ação do usuário, fora do código.
- Qualquer tela de dashboard/KPI manual pra Portefrio além de Gerar KPI
  e Histórico (mesmo recorte que Nutry Max tem hoje).
- Renovação de token sem reiniciar o processo caso o token expire em
  produção contínua por mais de 14 dias sem restart — o cache em memória
  já resolve o caso comum (token válido por toda a vida do processo);
  um mecanismo mais robusto (ex. persistir em tabela) fica pra depois se
  o processo realmente ficar rodando ininterrupto por mais de 14 dias.
