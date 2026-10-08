# Auditoria das notas do dia (Ao vivo / KPI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ter uma ferramenta repetível que confere TODA nota do dia (entregue e não entregue) contra o GPS do monitoramento, achar a causa de cada tipo de erro de hoje (08/10) e impedir que volte.

**Architecture:** Uma função pura (`classificarNf`) dá o veredito de cada NF a partir de dados já medidos; um script (`scripts/auditar-dia.ts`) roda no servidor, gera o KPI do dia com o código de produção, mede o GPS por NF direto no banco do monitoramento (fonte independente da Unitrac) e grava um CSV. Depois cada classe de erro vira um bug investigado com `superpowers:systematic-debugging`, com teste de regressão antes da correção.

**Tech Stack:** TypeScript (tsx), Vitest, Postgres do monitoramento (`posicoes_historico`), `gerarKpiNutrimax`.

**Spec:** não há spec; o histórico está em `~/.claude/projects/-Users-joaquimsalles/memory/project_kpi_ao_vivo_e_central.md` (blocos 07/10 e 08/10) e na planilha `~/ClaudeGerado/transmonseg/auditoria-entregas-nutry-2026-10-07.csv`.

## Global Constraints

- Nunca mexer na regra de confirmação sem medir contra os dias 22/09–07/10 e contra `scripts/gabaritos/casos-rotulados.csv` (`python3 scripts/verificar-kpi-gabaritos.py`).
- Parada "fora do bairro do endereço" NÃO é falso positivo por si só (32 clientes repetem o mesmo ponto); só vale prova independente (outro cliente no ponto no mesmo horário, ou GPS que nunca chegou perto).
- Máximo de 3–5 agentes por tarefa; o grosso é script.
- Nenhuma mensagem para Ana/Érica/grupo sem OK do usuário. Nunca ligar o Ollama.
- Deploy do KPI: `bash scripts/deploy-sem-queda.sh` no servidor; espelhar sempre no `KPI TEMP`.
- Contas de teste temporárias sempre apagadas no fim.

## Review Focus

- NF entregue às 09:15 que o caminhão só visitou às 10:36 (horário do vizinho emprestado) — o Ao vivo não pode mostrar antes da hora.
- Carro extra/da mesma equipe que rodou a carga de outro (UNN6G81 × RQV5F67) — o aviso tem que aparecer sozinho.
- Parada da Unitrac que chega atrasada: NF "aguardando" não pode virar "não entregue" nem sumir da conta quando a parada chega.
- Placa sem rastreador (TTL5J17) e serra sem sinal (Macaé): nunca acusar "não foi".
- Arquivo (romaneio/pão) esquecido: poder subir depois e o KPI gerar com ele (a Érica relatou que não conseguiu).

---

### Task 1: Classificador puro de uma NF

**Files:**
- Create: `src/lib/kpi-romaneio/auditoria-nf.ts`
- Test: `src/lib/kpi-romaneio/auditoria-nf.test.ts`

**Interfaces:**
- Produces: `classificarNf(e: EntradaAuditoria): Veredito` e os tipos `EntradaAuditoria`, `Veredito`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { classificarNf, type EntradaAuditoria } from './auditoria-nf'

const base: EntradaAuditoria = { status: 'entregue', emRota: false, gpsMinM: 20, gpsParadoMin: 8, kpiChegadaMin: 600, gpsParadoIniMin: 598 }
const com = (x: Partial<EntradaAuditoria>) => ({ ...base, ...x })

describe('classificarNf', () => {
  it('entregue e o GPS parou no endereco no mesmo horario: OK', () => {
    expect(classificarNf(base)).toBe('OK')
  })
  it('entregue mas o GPS so parou la 70 min depois: horario diverge (TTI6E49 08/10)', () => {
    expect(classificarNf(com({ kpiChegadaMin: 555, gpsParadoIniMin: 626 }))).toBe('HORARIO_DIVERGE')
  })
  it('entregue e o carro nunca chegou a 300 m: suspeita de falso positivo', () => {
    expect(classificarNf(com({ gpsMinM: 2500, gpsParadoMin: 0 }))).toBe('SUSPEITA_FALSO_POSITIVO')
  })
  it('entregue, carro passou a 120 m sem parar: OK (so passou perto)', () => {
    expect(classificarNf(com({ gpsMinM: 120, gpsParadoMin: 0 }))).toBe('OK')
  })
  it('entregue sem nenhum GPS do dia: sem GPS', () => {
    expect(classificarNf(com({ gpsMinM: null, gpsParadoMin: 0, gpsParadoIniMin: null }))).toBe('SEM_GPS')
  })
  it('nao entregue e o GPS parou 12 min no endereco: suspeita de falso negativo', () => {
    expect(classificarNf(com({ status: 'pendente', gpsParadoMin: 12 }))).toBe('SUSPEITA_FALSO_NEGATIVO')
  })
  it('nao entregue, rota andando, GPS ainda nao chegou: em rota', () => {
    expect(classificarNf(com({ status: 'pendente', emRota: true, gpsMinM: 4000, gpsParadoMin: 0 }))).toBe('EM_ROTA')
  })
  it('nao entregue, dia fechado e o GPS nunca parou la: nao entregue ok', () => {
    expect(classificarNf(com({ status: 'pendente', gpsMinM: 4000, gpsParadoMin: 0 }))).toBe('NAO_ENTREGUE_OK')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/kpi-romaneio/auditoria-nf.test.ts`
Expected: FAIL — `Failed to resolve import "./auditoria-nf"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// Veredito de UMA nota, comparando o KPI com o GPS do monitoramento (fonte
// independente da Unitrac). Usado por scripts/auditar-dia.ts (08/10).
export type EntradaAuditoria = {
  status: 'entregue' | 'pendente'
  /** Rota de hoje ainda sem voltar à base. */
  emRota: boolean
  /** Menor distância (m) de qualquer posição do GPS ao endereço no dia; null = sem GPS. */
  gpsMinM: number | null
  /** Minutos parado (<= 3 km/h) a <= 150 m do endereço, somando o dia. */
  gpsParadoMin: number
  /** Chegada que o KPI mostra, em minutos desde 00:00 (null = sem horário). */
  kpiChegadaMin: number | null
  /** Início da 1ª parada do GPS no endereço, em minutos desde 00:00. */
  gpsParadoIniMin: number | null
}
export type Veredito = 'OK' | 'HORARIO_DIVERGE' | 'SUSPEITA_FALSO_POSITIVO' | 'SEM_GPS'
  | 'SUSPEITA_FALSO_NEGATIVO' | 'EM_ROTA' | 'NAO_ENTREGUE_OK'

const PARADO_MIN = 2
const PERTO_M = 300
const HORARIO_TOLERANCIA_MIN = 45

export function classificarNf(e: EntradaAuditoria): Veredito {
  if (e.status === 'pendente') {
    if (e.gpsParadoMin >= 3) return 'SUSPEITA_FALSO_NEGATIVO'
    return e.emRota ? 'EM_ROTA' : 'NAO_ENTREGUE_OK'
  }
  if (e.gpsMinM == null) return 'SEM_GPS'
  if (e.gpsParadoMin >= PARADO_MIN) {
    const diverge = e.kpiChegadaMin != null && e.gpsParadoIniMin != null && Math.abs(e.kpiChegadaMin - e.gpsParadoIniMin) > HORARIO_TOLERANCIA_MIN
    return diverge ? 'HORARIO_DIVERGE' : 'OK'
  }
  return e.gpsMinM > PERTO_M ? 'SUSPEITA_FALSO_POSITIVO' : 'OK'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/kpi-romaneio/auditoria-nf.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi-romaneio/auditoria-nf.ts src/lib/kpi-romaneio/auditoria-nf.test.ts
git commit -m "feat(auditoria): classificarNf -- veredito de uma NF contra o GPS"
```

---

### Task 2: Script que audita um dia inteiro

**Files:**
- Create: `scripts/auditar-dia.ts`

**Interfaces:**
- Consumes: `classificarNf` (Task 1); `gerarKpiNutrimax(entrada, opcoes)` e `entradaDoDia('nutrimax', data)` de `src/lib/kpi-romaneio/`.
- Produces: `/tmp/auditoria-AAAA-MM-DD.csv` (separador `;`) e um resumo por veredito no stdout.

- [ ] **Step 1: Write the script**

```ts
// Uso (no servidor, em /srv/kpi-transmonseg):
//   npx tsx --env-file=.env.production --tsconfig tsconfig.json scripts/auditar-dia.ts 2026-10-08
// So' le. Gera o KPI do dia com o codigo de producao e compara cada NF com o
// GPS do monitoramento (posicoes_historico), fonte independente da Unitrac.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { gerarKpiNutrimax } from '../src/lib/kpi-romaneio/gerar-nutrimax'
import { entradaDoDia } from '../src/lib/kpi-romaneio/ao-vivo-servico'
import { classificarNf, type Veredito } from '../src/lib/kpi-romaneio/auditoria-nf'

const data = process.argv[2]
if (!/^\d{4}-\d{2}-\d{2}$/.test(data ?? '')) throw new Error('uso: auditar-dia.ts AAAA-MM-DD')
const min = (iso: string | null) => (iso ? Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)) : null)

async function main() {
  const entrada = await entradaDoDia('nutrimax', data)
  if (!entrada) throw new Error('sem entrada do dia')
  const coords = new Map<string, { lat: number; lng: number }>()
  const res = await gerarKpiNutrimax(entrada, { aoMontarDetalhe: ({ romaneioGeo }: { romaneioGeo: { nf: string; lat: number | null; lng: number | null }[] }) => {
    for (const l of romaneioGeo) if (l.lat != null && l.lng != null) coords.set(l.nf, { lat: l.lat, lng: l.lng })
  } })
  const alvos = res.detalhe.filter(d => coords.has(d.nf))
  // Uma consulta: para cada NF, minutos parado (<=3 km/h, <=150 m, GPS fresco) e menor distancia.
  const vals = alvos.map(d => `('${d.nf}','${d.placa.slice(0, 3)}-${d.placa.slice(3)}',${coords.get(d.nf)!.lat},${coords.get(d.nf)!.lng})`).join(',')
  const sql = `copy (select v.nf, count(*) filter (where h.velocidade<=3 and coalesce(h.atraso_min,0)<=2 and abs(h.lat-v.lat)<0.0014 and abs(h.lng-v.lng)<0.0014 and 6371000*acos(least(1,cos(radians(v.lat))*cos(radians(h.lat))*cos(radians(h.lng)-radians(v.lng))+sin(radians(v.lat))*sin(radians(h.lat))))<=150) parado_min,
    min(6371000*acos(least(1,cos(radians(v.lat))*cos(radians(h.lat))*cos(radians(h.lng)-radians(v.lng))+sin(radians(v.lat))*sin(radians(h.lat))))) filter (where coalesce(h.atraso_min,0)<=2) min_m,
    min(to_char(h.criado_em at time zone 'America/Sao_Paulo','HH24:MI')) filter (where h.velocidade<=3 and coalesce(h.atraso_min,0)<=2 and abs(h.lat-v.lat)<0.0014 and abs(h.lng-v.lng)<0.0014) ini
    from (values ${vals}) v(nf,placa,lat,lng) join veiculos ve on upper(replace(ve.placa,'-',''))=upper(replace(v.placa,'-',''))
    left join posicoes_historico h on h.veiculo_id=ve.id and h.criado_em >= ('${data}'::date)::timestamp at time zone 'America/Sao_Paulo' and h.criado_em < ('${data}'::date+1)::timestamp at time zone 'America/Sao_Paulo'
    group by v.nf) to stdout with csv`
  const out = execFileSync('sudo', ['-u', 'postgres', 'psql', '-d', 'transmonseg', '-At', '-c', sql], { maxBuffer: 64 * 1024 * 1024 }).toString()
  const gps = new Map(out.trim().split('\n').filter(Boolean).map(l => { const [nf, p, m, i] = l.split(','); return [nf, { parado: Number(p), minM: m === '' ? null : Number(m), ini: i || null }] as const }))
  const linhas: string[] = ['nf;placa;cliente;status;veredito;kpi_chegada;gps_ini;gps_parado_min;gps_min_m;evidencia;observacao']
  const contagem = new Map<Veredito, number>()
  for (const d of alvos) {
    const g = gps.get(d.nf) ?? { parado: 0, minM: null, ini: null }
    const v = classificarNf({
      status: d.status === 'pendente' ? 'pendente' : 'entregue', emRota: (d.observacao ?? '').startsWith('AGUARDANDO'),
      gpsMinM: g.minM, gpsParadoMin: g.parado, kpiChegadaMin: min(d.chegada), gpsParadoIniMin: g.ini ? Number(g.ini.slice(0, 2)) * 60 + Number(g.ini.slice(3)) : null,
    })
    contagem.set(v, (contagem.get(v) ?? 0) + 1)
    linhas.push([d.nf, d.placa, d.clienteNome.replace(/;/g, ','), d.status, v, d.chegada?.slice(11, 16) ?? '', g.ini ?? '', g.parado, g.minM == null ? '' : Math.round(g.minM), d.evidencia, (d.observacao ?? '').replace(/;/g, ',')].join(';'))
  }
  writeFileSync(`/tmp/auditoria-${data}.csv`, '﻿' + linhas.join('\n'))
  console.log(`NFs com coordenada: ${alvos.length} de ${res.detalhe.length}`)
  for (const [v, n] of [...contagem].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(5), v)
}
main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Run on a closed day to calibrate**

Run (servidor): `npx tsx --env-file=.env.production --tsconfig tsconfig.json scripts/auditar-dia.ts 2026-10-07`
Expected: ~2.250 NFs com coordenada; `OK` na casa de 2.000, `SUSPEITA_FALSO_POSITIVO` perto das ~30 conhecidas (comparar com `~/ClaudeGerado/transmonseg/auditoria-entregas-nutry-2026-10-07.csv`). Se `SUSPEITA_FALSO_POSITIVO` passar de ~100, o limiar `PERTO_M` está errado: ajustar com teste antes de seguir.

- [ ] **Step 3: Commit**

```bash
git add scripts/auditar-dia.ts
git commit -m "feat(auditoria): scripts/auditar-dia.ts -- confere cada NF do dia contra o GPS do monitoramento"
```

---

### Task 3: Rodar em hoje e classificar cada erro por causa

**Files:**
- Create: `docs/superpowers/plans/2026-10-08-auditoria-resultado.md` (resultado da execução, texto)

- [ ] **Step 1: Rodar em hoje (08/10), ao fim do dia**

Run (servidor): `npx tsx --env-file=.env.production --tsconfig tsconfig.json scripts/auditar-dia.ts 2026-10-08 && scp transmonseg-vps:/tmp/auditoria-2026-10-08.csv ~/ClaudeGerado/transmonseg/`
Expected: resumo por veredito no terminal e o CSV no Mac.

- [ ] **Step 2: Separar as suspeitas por placa e cliente**

Run: `python3 -c "import csv,collections;r=[x for x in csv.DictReader(open('/Users/joaquimsalles/ClaudeGerado/transmonseg/auditoria-2026-10-08.csv',encoding='utf-8-sig'),delimiter=';') if x['veredito'].startswith('SUSPEITA') or x['veredito']=='HORARIO_DIVERGE'];c=collections.Counter((x['placa'],x['veredito']) for x in r);print(c.most_common(25))"`
Expected: placas com 3+ suspeitas são o primeiro foco (troca de carro, rastreador, cadastro).

- [ ] **Step 3: Para cada placa/cliente suspeito, classificar a causa (máx. 5 agentes, um por CLASSE, não por placa)**

Classes: (a) carro trocado/mesmo motorista; (b) cadastro Unitrac ou geocode errado (mesmo ponto em vários dias); (c) horário emprestado do vizinho; (d) parada da Unitrac atrasada; (e) sem rastreador/sem sinal. Cada classe vira uma seção do arquivo de resultado com: NFs, evidência, causa, e se já está corrigida (referenciar commit: `02bf8d3` horário do vizinho, `735b104` aviso de troca, `81c8fdb` campo manual).

- [ ] **Step 4: Commit o resultado**

```bash
git add docs/superpowers/plans/2026-10-08-auditoria-resultado.md
git commit -m "docs(auditoria): resultado da auditoria de 08/10 por classe de erro"
```

---

### Task 4: Corrigir cada classe ainda aberta (TDD, uma por vez)

**Files:**
- Modify: o arquivo da regra da classe (vem da Task 3; candidatos: `src/lib/kpi-romaneio/agregacao.ts`, `src/lib/kpi-romaneio/sugerir-trocas.ts`, `src/lib/kpi-romaneio/locais-clientes.ts`)
- Test: o `.test.ts` ao lado

- [ ] **Step 1: Escrever o teste que reproduz o caso real da classe (com os números reais do CSV)**

Modelo: copiar o formato de `describe('rota em andamento: horario do vizinho ...', ...)` em `src/lib/kpi-romaneio/agregacao.test.ts` (08/10), trocando placa, coordenadas e distâncias pelas do caso.

- [ ] **Step 2: Rodar e ver falhar pelo motivo certo**

Run: `npx vitest run <arquivo>.test.ts -t "<nome do teste>"`
Expected: FAIL na asserção (não erro de import). Se passar de cara, o teste não reproduz o caso: ler o dado real de novo (aconteceu com o caso I B Refeições em 08/10).

- [ ] **Step 3: Correção mínima, seguindo `superpowers:systematic-debugging` (causa raiz, não sintoma)**

- [ ] **Step 4: Medir o efeito em 14 dias antes de subir**

Run (servidor, cópia isolada em `/tmp/kpi-novo`, como feito em 08/10): gerar 22/09–08/10 com o código novo e comparar status NF a NF com produção. Aceitar só se nenhuma NF entregue real virar pendente e o gabarito (`python3 scripts/verificar-kpi-gabaritos.py`) seguir sem falha nova.

- [ ] **Step 5: Suíte, commit, espelho no KPI TEMP e deploy**

Run: `npx vitest run && git add -A src && git commit -m "fix(...): ..." && bash scripts/deploy-sem-queda.sh` (no servidor)
Expected: todos os testes passam; `DEPLOY OK`.

---

### Task 5: Arquivo esquecido (romaneio/pão) não dá pra subir depois

**Files:**
- Investigar: `src/app/painel/ao-vivo/page.tsx` (seção "Trocar o romaneio de hoje"), `src/app/api/kpi/ao-vivo/` (rotas de envio), `src/lib/kpi-romaneio/ao-vivo-servico.ts`

- [ ] **Step 1: Ler as mensagens exatas da Érica (08/10 08:19–08:23: "Se esquecer de colocar um arquivo, não consegue depois" e "Fui aqui e coloquei, não gerou") e o vídeo `v1.mp4` (TUM1C79).**

Run: `ssh -i ~/.ssh/notebook_contabo_key root@185.193.66.240 "bash /tmp/wa.sh msgs 178048003502249@lid 2026-10-08T08:00"`

- [ ] **Step 2: Reproduzir com conta QA de operador (apagar no fim)**

Subir só o romaneio, depois subir o pão no mesmo dia pelo botão "Trocar romaneio", e ver se o Ao vivo recalcula com os dois. Registrar o que acontece (erro, tela, log `pm2 logs kpi-transmonseg`).

- [ ] **Step 3: Teste que reproduz + correção (mesmo fluxo da Task 4, Steps 1–5).**

---

## Self-Review

- Cobertura: erros de hoje → horário do vizinho (Task 4 + commit `02bf8d3`), troca de carro (`735b104`, `81c8fdb`), cadastro/geocode (Task 3 classe b), parada atrasada (classe d), sem rastreador (classe e), arquivo esquecido (Task 5).
- Placeholders: a Task 4 depende do resultado da Task 3 por natureza (investigação); os passos são concretos e o modelo de teste aponta para um teste real do repositório.
- Tipos: `EntradaAuditoria`, `Veredito` e `classificarNf` têm o mesmo nome na Task 1 e na Task 2.
