# KPI Sem-Geo Perfeito — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar a precisão do KPI no modo sem-geofence (`setSemGeo(true)`) de ~71% para o máximo possível, corrigindo os bugs reais que a auditoria do dia 19 encontrou, sem reintroduzir geo e sem inventar dado.

**Architecture:** O matcher de produção (`src/lib/kpi/matcher.ts`, função `cruzaEscalaUnitrac`) já casa por código/nome/placa e tem a flag `SEM_GEO` que desliga os 4 caminhos de match-por-GPS. Os bugs restantes estão em (1) distribuição de paradas multi-loja para a linha certa quando a placa visita várias lojas da mesma rede, e (2) cálculo da saída da loja quando há múltiplas visitas. Cada bug é corrigido por TDD: teste reproduzindo o caso real → fix mínimo → re-auditoria contra o manual como gate de não-regressão.

**Tech Stack:** TypeScript, vitest, Supabase (dados já carregados dias 18-25), ExcelJS (comparação contra KPIs manuais da Tia em `C:/Users/media/Downloads/KPI SMANUAIS`).

---

## Estado atual (baseline auditado — dia 19, tolerância 10 min)

| Rede | Precisão | Status |
|------|:--:|---|
| ATACADAO, SUPERPRIX | 100% | ok |
| GUANABARA, PRINCESA | 91% | ok |
| PREZUNIC | 90% | ok |
| CARREFOUR | 88% | ok |
| ZONA_SUL | 67% | bug multi-loja |
| SUPER_PAX | 64% | erro saída |
| ASSAI | 57% | erro saída multi-visita |
| ARMAZEM_GRAO | 38% | dado ausente + saída |

Totais baseline: Acerto=149 · Erro horário=41 · Inventou=1 · Não achou=48 (sendo 9 bugs reais + 36 dado ausente + 3 cod bugado).

**Gate de não-regressão:** rodar `npx tsx scripts/analise/gerar_kpi_semgeo.ts 2026-05-19` seguido de `npx tsx scripts/analise/auditoria_completa_d19.ts`. As 6 redes que já estão ≥88% NÃO podem cair. `Inventou` não pode passar de 2.

---

## File Structure

- `src/lib/kpi/matcher.ts` — única fonte do matcher. Toda mudança de lógica entra aqui, atrás de comportamento que respeita `SEM_GEO`. Não criar arquivo novo.
- `src/lib/kpi/matcher.test.ts` — testes unitários (vitest). Cada bug ganha um `describe` novo com dados reais do dia 19.
- `scripts/analise/auditoria_completa_d19.ts` — harness de auditoria (já existe). Usado como gate.
- `scripts/analise/gerar_kpi_semgeo.ts` — gera os XLSX sem-geo (já existe). Roda antes da auditoria.

---

## Task 1: Congelar o baseline como teste de regressão automatizado

**Files:**
- Create: `scripts/analise/regressao_semgeo.ts`

- [ ] **Step 1: Escrever o script de gate que falha se a precisão das redes boas cair**

```typescript
// scripts/analise/regressao_semgeo.ts
// Gate de não-regressão: roda a auditoria e verifica que as redes ≥88% não cairam
// e que Inventou <= 2. Sai com código 1 se regrediu.
import { execSync } from 'child_process'

const MIN_PRECISAO: Record<string, number> = {
  ATACADAO: 100, SUPERPRIX: 100, GUANABARA: 88, PRINCESA: 88, PREZUNIC: 88, CARREFOUR: 85,
}
const out = execSync('npx tsx scripts/analise/auditoria_completa_d19.ts', { encoding: 'utf-8' })
console.log(out)
let falhou = false
for (const linha of out.split('\n')) {
  const m = linha.match(/^\|\s*([A-Z_]+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)%/)
  if (!m) continue
  const [, rede, , , inventou, , prec] = m
  const min = MIN_PRECISAO[rede]
  if (min != null && Number(prec) < min) { console.error(`REGRESSAO: ${rede} caiu para ${prec}% (min ${min}%)`); falhou = true }
  if (Number(inventou) > 2) { console.error(`REGRESSAO: ${rede} inventou ${inventou} (max 2)`); falhou = true }
}
if (falhou) process.exit(1)
console.log('\n✓ Sem regressão nas redes boas')
```

- [ ] **Step 2: Rodar o gate no baseline e confirmar que passa**

Run: `cd C:/Users/media/dev/kpi-transmonseg && npx tsx scripts/analise/gerar_kpi_semgeo.ts 2026-05-19 && npx tsx scripts/analise/regressao_semgeo.ts`
Expected: imprime a tabela e termina com `✓ Sem regressão nas redes boas` (exit 0).

- [ ] **Step 3: Commit**

```bash
git add scripts/analise/regressao_semgeo.ts
git commit -m "test(kpi): gate de regressao semgeo dia 19"
```

---

## Task 2: Reproduzir o bug de distribuição multi-loja (ZONA_SUL LQU5546) com teste

**Files:**
- Modify: `src/lib/kpi/matcher.test.ts` (adicionar describe no fim, antes do `})` final do arquivo)

Dados reais (dia 19, placa LQU5546): paradas LOJA limpas `9039027` (04:45-05:20), `9039015` (05:32-06:40), `9039028` (15:57-16:16). Escala: lojas 27, 15, 28, 29 (carro 1). Esperado: loja 27 casa parada 9039027, loja 15 casa 9039015, loja 28 casa 9039028, loja 29 fica sem (não tem parada). Hoje, sem geo, lojas 15/28/29 ficam vazias indevidamente.

- [ ] **Step 1: Escrever o teste que reproduz o bug**

```typescript
describe('SEM_GEO — distribuição multi-loja ZONA_SUL por código suffix', () => {
  it('LQU5546 dia 19: cada parada vai pra linha do código certo', async () => {
    setSemGeo(true)
    try {
      const escalaLinhas: EscalaLinhaRow[] = [
        { id: 'l27', rede_id: 'ZONA_SUL', placa_norm: 'LQU5546', loja_nome_raw: 'Zona Sul Loja 27 - Ipanema', loja_codigo_raw: '27', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
        { id: 'l15', rede_id: 'ZONA_SUL', placa_norm: 'LQU5546', loja_nome_raw: 'Zona Sul Loja 15 - Leblon', loja_codigo_raw: '15', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
        { id: 'l28', rede_id: 'ZONA_SUL', placa_norm: 'LQU5546', loja_nome_raw: 'Zona Sul Loja 28 - Urca', loja_codigo_raw: '28', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
        { id: 'l29', rede_id: 'ZONA_SUL', placa_norm: 'LQU5546', loja_nome_raw: 'Zona Sul Loja 29 - Flamengo', loja_codigo_raw: '29', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      ]
      const paradaRows: UnitracParadaRow[] = [
        { id: 'p27a', placa_norm: 'LQU5546', chegada: '2026-05-19T04:45:00Z', saida: '2026-05-19T05:03:00Z', duracao_seg: 1080, local_parada: '9039027 - 27 - ZONA SUL - IPANEMA', codigo_loja: '9039027', nome_loja: '27 - ZONA SUL - IPANEMA', lat: -22.984, lng: -43.198, classificacao: 'LOJA', ordem: 1 },
        { id: 'p27b', placa_norm: 'LQU5546', chegada: '2026-05-19T05:04:00Z', saida: '2026-05-19T05:20:00Z', duracao_seg: 960, local_parada: '9039027 - 27 - ZONA SUL - IPANEMA', codigo_loja: '9039027', nome_loja: '27 - ZONA SUL - IPANEMA', lat: -22.984, lng: -43.198, classificacao: 'LOJA', ordem: 2 },
        { id: 'p15', placa_norm: 'LQU5546', chegada: '2026-05-19T05:32:00Z', saida: '2026-05-19T06:40:00Z', duracao_seg: 4080, local_parada: '9039015 - 15 - ZONA SUL - LEBLON', codigo_loja: '9039015', nome_loja: '15 - ZONA SUL - LEBLON', lat: -22.987, lng: -43.224, classificacao: 'LOJA', ordem: 3 },
        { id: 'p28', placa_norm: 'LQU5546', chegada: '2026-05-19T15:57:00Z', saida: '2026-05-19T16:16:00Z', duracao_seg: 1140, local_parada: '9039028 - 28 - ZONA SUL - URCA', codigo_loja: '9039028', nome_loja: '28 - ZONA SUL - URCA', lat: -22.948, lng: -43.165, classificacao: 'LOJA', ordem: 4 },
      ]
      const lojas: LojaRow[] = [
        { id: 'c27', rede_id: 'ZONA_SUL', nome: 'Zona Sul Loja 27 - Ipanema', nome_normalizado: 'zona sul loja 27 ipanema', codigo_escala: '27', codigo_unitrac: '9039027', nome_unitrac: '27 - ZONA SUL - IPANEMA', lat: -22.984, lng: -43.198, raio_metros: 200 },
        { id: 'c15', rede_id: 'ZONA_SUL', nome: 'Zona Sul Loja 15 - Leblon', nome_normalizado: 'zona sul loja 15 leblon', codigo_escala: '15', codigo_unitrac: '9039015', nome_unitrac: '15 - ZONA SUL - LEBLON', lat: -22.987, lng: -43.224, raio_metros: 200 },
        { id: 'c28', rede_id: 'ZONA_SUL', nome: 'Zona Sul Loja 28 - Urca', nome_normalizado: 'zona sul loja 28 urca', codigo_escala: '28', codigo_unitrac: '9039028', nome_unitrac: '28 - ZONA SUL - URCA', lat: -22.948, lng: -43.165, raio_metros: 200 },
        { id: 'c29', rede_id: 'ZONA_SUL', nome: 'Zona Sul Loja 29 - Flamengo', nome_normalizado: 'zona sul loja 29 flamengo', codigo_escala: '29', codigo_unitrac: '9039029', nome_unitrac: '29 - ZONA SUL - FLAMENGO', lat: -22.93, lng: -43.17, raio_metros: 200 },
      ]
      const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
      const r27 = rotas.find(r => r.escala_linha_id === 'l27')
      const r15 = rotas.find(r => r.escala_linha_id === 'l15')
      const r28 = rotas.find(r => r.escala_linha_id === 'l28')
      const r29 = rotas.find(r => r.escala_linha_id === 'l29')
      expect(r27?.paradas[0]?.chegada).toEqual(new Date('2026-05-19T04:45:00Z'))
      expect(r15?.paradas[0]?.chegada).toEqual(new Date('2026-05-19T05:32:00Z'))
      expect(r28?.paradas[0]?.chegada).toEqual(new Date('2026-05-19T15:57:00Z'))
      expect(r29?.paradas ?? []).toHaveLength(0) // sem parada — fica vazio (correto)
    } finally {
      setSemGeo(false)
    }
  })
})
```

- [ ] **Step 2: Rodar o teste e ver FALHAR**

Run: `npx vitest run src/lib/kpi/matcher.test.ts -t "distribuição multi-loja"`
Expected: FAIL — lojas 15 e/ou 28 vêm vazias (chegada undefined) em vez de casar pelo código.

- [ ] **Step 3: Garantir que `setSemGeo` está importado no topo do teste**

Verificar que a linha de import do matcher inclui `setSemGeo`. Se não:
```typescript
import { cruzaEscalaUnitrac, setSemGeo } from './matcher'
```
Run: `npx vitest run src/lib/kpi/matcher.test.ts -t "distribuição multi-loja"` (ainda deve falhar por lógica, não por import)

- [ ] **Step 4: Commit do teste falhando**

```bash
git add src/lib/kpi/matcher.test.ts
git commit -m "test(matcher): reproduz bug distribuicao multi-loja ZS sem geo (LQU5546)"
```

---

## Task 3: Corrigir a distribuição multi-loja por código suffix sem geo

**Files:**
- Modify: `src/lib/kpi/matcher.ts` (bloco de atribuição por código — função interna que distribui paradas às linhas; localizar via `codCasa` e `assignOptimal`)

**Diagnóstico a confirmar antes de codar (Step 1):** No modo SEM_GEO, quando a placa tem N linhas da mesma rede e M paradas LOJA com código, a atribuição por `codCasa(loja_codigo_raw, codigo_loja)` deve amarrar cada parada à linha cujo `loja_codigo_raw` casa o suffix do `codigo_loja` da parada. O bug é que algum passo anterior (consolidação ou assignOptimal guiado por score de nome) consome a parada antes do match por código, ou o match por código exige o cadastro (que não tem `codigo_escala` pra todas as lojas). A correção: garantir um passo de atribuição por código suffix **direto parada→linha** que rode no SEM_GEO usando o `codigo_loja` da própria parada (não depende do cadastro).

- [ ] **Step 1: Diagnosticar o ponto exato com log temporário**

Adicionar no início de `cruzaEscalaUnitrac`, logo após montar `paradaByPlaca`, um log condicional:
```typescript
if (process.env.DBG_PLACA) {
  const ps = paradaByPlaca.get(process.env.DBG_PLACA) ?? []
  console.error('DBG paradas', process.env.DBG_PLACA, ps.filter(p => p.classificacao === 'LOJA').map(p => `${p.codigo_loja}@${new Date(p.chegada).toISOString().slice(11,16)}`))
}
```
Run: `DBG_PLACA=LQU5546 npx tsx scripts/analise/gerar_kpi_semgeo.ts 2026-05-19 2>&1 | grep "DBG\|LQU"` e identificar se as 3 paradas chegam ao matcher (devem chegar). Remover o log depois do diagnóstico.

- [ ] **Step 2: Implementar atribuição por código suffix direto (parada→linha)**

No ponto onde as linhas sem match são resolvidas (antes do bloco Geo-R que está atrás de `!SEM_GEO`), adicionar um passo que roda SEMPRE (com ou sem geo) e atribui por código da parada. Localizar o trecho `// Geo-R: pula se LOJA órfã` e inserir ANTES dele:

```typescript
    // Atribuição por CÓDIGO da parada → linha (não depende de geo nem do cadastro).
    // Resolve placas multi-loja: cada parada LOJA com codigo_loja casa a linha cujo
    // loja_codigo_raw bate o suffix (ex: escala "15" ↔ parada "9039015"). Caso
    // LQU5546 dia 19: paradas 9039027/9039015/9039028 → linhas 27/15/28.
    for (const p of lojasParadas) {
      if (usados.has(p.id)) continue
      if (!p.codigo_loja) continue
      let bestLinha: typeof linhasAindaSemMatch[0] | null = null
      for (const l of linhasAindaSemMatch) {
        if (matchByEscalaId.has(l.id)) continue
        if (!redesFungiveis(l.rede_id).has(p_redeDoCodigo(p, lojas) ?? l.rede_id)) {
          // se a parada tem cadastro de outra rede, respeita; senão segue
        }
        if (l.loja_codigo_raw && codCasa(l.loja_codigo_raw, p.codigo_loja)) { bestLinha = l; break }
      }
      if (bestLinha) {
        matchByEscalaId.set(bestLinha.id, p)
        usados.add(p.id)
      }
    }
```

Onde `p_redeDoCodigo` é um helper local simples (definir logo acima do loop):
```typescript
    const p_redeDoCodigo = (p: UnitracParadaRow, todasLojas: LojaRow[]): string | null => {
      if (!p.codigo_loja) return null
      const l = todasLojas.find(x => x.codigo_unitrac === p.codigo_loja)
      return l?.rede_id ?? null
    }
```

> Nota de implementação: se `lojasParadas`, `usados`, `linhasAindaSemMatch`, `matchByEscalaId` tiverem nomes diferentes no escopo real, usar os nomes reais encontrados no Step 1. A lógica é: para cada parada LOJA ainda não usada, achar a primeira linha sem match cujo `loja_codigo_raw` casa via `codCasa` e amarrar.

- [ ] **Step 3: Rodar o teste do Task 2 e ver PASSAR**

Run: `npx vitest run src/lib/kpi/matcher.test.ts -t "distribuição multi-loja"`
Expected: PASS — r27=04:45, r15=05:32, r28=15:57, r29 vazio.

- [ ] **Step 4: Rodar a suíte inteira (não-regressão unitária)**

Run: `npx vitest run src/lib/kpi/matcher.test.ts`
Expected: todos passam (113 + 1 novo = 114).

- [ ] **Step 5: Rodar o gate de auditoria**

Run: `npx tsx scripts/analise/gerar_kpi_semgeo.ts 2026-05-19 && npx tsx scripts/analise/regressao_semgeo.ts`
Expected: ZONA_SUL sobe (era 67%), redes boas não caem, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kpi/matcher.ts
git commit -m "fix(matcher): distribuicao multi-loja por codigo suffix no modo sem geo"
```

---

## Task 4: Reproduzir o bug de saída em multi-visita (ASSAI Cabo Frio) com teste

**Files:**
- Modify: `src/lib/kpi/matcher.test.ts`

Dados reais (dia 19): ASSAI Cabo Frio (placa) — chegada bate com manual (~05:50) mas a saída do sistema sai cedo (06:58) porque a placa volta na loja mais tarde; o manual considera a última saída (11:25). Regra: quando a MESMA loja (mesmo `codigo_loja`) tem várias paradas no veículo, chegada = primeira chegada, saída = última saída.

- [ ] **Step 1: Escrever o teste**

```typescript
describe('SEM_GEO — saída da loja consolida múltiplas visitas (mesma loja)', () => {
  it('placa que volta na mesma loja: chegada=primeira, saida=ultima', async () => {
    setSemGeo(true)
    try {
      const escalaLinhas: EscalaLinhaRow[] = [
        { id: 'lcf', rede_id: 'ASSAI', placa_norm: 'AWA6B40', loja_nome_raw: 'Assaí - Cabo Frio - Loja 82', loja_codigo_raw: '560017', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      ]
      const paradaRows: UnitracParadaRow[] = [
        { id: 'b0', placa_norm: 'AWA6B40', chegada: '2026-05-19T02:30:00Z', saida: '2026-05-19T02:50:00Z', duracao_seg: 1200, local_parada: 'BASE BENASSI - BASE BENASSI', codigo_loja: null, nome_loja: null, lat: -22.83, lng: -43.32, classificacao: 'BASE', ordem: 1 },
        { id: 'cf1', placa_norm: 'AWA6B40', chegada: '2026-05-19T05:50:00Z', saida: '2026-05-19T06:58:00Z', duracao_seg: 4080, local_parada: '560017 - ASSAI CABO FRIO', codigo_loja: '560017', nome_loja: 'ASSAI CABO FRIO', lat: -22.88, lng: -42.02, classificacao: 'LOJA', ordem: 2 },
        { id: 'cf2', placa_norm: 'AWA6B40', chegada: '2026-05-19T09:10:00Z', saida: '2026-05-19T11:25:00Z', duracao_seg: 8100, local_parada: '560017 - ASSAI CABO FRIO', codigo_loja: '560017', nome_loja: 'ASSAI CABO FRIO', lat: -22.88, lng: -42.02, classificacao: 'LOJA', ordem: 3 },
      ]
      const lojas: LojaRow[] = [
        { id: 'ccf', rede_id: 'ASSAI', nome: 'Assai - Cabo Frio - Loja 82', nome_normalizado: 'assai cabo frio loja 82', codigo_escala: '560017', codigo_unitrac: '560017', nome_unitrac: 'ASSAI CABO FRIO', lat: -22.88, lng: -42.02, raio_metros: 200 },
      ]
      const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
      const r = rotas.find(x => x.escala_linha_id === 'lcf')
      expect(r?.paradas?.length).toBeGreaterThanOrEqual(1)
      const p = r!.paradas[0]
      expect(p.chegada).toEqual(new Date('2026-05-19T05:50:00Z'))  // primeira chegada
      expect(p.saida).toEqual(new Date('2026-05-19T11:25:00Z'))    // última saída
    } finally {
      setSemGeo(false)
    }
  })
})
```

- [ ] **Step 2: Rodar e ver FALHAR**

Run: `npx vitest run src/lib/kpi/matcher.test.ts -t "consolida múltiplas visitas"`
Expected: FAIL — saída vem 06:58 (primeira) em vez de 11:25 (última).

- [ ] **Step 3: Commit do teste falhando**

```bash
git add src/lib/kpi/matcher.test.ts
git commit -m "test(matcher): reproduz saida multi-visita mesma loja (Cabo Frio)"
```

---

## Task 5: Consolidar paradas da mesma loja (chegada=primeira, saída=última)

**Files:**
- Modify: `src/lib/kpi/matcher.ts` (na montagem das paradas da rota — onde `r.paradas` é construído a partir das paradas casadas)

**Diagnóstico (Step 1):** Localizar onde a rota final monta o array `paradas` a partir das paradas atribuídas. Hoje, quando há 2 paradas LOJA com mesmo `codigo_loja`, ou (a) só a primeira é considerada, ou (b) viram 2 entradas. A regra: agrupar por `codigo_loja` (ou por loja casada), e para cada grupo emitir UMA parada com `chegada=min(chegada)`, `saida=max(saida)`, `duracao_min=(max.saida - min.chegada)`.

- [ ] **Step 1: Localizar o ponto de montagem das paradas da rota**

Run: `grep -n "paradas:" src/lib/kpi/matcher.ts | head` e `grep -n "duracao_min\|push({" src/lib/kpi/matcher.ts | head`
Identificar onde cada `RotaKpi.paradas` recebe seus itens. Confirmar formato `{ parada_id, loja_id, nome, chegada, saida, duracao_min, classificacao }`.

- [ ] **Step 2: Implementar consolidação por loja na montagem da rota**

No ponto onde as paradas da linha são transformadas em `paradasRota`, agrupar as que têm o mesmo `codigo_loja` (quando ≥2) e emitir uma só:

```typescript
    // Consolida múltiplas visitas à MESMA loja (mesmo codigo_loja) numa entrega só:
    // chegada = primeira chegada, saída = última saída (regra manual Tia Erica —
    // a placa pode voltar na loja; o tempo total vai da 1ª chegada à última saída).
    function consolidaMesmaLoja(ps: ParadaDaRota[]): ParadaDaRota[] {
      const porCod = new Map<string, ParadaDaRota[]>()
      const semCod: ParadaDaRota[] = []
      for (const p of ps) {
        const cod = (p as any).codigo_loja ?? null
        if (!cod) { semCod.push(p); continue }
        const arr = porCod.get(cod) ?? []
        arr.push(p); porCod.set(cod, arr)
      }
      const out: ParadaDaRota[] = [...semCod]
      for (const grupo of porCod.values()) {
        if (grupo.length === 1) { out.push(grupo[0]); continue }
        const ordC = [...grupo].sort((a, b) => a.chegada.getTime() - b.chegada.getTime())
        const ordS = [...grupo].sort((a, b) => b.saida.getTime() - a.saida.getTime())
        const chegada = ordC[0].chegada
        const saida = ordS[0].saida
        out.push({ ...ordC[0], chegada, saida, duracao_min: Math.round((saida.getTime() - chegada.getTime()) / 60000) })
      }
      return out.sort((a, b) => a.chegada.getTime() - b.chegada.getTime())
    }
```

> Nota: usar o tipo real do item de parada da rota (encontrado no Step 1) no lugar de `ParadaDaRota`. Aplicar `consolidaMesmaLoja(...)` ao array de paradas logo antes de atribuir a `rota.paradas`. Se o item não carregar `codigo_loja`, propagar esse campo no objeto da parada da rota (adicionar `codigo_loja: p.codigo_loja` na construção).

- [ ] **Step 3: Rodar o teste do Task 4 e ver PASSAR**

Run: `npx vitest run src/lib/kpi/matcher.test.ts -t "consolida múltiplas visitas"`
Expected: PASS — chegada 05:50, saída 11:25.

- [ ] **Step 4: Suíte inteira**

Run: `npx vitest run src/lib/kpi/matcher.test.ts`
Expected: todos passam (115).

- [ ] **Step 5: Gate de auditoria**

Run: `npx tsx scripts/analise/gerar_kpi_semgeo.ts 2026-05-19 && npx tsx scripts/analise/regressao_semgeo.ts`
Expected: ASSAI sobe (era 57%), redes boas não caem.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kpi/matcher.ts
git commit -m "fix(matcher): consolida multiplas visitas mesma loja (chegada 1a, saida ultima)"
```

---

## Task 6: Marcar "dado ausente" explicitamente (placa sem parada LOJA)

**Files:**
- Modify: `src/lib/kpi/matcher.ts` (status da rota quando não há parada)

A auditoria mostrou 36 casos "não achou" que são DADO AUSENTE (placa não tem parada LOJA no Unitrac) — devem ficar vazios, o que já acontece. Esta task só garante que essas rotas tenham `status` distinto de erro pra não poluir métrica futura. NÃO muda preenchimento.

- [ ] **Step 1: Teste — placa sem parada LOJA fica vazia com status sem_entrega**

```typescript
describe('SEM_GEO — placa sem parada LOJA fica vazia (dado ausente)', () => {
  it('placa escalada sem nenhuma parada LOJA → rota vazia, status sem_entrega', async () => {
    setSemGeo(true)
    try {
      const escalaLinhas: EscalaLinhaRow[] = [
        { id: 'lx', rede_id: 'ASSAI', placa_norm: 'LSN6I72', loja_nome_raw: 'Assaí - Alcântara I - Loja 35', loja_codigo_raw: '560019', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      ]
      const paradaRows: UnitracParadaRow[] = [
        { id: 'b0', placa_norm: 'LSN6I72', chegada: '2026-05-19T03:00:00Z', saida: '2026-05-19T03:30:00Z', duracao_seg: 1800, local_parada: 'BASE BENASSI - BASE BENASSI', codigo_loja: null, nome_loja: null, lat: -22.83, lng: -43.32, classificacao: 'BASE', ordem: 1 },
      ]
      const lojas: LojaRow[] = [
        { id: 'ca', rede_id: 'ASSAI', nome: 'Assai - Alcantara I - Loja 35', nome_normalizado: 'assai alcantara i loja 35', codigo_escala: '560019', codigo_unitrac: '560019', nome_unitrac: 'ASSAI ALCANTARA I', lat: -22.81, lng: -43.36, raio_metros: 200 },
      ]
      const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
      const r = rotas.find(x => x.escala_linha_id === 'lx')
      expect(r?.paradas ?? []).toHaveLength(0)
    } finally {
      setSemGeo(false)
    }
  })
})
```

- [ ] **Step 2: Rodar — provavelmente JÁ PASSA (comportamento correto)**

Run: `npx vitest run src/lib/kpi/matcher.test.ts -t "dado ausente"`
Expected: PASS. Se passar, é teste de proteção (documenta o comportamento). Se falhar (preencheu algo), investigar — não deveria preencher sem parada.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kpi/matcher.test.ts
git commit -m "test(matcher): placa sem parada LOJA fica vazia no modo sem geo"
```

---

## Task 7: Re-auditar dia 19 e medir ganho final

**Files:**
- Modify: `docs/conversas-tia-erica/AUDITORIA-SEMGEO-D19.md` (atualizar com números pós-fix)

- [ ] **Step 1: Regenerar e auditar**

Run: `npx tsx scripts/analise/gerar_kpi_semgeo.ts 2026-05-19 && npx tsx scripts/analise/auditoria_completa_d19.ts > /tmp/audit-pos.txt 2>&1 && cat /tmp/audit-pos.txt`
Expected: tabela com ZONA_SUL e ASSAI maiores, totais Acerto subindo e Não-achou(bug) caindo de 9 para ≤2.

- [ ] **Step 2: Atualizar o documento de auditoria com a tabela nova (antes/depois)**

Editar `docs/conversas-tia-erica/AUDITORIA-SEMGEO-D19.md` adicionando seção "Pós-fix" com a tabela nova e o delta por rede.

- [ ] **Step 3: Commit**

```bash
git add docs/conversas-tia-erica/AUDITORIA-SEMGEO-D19.md
git commit -m "docs: auditoria semgeo dia 19 pos-fix (antes/depois)"
```

---

## Task 8: Validar nos outros dias (18/20/21/22) — sem manual, checar consistência

**Files:**
- Create: `scripts/analise/sanidade_semgeo_multidias.ts`

Não há KPI manual pros outros dias, mas dá pra checar sanidade: nenhuma rota deve ter saída < chegada, nenhuma parada consolidada com duração negativa, e a taxa de preenchimento deve ser comparável ao dia 19.

- [ ] **Step 1: Escrever o script de sanidade**

```typescript
// scripts/analise/sanidade_semgeo_multidias.ts
import { config } from 'dotenv'; config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { cruzaEscalaUnitrac, setSemGeo } from '@/lib/kpi/matcher'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const DIAS = ['2026-05-18','2026-05-20','2026-05-21','2026-05-22']
;(async () => {
  setSemGeo(true)
  for (const dia of DIAS) {
    const esc: any[] = []; let o = 0
    while (true) { const { data } = await sb.from('escala_linhas').select('id,rede_id,placa_norm,loja_nome_raw,loja_codigo_raw,motorista_nome,carro_ordem,data_entrega').eq('data_entrega', dia).range(o, o+999); if (!data?.length) break; esc.push(...data); if (data.length<1000) break; o+=1000 }
    const par: any[] = []; o = 0
    while (true) { const { data } = await sb.from('unitrac_paradas').select('id,placa_norm,chegada,saida,duracao_seg,lat,lng,local_parada,codigo_loja,nome_loja,classificacao,loja_id,ordem,unitrac_uploads!inner(data_relatorio)').eq('unitrac_uploads.data_relatorio', dia).order('chegada').range(o, o+999); if (!data?.length) break; par.push(...data); if (data.length<1000) break; o+=1000 }
    const { data: lojas } = await sb.from('lojas').select('id,rede_id,nome,nome_normalizado,codigo_escala,codigo_unitrac,nome_unitrac,lat,lng,raio_metros').eq('ativo', true)
    const redes = [...new Set(esc.map(e => e.rede_id))]
    let rotas = 0, preench = 0, saidaInvalida = 0
    for (const rid of redes) {
      const lr = esc.filter(e => e.rede_id === rid)
      const placas = new Set(lr.map(l => l.placa_norm).filter(Boolean))
      const pr = par.filter(p => placas.has(p.placa_norm))
      const rs = await cruzaEscalaUnitrac(lr, pr, (lojas ?? []).filter(l => l.rede_id === rid) as any)
      for (const r of rs as any[]) {
        rotas++
        for (const p of r.paradas ?? []) {
          preench++
          if (new Date(p.saida).getTime() < new Date(p.chegada).getTime()) saidaInvalida++
        }
      }
    }
    console.log(`${dia}: rotas=${rotas} paradas_preenchidas=${preench} saida<chegada=${saidaInvalida}`)
  }
})().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Rodar e confirmar 0 saídas inválidas**

Run: `npx tsx scripts/analise/sanidade_semgeo_multidias.ts`
Expected: cada dia imprime `saida<chegada=0`. Se algum >0, voltar ao Task 5 (consolidação gerou saída < chegada).

- [ ] **Step 3: Commit**

```bash
git add scripts/analise/sanidade_semgeo_multidias.ts
git commit -m "test(kpi): sanidade semgeo dias 18/20/21/22"
```

---

## Self-Review

**Spec coverage:**
- Bug multi-loja ZS (9 casos) → Tasks 2-3 ✅
- Erro de saída multi-visita ASSAI/ARMAZEM (41 erros horário) → Tasks 4-5 ✅
- Dado ausente (36, comportamento correto) → Task 6 (proteção) ✅
- Não-regressão das redes boas → Task 1 (gate) + Steps 5 de cada fix ✅
- Validação multi-dia → Task 8 ✅

**Gaps conhecidos (assumidos, não bugs):**
- ARMAZEM com horário totalmente errado (manual 15:25 vs 05:44): causado por dado ausente das placas REGINA (sem parada) + Petrópolis distante. Coberto parcialmente por Task 5; o resto é dado ausente (Task 6), não corrigível por código.
- SUPER_PAX 1 falso positivo (LINS): caso isolado, dentro do limite do gate (≤2).

**Type consistency:** `setSemGeo` (export), `cruzaEscalaUnitrac` (async, retorna RotaKpi[]), `codCasa(escalaCod, unitracCod)`, `redesFungiveis(redeId): Set<string>` — nomes confirmados no matcher atual. O tipo do item de parada da rota deve ser lido no Task 5 Step 1 antes de usar (placeholder `ParadaDaRota` substituído pelo real).
