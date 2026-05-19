---
title: KPI Pipeline Completo — Escala→XLSX no formato KPI PRINCESA
type: spec
date: 2026-05-16
status: approved
---

# Spec: KPI Pipeline Completo

## Objetivo

Transformar escala diária + relatório Unitrac em planilha XLSX mensal por rede, **no exato formato do KPI PRINCESA**: uma aba por dia, 15 colunas fixas, 1º e 2º CARRO lado a lado na mesma linha por loja.

Além disso: corrigir o bug onde `anomalias_codigos` nunca chega ao front-end, reescrever o painel de revisão de KPI no estilo Cozinha, e adicionar suporte a alterações de escala via upload de XLSX/PDF.

---

## Subsistema A — Bug anomalias_codigos + UI estilo Cozinha

**Problema:** `kpi_rotas.anomalias_codigos` sempre fica `[]` porque o `processar/route.ts` insere as anomalias na tabela `anomalias` mas nunca escreve os códigos de volta em `kpi_rotas`. A UI usa `severidadeFromObs()` que procura "ANOM-01" no texto de observação humano — nunca encontra.

**Fix:**
1. `src/lib/types/kpi.ts` — adicionar `anomalias_codigos: string[]` ao tipo `KpiLinha`
2. `src/lib/kpi/consolidador.ts` — cascade: adicionar campo no `satisfies KpiLinha`
3. `src/app/api/kpi/processar/route.ts` — após inserir anomalias, agrupar por `kpi_rota_id` e fazer UPDATE em `kpi_rotas.anomalias_codigos` com os códigos detectados
4. `src/app/api/kpi/[id]/route.ts` — adicionar `anomalias_codigos` no mapeamento das linhas (buscar de `kpi_rotas` via escala_linha_id)
5. `src/app/painel/kpi/dia/KpisGerados.tsx` — reescrever TabelaRevisao: stats bar (Total / High / Medium / Low / Pendentes), filter chips, StatusBadge baseado nos códigos reais, sem `severidadeFromObs`

---

## Subsistema B — Redesign do gerador XLSX (formato KPI PRINCESA)

**Problema:** O gerador atual cria colunas variáveis (5 + maxLojas×3 + 1), uma linha por `KpiLinha`, 1º e 2º CARRO em linhas separadas. O formato correto é: **15 colunas fixas, uma linha por loja, 1º e 2º CARRO na mesma linha**.

**Formato alvo (15 colunas):**

| Col | Nome | Fonte |
|-----|------|-------|
| A | REDES / FILIAIS | `loja_nome` |
| B | MOTORISTA 1º | `motorista` (carro_ordem=1) |
| C | CÓD 1º | `motorista_codigo` |
| D | PLACA 1º | `placa` |
| E | SAÍDA CD 1º | `saida_cd` → valor Excel time |
| F | CHD LOJA 1º | `chd_loja_1` → valor Excel time |
| G | SAÍDA LOJA 1º | `saida_loja_1` → valor Excel time |
| H | TEMPO 1º | fórmula `=MOD(G{n}-F{n},1)` |
| I | MOTORISTA 2º | `motorista` (carro_ordem=2) |
| J | CÓD 2º | `motorista_codigo` |
| K | PLACA 2º | `placa` |
| L | CHD LOJA 2º | `chd_loja_1` do carro2 |
| M | SAÍDA LOJA 2º | `saida_loja_1` do carro2 |
| N | TEMPO 2º | fórmula `=MOD(M{n}-L{n},1)` |
| O | OBS | `joinObsTexts(codigos)` |

**Estrutura das abas:**
- Row 1: Header amarelo + logo + nome da rede
- Row 2: "BENASSI · DD/MM/YYYY" + grupo headers (1º CARRO mergeado em B-H, 2º CARRO mergeado em I-N)
- Row 3: Separador 8px
- Row 4: Headers das colunas (A-O)
- Rows 5+: Uma linha por loja (1º + 2º CARRO juntos)

**Células de tempo:** usar `Date` objects com `numFmt = 'HH:MM'` (ExcelJS converte para serial Excel; permite que as fórmulas MOD funcionem)

**Linhas placeholder:** lojas sem dados do dia recebem `loja_nome` na col A, resto vazio (mesmo que hoje)

---

## Subsistema C — Alterações de escala via arquivo (XLSX/PDF)

**Problema:** O formulário de alterações só aceita texto. Precisamos de uma seção de upload na página `/painel/alteracoes/nova/` para XLSX e PDF.

**Fluxo:**
1. Usuário faz upload de arquivo na nova seção "Upload de Arquivo"
2. `POST /api/alteracoes/upload` detecta tipo, parseia:
   - **XLSX**: trata como escala parcial (mesmas colunas da escala normal), retorna linhas detectadas
   - **PDF**: extrai texto via `pdf-lib`, passa pelo parser LLM (mesmo endpoint `/api/alteracoes/parsear`)
3. UI mostra preview: linhas detectadas com confiança e tipo de alteração
4. Usuário confirma → `POST /api/alteracoes` aplica e dispara `POST /api/kpi/processar` automaticamente

**Endpoint:** `POST /api/alteracoes/upload`
- Aceita `multipart/form-data`: campo `file` + campo `data_escala`
- Retorna `{ tipo: 'xlsx' | 'pdf', linhas: AlteracaoParsed[], resumo: string }`

---

## Subsistema D — Preview de escala antes de salvar

**Problema:** Quando uma escala tem formato inesperado (colunas diferentes, linhas problemáticas), o sistema deve mostrar um preview antes de salvar.

**Endpoint:** `POST /api/escalas/preview`
- Aceita o mesmo payload que o upload atual (sem salvar)
- Retorna `{ tipo_detectado: string, linhas_validas: EscalaRow[], linhas_problematicas: { linha: number, motivo: string, conteudo: string }[] }`

**UI:** Na página de upload de escala, antes de confirmar, exibir o preview com badge de contagem de problemas. Bloquear submit se `linhas_problematicas.length > 0` (ou permitir com aviso).

---

## Fluxo Completo (fim a fim)

```
Upload escala → Preview (D) → Confirmar → escala_linhas
   ↓ alteracao chega (texto/XLSX/PDF)
   → parsear → preview → aplicar → escala_linhas atualizado
   ↓
POST /api/kpi/processar
   → cruzaEscalaUnitrac → kpi_rotas (com anomalias_codigos vazio)
   → detectaAnomalias → anomalias inseridas
   → UPDATE kpi_rotas.anomalias_codigos ← FIX (A)
   ↓
GET /api/kpi/[id] → inclui anomalias_codigos em cada KpiLinha ← FIX (A)
   ↓
POST /api/kpi/gerar → gerarKpi() → XLSX 15 colunas ← REDESIGN (B)
   ↓
KpisGerados.tsx → stats bar + filter chips ← REWRITE (A)
```
