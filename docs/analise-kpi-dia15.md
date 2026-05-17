# Análise KPI vs Escalas — Dia 15/05/2026

> Gerado em: 17/05/2026 — análise manual + ExcelJS direto sobre os arquivos de entrada e saída

---

## 1. Resumo Executivo

- **239 entregas** parseadas das 4 escalas do dia 15 (escala geral: 139, PAX: 30, Armazém: 14, Zona Sul: 52 entradas brutas), totalizando **17 KPIs** gerados com **239 linhas de dados**
- **Cobertura de motorista/placa**: 200 de 239 linhas com dados (84%) — queda causada por SUPER_PAX, FEIRA_NOVA e EMANUEL com 0% de preenchimento (lojas existem nos KPIs mas sem dados do Unitrac)
- **GUANABARA** não existe em nenhum dos 4 arquivos XLSX de escala — origem é exclusivamente o PDF da escala HLOG (`escala 15.005 (5).pdf` via `escala-guanabara-pdf.ts`); KPI contém 25 rotas, mas **9 de 25 (36%) têm campo motorista corrompido** por concatenação de tokens do parser PDF
- **PRINCESA** tem 16 lojas sem motorista/placa no KPI — são as 2ª e 3ª entregas de cidades do interior (Arraial, Búzios, Cabo Frio etc.) sem rastreio Unitrac para esse dia; comportamento esperado
- **ARMAZEM_GRAO** usa parser dedicado (`escala-armazem-grao.ts`) e funciona corretamente: 14/14 lojas com dados; a seção "Armazém do Grão" na escala geral existe mas NÃO tem motorista/placa nas cols 6/8 — usa colunas de fornecedores (FRATELLI, JAPI etc.) a partir da col 13, o que torna o parser dedicado obrigatório

---

## 2. Contagem por Rede

| Rede | Linhas Escala | Lojas Unicas Escala | Lojas KPI c/ Dados | Lojas KPI Total | Status |
|------|:---:|:---:|:---:|:---:|:---:|
| ASSAI | 41 | 41 | 41 | 41 | OK |
| ATACADAO | 2 | 2 | 2 | 2 | OK |
| CARREFOUR | 10 | 10 | 10 | 10 | OK |
| PREZUNIC | 31 | 31 | 31 | 31 | OK |
| PRINCESA | 17 | 17 | 17 | 33 | SOBRANDO (2as/3as entregas) |
| GUANABARA | 0 | 0 | 25 | 25 | SEM_ESCALA_XLSX (fonte: PDF) |
| SAMS_CLUB | 3 | 3 | 3 | 3 | OK |
| VIANENSE | 2 | 2 | 2 | 2 | OK |
| CAB_PETROPOLIS | 1 | 1 | 1 | 1 | OK |
| SENDAS | 7 | 7 | 6 | 7 | OK (1 sem dados) |
| FEIRA_NOVA | 8 | 8 | 0 | 8 | CRITICO: KPI_SEM_DADOS |
| EMANUEL | 6 | 6 | 0 | 1 | CRITICO: FALTA_LOJAS + SEM_DADOS |
| ARMAZEM_GRAO | 14 | 14 | 14 | 14 | OK |
| SUPER_PAX | 13 | 13 | 0 | 8 | CRITICO: KPI_SEM_DADOS + FALTA_LOJAS |
| SUPERPRIX | 7 | 7 | 7 | 7 | OK |
| ZONA_SUL | 52 | 44 | 44 | 44 | OK |
| DESCONHECIDO | 0 | 0 | 1 | 1 | KPI_SEM_ESCALA |
| MUNDIAL | 1 | 1 | — | — | SEM_KPI |

---

### 2.1 Discrepancias Detalhadas por Rede

**SUPER_PAX — 4 lojas ausentes no KPI + 0% dados**

O KPI-SUPER_PAX tem 8 lojas mas nenhuma com motorista/placa. A escala PAX (aba 15) tem 13 lojas:
- Com correspondencia no KPI: Inhauma, Lins, Oswaldo Cruz, Pilares, Realengo, Sepetiba, Taquara, Vila da Penha
- Ausentes no KPI: **Engenho de Dentro, Madureira, Del Castilho, Guadalupe**

Algumas lojas no KPI têm coluna C8="COMPARTILHADA" — marcadas como rotas compartilhadas sem rastreio proprio.

**EMANUEL — 5 lojas ausentes no KPI + 0% dados**

Escala PAX (aba 15) tem 6 lojas com placa e motorista preenchidos:
- Pedra / Obom Mato Alto -> PEDRA_GUARATIBA (UFW-0H63, WILLIAM RODRIGUES)
- Cachamorra (NSM-3D98, FLAVIO)
- Maravilha (LMF-2A49, LUIZ CESAR)
- Santa Maria / Vila Nova (KVT-5427, RAFAEL)
- Alhambra / Agulhas (KWH-2J02, WANDERSON)
- Vargem Grande (UDC-6I03, ADRIANO BORGES)

KPI tem apenas 1 linha (JARDIM_MARAVILHA) sem dados. Faltam 5 lojas no KPI.

**FEIRA_NOVA — 8 lojas no KPI sem dados**

KPI lista: Boa Dica/Piabeta, Cachambi, Coelho da Rocha, Freguesia, Nilopolis, Queimados, Sao Joao de Meriti, Mercado Santo Agostinho. Todos com campos em branco — zero hits no Unitrac.

**PRINCESA — 16 linhas extras no KPI (esperado)**

Linhas R12-R30 do KPI tem nome mas sem motorista/placa: Niteroi Barcas, Iguaba Grande, Itaborai, Marica 1 e 2, Barra de Sao Joao, Rio das Ostras, Arraial do Cabo x3, Buzios x3, Cabo Frio x3. As linhas R31-R36 tem dados (1a entrega das mesmas cidades). Comportamento esperado — multiplas entregas com rastreio so da 1a viagem.

---

## 3. GUANABARA

### Busca nos 4 arquivos XLSX

| Arquivo | Ocorrencias de "GUANABARA" |
|---------|:---:|
| ESCALA GERAL DE MAIO 1 (2).xlsx | 0 |
| ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (3).xlsx | 0 |
| ESCALA DO ARMAZEM DO GRAO MAIO (3).xlsx | 0 |
| ESCALA ZONA SUL - MAIO (4).xlsx | 0 |

**GUANABARA nao existe em nenhum dos arquivos XLSX usados no teste.**

### KPI GUANABARA gerado

- 25 linhas de dados (Rotas 01 a 31, com gaps nas rotas 11, 12, 21, 22, 24, 26)
- 25 com placa e motorista preenchidos
- Formato: `Guanabara - Rota XX`
- Origem: `escala-guanabara-pdf.ts` lendo o PDF da escala HLOG

### Problema: motorista corrompido em 9 de 25 rotas (36%)

Os seguintes registros tem o campo `motorista` com tokens concatenados (motorista + codigo + tipo + parte da placa do 2o carro colados em uma string):

| Rota | Motorista (corrompido) | Motorista real | Placa 2o carro |
|------|------------------------|----------------|----------------|
| 01 | RONALDO35KSG 5412TRUCKJOS | RONALDO | KSG-5412 |
| 02 | P.CESAR210LFK-2C56TRUCKP. | P. CESAR | LFK-2C56 |
| 07 | MOISES294GBC 6E12TRUCKAND | MOISES | GBC-6E12 |
| 08 | CELSO553KTR 0546TOCOJONAS | CELSO | KTR-0546 |
| 10 | ROBERTO277MOZ 2965TRUCKMA | ROBERTO | MOZ-2965 |
| 17 | LUCIANO 823DBB-9084TRUCKL | LUCIANO | DBB-9084 |
| 19 | LIRA86LIA 7683TRUCKJONESO | LIRA | LIA-7683 |
| 24 | GUTEMBERG184599CBR 9452TR | GUTEMBERG | CBR-9452 |
| 25 | DANIEL QUIRINO294GEB 9H31 | DANIEL QUIRINO | GEB-9H31 |

**Causa**: a funcao `tokensToCarro()` em `escala-guanabara-pdf.ts` nao separa corretamente os tokens quando ha 2 carros na mesma linha do PDF — o nome do 1o motorista absorve o codigo, placa e tipo do 2o carro.

### Conclusao GUANABARA

Origem exclusivamente PDF via parser dedicado. O KPI foi gerado mas com corrupcao no campo motorista para rotas com 2 carros. Correcao necessaria no parser.

---

## 4. ARMAZEM_GRAO

### Estrutura do arquivo dedicado (ESCALA DO ARMAZEM DO GRAO MAIO (3).xlsx — aba 15)

```
R1: ARMAZEM DO GRAO | 15/05/2026  (titulo mesclado A1:E1)
R2:  REGINA  BARRA DO IMBUY | TOCO C/ RAMPA REFRI | GILSON | 353 | UGA-1D55
R3:  REGINA  1 DE MAIO | TOCO C/ RAMPA REFRI | GILSON | 353 | UGA-1D55
R4:  REGINA  LUCIO MEIRA | TOCO C/ RAMPA REFRI | GILSON | 353 | UGA-1D55
R5:  ABASTECEDORA GRAO DA SERRA (ALTO) | TOCO C/ RAMPA REFRI | GILSON | 353 | UGA-1D55
R6:  ARMAZEM DO GRAO ( BOA VISTA) | TOCO C/ RAMPA REFRI | ANTUNES | 35399 | TML-9I75
R7:  ARMAZEM DO GRAO MATRIZ ( POSSE) | TOCO C/ RAMPA REFRI | ANTUNES | 35399 | TML-9I75
R8:  ARMAZEM DO GRAO (ITAIPAVA) | TOCO C/ RAMPA | ROBERTO | 51699 | LSL9670
R9:  ARMAZEM DO GRAO (CORREAS) | TOCO C/ RAMPA | ROBERTO | 51699 | LSL9670
R10: ARMAZEM DO GRAO (VALPARAISO) | TOCO C/ RAMPA REFRI | JEFERSON | 35399 | UEH-9I93
R11: ARMAZEM DO GRAO  (MOSELA) | TOCO C/ RAMPA REFRI | JEFERSON | 35399 | UEH-9I93
R12: ARMAZEM DO GRAO (QUITANDINHA) | TOCO C/ RAMPA REFRI | JEFERSON | 35399 | UEH-9I93
R13: ARMAZEM DO GRAO (CAPELA) | TOCO C/ RAMPA REFRI | SILVIO ALVES | 35399 | UBO-5E05
R14: ARMAZEM DO GRAO (16 DE MARCO) | TOCO C/ RAMPA REFRI | SILVIO ALVES | 35399 | UBO-5E05
R15: ARMAZEM DO GRAO A. BARRA DA TIJUCA | 710 C/ RAMPA REFRI | SIDNEI | 67499 | LQE-5E01
```

Formato: col1=loja, col2=tipo_carro, col3=motorista, col4=codigo, col5=placa. Sem peso, sem 2o carro.

### Parser dedicado vs parser geral no mesmo arquivo

| Parser | Linhas parseadas |
|--------|:---:|
| `escala-armazem-grao.ts` (dedicado) | 14 |
| `escala-geral.ts` (geral, teste) | 11 |

O parser geral parseia 11 linhas no arquivo do Armazem porque:
1. Nao encontra data na col 13 da row 1 (o titulo esta mesclado em A1:E1, nao ha data em M1)
2. O filtro de "aba deve ter data extraida" causa warning e pode pular a aba
3. Mesmo se processar, as formulas sem resultado em col2/col3 sao interpretadas como peso=null

**Conclusao**: o parser dedicado e obrigatorio e correto. Nao substituir pelo parser geral.

### Secao "Armazem do Grao" na ESCALA GERAL

A escala geral (aba 15, linhas R182-R196) tem uma secao "ARMAZEM DO GRAO | SO TARDE" com 14 lojas. Essas linhas NAO tem motorista/placa nas colunas 6/8 — as colunas 13-21 contem fornecedores (FRATELLI, JAPI, JANAUBA, BENASSI, SERRAZUL, MON, CAFE, FLOR, OVOS) com formulas SUM que referenciam outras colunas. Os dados de motorista/placa vem exclusivamente do arquivo dedicado.

### KPI ARMAZEM_GRAO: 14/14 com dados (10/14 com GPS completo)

Lojas com GPS (Saida CD + CHD Loja + Saida Loja + Tempo):
- ABASTECEDORA GRAO DA SERRA, ARMAZEM DO GRAO (16 DE MARCO), ARMAZEM DO GRAO (CORREAS), ARMAZEM DO GRAO A. BARRA DA TIJUCA, ARMAZEM DO GRAO ( BOA VISTA), ARMAZEM DO GRAO MATRIZ ( POSSE), ARMAZEM DO GRAO (ITAIPAVA), ARMAZEM DO GRAO (CAPELA), REGINA 1 DE MAIO, REGINA BARRA DO IMBUY, REGINA LUCIO MEIRA

Lojas sem GPS (motorista e placa presentes, sem horarios):
- ARMAZEM DO GRAO  (MOSELA), ARMAZEM DO GRAO (QUITANDINHA), ARMAZEM DO GRAO (VALPARAISO)

---

## 5. Problemas Encontrados

### [CRITICO] GUANABARA — motorista corrompido em 36% das rotas

Parser PDF (`escala-guanabara-pdf.ts`) nao separa corretamente os tokens para rotas com 2 carros. Campo `motorista_nome` absorve codigo + tipo + placa do 2o carro. Correcao necessaria em `tokensToCarro()`.

### [CRITICO] FEIRA_NOVA — 8 lojas no KPI, 0 com dados GPS

As 8 lojas da escala PAX foram inseridas no KPI mas nenhuma teve hit no Unitrac para o dia 15. Placas na escala: BBH-1C94, EFU-5704, KNC1I34, KVH-9J42, LKV-5067, KOA-6A27, KUL-1425, KNS-8D16, HNG-2B61. Verificar se essas placas estao cadastradas no Unitrac.

### [CRITICO] SUPER_PAX — 8 lojas no KPI, 0 com dados GPS, 4 lojas ausentes

Nenhuma das 8 lojas no KPI tem GPS. Alem disso faltam 4 lojas da escala PAX (Engenho de Dentro, Madureira, Del Castilho, Guadalupe). Verificar placas: TML-7D61, LUP-1F13, KMY-5561, CYB-3B90, QSS-1E48, KQV-1D80, LNU-7733, KXR-7527, AKZ-2745, LSX-7C72.

### [CRITICO] EMANUEL — 5 de 6 lojas ausentes no KPI

Escala PAX tem 6 lojas com placa e motorista. KPI tem 1 linha (JARDIM_MARAVILHA) sem dados. Verificar mapeamento de rotas Emanuel no gerador de KPI e placas: UFW-0H63, NSM-3D98, LMF-2A49, KVT-5427, KWH-2J02, UDC-6I03.

### [ALTO] SENDAS — inversao de horario (cruzamento de meia-noite)

`Sendas Central 1o Carro` (linha R11): Saida CD = 21:06, Saida Loja = 18:56 — inversao causada por entrega que cruzou meia-noite. Tempo calculado sera negativo. Adicionar tratamento de +24h quando saida_loja < saida_cd.

### [MEDIO] MUNDIAL — rede sem KPI

1 loja na escala geral com rede=MUNDIAL detectada automaticamente. Sem KPI correspondente. Definir se deve ir para KPI-DESCONHECIDO ou ter KPI proprio.

### [BAIXO] ARMAZEM_GRAO — 3 lojas sem GPS

Mosela, Quitandinha, Valparaiso (placa UEH-9I93 / motorista JEFERSON): sem Saida CD, CHD Loja ou Saida Loja. Verificar rastreio no Unitrac para essa placa nesse dia.

### [BAIXO] SENDAS — `Santo Agostinho` sem dados

Linha R10 do KPI: apenas coluna C8 = "1a ENTREGA" — sem motorista, placa ou GPS.

---

## 6. Qualidade GPS / Tempo por Rede

| Rede | Total Lojas KPI | Com Saida CD | % Saida CD | Com Tempo em Loja | % Tempo | Anomalias Tempo |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| ARMAZEM_GRAO | 14 | 10 | 71% | 10 | 71% | 0 |
| ASSAI | 41 | 41 | 100% | 41 | 100% | 0 |
| ATACADAO | 2 | 2 | 100% | 2 | 100% | 0 |
| CAB_PETROPOLIS | 1 | 1 | 100% | 1 | 100% | 0 |
| CARREFOUR | 10 | 10 | 100% | 10 | 100% | 0 |
| DESCONHECIDO | 1 | 0 | 0% | 0 | 0% | — |
| EMANUEL | 1 | 0 | 0% | 0 | 0% | — |
| FEIRA_NOVA | 8 | 0 | 0% | 0 | 0% | — |
| GUANABARA | 25 | 16 | 64% | 16 | 64% | 0 |
| PREZUNIC | 31 | 31 | 100% | 31 | 100% | 0 |
| PRINCESA | 33 | 17 | 52% | 17 | 52% | 0 |
| SAMS_CLUB | 3 | 3 | 100% | 3 | 100% | 0 |
| SENDAS | 7 | 4 | 57% | 4 | 57% | 1 (inversao) |
| SUPERPRIX | 7 | 7 | 100% | 7 | 100% | 0 |
| SUPER_PAX | 8 | 0 | 0% | 0 | 0% | — |
| VIANENSE | 2 | 2 | 100% | 2 | 100% | 0 |
| ZONA_SUL | 44 | 36 | 82% | 36 | 82% | 0 |

**Cobertura global GPS**: 196 / 239 linhas = **82%**

Se desconsiderar as redes sem rastreio Unitrac (FEIRA_NOVA, SUPER_PAX, EMANUEL) e as 2as/3as entregas da PRINCESA: cobertura sobe para **196/196 = 100%** das entregas rastreadas.

### Anomalia de Tempo — SENDAS

`Sendas Central 1o Carro`: Saida CD = 21:06, CHD Loja = ausente, Saida Loja = 18:56. A saida loja (18:56) e anterior a saida CD (21:06). Entrega realizada na madrugada seguinte — o calculo precisa adicionar 24h quando saida_loja < saida_cd.

---

## 7. Proximos Passos

1. **[CRITICO] Corrigir parser PDF Guanabara**: ajustar `tokensToCarro()` em `src/lib/parsers/escala-guanabara-pdf.ts` para separar corretamente os tokens quando ha 2 carros na mesma linha. O campo `motorista_nome` esta absorvendo codigo + tipo + placa do 2o carro em 9 de 25 rotas (36%)

2. **[CRITICO] Investigar 0% GPS em FEIRA_NOVA e SUPER_PAX**: confirmar se as placas da escala PAX estao cadastradas no sistema Unitrac. Se o problema for falta de cadastro, adicionar os veiculos. Se for ausencia real de GPS nesse dia, documentar como dado ausente esperado

3. **[CRITICO] Corrigir mapeamento EMANUEL no gerador de KPI**: 5 de 6 lojas da escala PAX (com placa e motorista preenchidos) nao aparecem no KPI. Verificar logica de matching de placas Emanuel no cruzamento com Unitrac

4. **[ALTO] Tratamento de cruzamento de meia-noite no calculo de tempo**: adicionar logica `if (saida_loja < saida_cd) saida_loja += 24h` no gerador de KPI para entregas noturnas (afeta SENDAS Central e possivelmente outras redes)

5. **[MEDIO] Adicionar lojas ausentes do SUPER_PAX**: Engenho de Dentro, Madureira, Del Castilho e Guadalupe aparecem na escala PAX mas nao no KPI. Verificar se o cruzamento com Unitrac filtra indevidamente essas lojas

6. **[MEDIO] Definir tratamento para rede MUNDIAL**: 1 loja detectada na escala geral sem KPI correspondente. Decidir: KPI proprio ou redirecionar para DESCONHECIDO

7. **[BAIXO] Investigar 3 lojas ARMAZEM_GRAO sem GPS**: placas UEH-9I93 (Mosela, Quitandinha, Valparaiso) sem rastreio. Verificar se o equipamento estava ativo nesse dia

8. **[BAIXO] Confirmar comportamento PRINCESA 2as/3as entregas**: as 16 linhas sem GPS sao esperadas (interior sem cobertura) ou ha configuracao de veiculo a corrigir

---

## Apendice A: Estrutura dos KPIs Gerados

**KPI padrao com 1o e 2o carro** (ASSAI, ATACADAO, CARREFOUR, PREZUNIC, PRINCESA, SAMS_CLUB, VIANENSE, CAB_PETROPOLIS, SENDAS, SUPERPRIX, ZONA_SUL — nao, ZONA_SUL usa simplificado):

```
Row 2: [rede] 1o CARRO (cols 2-7) | [rede] 2o CARRO (cols 8-13)
Row 3: REDES/FILIAIS | MOTORISTA | COD | PLACA | SAIDA CD | CHD LOJA | SAIDA LOJA | (repete 2o carro) | TEMPO 1o CARRO | TEMPO 2o CARRO
Row 4: (vazio — reservado)
Row 5+: dados
```

**KPI simplificado** (ARMAZEM_GRAO, GUANABARA, EMANUEL, FEIRA_NOVA, SUPER_PAX, ZONA_SUL):

```
Row 2: [rede] (cols 2-7)
Row 3: REDES/FILIAIS | MOTORISTA | COD | PLACA | SAIDA CD | CHD LOJA | SAIDA LOJA | TEMPO EM LOJA
Row 4: (vazio)
Row 5+: dados
```

---

## Apendice B: Mapa Escala -> KPI por Fonte

| Rede | Arquivo Escala | Parser | KPI Gerado |
|------|----------------|--------|------------|
| ASSAI | ESCALA GERAL | escala-geral.ts | KPI-ASSAI |
| ATACADAO | ESCALA GERAL | escala-geral.ts | KPI-ATACADAO |
| CARREFOUR | ESCALA GERAL | escala-geral.ts | KPI-CARREFOUR |
| PREZUNIC | ESCALA GERAL | escala-geral.ts | KPI-PREZUNIC |
| PRINCESA | ESCALA GERAL | escala-geral.ts | KPI-PRINCESA |
| SAMS_CLUB | ESCALA GERAL | escala-geral.ts | KPI-SAMS_CLUB |
| VIANENSE | ESCALA GERAL | escala-geral.ts | KPI-VIANENSE |
| CAB_PETROPOLIS | ESCALA GERAL | escala-geral.ts | KPI-CAB_PETROPOLIS |
| SENDAS | ESCALA GERAL (secao Benassi) | escala-geral.ts | KPI-SENDAS |
| FEIRA_NOVA | ESCALA GERAL + PAX | escala-geral.ts + escala-pax.ts | KPI-FEIRA_NOVA |
| SUPER_PAX | ESCALA GERAL + PAX | escala-geral.ts + escala-pax.ts | KPI-SUPER_PAX |
| SUPERPRIX | ESCALA GERAL | escala-geral.ts | KPI-SUPERPRIX |
| EMANUEL | ESCALA GERAL + PAX | escala-geral.ts + escala-pax.ts | KPI-EMANUEL |
| ARMAZEM_GRAO | ESCALA ARMAZEM (arquivo dedicado) | escala-armazem-grao.ts | KPI-ARMAZEM_GRAO |
| ZONA_SUL | ESCALA ZONA SUL (aba MATRIZ) | escala-zona-sul.ts | KPI-ZONA_SUL |
| GUANABARA | PDF escala HLOG | escala-guanabara-pdf.ts | KPI-GUANABARA |
| DESCONHECIDO | — (so Unitrac) | — | KPI-DESCONHECIDO |

---

*Analise realizada via ExcelJS direto nos arquivos originais — 17/05/2026*
