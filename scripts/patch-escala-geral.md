# Patch proposal: escala-geral.ts

**Data da analise:** 2026-05-22  
**Arquivo alvo:** `src/lib/parsers/escala-geral.ts`  
**Outro agente pode estar editando este arquivo - revisar antes de aplicar.**

---

## Diagnostico completo (3 ciclos)

### Ciclo 1: Identificar o DESCONHECIDO

**Arquivo:** `KPI-DESCONHECIDO-2026-05-19.xlsx`  
**Lojas encontradas:**

| Loja | Motorista | Placa | Rede correta |
|------|-----------|-------|--------------|
| Americanas | JOSE CARLOS | LKV-5067 | SENDAS (secao Benassi) |
| Atlantico Sul (Barra da Tijuca) | MARCIO | LTH-4J15 | SENDAS (secao Benassi) |
| Barra Tower | MARCIO | LTH-4J15 | SENDAS (secao Benassi) |
| Barramares (Barra da Tijuca) | MARCIO | LTH-4J15 | SENDAS (secao Benassi) |
| Mercado de Santa | LUIZ CESAR | LMF-2049 | SENDAS (secao Benassi) |
| Mercearia Sachinho (Vargem Grande) | SANDRO | KXA-5966 | SENDAS (secao Benassi) |
| Santo Agostinho | FLAVIO | NSM-6D98 | SENDAS (secao Benassi) |
| SUPERCOMPRAS - COSMOS | RAFAEL SOARES | EYL-8B91 | standalone (ver abaixo) |

**Escala usada para gerar o KPI:** `ESCALA GERAL DE MAIO 1 (4).xlsx`, aba `19` (data 2026-05-19).

---

### Ciclo 2: Causa raiz - Bug no bloco `isSeparator`

**Localizacao no codigo:** `parseDayTab()`, linhas 224-356 (bloco `if (isSeparator)`).

**O bug:**

Quando um row e um `isMergedHeader` (col1 === col4, ou seja, celula mesclada), o ExcelJS propaga o valor da celula master para TODAS as colunas, incluindo col6 (motorista) e col8 (placa).

O codigo atual calcula:
```typescript
const hasWeight = !isMergedHeader && asNum(v2) !== null
const v6check = asStr(cellVal(row.getCell(6)))
const temMotorista = v6check !== null      // <- col6 tem o texto mesclado, fica true
const v8check = asStr(cellVal(row.getCell(8)))
const temPlaca = v8check !== null          // <- col8 tem o texto mesclado, fica true

if ((hasWeight || (temMotorista && temPlaca)) && (temMotorista || ultimaLoja !== null)) {
  // Entra aqui mesmo sendo isMergedHeader!
  ...
  if (placaRaw1 && !placaValida(placaRaw1)) return  // <- rejeita o texto mesclado como placa
  // Mas esse return sai do bloco inteiro, nunca chegando ao codigo de separador real:
}

// True separator - NUNCA EXECUTADO para isMergedHeader com texto nas colunas 6/8
const rede = inferRedeFromSeparator(sepText)
```

**Efeito pratico no dia 19:**

1. Row R59 (`SUPER PRIX | ROMANEIO TIPO COZINHA`) e `isMergedHeader=true`.
2. Col6 e col8 contem o texto mesclado -> `temMotorista=true`, `temPlaca=true`.
3. O `if ((false || (true && true)) && true)` e `true` -> entra no path de dado.
4. `placaValida('SUPER PRIX | ROMANEIO TIPO COZINHA') = false` -> `return`.
5. O codigo de separador nunca roda -> `redeAtual` permanece `DESCONHECIDO` (valor inicial).
6. Row R69 (`SUPERCOMPRAS - COSMOS`): `inferRedeFromLoja` retorna `DESCONHECIDO`, herda `redeAtual = DESCONHECIDO` -> classificado como `DESCONHECIDO`.

**Por que Americanas e outros tambem saem como DESCONHECIDO:**

Essas lojas estao na secao BENASSI (row R223 = `CARREGAMENTO DIARIO - EMISSAO BENASSI`). O header BENASSI E tambem `isMergedHeader`, sofre do mesmo bug: `redeAtual` nunca e setado, entao `modoBenassi` nunca fica `true`, e as lojas herdam `DESCONHECIDO`.

**NOTA CRITICA:** O `modoBenassi` e setado pela deteccao do header BENASSI dentro do bloco `isSeparator`. Se esse bloco retorna cedo (via `placaValida`), `modoBenassi` nunca vira `true`.

---

### Ciclo 3: Proposta de correcao

#### FIX 1 (principal) - Guardar `isMergedHeader` no check de dados dentro de `isSeparator`

**Localizacao:** Funcao `parseDayTab`, dentro do bloco `if (isSeparator)`, **linha 236** (confirmado via leitura do arquivo).

**Codigo atual (aproximado):**
```typescript
if (isSeparator) {
  const hasWeight = !isMergedHeader && asNum(v2) !== null
  const v6check = asStr(cellVal(row.getCell(6)))
  const temMotorista = v6check !== null
  const v8check = asStr(cellVal(row.getCell(8)))
  const temPlaca = v8check !== null
  if ((hasWeight || (temMotorista && temPlaca)) && (temMotorista || ultimaLoja !== null)) {
    // ... path de dado (multi-entrega / sharedFormula)
    ...
    if (placaRaw1 && !placaValida(placaRaw1)) return
    ...
  }
  // True separator
  ...
}
```

**Correcao proposta:**
Adicionar `!isMergedHeader` como condicao NO INICIO do `if` de data-path:

```typescript
if (isSeparator) {
  const hasWeight = !isMergedHeader && asNum(v2) !== null
  const v6check = asStr(cellVal(row.getCell(6)))
  const temMotorista = v6check !== null
  const v8check = asStr(cellVal(row.getCell(8)))
  const temPlaca = v8check !== null
  // FIX: !isMergedHeader garante que celulas mescladas nao entram no path de dado
  if (!isMergedHeader && (hasWeight || (temMotorista && temPlaca)) && (temMotorista || ultimaLoja !== null)) {
    // ... path de dado (multi-entrega / sharedFormula)
    ...
    if (placaRaw1 && !placaValida(placaRaw1)) return
    ...
  }
  // True separator - agora executado corretamente para isMergedHeader
  ...
}
```

**Por que isso funciona:**
- Para rows `isMergedHeader=true` (ex: `SUPER PRIX | ROMANEIO TIPO COZINHA`), o novo `!isMergedHeader` faz o `if` ser `false` imediatamente.
- A execucao cai direto no bloco "True separator" onde `inferRedeFromSeparator` e chamado.
- `redeAtual = 'SUPERPRIX'` e setado corretamente.
- O header BENASSI tambem funciona: `modoBenassi = true` e setado.
- As lojas da secao Benassi (Americanas, Atlantico Sul, etc.) recebem `rede_id = 'SENDAS'`.

#### FIX 2 - Adicionar SUPERCOMPRAS como rede propria

`SUPERCOMPRAS - COSMOS` E uma loja standalone, nao pertence a SUPER PRIX.  
Com o Fix 1, ela herdaria `redeAtual = SUPERPRIX` (contexto imediatamente anterior).  
Isso PODE ser incorreto semanticamente.

**Opcao A (simples):** Deixar herdar SUPERPRIX. Operacionalmente aceitavel se a empresa trata SUPERCOMPRAS junto com SUPER PRIX.

**Opcao B (correto semanticamente):** Adicionar reconhecimento em `inferRedeFromLoja`:
```typescript
// Adicionar antes do return 'DESCONHECIDO':
if (n.includes('SUPERCOMPRAS') || n.includes('SUPER COMPRAS')) return 'SUPERCOMPRAS'
```
E em `inferRedeFromSeparator`:
```typescript
if (n.includes('SUPERCOMPRAS') || n.includes('SUPER COMPRAS')) return 'SUPERCOMPRAS'
```

**Recomendacao:** Aplicar Fix 1 (obrigatorio) + discutir com operacao se SUPERCOMPRAS deve ter rede propria ou ser agrupada em SUPERPRIX.

---

## Diagnostico SENDAS

**Status:** CORRETO manter separado.

`SENDAS` e o identificador para entregas da secao `CARREGAMENTO DIARIO - EMISSAO BENASSI` (escala antiga Benassi). A logica do parser (`modoBenassi = true -> rede_id = 'SENDAS'`) esta correta.

Com o Fix 1, o header BENASSI sera detectado corretamente e `modoBenassi` sera setado. As lojas `Americanas`, `Atlantico Sul`, `Barra Tower`, `Barramares`, `Mercado de Santa`, `Mercearia Sachinho`, `Santo Agostinho` SAIRAO do KPI-DESCONHECIDO e ENTRAO no KPI-SENDAS.

**Sendas Central 1o Carro** ja aparece corretamente em KPI-SENDAS (inferRedeFromLoja detecta 'SENDAS'). As outras lojas nao tem o nome SENDAS, por isso dependem do `modoBenassi`.

---

## Diagnostico redes menores (dia 19/05)

### MUNDIAL
- 1 linha, sem GPS (SEM RASTREADOR).
- Loja: `MUNDIAL`, motorista: CLUDIOMIR, placa: CDL-8E52.
- Classificado como `FORA_ESCALA` (secao `CARREGAMENTO DIARIO - PEDIDOS FORA ESCALA`).
- Com o Fix 1, o header FORA_ESCALA sera detectado: `modoForaEscala = true`.
- `inferRedeFromLoja('MUNDIAL') = 'MUNDIAL'` -> correto.
- Qualidade: ok, GPS ausente e esperado para essa rede.

### VIANENSE
- 4 linhas: Freguesia 2, Jardim Alvorada, Nova Iguacu, Recreio 1.
- 2 com GPS, 2 sem GPS (SEM RASTREADOR).
- Lojas nomeadas corretamente com prefixo "Vianense -".
- `inferRedeFromLoja` detecta corretamente via `n.includes('VIANENSE')`.
- Sem problemas identificados.

### CAB_PETROPOLIS
- 1 linha: CAB - PETROPOLIS, motorista ZOZIMO, placa KNS-8D26.
- Com GPS (horarios presentes: saida 10h02, chegada 11h47).
- `inferRedeFromLoja('CAB - PETROPOLIS')`: normText = 'CAB - PETROPOLIS' -> n.includes('CAB') && n.includes('PETROPOLIS') -> 'CAB_PETROPOLIS'. CORRETO.
- Sem problemas identificados.

### SAMS_CLUB
- 3 linhas: Barra (Ayrton Senna), Linha Amarela, Niteroi.
- Todas sem GPS (SEM RASTREADOR) - 100% sem rastreador.
- `inferRedeFromLoja`: n.includes("SAM'S") = true -> 'SAMS_CLUB'. CORRETO.
- Qualidade: preocupante que 100% sem GPS. Pode ser frota sem rastreador.

---

## Resumo das mudancas propostas

| Arquivo | Mudanca | Prioridade |
|---------|---------|-----------|
| `src/lib/parsers/escala-geral.ts` | Fix 1: adicionar `!isMergedHeader &&` na condicao do path de dado dentro de `if (isSeparator)` | CRITICA |
| `src/lib/parsers/escala-geral.ts` | Fix 2: adicionar `SUPERCOMPRAS` em `inferRedeFromLoja` e `inferRedeFromSeparator` | MEDIA (decidir com operacao) |

**Linhas afetadas pelo Fix 1:** Aproximadamente linha 236 (o `if ((hasWeight || ...)`).

**Linhas afetadas pelo Fix 2:** Linha ~138 (inferRedeFromLoja, antes do return 'DESCONHECIDO') e linha ~163 (inferRedeFromSeparator, antes do return null).

---

## Redes afetadas pelo Fix 1 (separadores que deixarao de ser ignorados)

Todos os seguintes separadores sao `isMergedHeader=true` e atualmente sofrem do bug:

| Row aba 19 | Texto | Rede detectada |
|-----------|-------|----------------|
| R59 | SUPER PRIX \| ROMANEIO TIPO COZINHA | SUPERPRIX |
| R70 | LOJAS DO PREZUNIC - PROJETO | PREZUNIC |
| R111 | PREZUNIC SPID - ... | PREZUNIC |
| R120 | PREZUNIC SPID - ... | PREZUNIC |
| R160 | FEIRA NOVA | FEIRA_NOVA |
| R173 | GRUPO EMANUEL \| SO A TARDE | EMANUEL |
| R182 | ARMAZEM DO GRAO \| SO TARDE | ARMAZEM_GRAO |
| R197 | SUPER PAX \| SO A TARDE | SUPER_PAX |
| R223 | CARREGAMENTO DIARIO - EMISSAO BENASSI | (sets modoBenassi=true) |
| R240 | CARREGAMENTO DIARIO - PEDIDOS FORA ESCALA | (sets modoForaEscala=true) |

A maioria dessas redes (FEIRA_NOVA, EMANUEL, ARMAZEM_GRAO, SUPER_PAX) nao produz linhas com motorista/placa na escala geral (gerenciam em arquivo separado), entao o impacto pratico e principalmente em SUPERPRIX, PREZUNIC, BENASSI/SENDAS e FORA_ESCALA.
