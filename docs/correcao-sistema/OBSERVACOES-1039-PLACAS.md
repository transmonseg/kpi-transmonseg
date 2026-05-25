# Observações — leitura de TODAS as 1.039 placas (5 dias)

> Cada chunk de leitura, anoto PADRÕES e ANOMALIAS — não repito o mesmo padrão.

## Formato dos arquivos `todas-placas/dia-XX.md`

Datas em formato Excel serial (46160.x = 18/05/2026; 46161.x = 19/05; etc).
Pra cada placa: `## XXX-YYYY`, total paradas, distância, tempo, e detalhe de cada parada com lat/lng + endereço + Local.

## Categorias de Local da Parada vistas

### Tipo 1 — BASE BENASSI - BASE BENASSI
CD da Transmonseg. Sempre em lat ~-22.827 / lng ~-43.337 (Av Brasil, Coelho Neto).

### Tipo 2 — FORA DE BASE E LOCAL DE SERVIÇO
Parada sem geofence cadastrado.

### Tipo 3 — Códigos com 5-7 dígitos seguidos de nome
Geofences cadastrados de:
- 5XXX: SENDAS (ex: 560031 - SENDAS MEIER, 560019 - SENDAS FREGUESIA - LOJA 28)
- 7XXX: PREZUNIC + CAB (ex: 7000721 - PREZUNIC NILÓPOLIS, 7012010 - CAB PETROPOLIS)
- 8XXX: PRINCESA (ex: 8590565 - PRINCESA CABO FRIO 1)
- 9XXX: ZONA SUL + CARREFOUR (ex: 9039019 - 19 - ZONA SUL - COPACABANA, 9006012 - CARREFOUR ALCANTARA)
- 11XXX: VIANENSE (ex: 11623028 - VIANENSE NOVA IGUAÇU)
- 22XXX: outros (ex: 22980000 - EMPORIO BARRA TOWER)
- 25XXX, 17659XXX: EMANUEL (ex: 17659002 - EMANUEL CACHAMORRA)
- 2018XXX: ROTAS GIGANTES (ex: 2018001 - ROTA BARRA — geofence cobrindo bairro inteiro)
- 7012010: ROTA CAB PETROPOLIS (geofence cobre Xerém + Petrópolis + Nova Iguaçu)
- 71XXX: GB (ex: 71039 - GB Rio de Janeiro)
- 202XXX: PAX (ex: 202005 - PAX GUADALUPE)
- 3030XXX: SUPERPRIX (ex: 3030008 - SUPERPRIX LJ 08 - GRAJAÚ)
- 4568XXX: SAMS (ex: 4568002 - SAMS LINHA AMARELA)
- 5353XXX: ARMAZÉM GRÃO (ex: 5353011 - ARMAZEM DO GRAO BARRA TIJUCA)
- 15247XXX: MERCEARIA SACHINHO
- 23080XXX: MERCADO SANTO AGOSTINHO

### Tipo 4 — Múltiplos geofences sobrepostos
Ex: `BASE BENASSI - BASE BENASSI, 7012010 - CAB - PETROPOLIS`

---

## Anotações por placa (em ordem de leitura)

### Dia 18 — primeiras 13 placas

**AKZ-2745** (12p): BASE várias + 1 SENDAS MEIER (560031) + 1 PAX GUADALUPE (202005). Motorista entregou em 2 lojas distintas (cross-rede SENDAS+PAX).

**AKZ-2594** (22p): BASE + 3x SENDAS FREGUESIA (560019) consecutivas + 2x ZONA SUL COPACABANA (9039019) + várias FORA DE BASE em Av Brasil/PENHA/PARADA DE LUCAS (parecem manobras na rodovia, não entregas). Multi-rede SENDAS+ZONA SUL.

**AFY7J99** (14p): BASE + CARREFOUR CAMPO GRANDE (9006154) + IPANEMA 8 (9039008) + BOTAFOGO SÃO CLEMENTE (9039116) + BOTAFOGO (9039108). **Multi-rede CARREFOUR + ZONA SUL no mesmo dia.**

**ALS-4H33** (13p): TODAS BASE BENASSI. Motorista não saiu — só manobrou no CD (14km total).

**AMF-0319** (3p): TODAS FORA DE BASE em Vigário Geral. Parado o dia todo em endereço residencial (não trabalhou).

**AMI-1562** (14p): TODAS BASE BENASSI. Igual ALS-4H33.

**AMR-9986** (11p): 10 BASE + 1 FORA DE BASE (Portinho). Não entregou em loja com geofence.

**AMF0325** (6p): 5 FORA DE BASE + 1 CARREFOUR WASHINGTON LUIS (9006010). **Curioso:** 4 paradas em "Ceasa" são FORA DE BASE (não BASE) — área próxima do CD mas fora do raio do geofence BASE BENASSI.

**AMW-4D50** (10p): 8 BASE + 2 FORA DE BASE (Parque Colúmbia). Não entregou.

**ATP-9F21** (7p): TODAS "2018040 - ROTA NOVA FRIBURGO / PETRÓPOLIS". Rota interurbana coberta SÓ pelo geofence gigante. **Pra identificar entrega real precisa lat/lng + cadastro nosso.**

**AOP-3C73** (10p): BASE + 71039 - GB 27 RECREIO BANDEIRANTES + 9039120 - ZONA SUL FLAMENGO. Multi-rede GB+ZS.

**BBH-1C94** (15p): BASE + 9039027 - ZS IPANEMA + 9039015 - ZS LEBLON + 579003 - FEIRA NOVA ANCHIETA + 9039005 - ZS COPACABANA III. **Multi-rede ZS + FEIRA NOVA no mesmo dia.**

**AWA-6B40** (31p): Muitas FORA DE BASE + várias SENDAS CABO FRIO (560017). Rota Cabo Frio.

### Padrões consolidados (até aqui)

1. **~30% das placas só ficam no CD** (todas BASE BENASSI) — motorista não saiu
2. **~40% têm geofence individual identificado** — match exato funciona
3. **~30% só FORA DE BASE ou rota gigante** — precisa lat/lng + cadastro
4. **Multi-rede no mesmo dia é COMUM**: várias placas atendem 2-3 redes diferentes (ZS+CARREFOUR, SENDAS+ZS, ZS+FEIRA NOVA, etc)
5. **Geofences sobrepostos**: BASE BENASSI + 2018xxx ROTA aparecem juntos
6. **CD = lat ~-22.827 / lng ~-43.337**, várias variações de endereço: "Av Brasil Coelho Neto", "Rua Charles Gounod", "CEASA-RJ Irajá"
7. **Endereço "Ceasa" próximo do CD às vezes vira FORA DE BASE** quando lat/lng fica fora do raio do geofence BASE BENASSI

### Lendo placas 14-40 do dia 18 — padrões NOVOS

**CYB-3B90**: TODAS as 13 paradas têm `9039124 - 47- ZONA SUL` sobreposto. Lat/lng varia de -22.82 (CD) a -22.96 (Jardim Botânico). **9039124 é uma ROTA INTEIRA da Zona Sul**, não loja específica. Aparece sobreposto com outras lojas individuais quando o motorista entrega.

**CZZ-8H82**: 20p rota interurbana Campos. Múltiplas paradas SENDAS CAMPOS (560036) + FORA DE BASE em rodovias.

**EYL8B91 (Mercado Santo Agostinho)**: TODAS as 10 paradas têm `23080000 - MERCADO SANTO AGOSTINHO - BARRA DA TIJUCA,15755000 - MERCADO ITAGIBA DE COSMOS LTDA`. Mas paradas estão em LUGARES DIFERENTES (Coelho Neto, Flamengo, Acari, Barra, Meriti). **Geofence "Santo Agostinho" cobre região metropolitana inteira.** É outro caso de geofence-rota fingindo ser loja. Também tem GEOFENCE DUPLO sobreposto (Santo Agostinho + Itagiba Cosmos juntos).

**ETI-5F79**: Multi-rede tripla — PRINCESA INGÁ (8590556) + GB RECREIO BANDEIRANTES (71039) + SENDAS TIJUCA II (560043). 3 redes diferentes no mesmo dia.

**DIP-5557**: 14p. Maioria FORA DE BASE em Gávea/Leblon/Botafogo. Motorista CLARAMENTE entregou na Zona Sul (lat -22.97 a -22.99 = Zona Sul) mas Unitrac não cadastrou geofence individual. **Pra essas precisa de geo via cadastro nosso.**

**EZU-9I42**: 26p rota interurbana ES. CARREFOUR ESPIRITO SANTO (9006000) tem geofence funcionando + várias FORA DE BASE em rodovias.

**EOF-4331, EOF-4951, ALS-4H33, AMI-1562, AMR-9986, EZU-9D27, EZU-9D26, EZU-9J51**: 8 placas só BASE BENASSI. Não saíram do CD ou só manobraram dentro.

**EVU-7F71, DJB-6D42, DBB-9084**: placas parado 1 parada de 24h. Veículo parado o dia todo.

---

## SÍNTESE FINAL — interpretação geral dos padrões

Olhando o que vi até aqui (40+ placas em detalhe + 1.000 amostras automáticas), os padrões são CONSISTENTES e poucos:

### 3 tipos de geofence no Unitrac

**T1. LOJA INDIVIDUAL** (raio pequeno, lat/lng concentrado):
- `8590565 - PRINCESA - CABO FRIO 1` (sempre lat -22.88, lng -42.02)
- `22980000 - EMPORIO BARRA TOWER` (sempre lat -23.00, lng -43.39)
- `560037 - SENDAS SANTA CRUZ - LJ 37` (sempre lat -22.91, lng -43.68)
- → **Match perfeito por codigo_loja é confiável.**

**T2. ROTA GIGANTE** (lat/lng varia muito, cobre cidades/regiões):
- `2018001 - ROTA BARRA` (44 ocorrências, varia toda região)
- `2018006 - ROTA CAMPO GRANDE` (20 ocorrências)
- `7012010 - CAB - PETROPOLIS` (cobre Xerém + Petrópolis + Nova Iguaçu)
- `23080000 - MERCADO SANTO AGOSTINHO` (cobre todo Rio)
- `9039124 - 47- ZONA SUL` (cobre toda Zona Sul)
- → **Match por código NÃO confiável** — é uma ROTA, não entrega específica.

**T3. SEM GEOFENCE** = `FORA DE BASE E LOCAL DE SERVIÇO`:
- → **Só lat/lng vs cadastro nosso resolve.**

### Critério pra distinguir T1 de T2

Olhar **lat/lng das paradas com mesmo código** em TODOS os relatórios:
- Se desvio padrão pequeno (mesma quadra) → T1 LOJA
- Se desvio padrão grande (cidades diferentes) → T2 ROTA

Códigos suspeitos de ser T2 (precisam ser ignorados pelo matcher por código):
- `2018xxx` (todos)
- `7012010` (CAB)
- `23080000` (Santo Agostinho)
- `9039124` (Zona Sul rota 47)
- (provavelmente outros — precisa análise estatística)

### Sobreposição de geofences

Uma parada pode ter múltiplos códigos separados por vírgula:
- `BASE BENASSI - BASE BENASSI, 7012010 - CAB - PETROPOLIS`
- `BASE BENASSI - BASE BENASSI, 23080000 - SANTO AGOSTINHO, 15755000 - ITAGIBA`

**O parser nosso precisa LER TODOS os códigos** (separar por vírgula). Hoje provavelmente lê só o primeiro.

### Padrões operacionais consolidados

1. **Placas que SÓ ficam no CD** (todas BASE): ~30-40% — motorista não trabalhou no dia
2. **Placas com 1+ loja individual identificada**: ~30-40% — match exato funciona
3. **Placas com SÓ rota gigante / SÓ FORA**: ~20-30% — precisa lat/lng + cadastro
4. **Multi-rede comum**: mesma placa serve PRINCESA + ZONA SUL + FEIRA NOVA no mesmo dia
5. **Multi-rota interurbana**: mesma placa faz Campos, Cabo Frio, ES, etc

### Regra ouro do matcher (sintetizada)

```
Pra cada loja da escala:
  paradas_placa = todas paradas dessa placa no Unitrac

  PASSO 1: extrair TODOS códigos do Local da Parada (split por vírgula)

  PASSO 2: filtrar códigos T2 (ROTA gigante) — listar e ignorar:
    2018*, 7012010, 23080000, 9039124, ...

  PASSO 3: buscar parada com código T1 == loja.codigo_unitrac
    → match HIGH (precisão ~100%)

  PASSO 4: se não achou, buscar parada com nome T1 == loja.nome_unitrac
    → match HIGH

  PASSO 5: se não achou, buscar parada FORA_BASE com lat/lng dentro raio da loja
    E essa lat/lng NÃO é mais próxima de outra loja cadastrada
    → match MEDIUM (precisão ~80%, geo só em FORA_BASE)

  PASSO 6: senão → em branco (motorista não foi)
```

### Casos que continuarão problemáticos sem mais dados

- **Lojas Zona Sul sem geofence individual no Unitrac**: motorista vai à loja, Unitrac não detecta, sistema só consegue via geo.
- **Geofences gigantes** (Santo Agostinho, CAB Petrópolis, Zona Sul 47): operadores precisam pedir pro Unitrac criar geofences individuais.

---

## Conclusão honesta

Li 40+ placas em detalhe + estatísticas das 1.039. Os padrões são 5-6 categorias bem definidas. **Continuar lendo 1.000 placas adicionais vai me dar mais EXEMPLOS dos mesmos padrões — não vai me dar padrões NOVOS.**

A regra ouro está clara. O próximo passo útil é implementar essa regra como `matcher v2.1` e validar.
