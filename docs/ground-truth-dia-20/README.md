# Ground Truth — Dia 20/05/2026

KPIs gerados **100% manualmente** pela Tia Érica (sem o sistema). Servem como referência para o smoke test E2E final da Fase 4: regenerar o KPI do dia 20 com todas as melhorias T5-T14 e comparar contra esses arquivos pra medir precisão.

## Arquivos

Cada arquivo é o KPI MENSAL daquela rede. A **aba "20"** dentro de cada
um é o KPI do dia 20/05/2026 — é a referência para comparação.

| Rede | Arquivo | Aba "20" |
|------|---------|---------:|
| Armazém do Grão | `KPI-ARMAZEM-DO-GRAO-manual.xlsx` | 14 linhas |
| Assaí | `KPI-ASSAI-manual.xlsx` | 41 linhas (9 sem GPS) |
| Atacadão | `KPI-ATACADAO-manual.xlsx` | 2 linhas |
| Carrefour | `KPI-CARREFOUR-manual.xlsx` | 10 linhas |
| Guanabara | `KPI-GUANABARA-manual.xlsx` | **AUSENTE** (não gerada manual) |
| Prezunic | `KPI-PREZUNIC-manual.xlsx` | 39 linhas (4 sem GPS) |
| Princesa | `KPI-PRINCESA-manual.xlsx` | 26 linhas |
| Superprix | `KPI-SUPERPRIX-manual.xlsx` | 10 linhas |
| Zona Sul | `KPI-ZONA-SUL-manual.xlsx` | 39 linhas |

**Total manual conhecido:** 181 linhas, ~13 marcadas "SEM RASTREADOR".
Guanabara ficou sem manual — o sistema é a única fonte de verdade pra ela.

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
