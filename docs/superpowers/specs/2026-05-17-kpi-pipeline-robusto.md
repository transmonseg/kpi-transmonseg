# KPI Pipeline Robusto — Design Spec

**Data:** 2026-05-17  
**Domínio:** kpi-transmonseg  
**Status:** aprovado para implementação

---

## Contexto e Motivação

O pipeline KPI da Transmonseg tem dois pontos de fragilidade principais identificados em produção:

1. **Parsers de escala rígidos** — o sistema falha silenciosamente ao encontrar qualquer variação de formato dos arquivos que clientes enviam. Exemplo real: `escala zona sul 17 05.xlsx` usa aba "Plan1" com estrutura compacta; o parser esperava aba "MATRIZ" e retornou "Não foi possível detectar o tipo da escala."

2. **Casamento exato de placas** — `matcher.ts` usa `Map.get(placa_norm)` puro. Um único caractere diferente (LQE-**5401** na escala vs LQE-**5E01** no Unitrac — formato antigo vs Mercosul) causa falha total: a rota fica `status: 'pendente'` com `paradas: []`, indistinguível de "aguardando revisão".

O objetivo deste spec é resolver os dois problemas de forma cirúrgica, sem reescrever o sistema — apenas adicionar resiliência onde falta.

---

## Escopo

### Incluso
- Refatoração dos parsers de escala para arquitetura baseada em score (`canParse`)
- Fuzzy matching de placas com conjunto de confusões documentadas
- Novo código de anomalia ANOM-12 para matches fuzzy
- Correção dos 9 pontos de perda silenciosa de dados identificados na análise
- Logging estruturado nos pontos críticos do pipeline

### Fora do escopo
- Mudanças na UI do painel
- Alterações no schema do Supabase
- Novos tipos de relatório ou clientes

---

## Parte 1 — Arquitetura de Parsers

### Problema Atual

Os 5 parsers são tentados em sequência em `upload/route.ts`. A detecção é por tentativa-e-erro: o parser tenta ler 3 linhas; se consegue, assume que é o formato correto. Isso causa:

- **Conflito PAX vs GERAL**: ambos aceitam sheets com conteúdo numérico
- **ZONA_SUL fallthrough**: se `dataAlvo` não coincidir, retorna array vazio em vez de erro — o próximo parser tenta e pode aceitar errado
- **Mensagens de erro opacas**: "Não foi possível detectar" sem nenhuma pista de qual formato foi tentado

### Solução: Interface `EscalaParser` com `canParse()`

```typescript
// src/lib/parsers/base.ts
export interface EscalaParser {
  rede_id: string
  canParse(buffer: Buffer): Promise<number>   // score 0.0–1.0
  parse(buffer: Buffer, dataAlvo?: string): Promise<LinhaEscala[]>
}
```

Cada parser implementa `canParse()` de forma leve (lê apenas cabeçalhos/estrutura, não faz parse completo). O sistema escolhe o parser com maior score. Empate: erro com log de ambos os scores.

### Fingerprints por Parser

| Parser | Sinal primário | Score |
|--------|---------------|-------|
| ZONA_SUL | Aba "MATRIZ" com `r[9] === 'CARREGAMENTO DIÁRIO'` | 0.95 |
| ZONA_SUL (compacto) | Plan1, C1=Date, C3=number, C10=string≥6 | 0.90 |
| PAX | Aba "ESCALA" + col A com hora + col E com "MOTORISTA" | 0.95 |
| ARMAZEM_GRAO | Aba "CARGAS" ou "GRÃO" + col B com data BR | 0.90 |
| GERAL | Qualquer sheet com ≥3 linhas de hora+placa | 0.60 |
| GUANABARA | PDF detectado por magic bytes `%PDF` | 1.0 (exato) |

O GERAL fica como fallback com score baixo — só vence se nenhum parser especializado reconhecer.

### Saída do Parse com Warnings

```typescript
export interface ParseResult {
  linhas: LinhaEscala[]
  confidence: number        // herdado do canParse score
  warnings: ParseWarning[]  // itens que foram ignorados/assumidos
}

export interface ParseWarning {
  row: number
  field: string
  message: string
}
```

Warnings são armazenados em log estruturado, não bloqueiam o parse.

### Registro de Parsers

```typescript
// src/lib/parsers/registry.ts
const PARSERS: EscalaParser[] = [
  new ZonaSulParser(),
  new PaxParser(),
  new ArmazemGraoParser(),
  new GuanabaraParser(),
  new GeralParser(),      // sempre último
]

export async function detectParser(buffer: Buffer): Promise<EscalaParser> {
  const scores = await Promise.all(
    PARSERS.map(async p => ({ parser: p, score: await p.canParse(buffer) }))
  )
  scores.sort((a, b) => b.score - a.score)
  
  if (scores[0].score < 0.3) throw new EscalaFormatoDesconhecidoError(scores)
  if (scores[0].score - scores[1].score < 0.1) {
    // empate: logar ambos e lançar erro com diagnóstico
    throw new EscalaAmbiguoError(scores[0], scores[1])
  }
  return scores[0].parser
}
```

A mensagem de erro em caso de falha inclui os scores de cada parser, facilitando diagnóstico.

---

## Parte 2 — Fuzzy Matching de Placas

### Problema Atual

`matcher.ts:148`:
```typescript
const todasParadas = paradaByPlaca.get(linha.placa_norm) ?? []
```

Quando a placa da escala difere em 1 caractere da placa do Unitrac (confusão visual comum entre formatos antigo e Mercosul), o resultado é silenciosamente `[]`. A rota recebe `status: 'pendente'` e `paradas: []`, indistinguível de "aguardando revisão humana".

### Mapa de Confusões Documentadas

Baseado em análise de placas reais (LQE-5401 vs LQE-5E01):

```typescript
// src/lib/utils/placa.ts — adicionar
const CONFUSAO: Record<string, string[]> = {
  // Letra confundida com dígito
  'E': ['3', '4'],
  'A': ['4'],
  'O': ['0'],
  'I': ['1'],
  'L': ['1'],
  'B': ['8'],
  'G': ['6'],
  'S': ['5'],
  'Z': ['2'],
  // Dígito confundido com letra
  '4': ['A', 'E'],
  '0': ['O'],
  '1': ['I', 'L'],
  '8': ['B'],
  '3': ['E'],
  '6': ['G'],
  '5': ['S'],
  '2': ['Z'],
}
```

### Algoritmo de Match Fuzzy

```typescript
// src/lib/utils/placa.ts
export function matchFuzzyPlaca(
  alvo: string,
  candidatos: Set<string>
): { placa: string; score: number } | null {
  // alvo e candidatos já normalizados (sem hífen, maiúsculo)
  
  const resultados: { placa: string; score: number }[] = []
  
  for (const cand of candidatos) {
    if (cand.length !== alvo.length) continue
    
    let diferencas = 0
    let score = 1.0
    
    for (let i = 0; i < alvo.length; i++) {
      if (alvo[i] === cand[i]) continue
      diferencas++
      
      const confusos = CONFUSAO[alvo[i]] ?? []
      if (confusos.includes(cand[i])) {
        // Posição 4 (índice) é a posição Mercosul — peso maior
        score -= (i === 4) ? 0.05 : 0.15
      } else {
        score -= 0.5   // diferença não-confusa — penalidade alta
      }
    }
    
    if (diferencas === 1 && score >= 0.8) {
      resultados.push({ placa: cand, score })
    }
  }
  
  return resultados.length === 1 ? resultados[0] : null
  // Se 0: não encontrou. Se >1: ambíguo — retorna null (segurança)
}
```

**Regra de segurança**: o match fuzzy só é aceito se **exatamente 1 candidato** satisfaz os critérios. Ambiguidade = não faz match.

### Integração no Matcher

```typescript
// src/lib/kpi/matcher.ts — modificar matchRotas()

let todasParadas = paradaByPlaca.get(linha.placa_norm) ?? []
let fuzzyMatch: string | null = null

if (todasParadas.length === 0) {
  const candidato = matchFuzzyPlaca(linha.placa_norm, placasUnitrac)
  if (candidato) {
    todasParadas = paradaByPlaca.get(candidato.placa) ?? []
    fuzzyMatch = candidato.placa
    anomalias.push({
      codigo: 'ANOM-12',
      severity: 'MEDIUM',
      mensagem: `Placa fuzzy: escala=${linha.placa_norm}, unitrac=${candidato.placa}, score=${candidato.score.toFixed(2)}`,
      requer_revisao: true,
    })
  }
}
```

### ANOM-12 — Placa Fuzzy

| Campo | Valor |
|-------|-------|
| Código | ANOM-12 |
| Severidade | MEDIUM |
| Descrição | Casamento aproximado de placa (diferença de 1 caractere, confusão visual detectada) |
| Ação | Rota incluída no KPI com flag `requer_revisao: true`; placa correta deve ser conferida |
| Suprime | ANOM-01 (placa não encontrada) quando fuzzy tem sucesso |

---

## Parte 3 — Pontos de Perda Silenciosa de Dados

Análise identificou 9 pontos críticos onde dados somem sem log. Priorizados por impacto:

### P1 — Exact plate miss (CRÍTICO) → resolvido pelo Fuzzy (Parte 2)

### P2 — `rede_id: 'DESCONHECIDO'` (ALTO)
**Local:** `upload/route.ts` após auto-detecção falhar parcialmente  
**Fix:** Rejeitar upload imediatamente com mensagem clara + log de scores dos parsers

### P3 — `extractDateFromWorksheet` lê só M1 (MÉDIO)
**Local:** `unitrac.ts`  
**Fix:** Se M1 vazia, buscar em N1, L1, e nas primeiras 5 linhas qualquer célula com padrão `DD/MM/YYYY`

### P4 — `.slice(0, 10)` em paradas (MÉDIO)
**Local:** `matcher.ts` (se existir)  
**Fix:** Remover o slice; se há razão para limite, documentar e usar constante nomeada

### P5 — BASE_LOCAL/FORA_LOCAL strings hardcoded (BAIXO)
**Local:** `unitrac.ts:90-91` e `unitrac-pdf.ts:18-19`  
**Fix:** Já são constantes — OK. Adicionar log quando nenhuma das duas strings for encontrada durante classificação de paradas (silent fallthrough para `'ENTREGA'` padrão)

### P6 — Parser ZONA_SUL retorna `[]` com `dataAlvo` fora do range (MÉDIO)
**Local:** `escala-zona-sul.ts:256` — filtro `if (dataAlvo && dataISO !== dataAlvo) return`  
**Fix:** Se nenhuma linha foi retornada após filtro, incluir `ParseWarning` indicando quantas linhas foram encontradas para outras datas

### P7 — ExcelJS falha silenciosamente em namespace XML (JÁ RESOLVIDO)
**Local:** `unitrac.ts` — `normalizeXlsxNamespaces()` já implementado

### P8 — Hora extraída com timezone errado (JÁ RESOLVIDO)
**Local:** `escala-zona-sul.ts` — `getUTCHours()` já aplicado

### P9 — Guanabara regex com flag `/g` (DESCARTADO)
**Análise:** `PLACA_RE` e `TIPO_RE` não têm flag `/g`. `PLACA_TIPO_RE` (que tem `/g`) usa `.exec()` com `lastIndex = 0` explícito na linha 130 de `escala-guanabara-pdf.ts`. Código correto, sem bug.

---

## Parte 4 — Logging Estruturado

Adicionar logs nos pontos críticos do pipeline, sem biblioteca externa (usar `console.warn`/`console.error` com prefixo estruturado):

```typescript
// src/lib/utils/pipeline-log.ts
export function pipelineLog(
  stage: 'parse' | 'match' | 'kpi',
  level: 'info' | 'warn' | 'error',
  event: string,
  data?: Record<string, unknown>
) {
  const entry = { ts: new Date().toISOString(), stage, event, ...data }
  if (level === 'error') console.error('[KPI]', JSON.stringify(entry))
  else if (level === 'warn') console.warn('[KPI]', JSON.stringify(entry))
  else console.log('[KPI]', JSON.stringify(entry))
}
```

Pontos obrigatórios de log:
1. `parse:start` — arquivo recebido (nome, tamanho, rede detectada)
2. `parse:score` — scores de cada parser candidato  
3. `parse:warn` — cada `ParseWarning` emitido
4. `match:fuzzy` — quando ANOM-12 é gerado (placas envolvidas, score)
5. `match:miss` — quando ANOM-01 é gerado (placa que não foi encontrada)
6. `kpi:complete` — total de rotas, anomalias por código

---

## Fluxo de Dados Pós-Implementação

```
Upload escala
     │
     ▼
detectParser(buffer)         ← canParse() paralelo em todos parsers
     │                          score vencedor ≥ 0.3 + diferença ≥ 0.1
     │  falha → EscalaFormatoDesconhecidoError (com scores no body)
     │
     ▼
parser.parse(buffer, dataAlvo)
     │
     ▼
ParseResult { linhas, confidence, warnings }
     │  warnings → pipelineLog('parse', 'warn', ...)
     │
     ▼
matchRotas(linhas, paradaByPlaca)
     │
     ├── exact match → normal
     ├── fuzzy match → ANOM-12 + pipelineLog('match', 'warn', 'fuzzy', ...)
     └── no match    → ANOM-01 + pipelineLog('match', 'warn', 'miss', ...)
     │
     ▼
geraKPI(rotas)   → KPI-REDE-DATA.xlsx
```

---

## Ordem de Implementação (MVP)

| Prioridade | Item | Complexidade | Impacto |
|-----------|------|-------------|---------|
| 1 | Fuzzy placa (matchFuzzyPlaca + ANOM-12) | Médio | Crítico — resolve miss real em produção |
| 2 | canParse() nos parsers existentes | Médio | Alto — elimina detecção por tentativa-erro |
| 3 | Parser registry com score | Médio | Alto — mensagens de erro diagnósticáveis |
| 4 | ParseWarning no ZONA_SUL (P6) | Baixo | Médio |
| 5 | extractDateFromWorksheet fallback (P3) | Baixo | Médio |
| 6 | pipelineLog estruturado | Baixo | Médio |
| 7 | ~~Guanabara regex fix (P9)~~ | — | DESCARTADO — código já correto |

---

## Invariantes de Segurança

1. **Fuzzy nunca aceita ambiguidade**: se 2+ candidatos passam no score, retorna `null` — sem match
2. **canParse é read-only**: não pode ter efeitos colaterais, apenas lê estrutura do buffer
3. **Parser GERAL nunca supera score 0.60**: garante que parsers especializados sempre vencem
4. **ANOM-12 sempre inclui ambas as placas**: para auditoria humana obrigatória
5. **ParseWarning não bloqueia**: dados parciais são melhores que erro total

---

## Critérios de Sucesso

- [ ] Upload de `escala zona sul 17 05.xlsx` (formato compacto) → parse correto ✓ (já implementado)
- [ ] LQE-5401 (escala) + LQE-5E01 (Unitrac) → match via ANOM-12, rota incluída no KPI
- [ ] Arquivo desconhecido → mensagem de erro com scores de cada parser
- [ ] Arquivo ambíguo (empate de parsers) → mensagem de erro diagnósticável
- [ ] Nenhum dos 9 pontos de perda silenciosa produz resultado incorreto sem log
