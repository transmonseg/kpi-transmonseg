# Design: Alterações v2 (Cola+Achados) + Plano de Fixes Dia 18

**Status:** Proposto
**Data:** 2026-05-19
**Autor:** Claude (em sessão de brainstorming com Triforce)

---

## Contexto

O sistema atual de alterações tem 1 textarea livre + regex parser. Operadores colam mensagens do WhatsApp, mas o parser falha frequentemente:

- **Múltiplas alterações por mensagem** (várias filiais juntas) — parser só extrai 1
- **Texto inline sem quebras** — falha completa
- **Dados omitidos** (só placa, sem nome ou cód) — confiança baixa
- **Troca de loja embutida** ("Campos, é Macaé") — não detecta

Análise das 11 alterações reais de 18/05/2026:
- 7 mensagens com 1 alteração
- 4 mensagens com 2+ alterações cada
- Todas tinham AO MENOS 1 dos 3 identificadores (nome OU placa OU código) por slot

**Insight chave do fundador:** "sempre vai ter o nome deles ou a placa ou código". Aproveitamos isso para fazer lookup no banco e completar os dados faltantes.

## Objetivos

1. Operador cola qualquer mensagem do WhatsApp (mesmo com múltiplas alterações)
2. Sistema detecta **todas** as alterações no texto
3. Cada slot (sai/entra) precisa apenas de 1 dos 3 identificadores — banco completa o resto
4. Operador revisa e aplica em lote
5. Zero custo recorrente (sem LLM)
6. Reprocessa KPI das redes afetadas automaticamente

## Não-objetivos

- Aplicar alterações automaticamente sem revisão humana
- Bot WhatsApp (futuro)
- Reconhecimento de motorista NOVO sem cadastro (continua exigindo cadastro prévio)

## Arquitetura

```
┌──────────────────────────────────────────────────────────┐
│  Frontend: /painel/alteracoes/nova                       │
│  - Textarea grande (cola mensagem)                       │
│  - Botão "Analisar"                                      │
│  - Lista de N cards (1 por alteração detectada)          │
│  - Cada card: rede, loja, sai, entra, motivo, motor      │
│  - Aplicar individual ou em lote                         │
└──────────────────────────────────────────────────────────┘
              ↓
┌──────────────────────────────────────────────────────────┐
│  Parser (parseAlteracoesV2)                              │
│  1. Normalizar texto                                     │
│  2. Segmentar em blocos                                  │
│  3. Extrair tokens (placas, códigos, nomes)              │
│  4. Lookup banco (lookupCanonical)                       │
│  5. Detectar entra/sai                                   │
│  6. Detectar rede/loja/filial                            │
└──────────────────────────────────────────────────────────┘
              ↓
┌──────────────────────────────────────────────────────────┐
│  Banco                                                   │
│  - escala_linhas (índice: motorista, placa, cód)         │
│  - lojas (rede + nome + codigo_escala)                   │
│  - alteracoes (destino)                                  │
└──────────────────────────────────────────────────────────┘
```

## Componentes

### 1. `src/lib/parsers/alteracoes-v2.ts` (NOVO)

Função pública:
```typescript
export function parseAlteracoesV2(
  texto: string,
  ctx: ParseContext
): AlteracaoBloco[]

export interface ParseContext {
  motoristas: Array<{ nome: string; nome_norm: string; codigo: number | null; placa: string | null }>
  lojas: Array<{ rede_id: string; nome: string; codigo_escala: string | null }>
}

export interface AlteracaoBloco {
  rede_id: string | null
  loja_nome_raw: string | null
  filial: number | null
  sai: SlotVeiculo | null
  entra: SlotVeiculo | null
  motivo: string | null
  confianca: 'alta' | 'media' | 'baixa'
  warnings: string[]
  raw: string  // bloco original
}

export interface SlotVeiculo {
  motorista_nome: string | null
  motorista_codigo: number | null
  placa_raw: string | null
  placa_norm: string | null
  fonte: {
    nome: 'mensagem' | 'banco' | 'inferido' | null
    codigo: 'mensagem' | 'banco' | 'inferido' | null
    placa: 'mensagem' | 'banco' | 'inferido' | null
  }
}
```

**Pipeline:**

1. **Normalizar** (`normalizaTexto`)
   - Remove emojis (🚨)
   - Padroniza quebras `\r\n` → `\n`
   - Garante linha própria para "Filial N" (inseridos por separador)
   - Colapsa espaços múltiplos

2. **Segmentar em blocos** (`segmentaBlocos`)
   - Separadores: linha em branco, marcadores "ALTERAÇÃO", "🚨" (antes da remoção), "Filial N", "Mega Box", "Loja N"
   - Cada bloco contém 1 alteração potencial
   - Bloco mínimo: precisa conter ao menos 1 placa OU 2 nomes próprios

3. **Extrair tokens** (`extraiTokens`)
   - Placa: regex `[A-Z]{3}[\s-]?(\d[A-Z0-9]\d{2}|\d{4})`
   - Código: regex `\b\d{2,6}\b` (filtrar números que coincidem com placa)
   - Nome próprio: 2-4 palavras com inicial maiúscula (heurística: "Sai:" ou "Entra:" precede)

4. **Lookup banco** (`lookupCanonical`)
   - Pra cada token, consulta `ctx`:
     - Placa exata → retorna {nome, código} se houver
     - Código exato → retorna {nome, placa}
     - Nome (normalizado, sem acentos) → fuzzy match (Levenshtein ≤ 2)
   - Preenche `SlotVeiculo` com `fonte: 'banco'` para campos derivados

5. **Detectar entra/sai** (`detectaSentido`)
   - Prioridade 1: âncoras explícitas "Sai:" / "Entra:" / "Saiu:" / "Entrou:" / "Substitui"
   - Prioridade 2: ordem ("sai... entra..." ou separador "/")
   - Prioridade 3: contexto ("quebrou", "folga" → sai; "assumiu", "ficou" → entra)
   - Se não conseguir → `confianca: 'baixa'` + warning

6. **Detectar rede/loja/filial** (`detectaContexto`)
   - Rede: substring match em REDE_MAP (já existe)
   - Filial: regex `filial\s+(\d+)(?:/(\d+))?` — captura "Filial 45/47" como [45, 47] e gera **2 blocos**
   - Loja: linha que contém rede + não é Sai/Entra/Motivo

**Confiança:**
- `alta`: rede + sai.placa + entra.placa todos presentes (mesmo que vindos do banco)
- `media`: rede + 1 dos 2 slots completo
- `baixa`: falta rede OU slots incompletos

### 2. `src/lib/parsers/lookup-canonical.ts` (NOVO)

Build do índice em memória:
```typescript
export async function buildLookupContext(
  svc: SupabaseClient,
  dias: number = 60
): Promise<ParseContext>
```

- Lê `escala_linhas WHERE data_entrega >= NOW() - INTERVAL '60 days'`
- Deduplica por nome_normalizado
- Retorna índice usado pelo parser

Cache de 5min por request (mesma resposta para múltiplas alterações na sessão).

### 3. `src/app/api/alteracoes/parsear-v2/route.ts` (NOVO)

```typescript
POST /api/alteracoes/parsear-v2
Body: { texto: string }
Response: { blocos: AlteracaoBloco[] }
```

- Auth check
- Build context (com cache)
- Chama parseAlteracoesV2
- Retorna lista

### 4. `src/app/api/alteracoes/aplicar-lote/route.ts` (NOVO)

```typescript
POST /api/alteracoes/aplicar-lote
Body: { blocos: AlteracaoBloco[], data: string }
Response: { aplicados: number, erros: Array<{idx, msg}> }
```

- Para cada bloco:
  - Insere em `alteracoes` (tabela existente)
- Coleta `rede_id`s afetadas
- Chama `/api/kpi/processar` para cada rede em paralelo
- Retorna sumário

### 5. `src/app/painel/alteracoes/nova/form.tsx` (REESCRITA)

Tela atual é substituída. Componentes:

**`AlteracoesV2Form` (root)**
- Textarea grande com placeholder mostrando exemplo
- Botão "Analisar"
- Após análise: renderiza N `AlteracaoCard` em lista

**`AlteracaoCard`**
- Header: rede · loja/filial · badge de confiança
- Linha Sai: nome (input) · cód (input pequeno) · placa (input)
- Linha Entra: idem
- Cada campo: ícone 🏦 quando preenchido pelo banco (lookup)
- Motivo: textarea pequena
- Warnings: lista amarela embaixo (`placa não cadastrada`, `código duplicado`, ...)
- Botões: "Aplicar" / "Descartar"

**Footer:** botão verde "Aplicar todos os N cards"

### 6. Migration: nenhuma

A tabela `alteracoes` existente já tem os campos necessários (`motorista_entra`, `motorista_sai`, `placa_entra_norm`, `placa_sai_norm`, etc.). Não precisa de DDL.

## Data flow

```
1. User cola "Filial 43 Sai: Douglas LTE-0A64 Entra: Eduardo LQA-5883
              Filial 23 Sai: Eduardo LQA-5883 Entra: Douglas LTE-0A64"

2. Frontend → POST /api/alteracoes/parsear-v2

3. Backend:
   a. buildLookupContext() consulta últimas escalas
   b. parseAlteracoesV2():
      - Segmenta em 2 blocos (Filial 43, Filial 23)
      - Bloco 1: Filial 43 → loja Zona Sul Loja 43
        sai: { placa: 'LTE0A64', nome: ?, cod: ? } → lookup → preenche Douglas + cód do banco
        entra: { placa: 'LQA5883' } → lookup → preenche Eduardo + cód
      - Bloco 2: similar com slots invertidos
   c. Retorna { blocos: [bloco1, bloco2] }

4. Frontend renderiza 2 cards

5. User confere, ajusta motivo, clica "Aplicar todos"

6. Frontend → POST /api/alteracoes/aplicar-lote { blocos, data }

7. Backend:
   - Insert em alteracoes (x2)
   - POST /api/kpi/processar para rede ZONA_SUL
   - Retorna sumário

8. Frontend mostra "2 aplicadas. KPI reprocessado."
```

## Error handling

| Cenário | Comportamento |
|---------|---------------|
| Bloco sem sai E entra | Card aparece com warning "sem motorista identificado". User pode descartar ou preencher manualmente |
| Placa não casa com banco | Warning "placa não cadastrada nas últimas escalas". Aplica mesmo assim (operador pode estar usando placa nova) |
| Nome ambíguo (2 motoristas com mesmo nome) | Dropdown no card pra escolher qual |
| Múltiplas alterações com confiança mista | Cards aparecem normais, badge sinaliza confiança baixa, user revisa antes de aplicar tudo |
| Erro ao aplicar 1 bloco | Os outros são aplicados; erro mostrado per-card |

## Testing

**Unit tests (`alteracoes-v2.test.ts`):**

Inputs reais das 11 alterações do dia 18:
1. "Alteração zona sul Mega box Sai: Fabrício qsw3b65 Entra: Jairo tjq6j26" → 1 bloco
2. "🚨Alteração 🚨 Assai caxias Troca de carro Entra: UBO 5E05 Sai: EZU 9J51..." → 1 bloco
3. "ZONA SUL Filial 43 Sai: Douglas lte0a64 Entra: Eduardo lqa5883 Filial 23 Sai: Eduardo lqa5883 Entra: Douglas lte0a64" → 2 blocos
4. "Filial 45/47 Sai: Francisco Rjl7d33 Entra: Eduardo krk3d12" → 2 blocos (filial 45 + filial 47, mesmo par sai/entra)
5. Texto inline (sem quebras) "alteração princesa flamengo sai kanu placa kqr2j11 cod 738 entra Rafael placa eyl 8b91 cod 184502 motivo carro quebrou" → 1 bloco

**Mocks:** `ParseContext` com motoristas/lojas de teste.

**E2E:** test manual após implementação com as 11 alterações reais.

## Plano de Fixes Operacionais (Dia 18)

Separados da implementação da feature acima — operação pura, sem código.

### Lote 1: erros de digitação em escalas
Corrigir manualmente na origem (ou via SQL UPDATE em escala_linhas) e re-importar:
- KNS-8D16 → **KNS-8D26** (ASSAI Boulevard, FEIRA_NOVA Boa Dica)
- LMF-2A49 → **LMF-2049** (EMANUEL Jardim Maravilha)
- EFU-5704 → **EFU-5H04** (FEIRA_NOVA Irajá, SUPER_PAX Vila Penha)
- KXR-7527 → **KXR-7F27** (SUPER_PAX Del Castilho/Pilares)
- LJS-2172 → **LJS-2B72** (ZONA_SUL Loja 17 Barra)
- LCO-0978 → confirmar correta (ZONA_SUL Leblon 07/14)
- LQE-5401 → **LQE-5E01** (ZONA_SUL Flamengo 21 / Laranjeiras 30)

### Lote 2: alterações dia 18 (11 itens)
Aplicar via novo form alteracoes-v2 depois que estiver pronto:

1. ZONA SUL Mega Box: QSW-3B65 → TJQ-6J26
2. ASSAI Caxias: EZU-9J51 → UBO-5E05
3. CARREFOUR Campos/Macaé: KPN-4F36 → KZJ-0E14 (Agenor → Vanor)
4. PRINCESA Flamengo: KQR-2J11 → EYL-8B91 (Kanu → Rafael) — observação: Rafael ficou em Mercado Sto Agostinho, talvez não tenha executado
5. ASSAI Tijuca: DDI-6J90 → DBB-8D19 (Valdir → Paulo Henrique)
6. ZONA SUL Filial 43: LTE-0A64 → LQA-5883 (Douglas → Eduardo)
7. ZONA SUL Filial 23: LQA-5883 → LTE-0A64 (Eduardo → Douglas)
8. ZONA SUL Filial 10: CYB-3B90 → LKV-5067 (Éverton → Rafael)
9. ZONA SUL Filial 44: LAF-0697 → EFU-5H04 (Fábio → Willian)
10. ZONA SUL Filial 45/47: RJL-7D33 → KRK-3D12 (Francisco → Eduardo)
11. ZONA SUL Filial 31: KQB-3F31 → LUP-1F13 (Sidney → Luiz)

### Lote 3: cadastrar lojas faltantes (após reupload Unitrac)
Após reupload do Unitrac do dia 18, o auto-cadastro vai inserir em `canonical_loja` todas as lojas com geofence. Cadastros restantes (sem geofence Unitrac) devem ser feitos manualmente:
- Lojas que aparecem como FORA_BASE com paradas legítimas (Mercado de Santa, Sams Barra Ayrton Senna, etc.)
- Lista detalhada no relatório de análise dos 15 KPIs

### Lote 4: reprocessar tudo
1. Reupar Unitrac dia 18 → dispara auto-cadastro em `canonical_loja`
2. Para cada rede: POST `/api/kpi/processar` { data: '2026-05-18', rede_id }
3. Para cada rede: POST `/api/kpi/gerar` { kpi_id }
4. Validar KPIs gerados

## Ordem de implementação sugerida

**Fase 1 (feature alteracoes-v2):**
1. Implementar `lookup-canonical.ts` + `alteracoes-v2.ts` (parser)
2. Unit tests com as 11 alterações reais
3. Endpoint `/api/alteracoes/parsear-v2`
4. Endpoint `/api/alteracoes/aplicar-lote`
5. UI: novo `AlteracoesV2Form` + `AlteracaoCard`
6. Substituir form antigo (manter rota igual ou criar /alteracoes/nova-v2 inicialmente)

**Fase 2 (fixes dia 18):**
1. Corrigir erros de digitação nas escalas (manual ou SQL)
2. Reupar Unitrac dia 18 (dispara auto-cadastro)
3. Aplicar 11 alterações via novo form
4. Reprocessar todos KPIs
5. Validar resultados
