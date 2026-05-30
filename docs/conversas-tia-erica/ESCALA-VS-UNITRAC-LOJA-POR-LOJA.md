# Lojas da escala × Unitrac — status loja por loja

## Sumário por rede

| ARMAZEM_GRAO | 7 | 5 | 1 | 0 | 1 | 0 | 1 | 15 |
| ASSAI | 8 | 6 | 8 | 1 | 1 | 4 | 13 | 41 |
| ATACADAO | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 2 |
| CAB_PETROPOLIS | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| CARREFOUR | 5 | 3 | 0 | 0 | 0 | 1 | 1 | 10 |
| DESCONHECIDO | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 |
| EMANUEL | 2 | 0 | 1 | 0 | 2 | 2 | 2 | 9 |
| FEIRA_NOVA | 3 | 3 | 1 | 1 | 0 | 3 | 5 | 16 |
| GUANABARA | 13 | 2 | 2 | 2 | 8 | 0 | 0 | 27 |
| MUNDIAL | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 |
| PREZUNIC | 35 | 10 | 8 | 0 | 1 | 0 | 3 | 57 |
| PRINCESA | 10 | 10 | 0 | 0 | 0 | 0 | 6 | 26 |
| SAMS_CLUB | 2 | 0 | 1 | 0 | 0 | 0 | 0 | 3 |
| SENDAS | 0 | 4 | 1 | 0 | 1 | 2 | 1 | 9 |
| SUPERCOMPRAS | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 |
| SUPERPRIX | 5 | 2 | 0 | 0 | 0 | 0 | 2 | 9 |
| SUPER_PAX | 3 | 4 | 1 | 0 | 0 | 2 | 3 | 13 |
| VIANENSE | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 4 |
| ZONA_SUL | 17 | 3 | 11 | 2 | 7 | 0 | 7 | 47 |
| Rede | ✅ | 🟢 | ⚪ | ⚫ | 🟡 | 🔴 | 🟠 | Total |
|------|---|---|---|---|---|---|---|-------|
# Lojas da escala × Unitrac — status loja por loja

Análise loja por loja em cada escala dos 3 dias (19/20/25).

Legenda:
- ✅ **CERTO** — parada LOJA com cod cadastrado, GPS bate
- 🟢 **OK_VIA_GEO** — sem cod no Unitrac, mas GPS bate na coord do cadastro (T22 pega)
- ⚪ **SEM_PARADA** — placa rastreada mas não parou no cadastro dessa loja
- ⚫ **SEM_RASTRE** — placa escalada não apareceu no Unitrac
- 🟡 **SEM_CADASTRO** — loja na escala mas não cadastrada no banco
- 🔴 **ERRADO_BASE** — cadastro com lat/lng em cima da BASE Benassi (Unitrac errado)
- 🟠 **SOBREPOSTO** — cadastro no mesmo ponto de outra rede (Unitrac errado)

## ARMAZEM_GRAO — 12/15 certos (80%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| ARMAZEM DO GRÃO  (MOSELA) | ✅ CERTO | 3 | 2 paradas LOJA cod=5353007 (GPS médio 43m) |
| ARMAZEM DO GRÃO (CAPELA) | ✅ CERTO | 3 | 2 paradas LOJA cod=5353005 (GPS médio 137m) |
| ARMAZEM DO GRAO (CORREAS) | ✅ CERTO | 1 | 3 paradas LOJA cod=5353006 (GPS médio 3m) |
| ARMAZEM DO GRÃO (ITAIPAVA) | ✅ CERTO | 1 | 3 paradas LOJA cod=5353003 (GPS médio 6m) |
| ARMAZEM DO GRÃO (VALPARAÍSO) | ✅ CERTO | 3 | 2 paradas LOJA cod=5353004 (GPS médio 173m) |
| ARMAZEM DO GRAO A. BARRA DA TIJUCA | ✅ CERTO | 1 | 3 paradas LOJA cod=5353011 (GPS médio 24m) |
| REGINA  BARRA DO IMBUY | ✅ CERTO | 3 | 40 paradas LOJA cod=5353012 (GPS médio 26954m) |
| ABASTECEDORA GRÃO DA SERRA (ALTO) | 🟢 OK_VIA_GEO | 3 | 3 paradas no raio (sem cod) — T22 pega |
| ARMAZEM DO GRAO (16 DE MARÇO) | 🟢 OK_VIA_GEO | 3 | 4 paradas no raio (sem cod) — T22 pega |
| ARMAZÉM DO GRÃO MATRIZ ( POSSE) | 🟢 OK_VIA_GEO | 3 | 2 paradas no raio (sem cod) — T22 pega |
| REGINA  1 DE MAIO | 🟢 OK_VIA_GEO | 3 | 3 paradas no raio (sem cod) — T22 pega |
| REGINA  LUCIO MEIRA | 🟢 OK_VIA_GEO | 3 | 80 paradas no raio (sem cod) — T22 pega |
| ARMAZÉM DO GRÃO ( BOA VISTA) | ⚪ SEM_PARADA | 3 | placa rastreada mas sem parada na coord da loja |
| Armazem do grão - Central | 🟡 SEM_CADASTRO | 1 | loja não cadastrada no banco |
| ARMAZEM DO GRÃO (QUITANDINHA) | 🟠 SOBREPOSTO | 3 | cadastro no mesmo ponto de outra rede |

## ASSAI — 14/41 certos (34%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| Assaí - Barra I (Senna) - Loja 133 | ✅ CERTO | 2 | 2 paradas LOJA cod=560032 (GPS médio 2m) |
| Assaí - Boulevard (Vila Isabel) - Loja 294 | ✅ CERTO | 1 | 3 paradas LOJA cod=560056 (GPS médio 19m) |
| Assaí - Cordovil - Loja 231 | ✅ CERTO | 2 | 1 paradas LOJA cod=560046 (GPS médio 0m) |
| Assaí - Galeão - Loja 302 | ✅ CERTO | 2 | 4 paradas LOJA cod=560051 (GPS médio 39m) |
| Assaí - Santa Cruz - Loja 201 | ✅ CERTO | 2 | 14 paradas LOJA cod=560037 (GPS médio 69m) |
| Assaí - São João do Meriti  - Loja 217 | ✅ CERTO | 2 | 8 paradas LOJA cod=560040 (GPS médio 69m) |
| Assaí - Taquara   - Loja 340 | ✅ CERTO | 1 | 3 paradas LOJA cod=560062 (GPS médio 47m) |
| Assaí - Tijuca II  - Loja 150 | ✅ CERTO | 2 | 6 paradas LOJA cod=560043 (GPS médio 56m) |
| Assaí - Alcântara II - Loja 293 | 🟢 OK_VIA_GEO | 1 | 8 paradas no raio (sem cod) — T22 pega |
| Assaí - Araruama - Loja 221 | 🟢 OK_VIA_GEO | 1 | 1 paradas no raio (sem cod) — T22 pega |
| Assaí - Campos dos Goytacazes- Loja 188 | 🟢 OK_VIA_GEO | 1 | 3 paradas no raio (sem cod) — T22 pega |
| Assaí - Caxias I - Loja 131 | 🟢 OK_VIA_GEO | 2 | 4 paradas no raio (sem cod) — T22 pega |
| Assaí - São Gonçalo Centro - Loja 266 | 🟢 OK_VIA_GEO | 2 | 3 paradas no raio (sem cod) — T22 pega |
| Assaí - Tribobó - Loja 248 | 🟢 OK_VIA_GEO | 1 | 2 paradas no raio (sem cod) — T22 pega |
| Assaí - Alcântara I - Loja 35 | ⚪ SEM_PARADA | 3 | placa rastreada mas sem parada na coord da loja |
| Assaí - Bangu I - Loja 55 | ⚪ SEM_PARADA | 3 | placa rastreada mas sem parada na coord da loja |
| Assaí - Bangu II - Loja 332 | ⚪ SEM_PARADA | 2 | placa rastreada mas sem parada na coord da loja |
| Assaí - Barra II  - Loja 245 | ⚪ SEM_PARADA | 2 | placa rastreada mas sem parada na coord da loja |
| Assaí - Maracanã - Loja 286 | ⚪ SEM_PARADA | 1 | placa rastreada mas sem parada na coord da loja |
| Assaí - Mendanha (Campo Grande) - Loja 65 | ⚪ SEM_PARADA | 3 | placa rastreada mas sem parada na coord da loja |
| Assaí - Petrópolis- Loja 181 | ⚪ SEM_PARADA | 2 | placa rastreada mas sem parada na coord da loja |
| Assaí - Santa Cruz 2 - Loja 338 | ⚪ SEM_PARADA | 2 | placa rastreada mas sem parada na coord da loja |
| Assaí - São Gonçalo Camil - Loja 211 | ⚫ SEM_RASTRE | 1 | nenhuma placa escalada apareceu no Unitrac |
| Assaí - Sabão Rio (Benfica) - Loja 136 | 🟡 SEM_CADASTRO | 3 | loja não cadastrada no banco |
| Assaí - Campinho - Loja 37 | 🔴 ERRADO_BASE | 2 | cadastro a 1335m da BASE Benassi |
| Assaí - Ceasa - Loja 42 | 🔴 ERRADO_BASE | 1 | cadastro a 277m da BASE Benassi |
| Assaí - Mesquita (Dutra) - Loja 142 | 🔴 ERRADO_BASE | 3 | cadastro a 120m da BASE Benassi |
| Assaí - Nova Iguaçu - Loja 30 | 🔴 ERRADO_BASE | 3 | cadastro a 489m da BASE Benassi |
| Assaí - Cabo Frio - Loja 82 | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |
| Assaí - Carioca Shopping - Loja 316 | 🟠 SOBREPOSTO | 2 | cadastro no mesmo ponto de outra rede |
| Assaí - Caxias II (Parque Fluminense) - Loja 219 | 🟠 SOBREPOSTO | 2 | cadastro no mesmo ponto de outra rede |
| Assaí - Cesário de Melo - Loja 202 | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |
| Assaí - Freguesia - Loja 28 | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |
| AssaÍ - Ilha do Governador - Loja 29 | 🟠 SOBREPOSTO | 2 | cadastro no mesmo ponto de outra rede |
| Assaí - Macaé - Loja 232 | 🟠 SOBREPOSTO | 2 | cadastro no mesmo ponto de outra rede |
| Assaí - Méier - Loja 160 | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |
| Assaí - Nilópolis - Loja 36 | 🟠 SOBREPOSTO | 3 | cadastro no mesmo ponto de outra rede |
| Assaí - Niterói - Loja 41 | 🟠 SOBREPOSTO | 2 | cadastro no mesmo ponto de outra rede |
| Assaí - Niterói Ponte - Loja 292 | 🟠 SOBREPOSTO | 2 | cadastro no mesmo ponto de outra rede |
| Assaí - Nova Iguaçu 2 - Loja 291 | 🟠 SOBREPOSTO | 3 | cadastro no mesmo ponto de outra rede |
| Assaí - Pilares - Loja 128 | 🟠 SOBREPOSTO | 2 | cadastro no mesmo ponto de outra rede |

## ATACADAO — 2/2 certos (100%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| Atacadão - Belford Roxo | ✅ CERTO | 3 | 2 paradas LOJA cod=23843003 (GPS médio 41m) |
| Atacadão - Manilha | 🟢 OK_VIA_GEO | 1 | 6 paradas no raio (sem cod) — T22 pega |

## CAB_PETROPOLIS — 1/1 certos (100%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| CAB - PETRÓPOLIS | ✅ CERTO | 1 | 37 paradas LOJA cod=7012010 (GPS médio 16949m) |

## CARREFOUR — 8/10 certos (80%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| Carrefour - Alcântara | ✅ CERTO | 3 | 2 paradas LOJA cod=9006012 (GPS médio 28m) |
| Carrefour - Campo Grande | ✅ CERTO | 2 | 3 paradas LOJA cod=9006154 (GPS médio 1m) |
| Carrefour - Campos dos Goytacazes | ✅ CERTO | 1 | 1 paradas LOJA cod=9006158 (GPS médio 30m) |
| Carrefour - Macaé | ✅ CERTO | 1 | 2 paradas LOJA cod=9006159 (GPS médio 25m) |
| Carrefour - Sulacap | ✅ CERTO | 3 | 4 paradas LOJA cod=9006007 (GPS médio 83m) |
| Carrefour - Brigadeiro (Caxias) | 🟢 OK_VIA_GEO | 3 | 3 paradas no raio (sem cod) — T22 pega |
| Carrefour - Juiz de Fora | 🟢 OK_VIA_GEO | 1 | 2 paradas no raio (sem cod) — T22 pega |
| Carrefour - Norte Shopping | 🟢 OK_VIA_GEO | 1 | 4 paradas no raio (sem cod) — T22 pega |
| Carrefour - Washington Luiz | 🔴 ERRADO_BASE | 1 | cadastro a 274m da BASE Benassi |
| Carrefour - Barra da Tijuca | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |

## DESCONHECIDO — 0/1 certos (0%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| GPA | 🟡 SEM_CADASTRO | 2 | loja não cadastrada no banco |

## EMANUEL — 2/9 certos (22%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| SANTA_MARIA | ✅ CERTO | 1 | 20 paradas LOJA cod=25140000 (GPS médio 16186m) |
| VARGEM_GRANDE | ✅ CERTO | 2 | 23 paradas LOJA cod=17659003 (GPS médio 12406m) |
| ALHAMBRA | ⚪ SEM_PARADA | 1 | placa rastreada mas sem parada na coord da loja |
| AGULHAS_NEGRAS | 🟡 SEM_CADASTRO | 0 | loja não cadastrada no banco |
| VILA_NOVA | 🟡 SEM_CADASTRO | 0 | loja não cadastrada no banco |
| Alhambra / Cachamorra | 🔴 ERRADO_BASE | 1 | cadastro a 108m da BASE Benassi |
| PEDRA_GUARATIBA | 🔴 ERRADO_BASE | 1 | cadastro a 119m da BASE Benassi |
| CACHAMORRA | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |
| JARDIM_MARAVILHA | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |

## FEIRA_NOVA — 6/16 certos (38%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| 11- Boa Dica (Piabetá) | ✅ CERTO | 2 | 3 paradas LOJA cod=579011 (GPS médio 30m) |
| 7- C.ROCHA | ✅ CERTO | 1 | 2 paradas LOJA cod=579007 (GPS médio 32m) |
| SANTA CRUZ | ✅ CERTO | 1 | 3 paradas LOJA cod=579006 (GPS médio 53m) |
| 10- Cachambi | 🟢 OK_VIA_GEO | 1 | 1 paradas no raio (sem cod) — T22 pega |
| 7- Coelho da Rocha | 🟢 OK_VIA_GEO | 1 | 6 paradas no raio (sem cod) — T22 pega |
| 8- Cerâmica | 🟢 OK_VIA_GEO | 2 | 2 paradas no raio (sem cod) — T22 pega |
| 6- Santa Cruz da Serra | ⚪ SEM_PARADA | 2 | placa rastreada mas sem parada na coord da loja |
| ANCHIETA - 2º CARRO | ⚫ SEM_RASTRE | 1 | nenhuma placa escalada apareceu no Unitrac |
| 4- Irajá | 🔴 ERRADO_BASE | 1 | cadastro a 1451m da BASE Benassi |
| 4- Irajá - 2ª VIAGEM | 🔴 ERRADO_BASE | 1 | cadastro a 1451m da BASE Benassi |
| 9- Queimados | 🔴 ERRADO_BASE | 2 | cadastro a 214m da BASE Benassi |
| 1- Nilopolis (Olinda) | 🟠 SOBREPOSTO | 3 | cadastro no mesmo ponto de outra rede |
| 12- Freguesia | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |
| 13- Todos os Santos | 🟠 SOBREPOSTO | 2 | cadastro no mesmo ponto de outra rede |
| 3- Anchieta | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |
| Mercado Santo Agostinho (Barra) | 🟠 SOBREPOSTO | 3 | cadastro no mesmo ponto de outra rede |

## GUANABARA — 15/27 certos (56%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| GB BANGU FILIAL 5 | ✅ CERTO | 1 | 2 paradas LOJA cod=71005 (GPS médio 28m) |
| GB BARRA FILIAL 7 | ✅ CERTO | 2 | 11 paradas LOJA cod=71032 (GPS médio 41m) |
| GB CAMPO GRANDE FILIAL 26 | ✅ CERTO | 2 | 1 paradas LOJA cod=71035 (GPS médio 89m) |
| GB DEL CASTILHO FILIAL 23 | ✅ CERTO | 1 | 4 paradas LOJA cod=71023 (GPS médio 8m) |
| GB ENG DE DENTRO FILIAL 1 | ✅ CERTO | 2 | 2 paradas LOJA cod=71001 (GPS médio 32m) |
| GB ITAGUAI FILIAL 6 | ✅ CERTO | 1 | 1 paradas LOJA cod=71006 (GPS médio 0m) |
| GB NITEROI FILIAL 8 | ✅ CERTO | 2 | 8 paradas LOJA cod=71008 (GPS médio 49m) |
| GB NOVA IGUACU FILIAL 16 | ✅ CERTO | 2 | 2 paradas LOJA cod=71016 (GPS médio 54m) |
| GB PENHA FILIAL 2 | ✅ CERTO | 1 | 4 paradas LOJA cod=71002 (GPS médio 29m) |
| GB REALENGO FILIAL 4 | ✅ CERTO | 1 | 3 paradas LOJA cod=71004 (GPS médio 13m) |
| GB RECREIO FILIAL 27 | ✅ CERTO | 2 | 4 paradas LOJA cod=71039 (GPS médio 33m) |
| GB RIO DA PRATA FILIAL 13 | ✅ CERTO | 1 | 4 paradas LOJA cod=71013 (GPS médio 45m) |
| GB SAO JOAO FILIAL 29 | ✅ CERTO | 1 | 2 paradas LOJA cod=71029 (GPS médio 55m) |
| GB BENTO RIBEIRO FILIAL 15 | 🟢 OK_VIA_GEO | 1 | 8 paradas no raio (sem cod) — T22 pega |
| GB BONSUCESSO FILIAL 30 | 🟢 OK_VIA_GEO | 1 | 2 paradas no raio (sem cod) — T22 pega |
| GB CAMPO GRANDE FILIAL 11 | ⚪ SEM_PARADA | 2 | placa rastreada mas sem parada na coord da loja |
| GB SANTA CRUZ FILIAL 28 | ⚪ SEM_PARADA | 1 | placa rastreada mas sem parada na coord da loja |
| GB TANQUE FILIAL 19 | ⚫ SEM_RASTRE | 1 | nenhuma placa escalada apareceu no Unitrac |
| GB TIJUCA FILIAL 25 | ⚫ SEM_RASTRE | 1 | nenhuma placa escalada apareceu no Unitrac |
| GB CAMPINHO FILIAL 17 | 🟡 SEM_CADASTRO | 1 | loja não cadastrada no banco |
| GB CATONHO FILIAL 31 | 🟡 SEM_CADASTRO | 1 | loja não cadastrada no banco |
| GB CAXIAS FILIAL 18 | 🟡 SEM_CADASTRO | 1 | loja não cadastrada no banco |
| GB IRAJA FILIAL 9 | 🟡 SEM_CADASTRO | 1 | loja não cadastrada no banco |
| GB PACIENCIA FILIAL 20 | 🟡 SEM_CADASTRO | 1 | loja não cadastrada no banco |
| GB PADRE MIGUEL FILIAL 14 | 🟡 SEM_CADASTRO | 1 | loja não cadastrada no banco |
| GB PIEDADE FILIAL 3 | 🟡 SEM_CADASTRO | 1 | loja não cadastrada no banco |
| GB VILA ISABEL FILIAL 10 | 🟡 SEM_CADASTRO | 1 | loja não cadastrada no banco |

## MUNDIAL — 0/1 certos (0%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| MUNDIAL | 🟡 SEM_CADASTRO | 1 | loja não cadastrada no banco |

## PREZUNIC — 45/57 certos (79%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| Prezunic - Benfica | ✅ CERTO | 3 | 2 paradas LOJA cod=7000706 (GPS médio 49m) |
| Prezunic - Cachambi | ✅ CERTO | 1 | 3 paradas LOJA cod=7000724 (GPS médio 82m) |
| Prezunic - Campinho | ✅ CERTO | 3 | 4 paradas LOJA cod=7000718 (GPS médio 42m) |
| Prezunic - Campo Grande / Serra Azul | ✅ CERTO | 3 | 3 paradas LOJA cod=7000710 (GPS médio 10m) |
| Prezunic - Catumbi / Serra Azul | ✅ CERTO | 1 | 3 paradas LOJA cod=7000704 (GPS médio 14m) |
| Prezunic - Caxias Centenário | ✅ CERTO | 2 | 2 paradas LOJA cod=7000713 (GPS médio 38m) |
| Prezunic - Caxias Centro / Serra Azul | ✅ CERTO | 2 | 1 paradas LOJA cod=7000717 (GPS médio 15m) |
| Prezunic - Cidade de Deus | ✅ CERTO | 3 | 3 paradas LOJA cod=7000716 (GPS médio 58m) |
| Prezunic - Engenho Novo | ✅ CERTO | 3 | 2 paradas LOJA cod=7000708 (GPS médio 13m) |
| Prezunic - Fonseca | ✅ CERTO | 1 | 3 paradas LOJA cod=7000722 (GPS médio 87m) |
| Prezunic - Freguesia | ✅ CERTO | 1 | 3 paradas LOJA cod=7000707 (GPS médio 7m) |
| Prezunic - Icaraí | ✅ CERTO | 1 | 4 paradas LOJA cod=7000730 (GPS médio 79m) |
| Prezunic - Itaoca | ✅ CERTO | 1 | 5 paradas LOJA cod=7000720 (GPS médio 48m) |
| Prezunic - Jauru / Serra Azul | ✅ CERTO | 2 | 1 paradas LOJA cod=7000711 (GPS médio 0m) |
| Prezunic - Méier / Serra Azul | ✅ CERTO | 3 | 4 paradas LOJA cod=7000729 (GPS médio 45m) |
| Prezunic - Nilópolis | ✅ CERTO | 2 | 3 paradas LOJA cod=7000721 (GPS médio 27m) |
| Prezunic - Olaria | ✅ CERTO | 2 | 2 paradas LOJA cod=7000714 (GPS médio 12m) |
| Prezunic - Padre Miguel | ✅ CERTO | 2 | 2 paradas LOJA cod=7000726 (GPS médio 6m) |
| Prezunic - Pechincha | ✅ CERTO | 2 | 4 paradas LOJA cod=7000709 (GPS médio 29m) |
| Prezunic - Penha | ✅ CERTO | 2 | 2 paradas LOJA cod=7000723 (GPS médio 9m) |
| Prezunic - Realengo/ Serra Azul | ✅ CERTO | 1 | 3 paradas LOJA cod=7000712 (GPS médio 10m) |
| Prezunic - Santa Cruz / Serra Azul | ✅ CERTO | 1 | 6 paradas LOJA cod=7000733 (GPS médio 53m) |
| Prezunic - Senador Camará | ✅ CERTO | 1 | 6 paradas LOJA cod=7000705 (GPS médio 43m) |
| Prezunic - Taquara / Serra Azul | ✅ CERTO | 2 | 1 paradas LOJA cod=7000719 (GPS médio 0m) |
| Prezunic - Vila Isabel | ✅ CERTO | 3 | 3 paradas LOJA cod=7000748 (GPS médio 29m) |
| Prezunic - Vilar dos Teles | ✅ CERTO | 1 | 3 paradas LOJA cod=7000725 (GPS médio 16m) |
| Prezunic - Vista Alegre | ✅ CERTO | 1 | 3 paradas LOJA cod=7000715 (GPS médio 5m) |
| Prezunic SPID - Alpha Mall | ✅ CERTO | 1 | 1 paradas LOJA cod=7000740 (GPS médio 0m) |
| Prezunic SPID - Barra | ✅ CERTO | 1 | 2 paradas LOJA cod=7000734 (GPS médio 29m) |
| Prezunic SPID - Carioca | ✅ CERTO | 1 | 1 paradas LOJA cod=7000744 (GPS médio 0m) |
| Prezunic SPID - Copacabana | ✅ CERTO | 1 | 1 paradas LOJA cod=7000756 (GPS médio 0m) |
| Prezunic SPID - Farme de Amoedo | ✅ CERTO | 1 | 1 paradas LOJA cod=7000745 (GPS médio 0m) |
| Prezunic SPID - Glória | ✅ CERTO | 1 | 1 paradas LOJA cod=7000754 (GPS médio 0m) |
| Prezunic SPID - Santa Rosa (Niterói) | ✅ CERTO | 1 | 1 paradas LOJA cod=7000759 (GPS médio 50m) |
| Prezunic SPID - Visconde de Pirajá (Ipanema) | ✅ CERTO | 1 | 1 paradas LOJA cod=7000758 (GPS médio 0m) |
| Prezunic - Anil (Jacarepaguá) | 🟢 OK_VIA_GEO | 1 | 3 paradas no raio (sem cod) — T22 pega |
| Prezunic - Barra da Tijuca | 🟢 OK_VIA_GEO | 2 | 3 paradas no raio (sem cod) — T22 pega |
| Prezunic - Botafogo (Voluntários) | 🟢 OK_VIA_GEO | 2 | 3 paradas no raio (sem cod) — T22 pega |
| Prezunic - Ilha do Governador | 🟢 OK_VIA_GEO | 2 | 12 paradas no raio (sem cod) — T22 pega |
| Prezunic - Jardim Oceanico | 🟢 OK_VIA_GEO | 1 | 3 paradas no raio (sem cod) — T22 pega |
| Prezunic - Laranjeiras | 🟢 OK_VIA_GEO | 1 | 3 paradas no raio (sem cod) — T22 pega |
| Prezunic - Recreio dos Bandeirantes | 🟢 OK_VIA_GEO | 2 | 6 paradas no raio (sem cod) — T22 pega |
| Prezunic SPID - Meier | 🟢 OK_VIA_GEO | 1 | 1 paradas no raio (sem cod) — T22 pega |
| Prezunic SPID - Recreio | 🟢 OK_VIA_GEO | 1 | 1 paradas no raio (sem cod) — T22 pega |
| Prezunic SPID - Vila Isabel | 🟢 OK_VIA_GEO | 1 | 1 paradas no raio (sem cod) — T22 pega |
| Prezunic - Barra Marapendi | ⚪ SEM_PARADA | 1 | placa rastreada mas sem parada na coord da loja |
| Prezunic - Botafogo / Serra Azul | ⚪ SEM_PARADA | 3 | placa rastreada mas sem parada na coord da loja |
| Prezunic - Campo Grande (TINGUI) | ⚪ SEM_PARADA | 1 | placa rastreada mas sem parada na coord da loja |
| Prezunic SPID - Botafogo | ⚪ SEM_PARADA | 1 | placa rastreada mas sem parada na coord da loja |
| Prezunic SPID - Centro | ⚪ SEM_PARADA | 1 | placa rastreada mas sem parada na coord da loja |
| Prezunic SPID - Freguesia | ⚪ SEM_PARADA | 1 | placa rastreada mas sem parada na coord da loja |
| Prezunic SPID - Jacarepagua | ⚪ SEM_PARADA | 1 | placa rastreada mas sem parada na coord da loja |
| Prezunic SPID - Parque das Rosas | ⚪ SEM_PARADA | 1 | placa rastreada mas sem parada na coord da loja |
| Prezunic - Depósito Central | 🟡 SEM_CADASTRO | 1 | loja não cadastrada no banco |
| Prezunic - Maricá | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |
| Prezunic - Tijuca | 🟠 SOBREPOSTO | 2 | cadastro no mesmo ponto de outra rede |
| Prezunic SPID - Tijuca | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |

## PRINCESA — 20/26 certos (77%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| Princesa - Barra de São João (1ª Entrega) | ✅ CERTO | 1 | 4 paradas LOJA cod=8590562 (GPS médio 23m) |
| Princesa - Cabo Frio 1 (1ª Entrega) | ✅ CERTO | 2 | 3 paradas LOJA cod=8590565 (GPS médio 32m) |
| Princesa - Cabo Frio 2 (3ª Entrega) | ✅ CERTO | 2 | 3 paradas LOJA cod=8590565 (GPS médio 32m) |
| Princesa - Cabo Frio 3 (2ª Entrega) | ✅ CERTO | 2 | 3 paradas LOJA cod=8590565 (GPS médio 32m) |
| Princesa - Cosme Velho | ✅ CERTO | 2 | 4 paradas LOJA cod=8590000 (GPS médio 25m) |
| Princesa - Fonseca | ✅ CERTO | 1 | 3 paradas LOJA cod=8590555 (GPS médio 7m) |
| Princesa - Inga | ✅ CERTO | 1 | 3 paradas LOJA cod=8590556 (GPS médio 6m) |
| Princesa - Itaboraí (2ª Entrega) | ✅ CERTO | 2 | 2 paradas LOJA cod=8590573 (GPS médio 15m) |
| Princesa - Pechincha | ✅ CERTO | 1 | 3 paradas LOJA cod=8590031 (GPS médio 12m) |
| Princesa - Rio das Ostras (2ª Entrega) | ✅ CERTO | 1 | 3 paradas LOJA cod=8590568 (GPS médio 28m) |
| Princesa - Arraial 1 (1ª Entrega) | 🟢 OK_VIA_GEO | 1 | 5 paradas no raio (sem cod) — T22 pega |
| Princesa - Arraial 2 (2ª Entrega) | 🟢 OK_VIA_GEO | 1 | 5 paradas no raio (sem cod) — T22 pega |
| Princesa - Arraial 3 (3ª Entrega) | 🟢 OK_VIA_GEO | 1 | 5 paradas no raio (sem cod) — T22 pega |
| Princesa - Buzios 1 (2ª Entrega) | 🟢 OK_VIA_GEO | 2 | 7 paradas no raio (sem cod) — T22 pega |
| Princesa - Buzios 2 (3ª Entrega) | 🟢 OK_VIA_GEO | 2 | 7 paradas no raio (sem cod) — T22 pega |
| Princesa - Buzios 3 (1ª Entrega) | 🟢 OK_VIA_GEO | 2 | 7 paradas no raio (sem cod) — T22 pega |
| Princesa - Iguaba (1º Entrega) | 🟢 OK_VIA_GEO | 2 | 4 paradas no raio (sem cod) — T22 pega |
| Princesa - Maricá 1 (2ª Entrega) | 🟢 OK_VIA_GEO | 2 | 7 paradas no raio (sem cod) — T22 pega |
| Princesa - Maricá 2 (1ª Entrega) | 🟢 OK_VIA_GEO | 2 | 7 paradas no raio (sem cod) — T22 pega |
| Princesa - Niteroí Barcas | 🟢 OK_VIA_GEO | 1 | 4 paradas no raio (sem cod) — T22 pega |
| Princesa - Catete | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |
| Princesa - Copacabana | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |
| Princesa - Flamengo | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |
| Princesa - Icaraí | 🟠 SOBREPOSTO | 2 | cadastro no mesmo ponto de outra rede |
| Princesa - Laranjeiras | 🟠 SOBREPOSTO | 2 | cadastro no mesmo ponto de outra rede |
| Princesa - Leme | 🟠 SOBREPOSTO | 2 | cadastro no mesmo ponto de outra rede |

## SAMS_CLUB — 2/3 certos (67%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| Sam's - Linha Amarela | ✅ CERTO | 1 | 1 paradas LOJA cod=4568002 (GPS médio 0m) |
| Sam's - Niterói | ✅ CERTO | 1 | 1 paradas LOJA cod=4568001 (GPS médio 0m) |
| Sam's - Barra (Ayrton Senna) | ⚪ SEM_PARADA | 1 | placa rastreada mas sem parada na coord da loja |

## SENDAS — 4/9 certos (44%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| Atlantico Sul (Barra da Tijuca) | 🟢 OK_VIA_GEO | 1 | 3 paradas no raio (sem cod) — T22 pega |
| Barra Tower | 🟢 OK_VIA_GEO | 1 | 3 paradas no raio (sem cod) — T22 pega |
| Barramares (Barra da Tijuca) | 🟢 OK_VIA_GEO | 1 | 3 paradas no raio (sem cod) — T22 pega |
| Mercearia Sachinho (Vargem Grande) | 🟢 OK_VIA_GEO | 1 | 1 paradas no raio (sem cod) — T22 pega |
| Mercado de Santa | ⚪ SEM_PARADA | 1 | placa rastreada mas sem parada na coord da loja |
| Santo Agostinho | 🟡 SEM_CADASTRO | 1 | loja não cadastrada no banco |
| Armazem do grão - Central | 🔴 ERRADO_BASE | 1 | cadastro a 102m da BASE Benassi |
| Sendas Central 1º Carro | 🔴 ERRADO_BASE | 1 | cadastro a 102m da BASE Benassi |
| Americanas | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |

## SUPERCOMPRAS — 0/1 certos (0%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| SUPERCOMPRAS - COSMOS | 🟡 SEM_CADASTRO | 2 | loja não cadastrada no banco |

## SUPERPRIX — 7/9 certos (78%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| Super Prix - Icaraí - Loja 10 - 2° ENTREGA | ✅ CERTO | 1 | 3 paradas LOJA cod=3030011 (GPS médio 74m) |
| Super Prix - Tijuca  (2° °ENTREGA) Loja 14 | ✅ CERTO | 1 | 3 paradas LOJA cod=3030014 (GPS médio 15m) |
| Super Prix -Grajaú  VERDUN Loja 04 2°ENTREGA | ✅ CERTO | 1 | 5 paradas LOJA cod=3030004 (GPS médio 42m) |
| Super Prix -Grajaú -  Loja 08 - 1°° ENTREGA | ✅ CERTO | 1 | 3 paradas LOJA cod=3030008 (GPS médio 13m) |
| Super Prix -Riachuelo Loja 07 | ✅ CERTO | 1 | 4 paradas LOJA cod=3030007 (GPS médio 11m) |
| Super Prix - Ipanema - Loja 201 | 🟢 OK_VIA_GEO | 1 | 5 paradas no raio (sem cod) — T22 pega |
| Super Prix - Niterói - Loja 13 - 1° ENTREGA | 🟢 OK_VIA_GEO | 1 | 3 paradas no raio (sem cod) — T22 pega |
| Super Prix - Barra - Loja 202 | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |
| Super Prix -Tijuquinha (1° ENTREGA)  Loja 13 | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |

## SUPER_PAX — 7/13 certos (54%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| Lins | ✅ CERTO | 3 | 2 paradas LOJA cod=202013 (GPS médio 55m) |
| LINS 2º CARRO | ✅ CERTO | 1 | 1 paradas LOJA cod=202013 (GPS médio 0m) |
| Vila da Penha | ✅ CERTO | 3 | 4 paradas LOJA cod=202010 (GPS médio 68m) |
| INHAUMA | 🟢 OK_VIA_GEO | 2 | 5 paradas no raio (sem cod) — T22 pega |
| Madureira | 🟢 OK_VIA_GEO | 3 | 5 paradas no raio (sem cod) — T22 pega |
| Oswaldo Cruz | 🟢 OK_VIA_GEO | 3 | 3 paradas no raio (sem cod) — T22 pega |
| Pilares | 🟢 OK_VIA_GEO | 2 | 2 paradas no raio (sem cod) — T22 pega |
| Del Castilho | ⚪ SEM_PARADA | 2 | placa rastreada mas sem parada na coord da loja |
| Realengo | 🔴 ERRADO_BASE | 1 | cadastro a 1404m da BASE Benassi |
| Sepetiba | 🔴 ERRADO_BASE | 3 | cadastro a 371m da BASE Benassi |
| Engenho de Dentro | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |
| Guadalupe | 🟠 SOBREPOSTO | 1 | cadastro no mesmo ponto de outra rede |
| Taquara | 🟠 SOBREPOSTO | 3 | cadastro no mesmo ponto de outra rede |

## VIANENSE — 4/4 certos (100%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| Vianense - Jardim Alvorada 2º entrega | ✅ CERTO | 1 | 3 paradas LOJA cod=11623032 (GPS médio 9m) |
| Vianense - Nova Iguaçu 1º entrega | ✅ CERTO | 1 | 4 paradas LOJA cod=11623028 (GPS médio 28m) |
| Vianense - Freguesia 2º entrega | 🟢 OK_VIA_GEO | 2 | 1 paradas no raio (sem cod) — T22 pega |
| Vianense - Recreio 1º entrega | 🟢 OK_VIA_GEO | 2 | 2 paradas no raio (sem cod) — T22 pega |

## ZONA_SUL — 20/47 certos (43%)

| Loja na escala | Status | Placas | Observação |
|----------------|--------|--------|------------|
| MEGA BOX 01 - Olaria | ✅ CERTO | 7 | 2 paradas LOJA cod=6018000 (GPS médio 114m) |
| Zona Sul Loja 04 - Copacabana II | ✅ CERTO | 2 | 3 paradas LOJA cod=9039004 (GPS médio 39m) |
| Zona Sul Loja 05 - Copacabana III | ✅ CERTO | 3 | 1 paradas LOJA cod=9039005 (GPS médio 0m) |
| Zona Sul Loja 07 - Leblon | ✅ CERTO | 4 | 4 paradas LOJA cod=9039007 (GPS médio 46m) |
| Zona Sul Loja 09 - Ipanema | ✅ CERTO | 3 | 2 paradas LOJA cod=9039009 (GPS médio 9m) |
| Zona Sul Loja 10 - Recreio | ✅ CERTO | 3 | 2 paradas LOJA cod=9039010 (GPS médio 20m) |
| Zona Sul Loja 11 - Leblon | ✅ CERTO | 3 | 8 paradas LOJA cod=9039011 (GPS médio 63m) |
| Zona Sul Loja 12 - Leme | ✅ CERTO | 3 | 2 paradas LOJA cod=9039012 (GPS médio 32m) |
| Zona Sul Loja 17 - Barra | ✅ CERTO | 4 | 2 paradas LOJA cod=9039017 (GPS médio 10m) |
| Zona Sul Loja 18 - Copacabana | ✅ CERTO | 1 | 2 paradas LOJA cod=9039018 (GPS médio 44m) |
| Zona Sul Loja 22 - S. Conrado | ✅ CERTO | 3 | 1 paradas LOJA cod=9039022 (GPS médio 0m) |
| Zona Sul Loja 25 - Jd. Botânico | ✅ CERTO | 4 | 3 paradas LOJA cod=9039099 (GPS médio 37m) |
| Zona Sul Loja 35 - Barra | ✅ CERTO | 3 | 1 paradas LOJA cod=9039107 (GPS médio 9m) |
| Zona Sul Loja 36 - Botafogo | ✅ CERTO | 3 | 2 paradas LOJA cod=9039108 (GPS médio 25m) |
| Zona Sul Loja 42 - Botafogo | ✅ CERTO | 2 | 1 paradas LOJA cod=9039116 (GPS médio 0m) |
| Zona Sul Loja 46 - Botafogo | ✅ CERTO | 3 | 4 paradas LOJA cod=9039122 (GPS médio 53m) |
| Zona Sul Loja 47 | ✅ CERTO | 4 | 35 paradas LOJA cod=9039124 (GPS médio 10744m) |
| Zona Sul Loja 14 - Leblon | 🟢 OK_VIA_GEO | 3 | 2 paradas no raio (sem cod) — T22 pega |
| Zona Sul Loja 15 - Leblon | 🟢 OK_VIA_GEO | 2 | 2 paradas no raio (sem cod) — T22 pega |
| Zona Sul Loja 28 - Urca | 🟢 OK_VIA_GEO | 4 | 3 paradas no raio (sem cod) — T22 pega |
| MEGA BOX 02 - Olaria | ⚪ SEM_PARADA | 6 | placa rastreada mas sem parada na coord da loja |
| Zona Sul Loja 03 - Copacabana I | ⚪ SEM_PARADA | 3 | placa rastreada mas sem parada na coord da loja |
| Zona Sul Loja 06 - Gávea | ⚪ SEM_PARADA | 3 | placa rastreada mas sem parada na coord da loja |
| Zona Sul Loja 08 - Ipanema | ⚪ SEM_PARADA | 5 | placa rastreada mas sem parada na coord da loja |
| Zona Sul Loja 20 - Botafogo | ⚪ SEM_PARADA | 3 | placa rastreada mas sem parada na coord da loja |
| Zona Sul Loja 23 - Barra | ⚪ SEM_PARADA | 4 | placa rastreada mas sem parada na coord da loja |
| Zona Sul Loja 26 - Copacabana | ⚪ SEM_PARADA | 4 | placa rastreada mas sem parada na coord da loja |
| Zona Sul Loja 27 - Ipanema | ⚪ SEM_PARADA | 1 | placa rastreada mas sem parada na coord da loja |
| Zona Sul Loja 29 - Flamengo | ⚪ SEM_PARADA | 3 | placa rastreada mas sem parada na coord da loja |
| Zona Sul Loja 31 - Jd. Botânico | ⚪ SEM_PARADA | 5 | placa rastreada mas sem parada na coord da loja |
| Zona Sul Loja 43 - Barra (Península) | ⚪ SEM_PARADA | 3 | placa rastreada mas sem parada na coord da loja |
| Zona Sul Loja 01 - Ipanema | ⚫ SEM_RASTRE | 2 | nenhuma placa escalada apareceu no Unitrac |
| Zona Sul Loja 30 - Laranjeiras | ⚫ SEM_RASTRE | 1 | nenhuma placa escalada apareceu no Unitrac |
| EXTRA F.31 | 🟡 SEM_CADASTRO | 1 | loja não cadastrada no banco |
| Zona Sul - Entrega Extra | 🟡 SEM_CADASTRO | 2 | loja não cadastrada no banco |
| Zona Sul Loja 1129 - Olaria | 🟡 SEM_CADASTRO | 3 | loja não cadastrada no banco |
| Zona Sul Loja 13 - Angra | 🟡 SEM_CADASTRO | 1 | cadastro sem lat/lng |
| Zona Sul Loja 21 - Flamengo | 🟡 SEM_CADASTRO | 3 | cadastro sem lat/lng |
| Zona Sul Loja 33 - Humaitá | 🟡 SEM_CADASTRO | 2 | cadastro sem lat/lng |
| Zona Sul Loja 48 - Recreio | 🟡 SEM_CADASTRO | 2 | cadastro sem lat/lng |
| Zona Sul Loja 19 - Copacabana | 🟠 SOBREPOSTO | 5 | cadastro no mesmo ponto de outra rede |
| Zona Sul Loja 32 - Laranjeiras | 🟠 SOBREPOSTO | 2 | cadastro no mesmo ponto de outra rede |
| Zona Sul Loja 34 - Barra | 🟠 SOBREPOSTO | 4 | cadastro no mesmo ponto de outra rede |
| Zona Sul Loja 38 - Copacabana | 🟠 SOBREPOSTO | 3 | cadastro no mesmo ponto de outra rede |
| Zona Sul Loja 40 - Ipanema | 🟠 SOBREPOSTO | 4 | cadastro no mesmo ponto de outra rede |
| Zona Sul Loja 44 - Barra | 🟠 SOBREPOSTO | 3 | cadastro no mesmo ponto de outra rede |
| Zona Sul Loja 45 - Flamengo | 🟠 SOBREPOSTO | 2 | cadastro no mesmo ponto de outra rede |
