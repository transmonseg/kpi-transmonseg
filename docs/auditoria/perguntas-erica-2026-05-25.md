# Perguntas para Erica — Semana Intensiva 2026-05-25

Lista de questões necessárias para acabar com os gaps do sistema KPI.
Baseado nas auditorias do dia 18 e 19/05 + caso LCE-4337 do dia 25.

---

## 1. SOBRE O RELATÓRIO UNITRAC (prioridade máxima)

**Contexto**: 33% das placas da escala ZONA SUL dia 19 simplesmente NÃO existem no relatório Unitrac que vocês exportam. Sem GPS dessas placas, o sistema não tem como confirmar nada.

1. **O relatório Unitrac que vocês exportam inclui TODOS os caminhões da operação?** Ou existe alguma frota/conta separada que fica de fora? (Mega Box, Extra, terceirizados, etc.)

2. **Algumas placas têm que ser exportadas separadamente?** Por exemplo: Mega Box, Extra, Sams Club, Cab Petrópolis vêm em um relatório específico?

3. **Existem placas terceirizadas/agregadas que não passam pelo Unitrac?** Quem rastreia esses caminhões? Tem como integrar?

4. **Com que frequência o Unitrac é exportado?** Diariamente? Quem faz? Em que horário?

5. **Existe API do Unitrac pra puxar dados diretamente?** Se sim, vocês têm o acesso? Eliminaria erro de "esqueci de exportar" e PDFs incompletos.

6. **Por que vocês geram XLSX em alguns dias e PDF em outros?** O XLSX é melhor (parsing mais confiável). O PDF de hoje (dia 25) tem nomes de loja truncados (ex: "CAXIAS CENTENÁRI O" com espaço).

7. **Lista de placas que sumiram do relatório dia 19 (ZONA SUL):**
   - CZB9J19, KYM2I62, LCO0978, LJS2172, LNU7733, LNU9595, LQA5883, LQE5401, LTE0A64, MDV3746, QAH2H50
   - **Pergunta: Essas placas existiam? Foram desativadas? Estão em outra conta Unitrac?**

---

## 2. SOBRE AS BASES / CDs

**Contexto**: No áudio que você enviou hoje (LCE-4337 ANDERSON Caxias), você mencionou que existem 2 bases — BASE BENASSI e uma "do lado do Ciaza, que é o 200". Também apareceu "PARADA VERSO SERVIÇOS" como possível base.

8. **Quantos CDs/bases existem na operação?**
   - BASE BENASSI (já cadastrada)
   - "200" (Base do lado do Ciaza) — está cadastrada?
   - PARADA VERSO SERVIÇOS — é base de recarga?
   - Algum outro?

9. **Os caminhões podem sair de uma base e ir em outra recarregar antes de entregar?** Hoje o sistema só reconhece BENASSI como base. Se um caminhão pega carga adicional no "200", isso aparece como FORA_BASE ou LOJA errada.

10. **Tem coordenadas (lat/lng) de cada base?** Pra cadastrar como BASE no sistema.

11. **Tem nome exato (do jeito que aparece no Unitrac) de cada base?** Hoje só reconheço "BASE BENASSI" pelo texto literal. Outras bases viram FORA_BASE.

---

## 3. SOBRE ALTERAÇÕES DE ESCALA

**Contexto**: No dia 19, o arquivo `alteracoes_19.05.txt` só tinha 5 trocas (ASSAÍ e CARREFOUR). Mas o GPS prova que houve PELO MENOS 7 trocas em ZONA SUL que ninguém registrou. Resultado: KPI cheio de DIFFs falsos.

12. **Como as alterações de escala chegam até o sistema?** Hoje é só pelo arquivo `.txt` na pasta ALTERACOES?

13. **Existem alterações que rolam por WhatsApp/telefone e não chegam ao arquivo?** Provavelmente sim, com base no que vemos.

14. **Quem registra as alterações no arquivo?** Em que horário do dia?

15. **Caminhões "quebrados" ou trocados de última hora — como são tratados?** Exemplo: BBH1C94 JOSUE no dia 19 tava na escala 03/19/48 mas o GPS prova que ele fez Loja 33. Houve uma troca não registrada.

16. **Posso construir uma tela no sistema pra você registrar alterações em tempo real?** Em vez de TXT, seria um formulário rápido (placa que entra, placa que sai, motorista, loja). Evitaria 100% das alterações perdidas.

---

## 4. SOBRE CADASTRO DE LOJAS

**Contexto**: O cadastro de lojas tem alguns vazios que confundem o matcher.

17. **MEGA BOX 01 vs MEGA BOX 02 (Olaria) — são lojas físicas DIFERENTES?** Se sim, têm coordenadas separadas? Hoje o cadastro tem só "MEGA BOX (OLARIA)" genérico, então o sistema não consegue distinguir entre as duas.

18. **Loja 1129 (Zona Sul) — onde fica?** Não tenho coordenadas dela. Aparece na escala mas não no Unitrac (provavelmente bate junto com MEGA BOX 01).

19. **EXTRA F.31 / Zona Sul EXTRA — é a mesma loja física ou são distintas?**

20. **Quando duas lojas ficam VIZINHAS (mesmo prédio, mesmo estacionamento), como saber qual o caminhão foi de fato?**
    - Exemplo dia 19: JOSE M placa UBF5G32 estava escalado para ASSAÍ Ilha do Governador Loja 29, mas o GPS marcou SENDAS ILHA - LOJA 29 (mesmo prédio?). O matcher devolve "matcher vazio" honestamente. Como resolver?

21. **Tem coordenadas (lat/lng) EXATAS das lojas críticas?** Lojas onde geofence sobrepõe vizinhas precisam ter raio menor.

22. **Existem lojas que mudam de endereço durante o mês?** Reforma, troca de filial, etc.

---

## 5. SOBRE O KPI MANUAL (Excel da Erica)

**Contexto**: O KPI manual é o que vocês usam pra comparar. Mas em vários casos o manual está ERRADO (anota horários que o GPS prova não terem acontecido).

23. **Em que base o operador preenche o KPI manual?**
    - Olhando o Unitrac?
    - Recebendo informação por rádio/WhatsApp?
    - Estimando por horário esperado?

24. **Quando uma placa não tem GPS (sumiu do Unitrac), o operador ainda preenche timestamps "esperados"?** Hoje vejo casos com timestamps no manual mas a placa não tem GPS. Pode ser que a pessoa esteja "chutando".

25. **No KPI manual, "SEM" significa o quê exatamente?**
    - Veículo sem rastreador?
    - Veículo não fez a entrega?
    - Não conseguiu confirmar?
    - Cada um pode ser tratado diferente pelo sistema.

26. **'---/---/---' (todos vazios) no manual significa o quê?**
    - Não preencheu / esqueceu?
    - Veículo sem GPS?
    - Diferente de "SEM"?

27. **No GUANABARA todos os timestamps estão '---' mesmo quando o caminhão foi.** É padrão da operação? (Operador não preenche timestamp pra Guanabara?)

28. **No PRINCESA dia 18, várias entregas têm o manual marcando "manhã" enquanto GPS marca "tarde".** São 2 turnos? Caminhões diferentes pela manhã e à tarde?

---

## 6. SOBRE PADRÕES DE OPERAÇÃO

29. **Caminhões fazendo 2 viagens por dia (manhã + tarde): qual é o padrão?**
    - PRINCESA dia 18 teve vários casos: GPS achou ~14h, manual diz ~6h
    - É um segundo caminhão fazendo a mesma loja à tarde?
    - Como diferenciar no KPI?

30. **Existem lojas que recebem 2 entregas por dia da mesma rede?** Ex: REGINA da Armazém do Grão, onde 4 lojas REGINA aparecem com 1 parada GPS só.

31. **Quando uma placa atende 2 redes diferentes no mesmo dia (cross-docking), qual a regra?**
    - O motorista carrega Armazém na BENASSI e depois pega carona com Princesa no caminho?
    - Existe um padrão claro de quais redes podem se misturar?

32. **Domingos e feriados — operação normal ou reduzida?** Pra saber se devo aceitar dias de "baixa atividade" ou marcar como anomalia.

---

## 7. SOBRE TIMINGS

**Contexto**: 82 casos de "DIFF timing" no dia 19 (GPS preciso vs manual arredondado).

33. **O manual é preenchido com base em horários EXATOS do GPS ou em horário "aproximado"?** Hoje vejo CHD 5:32 no GPS vs 5:29 no manual (diferença 3 min). É arredondamento manual?

34. **Aceita uma tolerância de ±10 min como "match"?** Pra entender se devo classificar diferenças pequenas como OK ou DIFF.

35. **A "Saída do CD" no manual — vem de onde?**
    - Hora que o motorista bate ponto?
    - Hora que o caminhão sai do portão?
    - Hora estimada?

---

## 8. SOBRE INTEGRAÇÃO COM AIRTABLE / OUTRAS FERRAMENTAS

36. **Vocês usam alguma outra ferramenta pra controlar a operação?** Airtable, planilhas, sistemas próprios?

37. **Os 5 motoristas com placa "errada" no GPS (LCO0978, LJS2172, etc.) — eles existem na base de motoristas?** Pode ser que sejam terceirizados não cadastrados.

---

## 9. SOBRE OS CHECKS FINAIS

38. **Vou conseguir um dia 100% LIMPO se vocês:**
    - Mandarem TODAS as placas no Unitrac (sem filtro)
    - Registrarem TODAS as alterações de placa
    - Confirmarem o "SEM/---/NÃO FOI" no manual
    - Cadastrarem todas as bases (Benassi, 200, Parada Verso, etc.)
    
    **Pergunta**: vocês conseguem essas 4 coisas pra UM DIA específico (escolha: amanhã ou outro)? Aí eu provo que o sistema fica 100%.

39. **Qual a meta da semana?** Sistema com 95% match? Sem nenhuma alucinação? Tempo total da equipe gastando em KPI manual cair em X%?

---

## RESUMO DAS PERGUNTAS MAIS CRÍTICAS (se ela só puder responder 5)

1. **Por que essas 11 placas da ZONA SUL não estão no Unitrac dia 19?** (Lista no item 7)
2. **Quantas bases/CDs existem além do BENASSI?** (item 8)
3. **Quem registra alterações de placa em tempo real? Como?** (item 13)
4. **MEGA BOX 01 vs 02 são lojas diferentes?** (item 17)
5. **No KPI manual, "SEM" e "---" significam a mesma coisa?** (itens 25-26)
