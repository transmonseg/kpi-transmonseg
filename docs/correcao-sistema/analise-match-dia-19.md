# Análise match placa-por-placa — Dia 19/05/2026

Total placas analisadas: 164

## Sumário

| Diagnóstico | Qtd |
|------|-----|
| OK_FULL | 56 |
| PLACA_AUSENTE | 41 |
| FORA_ESCALA | 28 |
| OK_PARCIAL | 24 |
| INATIVA | 11 |
| FALHA_MATCH | 4 |

---
## AFY7J99

**Escala (2 linha(s)):**
- [ASSAI] WANDERLEY | loja="Assaí - Nova Iguaçu 2 - Loja 291" cod=291
- [ZONA_SUL] WANDERLEY | loja="Zona Sul Loja 43 - Barra (Península)" cod=43

**Unitrac (2 loja(s)):**
- `560054 SENDAS NOVA IGUAÇU II`
- `9039115 43 - ZONA SUL - BARRA PENINSULA`

**Match resultado:**
- ✓ "Assaí - Nova Iguaçu 2 - Loja 291" → `560054 SENDAS NOVA IGUAÇU II` (nome 1 tokens)
- ✓ "Zona Sul Loja 43 - Barra (Península)" → `9039115 43 - ZONA SUL - BARRA PENINSULA` (nome 3 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## AKZ2594

**Escala (3 linha(s)):**
- [ASSAI] NILTON | loja="Assaí - Freguesia - Loja 28" cod=28
- [ZONA_SUL] NILTON RODRIGUES | loja="Zona Sul Loja 10 - Recreio" cod=10
- [ZONA_SUL] NILTON RODRIGUES | loja="MEGA BOX 02 - Olaria" cod=MEGA

**Unitrac (1 loja(s)):**
- `560019 SENDAS FREGUESIA - LOJA 28`

**Match resultado:**
- ✓ "Assaí - Freguesia - Loja 28" → `560019 SENDAS FREGUESIA - LOJA 28` (nome 2 tokens)
- ✗ "Zona Sul Loja 10 - Recreio" → SEM MATCH
- ✗ "MEGA BOX 02 - Olaria" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/3)

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

**Unitrac (2 loja(s)):**
- `71039 GB 27 - RECREIO DOS BANDEIRANTES`
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

**Escala (3 linha(s)):**
- [FEIRA_NOVA] JOSUE | loja="3- Anchieta" cod=—
- [ZONA_SUL] JOSUE DOS SANTOS | loja="Zona Sul Loja 03 - Copacabana I" cod=03
- [ZONA_SUL] JOSUE DOS SANTOS | loja="Zona Sul Loja 19 - Copacabana" cod=19

**Unitrac (1 loja(s)):**
- `9039104 33 - ZONA SUL - HUMAITA`

**Match resultado:**
- ✗ "3- Anchieta" → SEM MATCH
- ✗ "Zona Sul Loja 03 - Copacabana I" → SEM MATCH
- ✗ "Zona Sul Loja 19 - Copacabana" → SEM MATCH

**Diagnóstico:** ✗ FALHA_MATCH (0/3)

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
- [ASSAI] ADRIANO | loja="Assaí - Pilares - Loja 128" cod=128

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

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

**Escala (3 linha(s)):**
- [ZONA_SUL] PAULO HENRIQUE | loja="Zona Sul Loja 31 - Jd. Botânico" cod=31
- [ZONA_SUL] PAULO HENRIQUE | loja="Zona Sul Loja 11 - Leblon" cod=11
- [ZONA_SUL] PAULO HENRIQUE | loja="EXTRA F.31" cod=EXTRA

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

- Unitrac: `2018002 ROTA BOTAFOGO` ⚠ ROTA GIGANTE

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

**Escala (2 linha(s)):**
- [ZONA_SUL] JONESON | loja="Zona Sul Loja 25 - Jd. Botânico" cod=25
- [ZONA_SUL] JONESON | loja="Zona Sul Loja 22 - S. Conrado" cod=22

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## EFU5704

**Escala (1 linha(s)):**
- [FEIRA_NOVA] WILLIAM | loja="4- Irajá" cod=—

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
- [PREZUNIC] WALLACE | loja="Prezunic SPID - Santa Rosa (Niterói)" cod=—
- [PRINCESA] WALLACE | loja="Princesa - Inga" cod=—

**Unitrac (2 loja(s)):**
- `7000759 PREZUNIC SPID SANTA ROSA`
- `8590556 PRINCESA INGÁ`

**Match resultado:**
- ✓ "Prezunic SPID - Santa Rosa (Niterói)" → `7000759 PREZUNIC SPID SANTA ROSA` (nome 3 tokens)
- ✓ "Princesa - Inga" → `8590556 PRINCESA INGÁ` (nome 1 tokens)

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
## EZU9J51

**Escala (2 linha(s)):**
- [ASSAI] ALLAN | loja="Assaí - Caxias I - Loja 131" cod=131
- [SUPER_PAX] ALLAN | loja="Taquara" cod=—

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

**Escala (3 linha(s)):**
- [PREZUNIC] ESTELITA | loja="Prezunic - Icaraí" cod=—
- [SUPER_PAX] ESTELITA | loja="Madureira" cod=—
- [SUPER_PAX] ESTELITA | loja="Oswaldo Cruz" cod=—

**Unitrac (2 loja(s)):**
- `202000 PAX OSWALDO CRUZ`
- `7000730 PREZUNIC ICARAÍ`

**Match resultado:**
- ✓ "Prezunic - Icaraí" → `7000730 PREZUNIC ICARAÍ` (nome 1 tokens)
- ✗ "Madureira" → SEM MATCH
- ✓ "Oswaldo Cruz" → `202000 PAX OSWALDO CRUZ` (nome 2 tokens)

**Diagnóstico:** ⚠ OK_PARCIAL (2/3)

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
## GEB9H31

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71039 GB 27 - RECREIO DOS BANDEIRANTES`

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
## HNG2B61

**Escala (2 linha(s)):**
- [PREZUNIC] MANOEL P 2° ENTREGA | loja="Prezunic - Botafogo / Serra Azul" cod=—
- [PRINCESA] MANOEL PAULINO | loja="Princesa - Leme" cod=—

**Unitrac (2 loja(s)):**
- `11623033 VIANENSE RECREIO`
- `8590134 PRINCESA LEME`

**Match resultado:**
- ✗ "Prezunic - Botafogo / Serra Azul" → SEM MATCH
- ✓ "Princesa - Leme" → `8590134 PRINCESA LEME` (nome 1 tokens)

**Diagnóstico:** ⚠ OK_PARCIAL (1/2)

---
## HOE4B58

**Não está na escala. Está no Unitrac com 2 loja(s).**

- Unitrac: `2018013 ROTA GAVEA` ⚠ ROTA GIGANTE
- Unitrac: `2018014 ROTA ILHA` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## INW8A51

**Escala (2 linha(s)):**
- [SUPERPRIX] WILLIAM | loja="Super Prix -Riachuelo Loja 07" cod=07
- [ZONA_SUL] WILLIAM | loja="Zona Sul Loja 11 - Leblon" cod=11

**Unitrac (3 loja(s)):**
- `3030007 SUPERPRIX LJ 07 - RIACHUELO`
- `71039 GB 27 - RECREIO DOS BANDEIRANTES`
- `9039011 11 - ZONA SUL - LEBLON`

**Match resultado:**
- ✓ "Super Prix -Riachuelo Loja 07" → `3030007 SUPERPRIX LJ 07 - RIACHUELO` (suffix cod 07→3030007)
- ✓ "Zona Sul Loja 11 - Leblon" → `9039011 11 - ZONA SUL - LEBLON` (suffix cod 11→9039011)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## JAJ6B36

**Escala (3 linha(s)):**
- [PRINCESA] RENATO | loja="Princesa - Barra de São João (1ª Entrega)" cod=—
- [PRINCESA] RENATO | loja="Princesa - Rio das Ostras (2ª Entrega)" cod=—
- [ZONA_SUL] RENATO | loja="Zona Sul Loja 46 - Botafogo" cod=46

**Unitrac (2 loja(s)):**
- `8590562 PRINCESA - BARRA DE SÃO JOÃO`
- `8590568 PRINCESA - RIO DAS OSTRAS`

**Match resultado:**
- ✓ "Princesa - Barra de São João (1ª Entrega)" → `8590562 PRINCESA - BARRA DE SÃO JOÃO` (nome 4 tokens)
- ✓ "Princesa - Rio das Ostras (2ª Entrega)" → `8590568 PRINCESA - RIO DAS OSTRAS` (nome 3 tokens)
- ✗ "Zona Sul Loja 46 - Botafogo" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (2/3)

---
## KGO5E65

**Escala (1 linha(s)):**
- [ASSAI] FERNANDO | loja="Assaí - Santa Cruz - Loja 201" cod=201

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## KMY5561

**Escala (3 linha(s)):**
- [CARREFOUR] LUÍZ ANTÔNIO | loja="Carrefour - Barra da Tijuca" cod=—
- [SUPER_PAX] LUIZ | loja="Realengo" cod=—
- [ZONA_SUL] LUIZ ANTONIO ALVES | loja="Zona Sul Loja 19 - Copacabana" cod=19

**Unitrac (2 loja(s)):**
- `202002 PAX REALENGO`
- `9006001 CARREFOUR BARRA`

**Match resultado:**
- ✓ "Carrefour - Barra da Tijuca" → `9006001 CARREFOUR BARRA` (nome 1 tokens)
- ✓ "Realengo" → `202002 PAX REALENGO` (nome 1 tokens)
- ✗ "Zona Sul Loja 19 - Copacabana" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (2/3)

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
## KNC1834

**Escala (1 linha(s)):**
- [FEIRA_NOVA] MARCELO | loja="ANCHIETA - 2º CARRO" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## KNC1I34

**Escala (2 linha(s)):**
- [PREZUNIC] MARCELO | loja="Prezunic - Jardim Oceanico" cod=—
- [PREZUNIC] MARCELO | loja="Prezunic - Barra Marapendi" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## KNC5J75

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `11139000 EMANUEL COMÉRCIO PEDRA DE GUARATIBA` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KNS8D26

**Escala (2 linha(s)):**
- [CAB_PETROPOLIS] ZOZIMO | loja="CAB - PETRÓPOLIS" cod=—
- [FEIRA_NOVA] ZOZIMO | loja="11- Boa Dica (Piabetá)" cod=—

**Unitrac (2 loja(s)):**
- `579011 FEIRA NOVA BOA DICA (PIABETÁ)`
- `7012010 CAB - PETROPOLIS` ⚠ rota gigante

**Match resultado:**
- ✗ "CAB - PETRÓPOLIS" → SEM MATCH
- ✓ "11- Boa Dica (Piabetá)" → `579011 FEIRA NOVA BOA DICA (PIABETÁ)` (nome 3 tokens)

**Diagnóstico:** ⚠ OK_PARCIAL (1/2)

---
## KNZ5B07

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018019 ROTA NOVA IGUACU` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KOA6A27

**Escala (2 linha(s)):**
- [PREZUNIC] HUMBERTO | loja="Prezunic - Vilar dos Teles" cod=—
- [FEIRA_NOVA] JOSE HUMBERTO | loja="7- C.ROCHA" cod=—

**Unitrac (1 loja(s)):**
- `7000725 PREZUNIC VILAR DOS TELES`

**Match resultado:**
- ✓ "Prezunic - Vilar dos Teles" → `7000725 PREZUNIC VILAR DOS TELES` (nome 3 tokens)
- ✗ "7- C.ROCHA" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/2)

---
## KOH0H77

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018006 ROTA CAMPO GRANDE` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KOP4978

**Escala (5 linha(s)):**
- [PREZUNIC] MILTON | loja="Prezunic - Campinho" cod=—
- [PREZUNIC] MILTON | loja="Prezunic - Cidade de Deus" cod=—
- [ZONA_SUL] MILTON | loja="MEGA BOX 01 - Olaria" cod=MEGA
- [ZONA_SUL] MILTON | loja="MEGA BOX 02 - Olaria" cod=MEGA
- [ZONA_SUL] MILTON | loja="Zona Sul - Entrega Extra" cod=EXTRA

**Unitrac (2 loja(s)):**
- `6018000 MEGA BOX (OLARIA)`
- `7000718 PREZUNIC CAMPINHO`

**Match resultado:**
- ✓ "Prezunic - Campinho" → `7000718 PREZUNIC CAMPINHO` (nome 1 tokens)
- ✗ "Prezunic - Cidade de Deus" → SEM MATCH
- ✓ "MEGA BOX 01 - Olaria" → `6018000 MEGA BOX (OLARIA)` (nome 3 tokens)
- ✓ "MEGA BOX 02 - Olaria" → `6018000 MEGA BOX (OLARIA)` (nome 3 tokens)
- ✗ "Zona Sul - Entrega Extra" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (3/5)

---
## KPB5I95

**Escala (3 linha(s)):**
- [PREZUNIC] JOSE ROBERTO | loja="Prezunic - Freguesia" cod=—
- [SAMS_CLUB] JOSE ROBERTO | loja="Sam's - Niterói" cod=—
- [FEIRA_NOVA] JOSE | loja="12- Freguesia" cod=—

**Unitrac (2 loja(s)):**
- `579012 FEIRA NOVA FREGUESIA`
- `7000707 PREZUNIC FREGUESIA`

**Match resultado:**
- ✓ "Prezunic - Freguesia" → `579012 FEIRA NOVA FREGUESIA` (nome 1 tokens)
- ✗ "Sam's - Niterói" → SEM MATCH
- ✓ "12- Freguesia" → `579012 FEIRA NOVA FREGUESIA` (nome 1 tokens)

**Diagnóstico:** ⚠ OK_PARCIAL (2/3)

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
## KPS4J07

**Escala (1 linha(s)):**
- [PRINCESA] ELVIS | loja="Princesa - Laranjeiras" cod=—

**Unitrac (1 loja(s)):**
- `8590218 PRINCESA LARANJEIRAS`

**Match resultado:**
- ✓ "Princesa - Laranjeiras" → `8590218 PRINCESA LARANJEIRAS` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

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
## KQY9E24

**Escala (1 linha(s)):**
- [ZONA_SUL] VLADIMIR | loja="Zona Sul Loja 17 - Barra" cod=17

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

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

**Escala (1 linha(s)):**
- [PRINCESA] ERIVELTON | loja="Princesa - Cosme Velho" cod=—

**Unitrac (1 loja(s)):**
- `8590000 PRINCESA COSME VELHO`

**Match resultado:**
- ✓ "Princesa - Cosme Velho" → `8590000 PRINCESA COSME VELHO` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KRK3D12

**Escala (2 linha(s)):**
- [ASSAI] JOSÉLIO | loja="Assaí - São Gonçalo Centro - Loja 266" cod=266
- [ZONA_SUL] JOSENILDO ANISIO | loja="Zona Sul Loja 23 - Barra" cod=23

**Unitrac (1 loja(s)):**
- `560047 SENDAS SÃO GONÇALO CENTRO`

**Match resultado:**
- ✓ "Assaí - São Gonçalo Centro - Loja 266" → `560047 SENDAS SÃO GONÇALO CENTRO` (nome 3 tokens)
- ✗ "Zona Sul Loja 23 - Barra" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/2)

---
## KRW8E86

**Escala (1 linha(s)):**
- [CARREFOUR] RENAN | loja="Carrefour - Campo Grande" cod=—

**Unitrac (2 loja(s)):**
- `71035 GB 26 - CAMPO GRANDE`
- `9006154 CARREFOUR CAMPO GRANDE`

**Match resultado:**
- ✓ "Carrefour - Campo Grande" → `71035 GB 26 - CAMPO GRANDE` (nome 2 tokens)

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
- [PREZUNIC] FELIPE | loja="Prezunic - Pechincha" cod=—
- [FEIRA_NOVA] SIDNEY | loja="1- Nilopolis (Olinda)" cod=—

**Unitrac (2 loja(s)):**
- `579001 FEIRA NOVA OLINDA`
- `7000709 PREZUNIC PECHINCHA`

**Match resultado:**
- ✓ "Prezunic - Pechincha" → `7000709 PREZUNIC PECHINCHA` (nome 1 tokens)
- ✓ "1- Nilopolis (Olinda)" → `579001 FEIRA NOVA OLINDA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## KVH9J42

**Escala (1 linha(s)):**
- [FEIRA_NOVA] MARCIO | loja="10- Cachambi" cod=—

**Unitrac (2 loja(s)):**
- `579010 FEIRA NOVA CACHAMBI`
- `9039004 04 - ZONA SUL - COPACABANA II`

**Match resultado:**
- ✓ "10- Cachambi" → `579010 FEIRA NOVA CACHAMBI` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KVI9088

**Escala (2 linha(s)):**
- [CARREFOUR] JOHN 2° ENTREGA OVO | loja="Carrefour - Campo Grande" cod=—
- [PRINCESA] JOHN | loja="Princesa - Icaraí" cod=—

**Unitrac (2 loja(s)):**
- `560048 SENDAS CARIOCA SHOPPING`
- `8590004 PRINCESA ICARAÍ`

**Match resultado:**
- ✗ "Carrefour - Campo Grande" → SEM MATCH
- ✓ "Princesa - Icaraí" → `8590004 PRINCESA ICARAÍ` (nome 1 tokens)

**Diagnóstico:** ⚠ OK_PARCIAL (1/2)

---
## KVT5427

**Escala (4 linha(s)):**
- [PREZUNIC] RAFAEL | loja="Prezunic SPID - Glória" cod=—
- [PREZUNIC] RAFAEL | loja="Prezunic SPID - Carioca" cod=—
- [PREZUNIC] RAFAEL | loja="Prezunic SPID - Centro" cod=—
- [PRINCESA] RAFAEL | loja="Princesa - Catete" cod=—

**Unitrac (6 loja(s)):**
- `17659004 REDE ECONOMIA SANTA MARIA` ⚠ rota gigante
- `25140000 EMANUEL- REDE ECONOMIA SANTA MARIA` ⚠ rota gigante
- `7000744 PREZUNIC SPID ESTAÇÃO CARIOCA (METRÔ)`
- `7000754 PREZUNIC SPID GLÓRIA`
- `7000755 PREZUNIC SPID CENTRO`
- `8590120 PRINCESA CATETE`

**Match resultado:**
- ✓ "Prezunic SPID - Glória" → `7000754 PREZUNIC SPID GLÓRIA` (nome 2 tokens)
- ✓ "Prezunic SPID - Carioca" → `7000744 PREZUNIC SPID ESTAÇÃO CARIOCA (METRÔ)` (nome 2 tokens)
- ✓ "Prezunic SPID - Centro" → `7000755 PREZUNIC SPID CENTRO` (nome 2 tokens)
- ✓ "Princesa - Catete" → `8590120 PRINCESA CATETE` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (4/4)

---
## KWB6998

**Escala (1 linha(s)):**
- [PREZUNIC] DELSON | loja="Prezunic - Botafogo / Serra Azul" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## KWH2J02

**Escala (1 linha(s)):**
- [PRINCESA] WANDERSON | loja="Princesa - Copacabana" cod=—

**Unitrac (3 loja(s)):**
- `11623026 VIANENSE FREGUESIA`
- `17659004 REDE ECONOMIA SANTA MARIA` ⚠ rota gigante
- `8590034 PRINCESA COPACABANA`

**Match resultado:**
- ✓ "Princesa - Copacabana" → `8590034 PRINCESA COPACABANA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

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

**Escala (1 linha(s)):**
- [ZONA_SUL] RODRIGO | loja="Zona Sul Loja 38 - Copacabana" cod=38

**Unitrac (1 loja(s)):**
- `9039103 21 - ZONA SUL - FLAMENGO`

**Match resultado:**
- ✗ "Zona Sul Loja 38 - Copacabana" → SEM MATCH

**Diagnóstico:** ✗ FALHA_MATCH (0/1)

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
## KXA7C24

**Escala (1 linha(s)):**
- [PREZUNIC] SANTIAGO | loja="Prezunic - Padre Miguel" cod=—

**Unitrac (2 loja(s)):**
- `7000726 PREZUNIC PADRE MIGUEL`
- `71005 GB 05 - BANGU`

**Match resultado:**
- ✓ "Prezunic - Padre Miguel" → `7000726 PREZUNIC PADRE MIGUEL` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## KXB6E57

**Escala (1 linha(s)):**
- [ASSAI] RICARDO | loja="Assaí - Campinho - Loja 37" cod=37

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## KXR7F27

**Escala (3 linha(s)):**
- [PREZUNIC] MÁRCIO | loja="Prezunic - Itaoca" cod=—
- [PREZUNIC] MÁRCIO | loja="Prezunic - Vista Alegre" cod=—
- [SUPER_PAX] MARCIO | loja="Pilares" cod=—

**Unitrac (3 loja(s)):**
- `202009 PAX PILARES`
- `7000715 PREZUNIC VISTA ALEGRE`
- `7000720 PREZUNIC ITAOCA`

**Match resultado:**
- ✓ "Prezunic - Itaoca" → `7000720 PREZUNIC ITAOCA` (nome 1 tokens)
- ✓ "Prezunic - Vista Alegre" → `7000715 PREZUNIC VISTA ALEGRE` (nome 2 tokens)
- ✓ "Pilares" → `202009 PAX PILARES` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (3/3)

---
## KYM2I62

**Escala (1 linha(s)):**
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
## KZH6F33

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018023 ROTA ZONA NORTE` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## KZJ0E14

**Escala (1 linha(s)):**
- [ASSAI] RODRIGO | loja="Assaí - Macaé - Loja 232" cod=232

**Unitrac (1 loja(s)):**
- `560041 SENDAS MACAÉ - LOJA 232`

**Match resultado:**
- ✓ "Assaí - Macaé - Loja 232" → `560041 SENDAS MACAÉ - LOJA 232` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

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

**Não está na escala. Está no Unitrac com 2 loja(s).**

- Unitrac: `2018001 ROTA BARRA` ⚠ ROTA GIGANTE
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
## LCC1E63

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018009 ROTA CENTRO` ⚠ ROTA GIGANTE

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
## LCO0978

**Escala (1 linha(s)):**
- [ZONA_SUL] LUIZ ALVES | loja="Zona Sul Loja 08 - Ipanema" cod=08

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LFJ8442

**Escala (1 linha(s)):**
- [ASSAI] ANTÔNIO | loja="Assaí - Mendanha (Campo Grande) - Loja 65" cod=65

**Unitrac (1 loja(s)):**
- `560016 SENDAS MENDANHA - LOJA 65`

**Match resultado:**
- ✓ "Assaí - Mendanha (Campo Grande) - Loja 65" → `560016 SENDAS MENDANHA - LOJA 65` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## LFK2C56

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71002 GB 02 - PENHA`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## LIA7G83

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71038 GB 19 - TANQUE`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## LJS2172

**Escala (2 linha(s)):**
- [ZONA_SUL] SÉRGIO JOSE DA SILVA | loja="Zona Sul Loja 01 - Ipanema" cod=01
- [ZONA_SUL] SÉRGIO JOSE DA SILVA | loja="Zona Sul Loja 09 - Ipanema" cod=09

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LJS2B72

**Escala (1 linha(s)):**
- [CARREFOUR] SÉRGIO | loja="Carrefour - Norte Shopping" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LKA3935

**Escala (1 linha(s)):**
- [ASSAI] EDVALDO | loja="Assaí - Sabão Rio (Benfica) - Loja 136" cod=136

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LKF7A79

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `71008 GB 08 - NITEROI`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## LKR5990

**Escala (2 linha(s)):**
- [PREZUNIC] AGNALDO | loja="Prezunic - Vila Isabel" cod=—
- [ZONA_SUL] AGNALDO | loja="Zona Sul Loja 44 - Barra" cod=44

**Unitrac (1 loja(s)):**
- `7000748 PREZUNIC VILA ISABEL`

**Match resultado:**
- ✓ "Prezunic - Vila Isabel" → `7000748 PREZUNIC VILA ISABEL` (nome 2 tokens)
- ✗ "Zona Sul Loja 44 - Barra" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/2)

---
## LKV5067

**Escala (4 linha(s)):**
- [PREZUNIC] DANIEL | loja="Prezunic - Penha" cod=—
- [PREZUNIC] DANIEL | loja="Prezunic - Olaria" cod=—
- [SENDAS] JOSÉ CARLOS | loja="Americanas" cod=—
- [FEIRA_NOVA] DANIEL | loja="13- Todos os Santos" cod=—

**Unitrac (2 loja(s)):**
- `7000714 PREZUNIC OLARIA`
- `7000723 PREZUNIC PENHA`

**Match resultado:**
- ✓ "Prezunic - Penha" → `7000723 PREZUNIC PENHA` (nome 1 tokens)
- ✓ "Prezunic - Olaria" → `7000714 PREZUNIC OLARIA` (nome 1 tokens)
- ✗ "Americanas" → SEM MATCH
- ✗ "13- Todos os Santos" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (2/4)

---
## LKW2B80

**Escala (1 linha(s)):**
- [ZONA_SUL] ALEX | loja="Zona Sul Loja 35 - Barra" cod=35

**Unitrac (2 loja(s)):**
- `9039018 18 - ZONA SUL - COPACABANA`
- `9039107 35 - ZONA SUL - BARRA DA TIJUCA`

**Match resultado:**
- ✓ "Zona Sul Loja 35 - Barra" → `9039107 35 - ZONA SUL - BARRA DA TIJUCA` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

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

**Escala (3 linha(s)):**
- [ASSAI] LUIZ CESAR | loja="Assaí - Bangu II - Loja 332" cod=332
- [PRINCESA] LUIZ CESAR | loja="Princesa - Niteroí Barcas" cod=—
- [SENDAS] LUIZ CESAR | loja="Mercado de Santa" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LNG7110

**Escala (2 linha(s)):**
- [ASSAI] ANTÔNIO FREITAS | loja="Assaí - Santa Cruz 2 - Loja 338" cod=338
- [PREZUNIC] ANTÔNIO FREITAS | loja="Prezunic - Santa Cruz / Serra Azul" cod=—

**Unitrac (1 loja(s)):**
- `7000733 PREZUNIC SANTA CRUZ`

**Match resultado:**
- ✓ "Assaí - Santa Cruz 2 - Loja 338" → `7000733 PREZUNIC SANTA CRUZ` (nome 2 tokens)
- ✓ "Prezunic - Santa Cruz / Serra Azul" → `7000733 PREZUNIC SANTA CRUZ` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## LNU7733

**Escala (1 linha(s)):**
- [ZONA_SUL] PAULO CESAR | loja="MEGA BOX 02 - Olaria" cod=MEGA

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LNU7H38

**Escala (1 linha(s)):**
- [SUPER_PAX] FELIPE | loja="Vila da Penha" cod=—

**Unitrac (1 loja(s)):**
- `202010 PAX VILA DA PENHA`

**Match resultado:**
- ✓ "Vila da Penha" → `202010 PAX VILA DA PENHA` (nome 3 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## LNU9595

**Escala (1 linha(s)):**
- [ZONA_SUL] CARLOS GONÇALVES | loja="Zona Sul Loja 34 - Barra" cod=34

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
- [ASSAI] JOAO CARLOS | loja="Assaí - Nilópolis - Loja 36" cod=36

**Unitrac (1 loja(s)):**
- `560023 SENDAS NILÓPOLIS - LOJA 36`

**Match resultado:**
- ✓ "Assaí - Nilópolis - Loja 36" → `560023 SENDAS NILÓPOLIS - LOJA 36` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## LOU9928

**Escala (2 linha(s)):**
- [PREZUNIC] SÉRGIO FIDÉLIS | loja="Prezunic - Cachambi" cod=—
- [SUPER_PAX] SERGIO | loja="Engenho de Dentro" cod=—

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
## LQA5883

**Escala (1 linha(s)):**
- [ZONA_SUL] EDUARDO | loja="Zona Sul Loja 40 - Ipanema" cod=40

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LQE5401

**Escala (1 linha(s)):**
- [ZONA_SUL] SIDNEI ANTONIO | loja="Zona Sul Loja 47" cod=47

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

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

**Não está na escala. Está no Unitrac com 2 loja(s).**

- Unitrac: `7000729 PREZUNIC MEIER`
- Unitrac: `9966101 SUPERMARKET COELHO NETO`

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## LQU5546

**Escala (2 linha(s)):**
- [ZONA_SUL] INACIO ARAUJO | loja="Zona Sul Loja 28 - Urca" cod=28
- [ZONA_SUL] INACIO ARAUJO | loja="Zona Sul Loja 29 - Flamengo" cod=29

**Unitrac (3 loja(s)):**
- `9039015 15 - ZONA SUL - LEBLON`
- `9039027 27 - ZONA SUL - IPANEMA`
- `9039028 28 - ZONA SUL - URCA`

**Match resultado:**
- ✓ "Zona Sul Loja 28 - Urca" → `9039028 28 - ZONA SUL - URCA` (suffix cod 28→9039028)
- ✗ "Zona Sul Loja 29 - Flamengo" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/2)

---
## LRA9C41

**Escala (2 linha(s)):**
- [PRINCESA] DIEGO | loja="Princesa - Iguaba (1º Entrega)" cod=—
- [PRINCESA] DIEGO | loja="Princesa - Itaboraí (2ª Entrega)" cod=—

**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)

---
## LSE1D35

**Escala (1 linha(s)):**
- [CARREFOUR] JOSE CARLOS | loja="Carrefour - Alcântara" cod=—

**Unitrac (1 loja(s)):**
- `9006012 CARREFOUR ALCANTARA`

**Match resultado:**
- ✓ "Carrefour - Alcântara" → `9006012 CARREFOUR ALCANTARA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

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

**Escala (1 linha(s)):**
- [ASSAI] SIMÃO | loja="Assaí - Alcântara I - Loja 35" cod=35

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LSX7C72

**Escala (2 linha(s)):**
- [PREZUNIC] ANDRE | loja="Prezunic - Campo Grande (TINGUI)" cod=—
- [FEIRA_NOVA] ANDRE | loja="SANTA CRUZ" cod=—

**Unitrac (1 loja(s)):**
- `7000766 PREZUNIC CAMPO GRANDE (TINGUI)`

**Match resultado:**
- ✓ "Prezunic - Campo Grande (TINGUI)" → `7000766 PREZUNIC CAMPO GRANDE (TINGUI)` (nome 3 tokens)
- ✗ "SANTA CRUZ" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/2)

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
- [ZONA_SUL] MARCIO | loja="Zona Sul Loja 26 - Copacabana" cod=26

**Unitrac (5 loja(s)):**
- `11623028 VIANENSE NOVA IGUAÇU`
- `11623032 VIANENSE JARDIM ALVORADA`
- `22144000 PETIT MARCHE BARRAMARES`
- `22144002 PETIT ATLANTICO SUL`
- `22980000 EMPORIO BARRA TOWER`

**Match resultado:**
- ✓ "Atlantico Sul (Barra da Tijuca)" → `22144002 PETIT ATLANTICO SUL` (nome 1 tokens)
- ✓ "Barramares (Barra da Tijuca)" → `22144000 PETIT MARCHE BARRAMARES` (nome 1 tokens)
- ✓ "Barra Tower" → `22980000 EMPORIO BARRA TOWER` (nome 2 tokens)
- ✓ "Vianense - Nova Iguaçu 1º entrega" → `11623028 VIANENSE NOVA IGUAÇU` (nome 1 tokens)
- ✓ "Vianense - Jardim Alvorada 2º entrega" → `11623032 VIANENSE JARDIM ALVORADA` (nome 2 tokens)
- ✗ "Zona Sul Loja 26 - Copacabana" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (5/6)

---
## LTQ0783

**Escala (1 linha(s)):**
- [ZONA_SUL] EDMILSON JOSÉ | loja="Zona Sul Loja 12 - Leme" cod=12

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## LUP1F13

**Escala (3 linha(s)):**
- [PREZUNIC] CARLOS DO SANTOS | loja="Prezunic - Jauru / Serra Azul" cod=—
- [PREZUNIC] CARLOS DO SANTOS | loja="Prezunic - Taquara / Serra Azul" cod=—
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
- [ZONA_SUL] ANDERSON | loja="Zona Sul Loja 05 - Copacabana III" cod=05
- [ZONA_SUL] ANDERSON | loja="Zona Sul Loja 20 - Botafogo" cod=20

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## MDV3746

**Escala (2 linha(s)):**
- [ZONA_SUL] PAULO ROBERTO | loja="MEGA BOX 01 - Olaria" cod=MEGA
- [ZONA_SUL] PAULO ROBERTO | loja="Zona Sul Loja 1129 - Olaria" cod=1129

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
- [PREZUNIC] FLÁVIO | loja="Prezunic - Méier / Serra Azul" cod=—
- [SAMS_CLUB] FLÁVIO | loja="Sam's - Barra (Ayrton Senna)" cod=—
- [SENDAS] FLÁVIO | loja="Santo Agostinho" cod=—

**Unitrac (1 loja(s)):**
- `7000729 PREZUNIC MEIER`

**Match resultado:**
- ✓ "Prezunic - Méier / Serra Azul" → `7000729 PREZUNIC MEIER` (nome 1 tokens)
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

**Escala (2 linha(s)):**
- [CARREFOUR] VALDEMIRIO | loja="Carrefour - Brigadeiro (Caxias)" cod=—
- [FEIRA_NOVA] MARCIO | loja="8- Cerâmica" cod=—

**Unitrac (2 loja(s)):**
- `579008 FEIRA NOVA CERAMICA`
- `9006144 CARREFOUR BRIGADEIRO`

**Match resultado:**
- ✓ "Carrefour - Brigadeiro (Caxias)" → `9006144 CARREFOUR BRIGADEIRO` (nome 1 tokens)
- ✓ "8- Cerâmica" → `579008 FEIRA NOVA CERAMICA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## QSW3B65

**Escala (1 linha(s)):**
- [ASSAI] MARCUS VINICIUS | loja="Assaí - Carioca Shopping - Loja 316" cod=316

**Unitrac (2 loja(s)):**
- `17659002 EMANUEL CACHAMORRA` ⚠ rota gigante
- `560048 SENDAS CARIOCA SHOPPING`

**Match resultado:**
- ✓ "Assaí - Carioca Shopping - Loja 316" → `560048 SENDAS CARIOCA SHOPPING` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## QSY2H32

**Escala (1 linha(s)):**
- [SUPER_PAX] DENIS BEZERRA | loja="LINS 2º CARRO" cod=—

**Unitrac (2 loja(s)):**
- `202013 PAX LINS`
- `579010 FEIRA NOVA CACHAMBI`

**Match resultado:**
- ✓ "LINS 2º CARRO" → `202013 PAX LINS` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## QSZ9A20

**Escala (3 linha(s)):**
- [PRINCESA] DANIEL CAVALCANTE | loja="Princesa - Maricá 1 (2ª Entrega)" cod=—
- [PRINCESA] DANIEL CAVALCANTE | loja="Princesa - Maricá 2 (1ª Entrega)" cod=—
- [SUPER_PAX] DANIEL | loja="Del Castilho" cod=—

**Unitrac (3 loja(s)):**
- `202004 PAX DEL CASTILHO`
- `8590002 PRINCESA MARICÁ 1`
- `8590003 PRINCESA MARICÁ 2`

**Match resultado:**
- ✓ "Princesa - Maricá 1 (2ª Entrega)" → `8590002 PRINCESA MARICÁ 1` (nome 1 tokens)
- ✓ "Princesa - Maricá 2 (1ª Entrega)" → `8590002 PRINCESA MARICÁ 1` (nome 1 tokens)
- ✓ "Del Castilho" → `202004 PAX DEL CASTILHO` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (3/3)

---
## RJN9F68

**Escala (4 linha(s)):**
- [PREZUNIC] JULIO PEREIRA | loja="Prezunic SPID - Tijuca" cod=—
- [PREZUNIC] JULIO PEREIRA | loja="Prezunic SPID - Vila Isabel" cod=—
- [PREZUNIC] JULIO PEREIRA | loja="Prezunic SPID - Meier" cod=—
- [PRINCESA] JULIO PEREIRA | loja="Princesa - Fonseca" cod=—

**Unitrac (4 loja(s)):**
- `7000737 PREZUNIC SPID MÉIER`
- `7000760 PREZUNIC SPID TIJUCA`
- `7000761 PREZUNIC SPID VILA ISABEL`
- `8590555 PRINCESA FONSECA`

**Match resultado:**
- ✓ "Prezunic SPID - Tijuca" → `7000760 PREZUNIC SPID TIJUCA` (nome 2 tokens)
- ✓ "Prezunic SPID - Vila Isabel" → `7000761 PREZUNIC SPID VILA ISABEL` (nome 3 tokens)
- ✓ "Prezunic SPID - Meier" → `7000737 PREZUNIC SPID MÉIER` (nome 2 tokens)
- ✓ "Princesa - Fonseca" → `8590555 PRINCESA FONSECA` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (4/4)

---
## SFG2F72

**Escala (1 linha(s)):**
- [ASSAI] CELSO | loja="Assaí - Barra II  - Loja 245" cod=245

**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)

---
## SFG2F73

**Escala (1 linha(s)):**
- [ASSAI] FLAVIANO | loja="Assaí - Mesquita (Dutra) - Loja 142" cod=142

**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)

---
## SRD0J02

**Não está na escala. Está no Unitrac com 1 loja(s).**

- Unitrac: `2018001 ROTA BARRA` ⚠ ROTA GIGANTE

**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado

---
## TJQ6J26

**Escala (1 linha(s)):**
- [CARREFOUR] VICTOR LUIZ | loja="Carrefour - Sulacap" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## TML3B11

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
## TML5I70

**Escala (3 linha(s)):**
- [PREZUNIC] ADRIANO | loja="Prezunic - Engenho Novo" cod=—
- [PREZUNIC] ADRIANO | loja="Prezunic - Benfica" cod=—
- [FEIRA_NOVA] ADRIANO BORGES | loja="9- Queimados" cod=—

**Unitrac (3 loja(s)):**
- `579009 FEIRA NOVA QUEIMADOS`
- `7000706 PREZUNIC BENFICA`
- `7000708 PREZUNIC ENGENHO NOVO`

**Match resultado:**
- ✓ "Prezunic - Engenho Novo" → `7000708 PREZUNIC ENGENHO NOVO` (nome 2 tokens)
- ✓ "Prezunic - Benfica" → `7000706 PREZUNIC BENFICA` (nome 1 tokens)
- ✓ "9- Queimados" → `579009 FEIRA NOVA QUEIMADOS` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (3/3)

---
## TML6D96

**Escala (4 linha(s)):**
- [ARMAZEM_GRAO] GILSON | loja="REGINA  BARRA DO IMBUY" cod=—
- [ARMAZEM_GRAO] GILSON | loja="REGINA  1 DE MAIO" cod=—
- [ARMAZEM_GRAO] GILSON | loja="REGINA  LUCIO MEIRA" cod=—
- [ARMAZEM_GRAO] GILSON | loja="ABASTECEDORA GRÃO DA SERRA (ALTO)" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## TML7D21

**Escala (2 linha(s)):**
- [ASSAI] LUCIANO MARINHO | loja="Assaí - Boulevard (Vila Isabel) - Loja 294" cod=294
- [SUPER_PAX] DENNIS AUGUSTO | loja="Sepetiba" cod=—

**Unitrac (1 loja(s)):**
- `560056 SENDAS BOULEVARD`

**Match resultado:**
- ✓ "Assaí - Boulevard (Vila Isabel) - Loja 294" → `560056 SENDAS BOULEVARD` (nome 1 tokens)
- ✗ "Sepetiba" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/2)

---
## TML7D61

**Escala (2 linha(s)):**
- [SUPERPRIX] ERALDO | loja="Super Prix -Tijuquinha (1° ENTREGA)  Loja 13" cod=13
- [SUPERPRIX] ERALDO | loja="Super Prix - Tijuca  (2° °ENTREGA) Loja 14" cod=14

**Unitrac (2 loja(s)):**
- `3030013 SUPERPRIX LJ 13 - TIJUQUINHA`
- `3030014 SUPERPRIX LJ 14 - TIJUCA`

**Match resultado:**
- ✓ "Super Prix -Tijuquinha (1° ENTREGA)  Loja 13" → `3030013 SUPERPRIX LJ 13 - TIJUQUINHA` (suffix cod 13→3030013)
- ✓ "Super Prix - Tijuca  (2° °ENTREGA) Loja 14" → `3030014 SUPERPRIX LJ 14 - TIJUCA` (suffix cod 14→3030014)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## TML9I75

**Escala (3 linha(s)):**
- [PREZUNIC] ALEXANDRE | loja="Prezunic - Maricá" cod=—
- [ARMAZEM_GRAO] ANTUNES | loja="ARMAZÉM DO GRÃO ( BOA VISTA)" cod=—
- [ARMAZEM_GRAO] ANTUNES | loja="ARMAZÉM DO GRÃO MATRIZ ( POSSE)" cod=—

**Unitrac (1 loja(s)):**
- `7000749 PREZUNIC MARICÁ`

**Match resultado:**
- ✓ "Prezunic - Maricá" → `7000749 PREZUNIC MARICÁ` (nome 1 tokens)
- ✗ "ARMAZÉM DO GRÃO ( BOA VISTA)" → SEM MATCH
- ✗ "ARMAZÉM DO GRÃO MATRIZ ( POSSE)" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (1/3)

---
## UBF5G32

**Escala (1 linha(s)):**
- [ASSAI] JOSE M | loja="AssaÍ - Ilha do Governador - Loja 29" cod=29

**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)

---
## UBF5G33

**Escala (1 linha(s)):**
- [ASSAI] BRUNO | loja="Assaí - Niterói - Loja 41" cod=41

**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)

---
## UBF5G34

**Escala (2 linha(s)):**
- [ATACADAO] RODRIGO | loja="Atacadão - Belford Roxo" cod=—
- [PREZUNIC] RODRIGO | loja="Prezunic - Depósito Central" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## UBF5G36

**Escala (2 linha(s)):**
- [ASSAI] YAGO / RODRIGO | loja="Assaí - Caxias II (Parque Fluminense) - Loja 219" cod=219
- [PREZUNIC] YAGO / RODRIGO | loja="Prezunic - Botafogo (Voluntários)" cod=—

**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)

---
## UBF7F79

**Escala (1 linha(s)):**
- [SUPER_PAX] SILVIO | loja="INHAUMA" cod=—

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## UBG7F79

**Escala (1 linha(s)):**
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
- [ASSAI] JEFERSON BATALHA | loja="Assaí - Bangu I - Loja 55" cod=55

**Unitrac (4 loja(s)):**
- `17659003 EMANUEL VARGEM GRANDE` ⚠ rota gigante
- `5353016 REGINA LUCIO MEIRA` ⚠ rota gigante
- `5353017 ABASTECEDORA GRÃO DA SERRA (ALTO)` ⚠ rota gigante
- `560028 SENDAS BANGU - LOJA 55`

**Match resultado:**
- ✓ "Assaí - Bangu I - Loja 55" → `560028 SENDAS BANGU - LOJA 55` (nome 2 tokens)

**Diagnóstico:** ✓ OK_FULL (1/1)

---
## UBO5E05

**Escala (1 linha(s)):**
- [ZONA_SUL] MARCOS FERNANDO | loja="Zona Sul Loja 14 - Leblon" cod=14

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE

---
## UDC6I03

**Escala (5 linha(s)):**
- [PRINCESA] CLAUDIO | loja="Princesa - Cabo Frio 1 (1ª Entrega)" cod=—
- [PRINCESA] CLAUDIO | loja="Princesa - Cabo Frio 2 (3ª Entrega)" cod=—
- [PRINCESA] CLAUDIO | loja="Princesa - Cabo Frio 3 (2ª Entrega)" cod=—
- [ARMAZEM_GRAO] JAIRO | loja="ARMAZEM DO GRÃO (CAPELA)" cod=—
- [ARMAZEM_GRAO] JAIRO | loja="ARMAZEM DO GRAO (16 DE MARÇO)" cod=—

**Unitrac (3 loja(s)):**
- `8590565 PRINCESA - CABO FRIO 1`
- `8590566 PRINCESA - CABO FRIO 2`
- `8590567 PRINCESA - CABO FRIO 3`

**Match resultado:**
- ✓ "Princesa - Cabo Frio 1 (1ª Entrega)" → `8590565 PRINCESA - CABO FRIO 1` (nome 2 tokens)
- ✓ "Princesa - Cabo Frio 2 (3ª Entrega)" → `8590565 PRINCESA - CABO FRIO 1` (nome 2 tokens)
- ✓ "Princesa - Cabo Frio 3 (2ª Entrega)" → `8590565 PRINCESA - CABO FRIO 1` (nome 2 tokens)
- ✗ "ARMAZEM DO GRÃO (CAPELA)" → SEM MATCH
- ✗ "ARMAZEM DO GRAO (16 DE MARÇO)" → SEM MATCH

**Diagnóstico:** ⚠ OK_PARCIAL (3/5)

---
## UFW0H63

**Escala (2 linha(s)):**
- [PREZUNIC] WILLIAM RODRIGUES | loja="Prezunic - Senador Camará" cod=—
- [PREZUNIC] WILLIAM RODRIGUES | loja="Prezunic - Realengo/ Serra Azul" cod=—

**Unitrac (3 loja(s)):**
- `17659000 O BOM ATACADISTA` ⚠ rota gigante
- `7000705 PREZUNIC SENADOR CAMARÁ`
- `7000712 PREZUNIC REALENGO`

**Match resultado:**
- ✓ "Prezunic - Senador Camará" → `7000705 PREZUNIC SENADOR CAMARÁ` (nome 2 tokens)
- ✓ "Prezunic - Realengo/ Serra Azul" → `7000712 PREZUNIC REALENGO` (nome 1 tokens)

**Diagnóstico:** ✓ OK_FULL (2/2)

---
## UGA1D55

**Escala (1 linha(s)):**
- [ASSAI] FELIPE DIEGO | loja="Assaí - Barra I (Senna) - Loja 133" cod=133

**Unitrac:** SEM PARADAS LOJA

**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE
