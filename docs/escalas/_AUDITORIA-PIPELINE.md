# Auditoria do Pipeline KPI (Fase C)

Baseada nos docs `escala-geral-dia-18.md` … `dia-21.md` e leitura de:
- `src/lib/parsers/escala-geral.ts` (499 linhas)
- `src/lib/kpi/matcher.ts` (1137 linhas)
- `src/lib/kpi/gerador-kpi.ts` (285 linhas)
- `src/lib/lojas/catalogo-matriz.ts`

---

## 1. Parser de Escala Geral

### ✅ Pontos fortes

- Detecta merged headers via `isMergedHeader = v4str === s1` (corretamente filtra os 13 separadores azuis)
- Resolve fórmulas usando `cell.result` quando disponível (PREZUNIC SPID, FEIRA NOVA, EMANUEL, ARMAZÉM, SUPER PAX que vêm como `[object Object]`)
- Filtra "SEM PEDIDO", "CARRO ESCALADO"
- Filtra linhas-cabeçalho vazadas (PLACA, FORNECEDOR, REDES/FILIAIS)
- Trata sharedFormula slaves
- Carro 2 só conta se tiver placa válida (texto sem placa = restrição)

### 🐛 Bugs identificados

#### Bug 1 — `SUPERCOMPRAS` não inferida como rede própria

`inferRedeFromLoja()` (linhas 120-139) **não tem SUPERCOMPRAS**. No dia 18 (r69) a linha "SUPERCOMPRAS - COSMOS" cai entre SUPER PRIX (sep r59) e PREZUNIC (sep r70) e é classificada como **SUPERPRIX** (herda do `redeAtual`).

**Fix:** adicionar antes da linha 138:
```typescript
if (n.includes('SUPERCOMPRAS')) return 'SUPERCOMPRAS'
```

#### Bug 2 — `modoBenassi` força todas as lojas para `SENDAS`

Linha 333: `redeAtual = 'SENDAS'` no bloco BENASSI. Mas o bloco contém:
- Americanas (LKV-5067)
- CAB-PETRÓPOLIS (UBF-5G36)
- Sendas Central
- Atlantico Sul / Barramares / Barra Tower (LTH-4J15) — todas Vianense-region
- Santo Agostinho (NSM-6D98)
- Armazem do grão Central (KPH-8C41) → deveria ser ARMAZEM_GRAO
- Mercado de Santa, Mercearia Sachinho (clientes pequenos)

E linha 265: `redeId = modoBenassi ? 'SENDAS' : ...` **descarta inferência por nome**.

**Fix:** trocar para:
```typescript
const redeId = modoBenassi
  ? (redeFromLoja2 !== 'DESCONHECIDO' ? redeFromLoja2 : 'SENDAS')
  : modoForaEscala ? redeFromLoja2
  : redeFromLoja2 !== 'DESCONHECIDO' ? redeFromLoja2 : redeAtual
```

Assim BENASSI default = SENDAS, mas se inferRedeFromLoja achar AMERICANAS/CAB/ARMAZEM_GRAO etc, usa essa.

#### Bug 3 — `PREZUNIC SPID` mascarado como `PREZUNIC`

`inferRedeFromSeparator()` linha 151 retorna PREZUNIC para qualquer separador com "PREZUNIC". As 2 sub-seções `PREZUNIC SPID - BENASSI` (r111) e `PREZUNIC SPID - NORMAL` (r120) viram PREZUNIC.

**Status:** intencional (o catálogo MATRIZ_LOJAS.PREZUNIC já inclui SPIDs no final). OK, mas documentar.

---

## 2. Matcher (Cruzamento Escala × Unitrac)

### ✅ Pontos fortes

- Agrupa por placa, depois faz bijeção ótima escala-linhas ↔ unitrac-paradas
- Trata cross-docking (paradas com múltiplas geofences concatenadas por vírgula)
- Rede-aware scoring com penalty (`REDE_PENALTY = 5`) e hard-block cross-rede
- Consolidação de paradas mesmo cliente, dedup por código, filtro nocturno solitário
- OCR variantes na placa para resolução de ambiguidade

### 🐛 Pontos a revisar

#### OCR_PARES limitado

```typescript
const OCR_PARES: Record<string, string> = {
  '1':'B', 'B':'1', '4':'E', 'E':'4',
  '6':'G', 'G':'6', '7':'H', 'H':'7',
  '8':'I', 'I':'8', '9':'J', 'J':'9',
}
```

Variantes só aplicadas à **posição 4** (Mercosul transition). Mas:
- Nossas placas no XLSX (escala e unitrac) são **legíveis**, não OCR'd. OCR variants raramente são acionadas no fluxo real.
- A confusão `I/1` que vimos no OCR do PDF Mistral é só pra verificação manual.
- **Mas se a Erica digitar uma placa errada na escala (`KQR2J11` vs `KQR-2J11`)**, o `normalizaPlaca` já cuida.

**Status:** não é bug crítico, mas adicionar `'I':'1', '1':'I'` no OCR_PARES garantiria robustez extra para futuros PDFs/imagens.

---

## 3. Gerador de KPI (XLSX)

### ✅ Pontos fortes

- Layout fixo 15 colunas (template idêntico ao manual)
- Catálogo fixo (`MATRIZ_LOJAS`) garante todas as lojas aparecerem mesmo sem dados ("SEM PEDIDO" como linha vazia)
- Fórmulas TEMPO EM LOJA com result pré-calculado
- Tratamento de NÃO FOI AO CLIENTE / SEM RASTREADOR
- Anomaly highlighting (background vermelho)
- BRT-as-UTC convention pra horas

### ⚠️ Limitações de catálogo

`MATRIZ_LOJAS` cobre só: CARREFOUR (11), PRINCESA (25), PREZUNIC (46).

**Não tem catálogo fixo para:**
- ASSAI (são 40 lojas, mas dinâmico)
- ATACADAO, SAMS_CLUB, VIANENSE, SUPERCOMPRAS, MUNDIAL
- AMERICANAS, CAB_PETROPOLIS, SENDAS
- FEIRA_NOVA, EMANUEL, ARMAZEM_GRAO, SUPER_PAX (vêm de outros arquivos)
- GUANABARA (PDF separado), ZONA_SUL (XLSX separado)

**Impacto:** redes sem catálogo só mostram lojas que apareceram na escala do dia. Manual mostra TODAS as lojas (mesmo as sem entrega). Pode causar divergência.

**Recomendação:** levantar catálogo de ASSAI (40 lojas observadas constantemente), SAMS (3-4), VIANENSE (4), SENDAS (variável), etc.

---

## 4. Padrões observados nos 4 dias

### Placas órfãs definitivamente fora do unitrac

| Placa | Motorista | Loja típica | Dias confirmados |
|-------|-----------|-------------|------------------|
| LUP1F13 | Carlos dos Santos | Prezunic Jauru/Taquara Serra Azul | 18, 19, 20, 21 |
| KWB6998 | Delson | Prezunic Botafogo Serra Azul | 18, 19, 20, 21 |
| KPH8C41 | Eduardo | Armazem do grão Central | 18, 19, 20, 21 |
| CDL8E52 | Cludiomir | MUNDIAL | 18, 19, 20, 21 |
| UBF5G34 | Rodrigo | Prezunic multi-loja | 18, 19, 20 |
| KGO5E65 | Fernando | Assaí Santa Cruz/Mendanha | 18, 19, 20 |
| LAU1I64 | Luis Ferreira | Assaí São Gonçalo Camil | 18, 19, 20, 21 |

→ Estes carros provavelmente rodam fora do sistema unitrac (Serra Azul / Mundial / Armazem com outro tracker). O gerador trata como "SEM RASTREADOR" no XLSX final — comportamento correto.

### Taxa de match por dia

| Dia | Match | Sem match | Placas escala |
|-----|-------|-----------|---------------|
| 18 | 91.1% | 13 | 110 |
| 19 | 93.8% | 10 | 107 |
| 20 | 90.1% | 15 | 114 |
| 21 | **96.3%** | 6 | 104 |

Média: **92.8%**. Aceitável, com 6-15 placas órfãs por dia (≈70% recorrentes).

---

## 5. Plano de correções priorizado

### P0 — Critical (fix imediato)

1. **Adicionar SUPERCOMPRAS em `inferRedeFromLoja`** (escala-geral.ts:138)
2. **Permitir inferência por nome dentro do bloco BENASSI** (escala-geral.ts:265)

### P1 — Important (melhora cobertura/qualidade)

3. Adicionar `'I':'1', '1':'I'` ao `OCR_PARES` (matcher.ts:419) — segurança extra
4. Criar `MATRIZ_LOJAS.ASSAI` com 40 lojas (catalogo-matriz.ts:5)
5. Criar `MATRIZ_LOJAS.SAMS_CLUB`, `VIANENSE` (poucas lojas, lista fechada)

### P2 — Nice to have

6. Mapeamento explícito de placas órfãs (LUP1F13, KPH8C41, CDL8E52, etc.) para classificação "SEM TRACKING" e supressão de warning
7. Detecção de Atlantico Sul/Barramares/Barra Tower como rede `BARRA_FORA` ou `VIANENSE_AMPLIADO`
8. Integração de alterações via API/Airtable para evitar UPDATE manual

### P3 — Future

9. Importação automática do unitrac com validação de período (rejeitar se r02 disser outro dia que o esperado)
10. Reconciliação entre escala registrada e alterações pós-emissão (notificação automática)

---

## 6. Próximos passos práticos

1. Aplicar **P0** (2 fixes no parser)
2. Reprocessar dias 18, 19, 20, 21 com parser corrigido
3. Comparar KPIs gerados vs manuais (especialmente lojas que mudam de rede agora: SUPERCOMPRAS, Americanas, CAB, Armazem Central no BENASSI)
4. Aplicar **P1** se P0 não resolver as divergências
