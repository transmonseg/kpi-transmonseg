# Gaps do sistema — coisas que o código NÃO tem como resolver sozinho

Compilado após leitura manual dos relatórios dia 18, 19 e 25.
Cada gap = problema que ESTÁ FORA DO ALCANCE do matcher/parser.

---

## 1. GAP — Placas fora do Unitrac

**Problema**: 33% das placas da ZONA SUL dia 19 (11 de 33) não existem no relatório Unitrac. Padrão se repete em outras redes.

**O que o código pode fazer**: nada. Sem dados GPS, devolve '---/---/---'.

**Pra resolver, precisa**:
- Garantir que TODAS as placas da operação são exportadas no mesmo relatório
- OU mapear quais placas não têm rastreador e marcar como "SEM_GPS" no cadastro

---

## 2. GAP — Placas no Unitrac mas com GPS inválido

**Problema**: 18% das placas ZS dia 19 (6 de 33) estão no Unitrac mas só com paradas BASE/FORA_BASE. Zero LOJA classificada (ex: LVE0688 ANDERSON ficou na base 738 min seguidos; DBB8D19 só FB).

**O que o código pode fazer**: nada — se o veículo não chega no raio de uma loja cadastrada, GPS classifica como FB e o sistema correctamente devolve '---'.

**Pra resolver, precisa**:
- Reduzir raio das lojas no cadastro Unitrac (caminhão estaciona FORA do raio cadastrado)
- OU ampliar raio (caminhão para LONGE da posição GPS cadastrada)
- Não é decisão do código

---

## 3. GAP — Geofences "ROTA xxx" (códigos 2018xxx)

**Problema**: Unitrac usa geofences GIGANTES por bairro (`2018002 ROTA BOTAFOGO`, `2018038 ROTA NITERÓI/MARICÁ`). Caminhão fazendo 5 lojas DIFERENTES no mesmo bairro recebe TODAS marcadas com o mesmo código de ROTA.

**O que o código pode fazer**: nada — não há informação para diferenciar "qual loja específica dentro da ROTA".

**Pra resolver, precisa**:
- Cadastrar cada loja individualmente no Unitrac com geofence próprio
- 13 ROTAS diferentes detectadas só no dia 19 (2018001/002/006/007/008/009/013/014/018/019/022/023/038)

---

## 4. GAP — Lojas vizinhas com geofence sobreposto

**Problema**: ASSAÍ Ilha do Governador e SENDAS Ilha estão no mesmo prédio/perto. Caminhão escalado pra ASSAÍ Ilha aparece no Unitrac em SENDAS ILHA - LOJA 29.

**O que o código pode fazer**: hoje trata ASSAÍ↔SENDAS como rede fungível, mas só pra mesma loja. Não consegue saber se SENDAS X é fisicamente a mesma ASSAÍ Y.

**Pra resolver, precisa**:
- Mapeamento manual de "lojas-irmãs" (SENDAS Ilha = ASSAÍ Ilha, etc.)
- Reduzir geofence de uma das duas

---

## 5. GAP — Caminhão fazendo rota DIFERENTE da escala (sem troca registrada)

**Problema**: dia 19 ZS, 7 placas com GPS contradizendo a escala:
- BBH1C94 JOSUE: escala Lojas 03/19/48, GPS Loja 33 Humaitá
- JAJ6B36 RENATO: escala ZS Loja 46, GPS PRINCESA Rio das Ostras
- KMY5561 LUIZ ANTONIO: escala ZS Loja 19, GPS CARREFOUR + PAX
- KRK3D12 JOSENILDO: escala ZS Loja 23, GPS SENDAS São Gonçalo
- KWK4593 RODRIGO: escala ZS Lojas 38/07, GPS Loja 21
- LKR5990 AGNALDO: escala ZS Loja 44, GPS PREZUNIC Vila Isabel
- LTH4J15 MARCIO: escala ZS Loja 26, GPS SENDAS/PETIT/VIANENSE

**O que o código pode fazer**: detecta o conflito e devolve '---' honestamente.

**Pra resolver, precisa**:
- Capturar trocas em tempo real (hoje vem por WhatsApp/voz e não chega ao arquivo `alteracoes_XX.05.txt`)
- OU implementar detecção automática de troca cross-rede (complexo, risco de FP)

---

## 6. GAP — Mesma placa, 2 escalas, 2 motoristas no mesmo dia

**Problema**: KQR2J11 dia 19 — escala ZS diz ALESSIO/Loja 07, escala GERAL diz KANU/Princesa+4 Prezunic SPID. GPS confirma: KANU fez de manhã, ALESSIO assumiu à tarde.

5 casos só dia 19 (KQR2J11, JAJ6B36, KMY5561, BBH1C94, INW8A51 em 2-3 escalas cada).

**O que o código pode fazer**: hoje processa cada escala separadamente e separa paradas pela rede da loja. Funciona quando a parada está bem cadastrada.

**Pra resolver completamente, precisa**:
- Saber explicitamente que essa placa é compartilhada (motorista 1 manhã, motorista 2 tarde)
- "Saída do CD" do segundo motorista é a próxima ida à base (após primeiro motorista terminar)
- Hoje sistema atribui mesma SC pra todas as paradas — pode estar errado pra placas compartilhadas

---

## 7. GAP — 2 turnos por loja (manhã + tarde)

**Problema**: PRINCESA dia 18 — várias lojas com manual marcando manhã (~04-06h) e GPS marcando tarde (~14-15h). Sistema escolhe uma e a outra "perde".

**O que o código pode fazer**: ranqueia paradas por proximidade temporal mas escolhe SÓ UMA.

**Pra resolver, precisa**:
- Escala explicitar que loja tem 2 entregas no dia (manhã + tarde)
- OU saber qual caminhão fez cada turno

---

## 8. GAP — Manual com tudo "---" ou "SEM" (semântica ambígua)

**Problema**: 
- GUANABARA dia 19: 37 lojas, todas com timestamp '---/---/---'
- Outros casos com "SEM/SEM/SEM" sem clareza se é "sem rastreador" ou "não fez"

**O que o código pode fazer**: tem heurística por rede (BLANK_OK para GUANABARA), mas é "achismo".

**Pra resolver, precisa**:
- Confirmar com Erica: '---' vs 'SEM' vs 'NÃO FOI' = significados distintos?
- Padronizar preenchimento

---

## 9. GAP — Manual com timestamps "estimados" (não baseado em GPS)

**Problema**: 46 casos dia 19 onde manual tem horários mas GPS prova que a placa não foi lá. Operador anota baseado em "deveria ter ido", não confirma com GPS.

**O que o código pode fazer**: detecta o conflito mas não tem autoridade pra decidir quem está certo.

**Pra resolver, precisa**:
- Mudar processo: operador só preenche timestamp se confirmou com GPS
- OU sistema vira a fonte da verdade e Erica para de preencher manual

---

## 10. GAP — Bases não cadastradas

**Problema**: Áudio do cliente mencionou 2 bases (BENASSI + outra "do lado do Ciaza", chamada "200"). Também aparece "PARADA VERSO SERVIÇOS" como possível ponto de recarga. Hoje sistema só reconhece BENASSI.

**O que o código pode fazer**: nada — bases não-BENASSI viram FORA_BASE.

**Pra resolver, precisa**:
- Coordenadas + nome exato (como aparece no Unitrac) de cada base
- Caminhões podem recarregar em base diferente da primária

---

## 11. GAP — Múltiplos códigos no mesmo "Local da Parada"

**Problema**: Unitrac concatena múltiplos lugares numa parada:
```
2018002 - ROTA BOTAFOGO, 2018006 - ROTA CAMPO GRANDE, BASE BENASSI
```

**O que o código pode fazer**: parser pega só o primeiro código. Pode estar errado.

**Pra resolver, precisa**:
- Lógica para escolher o código MAIS específico (loja > rota > base)
- Hoje já tem REDE_PREFIX_RE que prioriza códigos de loja, mas não é perfeito

---

## 12. GAP — MEGA BOX cadastro genérico

**Problema**: cadastro tem só "MEGA BOX (OLARIA)" genérico. Escala tem MEGA BOX 01 e MEGA BOX 02 (lojas diferentes? docas?). GPS retorna 1 parada só.

**O que o código pode fazer**: atribui só uma das duas escalas; a outra fica "matcher vazio".

**Pra resolver, precisa**:
- Confirmar: 01 e 02 são lojas físicas distintas ou 2 docas da mesma?
- Se distintas: cadastrar 2 geofences separados

---

## 13. GAP — REGINA do Armazém Grão consolidada

**Problema**: escala tem 4 lojas REGINA (Barra do Imbuy, 1 de Maio, Lúcio Meira, Abastecedora) — Unitrac retorna 1 parada agregada.

**O que o código pode fazer**: já tem fallback "parada compartilhada" (atribui mesma parada a 4 linhas com score=0). Mas isso assume que TODAS as 4 foram feitas com a mesma janela.

**Pra resolver, precisa**:
- Confirmar se essas 4 lojas são 1 loja física ou 4 com geofence agregado
- Se 4 lojas: cadastrar coordenadas separadas

---

## 14. GAP — Recarga na base intermediária

**Problema**: caminhão vai à base, sai, entrega, volta na base recarregar, sai de novo, entrega mais. Hoje "saída do CD" é da PRIMEIRA saída da base. Para entregas tarde, isso fica errado.

**O que o código pode fazer**: já tem lógica `computeSaidaCdParaParada` que pega a base mais próxima ANTES da parada. Mas se a placa tem 2 motoristas (gap #6), pode pegar a base errada.

**Pra resolver completamente, precisa**:
- Saber se a placa fez recarga ou se trocou motorista
- Identificar a "segunda saída do CD" como início do segundo turno

---

## 15. GAP — Timing GPS vs manual (precisão)

**Problema**: 82 casos dia 19 com diferença 5-30 min entre GPS (preciso) e manual (arredondado). Não é erro, é precisão.

**O que o código pode fazer**: marca como DIFF.

**Pra resolver, precisa**:
- Adicionar tolerância de ±X min na comparação
- Definir X com Erica (15 min? 30 min?)
- OU aceitar que manual sempre vai diferir do GPS por arredondamento

---

## 16. GAP — Manual "NAO_FOI" mas GPS confirma

**Problema**: dia 18 ASSAÍ Barra I — manual diz NAO_FOI, GPS prova que o caminhão FEZ entrega lá (5:21-10:32, 5h11min).

**O que o código pode fazer**: marca DIFF.

**Pra resolver, precisa**:
- Operador conferir GPS antes de marcar NAO_FOI
- OU sistema vira a fonte da verdade

---

## 17. GAP — Caminhão escala faz a rota de outro caminhão sem GPS

**Problema**: dia 19 BBH1C94 JOSUE fez Loja 33 Humaitá (escala original do LUIZ ALVES sem GPS). LUIZ ALVES sumiu do Unitrac → "Loja 33 perdida". BBH1C94 fez ela mas não atribuído à escala correta.

**O que o código pode fazer**: poderia detectar — "parada GPS órfã (sem dono na escala) + escala órfã (sem GPS)" → cross-match.

**Pra resolver**:
- Implementar lógica de cross-match cronológico (alta complexidade, risco de FP)
- OU registrar troca no arquivo de alterações em tempo real

---

## 18. GAP — FAKE_EXIT / paradas curtas

**Problema**: caminhão entra na base por 5-10 min (troca nota, descarrega, etc.) e o Unitrac marca como FAKE_EXIT. Sistema ignora.

**O que o código pode fazer**: já classifica como FAKE_EXIT e ignora. Funciona.

**Não é gap operacional — código funciona corretamente.**

---

## 19. GAP — Truncamento de nomes no PDF

**Problema**: PDF do dia 25 mostra `CAXIAS CENTENÁRI O` (com espaço) em vez de `CENTENÁRIO`. Quebra de palavra no layout do PDF.

**O que o código pode fazer**: parser tenta lidar mas pode falhar matching por nome.

**Pra resolver, precisa**:
- Sempre exportar XLSX (que tem o texto íntegro)
- OU parser de PDF mais robusto (já tem normalização de tokens, mas limitado)

---

## 20. GAP — Nome de motorista no Unitrac vs escala

**Problema**: Unitrac não traz motorista, só placa. Se KQR2J11 está com KANU mas escala diz ALESSIO, o sistema atribui a ALESSIO (motorista da escala) mesmo que o real seja KANU.

**O que o código pode fazer**: já usa só placa (motorista é referencial). Mas no KPI final aparece o nome da escala.

**Pra resolver, precisa**:
- Aceitar que "motorista no KPI = motorista da escala", não necessariamente quem dirigiu
- OU integrar com sistema de cartão/biometria que registra quem assumiu o caminhão

---

# Resumo: 20 gaps mapeados

**5 gaps de DADOS de ENTRADA**:
1. Placas fora do Unitrac
2. GPS inválido (só BASE/FB)
10. Bases não cadastradas
11. Múltiplos códigos no Local
19. Nome truncado em PDF

**6 gaps de CADASTRO**:
3. Geofences ROTA gigantes
4. Lojas vizinhas sobrepostas
12. MEGA BOX genérico
13. REGINA consolidada
20. Motorista não vem no Unitrac
(8. Semântica '---' vs 'SEM')

**5 gaps de PROCESSO**:
5. Trocas não registradas
6. Placa compartilhada por 2 motoristas
7. 2 turnos por loja
9. Manual com timestamps estimados
16. Manual com NAO_FOI mas GPS confirma

**3 gaps de PRECISÃO**:
14. Recarga intermediária
15. Timing GPS vs manual
17. Cross-match GPS órfão

---

# O que o CÓDIGO consegue resolver sozinho

Quase nada nessa lista. O matcher já está fazendo o melhor possível com os dados que recebe. **A grande maioria dos DIFFs vem de dados de entrada incompletos ou cadastro de geofences fraco no Unitrac.**

Pra atingir 95%+ de match, precisamos atacar:
1. Cadastro de geofences (gaps 3, 4, 12, 13)
2. Trocas em tempo real (gaps 5, 6)
3. Padronização do KPI manual (gaps 8, 9, 16)
4. Lista completa de placas no Unitrac (gap 1)
