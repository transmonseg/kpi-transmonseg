# Aprendizado: olhando os relatórios Unitrac com olhos humanos

> Gerado após análise visual de relatórios PDF dos dias 18-22, placa por placa.
> Sem inferência automática — só observação direta.

## Estrutura real do relatório Unitrac

Cada relatório PDF/XLSX tem uma aba/seção por **placa**. Cada parada tem:
- Data parada / Data Saída
- Duração
- Endereço (texto humano)
- **Latitude / Longitude** (sempre presente)
- **Local da Parada** — categorização do geofence

## 3 tipos de "Local da Parada"

### Tipo 1 — `BASE BENASSI - BASE BENASSI`
O CD da Transmonseg. Sempre indica o caminhão dentro do depósito.

### Tipo 2 — `FORA DE BASE E LOCAL DE SERVIÇO`
Parada NÃO está dentro de NENHUM geofence cadastrado no Unitrac.
Pode ser:
- Loja real que não tem geofence cadastrado lá
- Casa do motorista (pernoite)
- Parada técnica (posto, almoço)

### Tipo 3 — `[CÓDIGO] - [NOME]`
Parada dentro de geofence cadastrado. Mas tem **2 SUBTIPOS importantes**:

**3a. Geofence de LOJA INDIVIDUAL** (raio pequeno, ponto específico):
```
8590565 - PRINCESA - CABO FRIO 1
8590567 - PRINCESA - CABO FRIO 3
22980000 - EMPORIO BARRA TOWER
22144000 - PETIT MARCHE BARRAMARES
560037 - SENDAS SANTA CRUZ - LJ 37
```

**3b. Geofence de ROTA / ÁREA GIGANTE** (cobre área enorme):
```
2018001 - ROTA BARRA          (44x ocorrências no dia 22)
2018006 - ROTA CAMPO GRANDE   (20x)
7012010 - CAB - PETROPOLIS    (cobre Xerém + Petrópolis + Nova Iguaçu!)
```

**Critério pra distinguir 3a vs 3b:** observar lat/lng de várias paradas com mesmo código:
- Se variam pouco (mesma quadra) = 3a (loja individual)
- Se variam muito (cidades diferentes) = 3b (rota/área)

## Geofences SOBREPOSTOS

Uma única parada pode estar em MÚLTIPLOS geofences ao mesmo tempo:

```
22/05/2026 KNS-8D26 em Charles Gounod (lat -22.827):
"BASE BENASSI - BASE BENASSI, 7012010 - CAB - PETROPOLIS"
```

Significa que a Rua Charles Gounod está DENTRO do geofence "BASE BENASSI" E DENTRO do geofence "CAB-PETROPOLIS" (que é uma rota gigante).

**O parser nosso precisa extrair TODOS os códigos, não só o primeiro.**

## Caso exemplar: UEH9I93 dia 22 — match PERFEITO

A placa fez Princesa Cabo Frio 1, 2 e 3 (3 entregas):

```
05:22-06:54 | "8590565 - PRINCESA - CABO FRIO 1"  ✓ código 100% certo
06:56-07:46 | "8590567 - PRINCESA - CABO FRIO 3"  ✓
08:06-08:34 | "8590566 - PRINCESA - CABO FRIO 2"  ✓
```

3 lojas, 3 códigos distintos, 3 geofences pequenos e bem localizados (todos em Cabo Frio dentro de poucas quadras). **Quando o Unitrac tem geofence individual cadastrado, match é trivial e exato.**

## Caso problemático: KNS-8D26 dia 22 — geofence gigante

A placa fez (suposta) entrega no CAB Petrópolis. Olhando o GPS:

```
00:00-03:45 Xerém (DUQUE DE CAXIAS) → "7012010 - CAB - PETROPOLIS"
04:41-05:03 CEASA-RJ (IRAJÁ)        → "BASE BENASSI, 7012010 - CAB"
07:07-07:55 Petrópolis (REAL)        → "7012010 - CAB - PETROPOLIS"
09:29-10:09 Nova Iguaçu              → "7012010 - CAB - PETROPOLIS"
10:40-10:55 Coelho Neto              → "BASE BENASSI, 7012010 - CAB"
```

O geofence `7012010` cobre uma ÁREA GIGANTE (não é uma loja). É a "rota CAB-Petrópolis" do motorista. **Confiar nesse código pra identificar entrega ESPECÍFICA é errado.**

## Caso "invisível ao matcher": DIP-5557 dia 22

13 paradas, TODAS "FORA DE BASE" (exceto 1 BASE):

```
06:49-07:00 Penha Circular           → FORA DE BASE
10:09-10:57 R Engenheiro Cravo Peixoto, TIJUCA → FORA DE BASE
11:06-13:05 R Andrade Neves          → FORA DE BASE
13:51-14:32 Maracanã                 → FORA DE BASE
```

O motorista CLARAMENTE entregou em alguma loja na TIJUCA (paradas concentradas lá). Mas Unitrac não tem geofence individual cadastrado pra essas lojas. **Só dá pra identificar via lat/lng vs cadastro nosso.**

## Distribuição real (dia 22 — 213 placas):

| Caso | Placas |
|------|--------|
| Tem AO MENOS 1 loja com nome cadastrado | 133 (62%) |
| Só BASE/FORA (sem nome de loja) | 80 (38%) |

**38% das placas precisam de match geográfico (lat/lng) — não tem código de loja no Unitrac.**

## Regra do matcher que respeita esta realidade

```
Pra cada linha da escala (com alterações aplicadas):
  loja_alvo = identificar do cadastro pelo loja_nome_raw + rede_id

  Pra cada parada da placa no Unitrac:

    1. EXTRAIR TODOS os códigos do "Local da Parada"
       (pode ter múltiplos separados por vírgula)

    2. SE algum código bater EXATO com loja_alvo.codigo_unitrac:
       → match exato (HIGH confidence)
       FILTRAR: ignorar códigos de ROTA gigante (heurística:
                código com >100 paradas no dia em lat/lng diferentes)

    3. SE nome no "Local da Parada" bater EXATO com loja_alvo.nome_unitrac:
       → match exato

    4. SE parada é "FORA DE BASE" E lat/lng dentro do raio da loja_alvo:
       → match geo (MEDIUM confidence)
       FILTRAR: lat/lng também não pode estar mais próximo de outra
                loja cadastrada (evita falso positivo)

  Senão → em branco (motorista não foi)
```

## Por que matcher v1 atual gera falsos positivos (Categoria B)

O v1 usa fuzzy/scorePair que considera paradas **com nome diferente** como possível match.
Exemplo SENDAS Americanas (LKV5067):
- Placa fez 15 paradas, várias com nome "SENDAS SÃO JOÃO DE MERITI" (cod 560040)
- Americanas real NÃO aparece em nenhuma parada
- v1 escolheu SÃO JOÃO DE MERITI como sendo Americanas → falso positivo

**Solução:** NUNCA pegar parada com nome de OUTRA loja conhecida como match. Se a parada tem código identificável (560040 = São João de Meriti), e a loja-alvo é outra (Americanas, código diferente), NÃO casa. Cai pra estratégia 4 (geo em FORA_BASE) e se também não casa, fica em branco.

## Padrão dos 5 dias

Olhando placas em todos os dias (18, 19, 20, 21, 22):
- Mesmas placas fazem padrões similares dia após dia
- Geofences identificados são consistentes (cod 8590565 sempre PRINCESA CABO FRIO 1)
- Diferença entre dias é só quais paradas/lojas o motorista visitou
- Estrutura do relatório é IDÊNTICA em todos os dias

## Próximos passos sugeridos

1. **Melhorar o parser unitrac.ts** pra extrair TODOS os códigos do "Local da Parada" (separados por vírgula)
2. **Identificar geofences-rota** (códigos 2018xxx e 7012010 com cobertura geográfica enorme) e descartá-los do matching individual
3. **Match geo só em FORA_BASE** + filtro de proximidade exclusiva
4. **NUNCA usar fuzzy em nome de outras lojas** — fonte dos falsos positivos
