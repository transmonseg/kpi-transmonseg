# Decisões sobre as 11 duplicatas/ambiguidades — Sprint A2

> Gerado por `scripts/correcao/resolver_duplicatas.ts`

## Duplicata #1

- **FLAGAR**: REGINA 5353012/14/16/17 + ABASTECEDORA — já marcadas como ROTAS_GIGANTES, nada a fazer aqui

## Duplicata #2

- **FLAGAR**: O BOM / EMANUEL grupo (17659xxx, 25140000, 11139000) — aguardar Fecchio confirmar quais são lojas físicas

## Duplicata #3

- **REDUZIR_RAIO** (2019003 DISPOSICAO - JANAUBA): DISPOSIÇÃO 2019003 lat/lng cai no CD BENASSI. Reduzir raio pra 30m
  - novo raio: 30m
- **REDUZIR_RAIO** (2019007 DISPOSIÇÃO MUNDIAL): DISPOSIÇÃO 2019007 lat/lng cai no CD BENASSI. Reduzir raio pra 30m
  - novo raio: 30m

## Duplicata #4

- **PADRONIZAR_NOME** (3030013 SUPERPRIX LJ 13 - TIJUQUINHA): Padronizar nome de SUPERPRIX 3030013 pra evitar ambiguidade "LJ 13"
  - novo nome: `SUPERPRIX TIJUQUINHA LJ 13`
- **PADRONIZAR_NOME** (3030113 SUPERPRIX LJ 13 - NITEROI): Padronizar nome de SUPERPRIX 3030113 pra evitar ambiguidade "LJ 13"
  - novo nome: `SUPERPRIX NITEROI LJ 13`

## Duplicata #5

- **FLAGAR**: PRINCESA Arraial 1/2/3 — 3 cadastros distintos OK

## Duplicata #6

- **FLAGAR**: PRINCESA Buzios 1/2/3 — 3 cadastros distintos OK

## Duplicata #7

- **FLAGAR**: PRINCESA Cabo Frio 1/2/3 + SENDAS Cabo Frio LJ 82 — 4 cadastros distintos OK

## Duplicata #8

- **FLAGAR**: PRINCESA Maricá 1/2 + PREZUNIC Maricá — 3 cadastros distintos OK

## Duplicata #9

- **FLAGAR**: ZS Copacabana cluster (9039003/4/5/18/19/27/110) — 7 lojas próximas, manter

## Duplicata #10

- **FLAGAR**: MERCADO SANTO AGOSTINHO + ITAGIBA COSMOS — ROTAS_GIGANTES, nada a fazer aqui

## Duplicata #11

- **REDUZIR_RAIO** (560026 SENDAS CEASA - LOJA 42): 560026 SENDAS CEASA fica dentro do raio do CD BENASSI (lat -22.8288). Reduzir raio pra 50m pra evitar colisão
  - novo raio: 50m
