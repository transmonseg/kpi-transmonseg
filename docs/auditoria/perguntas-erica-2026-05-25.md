# Perguntas para Erica — Semana Intensiva 2026-05-25

Foco: padrões operacionais e casos específicos. Sem perguntas óbvias.

---

## 1. CAMINHÕES QUE FAZEM 2 TURNOS NO MESMO DIA

**O que vemos**: PRINCESA dia 18 — várias lojas com manual marcando manhã (~04-06h) e GPS marcando tarde (~14-15h). Não é erro, é padrão.

1. Quando uma loja recebe 2 entregas no dia (manhã + tarde), **as duas vão no KPI ou só uma?**

2. Se vão as duas, **como identificar qual é qual?** O manual mostra só um horário por linha.

3. **O segundo turno é o mesmo caminhão recarregando, ou é outro caminhão?**
   - Se é o mesmo: o GPS vai mostrar o caminhão voltando pra base entre as entregas
   - Se é outro: a escala tem que ter as 2 placas listadas

4. **Existe algum dia da semana fixo onde TODA loja recebe 2 entregas?** Tipo "segunda e quinta dobra".

5. Casos específicos do dia 18 que vimos como "2 turnos":
   - Princesa Maricá 2, Rio das Ostras, Arraial 1, Buzios 3, Cabo Frio 1
   - **A escala diz só 1 placa pra essas lojas. Quem fez a outra entrega?**

---

## 2. CAMINHÕES QUE APARECEM EM ROTA DIFERENTE DA ESCALA

**O que vemos no dia 19 (ZONA SUL)**, casos onde GPS prova que a placa fez OUTRA rota:

| Placa | Motorista | Escala diz | GPS prova |
|---|---|---|---|
| BBH1C94 | JOSUE | Lojas 03/19/48 | Loja 33 Humaitá (5h em 1 loja) |
| JAJ6B36 | RENATO | Loja 46 Botafogo | PRINCESA Rio das Ostras + Barra de São João |
| KMY5561 | LUIZ ANTONIO | Loja 19 Copa | CARREFOUR Barra + PAX Realengo |
| KRK3D12 | JOSENILDO | Loja 23 Barra | SENDAS São Gonçalo Centro (5h46min!) |
| KWK4593 | RODRIGO | Lojas 38/07 | Loja 21 Flamengo |
| LKR5990 | AGNALDO | Loja 44 Barra | PREZUNIC Vila Isabel |
| LTH4J15 | MARCIO | Loja 26 Copa | SENDAS/PETIT/VIANENSE |
| LTH4J15 | MARCIO | Loja 26 Copa | EMPORIO BARRA TOWER + 4 outras |

6. **Esses 7 casos: foram trocas de caminhão de última hora?** Quem ficou sabendo? Se não tem registro, o sistema não tem como detectar.

7. **Existe um padrão de "motoristas curinga" que cobrem mais de uma rota?** Tipo JOSUE que pode fazer ZS ou PRINCESA dependendo do dia?

8. **Quando uma placa quebra/falta no dia, o cobrindo entra com QUAL placa?** A do veículo dele original, ou pega a do veículo quebrado?

9. Caminhões EZU9325, CEJ3426 e outros que aparecem com **0 LOJA paradas** (só BASE/FORA_BASE no GPS):
   - **Eles realmente FIZERAM as entregas mas o GPS não pegou** OU
   - **Eles ficaram parados o dia todo e nem foram?**

---

## 3. CRUZAMENTO DE REDES (ASSAÍ ↔ SENDAS ↔ outras)

**O que vemos**: várias placas escaladas pra ASSAÍ aparecem no GPS em SENDAS (e vice-versa). Sabemos que ASSAÍ comprou SENDAS, mas precisa confirmar:

10. **Quando o sistema vê uma placa escalada pra "ASSAÍ Ilha Loja 29" e o GPS marca "SENDAS ILHA - LOJA 29": é a mesma loja física com cadastro velho, ou são 2 lojas diferentes?**

11. **Tem lista de lojas que FORAM SENDAS e VIRARAM ASSAÍ?** Pra eu mapear automaticamente "SENDAS X = ASSAÍ Y" no Unitrac.

12. **No Unitrac, o nome "SENDAS X" ainda aparece mesmo depois do rebrand pra ASSAÍ?** Quem atualiza isso?

13. **Quais outras redes têm "mesma loja com nome diferente"?** Ex: PETIT MARCHE BARRAMARES (SENDAS Petit?), EMPORIO BARRA TOWER (SENDAS Empório?).

---

## 4. CASOS ESPECÍFICOS QUE NÃO ENTENDO (preciso do contexto)

14. **MEGA BOX 01 vs MEGA BOX 02 (Olaria) — são lojas FÍSICAS diferentes ou só "docas" da mesma loja?**
    - Se são docas: o caminhão atende as duas com 1 só parada GPS (atual)
    - Se são lojas: precisa de coordenadas separadas

15. **EXTRA F.31 / EXTRA / Zona Sul Loja 1129 — esses 3 nomes diferentes na escala são a MESMA loja física ou diferentes?**

16. **REGINA (Armazém do Grão) — Barra do Imbuy / 1 de Maio / Lucio Meira / Abastecedora Grão da Serra: 4 entregas mas o GPS marca 1 só parada agregada?** Isso é cross-docking esperado, ou cada uma deveria ter sua parada?

17. **GUANABARA: o KPI manual aparece com timestamp em '---' para quase TODAS as lojas.** Mesmo quando tem GPS. **É padrão da Guanabara não preencher horário?** Por quê?

---

## 5. PERGUNTAS TÉCNICAS QUE SÓ ELA SABE

18. **A "saída do CD" no manual é a hora que o motorista carrega ou a hora que ele sai do portão?** Hoje o sistema computa pela última parada BASE do GPS. Pode estar entendendo diferente.

19. **Existem caminhões que recarregam DUAS vezes no dia (vai na base, entrega, volta na base, entrega de novo)?** Se sim, qual é a "saída do CD" — a primeira ou a segunda?

20. **Quando um caminhão entra na base por menos de 15 min (FAKE_EXIT no sistema), é "passou só pra trocar nota" ou conta como recarga real?**

21. **Caminhão SAMS_CLUB, CAB_PETROPOLIS, SUPERCOMPRAS — esses 3 são da mesma operação ou são clientes "extras" que vocês cobrem esporadicamente?** Pergunto porque o KPI desses 3 redes é pequeno (1-3 lojas).

22. **CARROS DA SUBCONTRATAÇÃO — agregados / freteiros do dia: vão pra escala? Pra Unitrac?**

---

## 6. PERGUNTAS SOBRE PROCESSO

23. **A escala que eu recebo (XLSX) e a alteração (TXT/PDF/WhatsApp) — quem PRODUZ esses arquivos? Quanto tempo demora pra ficar fechado?**

24. **Quem fecha o KPI manual no Excel — quanto tempo essa pessoa gasta por dia hoje?** Isso me ajuda a medir o impacto da automação.

25. **Se o sistema desse o KPI 100% pronto AUTOMATICAMENTE, quanto tempo isso economizaria por mês na operação?**

---

## TOP 5 CRÍTICAS (se ela só responder isso já ajuda muito)

1. **2 turnos**: lojas que recebem 2 entregas, a escala tem 2 linhas ou só 1? Quem faz a segunda?
2. **7 casos de placa fazendo outra rota dia 19**: troca não registrada ou padrão "motorista curinga"?
3. **MEGA BOX 01 vs 02**: 1 loja com 2 docas ou 2 lojas físicas?
4. **GUANABARA todos '---' no manual**: padrão? Por quê?
5. **SENDAS↔ASSAÍ**: lista de lojas que mudaram de nome pós-rebrand?
