# Fase 3 — Validação Rede por Rede

## Objetivo

Após Fase 2 (matcher v2), validar **cada rede individualmente**. Cada uma tem padrões próprios — não dá pra tratar todas iguais.

## Protocolo por rede

1. Rodar `verificar_kpi_22_completo.ts <REDE>` (com matcher v2)
2. Analisar problemas restantes
3. Classificar:
   - **Resolvível automaticamente** → criar fix específico
   - **Edge case** → levar pra Fase 4
   - **Aceito como-está** → documentar e seguir
4. **Aprovação do dono** antes da próxima rede

## Ordem (do mais simples ao mais complexo)

| # | Rede | Lojas | Padrão específico identificado no dia 22 |
|---|------|-------|------------------------------------------|
| 1 | MUNDIAL | 1 | Sem rastreador → SEM (já funciona) |
| 2 | CAB_PETROPOLIS | 1 | Motorista opera DE dentro do CAB o dia todo |
| 3 | ATACADAO | 2 | Match limpo (1 placa por loja) |
| 4 | SAMS_CLUB | 3 | Placas fazem outras redes no caminho — match exato é crítico |
| 5 | VIANENSE | 5 | Placa MÁRCIO compartilha com SENDAS/Vianense (multi-rede) |
| 6 | EMANUEL | 8 | Operação em loja-base (PEDRA_GUARATIBA, SANTA_MARIA, CACHAMORRA) |
| 7 | SENDAS | 10 | Várias placas fazem só uma loja Sendas (resto em outras redes) |
| 8 | CARREFOUR | 15 | Alterações no PDF — Fase 1 deve resolver |
| 9 | ARMAZEM_GRAO | 15 | REGINA sharing (mesma placa, múltiplas lojas REGINA) — 2 trips/dia |
| 10 | GUANABARA | 17 | Escala vem em PDF, validar parser PDF Guanabara dia 22 |
| 11 | SUPERPRIX | 18 | Match limpo (Loja XX padronizado) |
| 12 | SUPER_PAX | 21 | 4 placas SEM rastreador no template |
| 13 | FEIRA_NOVA | 21 | Caso Santo Agostinho (mesma placa SUPERCOMPRAS) |
| 14 | ASSAI | 41 | 100% sem `codigo_unitrac` — Fase 0 deve resolver |
| 15 | PRINCESA | 41 | Múltiplas entregas (1ª, 2ª, 3ª) na mesma loja, grafia 1º vs 1ª |
| 16 | PREZUNIC | 48 | Lojas SPID extras, alterações no PDF, multi-trip |
| 17 | ZONA_SUL | 44 | 8 trocas motorista não no PDF, 2 turnos, SC convention antiga |

## Padrões esperados por rede (anotados durante Fase 3)

### MUNDIAL
- 1 loja, 1 placa, geralmente sem rastreador
- Regra: se placa cadastrada SEM rastreador → KPI = SEM/SEM/SEM

### CAB_PETROPOLIS
- Motorista opera DO CAB (não vai ao CD principal)
- Já resolvido com fix `isEstacionamentoNoturno` (commit `2a491f4`)
- Validar que v2 mantém comportamento certo

### ATACADAO / SAMS_CLUB
- Match limpo, fácil

### VIANENSE
- Placas costumam fazer SENDAS + VIANENSE no mesmo dia
- Match por código_unitrac elimina cross-rede

### EMANUEL
- Casos especiais (loja-base) → Fase 4.1

### SENDAS
- Várias placas fazem só 1 Sendas + outras redes
- Lojas em branco quando placa foi a outra rede (correto, manter)

### CARREFOUR
- Alterações no PDF — depende de Fase 1
- Loja "Espírito Santo" extra no KPI — Fase 4.4

### ARMAZEM_GRAO
- REGINA Barra do Imbuy / 1 de Maio / Lucio Meira — mesma placa
- Multi-trip → Fase 4.2

### GUANABARA
- Escala em PDF — validar parser dedicado funciona

### SUPERPRIX
- Padronizado (Loja XX), match limpo

### SUPER_PAX
- 4 placas no template como SEM_RASTREADOR — manter

### FEIRA_NOVA
- Mercado Santo Agostinho — caso especial → Fase 4.1

### ASSAI
- 100% sem `codigo_unitrac` na entrada → Fase 0 deve preencher
- CHD adiantado em 8 lojas → Categoria C, investigar fonte

### PRINCESA
- Múltiplas entregas mesma loja (1ª, 2ª, 3ª)
- Grafia 1º vs 1ª → Fase 4.5
- CHD adiantado (Pechincha, Maricá, Cabo Frio) → Categoria C

### PREZUNIC
- 7 lojas SPID + Depósito Central no KPI sem escala → Fase 4.4
- Alterações no PDF → Fase 1
- Multi-trip → Fase 4.2

### ZONA_SUL
- 8 trocas de motorista não captadas no PDF → estender parser alterações (Fase 1+)
- 2 turnos (manhã + tarde) → Fase 4.3
- SC convention antiga (até 18/05) → fix já aplicado, validar

## Critério de sucesso (geral)

- [ ] Cada rede aprovada individualmente pelo dono
- [ ] Padrões documentados neste arquivo
- [ ] Problemas residuais categorizados (Fase 4 ou aceito-como-está)
- [ ] Tabela final comparando baseline vs pós-Fase 3

## Critério de sucesso (por rede)

- [ ] Verificador `verificar_kpi_22_completo` reporta 0 problemas resolvíveis
- [ ] Edge cases documentados
- [ ] Aprovação manual do dono
