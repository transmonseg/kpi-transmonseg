# Escala × Unitrac — análise APENAS do Unitrac (sem usar cadastro interno)

Pra cada loja da escala dos 3 dias (19/20/25), verifica se o Unitrac reporta
parada LOJA com cod específico (CERTO) ou só BASE/FORA_BASE/cluster sobreposto (BUGADO).

## Sumário por rede

| Rede | ✅ CERTO | ❌ BUGADO | Total | % certo |
|------|---------|-----------|-------|---------|
| **CAB_PETROPOLIS** | 1 | 0 | 1 | 100% |
| **SAMS_CLUB** | 3 | 0 | 3 | 100% |
| **VIANENSE** | 4 | 0 | 4 | 100% |
| **DESCONHECIDO** | 1 | 0 | 1 | 100% |
| **SUPER_PAX** | 13 | 1 | 14 | 93% |
| **PRINCESA** | 24 | 2 | 26 | 92% |
| **PREZUNIC** | 52 | 5 | 57 | 91% |
| **CARREFOUR** | 9 | 1 | 10 | 90% |
| **ZONA_SUL** | 42 | 5 | 47 | 89% |
| **SUPERPRIX** | 8 | 1 | 9 | 89% |
| **ASSAI** | 35 | 6 | 41 | 85% |
| **FEIRA_NOVA** | 13 | 3 | 16 | 81% |
| **ARMAZEM_GRAO** | 12 | 3 | 15 | 80% |
| **SENDAS** | 6 | 3 | 9 | 67% |
| **EMANUEL** | 4 | 3 | 7 | 57% |
| **ATACADAO** | 1 | 1 | 2 | 50% |
| **GUANABARA** | 11 | 16 | 27 | 41% |
| **SUPERCOMPRAS** | 0 | 1 | 1 | 0% |
| **MUNDIAL** | 0 | 1 | 1 | 0% |

## CAB_PETROPOLIS — 1/1 certas (100%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| CAB - PETRÓPOLIS | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=7012010,579011 |

## SAMS_CLUB — 3/3 certas (100%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| Sam's - Barra (Ayrton Senna) | ✅ CERTO | 1 | 3 | 2/3 dias com parada LOJA cod=8590004,9006012 |
| Sam's - Linha Amarela | ✅ CERTO | 1 | 3 | 2/3 dias com parada LOJA cod=7000721,4568002 |
| Sam's - Niterói | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=7000707,579012,579006 |

## VIANENSE — 4/4 certas (100%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| Vianense - Freguesia 2º entrega | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=7000747 |
| Vianense - Jardim Alvorada 2º entrega | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=22980000,22144002,22144000 |
| Vianense - Nova Iguaçu 1º entrega | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=22980000,22144002,22144000 |
| Vianense - Recreio 1º entrega | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=7000747 |

## DESCONHECIDO — 1/1 certas (100%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| GPA | ✅ CERTO | 2 | 1 | 1/1 dias com parada LOJA cod=71035 |

## SUPER_PAX — 13/14 certas (93%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| Del Castilho | ✅ CERTO | 2 | 3 | 1/3 dias com parada LOJA cod=8590003,202004 |
| Engenho de Dentro | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=7000724,202001,202003 |
| Guadalupe | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=560031,202005 |
| Inhauma | ✅ CERTO | 1 | 2 | 2/2 dias com parada LOJA cod=7000724,202001,202003 |
| Lins | ✅ CERTO | 3 | 3 | 1/3 dias com parada LOJA cod=202013,7000712,7000705 |
| LINS 2º CARRO | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=579010,202013 |
| Madureira | ✅ CERTO | 3 | 3 | 2/3 dias com parada LOJA cod=7000730,202000,7000722 |
| Oswaldo Cruz | ✅ CERTO | 3 | 3 | 2/3 dias com parada LOJA cod=7000730,202000,7000722 |
| Pilares | ✅ CERTO | 2 | 3 | 1/3 dias com parada LOJA cod=7000720,7000715,202009 |
| Realengo | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=9006001,202002 |
| Sepetiba | ✅ CERTO | 3 | 3 | 2/3 dias com parada LOJA cod=560056,7000712,7000705 |
| Taquara | ✅ CERTO | 3 | 3 | 2/3 dias com parada LOJA cod=560018,202011,7000766 |
| Vila da Penha | ✅ CERTO | 3 | 3 | 2/3 dias com parada LOJA cod=202010 |
| INHAUMA | ❌ BUGADO | 1 | 1 | placa escalada nunca fez parada LOJA com cod (1/1 dias sem parada) |

## PRINCESA — 24/26 certas (92%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| Princesa - Arraial 1 (1ª Entrega) | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=8590559,8590569,8590560 |
| Princesa - Arraial 2 (2ª Entrega) | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=8590559,8590569,8590560 |
| Princesa - Arraial 3 (3ª Entrega) | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=8590559,8590569,8590560 |
| Princesa - Barra de São João (1ª Entrega) | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=8590568,8590562,9039017 |
| Princesa - Buzios 1 (2ª Entrega) | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=8590571,8590563,8590564 |
| Princesa - Buzios 2 (3ª Entrega) | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=8590571,8590563,8590564 |
| Princesa - Buzios 3 (1ª Entrega) | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=8590571,8590563,8590564 |
| Princesa - Cabo Frio 1 (1ª Entrega) | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=8590565,8590567,8590566 |
| Princesa - Cabo Frio 2 (3ª Entrega) | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=8590565,8590567,8590566 |
| Princesa - Cabo Frio 3 (2ª Entrega) | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=8590565,8590567,8590566 |
| Princesa - Catete | ✅ CERTO | 1 | 3 | 2/3 dias com parada LOJA cod=8590120,7000744,7000755 |
| Princesa - Copacabana | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=8590034,11623026 |
| Princesa - Cosme Velho | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=8590000,9039011 |
| Princesa - Flamengo | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=8590165,7000758,7000745 |
| Princesa - Fonseca | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=8590555,7000760,560021 |
| Princesa - Icaraí | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=8590004,560048,71032 |
| Princesa - Iguaba (1º Entrega) | ✅ CERTO | 2 | 3 | 1/3 dias com parada LOJA cod=8590573,8590570 |
| Princesa - Inga | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=8590556,7000759,560040 |
| Princesa - Itaboraí (2ª Entrega) | ✅ CERTO | 2 | 3 | 1/3 dias com parada LOJA cod=8590573,8590570 |
| Princesa - Leme | ✅ CERTO | 2 | 3 | 1/3 dias com parada LOJA cod=11623033 |
| Princesa - Maricá 1 (2ª Entrega) | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=8590003,202004,5353005 |
| Princesa - Maricá 2 (1ª Entrega) | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=8590003,202004,5353005 |
| Princesa - Pechincha | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=8590031,560030 |
| Princesa - Rio das Ostras (2ª Entrega) | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=8590568,8590562,9039017 |
| Princesa - Laranjeiras | ❌ BUGADO | 2 | 3 | cod sobreposto/BASE: 8590218 |
| Princesa - Niteroí Barcas | ❌ BUGADO | 1 | 3 | placa escalada nunca fez parada LOJA com cod (3/3 dias sem parada) |

## PREZUNIC — 52/57 certas (91%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| Prezunic - Anil (Jacarepaguá) | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=7000735 |
| Prezunic - Barra da Tijuca | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=7000734,7000740 |
| Prezunic - Benfica | ✅ CERTO | 3 | 3 | 2/3 dias com parada LOJA cod=7000708,7000706,579009 |
| Prezunic - Botafogo (Voluntários) | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=7000750,560057,560054 |
| Prezunic - Botafogo / Serra Azul | ✅ CERTO | 3 | 3 | 1/3 dias com parada LOJA cod=11623033 |
| Prezunic - Cachambi | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=7000724,202001,202003 |
| Prezunic - Campinho | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=7000718,6018000,2018006 |
| Prezunic - Campo Grande (TINGUI) | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=7000766,202011,579006 |
| Prezunic - Campo Grande / Serra Azul | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=7000710,9039012 |
| Prezunic - Catumbi / Serra Azul | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=7000704,560031 |
| Prezunic - Caxias Centenário | ✅ CERTO | 2 | 3 | 2/3 dias com parada LOJA cod=7000717,7000713 |
| Prezunic - Caxias Centro / Serra Azul | ✅ CERTO | 2 | 3 | 2/3 dias com parada LOJA cod=7000717,7000713 |
| Prezunic - Cidade de Deus | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=7000718,6018000,2018006 |
| Prezunic - Engenho Novo | ✅ CERTO | 3 | 3 | 2/3 dias com parada LOJA cod=7000708,7000706,579009 |
| Prezunic - Fonseca | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=7000722,202006,202000 |
| Prezunic - Freguesia | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=7000707,579012,579006 |
| Prezunic - Icaraí | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=7000730,202000,579009 |
| Prezunic - Ilha do Governador | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=7000728,579010 |
| Prezunic - Itaoca | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=7000720,7000715,202009 |
| Prezunic - Jauru / Serra Azul | ✅ CERTO | 2 | 3 | 1/3 dias com parada LOJA cod=7000711,7000719,9039008 |
| Prezunic - Maricá | ✅ CERTO | 1 | 3 | 2/3 dias com parada LOJA cod=71034,71038,9039009 |
| Prezunic - Méier / Serra Azul | ✅ CERTO | 3 | 3 | 1/3 dias com parada LOJA cod=9039114 |
| Prezunic - Nilópolis | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=7000721,4568002 |
| Prezunic - Olaria | ✅ CERTO | 2 | 3 | 2/3 dias com parada LOJA cod=7000714,7000723,579001 |
| Prezunic - Padre Miguel | ✅ CERTO | 2 | 3 | 2/3 dias com parada LOJA cod=7000726,71005 |
| Prezunic - Pechincha | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=7000709,579001,9039117 |
| Prezunic - Penha | ✅ CERTO | 2 | 3 | 2/3 dias com parada LOJA cod=7000714,7000723,579001 |
| Prezunic - Realengo/ Serra Azul | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=7000712,7000705,202012 |
| Prezunic - Santa Cruz / Serra Azul | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=7000733 |
| Prezunic - Senador Camará | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=7000712,7000705,202012 |
| Prezunic - Taquara / Serra Azul | ✅ CERTO | 2 | 3 | 1/3 dias com parada LOJA cod=7000711,7000719,9039008 |
| Prezunic - Tijuca | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=7000747 |
| Prezunic - Vila Isabel | ✅ CERTO | 3 | 3 | 2/3 dias com parada LOJA cod=202010,9039018 |
| Prezunic - Vilar dos Teles | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=7000725,579008,579007 |
| Prezunic - Vista Alegre | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=7000720,7000715,202009 |
| Prezunic SPID - Alpha Mall | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=7000734,7000740 |
| Prezunic SPID - Barra | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=7000734,7000740 |
| Prezunic SPID - Botafogo | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=8590165,7000758,7000745 |
| Prezunic SPID - Carioca | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=8590120,7000744,7000755 |
| Prezunic SPID - Centro | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=8590120,7000744,7000755 |
| Prezunic SPID - Copacabana | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=8590165,7000758,7000745 |
| Prezunic SPID - Farme de Amoedo | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=8590165,7000758,7000745 |
| Prezunic SPID - Freguesia | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=8590031 |
| Prezunic SPID - Glória | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=8590120,7000744,7000755 |
| Prezunic SPID - Jacarepagua | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=7000734,7000740 |
| Prezunic SPID - Meier | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=8590555,7000760 |
| Prezunic SPID - Parque das Rosas | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=7000734,7000740 |
| Prezunic SPID - Recreio | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=7000734,7000740 |
| Prezunic SPID - Santa Rosa (Niterói) | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=8590556,7000759 |
| Prezunic SPID - Tijuca | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=8590555,7000760 |
| Prezunic SPID - Vila Isabel | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=8590555,7000760 |
| Prezunic SPID - Visconde de Pirajá (Ipanema) | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=8590165,7000758,7000745 |
| Prezunic - Barra Marapendi | ❌ BUGADO | 1 | 3 | placa escalada nunca fez parada LOJA com cod (3/3 dias sem parada) |
| Prezunic - Depósito Central | ❌ BUGADO | 1 | 1 | placa escalada nunca fez parada LOJA com cod (1/1 dias sem parada) |
| Prezunic - Jardim Oceanico | ❌ BUGADO | 1 | 3 | placa escalada nunca fez parada LOJA com cod (3/3 dias sem parada) |
| Prezunic - Laranjeiras | ❌ BUGADO | 1 | 3 | placa escalada nunca fez parada LOJA com cod (3/3 dias sem parada) |
| Prezunic - Recreio dos Bandeirantes | ❌ BUGADO | 2 | 3 | cod sobreposto/BASE: 7000702 |

## CARREFOUR — 9/10 certas (90%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| Carrefour - Alcântara | ✅ CERTO | 3 | 3 | 2/3 dias com parada LOJA cod=9006012 |
| Carrefour - Barra da Tijuca | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=9006001,202002 |
| Carrefour - Brigadeiro (Caxias) | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=9006144,579008 |
| Carrefour - Campo Grande | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=9006154,71035,8590004 |
| Carrefour - Campos dos Goytacazes | ✅ CERTO | 1 | 2 | 2/2 dias com parada LOJA cod=9006159,9006158 |
| Carrefour - Juiz de Fora | ✅ CERTO | 1 | 2 | 2/2 dias com parada LOJA cod=9006156,5353003,5353006 |
| Carrefour - Macaé | ✅ CERTO | 1 | 2 | 2/2 dias com parada LOJA cod=9006159,9006158 |
| Carrefour - Sulacap | ✅ CERTO | 3 | 3 | 1/3 dias com parada LOJA cod=9006007 |
| Carrefour - Washington Luiz | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=9006010 |
| Carrefour - Norte Shopping | ❌ BUGADO | 1 | 3 | placa escalada nunca fez parada LOJA com cod (3/3 dias sem parada) |

## ZONA_SUL — 42/47 certas (89%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| MEGA BOX 01 - Olaria | ✅ CERTO | 7 | 3 | 3/3 dias com parada LOJA cod=7000718,6018000,9039018 |
| MEGA BOX 02 - Olaria | ✅ CERTO | 6 | 3 | 3/3 dias com parada LOJA cod=7000718,6018000,560019 |
| Zona Sul - Entrega Extra | ✅ CERTO | 2 | 2 | 2/2 dias com parada LOJA cod=7000718,6018000,9039018 |
| Zona Sul Loja 03 - Copacabana I | ✅ CERTO | 3 | 3 | 2/3 dias com parada LOJA cod=9039104,9039018 |
| Zona Sul Loja 04 - Copacabana II | ✅ CERTO | 2 | 2 | 2/2 dias com parada LOJA cod=9039018,9039107,9039004 |
| Zona Sul Loja 05 - Copacabana III | ✅ CERTO | 3 | 3 | 2/3 dias com parada LOJA cod=7000718,2018006,7000716 |
| Zona Sul Loja 06 - Gávea | ✅ CERTO | 3 | 2 | 1/2 dias com parada LOJA cod=7000709,579001 |
| Zona Sul Loja 07 - Leblon | ✅ CERTO | 4 | 2 | 2/2 dias com parada LOJA cod=3030201,8590165,9039007 |
| Zona Sul Loja 08 - Ipanema | ✅ CERTO | 5 | 3 | 2/3 dias com parada LOJA cod=9039007,9039008,9039027 |
| Zona Sul Loja 09 - Ipanema | ✅ CERTO | 3 | 3 | 2/3 dias com parada LOJA cod=9039009 |
| Zona Sul Loja 10 - Recreio | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=560019,9039010,202005 |
| Zona Sul Loja 11 - Leblon | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=3030007,71039,9039011 |
| Zona Sul Loja 12 - Leme | ✅ CERTO | 3 | 3 | 2/3 dias com parada LOJA cod=7000710,9039012 |
| Zona Sul Loja 14 - Leblon | ✅ CERTO | 3 | 3 | 1/3 dias com parada LOJA cod=9039027,9039015,9039101 |
| Zona Sul Loja 15 - Leblon | ✅ CERTO | 2 | 2 | 2/2 dias com parada LOJA cod=9039027,9039015,9039028 |
| Zona Sul Loja 17 - Barra | ✅ CERTO | 4 | 3 | 2/3 dias com parada LOJA cod=8590562,8590568,9039017 |
| Zona Sul Loja 18 - Copacabana | ✅ CERTO | 1 | 2 | 2/2 dias com parada LOJA cod=9039018,9039107,6018000 |
| Zona Sul Loja 19 - Copacabana | ✅ CERTO | 5 | 3 | 2/3 dias com parada LOJA cod=9006001,202002,9039104 |
| Zona Sul Loja 20 - Botafogo | ✅ CERTO | 3 | 3 | 1/3 dias com parada LOJA cod=7000718,2018006,7000716 |
| Zona Sul Loja 21 - Flamengo | ✅ CERTO | 3 | 2 | 2/2 dias com parada LOJA cod=9039103,9039110 |
| Zona Sul Loja 22 - S. Conrado | ✅ CERTO | 3 | 3 | 1/3 dias com parada LOJA cod=560022,9039099,9039022 |
| Zona Sul Loja 23 - Barra | ✅ CERTO | 4 | 3 | 2/3 dias com parada LOJA cod=560047,560028,6018001 |
| Zona Sul Loja 25 - Jd. Botânico | ✅ CERTO | 4 | 3 | 2/3 dias com parada LOJA cod=560022,9039099,9039022 |
| Zona Sul Loja 26 - Copacabana | ✅ CERTO | 4 | 3 | 2/3 dias com parada LOJA cod=22980000,22144002,22144000 |
| Zona Sul Loja 27 - Ipanema | ✅ CERTO | 1 | 2 | 2/2 dias com parada LOJA cod=9039027,9039015,9039028 |
| Zona Sul Loja 28 - Urca | ✅ CERTO | 4 | 3 | 3/3 dias com parada LOJA cod=9039027,9039015,9039028 |
| Zona Sul Loja 29 - Flamengo | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=9039027,9039015,9039028 |
| Zona Sul Loja 31 - Jd. Botânico | ✅ CERTO | 5 | 3 | 2/3 dias com parada LOJA cod=22980000,22144002,22144000 |
| Zona Sul Loja 32 - Laranjeiras | ✅ CERTO | 2 | 3 | 1/3 dias com parada LOJA cod=7000728,579010 |
| Zona Sul Loja 33 - Humaitá | ✅ CERTO | 2 | 2 | 1/2 dias com parada LOJA cod=9039104 |
| Zona Sul Loja 34 - Barra | ✅ CERTO | 4 | 3 | 1/3 dias com parada LOJA cod=7000718,7000716,9039114 |
| Zona Sul Loja 35 - Barra | ✅ CERTO | 3 | 3 | 1/3 dias com parada LOJA cod=9039018,9039107 |
| Zona Sul Loja 36 - Botafogo | ✅ CERTO | 3 | 2 | 1/2 dias com parada LOJA cod=9039122,9039108,9039005 |
| Zona Sul Loja 38 - Copacabana | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=9039103,9039110 |
| Zona Sul Loja 40 - Ipanema | ✅ CERTO | 4 | 3 | 1/3 dias com parada LOJA cod=22980000,22144002,22144000 |
| Zona Sul Loja 42 - Botafogo | ✅ CERTO | 2 | 3 | 1/3 dias com parada LOJA cod=7000711,7000719,9039008 |
| Zona Sul Loja 43 - Barra (Península) | ✅ CERTO | 3 | 3 | 1/3 dias com parada LOJA cod=560054,9039115 |
| Zona Sul Loja 44 - Barra | ✅ CERTO | 3 | 3 | 1/3 dias com parada LOJA cod=7000709,9039117 |
| Zona Sul Loja 45 - Flamengo | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=71039,9039120 |
| Zona Sul Loja 46 - Botafogo | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=8590568,8590562,9039004 |
| Zona Sul Loja 47 | ✅ CERTO | 4 | 3 | 2/3 dias com parada LOJA cod=9039121,579003,9039015 |
| Zona Sul Loja 48 - Recreio | ✅ CERTO | 2 | 2 | 1/2 dias com parada LOJA cod=9039121,579003 |
| EXTRA F.31 | ❌ BUGADO | 1 | 1 | placa escalada nunca fez parada LOJA com cod (1/1 dias sem parada) |
| Zona Sul Loja 01 - Ipanema | ❌ BUGADO | 2 | 3 | placa escalada nunca fez parada LOJA com cod (3/3 dias sem parada) |
| Zona Sul Loja 1129 - Olaria | ❌ BUGADO | 3 | 3 | placa escalada nunca fez parada LOJA com cod (3/3 dias sem parada) |
| Zona Sul Loja 13 - Angra | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |
| Zona Sul Loja 30 - Laranjeiras | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |

## SUPERPRIX — 8/9 certas (89%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| Super Prix - Icaraí - Loja 10 - 2° ENTREGA | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=3030113,3030011,2018008 |
| Super Prix - Ipanema - Loja 201 | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=3030201,560030 |
| Super Prix - Niterói - Loja 13 - 1° ENTREGA | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=3030113,3030011,2018008 |
| Super Prix - Tijuca  (2° °ENTREGA) Loja 14 | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=3030013,3030014 |
| Super Prix -Grajaú  VERDUN Loja 04 2°ENTREGA | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=3030008,3030004 |
| Super Prix -Grajaú -  Loja 08 - 1°° ENTREGA | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=3030008,3030004 |
| Super Prix -Riachuelo Loja 07 | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=3030007,71039,9039011 |
| Super Prix -Tijuquinha (1° ENTREGA)  Loja 13 | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=3030013,3030014 |
| Super Prix - Barra - Loja 202 | ❌ BUGADO | 1 | 3 | placa escalada nunca fez parada LOJA com cod (3/3 dias sem parada) |

## ASSAI — 35/41 certas (85%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| Assaí - Alcântara I - Loja 35 | ✅ CERTO | 3 | 3 | 1/3 dias com parada LOJA cod=560022,9039099,9039022 |
| Assaí - Araruama - Loja 221 | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=560049 |
| Assaí - Bangu I - Loja 55 | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=560028,71016,6018001 |
| Assaí - Bangu II - Loja 332 | ✅ CERTO | 2 | 2 | 1/2 dias com parada LOJA cod=9006154,7000710,560058 |
| Assaí - Barra I (Senna) - Loja 133 | ✅ CERTO | 2 | 3 | 2/3 dias com parada LOJA cod=560032 |
| Assaí - Barra II  - Loja 245 | ✅ CERTO | 2 | 3 | 2/3 dias com parada LOJA cod=560042 |
| Assaí - Boulevard (Vila Isabel) - Loja 294 | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=560056,5353005 |
| Assaí - Cabo Frio - Loja 82 | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=560017 |
| Assaí - Campinho - Loja 37 | ✅ CERTO | 2 | 3 | 2/3 dias com parada LOJA cod=560024,2018001 |
| Assaí - Campos dos Goytacazes- Loja 188 | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=560036 |
| Assaí - Carioca Shopping - Loja 316 | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=560048 |
| Assaí - Caxias I - Loja 131 | ✅ CERTO | 2 | 3 | 2/3 dias com parada LOJA cod=560018,202011 |
| Assaí - Caxias II (Parque Fluminense) - Loja 219 | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=7000750,560057,560054 |
| Assaí - Cesário de Melo - Loja 202 | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=560039 |
| Assaí - Cordovil - Loja 231 | ✅ CERTO | 2 | 2 | 1/2 dias com parada LOJA cod=3030007,560046,9039011 |
| Assaí - Freguesia - Loja 28 | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=560019,202005,9039019 |
| Assaí - Galeão - Loja 302 | ✅ CERTO | 2 | 3 | 2/3 dias com parada LOJA cod=560051 |
| AssaÍ - Ilha do Governador - Loja 29 | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=560020 |
| Assaí - Macaé - Loja 232 | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=560041 |
| Assaí - Méier - Loja 160 | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=560031,202005 |
| Assaí - Mendanha (Campo Grande) - Loja 65 | ✅ CERTO | 3 | 3 | 1/3 dias com parada LOJA cod=560016 |
| Assaí - Mesquita (Dutra) - Loja 142 | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=560035 |
| Assaí - Nilópolis - Loja 36 | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=560023,579013 |
| Assaí - Niterói - Loja 41 | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=560025 |
| Assaí - Nova Iguaçu - Loja 30 | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=560021,5353003,5353006 |
| Assaí - Nova Iguaçu 2 - Loja 291 | ✅ CERTO | 3 | 3 | 1/3 dias com parada LOJA cod=560054,9039115 |
| Assaí - Petrópolis- Loja 181 | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=560038 |
| Assaí - Pilares - Loja 128 | ✅ CERTO | 2 | 3 | 2/3 dias com parada LOJA cod=560030 |
| Assaí - Sabão Rio (Benfica) - Loja 136 | ✅ CERTO | 3 | 3 | 1/3 dias com parada LOJA cod=560033 |
| Assaí - Santa Cruz - Loja 201 | ✅ CERTO | 2 | 3 | 2/3 dias com parada LOJA cod=560037 |
| Assaí - Santa Cruz 2 - Loja 338 | ✅ CERTO | 2 | 2 | 2/2 dias com parada LOJA cod=7000733,7000721 |
| Assaí - São Gonçalo Centro - Loja 266 | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=560047,9039017 |
| Assaí - São João do Meriti  - Loja 217 | ✅ CERTO | 2 | 3 | 2/3 dias com parada LOJA cod=560040 |
| Assaí - Taquara   - Loja 340 | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=560062,5353008,5353004 |
| Assaí - Tijuca II  - Loja 150 | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=560043 |
| Assaí - Alcântara II - Loja 293 | ❌ BUGADO | 1 | 3 | placa escalada nunca fez parada LOJA com cod (3/3 dias sem parada) |
| Assaí - Ceasa - Loja 42 | ❌ BUGADO | 1 | 3 | placa escalada nunca fez parada LOJA com cod (3/3 dias sem parada) |
| Assaí - Maracanã - Loja 286 | ❌ BUGADO | 1 | 3 | placa escalada nunca fez parada LOJA com cod (3/3 dias sem parada) |
| Assaí - Niterói Ponte - Loja 292 | ❌ BUGADO | 2 | 3 | placa escalada nunca fez parada LOJA com cod (3/3 dias sem parada) |
| Assaí - São Gonçalo Camil - Loja 211 | ❌ BUGADO | 1 | 3 | placa escalada nunca fez parada LOJA com cod (3/3 dias sem parada) |
| Assaí - Tribobó - Loja 248 | ❌ BUGADO | 1 | 3 | placa escalada nunca fez parada LOJA com cod (3/3 dias sem parada) |

## FEIRA_NOVA — 13/16 certas (81%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| 1- Nilopolis (Olinda) | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=7000709,579001,7000714 |
| 10- Cachambi | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=9039004,579010,579013 |
| 11- Boa Dica (Piabetá) | ✅ CERTO | 2 | 3 | 1/3 dias com parada LOJA cod=7012010,579011 |
| 12- Freguesia | ✅ CERTO | 1 | 2 | 2/2 dias com parada LOJA cod=7000707,579012,4568001 |
| 13- Todos os Santos | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=7000714,7000723,9039004 |
| 3- Anchieta | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=9039104,9039121,579003 |
| 6- Santa Cruz da Serra | ✅ CERTO | 2 | 2 | 2/2 dias com parada LOJA cod=7000707,579006,7000766 |
| 7- C.ROCHA | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=7000725 |
| 7- Coelho da Rocha | ✅ CERTO | 1 | 2 | 2/2 dias com parada LOJA cod=7000725,579008,579007 |
| 8- Cerâmica | ✅ CERTO | 2 | 3 | 3/3 dias com parada LOJA cod=9006144,579008,7000725 |
| 9- Queimados | ✅ CERTO | 2 | 3 | 1/3 dias com parada LOJA cod=7000708,7000706,579009 |
| Mercado Santo Agostinho (Barra) | ✅ CERTO | 3 | 3 | 2/3 dias com parada LOJA cod=8590004,15247000 |
| SANTA CRUZ | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=7000766 |
| 4- Irajá | ❌ BUGADO | 1 | 3 | placa escalada nunca fez parada LOJA com cod (3/3 dias sem parada) |
| 4- Irajá - 2ª VIAGEM | ❌ BUGADO | 1 | 1 | placa escalada nunca fez parada LOJA com cod (1/1 dias sem parada) |
| ANCHIETA - 2º CARRO | ❌ BUGADO | 1 | 1 | placa escalada nunca fez parada LOJA com cod (1/1 dias sem parada) |

## ARMAZEM_GRAO — 12/15 certas (80%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| ABASTECEDORA GRÃO DA SERRA (ALTO) | ✅ CERTO | 3 | 3 | 1/3 dias com parada LOJA cod=8590003 |
| ARMAZEM DO GRÃO  (MOSELA) | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=8590571,8590563,8590564 |
| ARMAZEM DO GRAO (16 DE MARÇO) | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=8590565,8590567,8590566 |
| ARMAZEM DO GRÃO (CAPELA) | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=8590565,8590567,8590566 |
| ARMAZEM DO GRAO (CORREAS) | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=560021,5353003,5353006 |
| ARMAZEM DO GRÃO (ITAIPAVA) | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=560021,5353003,5353006 |
| ARMAZEM DO GRÃO (QUITANDINHA) | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=8590571,8590563,8590564 |
| ARMAZEM DO GRÃO (VALPARAÍSO) | ✅ CERTO | 3 | 3 | 3/3 dias com parada LOJA cod=8590571,8590563,8590564 |
| ARMAZEM DO GRAO A. BARRA DA TIJUCA | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=9039030,5353011,9039006 |
| REGINA  1 DE MAIO | ✅ CERTO | 3 | 3 | 1/3 dias com parada LOJA cod=8590003 |
| REGINA  BARRA DO IMBUY | ✅ CERTO | 3 | 3 | 1/3 dias com parada LOJA cod=8590003 |
| REGINA  LUCIO MEIRA | ✅ CERTO | 3 | 3 | 1/3 dias com parada LOJA cod=8590003 |
| Armazem do grão - Central | ❌ BUGADO | 1 | 1 | placa escalada nunca fez parada LOJA com cod (1/1 dias sem parada) |
| ARMAZÉM DO GRÃO ( BOA VISTA) | ❌ BUGADO | 3 | 3 | cod sobreposto/BASE: 7000749 |
| ARMAZÉM DO GRÃO MATRIZ ( POSSE) | ❌ BUGADO | 3 | 3 | cod sobreposto/BASE: 7000749 |

## SENDAS — 6/9 certas (67%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| Americanas | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=7000714,7000723,579001 |
| Atlantico Sul (Barra da Tijuca) | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=22980000,22144002,22144000 |
| Barra Tower | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=22980000,22144002,22144000 |
| Barramares (Barra da Tijuca) | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=22980000,22144002,22144000 |
| Mercearia Sachinho (Vargem Grande) | ✅ CERTO | 1 | 3 | 3/3 dias com parada LOJA cod=15247000 |
| Santo Agostinho | ✅ CERTO | 1 | 3 | 2/3 dias com parada LOJA cod=8590004,9006012 |
| Armazem do grão - Central | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |
| Mercado de Santa | ❌ BUGADO | 1 | 3 | placa escalada nunca fez parada LOJA com cod (3/3 dias sem parada) |
| Sendas Central 1º Carro | ❌ BUGADO | 1 | 3 | cod sobreposto/BASE: 13156084 |

## EMANUEL — 4/7 certas (57%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| ALHAMBRA | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=560021 |
| CACHAMORRA | ✅ CERTO | 1 | 1 | 1/1 dias com parada LOJA cod=8590034,11623026 |
| SANTA_MARIA | ✅ CERTO | 1 | 2 | 1/2 dias com parada LOJA cod=8590120 |
| VARGEM_GRANDE | ✅ CERTO | 2 | 2 | 2/2 dias com parada LOJA cod=17659003,560021 |
| Alhambra / Cachamorra | ❌ BUGADO | 1 | 1 | placa escalada nunca fez parada LOJA com cod (1/1 dias sem parada) |
| JARDIM_MARAVILHA | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |
| PEDRA_GUARATIBA | ❌ BUGADO | 1 | 2 | cod sobreposto/BASE: 11139000,17659000 |

## ATACADAO — 1/2 certas (50%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| Atacadão - Belford Roxo | ✅ CERTO | 3 | 3 | 2/3 dias com parada LOJA cod=23843003,5353011,9039105 |
| Atacadão - Manilha | ❌ BUGADO | 1 | 3 | placa escalada nunca fez parada LOJA com cod (3/3 dias sem parada) |

## GUANABARA — 11/27 certas (41%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| GB BANGU FILIAL 5 | ✅ CERTO | 1 | 2 | 1/2 dias com parada LOJA cod=71005 |
| GB BARRA FILIAL 7 | ✅ CERTO | 2 | 2 | 2/2 dias com parada LOJA cod=71032 |
| GB CAMPO GRANDE FILIAL 26 | ✅ CERTO | 2 | 2 | 1/2 dias com parada LOJA cod=71035 |
| GB DEL CASTILHO FILIAL 23 | ✅ CERTO | 1 | 2 | 2/2 dias com parada LOJA cod=71023 |
| GB ENG DE DENTRO FILIAL 1 | ✅ CERTO | 2 | 2 | 1/2 dias com parada LOJA cod=71001 |
| GB NITEROI FILIAL 8 | ✅ CERTO | 2 | 2 | 2/2 dias com parada LOJA cod=71008 |
| GB NOVA IGUACU FILIAL 16 | ✅ CERTO | 2 | 2 | 2/2 dias com parada LOJA cod=71016 |
| GB PENHA FILIAL 2 | ✅ CERTO | 1 | 2 | 2/2 dias com parada LOJA cod=71002 |
| GB REALENGO FILIAL 4 | ✅ CERTO | 1 | 2 | 2/2 dias com parada LOJA cod=71004 |
| GB RECREIO FILIAL 27 | ✅ CERTO | 2 | 2 | 2/2 dias com parada LOJA cod=71039 |
| GB RIO DA PRATA FILIAL 13 | ✅ CERTO | 1 | 2 | 2/2 dias com parada LOJA cod=71013 |
| GB BENTO RIBEIRO FILIAL 15 | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |
| GB BONSUCESSO FILIAL 30 | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |
| GB CAMPINHO FILIAL 17 | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |
| GB CAMPO GRANDE FILIAL 11 | ❌ BUGADO | 2 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |
| GB CATONHO FILIAL 31 | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |
| GB CAXIAS FILIAL 18 | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |
| GB IRAJA FILIAL 9 | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |
| GB ITAGUAI FILIAL 6 | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |
| GB PACIENCIA FILIAL 20 | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |
| GB PADRE MIGUEL FILIAL 14 | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |
| GB PIEDADE FILIAL 3 | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |
| GB SANTA CRUZ FILIAL 28 | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |
| GB SAO JOAO FILIAL 29 | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |
| GB TANQUE FILIAL 19 | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |
| GB TIJUCA FILIAL 25 | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |
| GB VILA ISABEL FILIAL 10 | ❌ BUGADO | 1 | 2 | placa escalada nunca fez parada LOJA com cod (2/2 dias sem parada) |

## SUPERCOMPRAS — 0/1 certas (0%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| SUPERCOMPRAS - COSMOS | ❌ BUGADO | 2 | 3 | cod sobreposto/BASE: 23080000 |

## MUNDIAL — 0/1 certas (0%)

| Loja na escala | Status | Placas | Dias | Observação |
|----------------|--------|--------|------|------------|
| MUNDIAL | ❌ BUGADO | 1 | 3 | placa escalada nunca fez parada LOJA com cod (3/3 dias sem parada) |
