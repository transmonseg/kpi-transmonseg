# Fase 2 — Matcher Simplificado

## Problema

Matcher atual (`src/lib/kpi/matcher.ts`) tem ~1200 linhas com múltiplas estratégias:
- Match por código
- Match por nome
- Match geográfico (fallback lat/lng)
- `scorePair` fuzzy
- Parada compartilhada (caso REGINA)
- Match hybrid (combinado)

**Problema:** os fallbacks geram falsos positivos (Categoria B do RESUMO dia 22). Exemplos:
- SENDAS Americanas: matcher pegou SÃO JOÃO DE MERITI
- EMANUEL CACHAMORRA: matcher pegou SÃO JOÃO DE MERITI (mesma placa)
- SUPERCOMPRAS COSMOS: matcher pegou MERCADO SANTO AGOSTINHO

## Filosofia do v2 (decisão do dono)

> "Tá na escala + bateu match exato → mostra. Não bateu → SEM/vazio."

Sem geo. Sem fuzzy. Sem scorePair. Sem hybrid.

## Lógica do `matcher-v2.ts`

```typescript
function matcherV2(escalaEfetiva, paradasUnitrac, lojas) {
  const resultados = []
  for (const linha of escalaEfetiva) {
    const loja = lojas.find(l => l.id === linha.loja_id)
    const paradasPlaca = paradasUnitrac.filter(p => p.placa_norm === linha.placa_norm)
    
    if (paradasPlaca.length === 0) {
      // Placa não está no Unitrac
      resultados.push({ ...linha, saida_cd: null, paradas: [], status: 'SEM' })
      continue
    }
    
    // Match exato: codigo_loja do Unitrac == codigo_unitrac da loja
    let paradaMatch = paradasPlaca.find(p =>
      p.classificacao === 'LOJA' &&
      p.codigo_loja &&
      loja.codigo_unitrac &&
      p.codigo_loja === loja.codigo_unitrac
    )
    
    // Match por nome (se loja tem nome_unitrac cadastrado)
    if (!paradaMatch && loja.nome_unitrac) {
      paradaMatch = paradasPlaca.find(p =>
        p.classificacao === 'LOJA' &&
        p.nome_loja &&
        normalizar(p.nome_loja) === normalizar(loja.nome_unitrac)
      )
    }
    
    if (!paradaMatch) {
      resultados.push({ ...linha, saida_cd: null, paradas: [], status: 'EM_BRANCO' })
      continue
    }
    
    // Achou match — calcular SC (última base antes)
    const saidaCd = calcularSaidaCd(paradaMatch, paradasPlaca)
    resultados.push({ ...linha, saida_cd: saidaCd, paradas: [paradaMatch] })
  }
  return resultados
}
```

**Tamanho estimado:** ~100 linhas (vs. 1200 atuais).

## Subtarefas

### 2.1. Criar branch

```bash
git checkout -b feat/matcher-v2-simplificado
```

### 2.2. Implementar `matcher-v2.ts` LADO A LADO

**Localização:** `src/lib/kpi/matcher-v2.ts`

- Não substitui o antigo ainda
- Exporta `cruzaEscalaUnitracV2`
- Reaproveita helpers (`computeSaidaCdParaParada`, `normalizar`, etc) onde fizer sentido

### 2.3. Testes vitest

**Localização:** `src/lib/kpi/matcher-v2.test.ts`

Casos:
- Match por código exato → OK
- Match por nome exato → OK
- Sem match → em branco
- Sem placa no Unitrac → SEM
- Placa fez várias paradas, só uma é a loja certa → pega a certa
- Placa fez parada em loja DIFERENTE (cod diferente) → não pega (em branco)
- Múltiplas placas mesma loja (escala tem 2 carros) → cada uma matched

### 2.4. Script comparativo

**Localização:** `scripts/correcao/comparar_matchers.ts`

**Lógica:**
- Carregar escala + alterações + Unitrac dos dias 18-22
- Rodar matcher v1 (atual)
- Rodar matcher v2 (novo)
- Pra cada linha de escala, comparar resultado
- Gerar tabela markdown:

```markdown
| Loja | Rede | v1 | v2 | Análise |
|------|------|-----|----|---|
| ... | PREZUNIC | OK | OK | ✓ Iguais |
| Americanas | SENDAS | falso-positivo | em-branco | ✓ v2 melhor |
| Mercado de Santa | SENDAS | match-geo | em-branco | ⚠ v2 perdeu (mas era geo) |
```

### 2.5. Decisão go/no-go

Critérios pra merge:
- **Falsos positivos Categoria B:** v2 = 0 ✓
- **ZONA_SUL dia 19 OK count:** v2 ≥ v1 (canário não regride)
- **Total "em branco honesto":** aceitável (decidir caso a caso)
- **Lojas que dependiam de geo:** documentadas e aceitas como custo

Se aprovado → merge na main, deprecar matcher antigo.

## Critério de sucesso

- [ ] Branch criada e código v2 implementado
- [ ] Testes vitest v2 passando
- [ ] Suite total: 263+ passing
- [ ] Script comparativo gerado
- [ ] Decisão go/no-go documentada com dados
- [ ] Se go: merge sem afetar testes existentes

## Reversibilidade

- Branch separada → `git checkout main` reverte
- Após merge: pode reverter via `git revert <merge-commit>`

## Riscos

| Risco | Mitigação |
|-------|-----------|
| v2 piora redes que dependiam de geo | Tabela comparativa permite decisão informada |
| Quebrar testes existentes | Manter v1 disponível como `cruzaEscalaUnitracV1` durante transição |
| Lojas com cadastro `codigo_unitrac` errado ficam em branco | Fase 0 deve resolver antes; lista de exceções |
| ZONA_SUL regredir | Verificar dia 19 antes/depois |
