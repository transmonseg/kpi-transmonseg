# Plano de Melhorias — Varredura Técnica Completa

Gerado em 2026-05-29 · 95 achados (8 domínios auditados em paralelo)

| Severidade | Qtd |
|---|---|
| 🔴 critica | 5 |
| 🟠 alta | 19 |
| 🟡 media | 42 |
| ⚪ baixa | 29 |


## 🔴 CRITICA (5)

### 🔴 Rota /api/lojas/catalogar sem nenhuma checagem de autenticação
- **área:** API e Backend · **tipo:** risco · **esforço:** P
- **arquivo:** `src/app/api/lojas/catalogar/route.ts:8-31`
- **impacto:** Qualquer pessoa não autenticada que conheça a URL consegue chamar o endpoint, vazar o cadastro completo de 473 lojas (nomes, códigos unitrac, lat/lng, raios de geofence) via a função de sugestão. É exposição de dados operacionais sensíveis da transportadora sem login. Diferente das demais rotas, o middleware NÃO protege /api por padrão de forma confiável para POST (o matcher só redireciona navegação; chamadas de API recebem o redirect 307 e podem ainda assim ser exploradas dependendo do client).
- **proposta:** Adicionar o mesmo gate das outras rotas no topo do POST: `const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return new NextResponse('Não autenticado', { status: 401 })`.

### 🔴 Rota /api/lojas/catalogar não verifica autenticação
- **área:** DADOS-BANCO · **tipo:** risco · **esforço:** P
- **arquivo:** `src/app/api/lojas/catalogar/route.ts:8-18`
- **impacto:** É a ÚNICA rota de /api/lojas sem o bloco `const { data: { user } } = await supabase.auth.getUser(); if (!user) return 401`. Usa direto o service client (bypass de RLS) e devolve o catálogo inteiro de lojas (nome, codigo_unitrac, codigo_escala, lat/lng) para qualquer requisição anônima. Vazamento de toda a base de geofences/códigos da operação sem login.
- **proposta:** Adicionar o mesmo guard de auth das outras rotas (createClient() + getUser() + 401) antes de instanciar o service client.

### 🔴 Tabela kpi_manual_entradas sem RLS habilitado
- **área:** DADOS-BANCO · **tipo:** risco · **esforço:** P
- **arquivo:** `supabase/migrations/20260528000000_kpi_manual.sql:2-17`
- **impacto:** Toda tabela do app tem RLS menos esta. Como o Postgres só aplica RLS quando habilitado, qualquer chave anon/authenticated que alcance a tabela (ex.: futuro acesso client-side, ou exploração via PostgREST) lê/escreve/apaga KPIs manuais de todas as redes/dias livremente. O dashboard inteiro (métricas, histórico, export) depende desses dados.
- **proposta:** Adicionar `alter table kpi_manual_entradas enable row level security;` + policy de SELECT para authenticated e escrita restrita a service_role (escrita já passa só pelo service client nas rotas).

### 🔴 Query do dashboard trunca em 1000 linhas (sem paginação) — métricas mensais ficam silenciosamente erradas
- **área:** Dashboard e KPIs Manuais · **tipo:** bug · **esforço:** M
- **arquivo:** `src/app/api/dashboard/route.ts:39-41`
- **impacto:** O Supabase aplica limite default de 1000 linhas por SELECT. Com 473 lojas e 18 redes, um período 'mes' (ou até 'semana' em dia cheio) ultrapassa 1000 entradas facilmente. A API retorna só as primeiras 1000 (ordem indefinida sem ORDER BY), e calcularMetricas() processa um subconjunto parcial. Taxa de entrega, total, série por dia, ranking — tudo fica errado SEM nenhum erro ou aviso. O PDF de export herda o mesmo bug. É o defeito mais perigoso porque parece funcionar.
- **proposta:** Paginar via .range() em loop até esgotar, OU usar .csv()/RPC, OU agregar no Postgres com uma view/RPC (count, sum por status, por rede, por dia) em vez de trazer linha a linha. Para um dashboard, agregar no banco é o certo: elimina o teto de linhas e o custo de trafegar milhares de registros.

### 🔴 Fallback temporal pega a PRIMEIRA parada com score finito, não a de menor score (raiz do bug #255 parada-errada)
- **área:** Matcher · **tipo:** bug · **esforço:** P
- **arquivo:** `src/lib/kpi/matcher.ts:1244-1268`
- **impacto:** Quando uma placa tem várias paradas que compartilham token com a loja escalada (ex.: 4 REGINA, ou 'BARRA I' vs 'BARRA II' vs 'BARRA III' da mesma rede), a linha recebe a parada mais CEDO no tempo com qualquer overlap, não a que realmente bate melhor. Resultado: horários de chegada/saída da loja ERRADA no KPI. É exatamente o sintoma da task #255 em aberto.
- **proposta:** Trocar o break-no-primeiro por seleção do mínimo: percorrer todas as paradas livres, calcular scorePair, e escolher `melhorIdx` com menor score (>=0 e < Infinity), com desempate cronológico. Mesma correção que já foi aplicada no geo-fallback (linhas 1368-1381 fazem `bestScore`/`bestLinha`); o fallback temporal ficou para trás com o padrão antigo de `break`.


## 🟠 ALTA (19)

### 🟠 Injeção de filtro PostgREST via parâmetro de busca `q` em /api/cozinha/clientes
- **área:** API e Backend · **tipo:** bug · **esforço:** P
- **arquivo:** `src/app/api/cozinha/clientes/route.ts:51`
- **impacto:** Um `q` contendo vírgula ou parênteses (ex: `q=,id.gt.0` ou `q=*)` ) quebra a expressão `.or()` e permite injetar filtros arbitrários do PostgREST, alterando o WHERE da query. Mesmo sem RLS bypass adicional (já usa service client), permite enumerar/filtrar registros de forma não intencionada e pode causar erros 500 que vazam mensagem do Postgres. É a classe de bug 'PostgREST filter injection'.
- **proposta:** Escapar/sanitizar `q` antes de interpolar: remover `,`/`(`/`)`/`*` ou usar `.ilike()` separados encadeados com `.or()` via objeto, ou aplicar `q.replace(/[,()*]/g, '')`. Idealmente validar comprimento e caracteres permitidos.

### 🟠 Estado global mutável setSemGeo compartilhado entre requests (condição de corrida)
- **área:** API e Backend · **tipo:** risco · **esforço:** M
- **arquivo:** `src/lib/kpi/matcher.ts:62-63`
- **impacto:** Em runtime nodejs serverless, módulos são compartilhados entre requests concorrentes na mesma instância. Como `setSemGeo(true)` e a chamada do matcher são `await` separados, se um teste/rota futura setar `false` entre o set e o uso, ou se outra rota rodar geo, há janela de corrida onde o flag errado é lido. Hoje funciona por sorte (todos setam true), mas é frágil: qualquer rota nova que precise de geo (ou um reset) corrompe silenciosamente o KPI de requests paralelos — exatamente o tipo de bug que produz dados errados intermitentes e quase impossíveis de reproduzir.
- **proposta:** Passar o modo como parâmetro explícito de `cruzaEscalaUnitrac(..., { semGeo: true })` em vez de mutar global, ou encapsular em AsyncLocalStorage. Mínimo: documentar que SEM_GEO nunca deve ser resetado em produção e adicionar assert.

### 🟠 Auto-cadastro de lojas em canonical_loja sem cruzar com a ESCALA real
- **área:** API e Backend · **tipo:** risco · **esforço:** M
- **arquivo:** `src/app/api/unitrac/upload/route.ts:178-226`
- **impacto:** Viola a regra de produto registrada na memória (feedback_kpi_validar_loja_na_escala): 'Cadastrar loja nova só após cruzar com a ESCALA real — Unitrac tem muitos clientes que a Triforce NÃO atende'. O Unitrac contém paradas de clientes fora do escopo; auto-cadastrá-los polui a base canônica com lojas que a transportadora não serve, e `inferirRede` por prefixo erra rede (ex: nome ambíguo) silenciosamente. Pode também cadastrar ROTA/BASE como loja se a classificação vier errada de um parser.
- **proposta:** Gate o auto-cadastro: só inserir em canonical_loja se o nome/código casar com alguma loja/cliente presente na escala daquele período, ou colocar atrás de revisão manual (tabela de 'candidatas' pendentes de aprovação). No mínimo, exigir match de código com escala antes de inserir.

### 🟠 Upload de KPI manual: delete-then-insert não-atômico pode zerar o dia
- **área:** DADOS-BANCO · **tipo:** bug · **esforço:** M
- **arquivo:** `src/app/api/kpi-manual/upload/route.ts:28-32`
- **impacto:** O delete e o insert não estão em transação. Se o insert falhar (timeout, payload inválido, erro de coluna), os dados anteriores daquele dia/rede já foram apagados e não há rollback — o dia fica vazio silenciosamente. Reupload concorrente da mesma rede/dia também gera corrida (dois deletes + dois inserts intercalados duplicam ou perdem linhas), pois não há UNIQUE em (data, rede_id, loja).
- **proposta:** Mover delete+insert para uma RPC transacional (plpgsql) ou usar upsert idempotente com `onConflict` sobre uma UNIQUE (data, rede_id, loja). Só apagar após insert bem-sucedido, ou envolver ambos em transação.

### 🟠 UNIQUE global em lojas.codigo_unitrac impede código repetido entre redes e não tem migration versionada
- **área:** DADOS-BANCO · **tipo:** tech-debt · **esforço:** M
- **arquivo:** `supabase/migrations/20260522010000_add_lojas_faltantes_fase2.sql:9`
- **impacto:** (1) A constraint é GLOBAL, mas o matcher sempre filtra por rede antes (redeLojas.find(l => l.codigo_unitrac === parada.codigo_loja)). Logo, se duas redes legitimamente compartilham um código Unitrac, o cadastro da segunda é bloqueado, deixando a loja órfã. (2) Schema da tabela lojas e suas constraints não estão em nenhuma migration → impossível recriar o ambiente do zero ou auditar o estado real. As fases 2 dispararam dezenas de erros de cadastro em massa por causa disso.
- **proposta:** Versionar uma migration com CREATE TABLE lojas (estado atual) + constraints. Reavaliar se o UNIQUE deve ser (rede_id, codigo_unitrac) em vez de global, alinhado a como o matcher resolve por rede.

### 🟠 Matcher escolhe primeira loja por codigo_unitrac (.find) — duplicata silenciosa sombra a correta
- **área:** DADOS-BANCO · **tipo:** bug · **esforço:** M
- **arquivo:** `src/lib/kpi/matcher.ts:628`
- **impacto:** Se houver duas lojas ATIVAS com o mesmo codigo_unitrac na mesma rede (a UNIQUE é global mas pode haver registro inativo+ativo, ou divergência de trim/caixa já que matcher compara === cru enquanto catalogo.ts usa toUpperCase), o .find retorna a PRIMEIRA por ordem de array (ordem de retorno do Postgres, não determinística sem ORDER BY). A parada pode ser atribuída à loja errada sem nenhuma anomalia disparada. Em modo sem-geofence isso é a única via de match, então o erro é invisível.
- **proposta:** Comparar com normalização consistente (trim+upper, igual a buscaPorCodigoUnitrac do catalogo.ts) e, em caso de múltiplos matches, logar/emitir anomalia de ambiguidade em vez de pegar o primeiro silenciosamente.

### 🟠 Precedência de status: 'entregue' depende só de chd existir, mascarando 'sem rastreador' quando há horário parcial
- **área:** Dashboard e KPIs Manuais · **tipo:** bug · **esforço:** M
- **arquivo:** `src/lib/kpi/parse-kpi-manual.ts:91-95`
- **impacto:** Se uma linha tiver um horário em CHD/SAI mas o texto 'SEM RASTREADOR' estiver numa célula fora do range varrido (ou a regex não casar por acento/abreviação), a loja vira 'entregue' indevidamente, inflando a taxa de entrega e a cobertura GPS. A ordem também impede detectar linhas que são ao mesmo tempo 'nao_foi' com horário residual. O parser confia em layout muito específico de células mescladas.
- **proposta:** Tornar a detecção de status mais robusta: varrer a linha inteira (não só saidaCd..sai+1) para os marcadores textuais, e exigir que 'entregue' tenha chd E sai válidos (não só chd). Logar/contabilizar linhas ambíguas (tem horário E tem texto de exceção) para revisão em vez de classificar silenciosamente.

### 🟠 Semana começa no domingo (getUTCDay) — diverge do calendário operacional brasileiro (segunda)
- **área:** Dashboard e KPIs Manuais · **tipo:** bug · **esforço:** P
- **arquivo:** `src/app/api/dashboard/route.ts:13-18`
- **impacto:** Operação de transportadora normalmente raciocina a semana de segunda a sábado/domingo. O filtro 'semana' agrupa domingo junto com a semana errada, fazendo a comparação semana-a-semana e o total semanal não baterem com a percepção da Tia/gestão. Além disso usa UTC sobre uma data BRT — em virada de mês/horário pode deslocar 1 dia.
- **proposta:** Definir explicitamente o início da semana (segunda): offset = (day + 6) % 7. Documentar a convenção. Como ref já é uma data BRT pura (YYYY-MM-DD), manter a aritmética em UTC é ok, mas alinhar com a regra de negócio acordada com a operação.

### 🟠 Fórmula MOD(tempo) sobre célula de TEXTO gera #VALUE! ao recalcular no Excel
- **área:** GERADOR XLSX/PDF · **tipo:** bug · **esforço:** P
- **arquivo:** `src/lib/kpi/gerador-kpi.ts:204-205`
- **impacto:** KPI entregue à Tia Erica/cliente mostra #VALUE! na coluna Tempo em Loja assim que o Excel recalcula. Toda loja sem rastreador ou não-visitada (cenário comum no dia a dia) vira erro visível. Diverge do modelo aprovado, que mostraria essas células em branco.
- **proposta:** Só emitir a fórmula quando ambos os horários forem numéricos (sem textoSlot). Algo como: const temTempo1 = !textoSlot1 && chd1!==null && sai1!==null; ws.getCell(row,14).value = temTempo1 ? { formula:`MOD(G${row}-F${row},1)`, result: tempo1 } : null. Idem para col 15 com textoSlot2/chd2/sai2.

### 🟠 assignOptimal atribui gulosamente por linha sem garantir o par globalmente ótimo no caso nL<=nP quando há empates de score
- **área:** Matcher · **tipo:** bug · **esforço:** M
- **arquivo:** `src/lib/kpi/matcher.ts:871-911`
- **impacto:** Duas linhas da mesma loja (carro1/carro2) podem receber paradas trocadas de forma não-determinística entre execuções/ambientes, ou a parada de maior duração ir para o carro errado. Em multi-trip a saída_cd é computada por-parada, então trocar as paradas troca também a saída do CD atribuída a cada carro.
- **proposta:** Adicionar desempate determinístico estável no sort de linhas (ex.: `localeCompare(...) || a.carro_ordem - b.carro_ordem || a.id.localeCompare(b.id)`) e, no DFS, registrar critério de desempate explícito (menor índice de parada por linha) quando `total === bestTotal`. Garante reprodutibilidade e atribuição consistente carro1<->parada.

### 🟠 Fallback 'parada compartilhada' não marca usados e pode double-contar a mesma parada em redes diferentes
- **área:** Matcher · **tipo:** risco · **esforço:** M
- **arquivo:** `src/lib/kpi/matcher.ts:1454-1477`
- **impacto:** Uma única parada GPS pode ser atribuída como 'entrega' a múltiplas linhas/lojas distintas (GPS clonado). Para redes com geofence agregado e sem geo (SEM_GEO=true em produção), some o guard de 500m e o compartilhamento fica governado só por scorePair===0, que é frouxo quando local_parada concatena vários códigos de loja separados por vírgula.
- **proposta:** No modo SEM_GEO, exigir match por código EXATO (cod_unitrac da parada == cod da loja da linha) para compartilhar, em vez de scorePair===0 sobre nome concatenado. Quando faltam coordenadas, o guard de distância deveria ser fail-closed (não compartilhar) e não fail-open (`return true`).

### 🟠 PAX detectYearMonth quebra a busca de ano/mês na primeira aba-dia, mesmo sem achar data → mês errado em viradas de mês
- **área:** Parsers de Escala · **tipo:** bug · **esforço:** P
- **arquivo:** `src/lib/parsers/escala-pax.ts:141-155`
- **impacto:** Em arquivos PAX onde a 1ª aba-dia não carrega Date nativo, ano/mês vêm da data DO PROCESSAMENTO. Processar a escala de abril rodando em maio gera tabDate com mês 05 → tabToDate produz '2026-05-NN', dataAlvo nunca casa, 0 linhas (ou linhas com data errada). Risco real no fim/início de mês, justamente quando se reprocessa retroativo.
- **proposta:** Mover o `break` para dentro: só interromper a varredura após encontrar uma data válida (usar flag `found`); e varrer TODAS as abas-dia até achar, não só a primeira. Também aceitar datas em string DD/MM/YYYY (via dateVal) na detecção, não só Date nativo.

### 🟠 Orquestrador AUTO não faz dedup PAX-cobre-GERAL → SUPER_PAX/FEIRA_NOVA/EMANUEL contados em dobro
- **área:** Parsers de Escala · **tipo:** bug · **esforço:** M
- **arquivo:** `src/app/api/escalas/upload/route.ts:102-128`
- **impacto:** Quando GERAL traz SUPER_PAX/EMANUEL/FEIRA_NOVA já com motorista/placa preenchidos (acontece em parte das semanas), a mesma loja-rede aparece no upload GERAL e no upload PAX → dupla contagem de entregas dessas redes no KPI. O comentário em escala-geral.ts:384-387 assume que essas redes vêm 'só com nome e peso', premissa que nem sempre se sustenta.
- **proposta:** Na geração do KPI (ou num passo de reconciliação no upload), descartar linhas de SUPER_PAX/FEIRA_NOVA/EMANUEL provenientes do tipo GERAL quando existir upload PAX para a mesma data. Tornar a regra explícita e testada, não implícita no filtro de placeholder.

### 🟠 escala-universal usa getMonth()/getDate() local em vez de UTC → data off-by-one (convenção BRT do projeto)
- **área:** Parsers de Escala · **tipo:** bug · **esforço:** P
- **arquivo:** `src/lib/parsers/escala-universal.ts:44-49`
- **impacto:** Fallback universal grava data_entrega deslocada (ex: 18/05 vira 17/05), e como o matcher casa por data, as linhas ficam fora do dia e não cruzam com o Unitrac. Silencioso: vira 'órfã' sem erro.
- **proposta:** Usar getUTCFullYear/getUTCMonth/getUTCDate na extrairData do universal (igual aos demais parsers), ou reusar formataDataISO com normalização UTC.

### 🟠 Data padrão de Gerar KPI e Cozinha usa UTC (toISOString), mostra o dia errado à noite
- **área:** UX e Fluxos do Operador · **tipo:** bug · **esforço:** P
- **arquivo:** `src/app/painel/kpi/simples/page.tsx:85-87`
- **impacto:** Operador da transportadora que gera KPI após 21h (BRT) recebe a data de AMANHÃ pré-preenchida. Como a data carimba o KPI, casa com a escala e é a chave do histórico/export mensal, isso produz KPI no dia errado de forma silenciosa — exatamente o tipo de erro que o produto deveria prevenir. A operação roda de madrugada (turnos madrugada/manhã), aumentando a exposição.
- **proposta:** Importar hojeBR de '@/lib/data-br' e usar como default em kpi/simples (substituir a função hoje local) e em cozinha/uploader. Eliminar toda chamada toISOString().slice(0,10) para datas de calendário no painel.

### 🟠 Edições da tabela de preview (lineEdits) são perdidas silenciosamente ao reprocessar com 'Gerar agora'
- **área:** UX e Fluxos do Operador · **tipo:** bug · **esforço:** M
- **arquivo:** `src/app/painel/kpi/simples/page.tsx:670-696`
- **impacto:** Operador corrige manualmente uma placa/horário de uma rota sem GPS, mas perde a correção se não acertar exatamente o botão 'Re-gerar'. Dois botões de 'gerar' com semânticas diferentes (um descarta edits, outro aplica) é uma armadilha de UX que leva a KPI final errado.
- **proposta:** Unificar: quando houver lineEdits, o CTA principal deve aplicá-los (ou ficar desabilitado com aviso 'há edições não aplicadas, use Re-gerar'). Alternativamente, mostrar confirmação antes de descartar edits. Espelhar o padrão já usado na Cozinha (botões de download desabilitados com title 'Salve as edições primeiro' quando editou===true).

### 🟠 Duração multi-dia (1D+) é zerada — regex só aceita '0D' e parseDuracaoStr aceita '\d+D' (inconsistência interna)
- **área:** parser-unitrac · **tipo:** bug · **esforço:** P
- **arquivo:** `src/lib/parsers/unitrac-pdf.ts:282`
- **impacto:** Paradas longas (parada de fim de semana na base, caminhão quebrado, GPS preso >24h) somem completamente do KPI em vez de aparecer como BASE/FORA. Como o regex é global e ancora na próxima data, a falha pode ainda cascatear e fundir a parada seguinte. Silencioso: ninguém vê o erro, só faltam paradas.
- **proposta:** Trocar `0D ` por `\d+D ` nos grupos de duração/tempo-até do PARADA_REGEX (e no DUR_RE do coord). parseDuracaoStr já trata os dias corretamente; basta o regex aceitar.

### 🟠 Default de classificação DIVERGE entre parser PDF (FORA_BASE) e parser XLSX (LOJA) para o mesmo local
- **área:** parser-unitrac · **tipo:** bug · **esforço:** M
- **arquivo:** `src/lib/parsers/unitrac-pdf.ts:78`
- **impacto:** KPI do mesmo dia muda conforme o formato do upload. Uma loja real com local_parada sem código (texto puro de endereço, sem '12345 - NOME') vira FORA_BASE no PDF e LOJA no XLSX — entrega some ou aparece dependendo do arquivo escolhido. Não-determinismo de produto.
- **proposta:** Unificar a regra de default num único helper compartilhado (classificacao-comum.ts) consumido pelos 3 parsers. Decidir com a Tia Erica qual default é correto no modo sem-geofence e aplicar igual em PDF e XLSX.

### 🟠 Zero teste do PARADA_REGEX / preprocess / REPAIR — o coração do parser PDF está sem cobertura
- **área:** parser-unitrac · **tipo:** tech-debt · **esforço:** M
- **arquivo:** `src/lib/parsers/unitrac-pdf.ts:278`
- **impacto:** Cada ajuste numa das 12 regras de normalizeSpaces ou no REPAIR pode quebrar silenciosamente a extração de outro dia sem nenhum teste pegando. O histórico de comentários no arquivo mostra que esses regex já quebraram em produção várias vezes (UFW0H63, FORA DE DE JANEIRO, etc).
- **proposta:** Capturar 2-3 result.text reais (anonimizados) de dias problemáticos como fixtures e testar parseTextToResumos ponta a ponta (qtd de paradas, classificação, codigo_loja, cruzamento de página). É a melhor blindagem contra regressão dado o quanto esse arquivo muda.


## 🟡 MEDIA (42)

### 🟡 Ausência de rate-limit e limite de tamanho de payload em rotas de upload/processamento pesado
- **área:** API e Backend · **tipo:** risco · **esforço:** M
- **arquivo:** `src/app/api/kpi/simples/route.ts:129`
- **impacto:** Um usuário autenticado (ou atacante com sessão) pode enviar `escalaBucketPaths` com dezenas de paths ou disparar muitas requisições paralelas, esgotando CPU/tempo de função serverless (custo) e potencialmente derrubando o processamento legítimo. Como o projeto roda em free tier (regra zero-custo), invocações longas repetidas consomem cota.
- **proposta:** Limitar tamanho dos arrays (ex: máx 10 paths por request), validar que cada path pertence ao prefixo esperado (`simples/${data}/`) para impedir download de paths arbitrários do bucket, e adicionar rate-limit simples por usuário (ex: tabela de last_run ou KV).

### 🟡 storagePath/bucketPath aceitos do client sem validação de prefixo (path traversal lógico no bucket)
- **área:** API e Backend · **tipo:** risco · **esforço:** P
- **arquivo:** `src/app/api/unitrac/upload/route.ts:37-43`
- **impacto:** Um usuário autenticado pode passar qualquer caminho dentro do bucket (ex: `2026-01-01/unitrac.xlsx` de outro dia/cliente) e fazer o sistema baixar e processar arquivos que não foram dele, ou referenciar paths fora do dia informado, gerando KPI com dados cruzados. Não é traversal de filesystem, mas é IDOR/confusão de objeto no storage.
- **proposta:** Validar que `storagePath` casa com o padrão esperado para o `data` informado (ex: `^${data}/` ou `^simples/${data}/`) antes de baixar. Rejeitar paths que não batam.

### 🟡 Persistência de escala_linhas em kpi/simples não é transacional — delete antes de insert pode deixar dia sem dados
- **área:** API e Backend · **tipo:** bug · **esforço:** M
- **arquivo:** `src/app/api/kpi/simples/route.ts:241-302`
- **impacto:** Se o INSERT de escala_linhas falhar no meio (ex: control char, constraint), o delete já apagou o estado anterior e o novo fica parcial — o dia 25 (que a nota do código diz virar 'fonte de verdade pras alterações futuras') fica com linhas faltando, e inferirSaiDaEscala (U5) passa a inferir motoristas errados, silenciosamente (só warn no log). Não há rollback nem sinalização ao usuário.
- **proposta:** Fazer a substituição idempotente sem janela vazia: inserir o novo upload+linhas primeiro, e só então deletar o anterior; ou usar uma RPC/transação no Postgres. No mínimo, propagar o erro de insert para a resposta em vez de só logar.

### 🟡 DELETE de KPI manual sem confirmação de existência e sem idempotência verificável
- **área:** API e Backend · **tipo:** risco · **esforço:** P
- **arquivo:** `src/app/api/kpi-manual/upload/route.ts:30-37`
- **impacto:** Se o parseKpiManual retornar entradas mas o insert falhar por algum motivo após o delete já ter rodado, o dia/rede fica sem dados no dashboard (perda silenciosa do KPI manual daquela rede). Se o upload do storage falhar, a re-exportação mensal (dashboard/export-mensal baixa `${dia}/${rede}.xlsx`) fica incompleta sem aviso.
- **proposta:** Verificar o erro do delete e do upload de storage; preferir upsert/substituição atômica ou inserir antes de deletar o conjunto antigo. Retornar erro ao client se qualquer etapa falhar.

### 🟡 Re-encaminhamento interno via fetch repassando cookie em /regerar é frágil e pode quebrar em produção
- **área:** API e Backend · **tipo:** risco · **esforço:** M
- **arquivo:** `src/app/api/kpi/simples/regerar/route.ts:30-47`
- **impacto:** Self-fetch em serverless (Vercel) depende de `req.url` resolver para uma URL publicamente acessível e do cookie ser válido na segunda hop; atrás de proxy/edge isso pode resolver para host interno errado, dobra a latência/custo (duas invocações de função com maxDuration 120 cada) e perde o header de auth se o cookie não vier (ex: chamada server-to-server). Se a primeira função estiver perto do timeout, a segunda começa do zero.
- **proposta:** Extrair o pipeline de geração para uma função compartilhada (ex: `executarKpiSimples(params, user)`) e chamá-la diretamente em ambas as rotas, em vez de self-fetch HTTP. Elimina a dependência de cookie/URL e o custo duplicado.

### 🟡 Mensagens de erro do Postgres/Supabase repassadas cru ao client em várias rotas
- **área:** API e Backend · **tipo:** risco · **esforço:** M
- **arquivo:** `src/app/api/lojas/route.ts:37`
- **impacto:** Vaza estrutura interna do banco (nomes de tabelas/colunas, constraints) para a UI/usuário, facilitando enumeração de schema e ataques direcionados. Também expõe detalhes que não ajudam o operador final.
- **proposta:** Logar `error` no servidor (console.error) e retornar uma mensagem genérica ao client ('Erro ao salvar loja', status 500), reservando detalhes para o log. Centralizar num helper `erro500(e)`.

### 🟡 Validação de input ad-hoc (sem Zod) e rede_id/placa nunca validados contra allowlist
- **área:** API e Backend · **tipo:** melhoria · **esforço:** M
- **arquivo:** `src/app/api/kpi-manual/upload/route.ts:18-20`
- **impacto:** rede_id inválido (typo, valor arbitrário) é persistido e quebra o dashboard/export-mensal (que assume redes canônicas), e o histórico calcula completude `X/${REDES.length}` errado. Objetos `alteracoes`/`lineEdits`/`rotas` (cozinha) sem schema podem causar crashes no parser/gerador com 500 genérico em vez de 400 claro.
- **proposta:** Introduzir Zod (ou validação manual) para os bodies: validar `rede_id` contra a lista canônica `REDES`, validar formato de placa, e dar shape aos objetos `alteracoes`/`lineEdits`/`rotas`. Retorna 400 com mensagem clara em vez de 500.

### 🟡 Bucket kpi-manual-raw sem storage policy (defense-in-depth ausente)
- **área:** DADOS-BANCO · **tipo:** risco · **esforço:** P
- **arquivo:** `supabase/migrations/20260528000000_kpi_manual.sql:19-21`
- **impacto:** O bucket é privado e as rotas usam service client (funciona hoje). Mas não há policy de leitura/escrita; se algum fluxo client-side tentar baixar/subir (ex.: re-download do XLSX cru via /historico?download passar a usar anon key), recebe 403, e não há camada de RLS de storage protegendo caso o bucket seja tornado público por engano.
- **proposta:** Adicionar policies explícitas de SELECT/INSERT em storage.objects para bucket_id='kpi-manual-raw' (TO authenticated ou service_role), espelhando o padrão de escalas-raw/unitrac-raw.

### 🟡 Cadastro de loja não valida lat/lng nem detecta duplicata de nome/código na rede
- **área:** DADOS-BANCO · **tipo:** melhoria · **esforço:** M
- **arquivo:** `src/app/api/lojas/route.ts:53-71`
- **impacto:** Coordenada digitada trocada (ex.: lat e lng invertidos, ponto/vírgula) entra no banco e o geofence passa a casar paradas erradas — exatamente o tipo de erro que a migration corrigir_coords_fase2 teve que consertar manualmente (coords trocadas entre Iguaba/Itaboraí). Também é possível cadastrar duas lojas com o mesmo codigo_escala na mesma rede (buscaPorCodigoEscala faz .find e pega a primeira), criando ambiguidade. parseFloat('abc')=NaN viraria null silenciosamente.
- **proposta:** Validar faixa de lat/lng e rejeitar NaN no POST/PATCH; checar duplicata de codigo_escala/codigo_unitrac/nome_normalizado na mesma rede antes de inserir e retornar 409 com a loja conflitante para o operador decidir.

### 🟡 ANOM-02 (GPS sem escala) dispara para toda placa Unitrac fora da escala — ruído em massa no modo sem-geofence
- **área:** DADOS-BANCO · **tipo:** melhoria · **esforço:** M
- **arquivo:** `src/lib/kpi/anomalia.ts:48-63`
- **impacto:** O contexto do sistema diz que o Unitrac tem muito mais clientes do que a Triforce atende (1000+ placas; só o subconjunto da Triforce está na escala). Logo ANOM-02 gera dezenas/centenas de anomalias LOW por dia para placas que nunca serão da Triforce, poluindo a tela de revisão e escondendo anomalias reais. É um falso positivo sistêmico por design.
- **proposta:** Restringir ANOM-02 a placas que pertencem a veículos conhecidos da frota (lista de placas/veículos da Triforce) ou rebaixar/silenciar quando a placa nunca apareceu em nenhuma escala histórica. Alternativamente, agregar num único alerta com contagem em vez de uma anomalia por placa.

### 🟡 ANOM-05 conta qualquer parada (não só LOJA) como visita, podendo falsear divergência
- **área:** DADOS-BANCO · **tipo:** bug · **esforço:** M
- **arquivo:** `src/lib/kpi/anomalia.ts:166-186`
- **impacto:** O comentário diz que passou a contar 'qualquer parada matched' para evitar falso negativo, mas agora rota.paradas inclui FORA_BASE com duração e até paradas espúrias. Para uma escala de loja única, se o GPS registrou 2 paradas (uma na loja + uma parada técnica/posto que virou parada), dispara ANOM-05 MEDIUM falsamente. Além disso o heurístico de multi-loja por '/' ou ' E ' classifica errado nomes como 'Botafogo / Serra Azul' (que é UMA loja com sufixo de base) como multi-loja, suprimindo a checagem onde ela deveria valer.
- **proposta:** Contar apenas paradas com loja_id resolvido (visitas reais a loja cadastrada) e tratar o sufixo '/ Serra Azul' (base) como parte do nome, não como separador de múltiplas lojas. Reusar a lógica de nomes do catalogo-matriz que já conhece esses sufixos.

### 🟡 diffMin trata tempo negativo somando 1440min — entrega com SAI < CHD por erro de digitação vira tempo gigante
- **área:** Dashboard e KPIs Manuais · **tipo:** bug · **esforço:** P
- **arquivo:** `src/lib/kpi/dashboard-metricas.ts:54-61`
- **impacto:** A virada de meia-noite é rara nesse fluxo (entregas diurnas), mas erro de digitação na planilha (ex: SAI 06:35, CHD 09:15) produz -160 → vira 1280min (21h em loja). Isso polui o 'Tempo médio em loja' sem nenhum filtro de sanidade. Um único registro invertido distorce a média do período inteiro.
- **proposta:** Adicionar guarda de plausibilidade: descartar (ou marcar como suspeito) diffs acima de um teto (ex: > 8h) e os negativos pequenos. Considerar também o saida_cd para validar a sequência CD→CHD→SAI. Reportar contagem de registros descartados.

### 🟡 Completude do histórico conta redes que não existem em REDES e pode passar do total
- **área:** Dashboard e KPIs Manuais · **tipo:** bug · **esforço:** P
- **arquivo:** `src/app/api/kpi-manual/historico/route.ts:45-47 e src/lib/kpi/parse-kpi-manual.ts (rede_id livre)`
- **impacto:** Se um upload usar um rede_id fora da lista (typo, rede nova não cadastrada), o numerador pode ficar X/18 com X>18 ou contar uma rede fantasma como cobertura, dando falsa sensação de 'dia completo'. No dashboard, REDE_LABEL[rede_id] cai no fallback e mostra o id cru.
- **proposta:** Validar rede_id ∈ REDES no upload (422 se não for). No cálculo de completude, contar só interseção com REDES. Opcionalmente alertar no histórico quando houver rede_id desconhecido.

### 🟡 Detecção da aba do dia por data.slice(8,10) falha quando a aba não é nomeada pelo número do dia
- **área:** Dashboard e KPIs Manuais · **tipo:** bug · **esforço:** M
- **arquivo:** `src/lib/kpi/parse-kpi-manual.ts:66 e src/lib/kpi/export-mensal.ts:22`
- **impacto:** Se a Tia subir a planilha do dia 19 mas a aba ativa/única se chamar 'Plan1', 'Sheet1', 'KPI' ou '19 ' (com espaço), o getWorksheet('19') falha e cai na primeira aba — que pode ser um índice/resumo ou um dia diferente. O parser então lê dados do dia errado e grava como se fossem do dia 19, contaminando o dashboard sem erro. O export-mensal tem o mesmo risco de pegar aba errada.
- **proposta:** Tornar a busca da aba tolerante: trim no nome, match por número (parseInt do nome === dia), e se cair no fallback, validar que a aba realmente parece ser do dia (ex: header de data) antes de aceitar — senão retornar 422 pedindo confirmação.

### 🟡 Service role key bypassa RLS em todas as rotas do dashboard — qualquer usuário logado lê/escreve tudo
- **área:** Dashboard e KPIs Manuais · **tipo:** risco · **esforço:** G
- **arquivo:** `src/app/api/dashboard/route.ts:38, src/app/api/kpi-manual/upload/route.ts:28-30, src/lib/supabase/service.ts:3-9`
- **impacto:** O service client ignora RLS por design. Hoje o único gate é 'estar logado'. Qualquer conta autenticada pode deletar/sobrescrever KPIs de qualquer rede/dia (upload faz delete + insert sem checar dono) e baixar qualquer XLSX cru via ?download. Se amanhã houver múltiplos perfis (ex: usuário só de leitura, ou por rede), não há autorização nenhuma. O bucket é privado mas o acesso é mediado pela service key, então o controle de quem baixa o quê fica só no código da rota.
- **proposta:** Para leitura, usar o client autenticado do usuário (RLS) em vez de service key sempre que possível, e habilitar RLS na tabela com policies por papel. Onde a service key for necessária (storage), centralizar autorização (verificar papel/rede do usuário antes de delete/download). No mínimo, documentar que 'logado = acesso total' é intencional hoje.

### 🟡 Upload não é atômico: delete acontece antes do insert, e falha no insert deixa o dia/rede vazio
- **área:** Dashboard e KPIs Manuais · **tipo:** bug · **esforço:** M
- **arquivo:** `src/app/api/kpi-manual/upload/route.ts:30-32`
- **impacto:** Reenvio de uma rede que já tinha KPI: se o novo arquivo for inválido a ponto de o insert falhar (constraint, tamanho, conexão), o dia perde o KPI anterior e fica sem nada. Não há transação. O storage upload (linha 34) também roda mesmo se o insert tiver dado erro? Não — retorna antes; mas o XLSX cru e as entradas podem ficar dessincronizados em outras falhas (ex: insert ok, upload do blob falha silenciosamente, pois o erro do upload não é tratado).
- **proposta:** Envolver delete+insert numa RPC/transação no Postgres, ou inserir primeiro num staging e só então substituir. Tratar o erro do storage.upload (hoje ignorado) e reconciliar: se o blob não subiu, o export-mensal vai pular esse dia silenciosamente.

### 🟡 Linhas placeholder de catálogo fixo mostram 0:00 em vez de branco na coluna Tempo
- **área:** GERADOR XLSX/PDF · **tipo:** bug · **esforço:** P
- **arquivo:** `src/lib/kpi/gerador-kpi.ts:139,204-205`
- **impacto:** Em redes de catálogo fixo, dezenas de lojas sem entrega no dia aparecem com Tempo em Loja = 0:00 em vez de em branco, sujando o relatório e induzindo a leitura errada (parece que houve parada de 0 min).
- **proposta:** Mesmo fix do achado anterior: não emitir fórmula quando chd/sai forem nulos. O guard `temTempo` resolve os dois casos de uma vez.

### 🟡 Linha com loja_nome vazio é descartada silenciosamente do KPI
- **área:** GERADOR XLSX/PDF · **tipo:** bug · **esforço:** P
- **arquivo:** `src/lib/kpi/gerador-kpi.ts:130`
- **impacto:** Se o parser deixar loja_nome vazio (OCR/PDF ruim, escala com célula em branco), a rota e seu GPS desaparecem do KPI sem aviso. Perda silenciosa de dado operacional, difícil de auditar.
- **proposta:** Tratar loja_nome vazio com fallback visível (ex.: 'SEM LOJA' / '(loja não identificada)') em vez de filtrar, ou no mínimo logar/contar quantas linhas foram descartadas por nome vazio para alertar no preview.

### 🟡 Rodapé do PDF usa new Date() local — KPI não reproduzível e fuso de servidor
- **área:** GERADOR XLSX/PDF · **tipo:** risco · **esforço:** P
- **arquivo:** `src/lib/kpi/gerador-pdf.ts:327`
- **impacto:** Carimbo de geração no PDF fica no fuso errado (UTC) em produção, divergindo do hojeBR() usado no resto do app; e o PDF deixa de ser determinístico.
- **proposta:** Usar o mesmo helper de data BR do projeto (hojeBR()/formatação BRT) para o carimbo, ou remover o timestamp do rodapé. Se mantido, formatar explicitamente com timeZone 'America/Sao_Paulo'.

### 🟡 PDF (gerado-pdf.ts) usa o modelo de colunas ANTIGO, divergente do XLSX redesign
- **área:** GERADOR XLSX/PDF · **tipo:** tech-debt · **esforço:** G
- **arquivo:** `src/lib/kpi/gerador-pdf.ts:68-87`
- **impacto:** XLSX e PDF da mesma rede/dia não batem visual nem estruturalmente. Como a Tia Erica usa o PDF como fonte primária (comentário em route.ts:154), o PDF não reflete o modelo aprovado (carro1/carro2, status SEM RASTREADOR, ordem do catálogo), gerando divergência entre os dois downloads.
- **proposta:** Alinhar o PDF ao mesmo pipeline do XLSX (agruparPorLoja + ordem do catálogo + textos de status), ou deixar claro no produto que PDF e XLSX têm propósitos distintos. Se o PDF deve espelhar o XLSX, refatorar rowValues para consumir LinhaAgrupada.

### 🟡 duracao_min pode ficar negativa quando saidaFinal (estendida/bloco) é anterior à chegadaFinal
- **área:** Matcher · **tipo:** bug · **esforço:** P
- **arquivo:** `src/lib/kpi/matcher.ts:1965-1977`
- **impacto:** Em casos de consolidação de bloco combinada com extensão FORA_BASE, ou quando matched.saida é null e cai no `matched.duracao_seg`, pode sair duração negativa ou inconsistente no XLSX/dashboard. O código mistura duas fontes de saída (bloco vs estendida) sem normalizar a chegada correspondente.
- **proposta:** Após calcular chegadaFinal/saidaFinal, aplicar `if (saidaFinal && chegadaFinal && saidaFinal < chegadaFinal) saidaFinal = chegadaFinal` (ou recomputar chegada como a menor do bloco e saída como a maior, de forma simétrica) e nunca permitir duracao_min < 0.

### 🟡 Bloco 'saída sempre a última' (consolidação de visitas mesma loja) é pulado quando matched veio de isGeo, perdendo a última saída real
- **área:** Matcher · **tipo:** bug · **esforço:** M
- **arquivo:** `src/lib/kpi/matcher.ts:1941-1963`
- **impacto:** Para lojas casadas via geo/plate-troca que tiveram múltiplas paradas consecutivas no mesmo código (entrada/saída de portão), a saída no KPI fica na PRIMEIRA parada do bloco e não na última — violando a regra de produto 'saída é sempre a última parada do bloco'.
- **proposta:** Avaliar habilitar a consolidação de bloco também quando isGeo desde que matched.codigo_loja exista e as paradas do bloco compartilhem o mesmo código; a regra da última saída é independente do algoritmo que escolheu a parada.

### 🟡 Datas parseadas com `new Date(string)` sem normalização repetidamente; getUTCHours assume formato UTC mas parsing depende do formato gravado
- **área:** Matcher · **tipo:** risco · **esforço:** M
- **arquivo:** `src/lib/kpi/matcher.ts:276-278,515,599,1306`
- **impacto:** Se a fonte (Supabase/parser) gravar o timestamp sem sufixo Z, todos os cortes de madrugada (NOITE_H=3, SAIDA_MANHA_H=6, getUTCHours()>=3 no geo fallback) e os gaps de consolidação ficam deslocados em ~3h, marcando entregas reais como estacionamento noturno ou vice-versa. Centenas de chamadas `new Date()` por execução também custam performance.
- **proposta:** Centralizar o parse num helper (ex.: `tsUTC(chegada)`) que valida/normaliza o formato uma vez por parada, e cachear `chegadaTs`/`saidaTs` numéricos nas linhas Unitrac no início (junto do sort por placa) em vez de re-parsear a string dezenas de vezes nos vários fallbacks.

### 🟡 Proxy de data (sexta cobre sábado/segunda) inconsistente entre parsers: GERAL e Zona Sul não têm; PAX/Armazém têm
- **área:** Parsers de Escala · **tipo:** bug · **esforço:** M
- **arquivo:** `src/lib/parsers/escala-geral.ts:503-508`
- **impacto:** Ao rodar KPI de sábado/segunda usando a escala de sexta: PAX e Armazém retornam linhas (proxy), mas GERAL e Zona Sul retornam 0. Resultado parcial e confuso — algumas redes aparecem no dia, outras somem, sem aviso ao usuário.
- **proposta:** Unificar a política de proxy de data num helper compartilhado e aplicar (ou explicitamente NÃO aplicar) em todos os parsers de forma consistente, documentando a decisão de produto. Se proxy é desejado, portar para GERAL e Zona Sul.

### 🟡 Armazém do Grão: proxy de data só considera abas cujo título parseia; abas com título quebrado são ignoradas silenciosamente na coleta
- **área:** Parsers de Escala · **tipo:** bug · **esforço:** P
- **arquivo:** `src/lib/parsers/escala-armazem-grao.ts:74-93`
- **impacto:** Arquivo Armazém com data armazenada como célula Date (não string) → 0 linhas, sem erro. O usuário vê 'Nenhuma linha encontrada' sem saber que é a data no título.
- **proposta:** Em parseTitulo/coleta, também aceitar cellVal Date (instanceof Date) e extrair dia/mês/ano via getUTC*, como o extractDateFromWorksheet do GERAL faz.

### 🟡 GERAL: no path 'separator com peso' (multi-entrega), carro sem placa1 mas com motorista é descartado
- **área:** Parsers de Escala · **tipo:** bug · **esforço:** M
- **arquivo:** `src/lib/parsers/escala-geral.ts:254`
- **impacto:** Em rotas multi-entrega (Búzios 1/2/3, cargas compartilhadas) onde a placa real está só na coluna do 2º carro (v12) ou veio de fórmula escrava, a parada extra some do KPI. Sub-contagem de entregas em rotas de múltiplas lojas.
- **proposta:** Antes de abortar por falta de placa1, checar se há placa válida em v12 (carro2) e, se houver, ainda emitir o carro2. Ou relaxar a condição para `return` somente quando não houver NEM placa1 NEM placa2 NEM motorista.

### 🟡 isTabDay/RE_DIA_ABA aceitam abas de 1-3 dígitos → aba '100','365' ou códigos viram dia inexistente
- **área:** Parsers de Escala · **tipo:** risco · **esforço:** P
- **arquivo:** `src/lib/parsers/escala-pax.ts:132-134`
- **impacto:** Uma aba auxiliar nomeada '100', '200' (totais, resumos) no arquivo PAX seria tratada como aba-dia e produziria datas malformadas tipo 'YYYY-MM-100', que nunca casam com dataAlvo (resultado: lixo ignorado) — mas se algum dia uma aba '31' de outro mês existir, casa indevidamente. Inconsistência entre parsers é um cheiro de bug.
- **proposta:** Padronizar para /^\d{1,2}\s*$/ em todos (dia do mês ∈ 1..31) e validar 1<=dia<=31 em tabToDate, retornando '' fora do range.

### 🟡 parsePdfUniversal: regex de motorista exige só letras MAIÚSCULAS → motoristas com minúsculas/números viram loja
- **área:** Parsers de Escala · **tipo:** bug · **esforço:** M
- **arquivo:** `src/lib/parsers/escala-universal.ts:174-175`
- **impacto:** Fallback universal classifica errado motorista vs loja em PDFs com nomes em caixa mista, gravando loja_nome_raw = nome do motorista e perdendo o motorista. Como é fallback de último recurso já com aviso, o estrago é limitado, mas polui o banco com dados ruins que o usuário pode não revisar.
- **proposta:** Aceitar caixa mista (adicionar a-zà-ÿ ao charset) e exigir ausência de dígitos no nome em vez de exigir maiúsculas; ou abandonar a heurística posicional e exigir confirmação manual nesse caminho.

### 🟡 Zona Sul: distribuição de peso em multi-loja (loja2/loja3) só preenche peso da 1ª loja; col com kilos null vira null silencioso
- **área:** Parsers de Escala · **tipo:** risco · **esforço:** M
- **arquivo:** `src/lib/parsers/escala-zona-sul.ts:323-351`
- **impacto:** Rotas Zona Sul com 2-3 filiais em que o peso vem agregado no total perdem a métrica de peso por loja (KPI de peso fica zerado/nulo para a 2ª/3ª parada). Para contagem de entregas não afeta, mas distorce indicadores de peso.
- **proposta:** Se kilos da loja individual for null mas houver totalKilos e múltiplas lojas, considerar ratear o total (ou ao menos sinalizar). Validar contra a escala real para decidir a regra.

### 🟡 Alterações de escala confirmadas não disparam re-geração; ficam órfãs após o KPI já gerado
- **área:** UX e Fluxos do Operador · **tipo:** bug · **esforço:** M
- **arquivo:** `src/app/painel/kpi/simples/page.tsx:586-587,708-730`
- **impacto:** Operador adiciona uma substituição de placa após ver o preview, acredita que foi aplicada (o contador sobe), mas baixa um XLSX desatualizado. A alteração só tem efeito se ele lembrar de reprocessar do zero com 'Gerar agora'.
- **proposta:** Mostrar o botão Re-gerar sempre que houver bucketPaths E (lineEdits OU mudança no array de alteracoes desde a última geração). Guardar um hash/contagem das alteracoes aplicadas e comparar; exibir aviso 'Alterações pendentes não aplicadas — Re-gerar'.

### 🟡 Excluir KPI manual de uma rede não pede confirmação (ação destrutiva irreversível)
- **área:** UX e Fluxos do Operador · **tipo:** bug · **esforço:** P
- **arquivo:** `src/app/painel/dashboard/inserir-manual.tsx:42-50,113-117`
- **impacto:** Um clique acidental apaga todos os KPIs já enviados de uma rede inteira para aquela data, sem desfazer. Para a rotina diária (várias redes), o risco de clicar 'Excluir' em vez de outra ação é real, e o dado precisa ser reenviado/reprocessado.
- **proposta:** Adicionar confirm() (ou modal) com a contagem: `Excluir os ${e.lojas} KPIs de ${REDE_LABEL[rede]} em ${data}?`. Idealmente um undo de poucos segundos via toast, padrão já presente em outras telas.

### 🟡 Reenvio de KPI manual da mesma rede/data não avisa que vai sobrescrever
- **área:** UX e Fluxos do Operador · **tipo:** risco · **esforço:** P
- **arquivo:** `src/app/painel/dashboard/inserir-manual.tsx:28-40,118-123`
- **impacto:** Se a primeira planilha estava incompleta, o operador precisa Excluir (sem confirmação, ver achado acima) e reenviar, em vez de simplesmente substituir. Fluxo de correção mais longo e arriscado do que precisa ser.
- **proposta:** Permitir 'Substituir' direto no estado 'ok' (input file escondido + aviso 'isto substitui as N lojas atuais'), tornando explícito o comportamento de upsert do backend.

### 🟡 Filtro de redes do dashboard não tem debounce/cancelamento: clicar várias redes pode mostrar dados de uma requisição antiga (race)
- **área:** UX e Fluxos do Operador · **tipo:** bug · **esforço:** P
- **arquivo:** `src/app/painel/dashboard/dashboard-client.tsx:49-58`
- **impacto:** Dashboard pode exibir métricas que não correspondem aos chips selecionados, levando o operador a tomar decisão com número errado. Em filtros muito clicados isso aparece como 'piscadas' de dados inconsistentes.
- **proposta:** Adicionar AbortController no useEffect (abortar no cleanup) e/ou ignorar respostas obsoletas comparando um requestId. Padrão simples e barato.

### 🟡 Página /painel/kpi/revisar exige colar bucket paths crus, sem upload — ferramenta interna exposta como tela de operador
- **área:** UX e Fluxos do Operador · **tipo:** tech-debt · **esforço:** M
- **arquivo:** `src/app/painel/kpi/revisar/page.tsx:62-89`
- **impacto:** Se um operador chegar nesta rota, é impossível usá-la sem conhecer paths internos do Storage. É uma tela de debug que parece de produto; gera confusão e suporte. Também é dívida visual (não segue tokens).
- **proposta:** Ou esconder atrás de flag/dev-only, ou integrar o preview ao fluxo de /kpi/simples (reusar os arquivos já subidos) e remover os inputs de path crus, trocando a data por <input type=date>.

### 🟡 Sem validação de que a data selecionada bate com a escala/Unitrac enviados
- **área:** UX e Fluxos do Operador · **tipo:** melhoria · **esforço:** M
- **arquivo:** `src/app/painel/kpi/simples/page.tsx:658-668`
- **impacto:** Operador pode subir a escala do dia 28 com data 29 selecionada e gerar KPI cruzado no dia errado sem nenhum alerta. Erro caro e difícil de detectar depois.
- **proposta:** Ao processar, se o nome dos arquivos contiver uma data divergente da selecionada, mostrar aviso não-bloqueante ('Os arquivos parecem ser do dia X, mas você selecionou Y — confirmar?'). Mesmo um heuristic leve reduz muito o erro.

### 🟡 Placa final não é validada após correção OCR — lixo de 7 chars vira 'veículo' e gera paradas fantasma
- **área:** parser-unitrac · **tipo:** bug · **esforço:** P
- **arquivo:** `src/lib/parsers/unitrac-pdf.ts:354`
- **impacto:** Um falso 'header de veículo' extraído de texto corrompido cria um ResumoVeiculo com placa inválida e paradas atribuídas a ele, inflando qtd_abas/qtd_paradas e poluindo o matcher (placa que nunca casa). No XLSX o nome da aba é limpo, mas no PDF não há essa garantia.
- **proposta:** Após corrigeOcrPlaca, `if (!placaValida(placaNorm)) continue`. Remover o import morto de normalizaPlaca.

### 🟡 Auto-cadastro de loja em canonical_loja usa código/nome MAL-EXTRAÍDO do PDF, com rede inferida só por prefixo do nome
- **área:** parser-unitrac · **tipo:** bug · **esforço:** M
- **arquivo:** `src/app/api/unitrac/upload/route.ts:178`
- **impacto:** Lojas fantasma ou com rede errada entram no catálogo canônico automaticamente a partir de uma extração ruim de um único PDF, contaminando matches futuros (codigo_unitrac duplicado/errado) — exatamente o problema que o time passou tarefas inteiras corrigindo (#258, #259).
- **proposta:** Não auto-cadastrar a partir do PDF (formato mais sujo) ou exigir que o código bata com a escala antes de inserir; no mínimo, marcar como 'pendente revisão' em vez de inserir direto em canonical_loja.

### 🟡 computeSaidaCd diverge entre unitrac-pdf.ts e unitrac.ts no caso 'sem BASE antes da 1ª loja'
- **área:** parser-unitrac · **tipo:** bug · **esforço:** P
- **arquivo:** `src/lib/parsers/unitrac-pdf.ts:157`
- **impacto:** Relatório em PDF produz saida_cd = chegada na 1ª loja (tempo de deslocamento zero) onde o XLSX produz em-branco. Métrica de tempo de operação inflada/errada só no caminho PDF. Além disso há TRÊS implementações de saida_cd (pdf, xlsx, matcher.ts) que precisam ficar equivalentes — a do PDF está dessincronizada.
- **proposta:** Alinhar unitrac-pdf.ts:computeSaidaCd com unitrac.ts (retornar null quando !lastBaseSaida). Idealmente extrair a função para um módulo único compartilhado pelos 3 pontos.

### 🟡 Regex de qtd_paradas/distância e o loop de truncamento podem produzir qtd_paradas silenciosamente errado
- **área:** parser-unitrac · **tipo:** risco · **esforço:** P
- **arquivo:** `src/lib/parsers/unitrac-pdf.ts:264`
- **impacto:** qtd_paradas no resumo (usado em unitrac_uploads.qtd_paradas e possivelmente em sanity checks) fica inconsistente com a contagem real de paradas extraídas. Veículos com >60 paradas têm o header truncado.
- **proposta:** Usar SEMPRE paradas.length como fonte de verdade do qtd_paradas (descartar o do header, ou logar quando header != length). Subir o cap heurístico ou ancorar a distância por outro sinal (presença de vírgula decimal).

### 🟡 Lat/Lng do regex são RJ-only: exigem coordenada NEGATIVA e poucos dígitos — fora do RJ a parada some
- **área:** parser-unitrac · **tipo:** risco · **esforço:** M
- **arquivo:** `src/lib/parsers/unitrac-pdf.ts:286`
- **impacto:** Para a operação atual do RJ funciona, mas é uma bomba silenciosa: qualquer entrega/parada com coordenada fora do padrão (-XX.dddddd / -XXX.dddddd) é descartada sem erro. Também impede reuso do parser para outras regiões.
- **proposta:** Tornar o sinal opcional na lat (`-?`) e ampliar dígitos, ou tornar a âncora tolerante (lat/lng opcionais com fallback). No mínimo, logar paradas com chegada válida mas sem coordenada casada para detectar perdas.

### 🟡 extraiLoja PDF e extraiLoja coord usam regras de código diferentes do XLSX (aceitam código de 1-3 dígitos como loja)
- **área:** parser-unitrac · **tipo:** risco · **esforço:** P
- **arquivo:** `src/lib/parsers/unitrac-pdf.ts:111`
- **impacto:** Geofences de código curto (1-3 dígitos) que não contêm a string 'ROTA' são classificadas como LOJA no PDF e como não-loja no XLSX. Mais uma fonte de divergência PDF↔XLSX e de falso-positivo de entrega.
- **proposta:** Alinhar a exigência de 4+ dígitos no código entre os três parsers (PAR_LOJA, temLojaConcatenada, REDE_CODIGO_PREFIX e coord).

### 🟡 Três implementações divergentes de classificaParada/extraiLoja/computeSaidaCd copiadas entre parsers
- **área:** parser-unitrac · **tipo:** tech-debt · **esforço:** M
- **arquivo:** `src/lib/parsers/unitrac-pdf-coord.ts:156`
- **impacto:** Qualquer fix de regra de negócio precisa ser replicado manualmente em até 3 arquivos; já vimos (achados acima) que os fixes NÃO foram replicados (default LOJA vs FORA_BASE, saida_cd null vs proxy, código 4+ dígitos). É a causa-raiz de boa parte das divergências.
- **proposta:** Extrair classificaParada/extraiLoja/computeSaidaCd para um módulo único (ex classificacao-parada.ts) e fazer os 3 parsers importarem. Remover o coord se realmente não vai a produção.


## ⚪ BAIXA (29)

### ⚪ Range de mês em export-mensal usa '-31' fixo, podendo incluir/excluir dias incorretamente
- **área:** API e Backend · **tipo:** bug · **esforço:** P
- **arquivo:** `src/app/api/dashboard/export-mensal/route.ts:25`
- **impacto:** É textualmente robusto para o filtro `<= 'YYYY-MM-31'` (string comparison pega corretamente dias 01-30/31 do mês), então hoje funciona por sorte da ordenação lexicográfica de datas ISO. Porém é frágil e enganoso: se a coluna mudar de tipo ou alguém comparar como date, `2026-02-31` é uma data inválida. Não há bug ativo, mas é dívida técnica que confunde manutenção.
- **proposta:** Calcular o último dia real do mês: `const fim = new Date(Date.UTC(ano, mesNum, 0)).toISOString().slice(0,10)` (mesma técnica já usada em dashboard/route.ts:21) e usar `.lte('data', fim)`.

### ⚪ DELETE de loja é soft-delete sem verificar se id existe (204 sempre)
- **área:** API e Backend · **tipo:** risco · **esforço:** P
- **arquivo:** `src/app/api/lojas/[id]/route.ts:57-71`
- **impacto:** UI mostra sucesso ao 'deletar' loja que não existe (ou já deletada), mascarando erros de id. Baixo impacto, mas inconsistente com o GET (que faz `.single()` e retorna 404). Mesmo padrão em PATCH de escala_linhas (escalas/linha:35) e cozinha/clientes/[id].
- **proposta:** Usar `.select('id')` no update e retornar 404 se vier vazio, ou checar `count`. Mantém semântica consistente com o resto da API.

### ⚪ kpi/simples/analisar-alt usa require('pdf-parse') no topo do módulo
- **área:** API e Backend · **tipo:** melhoria · **esforço:** P
- **arquivo:** `src/app/api/kpi/simples/analisar-alt/route.ts:14-15`
- **impacto:** Inconsistência que pode reintroduzir a falha de build documentada nas outras rotas (pdf-parse carrega DOMMatrix no import). Funciona hoje porque há o polyfill, mas o require top-level executa no momento de carga do módulo (inclusive durante o 'collect page data' do build do Next), arriscando regressão de build se o polyfill mudar.
- **proposta:** Mover para import dinâmico dentro do handler (`const pdfParse = (await import('pdf-parse')).default`) como nas demais rotas, mantendo o padrão consistente.

### ⚪ Middleware protege navegação mas não garante 401 em rotas /api (depende do gate em cada route)
- **área:** API e Backend · **tipo:** risco · **esforço:** M
- **arquivo:** `src/lib/supabase/middleware.ts:30-38`
- **impacto:** A defesa em profundidade é fraca: o middleware não é uma barreira de auth confiável para API (redirect ≠ bloqueio), então qualquer rota que esqueça o gate de getUser() fica aberta. É o que torna o achado de /catalogar explorável na prática.
- **proposta:** Adicionar no middleware um tratamento explícito para `path.startsWith('/api')`: retornar 401 JSON em vez de redirect quando `!user`, criando uma rede de segurança para rotas que esqueçam o gate. Manter o gate por rota como camada primária.

### ⚪ export-mensal usa lte('data', `${mes}-31`) — limite de dia inválido para meses curtos
- **área:** DADOS-BANCO · **tipo:** bug · **esforço:** P
- **arquivo:** `src/app/api/dashboard/export-mensal/route.ts:25`
- **impacto:** Para fevereiro/abril/etc o filtro compara a coluna date contra a string '2026-02-31', uma data inexistente. Postgres comparando date <= '2026-02-31' faz cast e gera erro 'date/time field value out of range' OU (dependendo do parsing) nunca casa — em ambos os casos o export do mês pode falhar ou ficar incompleto sem aviso. Mesmo defeito aparece no dashboard/route.ts:21 está correto (usa Date.UTC com dia 0), então é inconsistência entre as duas rotas.
- **proposta:** Calcular o último dia do mês com new Date(Date.UTC(ano, mes, 0)).getUTCDate() (como já é feito em dashboard/route.ts intervalo()) em vez de hardcodar 31.

### ⚪ Cron confidence-decay duplicado entre duas migrations (idempotência frágil)
- **área:** DADOS-BANCO · **tipo:** tech-debt · **esforço:** P
- **arquivo:** `supabase/migrations/20260519000700_cron_decay.sql:3-16`
- **impacto:** Risco de dois jobs idênticos rodando o decay de confidence duas vezes às 3h, acelerando a queda de confiança dos aliases (auto_approve some antes da hora). Baixo porque a migration de fix corrige, mas a 0700 sozinha não é idempotente (cron.schedule duplica em reexecução).
- **proposta:** Tornar a 0700 idempotente com unschedule prévio em bloco DO/EXCEPTION, ou remover o schedule da 0700 e deixar só a 0800 como fonte única.

### ⚪ parseKpiManual: diffMin assume virada de meia-noite e pode inflar tempo de loja
- **área:** DADOS-BANCO · **tipo:** melhoria · **esforço:** P
- **arquivo:** `src/lib/kpi/dashboard-metricas.ts:54-61`
- **impacto:** Se chd e sai vierem trocados na planilha (saída antes da chegada por erro de digitação), o código assume virada de dia e soma 1440 min, reportando ~24h de permanência em loja em vez de detectar o dado inconsistente. Isso contamina tempoMedioLojaMin do dashboard. Não há validação de que sai >= chd para entregas no mesmo turno.
- **proposta:** Só aplicar +1440 quando houver evidência real de virada (ex.: chd noturno e sai de madrugada); caso contrário tratar saída<chegada como dado inválido (descartar do cálculo de média e sinalizar).

### ⚪ export-mensal: erro de storage.download ignorado e dia ausente sai sem rastro no XLSX
- **área:** Dashboard e KPIs Manuais · **tipo:** bug · **esforço:** P
- **arquivo:** `src/app/api/dashboard/export-mensal/route.ts:31-35`
- **impacto:** Se o blob de um dia foi perdido/não subiu (ver bug do upload não-atômico), o KPI mensal sai sem aquele dia e sem nenhum aviso ao usuário. A Tia baixa um 'KPI mensal' que parece completo mas tem buracos. O range gte/lte usa `${mes}-31` que é inválido em fevereiro/meses de 30 dias (string compara ok, mas é frágil).
- **proposta:** Coletar dias faltantes (entrada existe no banco mas blob ausente) e ou avisar (header/aba de aviso) ou retornar lista. Trocar `${mes}-31` por cálculo real do último dia do mês.

### ⚪ Turno classificado por hora de CHEGADA, não de operação — madrugada/manhã podem refletir só o horário de chegada na loja
- **área:** Dashboard e KPIs Manuais · **tipo:** bug · **esforço:** P
- **arquivo:** `src/lib/kpi/dashboard-metricas.ts:66-70 e 80`
- **impacto:** O 'Volume por turno' só conta entregas com horário de chegada. Lojas 'não foi' e 'sem rastreador' (que têm placa/saída do CD) ficam fora do gráfico de turno, então o volume por turno não bate com o total de operações do período. Pode subnotificar a madrugada (saídas de CD de madrugada que chegam na loja já de manhã).
- **proposta:** Decidir o critério do turno explicitamente (chegada na loja vs saída do CD) e, se o objetivo é volume operacional, usar saida_cd como fallback quando chd for nulo, para incluir nao_foi/sem_rastreador.

### ⚪ Dashboard recarrega métricas a cada toggle de chip de rede (1 fetch por clique)
- **área:** Dashboard e KPIs Manuais · **tipo:** melhoria · **esforço:** M
- **arquivo:** `src/app/painel/dashboard/dashboard-client.tsx:49-58 e 132`
- **impacto:** Selecionar 5 redes = 5 requisições sequenciais ao servidor (cada uma relê o banco inteiro do período). UX com flicker de skeleton a cada clique e carga desnecessária no Postgres. Como o filtro por rede é puramente client-side-friendly (os dados do período já vêm completos), dá pra filtrar no cliente.
- **proposta:** Buscar o período uma vez (sem filtro de rede) e aplicar filtrar()/calcularMetricas() no cliente ao alternar chips, ou debounce. Reduz drasticamente requests e melhora a sensação de instantaneidade.

### ⚪ Falta validação de tamanho/tipo do upload e feedback de linhas ignoradas
- **área:** Dashboard e KPIs Manuais · **tipo:** melhoria · **esforço:** M
- **arquivo:** `src/app/api/kpi-manual/upload/route.ts:20-26 e src/lib/kpi/parse-kpi-manual.ts:77-97`
- **impacto:** Arquivo enorme ou não-XLSX pode estourar memória/timeout (maxDuration 60s). Linhas legítimas que o parser não reconheceu somem sem aviso — a Tia vê 'Salvo · N lojas' sem saber que M lojas foram ignoradas. Difícil auditar diferença entre planilha e dashboard.
- **proposta:** Validar content-type e tamanho máximo. Retornar no JSON também o nº de linhas lidas vs reconhecidas vs ignoradas, e exibir 'N salvas, M ignoradas' no card de inserir. Opcional: listar as lojas ignoradas para conferência.

### ⚪ Filtro de status existe no tipo mas nunca é exposto na API nem na UI
- **área:** Dashboard e KPIs Manuais · **tipo:** melhoria · **esforço:** P
- **arquivo:** `src/lib/kpi/dashboard-metricas.ts:3-16 (Filtro.status) e src/app/api/dashboard/route.ts:44`
- **impacto:** Recurso de produto pela metade: usuário não consegue, por exemplo, ver só as 'sem rastreador' do período. Mantém superfície de código sem uso.
- **proposta:** Expor ?status na API e um seletor na UI (ou remover o parâmetro do Filtro se não for usado). Dado o foco do dashboard em 'onde agir', um filtro rápido por status agregaria valor.

### ⚪ PDF com 0 linhas gera tabela vazia sem mensagem 'sem dados'
- **área:** GERADOR XLSX/PDF · **tipo:** melhoria · **esforço:** P
- **arquivo:** `src/lib/kpi/gerador-pdf.ts:122-138`
- **impacto:** Rede sem rotas válidas no dia gera um PDF aparentemente 'em branco', confundindo quem recebe (parece bug de geração, não ausência real de dados).
- **proposta:** Quando linhas.length === 0, desenhar uma faixa central 'Nenhuma rota encontrada para esta rede nesta data' abaixo do cabeçalho.

### ⚪ Cache de buffer de template/logo em módulo pode segurar Buffer entre invocações serverless e mascarar troca do template
- **área:** GERADOR XLSX/PDF · **tipo:** risco · **esforço:** P
- **arquivo:** `src/lib/kpi/template-loader.ts:15-24`
- **impacto:** Risco de race condition: várias redes geram KPI em paralelo, todas chamando wb.xlsx.load(mesmo Buffer). Se o ExcelJS escrever no buffer de entrada, KPIs concorrentes podem sair corrompidos/divergentes esporadicamente — difícil de reproduzir.
- **proposta:** Retornar uma cópia do buffer em getKpiTemplateBuffer (ex.: Buffer.from(cached)) ou carregar via wb.xlsx.load(new Uint8Array(cached)) para garantir que cada geração parta de bytes imutáveis. Validar com um teste concorrente (Promise.all de N gerações simultâneas).

### ⚪ Linhas descartadas (3º+ carro por loja) não geram aviso no XLSX/PDF
- **área:** GERADOR XLSX/PDF · **tipo:** melhoria · **esforço:** M
- **arquivo:** `src/lib/kpi/agrupar-por-loja.ts:34-38; src/lib/kpi/gerador-kpi.ts:145`
- **impacto:** A intenção declarada (avisar que houve uma 3ª rota descartada) não foi implementada no gerador. Operação continua sem saber que perdeu uma linha quando há 3 carros na mesma loja.
- **proposta:** Quando ag.descartadas.length > 0, anexar nota na coluna OBS/observação ou logar a contagem para exibir no preview da rede. Conectar o dado que já existe à saída.

### ⚪ Condição morta no loop de estendeSaidaPorForaBase
- **área:** Matcher · **tipo:** bug · **esforço:** P
- **arquivo:** `src/lib/kpi/matcher.ts:415-416`
- **impacto:** Sem impacto funcional, mas é código confuso que esconde a intenção (qual margem de tolerância?). Risco de manutenção: alguém pode 'consertar' uma das duas e alterar o comportamento sem perceber.
- **proposta:** Remover a linha redundante e deixar um único predicado claro com comentário do porquê da margem de 1ms (ou nenhuma).

### ⚪ agruparPorLoja descarta 3ª+ linha por loja mas o KPI não sinaliza visivelmente ao operador
- **área:** Matcher · **tipo:** melhoria · **esforço:** P
- **arquivo:** `src/lib/kpi/agrupar-por-loja.ts:33-38`
- **impacto:** Uma loja com 3+ carros no mesmo dia perde silenciosamente a 3ª entrega do core do KPI. Se o preview/PDF não renderiza `descartadas`, o operador não percebe a perda e a planilha fica incompleta sem aviso.
- **proposta:** Garantir (e testar) que toda saída com `descartadas.length > 0` gere um aviso explícito no preview/PDF e, idealmente, contabilizar essas linhas numa seção de exceções do export. Confirmar que algum consumidor realmente lê `descartadas`.

### ⚪ aplicarAlteracoes muta o array de entrada in-place (linhas[i] = l) — risco de cascata se reusado
- **área:** Matcher · **tipo:** risco · **esforço:** P
- **arquivo:** `src/lib/kpi/aplicar-alteracoes.ts:101-124`
- **impacto:** Em SUBSTITUICAO que casa múltiplas linhas (placa serve várias lojas, linha 114-123), todas são reescritas no array original; um chamador que esperava imutabilidade pode reprocessar dados já alterados. Baixo hoje, mas é uma armadilha latente.
- **proposta:** Trabalhar sobre uma cópia (`const out = [...linhas]`) e retornar `out`, mantendo o snapshot original para match. Deixa a função pura em relação ao argumento.

### ⚪ Cadeia de 9 fallbacks sequenciais (assignOptimal, temporal, geo, compartilhada, T8, T9, T18) dificulta auditar por que uma parada foi escolhida
- **área:** Matcher · **tipo:** melhoria · **esforço:** G
- **arquivo:** `src/lib/kpi/matcher.ts:1184-1858`
- **impacto:** Manutenção e depuração caras: o bug #255 existe justamente porque um estágio (temporal) ficou com lógica de seleção diferente dos outros. Duplicação aumenta a chance de divergência de comportamento entre estágios.
- **proposta:** Extrair o 'guard cod_loja dono' e o cálculo de 'lojaDaLinha' para uma função única reutilizada por todos os estágios, e registrar em _matchMeta qual estágio atribuiu cada parada (ex.: algorithm: 'temporal'|'t8'|'compartilhada') para rastreabilidade no preview/debug.

### ⚪ escala-universal (preview) também herda o off-by-one e não tem teste; preview e upload divergem sutilmente no Guanabara dataAlvo
- **área:** Parsers de Escala · **tipo:** bug · **esforço:** P
- **arquivo:** `src/app/api/escalas/preview/route.ts:122`
- **impacto:** Divergência preview vs upload: o usuário valida no preview um conjunto e o upload grava outro (ou filtra por data e o preview não). Confunde a conferência manual.
- **proposta:** Passar exatamente o mesmo argumento (data) nos dois fluxos e cobrir com teste o caso dataAlvo ausente vs presente.

### ⚪ Cada parser reimplementa cellVal/asStr/asNum/extraiHora com diferenças sutis (ex: GERAL trata sharedFormula, PAX/Armazém não)
- **área:** Parsers de Escala · **tipo:** tech-debt · **esforço:** M
- **arquivo:** `src/lib/parsers/escala-pax.ts:68-83`
- **impacto:** Células com sharedFormula escrava em PAX/Zona Sul/Armazém podem resolver para objeto cru (não null), gerando peso/placa/motorista corrompidos ou descartados de forma inconsistente. Manutenção duplicada: um fix de fórmula precisa ser replicado em 5 lugares.
- **proposta:** Extrair um módulo único exceljs-cell.ts (cellVal/asStr/asNum/asDate com tratamento de sharedFormula e .result) e usar em todos os parsers XLSX.

### ⚪ Guanabara: rotas com gap conhecido (21,22,24) e placas '(incompleta)' não geram aviso ao usuário
- **área:** Parsers de Escala · **tipo:** melhoria · **esforço:** M
- **arquivo:** `src/lib/parsers/escala-guanabara-pdf.ts:235-241`
- **impacto:** O usuário vê uma órfã sem entender que o problema é OCR de placa no PDF; não há caminho claro para corrigir manualmente. Reduz confiança no número final do Guanabara.
- **proposta:** Propagar obs='PLACA_ILEGIVEL_PDF' nessas linhas e exibir no preview/painel uma seção 'placas ilegíveis para revisão manual', permitindo digitar a placa.

### ⚪ PAX: paletes faz fallback de qtdPaletes para paletesSuportados (capacidade do veículo), misturando conceitos
- **área:** Parsers de Escala · **tipo:** risco · **esforço:** P
- **arquivo:** `src/lib/parsers/escala-pax.ts:293`
- **impacto:** Quando a qtd real de paletes está vazia, o KPI passa a reportar a CAPACIDADE do caminhão como se fosse a carga — inflando o número de paletes entregues do SUPER_PAX/EMANUEL/FEIRA_NOVA.
- **proposta:** Não usar paletesSuportados como paletes entregues; deixar null quando a qtd real estiver ausente (ou guardar capacidade em campo separado).

### ⚪ Reabrir/Regerar geração via ?geracao=ID some com os controles de edição (bucketPaths nulo)
- **área:** UX e Fluxos do Operador · **tipo:** melhoria · **esforço:** M
- **arquivo:** `src/app/painel/kpi/simples/page.tsx:598-624,709`
- **impacto:** Da tela de Histórico (que diz 'Clique numa linha pra reabrir e baixar'), o usuário acredita poder ajustar e regerar, mas a edição inline fica inerte. Expectativa quebrada.
- **proposta:** Ou desabilitar/ocultar os inputs editáveis quando reaberto sem bucketPaths (modo somente-leitura/download), ou fazer a rota /regerar retornar os bucket paths para permitir re-geração com edições.

### ⚪ Nav do grupo 'Cozinha' navega ao clicar no header e ignora o estado aberto/fechado salvo
- **área:** UX e Fluxos do Operador · **tipo:** melhoria · **esforço:** P
- **arquivo:** `src/app/painel/nav.tsx:83-116`
- **impacto:** Inconsistência de interação no menu principal: um grupo expande/colapsa, o outro navega. Em telas pequenas (drawer), o estado pode abrir/fechar de forma inesperada. Atrito menor mas perceptível no uso diário.
- **proposta:** Padronizar: header sempre alterna expand/collapse; navegação só nos leaves. Sincronizar open com groupHasActive(pathname) via useEffect quando a rota muda.

### ⚪ Estado da aba do dashboard e filtros não são refletidos na URL (perde-se ao recarregar/compartilhar)
- **área:** UX e Fluxos do Operador · **tipo:** melhoria · **esforço:** M
- **arquivo:** `src/app/painel/dashboard/dashboard-client.tsx:40-58,74-82`
- **impacto:** Operador filtra uma rede/dia específico, recarrega ou volta pelo navegador, e perde o contexto. Não dá para mandar um link com o recorte. Atrito recorrente para quem investiga problemas por rede.
- **proposta:** Persistir tab/periodo/data/redes em searchParams (useSearchParams + replaceState). Barato e melhora bastante o fluxo de investigação e compartilhamento.

### ⚪ Erro inline da geração não rola para a vista nem tem aria-live; em tela cheia o operador não percebe a falha
- **área:** UX e Fluxos do Operador · **tipo:** melhoria · **esforço:** P
- **arquivo:** `src/app/painel/kpi/simples/page.tsx:813-819,527`
- **impacto:** Operador clica em Gerar, dá erro de upload/processamento, mas como ele estava olhando o botão/skeleton, pode não ver a mensagem e achar que travou. Leitores de tela também não anunciam.
- **proposta:** Adicionar role='alert' aria-live='assertive' ao bloco de erro e dar scrollIntoView/foco quando erro!=null. Vale também para o erro do AlteracoesCard (linha 527).

### ⚪ endereco (não-greedy) pode engolir parte do local_parada quando o endereço contém número que parece coordenada/data
- **área:** parser-unitrac · **tipo:** risco · **esforço:** P
- **arquivo:** `src/lib/parsers/unitrac-pdf.ts:285`
- **impacto:** Endereço truncado e lat/lng deslocados em paradas com texto atípico. Baixa frequência mas difícil de detectar (não gera erro, só dado errado).
- **proposta:** Validar plausibilidade geográfica de lat/lng extraídos (ex lat entre -25 e -20, lng entre -45 e -40 para RJ) e descartar/logar quando fora da caixa — pega tanto este caso quanto o de coordenada mal grudada.

### ⚪ corrigeOcrPlaca não cobre confusão OCR fora da pos-4 (ex pos 0-2 ou pos 5-6 lidas trocadas)
- **área:** parser-unitrac · **tipo:** risco · **esforço:** M
- **arquivo:** `src/lib/utils/placa.ts:67`
- **impacto:** Placas com erro OCR fora da pos-4 não casam com a escala (nem com cadastroPlacas) e a viagem fica UNMATCHED. Menos comum que o caso pos-4, mas existe.
- **proposta:** Considerar, no matcher, uma busca por placa tolerante a 1 char de distância (Levenshtein<=1) restrita ao cadastro real de placas, em vez de tentar corrigir cegamente no parser. Documentar o limite atual.
