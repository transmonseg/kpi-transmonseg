# Contexto — Plano de Correção do Sistema

> **Para Claude que retoma após compactação:** leia ESTE arquivo + `PLANO.md` + `STATUS.md` PRIMEIRO.

## Origem

Após auditoria completa das 17 KPIs do dia 22/05/2026 (ver `docs/verificacao-22/RESUMO.md`), identificamos 8 categorias de problemas. Decidimos refazer o sistema em fases controladas, **sem corrigir nada sem aprovação**.

## Filosofia central (decisão do dono)

> "Não tenho culpa se a escala tá errada ou o relatório Unitrac tá errado. Sistema só precisa funcionar quando os inputs estão corretos."

**Regras:**
1. Se a loja está na escala (com alteração aplicada) e a placa apareceu no Unitrac com match exato → KPI tem dados reais
2. Se placa não tem rastreador → SEM
3. Se loja não bateu match exato → em branco honesto (não inventar via geo/fuzzy)
4. **Alterações devem ser perfeitamente aplicadas** antes de qualquer matching

## Arquivos relacionados

| Arquivo | Conteúdo |
|---------|----------|
| `PLANO.md` | Plano mestre com as 6 fases (0-5) |
| `STATUS.md` | Estado atual, vivo, atualizado a cada passo |
| `FASE-0-cadastro.md` | Sanitização cadastro de lojas |
| `FASE-1-alteracoes.md` | Pipeline de alterações robusto |
| `FASE-2-matcher.md` | Matcher simplificado (em branch) |
| `FASE-3-redes.md` | Validação rede por rede |
| `FASE-4-casos-especiais.md` | Edge cases identificados |
| `FASE-5-validacao.md` | Validação final + rollout |

## Onde estão os dados

| Item | Local |
|------|-------|
| Verificação dia 22 (baseline) | `docs/verificacao-22/` (17 MDs + RESUMO) |
| Escalas dia 22 | `C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 22/` |
| KPIs geradas dia 22 | `C:/Users/media/Downloads/KPI-*-2026-05-22*.xlsx` |
| Cadastro de lojas | Supabase `lojas` table — 347 ativas |

## Princípios não-negociáveis

1. **Não corrigir nada sem aprovação explícita** do dono em cada fase
2. **Cada fase pode ser revertida** (branch git separada ou commit atômico)
3. **ZONA_SUL é canário** — nunca pode regredir piorando OK count
4. **263+ testes vitest sempre passando**
5. **Sempre criar/atualizar MDs** ao concluir passos importantes (compactação-safe)
6. **Análise antes de correção** — entender → propor → aprovação → executar → validar

## Fixes já aplicados na sessão (CUIDADO ao reverter)

| Commit | O que fez |
|--------|-----------|
| `2a491f4` | `isEstacionamentoNoturno` exige saída <06:00 (resolve CAB Petrópolis, mas pode estar causando Categoria B em outras redes) |
| `aad2697` | Parser PDF tabular + split texto livre para alterações |
| `cf1bef0` | 17 relatórios MD verificação dia 22 |

## Status atual

Veja `STATUS.md`.
