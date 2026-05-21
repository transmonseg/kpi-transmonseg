# Ground Truth — Dia 20/05/2026

KPIs gerados **100% manualmente** pela Tia Érica (sem o sistema). Servem como referência para o smoke test E2E final da Fase 4: regenerar o KPI do dia 20 com todas as melhorias T5-T14 e comparar contra esses arquivos pra medir precisão.

## Arquivos

| Rede | Arquivo |
|------|---------|
| Armazém do Grão | `KPI-ARMAZEM-DO-GRAO-manual.xlsx` |
| Assaí | `KPI-ASSAI-manual.xlsx` |
| Atacadão | `KPI-ATACADAO-manual.xlsx` |
| Carrefour | `KPI-CARREFOUR-manual.xlsx` |
| Guanabara | `KPI-GUANABARA-manual.xlsx` |
| Prezunic | `KPI-PREZUNIC-manual.xlsx` |
| Princesa | `KPI-PRINCESA-manual.xlsx` |
| Superprix | `KPI-SUPERPRIX-manual.xlsx` |
| Zona Sul | `KPI-ZONA-SUL-manual.xlsx` |

## Critérios de comparação (smoke E2E)

Para cada rede, comparar **sistema vs manual**:

1. **Cobertura de linhas:** % de linhas com horário preenchido
2. **Linhas iguais:** mesma placa + mesma loja + mesmos horários (saída CD, chegada loja, tempo)
3. **Discrepâncias:**
   - Sistema acertou + manual errado (sistema acrescentou valor)
   - Sistema errou + manual correto (oportunidade de melhoria)
   - Ambos UNMATCHED (frota terceirizada sem GPS — esperado)

## Não fazer

- **Não tratar o manual como infalível.** Tia Érica pode ter errado horário, atribuído loja diferente, etc. Servem como referência fortíssima mas não verdade absoluta.
- **Não modificar esses arquivos.** São snapshots históricos.
