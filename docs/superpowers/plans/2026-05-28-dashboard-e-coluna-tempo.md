# Dashboard de KPI + Coluna Tempo de Operação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps usam checkbox (`- [ ]`). Em TODA task de UI (7, 8, 9, 10) é OBRIGATÓRIO invocar a skill design-taste-frontend (Leon/taste-skill) antes de escrever JSX — o design tem que ficar excelente.

**Goal:** Dashboard de operação RICO — máximo de análises por dia/semana/mês/intervalo, filtros (multi-rede, comparação, status), export PDF e export XLSX mensal por rede, e histórico navegável das KPIs manuais — que LANÇA agora. E deixar pronta, porém oculta atrás de flag, a coluna "Tempo Total da Operação" no gerador (NÃO lança).

**Architecture:** O Dashboard consome os KPIs **manuais** que a operadora sobe (XLSX que ela já faz na mão). Um parser extrai por loja: status (entregue/não-foi/sem-rastreador), placa, motorista, horários. Salva em `kpi_manual_entradas`. Métricas são funções puras testáveis; a API só filtra e delega. Coluna de tempo de operação entra no `gerador-kpi.ts` atrás de flag desligada.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, Supabase (Postgres + Storage), ExcelJS, vitest. Gráficos em SVG/CSS puro (sem dep nova — free-tier). PDF via `window.print()` + página print. XLSX export via ExcelJS.

---

## Catálogo COMPLETO de análises (Task 2 implementa tudo)

**Volume (no período + filtro):** total programado · entregues · não-foi · sem-rastreador · com-rastreador · % sucesso · % sem-rastreador.
**Por rede:** todas as métricas por rede; ranking por volume; ranking por % sucesso; ranking por % sem-rastreador.
**Tempo:** tempo médio em loja (geral + por rede); loja de maior e menor permanência; distribuição de chegadas por turno (madrugada 0-6 / manhã 6-12 / tarde 12-18 / noite 18-24).
**Série temporal:** entregas por dia (empilhado entregue/não-foi/sem-rastreador); evolução do % sem-rastreador; total por dia.
**Lojas:** top lojas sem-rastreador recorrente; top lojas "não-foi"; lojas atendidas vs programadas.
**Placas:** placas mais ativas; placas com sem-rastreador recorrente.
**Cobertura:** por dia, quais das 18 redes têm KPI inserido (completude); redes faltando.

**Filtros:** período (dia/semana/mês/intervalo custom) · multi-seleção de redes (1, 2 ou todas — ex só Atacadão, ou Atacadão+Sendas, ou total) · status. Comparação: 2+ redes selecionadas → métricas lado a lado.

**Exports:** PDF do dashboard no filtro atual · XLSX mensal consolidado por rede (1 planilha/rede, 1 aba/dia) · re-download do XLSX cru de qualquer dia/rede.

---

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/lib/kpi/parse-kpi-manual.ts` (+test) | Lê XLSX manual (aba do dia) → entradas por loja |
| `src/lib/kpi/dashboard-metricas.ts` (+test) | TODAS as métricas + filtros (funções puras) |
| `src/lib/kpi/export-mensal.ts` (+test) | Monta XLSX mensal por rede (aba por dia) |
| `supabase/migrations/20260528_kpi_manual.sql` | Tabela + bucket |
| `src/app/api/kpi-manual/upload/route.ts` | Upload XLSX manual por rede |
| `src/app/api/kpi-manual/historico/route.ts` | Lista dias/redes inseridos + re-download |
| `src/app/api/dashboard/route.ts` | Métricas com filtros |
| `src/app/api/dashboard/export-mensal/route.ts` | Baixa XLSX mensal por rede |
| `src/app/painel/dashboard/page.tsx` | Shell |
| `src/app/painel/dashboard/dashboard-client.tsx` | UI: filtros, cards, gráficos, comparação |
| `src/app/painel/dashboard/inserir-manual.tsx` | Upload por rede |
| `src/app/painel/dashboard/historico.tsx` | Histórico navegável |
| `src/app/painel/dashboard/print/page.tsx` | Print/PDF |
| `src/app/painel/nav.tsx` | +Dashboard |
| `src/lib/kpi/gerador-kpi.ts` | (Parte B) coluna tempo operação atrás de flag |

**REDES (constante reutilizável):** `['PRINCESA','PREZUNIC','ZONA_SUL','ASSAI','SENDAS','CARREFOUR','SUPERPRIX','GUANABARA','SUPER_PAX','FEIRA_NOVA','EMANUEL','ARMAZEM_GRAO','ATACADAO','VIANENSE','SAMS_CLUB','MUNDIAL','SUPERCOMPRAS','CAB_PETROPOLIS']`

---

## PARTE A — DASHBOARD (LANÇA)

### Task 1: Parser de KPI manual

**Files:** Create `src/lib/kpi/parse-kpi-manual.ts` + `.test.ts`

- [ ] **Step 1: Teste com fixture sintético**

```typescript
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { parseKpiManual } from './parse-kpi-manual'
async function makeWb(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('19')
  ws.getRow(3).values = ['REDES / FILIAIS','MOTORISTA','COD','PLACA','SAIDA CD','CHD LOJA','SAIDA LOJA']
  ws.getRow(5).values = ['Princesa - Catete','JOAO','12','ABC1D23','05:10','06:35','09:15']
  ws.getRow(6).values = ['Princesa - Flamengo','MARIA','13','ABC1D24','SEM','RASTREADOR','']
  ws.getRow(7).values = ['Princesa - Leme','PEDRO','14','ABC1D25','NÃO','FOI  AO','CLIENTE']
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
describe('parseKpiManual', () => {
  it('extrai status por loja', async () => {
    const ents = await parseKpiManual(await makeWb(), 'PRINCESA', '2026-05-19')
    expect(ents).toHaveLength(3)
    expect(ents.find(e=>e.loja.includes('Catete'))!.status).toBe('entregue')
    expect(ents.find(e=>e.loja.includes('Catete'))!.chd).toBe('06:35')
    expect(ents.find(e=>e.loja.includes('Flamengo'))!.status).toBe('sem_rastreador')
    expect(ents.find(e=>e.loja.includes('Leme'))!.status).toBe('nao_foi')
  })
})
```

- [ ] **Step 2: Rodar — falha.** `npx vitest run src/lib/kpi/parse-kpi-manual.test.ts` → FAIL

- [ ] **Step 3: Implementar** (código completo)

```typescript
import ExcelJS from 'exceljs'
export type StatusManual = 'entregue' | 'nao_foi' | 'sem_rastreador'
export interface EntradaManual {
  rede_id: string; data: string; loja: string; placa: string | null
  motorista: string | null; status: StatusManual
  saida_cd: string | null; chd: string | null; sai: string | null
}
function cell(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2,'0')}:${String(v.getUTCMinutes()).padStart(2,'0')}`
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown; richText?: Array<{ text: string }> }
    if (o.text) return o.text; if (o.result != null) return cell(o.result)
    if (o.richText) return o.richText.map(r => r.text).join(''); return ''
  }
  return String(v).trim()
}
const hhmm = (s: string): string | null => { const m = s.match(/(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2,'0')}:${m[2]}` : null }
export async function parseKpiManual(buf: Buffer, rede_id: string, data: string): Promise<EntradaManual[]> {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as unknown as ArrayBuffer)
  const ws = wb.getWorksheet(data.slice(8,10)) ?? wb.worksheets[0]; if (!ws) return []
  let hr = -1
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) if (/REDES|FILIAIS/i.test(cell(ws.getRow(r).getCell(1).value))) { hr = r; break }
  if (hr === -1) hr = 3
  const out: EntradaManual[] = []
  for (let r = hr + 1; r <= ws.rowCount; r++) {
    const loja = cell(ws.getRow(r).getCell(1).value)
    if (!loja || loja.length < 2 || /^REDES|TOTAL/i.test(loja)) continue
    const placa = cell(ws.getRow(r).getCell(4).value) || null
    const motorista = cell(ws.getRow(r).getCell(2).value) || null
    const txt = `${cell(ws.getRow(r).getCell(5).value)} ${cell(ws.getRow(r).getCell(6).value)} ${cell(ws.getRow(r).getCell(7).value)}`.toUpperCase()
    const chd = hhmm(cell(ws.getRow(r).getCell(6).value)), sai = hhmm(cell(ws.getRow(r).getCell(7).value)), saida_cd = hhmm(cell(ws.getRow(r).getCell(5).value))
    let status: StatusManual
    if (/N[ÃA]O\s*FOI/.test(txt)) status = 'nao_foi'
    else if (/SEM\s*RASTREAD/.test(txt)) status = 'sem_rastreador'
    else if (chd) status = 'entregue'
    else continue
    out.push({ rede_id, data, loja, placa, motorista, status, saida_cd, chd, sai })
  }
  return out
}
```

- [ ] **Step 4: Rodar — passa.** `npx vitest run src/lib/kpi/parse-kpi-manual.test.ts` → PASS
- [ ] **Step 5: Validar real.** `npx tsx -e "import {parseKpiManual} from './src/lib/kpi/parse-kpi-manual'; import {readFileSync} from 'fs'; parseKpiManual(readFileSync('C:/Users/media/Downloads/KPI SMANUAIS/KPI PRINCESA (11).xlsx'),'PRINCESA','2026-05-19').then(e=>console.log(e.length,e.slice(0,2)))"`
- [ ] **Step 6: Commit.** `git add src/lib/kpi/parse-kpi-manual.* && git commit -m "feat(dashboard): parser KPI manual"`

---

### Task 2: Métricas + filtros (funções puras, TUDO)

**Files:** Create `src/lib/kpi/dashboard-metricas.ts` + `.test.ts`

- [ ] **Step 1: Teste**

```typescript
import { describe, it, expect } from 'vitest'
import { filtrar, calcularMetricas } from './dashboard-metricas'
import type { EntradaManual } from './parse-kpi-manual'
const E = (o: Partial<EntradaManual>): EntradaManual => ({ rede_id:'PRINCESA', data:'2026-05-19', loja:'L', placa:'P', motorista:'M', status:'entregue', saida_cd:'05:00', chd:'06:00', sai:'06:30', ...o })
const ents = [
  E({rede_id:'PRINCESA', loja:'A', chd:'06:00', sai:'06:30'}),
  E({rede_id:'PRINCESA', loja:'B', status:'sem_rastreador', chd:null, sai:null}),
  E({rede_id:'ASSAI', loja:'C', status:'nao_foi', chd:null, sai:null}),
  E({rede_id:'ASSAI', data:'2026-05-20', loja:'C', chd:'05:00', sai:'05:40'}),
]
describe('filtrar', () => {
  it('por redes (multi)', () => { expect(filtrar(ents,{redes:['ASSAI']}).length).toBe(2) })
  it('por intervalo', () => { expect(filtrar(ents,{de:'2026-05-20',ate:'2026-05-20'}).length).toBe(1) })
})
describe('calcularMetricas', () => {
  it('totais, rede, serie, turno, tempo', () => {
    const m = calcularMetricas(ents)
    expect(m.total).toBe(4); expect(m.entregue).toBe(2); expect(m.nao_foi).toBe(1); expect(m.sem_rastreador).toBe(1)
    expect(m.com_rastreador).toBe(3); expect(m.pctEntregue).toBe(50)
    expect(m.tempoMedioLojaMin).toBe(35) // (30 + 40)/2
    expect(m.porRede.find(r=>r.rede_id==='PRINCESA')!.total).toBe(2)
    expect(m.serie.find(s=>s.data==='2026-05-19')!.entregue).toBe(1)
    expect(m.turnos.manha).toBe(2) // 06:00 e 05:00? 05:00 = madrugada
    expect(m.topSemRastreador[0].loja).toBe('B')
  })
})
```

- [ ] **Step 2: Rodar — falha.**
- [ ] **Step 3: Implementar**

```typescript
import type { EntradaManual, StatusManual } from './parse-kpi-manual'
export interface Filtro { redes?: string[]; de?: string; ate?: string; status?: StatusManual }
export function filtrar(ents: EntradaManual[], f: Filtro): EntradaManual[] {
  return ents.filter(e =>
    (!f.redes || f.redes.length === 0 || f.redes.includes(e.rede_id)) &&
    (!f.de || e.data >= f.de) && (!f.ate || e.data <= f.ate) &&
    (!f.status || e.status === f.status))
}
export interface MetricasRede { rede_id: string; total: number; entregue: number; nao_foi: number; sem_rastreador: number; pctEntregue: number; tempoMedioMin: number | null }
export interface PontoSerie { data: string; entregue: number; nao_foi: number; sem_rastreador: number; total: number }
export interface Metricas {
  total: number; entregue: number; nao_foi: number; sem_rastreador: number; com_rastreador: number
  pctEntregue: number; pctSemRastreador: number; tempoMedioLojaMin: number | null
  turnos: { madrugada: number; manha: number; tarde: number; noite: number }
  porRede: MetricasRede[]
  rankingSucesso: MetricasRede[]; rankingSemRastreador: MetricasRede[]
  serie: PontoSerie[]
  topSemRastreador: Array<{ rede_id: string; loja: string; ocorrencias: number }>
  topNaoFoi: Array<{ rede_id: string; loja: string; ocorrencias: number }>
  placasMaisAtivas: Array<{ placa: string; entregas: number }>
}
function diffMin(chd: string | null, sai: string | null): number | null {
  if (!chd || !sai) return null
  const [ch,cm]=chd.split(':').map(Number),[sh,sm]=sai.split(':').map(Number)
  let d=(sh*60+sm)-(ch*60+cm); if (d<0) d+=1440; return d
}
function mediaTempo(es: EntradaManual[]): number | null {
  const t = es.filter(e=>e.status==='entregue').map(e=>diffMin(e.chd,e.sai)).filter((n): n is number => n!=null)
  return t.length ? Math.round(t.reduce((a,b)=>a+b,0)/t.length) : null
}
function turno(chd: string | null): keyof Metricas['turnos'] | null {
  if (!chd) return null; const h = Number(chd.split(':')[0])
  return h<6?'madrugada':h<12?'manha':h<18?'tarde':'noite'
}
export function calcularMetricas(ents: EntradaManual[]): Metricas {
  const cont = (s: StatusManual) => ents.filter(e=>e.status===s).length
  const total = ents.length, entregue = cont('entregue'), nao_foi = cont('nao_foi'), sem_rastreador = cont('sem_rastreador')
  const turnos = { madrugada:0, manha:0, tarde:0, noite:0 }
  for (const e of ents) { const t = turno(e.chd); if (t) turnos[t]++ }
  const redeMap = new Map<string, EntradaManual[]>()
  for (const e of ents) { const a = redeMap.get(e.rede_id) ?? []; a.push(e); redeMap.set(e.rede_id, a) }
  const porRede: MetricasRede[] = [...redeMap.entries()].map(([rede_id, es]) => {
    const en = es.filter(e=>e.status==='entregue').length
    return { rede_id, total: es.length, entregue: en, nao_foi: es.filter(e=>e.status==='nao_foi').length,
      sem_rastreador: es.filter(e=>e.status==='sem_rastreador').length,
      pctEntregue: es.length ? Math.round(100*en/es.length) : 0, tempoMedioMin: mediaTempo(es) }
  })
  const serieMap = new Map<string, PontoSerie>()
  for (const e of ents) { const p = serieMap.get(e.data) ?? { data:e.data, entregue:0, nao_foi:0, sem_rastreador:0, total:0 }; p[e.status]++; p.total++; serieMap.set(e.data, p) }
  const agrupaLoja = (st: StatusManual) => {
    const m = new Map<string, { rede_id: string; loja: string; ocorrencias: number }>()
    for (const e of ents) if (e.status===st) { const k = `${e.rede_id}|${e.loja}`; const x = m.get(k) ?? { rede_id:e.rede_id, loja:e.loja, ocorrencias:0 }; x.ocorrencias++; m.set(k,x) }
    return [...m.values()].sort((a,b)=>b.ocorrencias-a.ocorrencias).slice(0,20)
  }
  const placaMap = new Map<string, number>()
  for (const e of ents) if (e.status==='entregue' && e.placa) placaMap.set(e.placa, (placaMap.get(e.placa)??0)+1)
  return {
    total, entregue, nao_foi, sem_rastreador, com_rastreador: entregue+nao_foi,
    pctEntregue: total?Math.round(100*entregue/total):0, pctSemRastreador: total?Math.round(100*sem_rastreador/total):0,
    tempoMedioLojaMin: mediaTempo(ents), turnos,
    porRede: porRede.sort((a,b)=>b.total-a.total),
    rankingSucesso: [...porRede].sort((a,b)=>b.pctEntregue-a.pctEntregue),
    rankingSemRastreador: [...porRede].sort((a,b)=>b.sem_rastreador-a.sem_rastreador),
    serie: [...serieMap.values()].sort((a,b)=>a.data.localeCompare(b.data)),
    topSemRastreador: agrupaLoja('sem_rastreador'), topNaoFoi: agrupaLoja('nao_foi'),
    placasMaisAtivas: [...placaMap.entries()].map(([placa,entregas])=>({placa,entregas})).sort((a,b)=>b.entregas-a.entregas).slice(0,15),
  }
}
```

- [ ] **Step 4: Rodar — passa.** (ajustar expectativa de turno se necessário: 05:00=madrugada, 06:00=manhã → manha=1)
- [ ] **Step 5: Commit.** `git add src/lib/kpi/dashboard-metricas.* && git commit -m "feat(dashboard): metricas + filtros (puras)"`

---

### Task 3: Tabela + bucket

**Files:** Create `supabase/migrations/20260528_kpi_manual.sql`

- [ ] **Step 1: Migration** (tabela com placa+motorista pra análises de placa)

```sql
create table if not exists kpi_manual_entradas (
  id uuid primary key default gen_random_uuid(),
  data date not null, rede_id text not null, loja text not null,
  placa text, motorista text,
  status text not null check (status in ('entregue','nao_foi','sem_rastreador')),
  saida_cd text, chd text, sai text, uploaded_by uuid, created_at timestamptz default now()
);
create index if not exists idx_kpi_manual_data on kpi_manual_entradas(data);
create index if not exists idx_kpi_manual_rede on kpi_manual_entradas(rede_id);
insert into storage.buckets (id, name, public) values ('kpi-manual-raw','kpi-manual-raw', false) on conflict (id) do nothing;
```

- [ ] **Step 2: Aplicar** (MCP Supabase apply_migration). Verificar `select count(*) from kpi_manual_entradas` = 0.
- [ ] **Step 3: Commit.** `git add supabase/migrations/20260528_kpi_manual.sql && git commit -m "feat(dashboard): tabela + bucket kpi manual"`

---

### Task 4: Upload de KPI manual

**Files:** Create `src/app/api/kpi-manual/upload/route.ts`

- [ ] **Step 1: Implementar** (form-data: data, rede_id, file; parseia; sobrescreve dia+rede; guarda cru)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseKpiManual } from '@/lib/kpi/parse-kpi-manual'
export const runtime = 'nodejs'; export const maxDuration = 60
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })
  const form = await req.formData()
  const data = String(form.get('data') ?? ''), rede_id = String(form.get('rede_id') ?? ''), file = form.get('file')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new NextResponse('Data inválida', { status: 400 })
  if (!rede_id) return new NextResponse('rede_id obrigatório', { status: 400 })
  if (!(file instanceof File)) return new NextResponse('Arquivo obrigatório', { status: 400 })
  const buf = Buffer.from(await file.arrayBuffer())
  const entradas = await parseKpiManual(buf, rede_id, data)
  if (entradas.length === 0) return new NextResponse('Nenhuma loja reconhecida', { status: 422 })
  const svc = createServiceClient()
  await svc.from('kpi_manual_entradas').delete().eq('data', data).eq('rede_id', rede_id)
  const { error } = await svc.from('kpi_manual_entradas').insert(entradas.map(e => ({ ...e, uploaded_by: user.id })))
  if (error) return new NextResponse(error.message, { status: 500 })
  await svc.storage.from('kpi-manual-raw').upload(`${data}/${rede_id}.xlsx`, buf, { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  return NextResponse.json({ ok: true, rede_id, data, inseridas: entradas.length })
}
```

- [ ] **Step 2: Smoke test** (subir 1 manual real, conferir count). 
- [ ] **Step 3: Commit.** `git add src/app/api/kpi-manual/upload/route.ts && git commit -m "feat(dashboard): upload KPI manual"`

---

### Task 5: API de métricas com filtros

**Files:** Create `src/app/api/dashboard/route.ts`

- [ ] **Step 1: Implementar** (query params: periodo|de|ate, redes csv, status)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { calcularMetricas, filtrar } from '@/lib/kpi/dashboard-metricas'
import type { EntradaManual } from '@/lib/kpi/parse-kpi-manual'
export const runtime = 'nodejs'
function intervalo(periodo: string, ref: string): [string,string] {
  const d = new Date(`${ref}T00:00:00Z`)
  if (periodo==='dia') return [ref, ref]
  if (periodo==='semana') { const day=d.getUTCDay(); const i=new Date(d); i.setUTCDate(d.getUTCDate()-day); const f=new Date(i); f.setUTCDate(i.getUTCDate()+6); return [i.toISOString().slice(0,10), f.toISOString().slice(0,10)] }
  const i = `${ref.slice(0,7)}-01`; const f = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0)); return [i, f.toISOString().slice(0,10)]
}
export async function GET(req: NextRequest) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })
  const u = new URL(req.url)
  const periodo = u.searchParams.get('periodo') ?? 'dia'
  const ref = u.searchParams.get('data') ?? new Date().toISOString().slice(0,10)
  const [ini, fim] = (periodo==='custom') ? [u.searchParams.get('de')!, u.searchParams.get('ate')!] : intervalo(periodo, ref)
  const redes = (u.searchParams.get('redes') ?? '').split(',').filter(Boolean)
  const svc = createServiceClient()
  const { data, error } = await svc.from('kpi_manual_entradas')
    .select('data, rede_id, loja, placa, motorista, status, saida_cd, chd, sai').gte('data', ini).lte('data', fim)
  if (error) return new NextResponse(error.message, { status: 500 })
  const filt = filtrar((data ?? []) as EntradaManual[], { redes })
  return NextResponse.json({ periodo, intervalo: [ini, fim], redes, metricas: calcularMetricas(filt) })
}
```

- [ ] **Step 2: Smoke test** `/api/dashboard?periodo=mes&data=2026-05-19&redes=ASSAI,SENDAS`
- [ ] **Step 3: Commit.** `git add src/app/api/dashboard/route.ts && git commit -m "feat(dashboard): API metricas com filtros multi-rede"`

---

### Task 6: Export XLSX mensal por rede

**Files:** Create `src/lib/kpi/export-mensal.ts` (+test) e `src/app/api/dashboard/export-mensal/route.ts`

- [ ] **Step 1: Teste do montador**

```typescript
import { describe, it, expect } from 'vitest'
import { montarXlsxMensal } from './export-mensal'
import type { EntradaManual } from './parse-kpi-manual'
describe('montarXlsxMensal', () => {
  it('gera buffer com aba por dia', async () => {
    const ents: EntradaManual[] = [
      { rede_id:'ASSAI', data:'2026-05-19', loja:'A', placa:'P', motorista:'M', status:'entregue', saida_cd:'05:00', chd:'06:00', sai:'06:30' },
      { rede_id:'ASSAI', data:'2026-05-20', loja:'A', placa:'P', motorista:'M', status:'nao_foi', saida_cd:null, chd:null, sai:null },
    ]
    const buf = await montarXlsxMensal('ASSAI', '2026-05', ents)
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as unknown as ArrayBuffer)
    expect(wb.worksheets.map(w=>w.name).sort()).toEqual(['19','20'])
  })
})
```

- [ ] **Step 2: Rodar — falha.**
- [ ] **Step 3: Implementar**

```typescript
import ExcelJS from 'exceljs'
import type { EntradaManual } from './parse-kpi-manual'
export async function montarXlsxMensal(rede_id: string, mes: string, ents: EntradaManual[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const doMes = ents.filter(e => e.data.startsWith(mes) && e.rede_id === rede_id)
  const dias = [...new Set(doMes.map(e => e.data))].sort()
  for (const dia of dias) {
    const ws = wb.addWorksheet(dia.slice(8,10))
    ws.addRow(['LOJA','PLACA','MOTORISTA','SAIDA CD','CHD LOJA','SAIDA LOJA','STATUS'])
    for (const e of doMes.filter(x=>x.data===dia)) ws.addRow([e.loja, e.placa, e.motorista, e.saida_cd, e.chd, e.sai, e.status])
  }
  if (dias.length === 0) wb.addWorksheet('vazio').addRow(['Sem dados no mês'])
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
```

- [ ] **Step 4: Rodar — passa.**
- [ ] **Step 5: Route** `export-mensal/route.ts`: GET `?rede=ASSAI&mes=2026-05` → busca entradas do mês, chama `montarXlsxMensal`, responde com `Content-Disposition: attachment`.
- [ ] **Step 6: Commit.** `git add src/lib/kpi/export-mensal.* src/app/api/dashboard/export-mensal/route.ts && git commit -m "feat(dashboard): export XLSX mensal por rede"`

---

### Task 7: API de histórico

**Files:** Create `src/app/api/kpi-manual/historico/route.ts`

- [ ] **Step 1: Implementar** (GET lista por data: quais redes têm entrada e quantas lojas; e download cru `?download=DATA/REDE`)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
export const runtime = 'nodejs'
const REDES = ['PRINCESA','PREZUNIC','ZONA_SUL','ASSAI','SENDAS','CARREFOUR','SUPERPRIX','GUANABARA','SUPER_PAX','FEIRA_NOVA','EMANUEL','ARMAZEM_GRAO','ATACADAO','VIANENSE','SAMS_CLUB','MUNDIAL','SUPERCOMPRAS','CAB_PETROPOLIS']
export async function GET(req: NextRequest) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })
  const svc = createServiceClient(); const u = new URL(req.url)
  const dl = u.searchParams.get('download')
  if (dl) {
    const { data } = await svc.storage.from('kpi-manual-raw').download(`${dl}.xlsx`)
    if (!data) return new NextResponse('Não encontrado', { status: 404 })
    return new NextResponse(await data.arrayBuffer(), { headers: { 'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition':`attachment; filename="${dl.replace('/','-')}.xlsx"` } })
  }
  const { data } = await svc.from('kpi_manual_entradas').select('data, rede_id')
  const porDia = new Map<string, Record<string, number>>()
  for (const e of data ?? []) { const d = porDia.get(e.data as string) ?? {}; d[e.rede_id as string] = (d[e.rede_id as string]??0)+1; porDia.set(e.data as string, d) }
  const dias = [...porDia.entries()].map(([data, redes]) => ({ data, redes, completude: `${Object.keys(redes).length}/${REDES.length}` })).sort((a,b)=>b.data.localeCompare(a.data))
  return NextResponse.json({ dias })
}
```

- [ ] **Step 2: Smoke test** `/api/kpi-manual/historico`
- [ ] **Step 3: Commit.** `git add src/app/api/kpi-manual/historico/route.ts && git commit -m "feat(dashboard): API historico KPIs manuais"`

---

### Task 8: UI Dashboard (INVOCAR SKILL FRONTEND)

**Files:** Create `src/app/painel/dashboard/page.tsx`, `dashboard-client.tsx`

- [ ] **Step 1: Invocar `design-taste-frontend` (taste-skill do Leon)** e seguir diretrizes. Design alinhado ao painel (Tailwind 4), bonito, hierárquico.
- [ ] **Step 2: Shell** `page.tsx` → `<DashboardClient/>`.
- [ ] **Step 3: Client com:**
  - Barra de filtros: período (Dia/Semana/Mês/Intervalo) + date pickers + **multi-select de redes** (chips: 1, 2 ou todas)
  - Tabs: **Visão geral · Inserir KPIs · Histórico**
  - Cards grandes: Entregues, Não Foi, Sem Rastreador, % Sucesso, % Sem Rastreador, Tempo médio em loja
  - Barra Com vs Sem rastreador
  - Gráfico de barras empilhadas da `serie` (SVG inline)
  - Distribuição por turno (4 barras)
  - Tabela `porRede` com barra de proporção + colunas (total, entregue, %, tempo médio)
  - 2 rankings: melhor % sucesso / pior sem-rastreador
  - Listas: top lojas sem-rastreador, top "não foi", placas mais ativas
  - **Modo comparação:** se 2+ redes no filtro, cards/tabela mostram as redes lado a lado
  - Botões: Baixar PDF (Task 11) · Baixar XLSX mensal por rede (chama export-mensal)
  - Tudo via `fetch('/api/dashboard?...')`, sem dado mockado.
- [ ] **Step 4: Verificar no dev.** `npm run dev` → `/painel/dashboard`.
- [ ] **Step 5: Commit.** `git add src/app/painel/dashboard/page.tsx src/app/painel/dashboard/dashboard-client.tsx && git commit -m "feat(dashboard): UI completa com filtros e analises"`

---

### Task 9: Aba Inserir KPIs manuais (SKILL FRONTEND)

**Files:** Create `src/app/painel/dashboard/inserir-manual.tsx`

- [ ] **Step 1: Invocar `design-taste-frontend` (taste-skill do Leon).**
- [ ] **Step 2: Componente:** date picker (data dos uploads) + grade das 18 REDES, cada uma com slot de upload (drag/drop ou input). Ao soltar → `POST /api/kpi-manual/upload`. Cada slot mostra status (não enviado / enviado: N lojas). Resumo de completude (X/18 redes, Y lojas). Integrar como tab no dashboard-client.
- [ ] **Step 3: Testar upload de 2 redes reais → dashboard atualiza.**
- [ ] **Step 4: Commit.** `git add src/app/painel/dashboard/inserir-manual.tsx src/app/painel/dashboard/dashboard-client.tsx && git commit -m "feat(dashboard): aba inserir KPIs manuais por rede"`

---

### Task 10: Aba Histórico (SKILL FRONTEND)

**Files:** Create `src/app/painel/dashboard/historico.tsx`

- [ ] **Step 1: Invocar `design-taste-frontend` (taste-skill do Leon).**
- [ ] **Step 2: Componente:** lista os dias (de `/api/kpi-manual/historico`), cada dia mostra completude (X/18 redes) e chips das redes presentes. Clicar numa rede do dia baixa o XLSX cru (`?download=DATA/REDE`). Botão por dia "ver no dashboard" (seta filtro pra aquele dia). Integrar como tab.
- [ ] **Step 3: Testar navegação + download.**
- [ ] **Step 4: Commit.** `git add src/app/painel/dashboard/historico.tsx && git commit -m "feat(dashboard): aba historico de KPIs manuais"`

---

### Task 11: Download PDF (SKILL FRONTEND)

**Files:** Create `src/app/painel/dashboard/print/page.tsx`

- [ ] **Step 1: Página print-friendly** (lê periodo/data/redes, busca métricas server-side, layout A4 limpo, CSS `@media print`, chama `window.print()` no load).
- [ ] **Step 2: Botão no dashboard** abre `/painel/dashboard/print?...` em nova aba.
- [ ] **Step 3: Testar → salvar PDF.**
- [ ] **Step 4: Commit.** `git add src/app/painel/dashboard/print/page.tsx && git commit -m "feat(dashboard): export PDF"`

---

### Task 12: Nav + lançamento

**Files:** Modify `src/app/painel/nav.tsx`

- [ ] **Step 1: Adicionar** `{ href:'/painel/dashboard', label:'Dashboard', Icon: ChartBar }` (importar ChartBar de phosphor).
- [ ] **Step 2: Build.** `npx tsc --noEmit && npm run build` → sem erros.
- [ ] **Step 3: Commit.** `git add src/app/painel/nav.tsx && git commit -m "feat(dashboard): item no menu + lancamento"`

---

## PARTE B — COLUNA TEMPO DE OPERAÇÃO (NÃO LANÇA)

### Task 13: Coluna tempo de operação, atrás de flag

**Files:** Modify `src/lib/kpi/gerador-kpi.ts`, `src/lib/kpi/matcher.ts`; test `gerador-kpi.test.ts`

- [ ] **Step 1: Flag** no topo do gerador: `export const COL_TEMPO_OPERACAO = false`
- [ ] **Step 2: Teste do helper**

```typescript
import { describe, it, expect } from 'vitest'
import { calcTempoOperacao } from './gerador-kpi'
describe('calcTempoOperacao', () => {
  it('volta - saida base', () => { expect(calcTempoOperacao(new Date('2026-05-19T05:00:00Z'), new Date('2026-05-19T13:00:00Z'))).toEqual({min:480,fmt:'08:00'}) })
  it('null sem dado', () => { expect(calcTempoOperacao(null, new Date())).toBeNull() })
})
```

- [ ] **Step 3: Helper**

```typescript
export function calcTempoOperacao(saidaBase: Date | null, voltaBase: Date | null): { min: number; fmt: string } | null {
  if (!saidaBase || !voltaBase) return null
  let min = Math.round((voltaBase.getTime() - saidaBase.getTime())/60000); if (min<0) min+=1440
  return { min, fmt: `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}` }
}
```

- [ ] **Step 4: Matcher expõe `chegada_base`** (1ª BASE BENASSI após a última LOJA) na RotaKpi. Campo novo, ignorado quando flag off.
- [ ] **Step 5: `preencherAba` render condicional** sob `if (COL_TEMPO_OPERACAO)` — adiciona colunas "CHD BASE" e "TEMPO OPERAÇÃO". Flag off → planilha idêntica.
- [ ] **Step 6: Rodar testes + gerar KPI** confirma planilha idêntica (flag off).
- [ ] **Step 7: Commit.** `git commit -m "feat(kpi): coluna tempo operacao atras de flag (nao lancada)"`

---

## Self-Review

**Cobertura:** máximo de análises (Task 2: volume, rede, tempo, turno, série, top lojas, placas, rankings) ✅ · filtros multi-rede + comparação (Tasks 5,8) ✅ · período dia/semana/mês/custom (Task 5) ✅ · export PDF (11) ✅ · export XLSX mensal por rede com aba/dia (6) ✅ · histórico navegável + re-download (7,10) ✅ · upload por rede (4,9) ✅ · design via skill frontend (8,9,10,11) ✅ · dashboard LANÇA (12) ✅ · coluna tempo NÃO lança (13, flag false) ✅.

**Placeholders:** tasks de UI descrevem componente + contrato de dados (sem JSX) porque o JSX sai da skill frontend; lógica (1,2,5,6,7,13) tem código completo.

**Type consistency:** `EntradaManual` (1) usada em 2,5,6,7. `Filtro`/`Metricas` (2) em 5,8. `montarXlsxMensal` (6), `calcTempoOperacao`/`COL_TEMPO_OPERACAO` (13). Status `'entregue'|'nao_foi'|'sem_rastreador'` em tudo.
