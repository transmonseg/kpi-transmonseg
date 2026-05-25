# Perguntas para Erica — 2026-05-25

Baseado em LEITURA MANUAL do `relatorio_9572.pdf` dia 19/05.

---

## A causa raiz que descobri lendo o relatório

O Unitrac usa DOIS tipos de "lugares" cadastrados:

**1. Lojas individuais** (código específico, raio pequeno):
- `3030008 - SUPERPRIX LJ 08 GRAJAÚ`
- `7000713 - PREZUNIC CAXIAS CENTENÁRIO`
- `9039015 - 15 - ZONA SUL - LEBLON`
- etc.

**2. "ROTAS" gigantes** (códigos `2018xxx`, geofences que cobrem bairros INTEIROS):
- `2018001 - ROTA BARRA`
- `2018002 - ROTA BOTAFOGO`
- `2018006 - ROTA CAMPO GRANDE`
- `2018009 - ROTA CENTRO`
- `2018038 - ROTA NITERÓI / MARICÁ`
- `2018007/008/013/014/018/019/022/023` — outras ROTAS

**Problema**: quando o caminhão vai a uma loja que NÃO tem cadastro individual no Unitrac, ele recebe SÓ o código da ROTA do bairro. Resultado: o sistema fica sem saber QUAL loja foi visitada.

**Exemplo real (dia 19)**: o caminhão EAK-6G02 fez 20 paradas em NITERÓI inteiro (Largo do Barradas, Centro, Icaraí, Santa Rosa, São Francisco). Todas marcadas como `2018038 - ROTA NITERÓI/MARICÁ`. O sistema não tem como dizer qual PRINCESA visitou (Icaraí? Inga? Fonseca?).

---

## 1. SOBRE CADASTRO DE LOJAS NO UNITRAC

1. **Vocês conseguem pedir pro Unitrac cadastrar geofences ESPECÍFICAS de cada loja?** Hoje várias lojas não têm cadastro individual — caem na "ROTA" do bairro.

2. **Lista das lojas que VI que NÃO estão cadastradas individualmente** (caem em ROTA):
   - PRINCESA Niterói (todas: Icaraí, Inga, Fonseca, Centro, Barcas, Santa Rosa)
   - PRINCESA Catete, Laranjeiras, Flamengo, Glória — caem em `2018002 - ROTA BOTAFOGO`
   - Várias ZONA SUL — caem em `2018002 ROTA BOTAFOGO` ou `2018001 ROTA BARRA`
   
   **Pode pedir pro pessoal do Unitrac criar cadastro individual de cada uma?**

3. **Quem cadastra geofences no Unitrac — Transmonsel internamente ou é a empresa do Unitrac?**

4. **Tem como vocês me passarem a lista atual de geofences cadastrados?** Aí eu cruzo com a escala e mostro EXATAMENTE quais lojas faltam cadastro.

---

## 2. SOBRE O FORMATO "ROTAS" do Unitrac

5. **As ROTAS (`2018xxx`) servem pra alguma coisa operacional?** Tipo, é como Trans Monsel divide a operação?

6. **Por que algumas paradas têm DOIS ou TRÊS códigos no mesmo local?** Exemplo: `2018002 - ROTA BOTAFOGO, 2018006 - ROTA CAMPO GRANDE, BASE BENASSI`. Os geofences se sobrepõem.

7. **O ideal é que cada parada tivesse SÓ o código da loja específica.** Concorda? Posso priorizar isso na conversa com Unitrac.

---

## 3. CASOS QUE PRECISO ENTENDER OPERACIONALMENTE

8. **Veículo DIP-5557 dia 19**: 17 paradas, ZERO LOJA. Mas passou em Leblon (Ataulfo de Paiva, Humberto de Campos, Carlos Góis), Gávea, Lagoa, São Conrado, Jardim Botânico. **Esse caminhão fez entrega ZS ou estava só dando voltas?**

9. **Caminhões que FAZEM 2 turnos no mesmo dia**: caso típico PRINCESA dia 18 — manual marca manhã, GPS marca tarde. **A escala tem 1 linha por loja ou 2?** Se 1 linha, qual entrega o sistema deveria pegar?

10. **Veículo CXA-7B36 dia 19** (PERFEITO): BASE-BASE-SUPERPRIX08-SUPERPRIX04-BASE-BASE. Fez recarga entre lojas? Por que tem 2 BASE BENASSI seguidas no começo (00:07-04:21 e 04:22-05:12)?

11. **REGINA (Armazém do Grão)**: 4 lojas REGINA na escala (Barra do Imbuy, 1 de Maio, Lúcio Meira, Abastecedora Grão da Serra). No Unitrac aparece UMA parada GPS só. **É 1 caminhão entregando em 4 lojas físicas próximas, ou 1 loja só com cadastro consolidado?**

---

## 4. ALTERAÇÕES NÃO REGISTRADAS

12. **Caso BBH1C94 JOSUE dia 19**: escala diz Lojas 03/19/48 mas GPS prova que ele fez Loja 33 Humaitá (escalada para outro motorista que não tem GPS). **Houve troca? Quem ficou sabendo? Por onde a informação passa?**

13. **Mesmo dia 19, caso KWK4593 RODRIGO**: escala Lojas 38/07, GPS prova Loja 21 Flamengo. **Troca?**

14. **Tem como você me MOSTRAR o canal onde as alterações chegam?** WhatsApp, áudio, ligação? Posso construir uma forma de capturar tudo automaticamente.

---

## 5. PADRÕES DE PREENCHIMENTO DO KPI MANUAL

15. **GUANABARA dia 19**: 37 lojas no KPI manual, TODAS com timestamp '---/---/---'. **Por que ninguém preenche horário pra Guanabara?** O sistema atual considera '---' = OK pra Guanabara, mas quero confirmar que tá certo.

16. **Quando o operador preenche o KPI manual SEM ter GPS confirmando**: ele usa o horário que o caminhão deveria ter chegado, ou anota '---'?

17. **"SEM" no manual significa**:
    - (a) Veículo sem rastreador no dia
    - (b) Entrega não fez
    - (c) Outro?

18. **"NAO_FOI" significa "entrega não aconteceu" mas placa TEM GPS de outras lojas. Confirma?**

---

## 6. SOBRE OS DOIS RELATÓRIOS (XLSX e PDF)

19. **Por que vocês exportam às vezes em XLSX (relatorio_9391) e às vezes em PDF (relatorio_9572)?** São relatórios diferentes ou iguais?

20. **No PDF de hoje (dia 25, relatorio_9612), o nome de loja vem TRUNCADO** (ex: "CAXIAS CENTENÁRI O" com espaço). **Tem como exportar sempre em XLSX?** É mais limpo.

---

## TOP 5 PRIORITÁRIAS

1. **A maioria das diferenças vem porque o cadastro de geofences do Unitrac é fraco** — várias lojas não têm cadastro individual e caem em "ROTAS" gigantes. **Quem pode resolver isso?**

2. **Os 7 casos do dia 19 onde GPS contradiz a escala (placa fazendo outra rota)**: são trocas não registradas? Por onde as trocas chegam até vocês?

3. **GUANABARA com tudo '---' no manual**: padrão consciente ou ninguém faz?

4. **Lojas PRINCESA Niterói**: por que TODAS aparecem como `2018038 - ROTA NITERÓI/MARICÁ` no Unitrac? Sem cadastro individual?

5. **REGINA do Armazém Grão**: 4 lojas escala, 1 parada GPS. **É correto agrupar ou são lojas físicas distintas?**
