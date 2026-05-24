# Fase 5 — Validação Final + Rollout

## Objetivo

Confirmar que o sistema completo (cadastro + alterações + matcher v2 + casos especiais) funciona em produção. **Validação final é MANUAL pelo dono.**

## Fluxo de validação (definido pelo dono)

1. Sistema novo está implementado em produção (após Fases 0-4)
2. **Dono entra no sistema manualmente, faz upload da escala + relatório Unitrac**
3. Sistema gera KPIs
4. **Dono envia os KPIs gerados pro Claude**
5. Claude compara com baseline (KPIs do dia 22 já analisados em `docs/verificacao-22/`)
6. Claude reporta diferenças e categoriza
7. Dono aprova ou pede ajustes

## Subtarefas

### 5.1. Verificação automática do dia 22 (interno)

Antes de pedir o dono pra gerar, rodar `scripts/analise/verificar_kpi_22_completo.ts` nas 17 redes com sistema novo (em ambiente local, sem afetar produção):

```bash
for REDE in MUNDIAL SENDAS VIANENSE SAMS_CLUB CAB_PETROPOLIS PRINCESA PREZUNIC SUPERCOMPRAS SUPERPRIX CARREFOUR ATACADAO ASSAI SUPER_PAX ARMAZEM_GRAO ZONA_SUL EMANUEL FEIRA_NOVA; do
  npx tsx scripts/analise/verificar_kpi_22_completo.ts $REDE
done
```

### 5.2. Tabela comparativa baseline vs pós-Plano

Gerar `docs/correcao-sistema/RESULTADO-FINAL.md` com:

| Rede | Baseline (dia 22) | Pós-Plano | Mudança |
|------|-------------------|-----------|---------|
| MUNDIAL | ✓ 0 problemas | ✓ 0 problemas | — |
| SENDAS | ⚠ 2 falsos positivos | ✓ 0 | +2 |
| ... | ... | ... | ... |

### 5.3. Sinalizar pro dono fazer geração manual

Quando 5.1 e 5.2 estiverem com resultados aceitáveis:
- Comunicar: "Sistema pronto, pode entrar no sistema e gerar KPIs do dia 22"
- Dono faz upload manual de escala + Unitrac
- Sistema gera as 17 KPIs
- Dono envia os arquivos pra Claude

### 5.4. Comparação dos KPIs gerados pelo dono

Pra cada KPI que o dono enviar:
- Rodar `verificar_kpi_22_completo.ts` apontando pro arquivo novo
- Comparar com baseline em `docs/verificacao-22/`
- Reportar diferenças categorizadas
- Listar problemas residuais

### 5.5. Aprovação manual do dono

- Mostrar pro dono as comparações
- Foco nos casos que mudaram (CAB Petrópolis, Mercado Santo Agostinho, etc)
- Aprovação por rede ou geral

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
