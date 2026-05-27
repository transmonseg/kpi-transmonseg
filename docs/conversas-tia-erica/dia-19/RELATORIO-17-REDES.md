# Relatório KPI dia 19/05/2026 — análise manual das 17 redes

**Fonte de verdade:**
- Unitrac PDF: `docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf` (200 páginas, 207 veículos, 122 placas únicas na frota)
- Escalas: `docs/conversas-tia-erica/dia-25/escalas/*.xlsx` (ESCALA GERAL + ZS + Pax + Armazém Grão) + alterações 19.05
- KPIs sistema: `docs/conversas-tia-erica/dia-19/kpis-sistema-pos-fixes/KPI-*-2026-05-19*.xlsx`

**Método:** para cada linha da escala, conferi se a placa esteve em parada classificada `LOJA` no Unitrac (cod_loja igual ou via nome) e comparei chegada/saída/SaiCD com o gerado.

---

## Resumo global

| Rede | Linhas escala | OK | Bugs | Taxa |
|------|---------------|-----|------|------|
| 01. ARMAZEM_GRAO | 14 | 3 | 9-10 inventados | **21%** ❌ |
| 02. ASSAI | 40 | 35 | 3-4 inventados | **88%** |
| 03. ATACADAO | 2 | 1 | 1 suspeito geofence | ~50% |
| 04. CAB_PETROPOLIS | 1 | 0 | cadastro cod 7012010 ausente | **0%** ❌ |
| 05. CARREFOUR | 8 | 5 | 1 inventado + 2 geofence | **~75%** |
| 06. EMANUEL | 6 | (não validado em detalhe) | placas com REDE ECONOMIA, O BOM, etc | n/a |
| 07. FEIRA_NOVA | 13 | 12 | 1 geofence (EFU5704 Irajá) | **~92%** |
| 08. GUANABARA | 33 | 30 | 3 geofence (LBB/GVH/LIA) | **~90%** |
| 09. MUNDIAL | 1 | 1 (sem-rastre) | 0 | **100%** |
| 10. PRINCESA | 26 | 25 | 1 (LMF Niterói Barcas) | **96%** |
| 11. PREZUNIC | 58 | 52 | 4-5 geofence | **~90%** |
| 12. SAMS_CLUB | 3 | 3 (todos vazio, motoristas mudaram rota) | 0 | **100%** |
| 13. SENDAS | 9 | 5 | 4 cadastro/geofence | **~55%** |
| 14. SUPERCOMPRAS | 1 | 0 | cadastro cod 23080000 (Mercado Sto Agostinho vira COSMOS) | **0%** ❌ |
| 15. SUPER_PAX | 13 | 9 | 4 não-validáveis (placas fora do dump) | **~70%** |
| 16. SUPERPRIX | 9 | 8 | 1 SaiCD ERALDO suspeito (NATURCON como BASE) | **~95%** |
| 17. VIANENSE | 4 | 4 | 0 | **100%** |
| 18. ZONA_SUL | 55 | 40 | ~11 (geofence + loja errada + EXTRA F.31) | **~75%** |

**TOTAL geral aproximado:** ~233 OK / ~296 = **~79%**

---

## Detalhe por rede

### 01. ARMAZEM_GRAO ❌ 21%

| Loja | Placa | Manual (Unitrac) | Sistema | Veredicto |
|------|-------|------------------|---------|-----------|
| ITAIPAVA | LSL9670 | cod 5353003 14:09-14:18 | 12:39/14:09/14:18 | ✅ |
| CORREAS | LSL9670 | cod 5353006 14:28-14:47 | 12:39/14:28/14:47 | ✅ |
| BOA VISTA | TML9I75 | só PREZUNIC MARICÁ | vazio | ✅ (sem-pedido) |
| MATRIZ POSSE | TML9I75 | não foi | 14:15/17:19/17:57 | ❌ Inventou |
| ABASTECEDORA SERRA ALTO | TML6D96 | só REGINA BARRA DO IMBUY (14 paradas dia inteiro) | vazio/14:37/14:56 | ❌ Inventou (clonado) |
| REGINA 1 DE MAIO | TML6D96 | não foi | vazio/15:38/16:26 | ❌ Inventou (clonado) |
| REGINA BARRA IMBUY | TML6D96 | foi (dia inteiro) | vazio/15:05/15:27 | ⚠️ pegou 1 janela das 14 |
| REGINA LUCIO MEIRA | TML6D96 | não foi | vazio/14:20/14:27 | ❌ Inventou (clonado) |
| VALPARAÍSO/MOSELA/QUITANDINHA | QST4C52 | só BUZIOS (Princesa) | 3 linhas inventadas | ❌❌❌ |
| CAPELA/16 DE MARÇO | UDC6I03 | só CABO FRIO (Princesa) | 2 linhas inventadas | ❌❌ |
| BARRA DA TIJUCA | LQE5E01 | foi a ZS Laranjeiras (cod 9039030) | 10:04/11:09/12:25 | ❌ Inventou |

**Bug raiz:** clonagem de parada (matcher.ts:867 — fallback `scorePair < Infinity`).

---

### 02. ASSAI 88%

| Loja | Placa | Mot | OK? |
|------|-------|-----|-----|
| L35 Alcântara I | DBB8D19 PAULO HENRIQUE | DBB8D19 só ZS L31/L11. **NÃO foi Assaí** — sistema 05:11/06:36/09:13 | ❌ Inventou |
| L293 Alcântara II | FQN6J72 LUIZ CARLOS | sem LOJA. Sistema 05:33/06:46/10:27 | ❌ Inventou |
| L221 Araruama | KZU4C37 | cod 560049 ✅ | ✅ |
| L55 Bangu I | UBO5E01 JEFERSON | cod 560028 SENDAS BANGU LOJA 55 (mesmo lugar) ✅ | ✅ |
| L332 Bangu II | LMF2049 | sem LOJA, sistema vazio | ✅ |
| L133 Barra I | UBO5E01 FELIPE DIEGO | sistema vazio (mesmo motorista que Bangu I) | ✅ |
| L245 Barra II | SFG2F72 CELSO | cod 560042 às 09:51-09:56 ✅ | ✅ |
| L294 Boulevard | TML7D21 LUCIANO | cod 560056 ✅ | ✅ |
| L82 Cabo Frio | AWA6B40 JOSE | cod 560017 ✅ | ✅ |
| L37 Campinho | KXB6E57 RICARDO | sem LOJA. Sistema 05:59/06:23/08:23 | ❌ Inventou |
| L188 Campos | CZZ8H82 JUCA | cod 560036 ✅ | ✅ |
| L316 Carioca Shopping | QSW3B65 | cod 560048 ✅ | ✅ |
| L131 Caxias I | EZU9J51 ALLAN | cod 560018 ✅ | ✅ |
| L219 Caxias II | UBF5G36 YAGO/RODRIGO | cod 560057 ✅ | ✅ |
| L42 Ceasa | EZU9325 | sem LOJA, vazio | ✅ |
| L202 Cesário | GSK0G53 FÁBIO | cod 560039 ✅ | ✅ |
| L231 Cordovil | sem placa | vazio | ✅ |
| L28 Freguesia | AKZ2594 NILTON | cod 560019 ✅ | ✅ |
| L302 Galeão | CUC6J83 EDMARIO | cod 560051 ✅ | ✅ |
| L29 Ilha | UBF5G32 JOSE M | cod 560020 ✅ | ✅ |
| L232 Macaé | KZJ0E14 RODRIGO | cod 560041 ✅ | ✅ |
| L286 Maracanã | GAR0802 CRISTIANO | sem LOJA, vazio | ✅ |
| L65 Mendanha | LFJ8442 ANTÔNIO | cod 560016 ✅ | ✅ |
| L142 Mesquita | SFG2F73 FLAVIANO | cod 560035 ✅ | ✅ |
| L160 Méier | AKZ2745 LUIZ JR | cod 560031 ✅ | ✅ |
| L36 Nilópolis | LOT2962 JOAO C | cod 560023 ✅ | ✅ |
| L41 Niterói | UBF5G33 BRUNO | cod 560025 ✅ | ✅ |
| L292 Niterói Ponte | LAU1I64 | sem-rastre ✅ | ✅ |
| L30 Nova Iguaçu | LSL9670 ROBERTO | cod 560021 ✅ | ✅ |
| L291 Nova Iguaçu 2 | AFY7J99 WANDERLEY | cod 560054 ✅ | ✅ |
| L181 Petrópolis | KMZ7057 | cod 560038 ✅ | ✅ |
| L128 Pilares | CEJ3426 ADRIANO | sem LOJA, sistema 06:07/13:22 | ❌ Inventou |
| L136 Sabão | LKA3935 EDVALDO | sem LOJA, vazio | ✅ |
| L201 Santa Cruz | KGO5E65 FERNANDO | sem-rastre ✅ | ✅ |
| L338 Santa Cruz 2 | LNG7110 ANTÔNIO F | cod 560060 ✅ | ✅ |
| L211 SG Camil | AMW3424 MESSIAS | sem-rastre ✅ | ✅ |
| L266 SG Centro | KRK3D12 JOSÉLIO | cod 560047 ✅ | ✅ |
| L217 SJM | EAC4D65 MILTON | cod 560040 ✅ | ✅ |
| L340 Taquara | UBO0B68 WALTER | cod 560062 ✅ | ✅ |
| L150 Tijuca II | DDI6J90 VALDIR | cod 560043 ✅ | ✅ |
| L248 Tribobó | LON7G98 FÁBIO DEUSETI | sem LOJA, vazio | ✅ |

**3 bugs:** L35 (DBB8D19 sem essa loja), L293 (FQN6J72 sem LOJA), L37 (KXB6E57), L128 (CEJ3426).

**Nota:** ASSAI usa codigos `560xxx` que são os mesmos do SENDAS — porque vários Assaí ficam em "boxes" de Sendas no mesmo terreno (Bangu, Macaé, etc). Isso pode estar gerando confusão no matcher.

---

### 03. ATACADAO ~50%

| Loja | Placa | Manual | Sistema | OK? |
|------|-------|--------|---------|-----|
| Belford Roxo | UBF5G34 RODRIGO | sem-rastre ✅ | SEM-RASTRE | ✅ |
| Manilha | QSS1E48 LUCIANO M | sem LOJA (só BASE/FORA_BASE) | 04:47/06:21/10:17 | ❌ Geofence |

---

### 04. CAB_PETROPOLIS ❌ 0%

| Loja | Placa | Manual | Sistema | OK? |
|------|-------|--------|---------|-----|
| CAB - PETRÓPOLIS | KNS8D26 ZOZIMO | **cod 7012010 — 11 paradas LOJA o dia INTEIRO** | vazio | ❌ **Cadastro:** cod 7012010 não está cadastrado como CAB Petrópolis |

---

### 05. CARREFOUR ~75%

| Loja | Placa | Manual | Sistema | OK? |
|------|-------|--------|---------|-----|
| Alcântara | LSE1D35 | cod 9006012 ✅ | 05:29/06:59/07:45 | ✅ |
| Barra | KMY5561 | cod 9006001 ✅ | 04:57/05:50/07:19 | ✅ |
| Brigadeiro | QSU6I54 | cod 9006144 ✅ | 04:34/04:55/07:14 | ✅ |
| Campo Grande (Simão) | LSN6I72 | só EMANUEL VARGEM GRANDE dia inteiro | vazio/04:48/05:21 | ❌ Inventou |
| Campo Grande (Renan) | KRW8E86 | cod 9006154 ✅ | 05:38/06:23/07:05 | ✅ |
| Norte Shopping | LJS2B72 | sem LOJA, só FORA_BASE | 05:29/05:56/06:37 | ⚠️ Geofence |
| Sulacap | TJQ6J26 | sem LOJA, só FORA_BASE | 05:55/06:18/07:16 | ⚠️ Geofence |
| Washington Luiz | AMF0325 | cod 9006010 ✅ | 05:15/05:36/08:08 | ✅ |

---

### 06. EMANUEL (não validado em detalhe)

Os 6 motoristas têm placas que ficaram em **clientes outros** o dia inteiro (REDE ECONOMIA SANTA MARIA, O BOM ATACADISTA, EMANUEL CACHAMORRA). Sem manual da Tia Erica, taxa difícil de medir.

---

### 07. FEIRA_NOVA ~92%

| Loja | Placa | Manual | Sistema | OK? |
|------|-------|--------|---------|-----|
| L1 Olinda | KUL1425 SIDNEY | cod 579001 ✅ | 13:41/14:28/15:01 | ✅ |
| L10 Cachambi | KVH9J42 MARCIO | cod 579010 ✅ | 13:43/14:07/14:54 | ✅ |
| L11 Boa Dica | KNS8D26 ZOZIMO | cod 579011 ✅ | 13:41/14:42/15:20 | ✅ |
| L12 Freguesia | KPB5I95 JOSE | cod 579012 ✅ | 13:47/14:30/15:24 | ✅ |
| L13 Todos Santos | LKV5067 DANIEL | cod 579013 ✅ | 13:43/14:11/15:08 | ✅ |
| L3 Anchieta | BBH1C94 JOSUE | cod 579003 ✅ | 12:14/12:43/13:52 | ✅ |
| L4 Irajá | EFU5704 WILLIAM | sem LOJA | 13:43/13:52/15:15 | ❌ Geofence |
| L7 C.Rocha | KOA6A27 JOSE H | cod 579007 ✅ | 13:40/13:59/14:26 | ✅ |
| L8 Cerâmica | QSU6I54 MARCIO | cod 579008 ✅ | 13:46/14:57/15:50 | ✅ |
| L9 Queimados | TML5I70 ADRIANO | cod 579009 ✅ | 13:33/14:41/15:36 | ✅ |
| ANCHIETA 2º | KNC1834 MARCELO | sem-rastre ✅ | SEM-RASTRE | ✅ |
| Mercado Santo Agostinho | EYL8B91 RAFAEL | cod 23080000 ✅ | vazio/04:38/05:16 | ✅ |
| SANTA CRUZ | LSX7C72 ANDRE | cod 579006 ✅ | 13:45/14:18/15:22 | ✅ |

---

### 08. GUANABARA ~90%

| Loja | Placa | Manual | Sistema | OK? |
|------|-------|--------|---------|-----|
| BANGU F5 | KSP8814 | cod 71005 ✅ | 10:01/10:42/11:59 | ✅ |
| BARRA F7 (1°) | GBC6E12 | cod 71032 ✅ | 07:07/08:20/10:41 | ✅ |
| BARRA F7 (2°) | KST0246 | cod 71032 ✅ | 08:05/09:50/10:58 | ✅ |
| BENTO RIBEIRO F15 | LBB5205 | sem LOJA | 10:03/10:32/12:48 | ❌ Geofence |
| BONSUCESSO F30 | GVH0163 | sem LOJA | 10:02/10:45/11:54 | ❌ Geofence |
| CAMPINHO F17 | DBB9084 | sem LOJA, vazio | vazio | ✅ |
| CAMPO GRANDE F11 | KNI8942 | sem-rastre | SEM-RASTRE | ✅ |
| CAMPO GRANDE F26 (1°) | CDM8645 | cod 71035 ✅ | 06:34/08:55/10:14 | ✅ |
| CAMPO GRANDE F26 (2°) | EBG2D13 JONESON | sem LOJA | 09:53/11:09/12:04 | ❌ Geofence |
| CATONHO F31 | LFI1467 | sem-rastre | SEM-RASTRE | ✅ |
| CAXIAS F18 | GVH1397 | sem-rastre | SEM-RASTRE | ✅ |
| DEL CASTILHO F23 | KTP4F70 | cod 71023 ✅ | 10:03/10:29/11:29 | ✅ |
| ENG DENTRO F1 (1°) | KSG5412 | sem-rastre | SEM-RASTRE | ✅ |
| ENG DENTRO F1 (2°) | KVG7A00 | cod 71001 ✅ | 09:51/10:54/12:35 | ✅ |
| IRAJA F9 (1°+2°) | LIF3965 | sem-rastre | SEM-RASTRE | ✅✅ |
| ITAGUAI F6 | LGX1J41 | sem-rastre | SEM-RASTRE | ✅ |
| NITEROI F8 (1°) | KTR0546 | cod 71008 ✅ | 07:14/09:20/10:07 | ✅ |
| NITEROI F8 (2°) | LKF7A79 | cod 71008 ✅ | 10:11/11:23/12:44 | ✅ |
| NOVA IGUAÇU F16 (1°) | KNB0752 | cod 71016 ✅ | 08:37/09:13/10:14 | ✅ |
| NOVA IGUAÇU F16 (2°) | LGT1200 | sem-rastre | SEM-RASTRE | ✅ |
| PACIENCIA F20 | LHE3473 | sem-rastre | SEM-RASTRE | ✅ |
| PADRE MIGUEL F14 | LFA4744 | sem LOJA, vazio | vazio | ✅ |
| PENHA F2 (1°+2°) | LFK2C56 | cod 71002 ✅ | 07:04/07:40/08:45 + 10:13/11:47/11:50 | ✅✅ |
| PIEDADE F3 | KNI8988 | sem-rastre | SEM-RASTRE | ✅ |
| REALENGO F4 | LBL5907 | cod 71004 ✅ | 10:11/11:01/12:39 | ✅ |
| RECREIO F27 (1°) | GEB9H31 | cod 71039 ✅ | 07:08/08:29/10:11 | ✅ |
| RECREIO F27 (2°) | KPE3776 | sem LOJA, vazio | vazio | ✅ |
| RIO PRATA F13 | KRA1083 | cod 71013 ✅ | 10:06/10:51/12:01 | ✅ |
| SANTA CRUZ F28 | KTR6724 | sem LOJA, vazio | vazio | ✅ |
| SAO JOAO F29 | KTZ2055 | sem LOJA, vazio | vazio | ✅ |
| TANQUE F19 | LIA7683 | sem LOJA | 09:56/10:50/12:14 | ❌ Geofence |
| TIJUCA F25 | CBR9452 | sem-rastre | SEM-RASTRE | ✅ |
| VILA ISABEL F10 | GUE0D63 | sem-rastre | SEM-RASTRE | ✅ |

---

### 09. MUNDIAL 100%

| Loja | Placa | Manual | Sistema | OK? |
|------|-------|--------|---------|-----|
| MUNDIAL | CDL8E52 | sem-rastre | SEM-RASTRE | ✅ |

---

### 10. PRINCESA 96%

(detalhado nas mensagens anteriores) — 25/26 OK, único bug: LMF2049 Niterói Barcas inventado via geofence em parada FORA_BASE.

---

### 11. PREZUNIC ~90%

(detalhado anteriormente) — 52/58 OK; 4-5 bugs por geofence: KNC1I34 Jardim Oceanico/Marapendi (placa sem LOJA), HNG2B61 Botafogo SA (FAKE_EXIT em FORA_BASE), KOP4978 Cidade de Deus (placa só foi a Campinho+MegaBox).

---

### 12. SAMS_CLUB 100%

| Loja | Placa | Manual | Sistema | OK? |
|------|-------|--------|---------|-----|
| Barra (Senna) | NSM6D98 FLÁVIO | só PREZUNIC MEIER | vazio | ✅ (mudou rota) |
| Linha Amarela | LAF0697 FÁBIO | só PREZUNIC NILÓPOLIS | vazio | ✅ |
| Niterói | KPB5I95 JOSE R | só PREZUNIC FREGUESIA + FN | vazio | ✅ |

---

### 13. SENDAS ~55%

| Loja | Placa | Manual | Sistema | OK? |
|------|-------|--------|---------|-----|
| Americanas | LKV5067 JOSÉ C | só PREZUNIC PENHA/OLARIA + FN | vazio | ✅ |
| Armazém Grão Central | KPH8C41 EDUARDO | sem-rastre | SEM-RASTRE | ✅ |
| Atlantico Sul | LTH4J15 MÁRCIO | cod 22144002 **PETIT ATLANTICO SUL** (cadastrado como SENDAS?) | 04:25/05:58/06:23 | ⚠️ Cadastro |
| Barra Tower | LTH4J15 | cod 22980000 **EMPORIO BARRA TOWER** | 04:25/05:10/05:47 | ⚠️ Cadastro |
| Barramares | LTH4J15 | cod 22144000 **PETIT MARCHE BARRAMARES** | 04:25/06:28/07:01 | ⚠️ Cadastro |
| Mercado de Santa | LMF2049 LUIZ CESAR | sem LOJA, vazio | vazio | ✅ |
| Mercearia Sachinho | KXA5966 SANDRO | cod 15247000 ✅ | 10:52/11:42/12:25 | ✅ |
| Santo Agostinho | NSM6D98 FLÁVIO | só PREZUNIC MEIER | 04:40/04:44 (4min) | ❌ Geofence |
| Sendas Central 1º Carro | KRB2J76 NELSON | cod 13156084 **MATRIZ CD DUQUE** dia inteiro | vazio/00:04/10:25 (10h26 na loja!) | ⚠️ Consolidação extrema |

**Investigar:** lojas LTH4J15 — cods 22144000, 22144002, 22980000 são **PETIT/EMPORIO** no Unitrac, mas estão atribuídos a SENDAS. Pode ser que sejam mesmo lugar com nome diferente (PETIT é a marca premium do Sendas/Carrefour). Cadastro pode estar ok ou não.

---

### 14. SUPERCOMPRAS ❌ 0%

| Loja | Placa | Manual | Sistema | OK? |
|------|-------|--------|---------|-----|
| SUPERCOMPRAS COSMOS | EYL8B91 RAFAEL S | **cod 23080000 MERCADO SANTO AGOSTINHO BARRA TIJUCA** (não é COSMOS!) | 05:16/08:05/08:32 | ❌ Cadastro: cod 23080000 atribuído a COSMOS no banco |

---

### 15. SUPER_PAX ~70%

| Loja | Placa | Manual | Sistema | OK? |
|------|-------|--------|---------|-----|
| Del Castilho | QSZ9A20 DANIEL | cod 202004 ✅ | 14:22/15:13/15:58 | ✅ |
| Engenho Dentro | LOU9928 SERGIO | cod 202001 ✅ | 14:22/14:57/15:50 | ✅ |
| Guadalupe | AKZ2745 LUIZ | cod 202005 ✅ | 14:20/15:03/15:20 | ✅ |
| Inhauma | UBF7F79 SILVIO | sem-rastre? (esperava UBG7F79) | SEM-RASTRE | ⚠️ |
| Lins 2º | QSY2H32 DENIS | placa fora do dump | 14:20/15:31/16:33 | ⚠️ não validado |
| Lins | LUP1F13 CARLOS | sem-rastre | SEM-RASTRE | ✅ |
| Madureira | GAJ6H51 ESTELITA | cod 202006 ✅ | 14:32/16:48/17:13 | ✅ |
| Oswaldo Cruz | GAJ6H51 ESTELITA | cod 202000 ✅ | 14:32/15:01/16:42 | ✅ |
| Pilares | KXR7F27 MARCIO | cod 202009 ✅ | 14:42/15:00/15:27 | ✅ |
| Realengo | KMY5561 LUIZ | cod 202002 ✅ | 14:13/15:10/15:33 | ✅ |
| Sepetiba | TML7D21 DENNIS A | TML7D21 só SENDAS BOULEVARD (TML7D61 foi a Sepetiba) | vazio | ✅ |
| Taquara | EZU9J51 ALLAN | cod 202011 ✅ | 14:41/15:30/16:06 | ✅ |
| Vila da Penha | LNU7H38 FELIPE | placa fora do dump | 14:21/14:49/15:38 | ⚠️ não validado |

---

### 16. SUPERPRIX ~95%

(detalhado anteriormente) — 8/9 OK. Único suspeito: ERALDO TML7D61 SaiCD=05:12 vem de NATURCON (cod 25414000) cadastrado como BASE.

---

### 17. VIANENSE 100%

| Loja | Placa | Manual | Sistema | OK? |
|------|-------|--------|---------|-----|
| Recreio 1º | TML3B11 JOSE R | só PREZUNIC TIJUCA | vazio | ✅ |
| Freguesia 2º | TML3B11 | vazio | vazio | ✅ |
| Nova Iguaçu 1º | LTH4J15 MÁRCIO | cod 11623028 ✅ | 10:03/11:14/11:32 | ✅ |
| Jardim Alvorada 2º | LTH4J15 | cod 11623032 ✅ | 10:03/11:43/12:00 | ✅ |

---

### 18. ZONA_SUL ~75%

(detalhado anteriormente) — 40/55 OK; 11 bugs: geofence em paradas FORA_BASE (L01/L09 LJS2172, L14 UBO5E05, L22/L25 EBG2D13, L30/L47 LQE5401), loja errada da mesma rede (L07 RODRIGO era L21, L48 BBH1C94 era L33), EXTRA F.31 (DBB8D19 inventou parada 09:55), MEGA BOX 1/2 (KOP4978 não atribuído mesmo tendo cods 6018000/6018001).

---

## Bugs raiz consolidados

### 🔴 Bug 1 — Clonagem de parada (matcher.ts:867)
**Plano:** trocar `scorePair(linha, p) < Infinity` por `scorePair(linha, p) === 0`.

**Cobre:** ARMAZEM_GRAO (REGINA → 4 lojas), QST4C52 / UDC6I03 (Princesa Buzios/CaboFrio → 5 lojas Armazém), ASSAI Alcântara, ZS L07/L48.

### 🔴 Bug 2 — Geofence aceita FORA_BASE
**Plano:** em `findLojaIdParaParada` Priority 4 (matcher.ts:635-644), exigir `parada.classificacao === 'LOJA'` antes de aplicar haversine. Paradas `FORA_BASE`/`FAKE_EXIT` não devem ganhar loja só por proximidade.

**Cobre:** PRINCESA LMF Niterói Barcas, PREZUNIC KNC/HNG, CARREFOUR LJS/TJQ, ATACADAO QSS, ZS L01/L09/L14/L22/L25/L30/L47, GUANABARA LBB/GVH/LIA, FEIRA_NOVA EFU5704, ASSAI KXB/CEJ.

### 🔴 Bug 3 — Cadastro de lojas faltante / errado
**Plano:** seed/update no banco `lojas`.

- `7012010` deve estar como CAB Petrópolis (atualmente sem cadastro? CAB)
- `23080000` MERCADO SANTO AGOSTINHO BARRA — está cadastrado como SUPERCOMPRAS COSMOS (errado)
- Verificar PETIT/EMPORIO cods 22144000/22144002/22980000 — SENDAS ou independente?
- NATURCON cod 25414000 — cadastrado como BASE? Deveria ser LOJA-cliente

### 🟡 Bug 4 — saída_cd fallback do MCP (mcp/server.ts:521-531)
Sobrescreve SaiCD=null com a chegada na 1ª parada operacional → SaiCD impossível.
**Plano:** remover esse bloco.

---

## Próximo passo recomendado

Aplicar **Bug 1 + Bug 2 + Bug 4** num só commit no `matcher.ts`/`mcp/server.ts`, regenerar todos os KPIs dia 19 e re-rodar essa mesma comparação. Estimativa pós-fix:

| Rede | Antes | Depois |
|------|-------|--------|
| ARMAZEM_GRAO | 21% | ~85% |
| ZONA_SUL | 75% | ~92% |
| SENDAS | 55% | ~75% |
| CARREFOUR | 75% | ~92% |
| ATACADAO | 50% | ~95% |
| PREZUNIC | 90% | ~96% |
| GUANABARA | 90% | ~96% |
| Demais | já ≥95% | ≥97% |

**Total esperado:** ~93%.

CAB_PETROPOLIS e SUPERCOMPRAS exigem **fix de cadastro no banco**, não de código.
