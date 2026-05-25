# Análise match placa-por-placa — Dia 21/05/2026

Total placas analisadas: 161

## Sumário

| Diagnóstico | Qtd |
|------|-----|
| OK_FULL | 61 |
| PLACA_AUSENTE | 35 |
| FORA_ESCALA | 31 |
| OK_PARCIAL | 19 |
| INATIVA | 9 |
| FALHA_MATCH | 6 |

---
## AFY7J99

**Escala (4 linha(s)):**
- [PREZUNIC] WANDERLEY | loja="Prezunic - Jauru / Serra Azul" cod=—
- [PREZUNIC] WANDERLEY | loja="Prezunic - Taquara / Serra Azul" cod=—
- [ZONA_SUL] WANDERLEY | loja="Zona Sul Loja 12 - Leme" cod=12
- [ZONA_SUL] WANDERLEY | loja="Zona Sul Loja 38 - Copacabana" cod=38

**Unitrac (4 loja(s)):**
- `7000711 PREZUNIC JAURU`
- `7000719 PREZUNIC TAQUARA`
- `9039012 12 - ZONA SUL - LEME`
- `9039110 38 - ZONA SUL - COPACABANA DIAS DA ROCHA`

**Match resultado:**
- ✓ "Prezunic - Jauru / Serra Azul" → `7000711 PREZUNIC JAURU` (nome 1 tokens)
- ✓ "Prezunic - Taquara / Serra Azul" → `7000719 PREZUNIC TAQUARA` (nome 1 tokens)
- ✓ "Zona Sul Loja 12 - Leme" → `9039012 12 - ZONA SUL - LEME` (suffix cod 12→9039012)
- ✓ "Zona Sul Loja 38 - Copacabana" → `9039110 38 - ZONA SUL - COPACABANA DIAS DA ROCHA` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (4/4)

---
## AKZ2594

**Escala (2 linha(s)):**
- [ASSAI] NILTON | loja="Assaí - Freguesia - Loja 28" cod=28
- [ZONA_SUL] NILTON RODRIGUES | loja="Zona Sul Loja 10 - Recreio" cod=10

**Unitrac (1 loja(s)):**
- `560019 SENDAS FREGUESIA - LOJA 28`

**Match resultado:**
- ✓ "Assaí - Freguesia - Loja 28" → `560019 SENDAS FREGUESIA - LOJA 28` (nome 2 tokens)
- ✗ "Zona Sul Loja 10 - Recreio" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/2)

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
## AMW3424

**Escala (1 linha(s)):**
- [ASSAI] MESSIAS | loja="Assaí - Niterói Ponte - Loja 292" cod=292

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## AOP3C73

**Escala (1 linha(s)):**
- [ZONA_SUL] MOBRICI | loja="Zona Sul Loja 45 - Flamengo" cod=45

**Unitrac (3 loja(s)):**
- `9039104 33 - ZONA SUL - HUMAITA`
- `9039108 36 - ZONA SUL - BOTAFOGO`
- `9039120 45 - ZONA SUL - FLAMENGO`

**Match resultado:**
- ✓ "Zona Sul Loja 45 - Flamengo" → `9039120 45 - ZONA SUL - FLAMENGO` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

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

**Escala (1 linha(s)):**
- [FEIRA_NOVA] JOSUÉ | loja="3- Anchieta" cod=—

**Unitrac (2 loja(s)):**
- `579003 FEIRA NOVA ANCHIETA`
- `9039121 48 - ZONA SUL - RECREIO DOS BANDEIRANTES`

**Match resultado:**
- ✓ "3- Anchieta" → `579003 FEIRA NOVA ANCHIETA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## CDL8E52

**Escala (1 linha(s)):**
- [MUNDIAL] CLUDIOMIR | loja="MUNDIAL" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

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
## DBB8D19

**Escala (1 linha(s)):**
- [ZONA_SUL] PAULO HENRIQUE | loja="Zona Sul Loja 11 - Leblon" cod=11

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

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
- [ASSAI] MILTON | loja="Assaí - São João do Meriti  - Loja 217" cod=217

**Unitrac (1 loja(s)):**
- `560040 SENDAS SÃO JOÃO DE MERITI`

**Match resultado:**
- ✓ "Assaí - São João do Meriti  - Loja 217" → `560040 SENDAS SÃO JOÃO DE MERITI` (nome 3 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## EAK6G02

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018038 ROTA NITEROI / MARICA` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## EBG2D13

**Escala (1 linha(s)):**
- [ZONA_SUL] JONESON | loja="Zona Sul Loja 08 - Ipanema" cod=08

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

**Escala (5 linha(s)):**
- [PREZUNIC] WALLACE | loja="Prezunic SPID - Santa Rosa (Niterói)" cod=—
- [PRINCESA] WALLACE | loja="Princesa - Inga" cod=—
- [ZONA_SUL] WALLACE | loja="MEGA BOX 01 - Olaria" cod=MEGA
- [ZONA_SUL] WALLACE | loja="MEGA BOX 02 - Olaria" cod=MEGA
- [ZONA_SUL] WALLACE | loja="Zona Sul - Entrega Extra" cod=EXTRA

**Unitrac (4 loja(s)):**
- `6018000 MEGA BOX (OLARIA)`
- `6018001 MEGA BOX 2 (RECREIO)`
- `7000759 PREZUNIC SPID SANTA ROSA`
- `8590556 PRINCESA INGÁ`

**Match resultado:**
- ✓ "Prezunic SPID - Santa Rosa (Niterói)" → `7000759 PREZUNIC SPID SANTA ROSA` (nome 3 tokens)
- ✓ "Princesa - Inga" → `8590556 PRINCESA INGÁ` (nome 1 tokens)
- ✓ "MEGA BOX 01 - Olaria" → `6018000 MEGA BOX (OLARIA)` (nome 3 tokens)
- ✓ "MEGA BOX 02 - Olaria" → `6018000 MEGA BOX (OLARIA)` (nome 3 tokens)
- ✗ "Zona Sul - Entrega Extra" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (4/5)

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
## EZU9J51

**Escala (1 linha(s)):**
- [ASSAI] ALLAN | loja="Assaí - São Gonçalo Centro - Loja 266" cod=266

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
## GAR0802

**Escala (1 linha(s)):**
- [ASSAI] CRISTIANO | loja="Assaí - Maracanã - Loja 286" cod=286

**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)

---
## GBC6E12

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71032 GB 07 - BARRA`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## GGX3F42

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018035 ROTA REGIÃO DOS LAGOS` ⚠ ROTA GIGANTE

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
## GVH0163

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71030 GB 30 - BONSUCESSO`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## HOE4B58

**Não está na escala. Está no Unitrac com 2 loja(s).**

- Unitrac: `2018002 ROTA BOTAFOGO` ⚠ ROTA GIGANTE
- Unitrac: `2018035 ROTA REGIÃO DOS LAGOS` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## INW8A51

**Escala (3 linha(s)):**
- [ASSAI] WILLIAM | loja="Assaí - Caxias II (Parque Fluminense) - Loja 219" cod=219
- [SUPERPRIX] WILLIAM | loja="Super Prix -Riachuelo Loja 07" cod=07
- [ZONA_SUL] WILLIAM | loja="Zona Sul Loja 11 - Leblon" cod=11

**Unitrac (2 loja(s)):**
- `3030007 SUPERPRIX LJ 07 - RIACHUELO`
- `9039011 11 - ZONA SUL - LEBLON`

**Match resultado:**
- ✗ "Assaí - Caxias II (Parque Fluminense) - Loja 219" → SEM MATCH
- ✓ "Super Prix -Riachuelo Loja 07" → `3030007 SUPERPRIX LJ 07 - RIACHUELO` (suffix cod 07→3030007)
- ✓ "Zona Sul Loja 11 - Leblon" → `9039011 11 - ZONA SUL - LEBLON` (suffix cod 11→9039011)

**Diagnóstico:** ⚠ OK_PARCIAL (2/3)

---
## JAJ6B36

**Escala (3 linha(s)):**
- [PRINCESA] RENATO | loja="Princesa - Barra de São João (1ª Entrega)" cod=—
- [PRINCESA] RENATO | loja="Princesa - Rio das Ostras (2ª Entrega)" cod=—
- [ZONA_SUL] RENATO | loja="Zona Sul Loja 17 - Barra" cod=17

**Unitrac (2 loja(s)):**
- `8590562 PRINCESA - BARRA DE SÃO JOÃO`
- `8590568 PRINCESA - RIO DAS OSTRAS`

**Match resultado:**
- ✓ "Princesa - Barra de São João (1ª Entrega)" → `8590562 PRINCESA - BARRA DE SÃO JOÃO` (nome 4 tokens)
- ✓ "Princesa - Rio das Ostras (2ª Entrega)" → `8590568 PRINCESA - RIO DAS OSTRAS` (nome 3 tokens)
- ✓ "Zona Sul Loja 17 - Barra" → `8590562 PRINCESA - BARRA DE SÃO JOÃO` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (3/3)

---
## KMY5561

**Escala (2 linha(s)):**
- [CARREFOUR] LUÍZ ANTÔNIO | loja="Carrefour - Barra da Tijuca" cod=—
- [SUPER_PAX] LUIZ ANTONIO | loja="Realengo" cod=—

**Unitrac (2 loja(s)):**
- `202002 PAX REALENGO`
- `9006001 CARREFOUR BARRA`

**Match resultado:**
- ✓ "Carrefour - Barra da Tijuca" → `9006001 CARREFOUR BARRA` (nome 1 tokens)
- ✓ "Realengo" → `202002 PAX REALENGO` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## KMZ7057

**Escala (1 linha(s)):**
- [ASSAI] CARLINHOS | loja="Assaí - Niterói - Loja 41" cod=41

**Unitrac (1 loja(s)):**
- `560025 SENDAS NITERÓI - LOJA 41`

**Match resultado:**
- ✓ "Assaí - Niterói - Loja 41" → `560025 SENDAS NITERÓI - LOJA 41` (nome 2 tokens)

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
- [FEIRA_NOVA] MARCELO | loja="12- Freguesia" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## KNC5J75

**Escala (1 linha(s)):**
- [EMANUEL] JULIO | loja="Pedra / Obom Mato Alto / Maravilha" cod=—

**Unitrac (3 loja(s)):**
- `11139000 EMANUEL COMÉRCIO PEDRA DE GUARATIBA` ⚠ rota gigante
- `17659000 O BOM ATACADISTA` ⚠ rota gigante
- `21468000 EMANUEL JARDIM MARAVILHA` ⚠ rota gigante

**Match resultado:**
- ✗ "Pedra / Obom Mato Alto / Maravilha" → SEM MATCH

**Diagnóstico:** ✗ FALHA_MATCH (0/1)

---
## KNS8D16

**Escala (1 linha(s)):**
- [FEIRA_NOVA] ZOZIMO | loja="11- Boa Dica (Piabetá)" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## KNS8D26

**Escala (1 linha(s)):**
- [ASSAI] ZOZIMO | loja="Assaí - Taquara   - Loja 340" cod=340

**Unitrac (2 loja(s)):**
- `560062 SENDAS JACAREPAGUA - LOJA 340 (TAQUARA)`
- `579011 FEIRA NOVA BOA DICA (PIABETÁ)`

**Match resultado:**
- ✓ "Assaí - Taquara   - Loja 340" → `560062 SENDAS JACAREPAGUA - LOJA 340 (TAQUARA)` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

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
## KOP4978

**Escala (4 linha(s)):**
- [PREZUNIC] MILTON | loja="Prezunic - Campinho" cod=—
- [PREZUNIC] MILTON | loja="Prezunic - Cidade de Deus" cod=—
- [ZONA_SUL] MILTON | loja="Zona Sul Loja 26 - Copacabana" cod=26
- [ZONA_SUL] MILTON | loja="Zona Sul Loja 19 - Copacabana" cod=19

**Unitrac (1 loja(s)):**
- `7000716 PREZUNIC CIDADE DE DEUS`

**Match resultado:**
- ✗ "Prezunic - Campinho" → SEM MATCH
- ✓ "Prezunic - Cidade de Deus" → `7000716 PREZUNIC CIDADE DE DEUS` (nome 3 tokens)
- ✗ "Zona Sul Loja 26 - Copacabana" → SEM MATCH
- ✗ "Zona Sul Loja 19 - Copacabana" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/4)

---
## KPB5I95

**Escala (2 linha(s)):**
- [PREZUNIC] JOSE ROBERTO | loja="Prezunic - Tijuca" cod=—
- [SAMS_CLUB] JOSE ROBERTO | loja="Sam's - Niterói" cod=—

**Unitrac (2 loja(s)):**
- `4568001 SAMS NITEROI`
- `7000747 PREZUNIC TIJUCA`

**Match resultado:**
- ✓ "Prezunic - Tijuca" → `7000747 PREZUNIC TIJUCA` (nome 1 tokens)
- ✓ "Sam's - Niterói" → `4568001 SAMS NITEROI` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

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

**Escala (1 linha(s)):**
- [ASSAI] AGENOR | loja="Assaí - Petrópolis- Loja 181" cod=181

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## KPS4J07

**Escala (2 linha(s)):**
- [PREZUNIC] ELVIS 2° ENTREGA | loja="Prezunic - Botafogo / Serra Azul" cod=—
- [PRINCESA] ELVIS | loja="Princesa - Laranjeiras" cod=—

**Unitrac (1 loja(s)):**
- `8590218 PRINCESA LARANJEIRAS`

**Match resultado:**
- ✗ "Prezunic - Botafogo / Serra Azul" → SEM MATCH
- ✓ "Princesa - Laranjeiras" → `8590218 PRINCESA LARANJEIRAS` (nome 1 tokens)

**Diagnóstico:** ⚠ OK_PARCIAL (1/2)

---
## KPT5B20

**Escala (1 linha(s)):**
- [ASSAI] ROBERTO ALMEIDA | loja="Assaí - Sabão Rio (Benfica) - Loja 136" cod=136

**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)

---
## KQB3F31

**Escala (3 linha(s)):**
- [ASSAI] DIEGO | loja="Assaí - Bangu I - Loja 55" cod=55
- [ZONA_SUL] DIEGO | loja="Zona Sul Loja 23 - Barra" cod=23
- [ZONA_SUL] DIEGO | loja="Zona Sul Loja 44 - Barra" cod=44

**Unitrac (1 loja(s)):**
- `560028 SENDAS BANGU - LOJA 55`

**Match resultado:**
- ✓ "Assaí - Bangu I - Loja 55" → `560028 SENDAS BANGU - LOJA 55` (nome 2 tokens)
- ✗ "Zona Sul Loja 23 - Barra" → SEM MATCH
- ✗ "Zona Sul Loja 44 - Barra" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/3)

---
## KQR2J11

**Escala (5 linha(s)):**
- [PREZUNIC] KANU | loja="Prezunic SPID - Botafogo" cod=—
- [PREZUNIC] KANU | loja="Prezunic SPID - Farme de Amoedo" cod=—
- [PREZUNIC] KANU | loja="Prezunic SPID - Visconde de Pirajá (Ipanema)" cod=—
- [PREZUNIC] KANU | loja="Prezunic SPID - Copacabana" cod=—
- [PRINCESA] KANU | loja="Princesa - Flamengo" cod=—

**Unitrac (6 loja(s)):**
- `7000738 PREZUNIC SPID BOTAFOGO`
- `7000745 PREZUNIC SPID FARME DE AMOEDO`
- `7000756 PREZUNIC SPID COPACABANA`
- `7000758 PREZUNIC SPID IPANEMA V. PIRAJA`
- `8590165 PRINCESA FLAMENGO`
- `9039007 07 - ZONA SUL - LEBLON`

**Match resultado:**
- ✓ "Prezunic SPID - Botafogo" → `7000738 PREZUNIC SPID BOTAFOGO` (nome 2 tokens)
- ✓ "Prezunic SPID - Farme de Amoedo" → `7000745 PREZUNIC SPID FARME DE AMOEDO` (nome 4 tokens)
- ✓ "Prezunic SPID - Visconde de Pirajá (Ipanema)" → `7000758 PREZUNIC SPID IPANEMA V. PIRAJA` (nome 3 tokens)
- ✓ "Prezunic SPID - Copacabana" → `7000756 PREZUNIC SPID COPACABANA` (nome 2 tokens)
- ✓ "Princesa - Flamengo" → `8590165 PRINCESA FLAMENGO` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (5/5)

---
## KQV1D80

**Escala (1 linha(s)):**
- [PREZUNIC] DOVAL | loja="Prezunic - Fonseca" cod=—

**Unitrac (1 loja(s)):**
- `7000722 PREZUNIC FONSECA`

**Match resultado:**
- ✓ "Prezunic - Fonseca" → `7000722 PREZUNIC FONSECA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KQX9G38

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018023 ROTA ZONA NORTE` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KQY9E24

**Escala (1 linha(s)):**
- [ZONA_SUL] VLADIMIR | loja="Zona Sul Loja 46 - Botafogo" cod=46

**Unitrac (2 loja(s)):**
- `9039015 15 - ZONA SUL - LEBLON`
- `9039027 27 - ZONA SUL - IPANEMA`

**Match resultado:**
- ✗ "Zona Sul Loja 46 - Botafogo" → SEM MATCH

**Diagnóstico:** ✗ FALHA_MATCH (0/1)

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

**Escala (2 linha(s)):**
- [PRINCESA] ERIVELTON | loja="Princesa - Cosme Velho" cod=—
- [ZONA_SUL] ERIVELTON | loja="Zona Sul Loja 01 - Ipanema" cod=01

**Unitrac (2 loja(s)):**
- `8590000 PRINCESA COSME VELHO`
- `9039001 01 - ZONA SUL - IPANEMA`

**Match resultado:**
- ✓ "Princesa - Cosme Velho" → `8590000 PRINCESA COSME VELHO` (nome 2 tokens)
- ✓ "Zona Sul Loja 01 - Ipanema" → `9039001 01 - ZONA SUL - IPANEMA` (suffix cod 01→9039001)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## KRK3D12

**Escala (2 linha(s)):**
- [ASSAI] JOSÉLIO | loja="Assaí - Alcântara I - Loja 35" cod=35
- [ZONA_SUL] JOSENILDO ANISIO | loja="Zona Sul Loja 40 - Ipanema" cod=40

**Unitrac (2 loja(s)):**
- `560022 SENDAS ALCÂNTARA I - LOJA 35`
- `9039118 40 - ZONA SUL- IPANEMA`

**Match resultado:**
- ✓ "Assaí - Alcântara I - Loja 35" → `560022 SENDAS ALCÂNTARA I - LOJA 35` (nome 2 tokens)
- ✓ "Zona Sul Loja 40 - Ipanema" → `9039118 40 - ZONA SUL- IPANEMA` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## KRW8E86

**Escala (2 linha(s)):**
- [ASSAI] RENAN | loja="Assaí - Bangu II - Loja 332" cod=332
- [CARREFOUR] RENAN | loja="Carrefour - Campo Grande" cod=—

**Unitrac (2 loja(s)):**
- `560058 SENDAS BANGU II`
- `9006154 CARREFOUR CAMPO GRANDE`

**Match resultado:**
- ✓ "Assaí - Bangu II - Loja 332" → `560058 SENDAS BANGU II` (nome 2 tokens)
- ✓ "Carrefour - Campo Grande" → `9006154 CARREFOUR CAMPO GRANDE` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## KSJ1479

**Escala (1 linha(s)):**
- [ASSAI] EDVALDO | loja="Assaí - Pilares - Loja 128" cod=128

**Unitrac (1 loja(s)):**
- `560030 SENDAS PILARES - LJ 128`

**Match resultado:**
- ✓ "Assaí - Pilares - Loja 128" → `560030 SENDAS PILARES - LJ 128` (nome 2 tokens)

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

**Escala (2 linha(s)):**
- [ASSAI] JOHN | loja="Assaí - Cordovil - Loja 231" cod=231
- [CARREFOUR] JOHN | loja="Carrefour - Sulacap" cod=—

**Unitrac (2 loja(s)):**
- `560046 SENDAS CORDOVIL`
- `9006007 CARREFOUR SULACAP`

**Match resultado:**
- ✓ "Assaí - Cordovil - Loja 231" → `560046 SENDAS CORDOVIL` (nome 1 tokens)
- ✓ "Carrefour - Sulacap" → `9006007 CARREFOUR SULACAP` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## KVT5427

**Escala (5 linha(s)):**
- [PREZUNIC] RAFAEL | loja="Prezunic SPID - Glória" cod=—
- [PREZUNIC] RAFAEL | loja="Prezunic SPID - Carioca" cod=—
- [PREZUNIC] RAFAEL | loja="Prezunic SPID - Centro" cod=—
- [PRINCESA] RAFAEL | loja="Princesa - Catete" cod=—
- [EMANUEL] RAFAEL | loja="SANTA_MARIA" cod=—

**Unitrac (4 loja(s)):**
- `7000744 PREZUNIC SPID ESTAÇÃO CARIOCA (METRÔ)`
- `7000754 PREZUNIC SPID GLÓRIA`
- `7000755 PREZUNIC SPID CENTRO`
- `8590120 PRINCESA CATETE`

**Match resultado:**
- ✓ "Prezunic SPID - Glória" → `7000754 PREZUNIC SPID GLÓRIA` (nome 2 tokens)
- ✓ "Prezunic SPID - Carioca" → `7000744 PREZUNIC SPID ESTAÇÃO CARIOCA (METRÔ)` (nome 2 tokens)
- ✓ "Prezunic SPID - Centro" → `7000755 PREZUNIC SPID CENTRO` (nome 2 tokens)
- ✓ "Princesa - Catete" → `8590120 PRINCESA CATETE` (nome 1 tokens)
- ✗ "SANTA_MARIA" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (4/5)

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
- [EMANUEL] WANDERSON | loja="Cachamorra / Agulhas" cod=—

**Unitrac (5 loja(s)):**
- `17659001 O BOM CAMPO GRANDE` ⚠ rota gigante
- `17659002 EMANUEL CACHAMORRA` ⚠ rota gigante
- `25140000 EMANUEL- REDE ECONOMIA SANTA MARIA` ⚠ rota gigante
- `8590034 PRINCESA COPACABANA`
- `8590134 PRINCESA LEME`

**Match resultado:**
- ✓ "Princesa - Copacabana" → `8590034 PRINCESA COPACABANA` (nome 1 tokens)
- ✓ "Princesa - Leme" → `8590134 PRINCESA LEME` (nome 1 tokens)
- ✗ "Cachamorra / Agulhas" → SEM MATCH

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
- [ZONA_SUL] RODRIGO | loja="Zona Sul Loja 05 - Copacabana III" cod=05
- [ZONA_SUL] RODRIGO | loja="Zona Sul Loja 20 - Botafogo" cod=20

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## KWV7E89

**Escala (1 linha(s)):**
- [PREZUNIC] MAGACIEL | loja="Prezunic - Campo Grande / Serra Azul" cod=—

**Unitrac (1 loja(s)):**
- `7000710 PREZUNIC CAMPO GRANDE`

**Match resultado:**
- ✓ "Prezunic - Campo Grande / Serra Azul" → `7000710 PREZUNIC CAMPO GRANDE` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KXA5966

**Escala (1 linha(s)):**
- [SENDAS] SANDRO | loja="Mercearia Sachinho (Vargem Grande)" cod=—

**Unitrac (1 loja(s)):**
- `15247000 MERCEARIA SACHINHO`

**Match resultado:**
- ✓ "Mercearia Sachinho (Vargem Grande)" → `15247000 MERCEARIA SACHINHO` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KXB6E57

**Escala (1 linha(s)):**
- [PREZUNIC] RICARDO | loja="Prezunic - Padre Miguel" cod=—

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

**Unitrac (4 loja(s)):**
- `202004 PAX DEL CASTILHO`
- `202009 PAX PILARES`
- `7000715 PREZUNIC VISTA ALEGRE`
- `7000720 PREZUNIC ITAOCA`

**Match resultado:**
- ✓ "Prezunic - Itaoca" → `7000720 PREZUNIC ITAOCA` (nome 1 tokens)
- ✓ "Prezunic - Vista Alegre" → `7000715 PREZUNIC VISTA ALEGRE` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## KYK8G07

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018005 ROTA CAMPOS` ⚠ ROTA GIGANTE

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

**Unitrac (3 loja(s)):**
- `2018023 ROTA ZONA NORTE` ⚠ rota gigante
- `3030011 SUPERPRIX LJ 10 - ICARAÍ`
- `3030113 SUPERPRIX LJ 13 - NITEROI`

**Match resultado:**
- ✓ "Super Prix - Niterói - Loja 13 - 1° ENTREGA" → `3030113 SUPERPRIX LJ 13 - NITEROI` (suffix cod 13→3030113)
- ✓ "Super Prix - Icaraí - Loja 10 - 2° ENTREGA" → `3030011 SUPERPRIX LJ 10 - ICARAÍ` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## KZH6F33

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018014 ROTA ILHA` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KZJ0E14

**Escala (1 linha(s)):**
- [ASSAI] RODRIGO | loja="Assaí - Campos dos Goytacazes- Loja 188" cod=188

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

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

**Unitrac (1 loja(s)):**
- `7000721 PREZUNIC NILÓPOLIS`

**Match resultado:**
- ✓ "Prezunic - Nilópolis" → `7000721 PREZUNIC NILÓPOLIS` (nome 1 tokens)
- ✗ "Sam's - Linha Amarela" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/2)

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
## LCE4337

**Escala (2 linha(s)):**
- [PREZUNIC] ANDERSON | loja="Prezunic - Caxias Centro / Serra Azul" cod=—
- [PREZUNIC] ANDERSON | loja="Prezunic - Caxias Centenário" cod=—

**Unitrac (2 loja(s)):**
- `7000713 PREZUNIC CAXIAS CENTENÁRIO`
- `7000717 PREZUNIC CAXIAS CENTRO`

**Match resultado:**
- ✓ "Prezunic - Caxias Centro / Serra Azul" → `7000717 PREZUNIC CAXIAS CENTRO` (nome 2 tokens)
- ✓ "Prezunic - Caxias Centenário" → `7000713 PREZUNIC CAXIAS CENTENÁRIO` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## LFA4744

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71014 GB 14 - REALENGO`

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
## LIA7G83

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71038 GB 19 - TANQUE`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## LJS2172

**Escala (2 linha(s)):**
- [ZONA_SUL] SÉRGIO JOSE DA SILVA | loja="Zona Sul Loja 35 - Barra" cod=35
- [ZONA_SUL] SÉRGIO JOSE DA SILVA | loja="Zona Sul Loja 43 - Barra (Península)" cod=43

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LJS2B72

**Escala (1 linha(s)):**
- [CARREFOUR] SÉRGIO | loja="Carrefour - Norte Shopping" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LKF7A79

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71008 GB 08 - NITEROI`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## LKR5990

**Escala (3 linha(s)):**
- [PREZUNIC] AGNALDO | loja="Prezunic - Méier / Serra Azul" cod=—
- [ZONA_SUL] AGNALDO | loja="MEGA BOX 01 - Olaria" cod=MEGA
- [ZONA_SUL] AGNALDO | loja="Zona Sul Loja 03 - Copacabana I" cod=03

**Unitrac (1 loja(s)):**
- `7000729 PREZUNIC MEIER`

**Match resultado:**
- ✓ "Prezunic - Méier / Serra Azul" → `7000729 PREZUNIC MEIER` (nome 1 tokens)
- ✗ "MEGA BOX 01 - Olaria" → SEM MATCH
- ✗ "Zona Sul Loja 03 - Copacabana I" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/3)

---
## LKV5067

**Escala (4 linha(s)):**
- [PREZUNIC] DANIEL | loja="Prezunic - Penha" cod=—
- [PREZUNIC] DANIEL | loja="Prezunic - Olaria" cod=—
- [SENDAS] JOSÉ CARLOS | loja="Americanas" cod=—
- [SUPER_PAX] DANIEL | loja="Inhauma" cod=—

**Unitrac (3 loja(s)):**
- `202003 PAX INHAUMA`
- `7000714 PREZUNIC OLARIA`
- `7000723 PREZUNIC PENHA`

**Match resultado:**
- ✓ "Prezunic - Penha" → `7000723 PREZUNIC PENHA` (nome 1 tokens)
- ✓ "Prezunic - Olaria" → `7000714 PREZUNIC OLARIA` (nome 1 tokens)
- ✗ "Americanas" → SEM MATCH
- ✓ "Inhauma" → `202003 PAX INHAUMA` (nome 1 tokens)

**Diagnóstico:** ⚠ OK_PARCIAL (3/4)

---
## LKW2B80

**Escala (2 linha(s)):**
- [ZONA_SUL] ALEX | loja="Zona Sul Loja 28 - Urca" cod=28
- [ZONA_SUL] ALEX | loja="Zona Sul Loja 29 - Flamengo" cod=29

**Unitrac (3 loja(s)):**
- `9039018 18 - ZONA SUL - COPACABANA`
- `9039028 28 - ZONA SUL - URCA`
- `9039029 29 - ZONA SUL - FLAMENGO`

**Match resultado:**
- ✓ "Zona Sul Loja 28 - Urca" → `9039028 28 - ZONA SUL - URCA` (suffix cod 28→9039028)
- ✓ "Zona Sul Loja 29 - Flamengo" → `9039029 29 - ZONA SUL - FLAMENGO` (suffix cod 29→9039029)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## LLJ9C64

**Escala (6 linha(s)):**
- [PREZUNIC] HELIO ALVES | loja="Prezunic - Barra da Tijuca" cod=—
- [PREZUNIC] HELIO ALVES | loja="Prezunic SPID - Jacarepagua" cod=—
- [PREZUNIC] HELIO ALVES | loja="Prezunic SPID - Recreio" cod=—
- [PREZUNIC] HELIO ALVES | loja="Prezunic SPID - Barra" cod=—
- [PREZUNIC] HELIO ALVES | loja="Prezunic SPID - Alpha Mall" cod=—
- [PREZUNIC] HELIO ALVES | loja="Prezunic SPID - Parque das Rosas" cod=—

**Unitrac (3 loja(s)):**
- `7000734 PREZUNIC BARRA`
- `7000740 PREZUNIC SPID ALPHA MALL`
- `7000752 PREZUNIC SPID RECREIO`

**Match resultado:**
- ✓ "Prezunic - Barra da Tijuca" → `7000734 PREZUNIC BARRA` (nome 1 tokens)
- ✓ "Prezunic SPID - Jacarepagua" → `7000740 PREZUNIC SPID ALPHA MALL` (nome 1 tokens)
- ✓ "Prezunic SPID - Recreio" → `7000752 PREZUNIC SPID RECREIO` (nome 2 tokens)
- ✓ "Prezunic SPID - Barra" → `7000734 PREZUNIC BARRA` (nome 1 tokens)
- ✓ "Prezunic SPID - Alpha Mall" → `7000740 PREZUNIC SPID ALPHA MALL` (nome 3 tokens)
- ✓ "Prezunic SPID - Parque das Rosas" → `7000740 PREZUNIC SPID ALPHA MALL` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (6/6)

---
## LMF2049

**Escala (2 linha(s)):**
- [PRINCESA] LUIZ CESAR | loja="Princesa - Niteroí Barcas" cod=—
- [SENDAS] LUIZ CESAR | loja="Mercado de Santa" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LMF2A49

**Escala (1 linha(s)):**
- [EMANUEL] LUIZ CESAR | loja="VARGEM_GRANDE" cod=—

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

**Unitrac (2 loja(s)):**
- `202010 PAX VILA DA PENHA`
- `7000709 PREZUNIC PECHINCHA`

**Match resultado:**
- ✓ "Prezunic - Pechincha" → `7000709 PREZUNIC PECHINCHA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## LNU9595

**Escala (1 linha(s)):**
- [ZONA_SUL] CARLOS GONÇALVES | loja="Zona Sul Loja 19 - Copacabana" cod=19

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LON7G98

**Escala (1 linha(s)):**
- [ASSAI] FÁBIO DEUSETI | loja="Assaí - Tribobó - Loja 248" cod=248

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LOT2962

**Escala (1 linha(s)):**
- [ASSAI] JOAO CARLOS | loja="Assaí - Nova Iguaçu 2 - Loja 291" cod=291

**Unitrac (1 loja(s)):**
- `560054 SENDAS NOVA IGUAÇU II`

**Match resultado:**
- ✓ "Assaí - Nova Iguaçu 2 - Loja 291" → `560054 SENDAS NOVA IGUAÇU II` (nome 1 tokens)

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

- Unitrac: `2018009 ROTA CENTRO` ⚠ ROTA GIGANTE

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
## LQA5883

**Escala (1 linha(s)):**
- [ZONA_SUL] EDUARDO | loja="Zona Sul Loja 34 - Barra" cod=34

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LQE5E01

**Escala (1 linha(s)):**
- [ARMAZEM_GRAO] SIDNEI | loja="ARMAZEM DO GRAO A. BARRA DA TIJUCA" cod=—

**Unitrac (3 loja(s)):**
- `5353011 ARMAZEM DO GRAO (BARRA DA TIJUCA)`
- `9039030 30 - ZONA SUL - LARANJEIRAS`
- `9039103 21 - ZONA SUL - FLAMENGO`

**Match resultado:**
- ✓ "ARMAZEM DO GRAO A. BARRA DA TIJUCA" → `5353011 ARMAZEM DO GRAO (BARRA DA TIJUCA)` (nome 4 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## LQU5546

**Escala (1 linha(s)):**
- [ZONA_SUL] INACIO ARAUJO | loja="Zona Sul Loja 14 - Leblon" cod=14

**Unitrac (1 loja(s)):**
- `9039101 14 - ZONA SUL - LEBLON`

**Match resultado:**
- ✓ "Zona Sul Loja 14 - Leblon" → `9039101 14 - ZONA SUL - LEBLON` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## LRA9C41

**Escala (2 linha(s)):**
- [PRINCESA] DIEGO | loja="Princesa - Iguaba (1º Entrega)" cod=—
- [PRINCESA] DIEGO | loja="Princesa - Itaboraí (2ª Entrega)" cod=—

**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)

---
## LSE1D35

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018016 ROTA MACAE` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## LSL9670

**Escala (3 linha(s)):**
- [ASSAI] ROBERTO | loja="Assaí - Nova Iguaçu - Loja 30" cod=30
- [ARMAZEM_GRAO] ROBERTO | loja="ARMAZEM DO GRÃO (ITAIPAVA)" cod=—
- [ARMAZEM_GRAO] ROBERTO | loja="ARMAZEM DO GRAO (CORREAS)" cod=—

**Unitrac (3 loja(s)):**
- `5353003 ARMAZEM DO GRÃO (ITAIPAVA)`
- `5353006 ARMAZEM DO GRAO (CORREAS)`
- `560021 SENDAS NOVA IGUAÇU - LOJA 30`

**Match resultado:**
- ✓ "Assaí - Nova Iguaçu - Loja 30" → `560021 SENDAS NOVA IGUAÇU - LOJA 30` (nome 2 tokens)
- ✓ "ARMAZEM DO GRÃO (ITAIPAVA)" → `5353003 ARMAZEM DO GRÃO (ITAIPAVA)` (nome 2 tokens)
- ✓ "ARMAZEM DO GRAO (CORREAS)" → `5353006 ARMAZEM DO GRAO (CORREAS)` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (3/3)

---
## LSN6I72

**Escala (2 linha(s)):**
- [ASSAI] SIMÃO | loja="Assaí - Santa Cruz 2 - Loja 338" cod=338
- [CARREFOUR] SIMÃO | loja="Carrefour - Brigadeiro (Caxias)" cod=—

**Unitrac (1 loja(s)):**
- `9006144 CARREFOUR BRIGADEIRO`

**Match resultado:**
- ✗ "Assaí - Santa Cruz 2 - Loja 338" → SEM MATCH
- ✓ "Carrefour - Brigadeiro (Caxias)" → `9006144 CARREFOUR BRIGADEIRO` (nome 1 tokens)

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

**Unitrac (1 loja(s)):**
- `7000704 PREZUNIC CATUMBI`

**Match resultado:**
- ✓ "Prezunic - Catumbi / Serra Azul" → `7000704 PREZUNIC CATUMBI` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## LTE0A64

**Escala (1 linha(s)):**
- [ZONA_SUL] DOUGLAS | loja="Zona Sul Loja 31 - Jd. Botânico" cod=31

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LTH4J15

**Escala (6 linha(s)):**
- [SENDAS] MÁRCIO | loja="Atlantico Sul (Barra da Tijuca)" cod=—
- [SENDAS] MÁRCIO | loja="Barramares (Barra da Tijuca)" cod=—
- [SENDAS] MÁRCIO | loja="Barra Tower" cod=—
- [VIANENSE] MÁRCIO | loja="Vianense - Nova Iguaçu 1º entrega" cod=—
- [VIANENSE] MÁRCIO | loja="Vianense - Jardim Alvorada 2º entrega" cod=—
- [ZONA_SUL] MARCIO | loja="Zona Sul Loja 47" cod=47

**Unitrac (4 loja(s)):**
- `22144000 PETIT MARCHE BARRAMARES`
- `22144002 PETIT ATLANTICO SUL`
- `22980000 EMPORIO BARRA TOWER`
- `9039124 47- ZONA SUL` ⚠ rota gigante

**Match resultado:**
- ✓ "Atlantico Sul (Barra da Tijuca)" → `22144002 PETIT ATLANTICO SUL` (nome 1 tokens)
- ✓ "Barramares (Barra da Tijuca)" → `22144000 PETIT MARCHE BARRAMARES` (nome 1 tokens)
- ✓ "Barra Tower" → `22980000 EMPORIO BARRA TOWER` (nome 2 tokens)
- ✗ "Vianense - Nova Iguaçu 1º entrega" → SEM MATCH
- ✗ "Vianense - Jardim Alvorada 2º entrega" → SEM MATCH
- ✗ "Zona Sul Loja 47" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (3/6)

---
## LTQ0783

**Escala (1 linha(s)):**
- [ZONA_SUL] EDMILSON JOSÉ | loja="Zona Sul Loja 09 - Ipanema" cod=09

**Unitrac (1 loja(s)):**
- `9039009 09 - ZONA SUL - IPANEMA`

**Match resultado:**
- ✓ "Zona Sul Loja 09 - Ipanema" → `9039009 09 - ZONA SUL - IPANEMA` (suffix cod 09→9039009)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## LUP1F13

**Escala (2 linha(s)):**
- [ASSAI] CARLOS DO SANTOS | loja="Assaí - Mendanha (Campo Grande) - Loja 65" cod=65
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

**Escala (2 linha(s)):**
- [ZONA_SUL] ANDERSON | loja="Zona Sul Loja 25 - Jd. Botânico" cod=25
- [ZONA_SUL] ANDERSON | loja="Zona Sul Loja 22 - S. Conrado" cod=22

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## MDV3746

**Escala (1 linha(s)):**
- [ZONA_SUL] PAULO ROBERTO | loja="MEGA BOX 02 - Olaria" cod=MEGA

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

**Escala (2 linha(s)):**
- [PREZUNIC] ALISSON | loja="Prezunic SPID - Freguesia" cod=—
- [PRINCESA] ALISSON | loja="Princesa - Pechincha" cod=—

**Unitrac (1 loja(s)):**
- `8590031 PRINCESA PECHINCHA`

**Match resultado:**
- ✗ "Prezunic SPID - Freguesia" → SEM MATCH
- ✓ "Princesa - Pechincha" → `8590031 PRINCESA PECHINCHA` (nome 1 tokens)

**Diagnóstico:** ⚠ OK_PARCIAL (1/2)

---
## NSM6D98

**Escala (3 linha(s)):**
- [CARREFOUR] FLÁVIO | loja="Carrefour - Alcântara" cod=—
- [SAMS_CLUB] FLÁVIO | loja="Sam's - Barra (Ayrton Senna)" cod=—
- [SENDAS] FLÁVIO | loja="Santo Agostinho" cod=—

**Unitrac (2 loja(s)):**
- `9006012 CARREFOUR ALCANTARA`
- `9966101 SUPERMARKET COELHO NETO`

**Match resultado:**
- ✓ "Carrefour - Alcântara" → `9006012 CARREFOUR ALCANTARA` (nome 1 tokens)
- ✗ "Sam's - Barra (Ayrton Senna)" → SEM MATCH
- ✗ "Santo Agostinho" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/3)

---
## NTT4858

**Escala (1 linha(s)):**
- [PREZUNIC] EDUARDO | loja="Prezunic - Recreio dos Bandeirantes" cod=—

**Unitrac (1 loja(s)):**
- `7000702 PREZUNIC RECREIO`

**Match resultado:**
- ✓ "Prezunic - Recreio dos Bandeirantes" → `7000702 PREZUNIC RECREIO` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## QAH2H50

**Escala (2 linha(s)):**
- [ZONA_SUL] EDUARDO | loja="Zona Sul Loja 32 - Laranjeiras" cod=32
- [ZONA_SUL] EDUARDO | loja="Zona Sul Loja 42 - Botafogo" cod=42

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

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

**Unitrac (3 loja(s)):**
- `8590563 PRINCESA - BUZIOS 1`
- `8590564 PRINCESA - BUZIOS 2`
- `8590571 PRINCESA - BUZIOS 3`

**Match resultado:**
- ✓ "Princesa - Buzios 1 (2ª Entrega)" → `8590563 PRINCESA - BUZIOS 1` (nome 1 tokens)
- ✓ "Princesa - Buzios 2 (3ª Entrega)" → `8590563 PRINCESA - BUZIOS 1` (nome 1 tokens)
- ✓ "Princesa - Buzios 3 (1ª Entrega)" → `8590563 PRINCESA - BUZIOS 1` (nome 1 tokens)
- ✗ "ARMAZEM DO GRÃO (VALPARAÍSO)" → SEM MATCH
- ✗ "ARMAZEM DO GRÃO  (MOSELA)" → SEM MATCH
- ✗ "ARMAZEM DO GRÃO (QUITANDINHA)" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (3/6)

---
## QSU6I54

**Escala (4 linha(s)):**
- [ARMAZEM_GRAO] GILSON | loja="REGINA  BARRA DO IMBUY" cod=—
- [ARMAZEM_GRAO] GILSON | loja="REGINA  1 DE MAIO" cod=—
- [ARMAZEM_GRAO] GILSON | loja="REGINA  LUCIO MEIRA" cod=—
- [ARMAZEM_GRAO] GILSON | loja="ABASTECEDORA GRÃO DA SERRA (ALTO)" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

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

**Escala (2 linha(s)):**
- [PRINCESA] DANIEL CAVALCANTE | loja="Princesa - Maricá 1 (2ª Entrega)" cod=—
- [PRINCESA] DANIEL CAVALCANTE | loja="Princesa - Maricá 2 (1ª Entrega)" cod=—

**Unitrac (6 loja(s)):**
- `5353012 REGINA BARRA DO IMBUY` ⚠ rota gigante
- `5353014 REGINA 1 DE MAIO` ⚠ rota gigante
- `5353016 REGINA LUCIO MEIRA` ⚠ rota gigante
- `5353017 ABASTECEDORA GRÃO DA SERRA (ALTO)` ⚠ rota gigante
- `8590002 PRINCESA MARICÁ 1`
- `8590003 PRINCESA MARICÁ 2`

**Match resultado:**
- ✓ "Princesa - Maricá 1 (2ª Entrega)" → `8590002 PRINCESA MARICÁ 1` (nome 1 tokens)
- ✓ "Princesa - Maricá 2 (1ª Entrega)" → `8590002 PRINCESA MARICÁ 1` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## RJN9F68

**Escala (5 linha(s)):**
- [PREZUNIC] JULIO PEREIRA | loja="Prezunic SPID - Tijuca" cod=—
- [PREZUNIC] JULIO PEREIRA | loja="Prezunic SPID - Vila Isabel" cod=—
- [PREZUNIC] JULIO PEREIRA | loja="Prezunic SPID - Meier" cod=—
- [PRINCESA] JULIO PEREIRA | loja="Princesa - Fonseca" cod=—
- [PRINCESA] JULIO PEREIRA | loja="Princesa - Icaraí" cod=—

**Unitrac (3 loja(s)):**
- `560062 SENDAS JACAREPAGUA - LOJA 340 (TAQUARA)`
- `8590004 PRINCESA ICARAÍ`
- `8590555 PRINCESA FONSECA`

**Match resultado:**
- ✗ "Prezunic SPID - Tijuca" → SEM MATCH
- ✗ "Prezunic SPID - Vila Isabel" → SEM MATCH
- ✗ "Prezunic SPID - Meier" → SEM MATCH
- ✓ "Princesa - Fonseca" → `8590555 PRINCESA FONSECA` (nome 1 tokens)
- ✓ "Princesa - Icaraí" → `8590004 PRINCESA ICARAÍ` (nome 1 tokens)

**Diagnóstico:** ⚠ OK_PARCIAL (2/5)

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

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018002 ROTA BOTAFOGO` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## SVB1F74

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
## TJQ6J26

**Escala (1 linha(s)):**
- [ASSAI] VICTOR LUIZ | loja="Assaí - Caxias I - Loja 131" cod=131

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## TML1D82

**Escala (1 linha(s)):**
- [ASSAI] WALLACE FERNANDES | loja="Assaí - Mesquita (Dutra) - Loja 142" cod=142

**Unitrac (1 loja(s)):**
- `560035 SENDAS MESQUITA - LJ 35`

**Match resultado:**
- ✓ "Assaí - Mesquita (Dutra) - Loja 142" → `560035 SENDAS MESQUITA - LJ 35` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## TML5I70

**Escala (2 linha(s)):**
- [PREZUNIC] ADRIANO | loja="Prezunic - Engenho Novo" cod=—
- [PREZUNIC] ADRIANO | loja="Prezunic - Benfica" cod=—

**Unitrac (3 loja(s)):**
- `202012 PAX SEPETIBA`
- `7000706 PREZUNIC BENFICA`
- `7000708 PREZUNIC ENGENHO NOVO`

**Match resultado:**
- ✓ "Prezunic - Engenho Novo" → `7000708 PREZUNIC ENGENHO NOVO` (nome 2 tokens)
- ✓ "Prezunic - Benfica" → `7000706 PREZUNIC BENFICA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## TML6D96

**Escala (3 linha(s)):**
- [PREZUNIC] JOSE ROBERTO | loja="Prezunic - Freguesia" cod=—
- [VIANENSE] JOSE ROBERTO | loja="Vianense - Recreio 1º entrega" cod=—
- [VIANENSE] JOSE ROBERTO | loja="Vianense - Freguesia 2º entrega" cod=—

**Unitrac (1 loja(s)):**
- `13508000 GEMA DE OURO`

**Match resultado:**
- ✗ "Prezunic - Freguesia" → SEM MATCH
- ✗ "Vianense - Recreio 1º entrega" → SEM MATCH
- ✗ "Vianense - Freguesia 2º entrega" → SEM MATCH

**Diagnóstico:** ✗ FALHA_MATCH (0/3)

---
## TML7D21

**Escala (1 linha(s)):**
- [ASSAI] LUCIANO MARINHO | loja="Assaí - Boulevard (Vila Isabel) - Loja 294" cod=294

**Unitrac (1 loja(s)):**
- `560056 SENDAS BOULEVARD`

**Match resultado:**
- ✓ "Assaí - Boulevard (Vila Isabel) - Loja 294" → `560056 SENDAS BOULEVARD` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## TML7D61

**Escala (9 linha(s)):**
- [SUPERPRIX] ERALDO | loja="Super Prix -Tijuquinha (1° ENTREGA)  Loja 13" cod=13
- [SUPERPRIX] ERALDO | loja="Super Prix - Tijuca  (2° °ENTREGA) Loja 14" cod=14
- [SUPER_PAX] FABRICIO | loja="Madureira" cod=—
- [SUPER_PAX] FABRICIO | loja="Oswaldo Cruz" cod=—
- [SUPER_PAX] FABRICIO | loja="VILA_NOVA" cod=—
- [SUPER_PAX] FABRICIO | loja="ALHAMBRA" cod=—
- [SUPER_PAX] FABRICIO | loja="1- Nilopolis (Olinda)" cod=—
- [SUPER_PAX] FABRICIO | loja="9- Queimados" cod=—
- [SUPER_PAX] FABRICIO | loja="Sepetiba" cod=—

**Unitrac (2 loja(s)):**
- `3030013 SUPERPRIX LJ 13 - TIJUQUINHA`
- `3030014 SUPERPRIX LJ 14 - TIJUCA`

**Match resultado:**
- ✓ "Super Prix -Tijuquinha (1° ENTREGA)  Loja 13" → `3030013 SUPERPRIX LJ 13 - TIJUQUINHA` (suffix cod 13→3030013)
- ✓ "Super Prix - Tijuca  (2° °ENTREGA) Loja 14" → `3030014 SUPERPRIX LJ 14 - TIJUCA` (suffix cod 14→3030014)
- ✗ "Madureira" → SEM MATCH
- ✗ "Oswaldo Cruz" → SEM MATCH
- ✗ "VILA_NOVA" → SEM MATCH
- ✗ "ALHAMBRA" → SEM MATCH
- ✗ "1- Nilopolis (Olinda)" → SEM MATCH
- ✗ "9- Queimados" → SEM MATCH
- ✗ "Sepetiba" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (2/9)

---
## TML9I75

**Escala (3 linha(s)):**
- [PREZUNIC] ALEXANDRE | loja="Prezunic - Maricá" cod=—
- [ARMAZEM_GRAO] JAIRO | loja="ARMAZEM DO GRÃO (CAPELA)" cod=—
- [ARMAZEM_GRAO] JAIRO | loja="ARMAZEM DO GRAO (16 DE MARÇO)" cod=—

**Unitrac (1 loja(s)):**
- `7000749 PREZUNIC MARICÁ`

**Match resultado:**
- ✓ "Prezunic - Maricá" → `7000749 PREZUNIC MARICÁ` (nome 1 tokens)
- ✗ "ARMAZEM DO GRÃO (CAPELA)" → SEM MATCH
- ✗ "ARMAZEM DO GRAO (16 DE MARÇO)" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/3)

---
## UBF5G32

**Não está na escala. Está no Unitrac com 4 loja(s).**

- Unitrac: `560018 SENDAS CAXIAS - LOJA 131`
- Unitrac: `560021 SENDAS NOVA IGUAÇU - LOJA 30`
- Unitrac: `560023 SENDAS NILÓPOLIS - LOJA 36`
- Unitrac: `560040 SENDAS SÃO JOÃO DE MERITI`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## UBF5G33

**Não está na escala. Está no Unitrac com 4 loja(s).**

- Unitrac: `560016 SENDAS MENDANHA - LOJA 65`
- Unitrac: `560028 SENDAS BANGU - LOJA 55`
- Unitrac: `560037 SENDAS SANTA CRUZ - LJ 37`
- Unitrac: `560060 SENDAS SANTA CRUZ II - LOJA 338`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## UBF5G36

**Não está na escala. Está no Unitrac com 4 loja(s).**

- Unitrac: `560019 SENDAS FREGUESIA - LOJA 28`
- Unitrac: `560024 SENDAS CAMPINHO - LOJA 37`
- Unitrac: `560026 SENDAS CEASA - LOJA 42`
- Unitrac: `560062 SENDAS JACAREPAGUA - LOJA 340 (TAQUARA)`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## UBG7F79

**Escala (1 linha(s)):**
- [SUPERPRIX] MATHEUS SANDES | loja="Super Prix - Barra - Loja 202" cod=202

**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)

---
## UBO0B68

**Escala (3 linha(s)):**
- [ASSAI] WALTER REGIS | loja="Assaí - Nilópolis - Loja 36" cod=36
- [ARMAZEM_GRAO] ANTUNES | loja="ARMAZÉM DO GRÃO ( BOA VISTA)" cod=—
- [ARMAZEM_GRAO] ANTUNES | loja="ARMAZÉM DO GRÃO MATRIZ ( POSSE)" cod=—

**Unitrac (1 loja(s)):**
- `560033 SENDAS SABÃO PORTUGUÊS`

**Match resultado:**
- ✗ "Assaí - Nilópolis - Loja 36" → SEM MATCH
- ✗ "ARMAZÉM DO GRÃO ( BOA VISTA)" → SEM MATCH
- ✗ "ARMAZÉM DO GRÃO MATRIZ ( POSSE)" → SEM MATCH

**Diagnóstico:** ✗ FALHA_MATCH (0/3)

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
## UFW0H63

**Escala (2 linha(s)):**
- [PREZUNIC] WILLIAM RODRIGUES | loja="Prezunic - Senador Camará" cod=—
- [PREZUNIC] WILLIAM RODRIGUES | loja="Prezunic - Realengo/ Serra Azul" cod=—

**Unitrac (2 loja(s)):**
- `7000705 PREZUNIC SENADOR CAMARÁ`
- `7000712 PREZUNIC REALENGO`

**Match resultado:**
- ✓ "Prezunic - Senador Camará" → `7000705 PREZUNIC SENADOR CAMARÁ` (nome 2 tokens)
- ✓ "Prezunic - Realengo/ Serra Azul" → `7000712 PREZUNIC REALENGO` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## UGA1D55

**Escala (1 linha(s)):**
- [ATACADAO] FELIPE DIEGO | loja="Atacadão - Belford Roxo" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE
