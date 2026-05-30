# Lojas com MESMA localização + CÓDIGOS DIFERENTES no Unitrac

Análise dos 3 dias (19/20/25) — clusters de paradas LOJA dentro de 100m
com 2+ codigo_loja distintos. Detecta o bug descrito pela Tia Erica:
cliente cadastra a MESMA loja com vários códigos OU geofences sobrepostos.

Total clusters problemáticos: **9**

## A) Redes DIFERENTES no mesmo lugar (5)

Tipo mais grave — cliente cadastrou loja de rede X com cod no lugar de loja Y de outra rede.

### Cluster @ lat=-22.82743 lng=-43.33805
- **[ZONA_SUL]** cod=`9039124` "47- ZONA SUL" — 3 placas / 3 dias
- **[REAL]** cod=`13156084` "MATRIZ CD DUQUE" — 2 placas / 3 dias
- **[NATURCON]** cod=`25414000` "NATURCON GELADOS" — 1 placas / 2 dias
- **[ARMAZEM_GRAO]** cod=`5353012` "REGINA BARRA DO IMBUY" — 2 placas / 3 dias
- **[ARMAZEM_GRAO]** cod=`5353016` "REGINA LUCIO MEIRA" — 1 placas / 1 dias
- **[EMANUEL]** cod=`25140000` "EMANUEL- REDE ECONOMIA SANTA MARIA" — 1 placas / 1 dias
- **[EMANUEL]** cod=`17659001` "O BOM CAMPO GRANDE" — 1 placas / 1 dias
- **[REAL]** cod=`131000` "REAL DE Brasil ÉDEN BARROS FILHO" — 1 placas / 1 dias
- **[EMANUEL]** cod=`11139000` "EMANUEL COMÉRCIO PEDRA DE GUARATIBA" — 1 placas / 1 dias

### Cluster @ lat=-22.82878 lng=-43.33818
- **[SANTO_AGOSTINHO]** cod=`23080000` "MERCADO SANTO AGOSTINHO - BARRA DA TIJUCA" — 3 placas / 3 dias
- **[?]** cod=`2019003` "DISPOSICAO - JANAUBA" — 1 placas / 1 dias

### Cluster @ lat=-22.96399 lng=-43.17476
- **[PRINCESA]** cod=`8590134` "PRINCESA LEME" — 1 placas / 2 dias
- **[PREZUNIC]** cod=`7000756` "PREZUNIC SPID COPACABAN A" — 1 placas / 1 dias

### Cluster @ lat=-22.93374 lng=-43.18632
- **[PRINCESA]** cod=`8590218` "PRINCESA LARANJEIRA S" — 1 placas / 3 dias
- **[ZONA_SUL]** cod=`9039106` "32 - ZONA SUL - LARANJEIRA S" — 1 placas / 1 dias

### Cluster @ lat=-22.91500 lng=-42.81945
- **[PRINCESA]** cod=`8590002` "PRINCESA MARICÁ 1" — 2 placas / 3 dias
- **[PREZUNIC]** cod=`7000749` "PREZUNIC MARICÁ" — 1 placas / 3 dias

## B) Mesma REDE com cods duplicados (4)

Cliente cadastrou a mesma loja física com 2 códigos diferentes (ou 2 lojas adjacentes muito próximas).

### Cluster @ lat=-22.82895 lng=-43.34100
- **[EMANUEL]** cod=`17659000` "O BOM ATACADISTA" — 2 placas / 3 dias
- **[EMANUEL]** cod=`17659004` "REDE ECONOMIA SANTA MARIA" — 3 placas / 2 dias
- **[EMANUEL]** cod=`17659002` "EMANUEL CACHAMOR RA" — 4 placas / 3 dias

### Cluster @ lat=-22.91506 lng=-43.24146
- **[PREZUNIC]** cod=`7000748` "PREZUNIC VILA ISABEL" — 3 placas / 3 dias
- **[PREZUNIC]** cod=`7000761` "PREZUNIC SPID VILA ISABEL" — 1 placas / 1 dias

### Cluster @ lat=-23.01395 lng=-43.46977
- **[PREZUNIC]** cod=`7000752` "PREZUNIC SPID RECREIO" — 1 placas / 1 dias
- **[PREZUNIC]** cod=`7000702` "PREZUNIC RECREIO" — 2 placas / 3 dias

### Cluster @ lat=-22.90584 lng=-43.29141
- **[PREZUNIC]** cod=`7000729` "PREZUNIC MEIER" — 3 placas / 2 dias
- **[PREZUNIC]** cod=`7000737` "PREZUNIC SPID MÉIER" — 1 placas / 1 dias

## Sumário por rede (quantos cods em clusters problemáticos)

| Rede | Cods em duplicação |
|------|---------------------|
| PREZUNIC | 8 |
| EMANUEL | 6 |
| PRINCESA | 3 |
| ZONA_SUL | 2 |
| REAL | 2 |
| ARMAZEM_GRAO | 2 |
| NATURCON | 1 |
| SANTO_AGOSTINHO | 1 |
| ? | 1 |