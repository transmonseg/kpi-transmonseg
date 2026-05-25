# Análise match placa-por-placa — Dia 22/05/2026

Total placas analisadas: 168

## Sumário

| Diagnóstico | Qtd |
|------|-----|
| OK_FULL | 74 |
| FORA_ESCALA | 39 |
| PLACA_AUSENTE | 29 |
| OK_PARCIAL | 15 |
| INATIVA | 8 |
| FALHA_MATCH | 3 |

---
## AFY7J99

**Escala (3 linha(s)):**
- [PREZUNIC] WANDERLEY | loja="Prezunic - Jauru / Serra Azul" cod=—
- [PREZUNIC] WANDERLEY | loja="Prezunic - Taquara / Serra Azul" cod=—
- [ZONA_SUL] WANDERLEY | loja="Zona Sul Loja 45 - Flamengo" cod=45

**Unitrac (3 loja(s)):**
- `7000711 PREZUNIC JAURU`
- `7000719 PREZUNIC TAQUARA`
- `9039120 45 - ZONA SUL - FLAMENGO`

**Match resultado:**
- ✓ "Prezunic - Jauru / Serra Azul" → `7000711 PREZUNIC JAURU` (nome 1 tokens)
- ✓ "Prezunic - Taquara / Serra Azul" → `7000719 PREZUNIC TAQUARA` (nome 1 tokens)
- ✓ "Zona Sul Loja 45 - Flamengo" → `9039120 45 - ZONA SUL - FLAMENGO` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (3/3)

---
## AKZ2594

**Escala (2 linha(s)):**
- [ASSAI] NILTON | loja="Assaí - Freguesia - Loja 28" cod=28
- [ZONA_SUL] NILTON RODRIGUES | loja="MEGA BOX 02 - Olaria" cod=MEGA

**Unitrac (2 loja(s)):**
- `560019 SENDAS FREGUESIA - LOJA 28`
- `6018001 MEGA BOX 2 (RECREIO)`

**Match resultado:**
- ✓ "Assaí - Freguesia - Loja 28" → `560019 SENDAS FREGUESIA - LOJA 28` (nome 2 tokens)
- ✓ "MEGA BOX 02 - Olaria" → `6018001 MEGA BOX 2 (RECREIO)` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## AKZ2745

**Escala (2 linha(s)):**
- [ASSAI] LUIZ JR. | loja="Assaí - Méier - Loja 160" cod=160
- [SUPER_PAX] LUIZ | loja="Guadalupe" cod=—

**Unitrac (2 loja(s)):**
- `202005 PAX GUADALUPE`
- `560031 SENDAS MEIER`

**Match resultado:**
- ✓ "Assaí - Méier - Loja 160" → `560031 SENDAS MEIER` (nome 1 tokens)
- ✓ "Guadalupe" → `202005 PAX GUADALUPE` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## AMF0325

**Escala (1 linha(s)):**
- [CARREFOUR] GORDO | loja="Carrefour - Washington Luiz" cod=—

**Unitrac (1 loja(s)):**
- `9006010 CARREFOUR WASHINGTON LUIS`

**Match resultado:**
- ✓ "Carrefour - Washington Luiz" → `9006010 CARREFOUR WASHINGTON LUIS` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## AMR9986

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018002 ROTA BOTAFOGO` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## AMW3424

**Escala (1 linha(s)):**
- [ASSAI] MESSIAS | loja="Assaí - Niterói Ponte - Loja 292" cod=292

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## AOP3C73

**Não está na escala. Está no Unitrac com 3 loja(s).**

- Unitrac: `71039 GB 27 - RECREIO DOS BANDEIRANTES`
- Unitrac: `9039104 33 - ZONA SUL - HUMAITA`
- Unitrac: `9039108 36 - ZONA SUL - BOTAFOGO`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## ATP9F21

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018040 ROTA NOVA FRIBURGO / PETRÓPOLIS` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## AWA6B40

**Escala (1 linha(s)):**
- [ASSAI] JOSE | loja="Assaí - Cabo Frio - Loja 82" cod=82

**Unitrac (1 loja(s)):**
- `560017 SENDAS CABO FRIO - LOJA 82`

**Match resultado:**
- ✓ "Assaí - Cabo Frio - Loja 82" → `560017 SENDAS CABO FRIO - LOJA 82` (nome 3 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## BBH1C94

**Escala (2 linha(s)):**
- [FEIRA_NOVA] JOSUÉ | loja="1- Nilopolis (Olinda)" cod=—
- [FEIRA_NOVA] JOSUÉ | loja="3- Anchieta" cod=—

**Unitrac (3 loja(s)):**
- `579001 FEIRA NOVA OLINDA`
- `579003 FEIRA NOVA ANCHIETA`
- `9039121 48 - ZONA SUL - RECREIO DOS BANDEIRANTES`

**Match resultado:**
- ✓ "1- Nilopolis (Olinda)" → `579001 FEIRA NOVA OLINDA` (nome 1 tokens)
- ✓ "3- Anchieta" → `579003 FEIRA NOVA ANCHIETA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## CDL8E52

**Escala (1 linha(s)):**
- [MUNDIAL] CLUDIOMIR | loja="MUNDIAL" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## CDM8645

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71035 GB 26 - CAMPO GRANDE`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## CEJ3426

**Escala (1 linha(s)):**
- [ASSAI] ADRIANO | loja="Assaí - Santa Cruz - Loja 201" cod=201

**Unitrac (1 loja(s)):**
- `560037 SENDAS SANTA CRUZ - LJ 37`

**Match resultado:**
- ✓ "Assaí - Santa Cruz - Loja 201" → `560037 SENDAS SANTA CRUZ - LJ 37` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## CUC6J83

**Escala (1 linha(s)):**
- [ASSAI] EDMARIO | loja="Assaí - Galeão - Loja 302" cod=302

**Unitrac (1 loja(s)):**
- `560051 SENDAS GALEÃO - LJ 302`

**Match resultado:**
- ✓ "Assaí - Galeão - Loja 302" → `560051 SENDAS GALEÃO - LJ 302` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## CXA7B36

**Escala (2 linha(s)):**
- [SUPERPRIX] BRUNO | loja="Super Prix -Grajaú -  Loja 08 - 1°° ENTREGA" cod=08
- [SUPERPRIX] BRUNO | loja="Super Prix -Grajaú  VERDUN Loja 04 2°ENTREGA" cod=04

**Unitrac (2 loja(s)):**
- `3030004 SUPERPRIX LJ 04 - GRAJAÚ VERDUN`
- `3030008 SUPERPRIX LJ 08 - GRAJAÚ`

**Match resultado:**
- ✓ "Super Prix -Grajaú -  Loja 08 - 1°° ENTREGA" → `3030008 SUPERPRIX LJ 08 - GRAJAÚ` (suffix cod 08→3030008)
- ✓ "Super Prix -Grajaú  VERDUN Loja 04 2°ENTREGA" → `3030004 SUPERPRIX LJ 04 - GRAJAÚ VERDUN` (suffix cod 04→3030004)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## CYB3B90

**Escala (4 linha(s)):**
- [PREZUNIC] EVERTON | loja="Prezunic - Campinho" cod=—
- [PREZUNIC] EVERTON | loja="Prezunic - Cidade de Deus" cod=—
- [ZONA_SUL] EVERTON | loja="Zona Sul Loja 03 - Copacabana I" cod=03
- [ZONA_SUL] EVERTON | loja="Zona Sul Loja 26 - Copacabana" cod=26

**Unitrac (2 loja(s)):**
- `7000716 PREZUNIC CIDADE DE DEUS`
- `7000718 PREZUNIC CAMPINHO`

**Match resultado:**
- ✓ "Prezunic - Campinho" → `7000718 PREZUNIC CAMPINHO` (nome 1 tokens)
- ✓ "Prezunic - Cidade de Deus" → `7000716 PREZUNIC CIDADE DE DEUS` (nome 3 tokens)
- ✗ "Zona Sul Loja 03 - Copacabana I" → SEM MATCH
- ✗ "Zona Sul Loja 26 - Copacabana" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (2/4)

---
## CZZ8H82

**Escala (1 linha(s)):**
- [ASSAI] JUCA | loja="Assaí - Campos dos Goytacazes- Loja 188" cod=188

**Unitrac (1 loja(s)):**
- `560036 SENDAS CAMPOS - LJ 36`

**Match resultado:**
- ✓ "Assaí - Campos dos Goytacazes- Loja 188" → `560036 SENDAS CAMPOS - LJ 36` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## DBB8D19

**Escala (1 linha(s)):**
- [ZONA_SUL] PAULO HENRIQUE | loja="Zona Sul Loja 35 - Barra" cod=35

**Unitrac (1 loja(s)):**
- `9039107 35 - ZONA SUL - BARRA DA TIJUCA`

**Match resultado:**
- ✓ "Zona Sul Loja 35 - Barra" → `9039107 35 - ZONA SUL - BARRA DA TIJUCA` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## DDI6J90

**Escala (1 linha(s)):**
- [ASSAI] VALDIR | loja="Assaí - Tijuca II  - Loja 150" cod=150

**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)

---
## DZX3H55

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018006 ROTA CAMPO GRANDE` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## EAC4D65

**Escala (1 linha(s)):**
- [CARREFOUR] MILTON | loja="Carrefour - Brigadeiro (Caxias)" cod=—

**Unitrac (1 loja(s)):**
- `9006144 CARREFOUR BRIGADEIRO`

**Match resultado:**
- ✓ "Carrefour - Brigadeiro (Caxias)" → `9006144 CARREFOUR BRIGADEIRO` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## EAK6G02

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018038 ROTA NITEROI / MARICA` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## EBG2D13

**Escala (2 linha(s)):**
- [ZONA_SUL] JONESON | loja="Zona Sul Loja 23 - Barra" cod=23
- [ZONA_SUL] JONESON | loja="Zona Sul Loja 44 - Barra" cod=44

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## EFU5704

**Escala (1 linha(s)):**
- [FEIRA_NOVA] WILLIAM FERES | loja="4- Irajá" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## EFU5H04

**Escala (1 linha(s)):**
- [PREZUNIC] WILLIAM FERES | loja="Prezunic - Laranjeiras" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## ETI5F79

**Escala (2 linha(s)):**
- [PREZUNIC] WALLACE | loja="Prezunic - Padre Miguel" cod=—
- [SUPER_PAX] WALLACE | loja="Inhauma" cod=—

**Unitrac (2 loja(s)):**
- `202003 PAX INHAUMA`
- `7000726 PREZUNIC PADRE MIGUEL`

**Match resultado:**
- ✓ "Prezunic - Padre Miguel" → `7000726 PREZUNIC PADRE MIGUEL` (nome 2 tokens)
- ✓ "Inhauma" → `202003 PAX INHAUMA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## EYL8B91

**Escala (2 linha(s)):**
- [SUPERCOMPRAS] RAFAEL SOARES | loja="SUPERCOMPRAS - COSMOS" cod=—
- [FEIRA_NOVA] RAFAEL | loja="Mercado Santo Agostinho (Barra)" cod=—

**Unitrac (2 loja(s)):**
- `15755000 MERCADO ITAGIBA DE COSMOS LTDA` ⚠ rota gigante
- `23080000 MERCADO SANTO AGOSTINHO - BARRA DA TIJUCA` ⚠ rota gigante

**Match resultado:**
- ✗ "SUPERCOMPRAS - COSMOS" → SEM MATCH
- ✗ "Mercado Santo Agostinho (Barra)" → SEM MATCH

**Diagnóstico:** ✗ FALHA_MATCH (0/2)

---
## EZU9325

**Escala (1 linha(s)):**
- [ASSAI] ANTONIO CARLOS | loja="Assaí - Ceasa - Loja 42" cod=42

**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)

---
## FHO5F88

**Escala (1 linha(s)):**
- [SUPERPRIX] CLEYTON | loja="Super Prix - Ipanema - Loja 201" cod=201

**Unitrac (1 loja(s)):**
- `3030201 SUPERPRIX LJ 201 - IPANEMA`

**Match resultado:**
- ✓ "Super Prix - Ipanema - Loja 201" → `3030201 SUPERPRIX LJ 201 - IPANEMA` (suffix cod 201→3030201)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## FQN6J72

**Escala (1 linha(s)):**
- [ASSAI] LUIZ CARLOS | loja="Assaí - Alcântara II - Loja 293" cod=293

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## GAJ6H51

**Escala (1 linha(s)):**
- [PREZUNIC] ESTELITA | loja="Prezunic - Icaraí" cod=—

**Unitrac (1 loja(s)):**
- `7000730 PREZUNIC ICARAÍ`

**Match resultado:**
- ✓ "Prezunic - Icaraí" → `7000730 PREZUNIC ICARAÍ` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## GBC6E12

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71032 GB 07 - BARRA`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## GEB9H31

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71039 GB 27 - RECREIO DOS BANDEIRANTES`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## GGX3F42

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018018 ROTA NITEROI` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## GSK0G53

**Escala (1 linha(s)):**
- [ASSAI] FÁBIO ALVES | loja="Assaí - Cesário de Melo - Loja 202" cod=202

**Unitrac (1 loja(s)):**
- `560039 SENDAS CESÁRIO DE MELO - LJ 202`

**Match resultado:**
- ✓ "Assaí - Cesário de Melo - Loja 202" → `560039 SENDAS CESÁRIO DE MELO - LJ 202` (nome 4 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## HOE4B58

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018001 ROTA BARRA` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## INW8A51

**Escala (2 linha(s)):**
- [SUPERPRIX] WILLIAM | loja="Super Prix -Riachuelo Loja 07" cod=07
- [ZONA_SUL] WILLIAM | loja="Zona Sul Loja 11 - Leblon" cod=11

**Unitrac (3 loja(s)):**
- `3030007 SUPERPRIX LJ 07 - RIACHUELO`
- `9039011 11 - ZONA SUL - LEBLON`
- `9039122 46 - ZONA SUL - BOTAFOGO`

**Match resultado:**
- ✓ "Super Prix -Riachuelo Loja 07" → `3030007 SUPERPRIX LJ 07 - RIACHUELO` (suffix cod 07→3030007)
- ✓ "Zona Sul Loja 11 - Leblon" → `9039011 11 - ZONA SUL - LEBLON` (suffix cod 11→9039011)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## JAJ6B36

**Escala (4 linha(s)):**
- [PRINCESA] RENATO | loja="Princesa - Barra de São João (1ª Entrega)" cod=—
- [PRINCESA] RENATO | loja="Princesa - Rio das Ostras (2ª Entrega)" cod=—
- [ZONA_SUL] RENATO | loja="Zona Sul Loja 05 - Copacabana III" cod=05
- [ZONA_SUL] RENATO | loja="Zona Sul Loja 20 - Botafogo" cod=20

**Unitrac (4 loja(s)):**
- `8590562 PRINCESA - BARRA DE SÃO JOÃO`
- `8590568 PRINCESA - RIO DAS OSTRAS`
- `9039005 05 - ZONA SUL - COPACABANA III`
- `9039102 20 - ZONA SUL - BOTAFOGO`

**Match resultado:**
- ✓ "Princesa - Barra de São João (1ª Entrega)" → `8590562 PRINCESA - BARRA DE SÃO JOÃO` (nome 4 tokens)
- ✓ "Princesa - Rio das Ostras (2ª Entrega)" → `8590568 PRINCESA - RIO DAS OSTRAS` (nome 3 tokens)
- ✓ "Zona Sul Loja 05 - Copacabana III" → `9039005 05 - ZONA SUL - COPACABANA III` (suffix cod 05→9039005)
- ✓ "Zona Sul Loja 20 - Botafogo" → `9039102 20 - ZONA SUL - BOTAFOGO` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (4/4)

---
## KMY5561

**Escala (2 linha(s)):**
- [CARREFOUR] LUÍZ ANTÔNIO | loja="Carrefour - Barra da Tijuca" cod=—
- [SUPER_PAX] LUIZ ANTONIO | loja="Realengo" cod=—

**Unitrac (1 loja(s)):**
- `9006001 CARREFOUR BARRA`

**Match resultado:**
- ✓ "Carrefour - Barra da Tijuca" → `9006001 CARREFOUR BARRA` (nome 1 tokens)
- ✗ "Realengo" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/2)

---
## KMZ7057

**Escala (1 linha(s)):**
- [ASSAI] CARLINHOS | loja="Assaí - Petrópolis- Loja 181" cod=181

**Unitrac (1 loja(s)):**
- `560038 SENDAS PETRÓPOLIS - LJ 38`

**Match resultado:**
- ✓ "Assaí - Petrópolis- Loja 181" → `560038 SENDAS PETRÓPOLIS - LJ 38` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KNB0752

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71016 GB 16 - NOVA IGUAÇU`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KNC1I34

**Escala (3 linha(s)):**
- [PREZUNIC] MARCELO | loja="Prezunic - Jardim Oceanico" cod=—
- [PREZUNIC] MARCELO | loja="Prezunic - Barra Marapendi" cod=—
- [FEIRA_NOVA] MARCELO | loja="9- Queimados" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## KNC5J75

**Escala (2 linha(s)):**
- [CARREFOUR] JULIO | loja="Carrefour - Sulacap" cod=—
- [EMANUEL] JULIO | loja="PEDRA_GUARATIBA" cod=—

**Unitrac (3 loja(s)):**
- `11139000 EMANUEL COMÉRCIO PEDRA DE GUARATIBA` ⚠ rota gigante
- `17659000 O BOM ATACADISTA` ⚠ rota gigante
- `9006007 CARREFOUR SULACAP`

**Match resultado:**
- ✓ "Carrefour - Sulacap" → `9006007 CARREFOUR SULACAP` (nome 1 tokens)
- ✗ "PEDRA_GUARATIBA" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/2)

---
## KNS8D16

**Escala (1 linha(s)):**
- [FEIRA_NOVA] ZOZIMO | loja="11- Boa Dica (Piabetá)" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## KNS8D26

**Escala (1 linha(s)):**
- [CAB_PETROPOLIS] ZOZIMO | loja="CAB - PETRÓPOLIS" cod=—

**Unitrac (2 loja(s)):**
- `579011 FEIRA NOVA BOA DICA (PIABETÁ)`
- `7012010 CAB - PETROPOLIS` ⚠ rota gigante

**Match resultado:**
- ✗ "CAB - PETRÓPOLIS" → SEM MATCH

**Diagnóstico:** ✗ FALHA_MATCH (0/1)

---
## KNZ3I45

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018014 ROTA ILHA` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KNZ5B07

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018019 ROTA NOVA IGUACU` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KOA6A27

**Escala (3 linha(s)):**
- [PREZUNIC] HUMBERTO | loja="Prezunic - Vilar dos Teles" cod=—
- [FEIRA_NOVA] HUMBERTO | loja="7- Coelho da Rocha" cod=—
- [FEIRA_NOVA] HUMBERTO | loja="8- Cerâmica" cod=—

**Unitrac (3 loja(s)):**
- `579007 FEIRA NOVA COELHO DA ROCHA`
- `579008 FEIRA NOVA CERAMICA`
- `7000725 PREZUNIC VILAR DOS TELES`

**Match resultado:**
- ✓ "Prezunic - Vilar dos Teles" → `7000725 PREZUNIC VILAR DOS TELES` (nome 3 tokens)
- ✓ "7- Coelho da Rocha" → `579007 FEIRA NOVA COELHO DA ROCHA` (nome 3 tokens)
- ✓ "8- Cerâmica" → `579008 FEIRA NOVA CERAMICA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (3/3)

---
## KOH0H77

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018006 ROTA CAMPO GRANDE` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KON6I33

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018010 ROTA COPACABANA`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KOP4978

**Escala (2 linha(s)):**
- [PREZUNIC] MILTON | loja="Prezunic - Campo Grande / Serra Azul" cod=—
- [ZONA_SUL] MILTON | loja="Zona Sul Loja 17 - Barra" cod=17

**Unitrac (1 loja(s)):**
- `7000710 PREZUNIC CAMPO GRANDE`

**Match resultado:**
- ✓ "Prezunic - Campo Grande / Serra Azul" → `7000710 PREZUNIC CAMPO GRANDE` (nome 2 tokens)
- ✗ "Zona Sul Loja 17 - Barra" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/2)

---
## KPB5I95

**Escala (3 linha(s)):**
- [PREZUNIC] JOSE ROBERTO | loja="Prezunic - Freguesia" cod=—
- [SAMS_CLUB] JOSE ROBERTO | loja="Sam's - Niterói" cod=—
- [FEIRA_NOVA] JOSE ROBERTO | loja="12- Freguesia" cod=—

**Unitrac (3 loja(s)):**
- `4568001 SAMS NITEROI`
- `579012 FEIRA NOVA FREGUESIA`
- `7000707 PREZUNIC FREGUESIA`

**Match resultado:**
- ✓ "Prezunic - Freguesia" → `579012 FEIRA NOVA FREGUESIA` (nome 1 tokens)
- ✓ "Sam's - Niterói" → `4568001 SAMS NITEROI` (nome 1 tokens)
- ✓ "12- Freguesia" → `579012 FEIRA NOVA FREGUESIA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (3/3)

---
## KPE4133

**Escala (1 linha(s)):**
- [PREZUNIC] CIRLANDO | loja="Prezunic - Ilha do Governador" cod=—

**Unitrac (1 loja(s)):**
- `7000728 PREZUNIC ILHA`

**Match resultado:**
- ✓ "Prezunic - Ilha do Governador" → `7000728 PREZUNIC ILHA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KPH8C41

**Escala (1 linha(s)):**
- [SENDAS] EDUARDO | loja="Armazem do grão - Central" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## KPN4F36

**Escala (2 linha(s)):**
- [CARREFOUR] AGENOR | loja="Carrefour - Campos dos Goytacazes" cod=—
- [CARREFOUR] AGENOR | loja="Carrefour - Macaé" cod=—

**Unitrac (2 loja(s)):**
- `9006158 CARREFOUR CAMPOS`
- `9006159 CARREFOUR MACAE`

**Match resultado:**
- ✓ "Carrefour - Campos dos Goytacazes" → `9006158 CARREFOUR CAMPOS` (nome 1 tokens)
- ✓ "Carrefour - Macaé" → `9006159 CARREFOUR MACAE` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## KPR9E13

**Escala (1 linha(s)):**
- [ASSAI] GABRIEL | loja="Assaí - Nova Iguaçu - Loja 30" cod=30

**Unitrac (1 loja(s)):**
- `560021 SENDAS NOVA IGUAÇU - LOJA 30`

**Match resultado:**
- ✓ "Assaí - Nova Iguaçu - Loja 30" → `560021 SENDAS NOVA IGUAÇU - LOJA 30` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KPS4J07

**Escala (1 linha(s)):**
- [PRINCESA] ELVIS | loja="Princesa - Laranjeiras" cod=—

**Unitrac (2 loja(s)):**
- `560046 SENDAS CORDOVIL`
- `8590218 PRINCESA LARANJEIRAS`

**Match resultado:**
- ✓ "Princesa - Laranjeiras" → `8590218 PRINCESA LARANJEIRAS` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KPT5B20

**Escala (1 linha(s)):**
- [ASSAI] ROBERTO ALMEIDA | loja="Assaí - Caxias I - Loja 131" cod=131

**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)

---
## KQB3F31

**Escala (3 linha(s)):**
- [ASSAI] DIEGO | loja="Assaí - Bangu I - Loja 55" cod=55
- [ZONA_SUL] DIEGO | loja="Zona Sul Loja 32 - Laranjeiras" cod=32
- [ZONA_SUL] DIEGO | loja="Zona Sul Loja 42 - Botafogo" cod=42

**Unitrac (3 loja(s)):**
- `560028 SENDAS BANGU - LOJA 55`
- `9039106 32 - ZONA SUL - LARANJEIRAS`
- `9039116 42 - ZONA SUL - BOTAFOGO - SÃO CLEMENTE`

**Match resultado:**
- ✓ "Assaí - Bangu I - Loja 55" → `560028 SENDAS BANGU - LOJA 55` (nome 2 tokens)
- ✓ "Zona Sul Loja 32 - Laranjeiras" → `9039106 32 - ZONA SUL - LARANJEIRAS` (nome 2 tokens)
- ✓ "Zona Sul Loja 42 - Botafogo" → `9039116 42 - ZONA SUL - BOTAFOGO - SÃO CLEMENTE` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (3/3)

---
## KQR2J11

**Escala (1 linha(s)):**
- [PRINCESA] KANU | loja="Princesa - Flamengo" cod=—

**Unitrac (2 loja(s)):**
- `8590165 PRINCESA FLAMENGO`
- `9039007 07 - ZONA SUL - LEBLON`

**Match resultado:**
- ✓ "Princesa - Flamengo" → `8590165 PRINCESA FLAMENGO` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KQV1D80

**Escala (3 linha(s)):**
- [PREZUNIC] DOVAL | loja="Prezunic - Fonseca" cod=—
- [SUPER_PAX] DOVAL | loja="Madureira" cod=—
- [SUPER_PAX] DOVAL | loja="Oswaldo Cruz" cod=—

**Unitrac (3 loja(s)):**
- `202000 PAX OSWALDO CRUZ`
- `202006 PAX MADUREIRA`
- `7000722 PREZUNIC FONSECA`

**Match resultado:**
- ✓ "Prezunic - Fonseca" → `7000722 PREZUNIC FONSECA` (nome 1 tokens)
- ✓ "Madureira" → `202006 PAX MADUREIRA` (nome 1 tokens)
- ✓ "Oswaldo Cruz" → `202000 PAX OSWALDO CRUZ` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (3/3)

---
## KQX9G38

**Não está na escala. Está no Unitrac com 2 loja(s).**

- Unitrac: `2018023 ROTA ZONA NORTE` ⚠ ROTA GIGANTE
- Unitrac: `2018038 ROTA NITEROI / MARICA` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KQY9E24

**Escala (1 linha(s)):**
- [ZONA_SUL] VLADIMIR | loja="Zona Sul Loja 40 - Ipanema" cod=40

**Unitrac (2 loja(s)):**
- `9039103 21 - ZONA SUL - FLAMENGO`
- `9039118 40 - ZONA SUL- IPANEMA`

**Match resultado:**
- ✓ "Zona Sul Loja 40 - Ipanema" → `9039118 40 - ZONA SUL- IPANEMA` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KRA1083

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71013 GB 13 - BANGU - RIO DA PRATA`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KRB2J76

**Escala (1 linha(s)):**
- [SENDAS] NELSON | loja="Sendas Central 1º Carro" cod=—

**Unitrac (1 loja(s)):**
- `13156084 MATRIZ CD DUQUE` ⚠ rota gigante

**Match resultado:**
- ✗ "Sendas Central 1º Carro" → SEM MATCH

**Diagnóstico:** ✗ FALHA_MATCH (0/1)

---
## KRH5H67

**Escala (3 linha(s)):**
- [PRINCESA] ERIVELTON | loja="Princesa - Cosme Velho" cod=—
- [ZONA_SUL] ERIVELTON | loja="Zona Sul Loja 46 - Botafogo" cod=46
- [ZONA_SUL] ERIVELTON | loja="Zona Sul Loja 11 - Leblon" cod=11

**Unitrac (2 loja(s)):**
- `8590000 PRINCESA COSME VELHO`
- `9039011 11 - ZONA SUL - LEBLON`

**Match resultado:**
- ✓ "Princesa - Cosme Velho" → `8590000 PRINCESA COSME VELHO` (nome 2 tokens)
- ✗ "Zona Sul Loja 46 - Botafogo" → SEM MATCH
- ✓ "Zona Sul Loja 11 - Leblon" → `9039011 11 - ZONA SUL - LEBLON` (suffix cod 11→9039011)

**Diagnóstico:** ⚠ OK_PARCIAL (2/3)

---
## KRK3D12

**Escala (1 linha(s)):**
- [ASSAI] JOSÉLIO | loja="Assaí - Niterói - Loja 41" cod=41

**Unitrac (1 loja(s)):**
- `560025 SENDAS NITERÓI - LOJA 41`

**Match resultado:**
- ✓ "Assaí - Niterói - Loja 41" → `560025 SENDAS NITERÓI - LOJA 41` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KRW8E86

**Escala (1 linha(s)):**
- [CARREFOUR] RENAN | loja="Carrefour - Campo Grande" cod=—

**Unitrac (1 loja(s)):**
- `9006154 CARREFOUR CAMPO GRANDE`

**Match resultado:**
- ✓ "Carrefour - Campo Grande" → `9006154 CARREFOUR CAMPO GRANDE` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KSJ1479

**Escala (1 linha(s)):**
- [ASSAI] EDVALDO | loja="Assaí - Nilópolis - Loja 36" cod=36

**Unitrac (1 loja(s)):**
- `560023 SENDAS NILÓPOLIS - LOJA 36`

**Match resultado:**
- ✓ "Assaí - Nilópolis - Loja 36" → `560023 SENDAS NILÓPOLIS - LOJA 36` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KSP8814

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71005 GB 05 - BANGU`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KST0246

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71032 GB 07 - BARRA`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KTP4F70

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71023 GB 23 - DEL CASTILHO`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KTR0546

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71008 GB 08 - NITEROI`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KUL1425

**Escala (2 linha(s)):**
- [PREZUNIC] FELIPE | loja="Prezunic - Vila Isabel" cod=—
- [FEIRA_NOVA] FELIPE | loja="6- Santa Cruz da Serra" cod=—

**Unitrac (2 loja(s)):**
- `579006 FEIRA NOVA SANTA CRUZ DA SERRA`
- `7000748 PREZUNIC VILA ISABEL`

**Match resultado:**
- ✓ "Prezunic - Vila Isabel" → `7000748 PREZUNIC VILA ISABEL` (nome 2 tokens)
- ✓ "6- Santa Cruz da Serra" → `579006 FEIRA NOVA SANTA CRUZ DA SERRA` (nome 4 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## KVG7A00

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71001 GB 01 - ENG. DE DENTRO`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KVH9J42

**Escala (2 linha(s)):**
- [FEIRA_NOVA] MARCIO | loja="10- Cachambi" cod=—
- [FEIRA_NOVA] MARCIO | loja="13- Todos os Santos" cod=—

**Unitrac (3 loja(s)):**
- `579010 FEIRA NOVA CACHAMBI`
- `579013 FEIRA NOVA TODOS OS SANTOS`
- `9039004 04 - ZONA SUL - COPACABANA II`

**Match resultado:**
- ✓ "10- Cachambi" → `579010 FEIRA NOVA CACHAMBI` (nome 1 tokens)
- ✓ "13- Todos os Santos" → `579013 FEIRA NOVA TODOS OS SANTOS` (nome 3 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## KVI9088

**Escala (1 linha(s)):**
- [PRINCESA] JOHN | loja="Princesa - Icaraí" cod=—

**Unitrac (2 loja(s)):**
- `8590004 PRINCESA ICARAÍ`
- `9006154 CARREFOUR CAMPO GRANDE`

**Match resultado:**
- ✓ "Princesa - Icaraí" → `8590004 PRINCESA ICARAÍ` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KVT5427

**Escala (2 linha(s)):**
- [PRINCESA] RAFAEL | loja="Princesa - Catete" cod=—
- [EMANUEL] RAFAEL | loja="SANTA_MARIA" cod=—

**Unitrac (2 loja(s)):**
- `25140000 EMANUEL- REDE ECONOMIA SANTA MARIA` ⚠ rota gigante
- `8590120 PRINCESA CATETE`

**Match resultado:**
- ✓ "Princesa - Catete" → `8590120 PRINCESA CATETE` (nome 1 tokens)
- ✗ "SANTA_MARIA" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/2)

---
## KWB6998

**Escala (1 linha(s)):**
- [PREZUNIC] DELSON | loja="Prezunic - Botafogo / Serra Azul" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## KWH2J02

**Escala (3 linha(s)):**
- [PRINCESA] WANDERSON | loja="Princesa - Copacabana" cod=—
- [PRINCESA] WANDERSON | loja="Princesa - Leme" cod=—
- [EMANUEL] WANDERSON | loja="VILA_NOVA" cod=—

**Unitrac (3 loja(s)):**
- `17659004 REDE ECONOMIA SANTA MARIA` ⚠ rota gigante
- `8590034 PRINCESA COPACABANA`
- `8590134 PRINCESA LEME`

**Match resultado:**
- ✓ "Princesa - Copacabana" → `8590034 PRINCESA COPACABANA` (nome 1 tokens)
- ✓ "Princesa - Leme" → `8590134 PRINCESA LEME` (nome 1 tokens)
- ✗ "VILA_NOVA" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (2/3)

---
## KWI3461

**Escala (1 linha(s)):**
- [PREZUNIC] EDUARDO | loja="Prezunic - Anil (Jacarepaguá)" cod=—

**Unitrac (1 loja(s)):**
- `7000735 PREZUNIC ANIL (SHOPPING JACAREPAGUA)`

**Match resultado:**
- ✓ "Prezunic - Anil (Jacarepaguá)" → `7000735 PREZUNIC ANIL (SHOPPING JACAREPAGUA)` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KWK4593

**Escala (2 linha(s)):**
- [ZONA_SUL] RODRIGO | loja="Zona Sul Loja 09 - Ipanema" cod=09
- [ZONA_SUL] RODRIGO | loja="Zona Sul Loja 01 - Ipanema" cod=01

**Unitrac (2 loja(s)):**
- `9039001 01 - ZONA SUL - IPANEMA`
- `9039009 09 - ZONA SUL - IPANEMA`

**Match resultado:**
- ✓ "Zona Sul Loja 09 - Ipanema" → `9039009 09 - ZONA SUL - IPANEMA` (suffix cod 09→9039009)
- ✓ "Zona Sul Loja 01 - Ipanema" → `9039001 01 - ZONA SUL - IPANEMA` (suffix cod 01→9039001)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## KXA5966

**Escala (1 linha(s)):**
- [SENDAS] SANDRO | loja="Mercearia Sachinho (Vargem Grande)" cod=—

**Unitrac (2 loja(s)):**
- `15247000 MERCEARIA SACHINHO`
- `202006 PAX MADUREIRA`

**Match resultado:**
- ✓ "Mercearia Sachinho (Vargem Grande)" → `15247000 MERCEARIA SACHINHO` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KXB6E57

**Escala (1 linha(s)):**
- [PREZUNIC] RICARDO | loja="Prezunic - Méier / Serra Azul" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## KXR7527

**Escala (2 linha(s)):**
- [SUPER_PAX] MARCIO | loja="Pilares" cod=—
- [SUPER_PAX] MARCIO | loja="Del Castilho" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## KXR7F27

**Escala (2 linha(s)):**
- [PREZUNIC] MÁRCIO | loja="Prezunic - Itaoca" cod=—
- [PREZUNIC] MÁRCIO | loja="Prezunic - Vista Alegre" cod=—

**Unitrac (5 loja(s)):**
- `202004 PAX DEL CASTILHO`
- `202009 PAX PILARES`
- `560023 SENDAS NILÓPOLIS - LOJA 36`
- `7000715 PREZUNIC VISTA ALEGRE`
- `7000720 PREZUNIC ITAOCA`

**Match resultado:**
- ✓ "Prezunic - Itaoca" → `7000720 PREZUNIC ITAOCA` (nome 1 tokens)
- ✓ "Prezunic - Vista Alegre" → `7000715 PREZUNIC VISTA ALEGRE` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## KYK8G07

**Não está na escala. Está no Unitrac com 2 loja(s).**

- Unitrac: `2018002 ROTA BOTAFOGO` ⚠ ROTA GIGANTE
- Unitrac: `2018009 ROTA CENTRO` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KYM2I62

**Escala (2 linha(s)):**
- [ZONA_SUL] JHONATA FREIRE DA SILVA | loja="MEGA BOX 01 - Olaria" cod=MEGA
- [ZONA_SUL] JHONATA FREIRE DA SILVA | loja="Zona Sul Loja 1129 - Olaria" cod=1129

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## KZC4D39

**Escala (2 linha(s)):**
- [SUPERPRIX] RODRIGO | loja="Super Prix - Niterói - Loja 13 - 1° ENTREGA" cod=13
- [SUPERPRIX] RODRIGO | loja="Super Prix - Icaraí - Loja 10 - 2° ENTREGA" cod=10

**Unitrac (2 loja(s)):**
- `3030011 SUPERPRIX LJ 10 - ICARAÍ`
- `3030113 SUPERPRIX LJ 13 - NITEROI`

**Match resultado:**
- ✓ "Super Prix - Niterói - Loja 13 - 1° ENTREGA" → `3030113 SUPERPRIX LJ 13 - NITEROI` (suffix cod 13→3030113)
- ✓ "Super Prix - Icaraí - Loja 10 - 2° ENTREGA" → `3030011 SUPERPRIX LJ 10 - ICARAÍ` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## KZU4C37

**Escala (1 linha(s)):**
- [ASSAI] ADILSON | loja="Assaí - Araruama - Loja 221" cod=221

**Unitrac (1 loja(s)):**
- `560049 SENDAS ARARUAMA - LJ 221`

**Match resultado:**
- ✓ "Assaí - Araruama - Loja 221" → `560049 SENDAS ARARUAMA - LJ 221` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KZZ4F25

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018023 ROTA ZONA NORTE` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## LAF0697

**Escala (2 linha(s)):**
- [PREZUNIC] FÁBIO BORGES | loja="Prezunic - Nilópolis" cod=—
- [SAMS_CLUB] FÁBIO BORGES | loja="Sam's - Linha Amarela" cod=—

**Unitrac (2 loja(s)):**
- `4568002 SAMS LINHA AMARELA`
- `7000721 PREZUNIC NILÓPOLIS`

**Match resultado:**
- ✓ "Prezunic - Nilópolis" → `7000721 PREZUNIC NILÓPOLIS` (nome 1 tokens)
- ✓ "Sam's - Linha Amarela" → `4568002 SAMS LINHA AMARELA` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## LAS0711

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018008 ROTA CAXIAS` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## LAU1I64

**Escala (1 linha(s)):**
- [ASSAI] LUIS FERREIRA | loja="Assaí - São Gonçalo Camil - Loja 211" cod=211

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LBL5907

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71004 GB 04 - REALENGO`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## LCC1E63

**Não está na escala. Está no Unitrac com 2 loja(s).**

- Unitrac: `2018001 ROTA BARRA` ⚠ ROTA GIGANTE
- Unitrac: `2018013 ROTA GAVEA` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## LCE4337

**Escala (3 linha(s)):**
- [ASSAI] ANDERSON | loja="Assaí - Caxias II (Parque Fluminense) - Loja 219" cod=219
- [PREZUNIC] ANDERSON | loja="Prezunic - Caxias Centro / Serra Azul" cod=—
- [PREZUNIC] ANDERSON | loja="Prezunic - Caxias Centenário" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LFG0737

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71032 GB 07 - BARRA`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## LFJ8442

**Escala (1 linha(s)):**
- [ASSAI] ANTÔNIO | loja="Assaí - Campinho - Loja 37" cod=37

**Unitrac (1 loja(s)):**
- `560024 SENDAS CAMPINHO - LOJA 37`

**Match resultado:**
- ✓ "Assaí - Campinho - Loja 37" → `560024 SENDAS CAMPINHO - LOJA 37` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## LGX1J41

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71006 GB 06 - ITAGUAI`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## LJS2172

**Escala (2 linha(s)):**
- [ZONA_SUL] SÉRGIO JOSE DA SILVA | loja="Zona Sul Loja 14 - Leblon" cod=14
- [ZONA_SUL] SÉRGIO JOSE DA SILVA | loja="Zona Sul Loja 08 - Ipanema" cod=08

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LJS2B72

**Escala (1 linha(s)):**
- [CARREFOUR] SÉRGIO | loja="Carrefour - Norte Shopping" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LKR5990

**Escala (3 linha(s)):**
- [PREZUNIC] AGNALDO | loja="Prezunic - Penha" cod=—
- [PREZUNIC] AGNALDO | loja="Prezunic - Olaria" cod=—
- [ZONA_SUL] AGNALDO | loja="Zona Sul Loja 10 - Recreio" cod=10

**Unitrac (3 loja(s)):**
- `7000714 PREZUNIC OLARIA`
- `7000723 PREZUNIC PENHA`
- `9039010 10 - ZONA SUL - RECREIO DOS BANDEIRANTES`

**Match resultado:**
- ✓ "Prezunic - Penha" → `7000723 PREZUNIC PENHA` (nome 1 tokens)
- ✓ "Prezunic - Olaria" → `7000714 PREZUNIC OLARIA` (nome 1 tokens)
- ✓ "Zona Sul Loja 10 - Recreio" → `9039010 10 - ZONA SUL - RECREIO DOS BANDEIRANTES` (suffix cod 10→9039010)

**Diagnóstico:** ✓ OK_FULL (3/3)

---
## LKV5067

**Escala (3 linha(s)):**
- [ASSAI] DANIEL | loja="Assaí - São João do Meriti  - Loja 217" cod=217
- [SENDAS] JOSÉ CARLOS | loja="Americanas" cod=—
- [EMANUEL] DANIEL | loja="CACHAMORRA" cod=—

**Unitrac (2 loja(s)):**
- `17659002 EMANUEL CACHAMORRA` ⚠ rota gigante
- `560040 SENDAS SÃO JOÃO DE MERITI`

**Match resultado:**
- ✓ "Assaí - São João do Meriti  - Loja 217" → `560040 SENDAS SÃO JOÃO DE MERITI` (nome 3 tokens)
- ✗ "Americanas" → SEM MATCH
- ✗ "CACHAMORRA" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/3)

---
## LKW2B80

**Escala (2 linha(s)):**
- [ZONA_SUL] ALEX | loja="Zona Sul Loja 43 - Barra (Península)" cod=43
- [ZONA_SUL] ALEX | loja="Zona Sul Loja 34 - Barra" cod=34

**Unitrac (2 loja(s)):**
- `9039018 18 - ZONA SUL - COPACABANA`
- `9039115 43 - ZONA SUL - BARRA PENINSULA`

**Match resultado:**
- ✓ "Zona Sul Loja 43 - Barra (Península)" → `9039115 43 - ZONA SUL - BARRA PENINSULA` (nome 3 tokens)
- ✓ "Zona Sul Loja 34 - Barra" → `9039115 43 - ZONA SUL - BARRA PENINSULA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## LLJ9C64

**Escala (1 linha(s)):**
- [PREZUNIC] HELIO ALVES | loja="Prezunic - Barra da Tijuca" cod=—

**Unitrac (1 loja(s)):**
- `7000734 PREZUNIC BARRA`

**Match resultado:**
- ✓ "Prezunic - Barra da Tijuca" → `7000734 PREZUNIC BARRA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## LMF2049

**Escala (3 linha(s)):**
- [PRINCESA] LUIZ CESAR | loja="Princesa - Niteroí Barcas" cod=—
- [PRINCESA] LUIZ CESAR | loja="Princesa - Inga" cod=—
- [SENDAS] LUIZ CESAR | loja="Mercado de Santa" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LMF2A49

**Escala (1 linha(s)):**
- [EMANUEL] LUIZ CESAR | loja="JARDIM_MARAVILHA" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LNG7110

**Escala (1 linha(s)):**
- [PREZUNIC] ANTÔNIO FREITAS | loja="Prezunic - Santa Cruz / Serra Azul" cod=—

**Unitrac (1 loja(s)):**
- `7000733 PREZUNIC SANTA CRUZ`

**Match resultado:**
- ✓ "Prezunic - Santa Cruz / Serra Azul" → `7000733 PREZUNIC SANTA CRUZ` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## LNU7733

**Escala (1 linha(s)):**
- [SUPER_PAX] PAULO CESAR | loja="Vila da Penha" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LNU7H38

**Escala (1 linha(s)):**
- [PREZUNIC] PAULO CESAR | loja="Prezunic - Pechincha" cod=—

**Unitrac (1 loja(s)):**
- `7000709 PREZUNIC PECHINCHA`

**Match resultado:**
- ✓ "Prezunic - Pechincha" → `7000709 PREZUNIC PECHINCHA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## LNU9595

**Escala (1 linha(s)):**
- [ZONA_SUL] CARLOS GONÇALVES | loja="Zona Sul Loja 34 - Barra" cod=34

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LNW4899

**Não está na escala. Está no Unitrac com 2 loja(s).**

- Unitrac: `2018013 ROTA GAVEA` ⚠ ROTA GIGANTE
- Unitrac: `2018019 ROTA NOVA IGUACU` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## LON7G98

**Escala (1 linha(s)):**
- [ASSAI] FÁBIO DEUSETI | loja="Assaí - Tribobó - Loja 248" cod=248

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LOT2962

**Escala (1 linha(s)):**
- [ASSAI] JOAO CARLOS | loja="Assaí - Pilares - Loja 128" cod=128

**Unitrac (1 loja(s)):**
- `560030 SENDAS PILARES - LJ 128`

**Match resultado:**
- ✓ "Assaí - Pilares - Loja 128" → `560030 SENDAS PILARES - LJ 128` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## LOU9928

**Escala (2 linha(s)):**
- [PREZUNIC] SÉRGIO FIDÉLIS | loja="Prezunic - Cachambi" cod=—
- [SUPER_PAX] SERGIO FIDELIS | loja="Engenho de Dentro" cod=—

**Unitrac (2 loja(s)):**
- `202001 PAX ENGENHO DE DENTRO`
- `7000724 PREZUNIC CACHAMBI`

**Match resultado:**
- ✓ "Prezunic - Cachambi" → `7000724 PREZUNIC CACHAMBI` (nome 1 tokens)
- ✓ "Engenho de Dentro" → `202001 PAX ENGENHO DE DENTRO` (nome 3 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## LPI1E68

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018002 ROTA BOTAFOGO` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## LQA4I25

**Escala (1 linha(s)):**
- [ASSAI] HÉLIO | loja="Assaí - Macaé - Loja 232" cod=232

**Unitrac (1 loja(s)):**
- `560041 SENDAS MACAÉ - LOJA 232`

**Match resultado:**
- ✓ "Assaí - Macaé - Loja 232" → `560041 SENDAS MACAÉ - LOJA 232` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## LQE5E01

**Escala (1 linha(s)):**
- [ARMAZEM_GRAO] SIDNEI | loja="ARMAZEM DO GRAO A. BARRA DA TIJUCA" cod=—

**Unitrac (2 loja(s)):**
- `5353011 ARMAZEM DO GRAO (BARRA DA TIJUCA)`
- `9039030 30 - ZONA SUL - LARANJEIRAS`

**Match resultado:**
- ✓ "ARMAZEM DO GRAO A. BARRA DA TIJUCA" → `5353011 ARMAZEM DO GRAO (BARRA DA TIJUCA)` (nome 4 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## LQH3F19

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `9966101 SUPERMARKET COELHO NETO`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## LQU5546

**Escala (3 linha(s)):**
- [ZONA_SUL] INACIO ARAUJO | loja="MEGA BOX 01 - Olaria" cod=MEGA
- [ZONA_SUL] INACIO ARAUJO | loja="MEGA BOX 02 - Olaria" cod=MEGA
- [ZONA_SUL] INACIO ARAUJO | loja="Zona Sul - Entrega Extra" cod=EXTRA

**Unitrac (2 loja(s)):**
- `6018000 MEGA BOX (OLARIA)`
- `6018001 MEGA BOX 2 (RECREIO)`

**Match resultado:**
- ✓ "MEGA BOX 01 - Olaria" → `6018000 MEGA BOX (OLARIA)` (nome 3 tokens)
- ✓ "MEGA BOX 02 - Olaria" → `6018000 MEGA BOX (OLARIA)` (nome 3 tokens)
- ✗ "Zona Sul - Entrega Extra" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (2/3)

---
## LRA9C41

**Escala (3 linha(s)):**
- [PRINCESA] DIEGO | loja="Princesa - Iguaba (1º Entrega)" cod=—
- [PRINCESA] DIEGO | loja="Princesa - Itaboraí (2ª Entrega)" cod=—
- [EMANUEL] SILVIO | loja="ALHAMBRA" cod=—

**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)

---
## LSL9670

**Escala (3 linha(s)):**
- [CARREFOUR] ROBERTO | loja="Carrefour - Juiz de Fora" cod=—
- [ARMAZEM_GRAO] ROBERTO | loja="ARMAZEM DO GRÃO (ITAIPAVA)" cod=—
- [ARMAZEM_GRAO] ROBERTO | loja="ARMAZEM DO GRAO (CORREAS)" cod=—

**Unitrac (3 loja(s)):**
- `5353003 ARMAZEM DO GRÃO (ITAIPAVA)`
- `5353006 ARMAZEM DO GRAO (CORREAS)`
- `9006156 CARREFOUR JUIZ DE FORA`

**Match resultado:**
- ✓ "Carrefour - Juiz de Fora" → `9006156 CARREFOUR JUIZ DE FORA` (nome 3 tokens)
- ✓ "ARMAZEM DO GRÃO (ITAIPAVA)" → `5353003 ARMAZEM DO GRÃO (ITAIPAVA)` (nome 2 tokens)
- ✓ "ARMAZEM DO GRAO (CORREAS)" → `5353006 ARMAZEM DO GRAO (CORREAS)` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (3/3)

---
## LSN6I72

**Escala (2 linha(s)):**
- [ASSAI] SIMÃO | loja="Assaí - Alcântara I - Loja 35" cod=35
- [EMANUEL] SIMAO | loja="AGULHAS_NEGRAS" cod=—

**Unitrac (2 loja(s)):**
- `17659001 O BOM CAMPO GRANDE` ⚠ rota gigante
- `560022 SENDAS ALCÂNTARA I - LOJA 35`

**Match resultado:**
- ✓ "Assaí - Alcântara I - Loja 35" → `560022 SENDAS ALCÂNTARA I - LOJA 35` (nome 2 tokens)
- ✗ "AGULHAS_NEGRAS" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/2)

---
## LSX7C72

**Escala (2 linha(s)):**
- [PREZUNIC] ANDRE | loja="Prezunic - Campo Grande (TINGUI)" cod=—
- [SUPER_PAX] ANDRE | loja="Taquara" cod=—

**Unitrac (2 loja(s)):**
- `202011 PAX TAQUARA`
- `7000766 PREZUNIC CAMPO GRANDE (TINGUI)`

**Match resultado:**
- ✓ "Prezunic - Campo Grande (TINGUI)" → `7000766 PREZUNIC CAMPO GRANDE (TINGUI)` (nome 3 tokens)
- ✓ "Taquara" → `202011 PAX TAQUARA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## LTC8F97

**Escala (1 linha(s)):**
- [PREZUNIC] EDSON CAFÉ | loja="Prezunic - Catumbi / Serra Azul" cod=—

**Unitrac (2 loja(s)):**
- `560031 SENDAS MEIER`
- `7000704 PREZUNIC CATUMBI`

**Match resultado:**
- ✓ "Prezunic - Catumbi / Serra Azul" → `7000704 PREZUNIC CATUMBI` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## LTH4J15

**Escala (6 linha(s)):**
- [SENDAS] MÁRCIO | loja="Atlantico Sul (Barra da Tijuca)" cod=—
- [SENDAS] MÁRCIO | loja="Barramares (Barra da Tijuca)" cod=—
- [SENDAS] MÁRCIO | loja="Barra Tower" cod=—
- [VIANENSE] MÁRCIO | loja="Vianense - Nova Iguaçu 1º entrega" cod=—
- [VIANENSE] MÁRCIO | loja="Vianense - Jardim Alvorada 2º entrega" cod=—
- [ZONA_SUL] MARCIO | loja="Zona Sul Loja 31 - Jd. Botânico" cod=31

**Unitrac (6 loja(s)):**
- `11623028 VIANENSE NOVA IGUAÇU`
- `11623032 VIANENSE JARDIM ALVORADA`
- `22144000 PETIT MARCHE BARRAMARES`
- `22980000 EMPORIO BARRA TOWER`
- `9039006 06 - ZONA SUL - GAVEA`
- `9039105 31 - ZONA SUL - JD BOTANICO`

**Match resultado:**
- ✓ "Atlantico Sul (Barra da Tijuca)" → `22980000 EMPORIO BARRA TOWER` (nome 1 tokens)
- ✓ "Barramares (Barra da Tijuca)" → `22144000 PETIT MARCHE BARRAMARES` (nome 1 tokens)
- ✓ "Barra Tower" → `22980000 EMPORIO BARRA TOWER` (nome 2 tokens)
- ✓ "Vianense - Nova Iguaçu 1º entrega" → `11623028 VIANENSE NOVA IGUAÇU` (nome 1 tokens)
- ✓ "Vianense - Jardim Alvorada 2º entrega" → `11623032 VIANENSE JARDIM ALVORADA` (nome 2 tokens)
- ✓ "Zona Sul Loja 31 - Jd. Botânico" → `9039105 31 - ZONA SUL - JD BOTANICO` (nome 3 tokens)

**Diagnóstico:** ✓ OK_FULL (6/6)

---
## LTQ0783

**Escala (2 linha(s)):**
- [ZONA_SUL] EDMILSON JOSÉ | loja="Zona Sul Loja 28 - Urca" cod=28
- [ZONA_SUL] EDMILSON JOSÉ | loja="Zona Sul Loja 29 - Flamengo" cod=29

**Unitrac (4 loja(s)):**
- `9039015 15 - ZONA SUL - LEBLON`
- `9039027 27 - ZONA SUL - IPANEMA`
- `9039028 28 - ZONA SUL - URCA`
- `9039029 29 - ZONA SUL - FLAMENGO`

**Match resultado:**
- ✓ "Zona Sul Loja 28 - Urca" → `9039028 28 - ZONA SUL - URCA` (suffix cod 28→9039028)
- ✓ "Zona Sul Loja 29 - Flamengo" → `9039029 29 - ZONA SUL - FLAMENGO` (suffix cod 29→9039029)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## LUP1F13

**Escala (2 linha(s)):**
- [PREZUNIC] CARLOS DO SANTOS | loja="Prezunic - Recreio dos Bandeirantes" cod=—
- [SUPER_PAX] CARLOS | loja="Lins" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LUZ2479

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018001 ROTA BARRA` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## LVA2689

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018001 ROTA BARRA` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## LVE0688

**Escala (1 linha(s)):**
- [ZONA_SUL] ANDERSON | loja="Zona Sul Loja 19 - Copacabana" cod=19

**Unitrac (1 loja(s)):**
- `9039019 19 - ZONA SUL - COPACABANA`

**Match resultado:**
- ✓ "Zona Sul Loja 19 - Copacabana" → `9039019 19 - ZONA SUL - COPACABANA` (suffix cod 19→9039019)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## MDV3746

**Escala (2 linha(s)):**
- [ZONA_SUL] PAULO ROBERTO | loja="Zona Sul Loja 47" cod=47
- [ZONA_SUL] PAULO ROBERTO | loja="Zona Sul Loja 46 - Botafogo" cod=46

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## MES7F27

**Escala (3 linha(s)):**
- [PRINCESA] ANTÔNIO | loja="Princesa - Arraial 1 (1ª Entrega)" cod=—
- [PRINCESA] ANTÔNIO | loja="Princesa - Arraial 2 (2ª Entrega)" cod=—
- [PRINCESA] ANTÔNIO | loja="Princesa - Arraial 3 (3ª Entrega)" cod=—

**Unitrac (3 loja(s)):**
- `8590559 PRINCESA - ARRAIAL DO CABO 1`
- `8590560 PRINCESA - ARRAIAL DO CABO 2`
- `8590569 PRINCESA - ARRAIAL DO CABO 3`

**Match resultado:**
- ✓ "Princesa - Arraial 1 (1ª Entrega)" → `8590559 PRINCESA - ARRAIAL DO CABO 1` (nome 1 tokens)
- ✓ "Princesa - Arraial 2 (2ª Entrega)" → `8590559 PRINCESA - ARRAIAL DO CABO 1` (nome 1 tokens)
- ✓ "Princesa - Arraial 3 (3ª Entrega)" → `8590559 PRINCESA - ARRAIAL DO CABO 1` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (3/3)

---
## MSK3752

**Escala (1 linha(s)):**
- [PRINCESA] ALISSON | loja="Princesa - Pechincha" cod=—

**Unitrac (2 loja(s)):**
- `7000731 PREZUNIC BOTAFOGO`
- `8590031 PRINCESA PECHINCHA`

**Match resultado:**
- ✓ "Princesa - Pechincha" → `8590031 PRINCESA PECHINCHA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## NSM6D98

**Escala (3 linha(s)):**
- [CARREFOUR] FLÁVIO | loja="Carrefour - Alcântara" cod=—
- [SAMS_CLUB] FLÁVIO | loja="Sam's - Barra (Ayrton Senna)" cod=—
- [SENDAS] FLÁVIO | loja="Santo Agostinho" cod=—

**Unitrac (1 loja(s)):**
- `9006012 CARREFOUR ALCANTARA`

**Match resultado:**
- ✓ "Carrefour - Alcântara" → `9006012 CARREFOUR ALCANTARA` (nome 1 tokens)
- ✗ "Sam's - Barra (Ayrton Senna)" → SEM MATCH
- ✗ "Santo Agostinho" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/3)

---
## NTT4858

**Escala (1 linha(s)):**
- [ASSAI] EDUARDO | loja="Assaí - Nova Iguaçu 2 - Loja 291" cod=291

**Unitrac (1 loja(s)):**
- `560054 SENDAS NOVA IGUAÇU II`

**Match resultado:**
- ✓ "Assaí - Nova Iguaçu 2 - Loja 291" → `560054 SENDAS NOVA IGUAÇU II` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## QAH2H50

**Escala (2 linha(s)):**
- [ZONA_SUL] EDUARDO | loja="Zona Sul Loja 12 - Leme" cod=12
- [ZONA_SUL] EDUARDO | loja="Zona Sul Loja 38 - Copacabana" cod=38

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## QSO8D04

**Escala (1 linha(s)):**
- [ASSAI] RODRIGO | loja="Assaí - Boulevard (Vila Isabel) - Loja 294" cod=294

**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)

---
## QSS1E48

**Escala (1 linha(s)):**
- [ATACADAO] LUCIANO MATIAS | loja="Atacadão - Manilha" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## QST4C52

**Escala (6 linha(s)):**
- [PRINCESA] LEONARDO | loja="Princesa - Buzios 1 (2ª Entrega)" cod=—
- [PRINCESA] LEONARDO | loja="Princesa - Buzios 2 (3ª Entrega)" cod=—
- [PRINCESA] LEONARDO | loja="Princesa - Buzios 3 (1ª Entrega)" cod=—
- [ARMAZEM_GRAO] JEFERSON | loja="ARMAZEM DO GRÃO (VALPARAÍSO)" cod=—
- [ARMAZEM_GRAO] JEFERSON | loja="ARMAZEM DO GRÃO  (MOSELA)" cod=—
- [ARMAZEM_GRAO] JEFERSON | loja="ARMAZEM DO GRÃO (QUITANDINHA)" cod=—

**Unitrac (6 loja(s)):**
- `5353004 ARMAZEM DO GRÃO (VALPARAÍSO)`
- `5353007 ARMAZEM DO GRÃO (MOSELA)`
- `5353008 ARMAZEM DO GRÃO (QUITANDINHA)`
- `8590563 PRINCESA - BUZIOS 1`
- `8590564 PRINCESA - BUZIOS 2`
- `8590571 PRINCESA - BUZIOS 3`

**Match resultado:**
- ✓ "Princesa - Buzios 1 (2ª Entrega)" → `8590563 PRINCESA - BUZIOS 1` (nome 1 tokens)
- ✓ "Princesa - Buzios 2 (3ª Entrega)" → `8590563 PRINCESA - BUZIOS 1` (nome 1 tokens)
- ✓ "Princesa - Buzios 3 (1ª Entrega)" → `8590563 PRINCESA - BUZIOS 1` (nome 1 tokens)
- ✓ "ARMAZEM DO GRÃO (VALPARAÍSO)" → `5353004 ARMAZEM DO GRÃO (VALPARAÍSO)` (nome 2 tokens)
- ✓ "ARMAZEM DO GRÃO  (MOSELA)" → `5353007 ARMAZEM DO GRÃO (MOSELA)` (nome 2 tokens)
- ✓ "ARMAZEM DO GRÃO (QUITANDINHA)" → `5353008 ARMAZEM DO GRÃO (QUITANDINHA)` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (6/6)

---
## QSU6I54

**Escala (1 linha(s)):**
- [ASSAI] VALDEMIRIO | loja="Assaí - Mendanha (Campo Grande) - Loja 65" cod=65

**Unitrac (5 loja(s)):**
- `5353012 REGINA BARRA DO IMBUY` ⚠ rota gigante
- `5353014 REGINA 1 DE MAIO` ⚠ rota gigante
- `5353016 REGINA LUCIO MEIRA` ⚠ rota gigante
- `5353017 ABASTECEDORA GRÃO DA SERRA (ALTO)` ⚠ rota gigante
- `560016 SENDAS MENDANHA - LOJA 65`

**Match resultado:**
- ✓ "Assaí - Mendanha (Campo Grande) - Loja 65" → `560016 SENDAS MENDANHA - LOJA 65` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## QSW3B65

**Escala (1 linha(s)):**
- [ASSAI] MARCUS VINICIUS | loja="Assaí - Carioca Shopping - Loja 316" cod=316

**Unitrac (1 loja(s)):**
- `560048 SENDAS CARIOCA SHOPPING`

**Match resultado:**
- ✓ "Assaí - Carioca Shopping - Loja 316" → `560048 SENDAS CARIOCA SHOPPING` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## QSY2H32

**Escala (1 linha(s)):**
- [PREZUNIC] VICTOR LINS | loja="Prezunic - Botafogo (Voluntários)" cod=—

**Unitrac (1 loja(s)):**
- `7000750 PREZUNIC BOTAFOGO (VOLUNTÁRIOS DA PÁTRIA)`

**Match resultado:**
- ✓ "Prezunic - Botafogo (Voluntários)" → `7000750 PREZUNIC BOTAFOGO (VOLUNTÁRIOS DA PÁTRIA)` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## QSZ9A20

**Escala (4 linha(s)):**
- [PRINCESA] DANIEL CAVALCANTE | loja="Princesa - Maricá 1 (2ª Entrega)" cod=—
- [PRINCESA] DANIEL CAVALCANTE | loja="Princesa - Maricá 2 (1ª Entrega)" cod=—
- [ARMAZEM_GRAO] ANTUNES | loja="ARMAZÉM DO GRÃO ( BOA VISTA)" cod=—
- [ARMAZEM_GRAO] ANTUNES | loja="ARMAZÉM DO GRÃO MATRIZ ( POSSE)" cod=—

**Unitrac (2 loja(s)):**
- `8590002 PRINCESA MARICÁ 1`
- `8590003 PRINCESA MARICÁ 2`

**Match resultado:**
- ✓ "Princesa - Maricá 1 (2ª Entrega)" → `8590002 PRINCESA MARICÁ 1` (nome 1 tokens)
- ✓ "Princesa - Maricá 2 (1ª Entrega)" → `8590002 PRINCESA MARICÁ 1` (nome 1 tokens)
- ✗ "ARMAZÉM DO GRÃO ( BOA VISTA)" → SEM MATCH
- ✗ "ARMAZÉM DO GRÃO MATRIZ ( POSSE)" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (2/4)

---
## RJN9F68

**Escala (1 linha(s)):**
- [PRINCESA] JULIO PEREIRA | loja="Princesa - Fonseca" cod=—

**Unitrac (2 loja(s)):**
- `560019 SENDAS FREGUESIA - LOJA 28`
- `8590555 PRINCESA FONSECA`

**Match resultado:**
- ✓ "Princesa - Fonseca" → `8590555 PRINCESA FONSECA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## SFG2F72

**Escala (1 linha(s)):**
- [ASSAI] CELSO | loja="Assaí - Barra II  - Loja 245" cod=245

**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)

---
## SFG2F73

**Escala (1 linha(s)):**
- [ASSAI] FLAVIANO | loja="Assaí - Barra I (Senna) - Loja 133" cod=133

**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)

---
## SRD0J02

**Não está na escala. Está no Unitrac com 2 loja(s).**

- Unitrac: `2018002 ROTA BOTAFOGO` ⚠ ROTA GIGANTE
- Unitrac: `2018009 ROTA CENTRO` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## SRQ9F05

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018007 ROTA CANTAGALO` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## TJQ6J26

**Escala (1 linha(s)):**
- [ASSAI] VICTOR LUIZ | loja="Assaí - Maracanã - Loja 286" cod=286

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## TML1D82

**Escala (3 linha(s)):**
- [ASSAI] WALLACE FERNANDES | loja="Assaí - Mesquita (Dutra) - Loja 142" cod=142
- [ARMAZEM_GRAO] JAIRO | loja="ARMAZEM DO GRÃO (CAPELA)" cod=—
- [ARMAZEM_GRAO] JAIRO | loja="ARMAZEM DO GRAO (16 DE MARÇO)" cod=—

**Unitrac (1 loja(s)):**
- `560035 SENDAS MESQUITA - LJ 35`

**Match resultado:**
- ✓ "Assaí - Mesquita (Dutra) - Loja 142" → `560035 SENDAS MESQUITA - LJ 35` (nome 1 tokens)
- ✗ "ARMAZEM DO GRÃO (CAPELA)" → SEM MATCH
- ✗ "ARMAZEM DO GRAO (16 DE MARÇO)" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/3)

---
## TML2D79

**Escala (2 linha(s)):**
- [ZONA_SUL] MARCOS FERNANDO | loja="Zona Sul Loja 25 - Jd. Botânico" cod=25
- [ZONA_SUL] MARCOS FERNANDO | loja="Zona Sul Loja 22 - S. Conrado" cod=22

**Unitrac (2 loja(s)):**
- `9039022 22 - ZONA SUL - SAO CONRADO`
- `9039099 25 - ZONA SUL - JD. BOTANICO`

**Match resultado:**
- ✓ "Zona Sul Loja 25 - Jd. Botânico" → `9039099 25 - ZONA SUL - JD. BOTANICO` (nome 3 tokens)
- ✓ "Zona Sul Loja 22 - S. Conrado" → `9039022 22 - ZONA SUL - SAO CONRADO` (suffix cod 22→9039022)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## TML5I70

**Escala (3 linha(s)):**
- [ASSAI] ADRIANO | loja="Assaí - Santa Cruz 2 - Loja 338" cod=338
- [PREZUNIC] ADRIANO | loja="Prezunic - Engenho Novo" cod=—
- [PREZUNIC] ADRIANO | loja="Prezunic - Benfica" cod=—

**Unitrac (3 loja(s)):**
- `560060 SENDAS SANTA CRUZ II - LOJA 338`
- `7000706 PREZUNIC BENFICA`
- `7000708 PREZUNIC ENGENHO NOVO`

**Match resultado:**
- ✓ "Assaí - Santa Cruz 2 - Loja 338" → `560060 SENDAS SANTA CRUZ II - LOJA 338` (nome 3 tokens)
- ✓ "Prezunic - Engenho Novo" → `7000708 PREZUNIC ENGENHO NOVO` (nome 2 tokens)
- ✓ "Prezunic - Benfica" → `7000706 PREZUNIC BENFICA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (3/3)

---
## TML6D96

**Escala (3 linha(s)):**
- [PREZUNIC] JOSE ROBERTO | loja="Prezunic - Tijuca" cod=—
- [VIANENSE] JOSE ROBERTO | loja="Vianense - Recreio 1º entrega" cod=—
- [VIANENSE] JOSE ROBERTO | loja="Vianense - Freguesia 2º entrega" cod=—

**Unitrac (1 loja(s)):**
- `7000747 PREZUNIC TIJUCA`

**Match resultado:**
- ✓ "Prezunic - Tijuca" → `7000747 PREZUNIC TIJUCA` (nome 1 tokens)
- ✗ "Vianense - Recreio 1º entrega" → SEM MATCH
- ✗ "Vianense - Freguesia 2º entrega" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/3)

---
## TML7D21

**Escala (1 linha(s)):**
- [ASSAI] LUCIANO MARINHO | loja="Assaí - São Gonçalo Centro - Loja 266" cod=266

**Unitrac (1 loja(s)):**
- `560047 SENDAS SÃO GONÇALO CENTRO`

**Match resultado:**
- ✓ "Assaí - São Gonçalo Centro - Loja 266" → `560047 SENDAS SÃO GONÇALO CENTRO` (nome 3 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## TML7D61

**Escala (2 linha(s)):**
- [SUPERPRIX] ERALDO | loja="Super Prix -Tijuquinha (1° ENTREGA)  Loja 13" cod=13
- [SUPERPRIX] ERALDO | loja="Super Prix - Tijuca  (2° °ENTREGA) Loja 14" cod=14

**Unitrac (5 loja(s)):**
- `3030013 SUPERPRIX LJ 13 - TIJUQUINHA`
- `3030014 SUPERPRIX LJ 14 - TIJUCA`
- `560030 SENDAS PILARES - LJ 128`
- `560032 SENDAS BARRA I - LJ 32`
- `560042 SENDAS BARRA II - LJ 245`

**Match resultado:**
- ✓ "Super Prix -Tijuquinha (1° ENTREGA)  Loja 13" → `3030013 SUPERPRIX LJ 13 - TIJUQUINHA` (suffix cod 13→3030013)
- ✓ "Super Prix - Tijuca  (2° °ENTREGA) Loja 14" → `3030014 SUPERPRIX LJ 14 - TIJUCA` (suffix cod 14→3030014)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## TML9I75

**Escala (1 linha(s)):**
- [PREZUNIC] ALEXANDRE | loja="Prezunic - Maricá" cod=—

**Unitrac (1 loja(s)):**
- `7000749 PREZUNIC MARICÁ`

**Match resultado:**
- ✓ "Prezunic - Maricá" → `7000749 PREZUNIC MARICÁ` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## UBF5G32

**Não está na escala. Está no Unitrac com 2 loja(s).**

- Unitrac: `560035 SENDAS MESQUITA - LJ 35`
- Unitrac: `560057 SENDAS CAXIAS II (PARQUE FLUMINENSE)`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## UBF5G33

**Não está na escala. Está no Unitrac com 2 loja(s).**

- Unitrac: `560039 SENDAS CESÁRIO DE MELO - LJ 202`
- Unitrac: `560058 SENDAS BANGU II`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## UBF5G36

**Não está na escala. Está no Unitrac com 2 loja(s).**

- Unitrac: `560026 SENDAS CEASA - LOJA 42`
- Unitrac: `560046 SENDAS CORDOVIL`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## UBG7F79

**Escala (2 linha(s)):**
- [ASSAI] MATHEUS SANDES | loja="Assaí - Bangu II - Loja 332" cod=332
- [SUPERPRIX] MATHEUS SANDES | loja="Super Prix - Barra - Loja 202" cod=202

**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)

---
## UBO0B68

**Escala (1 linha(s)):**
- [ASSAI] WALTER REGIS | loja="Assaí - Taquara   - Loja 340" cod=340

**Unitrac (1 loja(s)):**
- `560062 SENDAS JACAREPAGUA - LOJA 340 (TAQUARA)`

**Match resultado:**
- ✓ "Assaí - Taquara   - Loja 340" → `560062 SENDAS JACAREPAGUA - LOJA 340 (TAQUARA)` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## UBO5E01

**Escala (1 linha(s)):**
- [ASSAI] JEFERSON BATALHA | loja="AssaÍ - Ilha do Governador - Loja 29" cod=29

**Unitrac (1 loja(s)):**
- `560020 SENDAS ILHA - LOJA 29`

**Match resultado:**
- ✓ "AssaÍ - Ilha do Governador - Loja 29" → `560020 SENDAS ILHA - LOJA 29` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## UBO5E05

**Escala (4 linha(s)):**
- [ARMAZEM_GRAO] GILSON | loja="REGINA  BARRA DO IMBUY" cod=—
- [ARMAZEM_GRAO] GILSON | loja="REGINA  1 DE MAIO" cod=—
- [ARMAZEM_GRAO] GILSON | loja="REGINA  LUCIO MEIRA" cod=—
- [ARMAZEM_GRAO] GILSON | loja="ABASTECEDORA GRÃO DA SERRA (ALTO)" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## UEH9I93

**Escala (3 linha(s)):**
- [PRINCESA] CLAUDIO | loja="Princesa - Cabo Frio 1 (1ª Entrega)" cod=—
- [PRINCESA] CLAUDIO | loja="Princesa - Cabo Frio 2 (3ª Entrega)" cod=—
- [PRINCESA] CLAUDIO | loja="Princesa - Cabo Frio 3 (2ª Entrega)" cod=—

**Unitrac (3 loja(s)):**
- `8590565 PRINCESA - CABO FRIO 1`
- `8590566 PRINCESA - CABO FRIO 2`
- `8590567 PRINCESA - CABO FRIO 3`

**Match resultado:**
- ✓ "Princesa - Cabo Frio 1 (1ª Entrega)" → `8590565 PRINCESA - CABO FRIO 1` (nome 2 tokens)
- ✓ "Princesa - Cabo Frio 2 (3ª Entrega)" → `8590565 PRINCESA - CABO FRIO 1` (nome 2 tokens)
- ✓ "Princesa - Cabo Frio 3 (2ª Entrega)" → `8590565 PRINCESA - CABO FRIO 1` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (3/3)

---
## UFW0H63

**Escala (3 linha(s)):**
- [PREZUNIC] WILLIAM RODRIGUES | loja="Prezunic - Senador Camará" cod=—
- [PREZUNIC] WILLIAM RODRIGUES | loja="Prezunic - Realengo/ Serra Azul" cod=—
- [EMANUEL] JONATHAN MARCIO | loja="VARGEM_GRANDE" cod=—

**Unitrac (3 loja(s)):**
- `17659003 EMANUEL VARGEM GRANDE` ⚠ rota gigante
- `7000705 PREZUNIC SENADOR CAMARÁ`
- `7000712 PREZUNIC REALENGO`

**Match resultado:**
- ✓ "Prezunic - Senador Camará" → `7000705 PREZUNIC SENADOR CAMARÁ` (nome 2 tokens)
- ✓ "Prezunic - Realengo/ Serra Azul" → `7000712 PREZUNIC REALENGO` (nome 1 tokens)
- ✗ "VARGEM_GRANDE" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (2/3)

---
## UGA1D55

**Escala (2 linha(s)):**
- [ASSAI] FELIPE DIEGO | loja="Assaí - Sabão Rio (Benfica) - Loja 136" cod=136
- [SUPER_PAX] FERNANDO CARDOSO | loja="Sepetiba" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE
