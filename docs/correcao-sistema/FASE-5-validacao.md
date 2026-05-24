# Fase 5 — Validação Final + Rollout

## Objetivo

Confirmar que o sistema completo (cadastro + alterações + matcher v2 + casos especiais) funciona em produção. Regerar KPIs do dia 22 e aprovar com gestão.

## Subtarefas

### 5.1. Verificação completa do dia 22

Rodar `scripts/analise/verificar_kpi_22_completo.ts` em todas as 17 redes:

```bash
for REDE in MUNDIAL SENDAS VIANENSE SAMS_CLUB CAB_PETROPOLIS PRINCESA PREZUNIC SUPERCOMPRAS SUPERPRIX CARREFOUR ATACADAO ASSAI SUPER_PAX ARMAZEM_GRAO ZONA_SUL EMANUEL FEIRA_NOVA; do
  npx tsx scripts/analise/verificar_kpi_22_completo.ts $REDE
done
```

### 5.2. Tabela comparativa baseline vs pós-Plano

Gerar `docs/correcao-sistema/RESULTADO-FINAL.md` com:

| Rede | Baseline (dia 22) | Pós-Plano (dia 22) | Mudança |
|------|-------------------|---------------------|---------|
| MUNDIAL | ✓ 0 problemas | ✓ 0 problemas | — |
| SENDAS | ⚠ 2 falsos positivos | ✓ 0 | +2 |
| PRINCESA | ⚠ 4 problemas | (resultado) | — |
| ... | ... | ... | ... |

### 5.3. Regerar KPIs em produção

Pra cada rede, regerar KPI usando o sistema novo:
- Via MCP: `processar_kpi(data='2026-05-22', rede_id='X')`
- Salvar resultado em `~/Downloads/KPI-X-2026-05-22-PLANO.xlsx`
- Comparar visualmente com KPI antigo (presente em `~/Downloads/`)

### 5.4. Aprovação manual da gestão

- Mostrar pra Tia Érica/Erica os 17 KPIs novos
- Foco nos casos que mudaram (CAB Petrópolis, Mercado Santo Agostinho, etc)
- Aprovação por rede

### 5.5. Documentar processo pra dias futuros

Criar `docs/correcao-sistema/PROCESSO.md` com:
- Como rodar geração KPI no sistema novo
- Como aplicar alterações
- Como sanitizar cadastro pra lojas novas
- Como debugar quando algo dá errado

## Critério de sucesso final

- [ ] 17/17 KPIs sem problemas Categoria B (falso positivo)
- [ ] Sistema replicável para outros dias (18, 19, 20, 21, 23, 24, ...)
- [ ] Aprovação manual da gestão
- [ ] Documentação completa do sistema novo
- [ ] ZONA_SUL canário melhor que baseline

## Critério de sucesso aceitável (mínimo)

- [ ] 15/17 KPIs sem problemas resolvidos
- [ ] Casos restantes documentados como aceitos
- [ ] Aprovação parcial da gestão (com lista de pendências)

## Rollback

Se sistema novo não aprovado:
- Reverter merge da Fase 2 (matcher v2)
- Manter Fase 0 (cadastro melhorado — sem regressão)
- Manter Fase 1 (alterações — sem regressão)
- Discutir alternativas com dono

## Próximos passos pós-Fase 5

Sistema estável em produção, aplicar nos dias seguintes (23, 24, 25...).

Casos especiais (Fase 4) que ficaram em aberto: continuar resolvendo conforme negociação com gestão.

Pode ser que apareçam novos padrões em escalas futuras — protocolo de adição:
1. Detectar padrão novo
2. Decidir solução em conjunto com dono
3. Implementar como nova categoria (Fase 4.X)
4. Validar
