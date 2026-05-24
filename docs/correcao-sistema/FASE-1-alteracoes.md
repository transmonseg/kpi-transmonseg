# Fase 1 — Pipeline de Alterações Robusto

## Problema

Alterações precisam ser **aplicadas na escala ANTES** de qualquer matching. Hoje:
- Parser PDF tabular existe e funciona (commit `aad2697`)
- Parser texto livre existe e funciona
- **Mas o pipeline de geração KPI não consome as alterações** — matcher recebe escala original

Resultado no dia 22:
- PREZUNIC Caxias Centro/Centenário: alteração foi aplicada no KPI mas via processo manual fora do sistema
- CARREFOUR Campo Grande: idem

## Objetivo

Implementar conceito de **escala efetiva do dia**:

```
escala_efetiva = aplicarAlteracoes(escala_original, alteracoes)
```

Toda a geração KPI usa `escala_efetiva`. Sem branching, sem "tentar lembrar".

## Subtarefas

### 1.1. Função `aplicarAlteracoes`

**Localização:** `src/lib/kpi/aplicar-alteracoes.ts`

**Assinatura:**
```typescript
export function aplicarAlteracoes(
  escala: LinhaEscala[],
  alteracoes: AlteracaoParsed[]
): { escalaEfetiva: LinhaEscala[], aplicadas: number, naoAplicadas: AlteracaoParsed[] }
```

**Regras:**
- Match por (rede_id + loja_nome_normalizado + carro_ordem) → substituir motorista + placa
- Se alteração não casa com nenhuma linha → registrar em `naoAplicadas`
- Manter `LinhaEscala.motorista_nome_original` e `placa_original` pra auditoria

### 1.2. Testes unitários

**Localização:** `src/lib/kpi/aplicar-alteracoes.test.ts`

Casos:
- Substituição completa (motorista + placa)
- Troca só de placa
- Troca só de motorista
- Alteração com `loja_nome_raw` levemente diferente (normalização)
- Alteração não encontrada → reportada
- Múltiplas alterações na mesma loja (1º + 2º carro)

### 1.3. Integrar no pipeline

**Onde:** `mcp/server.ts` ou `src/lib/kpi/pipeline.ts`

Passo atual:
```
escala = parseEscala(...)
matcher(escala, unitrac)
```

Passo novo:
```
escala = parseEscala(...)
alteracoes = parseAlteracoes(...)
escalaEfetiva = aplicarAlteracoes(escala, alteracoes)
matcher(escalaEfetiva, unitrac)
```

### 1.4. Atualizar Check 3 do verificador

**Localização:** `scripts/analise/verificar_kpi_22_completo.ts`

Hoje o Check 3 tem fuzzy match com bug. Substituir por:
- Comparar `escala_efetiva` (depois de aplicar alterações) com o KPI gerado
- Cada linha da escala efetiva deve aparecer no KPI com placa/motorista corretos

## Critério de sucesso

- [ ] Testes vitest novos passando (10+ casos)
- [ ] Suite total ainda passa 263+ testes
- [ ] Dia 22 PREZUNIC Caxias Centro + Centenário: alteração refletida sem fuzzy
- [ ] Dia 22 CARREFOUR Campo Grande: alteração refletida
- [ ] Check 3 do verificador reporta 0 falsos positivos

## Reversibilidade

Commit único — `git revert` se quebrar.

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Alteração com nome de loja muito diferente da escala | Normalização robusta (remover bullets, padronizar acentos, fuzzy threshold 0.85) |
| Múltiplos PDFs de alteração no mesmo dia | Aplicar em sequência |
| Alteração pra loja que não está na escala | Logar como "aviso" mas não falhar |
