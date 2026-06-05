# Plano de Correção — KPI TransMonSeg (FINAL, pós-varredura completa)

> Investigação exaustiva: matcher de PRODUÇÃO rodado sobre escala geral +
> `relatorio_10001.pdf` (12:30), cruzamento com o export oficial do Unitrac
> (`unitrac_pontointeresse_consulta.xls`, 296 pontos) e dump parada-a-parada das
> placas com erro + análise de duplicatas no banco inteiro (399 lojas ativas).
>
> **Conclusão central: não há bug de lógica pra consertar. O ofensor é (1) relatório
> gerado cedo demais e (2) cadastro com registros DUPLICADOS.** Tudo abaixo é
> processo + dado, não reescrita de matcher.

## Números da varredura (148 linhas, escala geral, 05.06)
- ✅ **76% entregue** (95 ENTREGUE + 17 ENTREGUE_GEO). O geo/endereço está catando
  17 entregas reais que o código sozinho perderia.
- ❌ 36 erros, **nenhum** dos quais é bug de código (provado caso a caso).

## As duas causas-raiz

### A) Relatório PARCIAL (a maior — custo de correção ~zero)
11 placas que o cliente marcou como erro às 7h **já estão ENTREGUES** no relatório
das 12:30 (KQB, GSK, GBG, KSJ, CXA, FHO, KQR, KPN, FKY, TML2D79, AFY). O caminhão
ainda não tinha saído. **O sistema estava certo.**

### B) Cadastro DUPLICADO (registros-sombra)
399 lojas ativas, **57 com `codigo_unitrac=null`**. Detectadas **10 duplicatas-sombra**
(uma loja com código + uma cópia sem código, ≤80m, mesma rede) e **11 pares com dois
códigos diferentes** no mesmo ponto. A escala às vezes casa a cópia SEM código → o
match por código falha → "não foi".
**⚠️ Nuance crítica:** várias "duplicatas" funcionam via geo (Princesa Arraial,
SuperPrix Grajaú entraram ENTREGUE_GEO) e algumas nem são duplicata (Zona Sul 26 vs
47 são lojas diferentes a 52m). **Merge cego é perigoso — tem que ser revisado par a par.**

Duplicatas-sombra candidatas (cópia NULL ⇐ deve herdar/usar o código da coexistente):
```
PRINCESA   Arraial 1/2/3 (null)        ⇐ 8590559/560/569   [JÁ resolve via geo — baixa prioridade]
SUPERPRIX  Grajaú 08 / Verdun (null)   ⇐ 3030008 / 3030004 [JÁ resolve via geo]
SENDAS     Barramares (null)           ⇐ 22144000 PETIT MARCHE BARRAMARES
SENDAS     Barra Tower (null)          ⇐ 22144002 PETIT ATLANTICO SUL   [coords trocadas? revisar]
SENDAS     Atlantico Sul (null)        ⇐ 22980000 EMPORIO BARRA TOWER   [coords trocadas? revisar]
ZONA_SUL   Loja 26 Copacabana (null)   ⇐ 9039??? [≠ Loja 47 — NÃO é dup, lojas distintas]
```
Pares dois-códigos (mesmo ponto físico, escolher o canônico):
```
PREZUNIC   7000702 RECREIO        vs 7000752 "Recreio dos Bandeirantes" (= SPID, código trocado)
CARREFOUR  9006160 NORTE SHOPPING vs 9006002 NORTE SHOPPING
PRINCESA   8590570 IGUABA GRANDE  vs 8590575 "Iguaba (1 Entrega)"
```

## Plano (priorizado por impacto × custo × risco)

### 1. OPERACIONAL ⭐ — resolve a maior parte, sem tocar em lógica
- **Ação (cliente/processo):** gerar o KPI **após a janela de entrega** de cada rede,
  não às 7h.
- **Ação (código, opcional, baixo risco, vira PR sem merge):** reforçar o `avisoParcial`
  em `route.ts` pra avisar de forma mais visível quando o relatório vai até antes da
  janela da rede. Não usa migration.

### 2. CADASTRO — limpeza REVISADA (não automática)
- **2a. Gerar a lista de duplicatas** (feito acima) e **revisar par a par com o
  Joaquim/cliente** qual registro é o canônico. Só então migrar.
- **2b. `Prezunic Recreio`:** decidir o canônico entre 7000702 (RECREIO real) e 7000752
  (código de SPID mal-atribuído ao registro "Recreio dos Bandeirantes"). O caminhão
  entrega em 7000702. Recomendação: desativar/repointar o registro 7000752.
- **2c. Preencher `codigo_unitrac`** das cópias-sombra Sendas confirmadas (Barramares,
  etc.) pelo export — **exceto** as de coordenada suspeita (Barra Tower / Atlantico Sul,
  cujas coords parecem trocadas entre si — revisar antes).
- Migrations aplicadas à parte via `apply_migration` (deploy NÃO roda migration).

### 3. DADO QUE SÓ O CLIENTE TEM
- **`Armazém do Grão Central` (5353001):** `lat=0,lng=0` e não está no export → **pedir
  a coordenada ao cliente** e cadastrar.
- **`Mercado de Santa`:** não existe no banco nem no export → **pedir endereço/coord** e cadastrar.

### 4. DEVOLVER AO CLIENTE — fora do alcance do sistema
- **SASCAR** (AMW3424): rastreador de outro sistema, não integrado ao Unitrac.
- **KWV-7E89** (KWV7E49 na escala): placa errada no cadastro do Unitrac — corrigir lá.
- Placas ausentes do relatório (JXA, KGO, LAU, LQK, CDL): confirmar se rodaram.

### 5. ESCALA — qualidade do dado
- Linhas idênticas duplicadas (Catumbi 2× pra LTC8F97): pedir escala sem repetição,
  ou dedupe de linhas idênticas (placa+loja+rede+carro) **preservando** 2ª entrega real.

### 6. CÓDIGO — opcional, baixo ROI
- Pares OCR `0↔J` e `3↔6` (KQR-2011↔2J11, NSM-3D98↔6D98) com a guarda de cadastro que
  já existe. Risco baixo; ROI baixo (nesses relatórios as placas já resolveram).
- **NÃO fazer:** ligar geo "global" / afrouxar `matchGeoEndereco`. Os near-miss eram
  outra loja / duplicata / passagem de 4min — afrouxar só geraria falso-positivo
  (comprovado: caminhão na base casa lojas vizinhas a 50–95m).

## Ordem recomendada
**1 → 2 → 3 → 4 → 5 → 6.** A frente 1 sozinha mata a maior parte da insatisfação.
Nada aqui exige reescrever o matcher.

## Lembretes de produção
- Merge no `main` = no ar pra Tia Érica (deploy automático).
- Migrations Supabase aplicadas à parte via `apply_migration`.
- KPI roda diariamente → priorizar robustez, evitar regressão silenciosa.
