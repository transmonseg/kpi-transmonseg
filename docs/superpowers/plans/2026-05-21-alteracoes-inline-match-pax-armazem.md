# Alterações Inline + Match Multi-Dia — Plano de Implementação

> **Para workers agentic:** SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar este plano tarefa por tarefa. Steps usam checkbox (`- [ ]`) para tracking.

**Goal:** Subir o match do KPI de ~50% para ~75-80% e converter o fluxo de alterações para inline-only (sem banco), até **25/05/2026**.

**Architecture:**
- **Alterações inline-only**: estado React em `/painel/kpi/simples` → body do POST → `aplicaAlteracoes()` em memória → KPI. Sem persistência.
- **Match melhorado**: corrigir 2 bugs (tokensCore parênteses, Hungarian retangular) + adicionar 7 melhorias estruturais (suffix-match com prefixo, cross-docking, aliases inter-rede, rede-aware no assign, etc.).
- Mudanças de matcher rodam de baixo risco pra alto, com testes antes.

**Diagnóstico (3 dias analisados):**

| Dia | Linhas | %Match atual | Unmatched-com-GPS |
|----:|-------:|-------------:|------------------:|
| 18  | 243    | 50%          | 87                |
| 19  | 292    | 50,7%        | 103               |
| 20  | 246    | 61%          | 36                |

**Tech Stack:** Next.js (App Router), TypeScript, Supabase (só storage), ExcelJS, React 19, Vitest.

---

## File Structure

**Modify:**
- `src/app/api/kpi/simples/route.ts` — remover busca de alterações do banco
- `src/app/painel/kpi/simples/page.tsx` — modo Manual + Upload .txt no `AlteracoesCard`
- `src/lib/kpi/matcher.ts` — 9 melhorias (Tasks 5-13)
- `src/lib/kpi/matcher.test.ts` — testes das novas regras

**Delete:**
- `src/app/painel/alteracoes/` (pasta inteira)
- `src/app/api/alteracoes/aplicar-lote/`, `[id]/`, `route.ts`, `upload/`, `parsear/`
- `src/lib/kpi/merge-alteracoes.ts` + teste

**Migration (DB):**
- Novos registros em `lojas` para códigos `9039XXX` (Zona Sul), `5353XXX` (Armazém Grão), Assaí Ceasa, Carrefour Campos/Macaé, Superprix Cosmos (Task 14)

---

## Sequência de execução (4 fases, 4 dias) — MATCHER PRIMEIRO

**Dia 1 (22/05):** Tasks 5-8 (quick wins matcher) — bugs críticos e relaxamentos pontuais. Entrega ganho mensurável já no fim do dia.
**Dia 2 (23/05):** Tasks 9-13 (matcher estrutural) — cross-docking, rede-aware, aliases.
**Dia 3 (24/05):** Task 14 (DB popular lojas) + smoke parcial dos 3 dias com KPI já melhorado, alterações via texto WhatsApp.
**Dia 4 (25/05):** Tasks 1-4 (alterações inline UI) + smoke test E2E final.

**Cada task segue protocolo de 3 verificações:** 1 agente analista pré-implementação + implementação + 3 agentes reviewers pós (código, testes, regressão).

---

### Task 1: Remover busca de alterações do banco no `/api/kpi/simples`

**Files:**
- Modify: `src/app/api/kpi/simples/route.ts:255-284`

- [ ] **Step 1: Substituir bloco de busca/merge do banco**

Trocar linhas 255-284 (do comentário `// Carrega alterações persistidas no banco...` até o fim do `console.log`) por:

```typescript
  // Alterações: só as inline do request (estado da UI). Sem banco.
  if (alteracoes.length > 0) {
    escalaLinhas = aplicaAlteracoes([...escalaLinhas], alteracoes)
    console.log(`[/api/kpi/simples] Aplicando ${alteracoes.length} alterações inline`)
  }
```

- [ ] **Step 2: Remover import órfão**

No topo do arquivo, remover `import { mergeAlteracoes } from '@/lib/kpi/merge-alteracoes'`.

- [ ] **Step 3: Build check**

Run: `npx tsc --noEmit`. Esperado: zero erros relacionados.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/kpi/simples/route.ts
git commit -m "feat(kpi): remove db-backed alteracoes; inline-only flow"
```

---

### Task 2: Deletar páginas e endpoints do fluxo banco-de-alterações

- [ ] **Step 1: Confirmar zero referências externas a `merge-alteracoes`**

Run: `rg "merge-alteracoes" src/`. Esperado: zero matches.

- [ ] **Step 2: Verificar dependências de `/api/alteracoes/parsear-v2`**

Run: `rg "alteracoes/parsear-v2" src/`. Se não houver consumidor ativo (após delete da pasta `/painel/alteracoes/`), deletar também.

- [ ] **Step 3: Deletar**

```bash
rm -rf src/app/painel/alteracoes
rm -rf src/app/api/alteracoes/aplicar-lote
rm -rf src/app/api/alteracoes/[id]
rm src/app/api/alteracoes/route.ts
rm -rf src/app/api/alteracoes/upload
rm -rf src/app/api/alteracoes/parsear
rm src/lib/kpi/merge-alteracoes.ts src/lib/kpi/merge-alteracoes.test.ts
```

Se a pasta `src/app/api/alteracoes/` ficar vazia, remover.

- [ ] **Step 4: Remover link do nav**

Run: `rg "alteracoes/nova" src/app/painel/`. Editar `nav.tsx` (ou similar) removendo a entrada.

- [ ] **Step 5: Build + commit**

```bash
npx tsc --noEmit && npx next build
git add -A
git commit -m "chore: remove unused alteracoes db pages and endpoints"
```

---

### Task 3: Modo "Manual" no AlteracoesCard

**Files:**
- Modify: `src/app/painel/kpi/simples/page.tsx`

O `AlteracoesCard` tem modos `'texto'` e `'pdf'`. Adicionar `'manual'`.

- [ ] **Step 1: Atualizar tipo do modo + estados**

Localizar `const [modo, setModo] = useState<'texto' | 'pdf'>('texto')` (linha ~122) e mudar para:

```typescript
const [modo, setModo] = useState<'texto' | 'pdf' | 'manual'>('texto')
const [manualTipo, setManualTipo] = useState<AlteracaoParsed['tipo']>('SUBSTITUICAO')
const [manualRede, setManualRede] = useState<string>('')
const [manualLoja, setManualLoja] = useState<string>('')
const [manualSaiPlaca, setManualSaiPlaca] = useState<string>('')
const [manualSaiMotorista, setManualSaiMotorista] = useState<string>('')
const [manualEntraPlaca, setManualEntraPlaca] = useState<string>('')
const [manualEntraMotorista, setManualEntraMotorista] = useState<string>('')
const [manualEntraCodigo, setManualEntraCodigo] = useState<string>('')
const [manualMotivo, setManualMotivo] = useState<string>('')
```

- [ ] **Step 2: Funções auxiliares**

Dentro do `AlteracoesCard`, depois das declarações de estado:

```typescript
function resetManual() {
  setManualRede(''); setManualLoja(''); setManualSaiPlaca(''); setManualSaiMotorista('')
  setManualEntraPlaca(''); setManualEntraMotorista(''); setManualEntraCodigo(''); setManualMotivo('')
}

function normalizaPlaca(p: string): string {
  return p.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
}

function adicionarManual() {
  const placaSaiNorm = manualSaiPlaca ? normalizaPlaca(manualSaiPlaca) : null
  const placaEntraNorm = manualEntraPlaca ? normalizaPlaca(manualEntraPlaca) : null
  const motoristaSai = manualSaiMotorista.trim() || null
  const motoristaEntra = manualEntraMotorista.trim() || null
  const codigoEntra = manualEntraCodigo.trim() ? Number(manualEntraCodigo.trim()) : null

  if (!placaEntraNorm && !motoristaEntra) {
    setErr('Preencha ao menos placa OU motorista no campo "Entra".')
    return
  }

  const alt: AlteracaoParsed = {
    tipo: manualTipo,
    rede_id: manualRede || null,
    loja_nome_raw: manualLoja.trim() || null,
    entra: (placaEntraNorm || motoristaEntra) ? {
      motorista_nome: motoristaEntra,
      motorista_codigo: codigoEntra && !isNaN(codigoEntra) ? codigoEntra : null,
      placa_raw: placaEntraNorm,
      placa_norm: placaEntraNorm,
    } : null,
    sai: (placaSaiNorm || motoristaSai) ? {
      motorista_nome: motoristaSai,
      motorista_codigo: null,
      placa_raw: placaSaiNorm,
      placa_norm: placaSaiNorm,
    } : null,
    motivo: manualMotivo.trim() || null,
    texto_original: `[MANUAL] ${manualTipo} ${manualRede || ''} ${manualLoja || ''}`.trim(),
    confianca: 'alta',
  }
  onConfirm(alt)
  resetManual()
  setErr(null)
}
```

- [ ] **Step 3: Adicionar constante `REDES_OPCOES` no topo do arquivo**

Depois dos types, antes do `AlteracoesCard`:

```typescript
const REDES_OPCOES = [
  'ASSAI', 'ATACADAO', 'CARREFOUR', 'MUNDIAL', 'PREZUNIC', 'PRINCESA',
  'SAMS_CLUB', 'SENDAS', 'SUPERPRIX', 'VIANENSE', 'CAB_PETROPOLIS',
  'ZONA_SUL', 'SUPER_PAX', 'FEIRA_NOVA', 'EMANUEL', 'ARMAZEM_GRAO', 'GUANABARA',
] as const
```

- [ ] **Step 4: Adicionar 'manual' no seletor de modo**

Trocar `(['texto', 'pdf'] as const).map(...)` por `(['texto', 'pdf', 'manual'] as const).map(...)` e ajustar label inline para:

```tsx
{m === 'texto' ? 'Mensagem de texto' : m === 'pdf' ? 'PDF' : 'Manual (campos)'}
```

- [ ] **Step 5: Adicionar o bloco do formulário**

Depois do bloco `{modo === 'pdf' && (...)}`:

```tsx
{modo === 'manual' && (
  <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase font-semibold text-[var(--color-fg-subtle)]">Tipo</span>
        <select
          value={manualTipo}
          onChange={e => setManualTipo(e.target.value as AlteracaoParsed['tipo'])}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-2 py-1.5 text-xs"
        >
          <option value="SUBSTITUICAO">Substituição</option>
          <option value="INCLUSAO">Inclusão</option>
          <option value="SWAP">Swap (só troca placa)</option>
          <option value="COMUNICADO">Comunicado</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase font-semibold text-[var(--color-fg-subtle)]">Rede</span>
        <select
          value={manualRede}
          onChange={e => setManualRede(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-2 py-1.5 text-xs"
        >
          <option value="">(sem rede)</option>
          {REDES_OPCOES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
    </div>

    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase font-semibold text-[var(--color-fg-subtle)]">Loja / Filial (opcional)</span>
      <Input value={manualLoja} onChange={e => setManualLoja(e.target.value)} placeholder="Ex: Assaí Bangu I Loja 55, Filial 23" className="text-xs" />
    </label>

    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-danger-soft)]/30 p-2 space-y-2">
      <span className="text-[10px] uppercase font-semibold text-[var(--color-danger)]">Sai (opcional)</span>
      <div className="grid grid-cols-2 gap-2">
        <Input value={manualSaiPlaca} onChange={e => setManualSaiPlaca(e.target.value.toUpperCase())} placeholder="Placa que sai" className="text-xs font-mono" maxLength={8} />
        <Input value={manualSaiMotorista} onChange={e => setManualSaiMotorista(e.target.value)} placeholder="Motorista que sai" className="text-xs" />
      </div>
    </div>

    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-success-soft)]/30 p-2 space-y-2">
      <span className="text-[10px] uppercase font-semibold text-[var(--color-success)]">Entra (pelo menos placa OU motorista)</span>
      <div className="grid grid-cols-2 gap-2">
        <Input value={manualEntraPlaca} onChange={e => setManualEntraPlaca(e.target.value.toUpperCase())} placeholder="Placa que entra" className="text-xs font-mono" maxLength={8} />
        <Input value={manualEntraMotorista} onChange={e => setManualEntraMotorista(e.target.value)} placeholder="Motorista que entra" className="text-xs" />
      </div>
      <Input value={manualEntraCodigo} onChange={e => setManualEntraCodigo(e.target.value.replace(/[^\d]/g, ''))} placeholder="Código do motorista (opcional)" className="text-xs" inputMode="numeric" />
    </div>

    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase font-semibold text-[var(--color-fg-subtle)]">Motivo (opcional)</span>
      <Input value={manualMotivo} onChange={e => setManualMotivo(e.target.value)} placeholder="Ex: carro sem chave, motorista faltou" className="text-xs" />
    </label>

    <Button size="sm" onClick={adicionarManual}>Adicionar alteração</Button>
  </div>
)}
```

- [ ] **Step 6: Build + smoke test no browser**

Run: `npx tsc --noEmit && npm run dev`. Abrir `/painel/kpi/simples`, expandir card, clicar "Manual", preencher, "Adicionar".

- [ ] **Step 7: Commit**

```bash
git add src/app/painel/kpi/simples/page.tsx
git commit -m "feat(kpi-ui): manual alteracao form with structured fields"
```

---

### Task 4: Upload de arquivo .txt

**Files:**
- Modify: `src/app/painel/kpi/simples/page.tsx`

- [ ] **Step 1: Atualizar tipo do modo**

Trocar para: `useState<'texto' | 'pdf' | 'manual' | 'txt'>('texto')`.

- [ ] **Step 2: Adicionar função `analisarTxt`**

Dentro do `AlteracoesCard`, depois de `analisarPdf`:

```typescript
function analisarTxt(file: File) {
  resetPreviews()
  startAnalisar(async () => {
    try {
      const conteudo = await file.text()
      const res = await fetch('/api/kpi/simples/analisar-alt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: conteudo }),
      })
      if (!res.ok) throw new Error(await res.text())
      setPreviews(await res.json() as AlteracaoParsed[])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao ler .txt.')
    }
  })
}
```

- [ ] **Step 3: Adicionar 'txt' no seletor + label**

```tsx
{(['texto', 'txt', 'pdf', 'manual'] as const).map(m => (
  // ...
  {m === 'texto' ? 'Mensagem de texto'
   : m === 'txt' ? 'Arquivo .txt'
   : m === 'pdf' ? 'PDF'
   : 'Manual (campos)'}
```

- [ ] **Step 4: Bloco do upload .txt**

Depois do bloco `{modo === 'pdf' && ...}`:

```tsx
{modo === 'txt' && (
  <div className="space-y-2">
    <Input type="file" accept=".txt" onChange={e => {
      const f = e.target.files?.[0]
      if (f) analisarTxt(f)
    }} />
    <p className="text-[10px] text-[var(--color-fg-muted)]">
      Mesma estrutura da mensagem de WhatsApp. O sistema lê o arquivo e identifica as alterações.
    </p>
    {analisando && <p className="text-xs text-[var(--color-fg-muted)]">Lendo arquivo…</p>}
  </div>
)}
```

- [ ] **Step 5: Smoke test e commit**

```bash
git add src/app/painel/kpi/simples/page.tsx
git commit -m "feat(kpi-ui): .txt upload mode for alteracoes"
```

---

### Task 5: Fix `tokensCore` — não apagar conteúdo de parênteses (CRÍTICO)

**Bug:** `replace(/\([^)]*\)/g, ' ')` em `matcher.ts:32` apaga TODO conteúdo de parênteses. Para `ARMAZÉM DO GRÃO (ITAIPAVA)`, o discriminador `ITAIPAVA` está dentro do parêntese — vira `{}` e nunca casa com Unitrac `ARMAZEM DO GRÃO (ITAIPAVA)`.

**Files:**
- Modify: `src/lib/kpi/matcher.ts:30-33`
- Modify: `src/lib/kpi/matcher.test.ts`

- [ ] **Step 1: Escrever teste falhando**

Em `matcher.test.ts`, adicionar:

```typescript
describe('tokensCore não apaga conteúdo de parênteses não-Entrega', () => {
  it('preserva ITAIPAVA em "ARMAZÉM DO GRÃO (ITAIPAVA)"', () => {
    const score = scorePair(
      { id: 'e1', rede_id: 'ARMAZEM_GRAO', placa_norm: 'AAA0000', loja_nome_raw: 'ARMAZÉM DO GRÃO (ITAIPAVA)', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'p1', placa_norm: 'AAA0000', chegada: '2026-05-19T10:00:00Z', saida: null, duracao_seg: null, local_parada: 'ARMAZEM DO GRAO (ITAIPAVA)', codigo_loja: '5353003', nome_loja: 'ARMAZEM DO GRAO (ITAIPAVA)', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    )
    expect(score).toBeLessThan(Infinity)
  })

  it('continua removendo (1ª Entrega) e (2° Entrega)', () => {
    const score = scorePair(
      { id: 'e1', rede_id: 'PRINCESA', placa_norm: 'AAA0000', loja_nome_raw: 'Princesa Buzios (2ª Entrega)', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'p1', placa_norm: 'AAA0000', chegada: '2026-05-19T10:00:00Z', saida: null, duracao_seg: null, local_parada: 'PRINCESA BUZIOS', codigo_loja: '8590563', nome_loja: 'PRINCESA BUZIOS', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    )
    expect(score).toBeLessThan(Infinity)
  })
})
```

Run: `npx vitest run src/lib/kpi/matcher.test.ts`. Esperado: 1º teste falha.

- [ ] **Step 2: Aplicar fix no `tokensCore`**

Em `src/lib/kpi/matcher.ts:30-33`, trocar:

```typescript
  const norm = primeiraParada.toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\d+\s*[ªº°AO]?\s*ENTREGA/gi, ' ')
```

Por:

```typescript
  const norm = primeiraParada.toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    // Remove só parênteses com marcadores de ordem (N ENTREGA, N°, ENTREGA EXTRA)
    .replace(/\(\s*\d+\s*[ªº°AO]?\s*ENTREGAS?\s*\)/gi, ' ')
    .replace(/\(\s*ENTREGAS?\s+EXTRA\s*\)/gi, ' ')
    // Pra demais parênteses, manter o conteúdo (discriminador de loja) — só remove os símbolos
    .replace(/[()]/g, ' ')
    .replace(/\d+\s*[ªº°AO]?\s*ENTREGA/gi, ' ')
```

- [ ] **Step 3: Rodar testes**

Run: `npx vitest run src/lib/kpi/matcher.test.ts`. Esperado: ambos passam + nenhum teste anterior quebrou.

Run completo: `npx vitest run`. Esperado: tudo verde.

- [ ] **Step 4: Commit**

```bash
git add src/lib/kpi/matcher.ts src/lib/kpi/matcher.test.ts
git commit -m "fix(matcher): preserve store discriminator inside parentheses"
```

---

### Task 6 — NO-OP (bug não existia)

Validador independente confirmou que `src/lib/utils/hungarian.ts` JÁ trata matriz retangular nativamente (padding interno com LARGE=1e15, reconstrução filtra `col < m`). Teste sintético com 6 linhas (3 Princesa + 3 cross-rede) vs 3 paradas casou as 3 Princesas corretamente. O problema real do dia 19 (Princesa Búzios UNMATCHED) deve estar em Task 11 (rede-aware) ou no parsing concatenado por vírgula do Unitrac. **Pular Task 6.**

### Task 6 (original, mantido por histórico): Fix Hungarian em matriz retangular (`nL > nP`)

**Bug:** Em `matcher.ts:404-413`, quando `nL > nP`, `hungarianMin` retorna assignment onde linhas extras podem receber `pi` cuja `rawScores[li][pi] === Infinity`, sobrescrevendo matches válidos.

**Files:**
- Modify: `src/lib/kpi/matcher.ts:397-413`
- Modify: `src/lib/kpi/matcher.test.ts`

- [ ] **Step 1: Teste falhando — 6 linhas (3 Princesa válidas + 3 cross-rede inválidas) vs 3 paradas Princesa**

```typescript
describe('Hungarian retangular nL > nP', () => {
  it('atribui paradas só para linhas com score finito', async () => {
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'p1', rede_id: 'PRINCESA', placa_norm: 'QST4C52', loja_nome_raw: 'Princesa Buzios 1', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'p2', rede_id: 'PRINCESA', placa_norm: 'QST4C52', loja_nome_raw: 'Princesa Buzios 2', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-19' },
      { id: 'p3', rede_id: 'PRINCESA', placa_norm: 'QST4C52', loja_nome_raw: 'Princesa Buzios 3', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 3, data_entrega: '2026-05-19' },
      { id: 'a1', rede_id: 'ARMAZEM_GRAO', placa_norm: 'QST4C52', loja_nome_raw: 'Mosela', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'a2', rede_id: 'ARMAZEM_GRAO', placa_norm: 'QST4C52', loja_nome_raw: 'Quitandinha', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-19' },
      { id: 'a3', rede_id: 'ARMAZEM_GRAO', placa_norm: 'QST4C52', loja_nome_raw: 'Valparaiso', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 3, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'pp1', placa_norm: 'QST4C52', chegada: '2026-05-19T08:00:00Z', saida: '2026-05-19T09:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA - BUZIOS 1', codigo_loja: '8590563', nome_loja: 'PRINCESA - BUZIOS 1', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
      { id: 'pp2', placa_norm: 'QST4C52', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA - BUZIOS 2', codigo_loja: '8590564', nome_loja: 'PRINCESA - BUZIOS 2', lat: null, lng: null, classificacao: 'LOJA', ordem: 2 },
      { id: 'pp3', placa_norm: 'QST4C52', chegada: '2026-05-19T12:00:00Z', saida: '2026-05-19T13:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA - BUZIOS 3', codigo_loja: '8590571', nome_loja: 'PRINCESA - BUZIOS 3', lat: null, lng: null, classificacao: 'LOJA', ordem: 3 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, [])
    const matchedPrincesa = rotas.filter(r => r.escala_linha_id.startsWith('p') && r.paradas.length > 0)
    expect(matchedPrincesa).toHaveLength(3) // Todas as 3 Princesa precisam casar
  })
})
```

Run: `npx vitest run src/lib/kpi/matcher.test.ts`. Esperado: falha.

- [ ] **Step 2: Fix no `assignOptimal`**

Em `src/lib/kpi/matcher.ts`, localizar o bloco `else { // Hungarian (Jonker-Volgenant)...` (linha ~397) e substituir todo o bloco `else` por:

```typescript
  } else {
    // Hungarian para nL > 5. Pra matrizes retangulares (nL > nP), pad com colunas
    // dummy de INF — assignment[li] pode receber dummy_pi >= nP, que descartamos
    // (linha fica unmatched). Isso garante que pi inválidos (Infinity) NÃO
    // sobrescrevam matches válidos quando o algoritmo balanceia linhas extras.
    const rawScores = ls.map(l => ps.map(p => scorePair(l, p)))
    const dim = Math.max(nL, nP)
    const mat: number[][] = []
    for (let li = 0; li < dim; li++) {
      const row: number[] = []
      for (let pi = 0; pi < dim; pi++) {
        if (li < nL && pi < nP) {
          row.push(rawScores[li][pi] === Infinity ? INF : rawScores[li][pi])
        } else {
          row.push(INF) // dummy padding
        }
      }
      mat.push(row)
    }
    const assignment = hungarianMin(mat)
    for (let li = 0; li < nL; li++) {
      const pi = assignment[li]
      // Aceita só se pi for válido (não-dummy) E o score original for finito
      if (pi >= 0 && pi < nP && rawScores[li][pi] < Infinity) {
        result.set(ls[li].id, ps[pi])
      }
    }
  }
```

- [ ] **Step 3: Rodar testes**

Run: `npx vitest run`. Esperado: novo teste passa + nenhuma regressão.

- [ ] **Step 4: Commit**

```bash
git add src/lib/kpi/matcher.ts src/lib/kpi/matcher.test.ts
git commit -m "fix(matcher): hungarian rectangular nL>nP no longer overrides valid matches"
```

---

### Task 7: Suffix-match com `length ≥ 2` para prefixos de rede conhecidos

**Files:**
- Modify: `src/lib/kpi/matcher.ts:287-298` (scorePair)
- Modify: `src/lib/kpi/matcher.test.ts`

Zona Sul Loja 21 (codL="21", length 2) hoje não casa com Unitrac `9039021` (suffix-match exige `length≥3`). Relaxar para `≥2` quando o codP começa com prefixo de rede conhecido (`9039` ZS, `3030` Superprix, `560` Sendas, `7000` Prezunic, `8590` Princesa, `5353` Armazém Grão).

- [ ] **Step 1: Adicionar constante no topo do arquivo**

Depois das constantes `REDES_TOKEN`/`STOPWORDS`:

```typescript
// Prefixos numéricos conhecidos do Unitrac por rede. Quando o codigo_loja
// começa com um destes, suffix-match aceita codigo_raw de length>=2.
const REDE_PREFIX_RE = /^(9039|3030|7000|8590|5353|560|11623|202|110)/
```

- [ ] **Step 2: Teste**

```typescript
describe('suffix-match para códigos curtos prefixados', () => {
  it('casa Loja 21 com 9039021', () => {
    const score = scorePair(
      { id: 'e', rede_id: 'ZONA_SUL', placa_norm: 'A', loja_nome_raw: 'Zona Sul Loja 21', loja_codigo_raw: '21', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'p', placa_norm: 'A', chegada: '2026-05-19T10:00:00Z', saida: null, duracao_seg: null, local_parada: '21 - ZONA SUL', codigo_loja: '9039021', nome_loja: '21 - ZONA SUL', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    )
    expect(score).toBe(0)
  })

  it('NÃO casa Loja 21 com 99000021 (prefixo desconhecido)', () => {
    const score = scorePair(
      { id: 'e', rede_id: 'OUTRA', placa_norm: 'A', loja_nome_raw: 'Loja 21', loja_codigo_raw: '21', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'p', placa_norm: 'A', chegada: '2026-05-19T10:00:00Z', saida: null, duracao_seg: null, local_parada: 'X', codigo_loja: '99000021', nome_loja: 'X', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    )
    expect(score).toBe(Infinity)
  })
})
```

- [ ] **Step 3: Fix no `scorePair`**

Localizar (linha ~289-298):

```typescript
  if (line.loja_codigo_raw && p.codigo_loja) {
    const codL = line.loja_codigo_raw
    const codP = p.codigo_loja
    if (codL === codP) s = 0
    else if (codL.length >= 3 && codP.endsWith(codL)) s = 0
    else if (codP.length >= 3 && codL.endsWith(codP)) s = 0
  }
```

Trocar por:

```typescript
  if (line.loja_codigo_raw && p.codigo_loja) {
    const codL = line.loja_codigo_raw
    const codP = p.codigo_loja
    const codPHasKnownPrefix = REDE_PREFIX_RE.test(codP)
    if (codL === codP) s = 0
    else if (codL.length >= 3 && codP.endsWith(codL)) s = 0
    else if (codP.length >= 3 && codL.endsWith(codP)) s = 0
    // Relaxa pra length>=2 quando codP tem prefixo de rede conhecido —
    // Zona Sul Loja 21 → 9039021, Superprix 14 → 3030014, etc.
    else if (codL.length >= 2 && codPHasKnownPrefix && codP.endsWith(codL.padStart(3, '0'))) s = 0
    else if (codL.length >= 2 && codPHasKnownPrefix && codP.endsWith(codL)) s = 0
  }
```

- [ ] **Step 4: Testes + commit**

```bash
npx vitest run
git add src/lib/kpi/matcher.ts src/lib/kpi/matcher.test.ts
git commit -m "feat(matcher): relax suffix-match for known network prefixes"
```

---

### Task 8: Fallback 1:1 → N:N para placa com `linhas.length === paradas.length`

**Files:**
- Modify: `src/lib/kpi/matcher.ts` (depois do bloco "Fallback parada compartilhada", linha ~647)
- Modify: `src/lib/kpi/matcher.test.ts`

- [ ] **Step 1: Teste**

```typescript
describe('fallback N:N quando linhas.length === paradas.length', () => {
  it('matcha 2 linhas Armazém com 2 paradas LOJA sem código', async () => {
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'e1', rede_id: 'ARMAZEM_GRAO', placa_norm: 'KPT5B20', loja_nome_raw: 'Boa Vista', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'e2', rede_id: 'ARMAZEM_GRAO', placa_norm: 'KPT5B20', loja_nome_raw: 'Matriz Posse', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p1', placa_norm: 'KPT5B20', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'GEOFENCE A', codigo_loja: '5353010', nome_loja: 'GEOFENCE A', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
      { id: 'p2', placa_norm: 'KPT5B20', chegada: '2026-05-19T12:00:00Z', saida: '2026-05-19T13:00:00Z', duracao_seg: 3600, local_parada: 'GEOFENCE B', codigo_loja: '5353011', nome_loja: 'GEOFENCE B', lat: null, lng: null, classificacao: 'LOJA', ordem: 2 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, [])
    const matched = rotas.filter(r => r.paradas.length > 0)
    expect(matched).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Implementar**

Depois do bloco "parada compartilhada" (linha ~647, antes do `}` que fecha o `for (const [placa, linhas] of escalaByPlaca)`), adicionar:

```typescript
    // Fallback N:N por placa: quando o nº de linhas sem match === nº de paradas LOJA
    // livres, atribui por ordem temporal (paradas) com ordem da escala (carro_ordem).
    // Cobre PAX/Armazém sem código onde os nomes divergem mas a estrutura bate.
    const linhasFinalSem = linhas.filter(l => !matchByEscalaId.has(l.id))
    const paradasLojaLivres = lojasParadas.filter(p => !usados.has(p.id))
    if (linhasFinalSem.length > 0 && linhasFinalSem.length === paradasLojaLivres.length) {
      const linhasOrdenadas = [...linhasFinalSem].sort((a, b) => a.carro_ordem - b.carro_ordem)
      const paradasOrdenadas = [...paradasLojaLivres].sort(
        (a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime()
      )
      for (let i = 0; i < linhasOrdenadas.length; i++) {
        matchByEscalaId.set(linhasOrdenadas[i].id, paradasOrdenadas[i])
        usados.add(paradasOrdenadas[i].id)
      }
    }
```

- [ ] **Step 3: Verificar que isso substitui o fallback "linhasOrdenadas.length === 1"**

O fallback antigo (linha 556) é caso particular de N=1. Manter ambos por enquanto — o N:N só ativa quando exatamente igual.

- [ ] **Step 4: Testes + commit**

```bash
npx vitest run
git add src/lib/kpi/matcher.ts src/lib/kpi/matcher.test.ts
git commit -m "feat(matcher): N:N fallback when lines and parades have same count"
```

---

### Task 9: Cross-docking detection no fallback "parada compartilhada"

**Files:**
- Modify: `src/lib/kpi/matcher.ts:617-646`
- Modify: `src/lib/kpi/matcher.test.ts`

Quando uma placa carrega 2+ redes (caminhão Princesa também leva Armazém Grão), distribuir paradas LOJA entre linhas das redes secundárias **mesmo quando nenhuma da rede secundária casou**.

- [ ] **Step 1: Teste**

```typescript
describe('cross-docking — Princesa carregando Armazém Grão', () => {
  it('distribui paradas Princesa para linhas Armazém Grão', async () => {
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'pr1', rede_id: 'PRINCESA', placa_norm: 'QST', loja_nome_raw: 'Princesa Buzios 1', loja_codigo_raw: '1', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
      { id: 'ag1', rede_id: 'ARMAZEM_GRAO', placa_norm: 'QST', loja_nome_raw: 'Mosela', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p1', placa_norm: 'QST', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'PRINCESA - BUZIOS 1', codigo_loja: '8590563', nome_loja: 'PRINCESA - BUZIOS 1', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const lojas: LojaRow[] = [
      { id: 'l1', rede_id: 'PRINCESA', nome: 'Buzios 1', nome_normalizado: 'buzios 1', codigo_escala: '1', codigo_unitrac: '8590563', nome_unitrac: 'PRINCESA - BUZIOS 1', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    expect(rotas.find(r => r.escala_linha_id === 'pr1')?.paradas).toHaveLength(1)
    expect(rotas.find(r => r.escala_linha_id === 'ag1')?.paradas).toHaveLength(1) // Cross-dock
  })
})
```

- [ ] **Step 2: Modificar o fallback "parada compartilhada"**

Localizar o bloco `// Fallback "parada compartilhada"` (linha ~617). Substituir o bloco inteiro:

```typescript
    // Fallback "parada compartilhada" / cross-docking: detecta quando a placa carrega
    // múltiplas redes (caminhão Princesa também leva Armazém Grão). Distribui
    // paradas LOJA da rede dominante para linhas das redes secundárias.
    const redesNaPlaca = new Set(linhas.map(l => l.rede_id))
    const linhasRestantes = linhas.filter(l => !matchByEscalaId.has(l.id))
    if (linhasRestantes.length > 0) {
      // Paradas LOJA já atribuídas (cross-dock pode reusar)
      const paradasUsadasNaPlaca: UnitracParadaRow[] = []
      for (const l of linhas) {
        const m = matchByEscalaId.get(l.id)
        if (m && m.classificacao === 'LOJA') paradasUsadasNaPlaca.push(m)
      }

      for (const linha of linhasRestantes) {
        // Caso 1 (original): parada compartilhada da MESMA rede
        const compartilhada = paradasUsadasNaPlaca.find(p => {
          if (!p.codigo_loja && !p.nome_loja) return false
          const lojasDaRede = lojas.filter(l => l.rede_id === linha.rede_id)
          if (p.codigo_loja && lojasDaRede.some(l => l.codigo_unitrac === p.codigo_loja)) return true
          if (p.nome_loja) {
            const np = p.nome_loja.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            if (lojasDaRede.some(l => l.nome_unitrac?.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === np)) return true
          }
          if (scorePair(linha, p) < Infinity) return true
          return false
        })
        if (compartilhada) {
          matchByEscalaId.set(linha.id, compartilhada)
          continue
        }

        // Caso 2 (NOVO): cross-docking. Placa tem 2+ redes na escala E pelo menos
        // 1 parada LOJA dessa placa já casou em outra rede → atribui essa parada
        // pra linha da rede secundária por ordem temporal de carro_ordem.
        if (redesNaPlaca.size >= 2 && paradasUsadasNaPlaca.length > 0) {
          // Pega a parada que aconteceu mais próxima do carro_ordem dessa linha
          const linhasMesmaRede = linhasRestantes.filter(l => l.rede_id === linha.rede_id)
          const idxNaRede = linhasMesmaRede.findIndex(l => l.id === linha.id)
          const paradaSel = paradasUsadasNaPlaca[Math.min(idxNaRede, paradasUsadasNaPlaca.length - 1)]
          if (paradaSel) matchByEscalaId.set(linha.id, paradaSel)
        }
      }
    }
```

- [ ] **Step 3: Testes + commit**

```bash
npx vitest run
git add src/lib/kpi/matcher.ts src/lib/kpi/matcher.test.ts
git commit -m "feat(matcher): cross-docking — distribute parades across secondary networks"
```

---

### Task 10: Aliases inter-rede SENDAS↔ASSAI

**Files:**
- Modify: `src/lib/kpi/matcher.ts`
- Modify: `src/lib/kpi/matcher.test.ts`

Lojas Sendas que viraram Assaí no rebrand GPA. Hoje `paradaRedes` mapeia parada `560022 - SENDAS ALCANTARA` para `{SENDAS}` — escala ASSAI Alcântara é bloqueada. Tratar `{ASSAI, SENDAS}` como conjunto fungível.

- [ ] **Step 1: Adicionar `REDE_ALIASES` no topo**

Depois das constantes:

```typescript
// Redes que compartilham infraestrutura/identidade (mesmo grupo GPA).
// Match cross-rede entre essas é aceito sem penalty.
const REDE_ALIASES: Record<string, string[]> = {
  ASSAI: ['SENDAS'],
  SENDAS: ['ASSAI'],
  SUPER_PAX: ['PAX'],
  PAX: ['SUPER_PAX'],
}

function redesFungiveis(rede: string): Set<string> {
  return new Set([rede, ...(REDE_ALIASES[rede] ?? [])])
}
```

- [ ] **Step 2: Teste**

```typescript
describe('aliases SENDAS↔ASSAI', () => {
  it('aceita parada SENDAS para escala ASSAI', async () => {
    const escalaLinhas: EscalaLinhaRow[] = [
      { id: 'e', rede_id: 'ASSAI', placa_norm: 'A', loja_nome_raw: 'Assaí Alcantara', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    ]
    const paradaRows: UnitracParadaRow[] = [
      { id: 'p', placa_norm: 'A', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'SENDAS ALCANTARA', codigo_loja: '560022', nome_loja: 'SENDAS ALCANTARA', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
    ]
    const lojas: LojaRow[] = [
      { id: 'l', rede_id: 'SENDAS', nome: 'Sendas Alcantara', nome_normalizado: 'sendas alcantara', codigo_escala: null, codigo_unitrac: '560022', nome_unitrac: 'SENDAS ALCANTARA', lat: null, lng: null, raio_metros: 150 },
    ]
    const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
    expect(rotas[0].paradas).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Usar `redesFungiveis` no `paradaRedes`**

Em `matcher.ts`, no loop de `paradaRedes` (linha ~517-525):

```typescript
      const paradaRedes = new Map<string, Set<string>>()
      for (const p of paradasOrdenadas) {
        const redes = new Set<string>()
        for (const r of redesPresentes) {
          if (resolveLojaId(p, lojas, r)) redes.add(r)
        }
        // Expande aliases: parada SENDAS conta também como ASSAI e vice-versa
        const expanded = new Set<string>()
        for (const r of redes) {
          for (const alias of redesFungiveis(r)) expanded.add(alias)
        }
        paradaRedes.set(p.id, expanded)
      }
```

Idem no bloco "parada compartilhada" (Task 9): trocar `lojasDaRede` por `lojas.filter(l => redesFungiveis(linha.rede_id).has(l.rede_id))`.

- [ ] **Step 4: Testes + commit**

```bash
npx vitest run
git add src/lib/kpi/matcher.ts src/lib/kpi/matcher.test.ts
git commit -m "feat(matcher): rede aliases SENDAS↔ASSAI, PAX↔SUPER_PAX"
```

---

### Task 11: Rede-aware no `assignOptimal` (Hungarian + brute-force)

**Files:**
- Modify: `src/lib/kpi/matcher.ts:332`
- Modify: `src/lib/kpi/matcher.test.ts`

Hoje só o fallback temporal bloqueia mistura cross-rede. O `assignOptimal` principal ignora rede — Hungarian pode atribuir parada VIANENSE pra linha SENDAS por score igual via Levenshtein.

- [ ] **Step 1: Mudar assinatura de `assignOptimal` para receber `paradaRedes`**

```typescript
function assignOptimal(
  linhas: EscalaLinhaRow[],
  paradas: UnitracParadaRow[],
  paradaRedes?: Map<string, Set<string>>,
): Map<string, UnitracParadaRow> {
```

- [ ] **Step 2: Aplicar penalty no score quando rede divergir**

Dentro de `assignOptimal`, ao construir `rawScores`/`mat`, somar `+0.5` quando `paradaRedes` tem rede definida E não contém a `linha.rede_id`:

```typescript
function scoreComRede(l: EscalaLinhaRow, p: UnitracParadaRow): number {
  const base = scorePair(l, p)
  if (base === Infinity) return Infinity
  if (paradaRedes) {
    const redes = paradaRedes.get(p.id)
    if (redes && redes.size > 0 && !redesFungiveis(l.rede_id).has(...redes)) {
      // Rede divergente conhecida: penalty grande mas não Infinity (permite
      // fallback temporal aceitar quando não há outra opção).
      return base + 0.5
    }
  }
  return base
}
```

Substituir `scorePair(l, p)` por `scoreComRede(l, p)` nas três ocorrências dentro de `assignOptimal` (brute-force e Hungarian).

- [ ] **Step 3: Computar `paradaRedes` ANTES do `assignOptimal` no loop principal**

Mover o cálculo de `paradaRedes` (atualmente dentro do fallback temporal, linha ~517) pra ANTES de `assignOptimal`:

```typescript
    const redesPresentes = [...new Set(lojas.map(l => l.rede_id))]
    const paradaRedes = new Map<string, Set<string>>()
    for (const p of lojasParadas) {
      const redes = new Set<string>()
      for (const r of redesPresentes) {
        if (resolveLojaId(p, lojas, r)) redes.add(r)
      }
      const expanded = new Set<string>()
      for (const r of redes) {
        for (const alias of redesFungiveis(r)) expanded.add(alias)
      }
      paradaRedes.set(p.id, expanded)
    }

    const assigned = assignOptimal(linhas, lojasParadas, paradaRedes)
```

E remover o cálculo duplicado dentro do fallback temporal.

- [ ] **Step 4: Teste cross-rede**

```typescript
it('penaliza match cross-rede no assignOptimal', async () => {
  const escalaLinhas: EscalaLinhaRow[] = [
    { id: 'v1', rede_id: 'VIANENSE', placa_norm: 'LTH4J15', loja_nome_raw: 'Vianense Jardim Alvorada', loja_codigo_raw: '32', motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-20' },
    { id: 's1', rede_id: 'SENDAS', placa_norm: 'LTH4J15', loja_nome_raw: 'Sendas Barra Tower', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 2, data_entrega: '2026-05-20' },
  ]
  const paradaRows: UnitracParadaRow[] = [
    { id: 'p_se', placa_norm: 'LTH4J15', chegada: '2026-05-20T10:00:00Z', saida: '2026-05-20T11:00:00Z', duracao_seg: 3600, local_parada: 'SENDAS BARRA TOWER', codigo_loja: '560100', nome_loja: 'SENDAS BARRA TOWER', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
  ]
  const lojas: LojaRow[] = [
    { id: 'lse', rede_id: 'SENDAS', nome: 'Sendas Barra Tower', nome_normalizado: 'sendas barra tower', codigo_escala: null, codigo_unitrac: '560100', nome_unitrac: 'SENDAS BARRA TOWER', lat: null, lng: null, raio_metros: 150 },
  ]
  const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
  // A parada SENDAS deve ir pra linha SENDAS, não pra VIANENSE
  expect(rotas.find(r => r.escala_linha_id === 's1')?.paradas).toHaveLength(1)
  expect(rotas.find(r => r.escala_linha_id === 'v1')?.paradas).toHaveLength(0)
})
```

- [ ] **Step 5: Testes + commit**

```bash
npx vitest run
git add src/lib/kpi/matcher.ts src/lib/kpi/matcher.test.ts
git commit -m "feat(matcher): rede-aware assignOptimal prevents cross-network mismatch"
```

---

### Task 12: Restringir fallback "1 linha sozinha" (`matcher.ts:556`)

**Files:**
- Modify: `src/lib/kpi/matcher.ts:556`

Hoje, quando há 1 linha sem match, o fallback aceita qualquer parada não-bloqueada por rede. Isso gerou falso-positivo "Armazém Grão Barra → Zona Sul Laranjeiras" no dia 19.

- [ ] **Step 1: Mudar condição**

Localizar o bloco (linha ~556):

```typescript
          if (linhasOrdenadas.length === 1 && (redes.has(linha.rede_id) || redes.size === 0)) {
            melhorIdx = j
            break
          }
```

Substituir por:

```typescript
          // Só aceita parada não-identificada (redes.size === 0) — nunca atribui
          // parada de OUTRA rede mesmo quando vazio. Evita falso-positivo Armazém→Zona Sul.
          if (linhasOrdenadas.length === 1 && redes.size === 0) {
            melhorIdx = j
            break
          }
```

- [ ] **Step 2: Teste de regressão**

```typescript
it('NÃO atribui parada de rede divergente quando há 1 linha sozinha', async () => {
  const escalaLinhas: EscalaLinhaRow[] = [
    { id: 'a', rede_id: 'ARMAZEM_GRAO', placa_norm: 'X', loja_nome_raw: 'Armazem Barra', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
  ]
  const paradaRows: UnitracParadaRow[] = [
    { id: 'p', placa_norm: 'X', chegada: '2026-05-19T10:00:00Z', saida: '2026-05-19T11:00:00Z', duracao_seg: 3600, local_parada: 'ZONA SUL LARANJEIRAS', codigo_loja: '9039030', nome_loja: '30 - ZONA SUL - LARANJEIRAS', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
  ]
  const lojas: LojaRow[] = [
    { id: 'lzs', rede_id: 'ZONA_SUL', nome: 'Laranjeiras', nome_normalizado: 'laranjeiras', codigo_escala: '30', codigo_unitrac: '9039030', nome_unitrac: '30 - ZONA SUL - LARANJEIRAS', lat: null, lng: null, raio_metros: 150 },
  ]
  const rotas = await cruzaEscalaUnitrac(escalaLinhas, paradaRows, lojas)
  expect(rotas[0].paradas).toHaveLength(0) // Não atribui parada Zona Sul à Armazém Grão
})
```

- [ ] **Step 3: Commit**

```bash
npx vitest run
git add src/lib/kpi/matcher.ts src/lib/kpi/matcher.test.ts
git commit -m "fix(matcher): restrict 1-line fallback to unidentified paradas only"
```

---

### Task 13: Split `local_parada` sem exigir prefixo numérico

**Files:**
- Modify: `src/lib/kpi/matcher.ts:307-310`
- Modify: `src/lib/kpi/matcher.test.ts`

Hoje o fallback `local_parada.split(',')` só aceita partes com regex `^(\d{4,})\s*-\s*(.+)`. Partes puras como `REGINA 1 DE MAIO` (sem código) são ignoradas. Permitir match por nome direto.

- [ ] **Step 1: Teste**

```typescript
it('faz match em parte secundária do local_parada sem prefixo numérico', () => {
  const score = scorePair(
    { id: 'e', rede_id: 'ARMAZEM_GRAO', placa_norm: 'A', loja_nome_raw: 'REGINA 1 DE MAIO', loja_codigo_raw: null, motorista_nome: null, carro_ordem: 1, data_entrega: '2026-05-19' },
    { id: 'p', placa_norm: 'A', chegada: '2026-05-19T10:00:00Z', saida: null, duracao_seg: null, local_parada: 'REGINA BARRA DO IMBUY, REGINA 1 DE MAIO', codigo_loja: '5353012', nome_loja: 'REGINA BARRA DO IMBUY', lat: null, lng: null, classificacao: 'LOJA', ordem: 1 },
  )
  expect(score).toBeLessThan(Infinity)
})
```

- [ ] **Step 2: Modificar bloco do split**

Localizar (linha ~304-321):

```typescript
  if (s > 0 && p.local_parada) {
    const partes = p.local_parada.split(',').map(t => t.trim())
    for (const parte of partes) {
      const m = parte.match(/^(\d{4,})\s*-\s*(.+)/)
      if (!m) continue
      const codP2 = m[1]
      const nomePart = m[2].trim()
      if (line.loja_codigo_raw) {
        const codL = line.loja_codigo_raw
        if (codL === codP2 || (codL.length >= 3 && codP2.endsWith(codL)) || (codP2.length >= 3 && codL.endsWith(codP2))) {
          s = 0
          break
        }
      }
      const nomeScore = matchScore(line.loja_nome_raw, nomePart)
      if (nomeScore < s) s = nomeScore
    }
  }
```

Trocar por:

```typescript
  if (s > 0 && p.local_parada) {
    const partes = p.local_parada.split(',').map(t => t.trim()).filter(Boolean)
    for (const parte of partes) {
      const m = parte.match(/^(\d{4,})\s*-\s*(.+)/)
      // Parte com prefixo "XXXX - NOME"
      if (m) {
        const codP2 = m[1]
        const nomePart = m[2].trim()
        if (line.loja_codigo_raw) {
          const codL = line.loja_codigo_raw
          if (codL === codP2 || (codL.length >= 3 && codP2.endsWith(codL)) || (codP2.length >= 3 && codL.endsWith(codP2))) {
            s = 0
            break
          }
        }
        const nomeScore = matchScore(line.loja_nome_raw, nomePart)
        if (nomeScore < s) s = nomeScore
      } else {
        // Parte sem prefixo numérico (ex: "REGINA 1 DE MAIO") — match direto por nome
        const nomeScore = matchScore(line.loja_nome_raw, parte)
        if (nomeScore < s) s = nomeScore
      }
    }
  }
```

- [ ] **Step 3: Testes + commit**

```bash
npx vitest run
git add src/lib/kpi/matcher.ts src/lib/kpi/matcher.test.ts
git commit -m "feat(matcher): match local_parada parts without numeric prefix"
```

---

### Task 14: Popular `lojas` com códigos/coordenadas faltantes

**Files:**
- Create: `supabase/migrations/2026-05-25-popular-lojas-faltantes.sql` (ou manualmente via dashboard)

**Estimativa:** 15-20 linhas/dia ganhas. Trabalho de banco, sem código.

- [ ] **Step 1: Extrair códigos do Unitrac dos 3 dias**

Run no Supabase SQL editor:

```sql
SELECT DISTINCT
  codigo_loja,
  nome_loja,
  count(*) as ocorrencias
FROM unitrac_paradas
WHERE data_referencia BETWEEN '2026-05-18' AND '2026-05-20'
  AND classificacao = 'LOJA'
  AND codigo_loja IS NOT NULL
GROUP BY codigo_loja, nome_loja
ORDER BY ocorrencias DESC;
```

Anotar todos que NÃO estão em `lojas.codigo_unitrac`.

- [ ] **Step 2: Cadastrar lojas faltantes**

Para cada código novo, criar registro em `lojas` com:
- `rede_id` inferido do prefixo (9039→ZONA_SUL, 5353→ARMAZEM_GRAO, 560→SENDAS, etc.)
- `nome` e `nome_unitrac` do Unitrac
- `codigo_escala` = sufixo numérico esperado (ex: 9039021 → "21")
- `codigo_unitrac` = código completo
- `ativo` = true
- `lat`, `lng` (geocoding manual se possível, senão null)

Casos específicos identificados pelos agentes:
- Zona Sul Loja 22, 28, 29, 31, 47, 09
- Armazém Grão 5353xxx (todos vistos no Unitrac)
- Assaí Ceasa (Loja 42) — coordenadas para geo-fallback
- Carrefour Campos dos Goytacazes, Carrefour Macaé
- Supercompras Cosmos (Superprix)

- [ ] **Step 3: Smoke test**

Regerar KPI dia 18, 19, 20 e verificar que cobertura subiu.

- [ ] **Step 4: Commit das migrations (se houver)**

```bash
git add supabase/migrations/
git commit -m "data: populate missing store records for Zona Sul, Armazem Grao, Assai Ceasa"
```

---

### Task 15: Smoke test E2E dia 18, 19, 20

- [ ] **Step 1: Regerar KPI dia 18**

Subir `ESCALA DIA 18/*.xlsx` + Unitrac. Adicionar alterações via UI manual ou .txt. Gerar.

**Esperado:** cobertura geral > 70% (vs 50% atual).

- [ ] **Step 2: Regerar KPI dia 19**

Subir `ESCALA DIA 19/*.xlsx` + Guanabara PDF + Unitrac + alterações do dia 19 (Felipe Diego UBO-5E01 Barra I, Paulo Henrique DBB-8D19 Alcântara I, etc.). Gerar.

**Esperado:** cobertura > 70% (vs 50,7%).

- [ ] **Step 3: Regerar KPI dia 20**

Subir `ESCALA DIA 20/*` + Unitrac + alteração (UBO 5E01 ↔ UBO 0B68 carro sem chave). Gerar.

**Esperado:** cobertura > 75% (vs 61%).

- [ ] **Step 4: Commit final**

```bash
git commit --allow-empty -m "milestone: match >70% nos 3 dias auditados"
```

---

## Notas

- **Risco de regressão:** Tasks 6 (Hungarian retangular), 9 (cross-docking) e 11 (rede-aware) mexem no core. Os testes adicionados cobrem os cenários principais, mas dia 18-20 é o smoke test real.
- **Task 14 é manual e bloqueia ganho final.** Sem coordenadas, geo-fallback não ativa.
- **Princesa 79% no dia 20** já é boa baseline — focar em ZONA_SUL, ARMAZEM_GRAO, ASSAI.
- **VIANENSE 0%** no dia 20 é caso operacional: caminhão não passou pelos geofences. Sem solução técnica.
