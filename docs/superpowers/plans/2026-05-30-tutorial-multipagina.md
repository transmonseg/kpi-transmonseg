# Tutorial Guiado Multi-Página Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps em checkbox.

**Goal:** Um tutorial guiado que NAVEGA sozinho pelo sistema (Dashboard → Inserir KPIs → Gerar KPI escala+Unitrac → Loja → Relatório), passo a passo, com animação, persistindo o progresso entre as navegações.

**Architecture:** Um `TourRunner` montado no `PainelShell` (layout que NÃO re-monta ao navegar entre páginas de `/painel/*`, então mantém o estado do tour vivo). Um store pub/sub (`useSyncExternalStore`) guarda `{ ativo, cap }`. Os "capítulos" são definidos por tela (href + aba + steps); o runner, a cada mudança de `cap`/rota, ou navega pra tela do capítulo (`router.push`) ou roda o `driver.js` daquela tela. O último passo de cada capítulo avança o `cap`. A aba do dashboard passa a ser controlada por `?tab=` na URL pra o tour poder trocá-la.

**Tech Stack:** Next.js 16 App Router, React 19 (`useSyncExternalStore`), driver.js v1.x (instalado), Tailwind v4, design navy.

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---------|------|------------------|
| `src/lib/tour/store.ts` | Criar | pub/sub `{ ativo, cap }` + `iniciarTutorial()` + `tourJaVisto()` |
| `src/lib/tour/store.test.ts` | Criar | TDD do store |
| `src/lib/tour/capitulos.ts` | Criar | capítulos (href, tab, steps driver.js) |
| `src/app/painel/tour-runner.tsx` | Criar | runner: navega entre capítulos + roda driver.js + anima |
| `src/app/painel/painel-shell.tsx` | Modificar | montar `<TourRunner />` |
| `src/app/painel/page.tsx` | Modificar | passar `tabInicial` de `searchParams` |
| `src/app/painel/dashboard/dashboard-client.tsx` | Modificar | aba via `?tab=` (URL) + remover tour antigo + data-tour |
| `src/app/painel/dashboard/inserir-manual.tsx` | Modificar | `data-tour` nos elementos |
| `src/app/painel/kpi/simples/page.tsx` | Modificar | `data-tour` nos elementos |
| `src/app/globals.css` | Modificar | pulse no highlight do driver.js |
| `src/app/painel/dashboard/tour.ts` | Deletar | substituído pelo multi-página |

---

## Task 1: Store do tour (TDD)

**Files:** `src/lib/tour/store.ts`, `src/lib/tour/store.test.ts`

- [ ] **Step 1: Teste que falha** — `src/lib/tour/store.test.ts`
```ts
import { describe, it, expect, vi } from 'vitest'
import { getTour, setTour, subTour, iniciarTutorial } from './store'

describe('tour store', () => {
  it('começa inativo no capítulo 0', () => {
    expect(getTour()).toEqual({ ativo: false, cap: 0 })
  })
  it('iniciarTutorial ativa no capítulo 0 e notifica', () => {
    const fn = vi.fn()
    const unsub = subTour(fn)
    setTour({ ativo: false, cap: 5 })
    iniciarTutorial()
    expect(getTour()).toEqual({ ativo: true, cap: 0 })
    expect(fn).toHaveBeenCalled()
    unsub()
  })
  it('setTour faz merge parcial', () => {
    setTour({ ativo: true, cap: 0 })
    setTour({ cap: 2 })
    expect(getTour()).toEqual({ ativo: true, cap: 2 })
  })
})
```
Rodar `npx vitest run src/lib/tour/store.test.ts` → FAIL.

- [ ] **Step 2: Implementar** `src/lib/tour/store.ts`
```ts
export interface TourState { ativo: boolean; cap: number }

let estado: TourState = { ativo: false, cap: 0 }
const listeners = new Set<() => void>()

export function getTour(): TourState { return estado }
export function setTour(next: Partial<TourState>): void {
  estado = { ...estado, ...next }
  listeners.forEach(l => l())
}
export function subTour(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
export function iniciarTutorial(): void { setTour({ ativo: true, cap: 0 }) }
export function encerrarTutorial(): void {
  setTour({ ativo: false, cap: 0 })
  try { localStorage.setItem('kpi-tutorial-v2', 'done') } catch { /* ignore */ }
}
export function tourJaVisto(): boolean {
  try { return !!localStorage.getItem('kpi-tutorial-v2') } catch { return true }
}
```

- [ ] **Step 3:** `npx vitest run src/lib/tour/store.test.ts` → PASS. **Step 4:** `npx tsc --noEmit`. **Step 5:** Commit `feat(tutorial): store pub/sub do tour multi-pagina`.

---

## Task 2: Aba do dashboard via URL (?tab=)

**Files:** `src/app/painel/page.tsx`, `src/app/painel/dashboard/dashboard-client.tsx`

Necessário pro tour trocar de aba navegando. A aba deixa de ser `useState` e passa a vir de `?tab=`.

- [ ] **Step 1:** Em `page.tsx`, ler searchParams e passar `tabInicial`:
```tsx
export default async function PainelHome({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams
  const resumo = await fetchResumo()
  return <DashboardClient resumo={resumo} tabInicial={sp.tab === 'inserir' || sp.tab === 'historico' ? sp.tab : 'geral'} />
}
```

- [ ] **Step 2:** Em `dashboard-client.tsx`, trocar o estado da aba por URL:
  - Importar `useRouter, useSearchParams` de `next/navigation`.
  - Receber `tabInicial: Tab` na prop.
  - Substituir `const [tab, setTab] = useState<Tab>('geral')` por:
```tsx
  const router = useRouter()
  const sp = useSearchParams()
  const tab = (sp.get('tab') as Tab) || tabInicial
  const setTab = (t: Tab) => router.replace(t === 'geral' ? '/painel' : `/painel?tab=${t}`, { scroll: false })
```
  - Ajustar `onAbrirDia` do Historico que faz `setTab('geral')` — continua chamando `setTab('geral')` (agora navega). O `setData`/`setPeriodo` continuam useState normais.
  - DashboardClient signature: `{ resumo, tabInicial = 'geral' }: { resumo?: ResumoOperacaoData; tabInicial?: Tab }`.

- [ ] **Step 3:** `npx tsc --noEmit && npx vitest run && npm run build` — verde. Testar manualmente que `/painel?tab=inserir` abre na aba certa (descrever, não automatizar). **Step 4:** Commit `refactor(dashboard): aba controlada por ?tab= na URL (pro tour navegar)`.

---

## Task 3: Capítulos do tutorial

**Files:** `src/lib/tour/capitulos.ts`

Cada capítulo: a tela onde roda (`href` + `tab`), e os `steps` do driver.js. O último step de cada capítulo NÃO define navegação aqui — o runner cuida (Task 4).

- [ ] **Step 1:** Criar `src/lib/tour/capitulos.ts`:
```ts
import type { DriveStep } from 'driver.js'

export interface Capitulo {
  href: string            // pra onde navegar quando este capítulo começa
  tab?: 'geral' | 'inserir' | 'historico'  // aba esperada (só /painel)
  pathname: string        // pathname que identifica a tela (sem query)
  steps: DriveStep[]
}

const p = (title: string, description: string, side: DriveStep['popover'] extends infer P ? P extends { side?: infer S } ? S : never : never = 'bottom'): DriveStep['popover'] =>
  ({ title, description, side, align: 'start' })

export const CAPITULOS: Capitulo[] = [
  // 0 — Dashboard / visão geral
  {
    href: '/painel', tab: 'geral', pathname: '/painel',
    steps: [
      { element: '[data-tour="titulo"]', popover: p('Bem-vindo!', 'Vou te levar pelo sistema inteiro em 1 minuto: ver os números, subir e gerar os KPIs. Pode fechar no X quando quiser.') },
      { element: '[data-tour="periodo"]', popover: p('1. Escolha o período', 'Dia, semana, mês ou ano. Tudo no dashboard se ajusta ao que você marcar aqui.') },
      { element: '[data-tour="resumo"]', popover: p('2. Como foi a operação', 'A taxa de entrega (número grande), cobertura de GPS e os tempos médios. As setas comparam com o período anterior.', 'top') },
      { element: '[data-tour="agir"]', popover: p('3. Onde agir', 'Lojas com mais problema e as mais lentas. Clique no nome de uma loja pra abrir a evolução dela ao longo do tempo.', 'top') },
      { element: '[data-tour="tendencias"]', popover: p('4. Tendências', 'Os gráficos do período: entregas por dia, evolução dos tempos e desempenho por rede.', 'top') },
      { element: '[data-tour="relatorio"]', popover: p('5. Relatório em PDF', 'Gera um relatório completo do período pra baixar ou enviar.', 'bottom') },
    ],
  },
  // 1 — Inserir KPIs (subir as planilhas mensais)
  {
    href: '/painel?tab=inserir', tab: 'inserir', pathname: '/painel',
    steps: [
      { element: '[data-tour="ins-modo"]', popover: p('6. Inserir os KPIs da Tia', 'Aqui você sobe as planilhas de KPI. Em "Mês inteiro" o sistema lê todas as abas-dia da planilha de uma vez.') },
      { element: '[data-tour="ins-periodo"]', popover: p('7. Escolha o mês', 'Selecione o mês das planilhas. É a data que vai carimbar os dados.') },
      { element: '[data-tour="ins-grid"]', popover: p('8. Suba por rede', 'Cada rede tem seu botão "Enviar". Subir de novo a mesma rede REGERA aquele mês (substitui o que estava lá). No modo "Dia específico" aparece também o "Fechar revisão" por rede.', 'top') },
    ],
  },
  // 2 — Gerar KPI (escala + Unitrac)
  {
    href: '/painel/kpi/simples', pathname: '/painel/kpi/simples',
    steps: [
      { element: '[data-tour="gk-escala"]', popover: p('9. Gerar o KPI do zero', 'Esta é a tela que CRUZA a escala com o relatório do Unitrac. Comece subindo a(s) escala(s) aqui.') },
      { element: '[data-tour="gk-unitrac"]', popover: p('10. Suba o Unitrac', 'O relatório do rastreador (PDF). É ele que dá os horários reais de cada parada.', 'top') },
      { element: '[data-tour="gk-gerar"]', popover: p('11. Gere', 'Com escala + Unitrac + data, clique pra gerar. O sistema cruza tudo e monta o KPI por rede.', 'top') },
      { element: '[data-tour="gk-resultado"]', popover: p('12. Baixe e regere', 'O resultado sai por rede (XLSX e PDF). Pra regerar tudo, é só subir os arquivos de novo e gerar — ou usar o "Re-gerar" quando fez correções.', 'top') },
    ],
  },
  // 3 — Volta ao dashboard: fim
  {
    href: '/painel', tab: 'geral', pathname: '/painel',
    steps: [
      { element: '[data-tour="abas"]', popover: p('Pronto!', 'Esse é o fluxo completo. Você pode rever este tutorial quando quiser no botão "Ver tutorial". Bom trabalho!') },
    ],
  },
]
```
NOTA: o helper `p()` com tipo complexo pode reclamar no tsc — se reclamar, simplifique pra `const p = (title, description, side='bottom') => ({ title, description, side, align: 'start' } as DriveStep['popover'])` ou tipe os steps inline. Resolva o erro real.

- [ ] **Step 2:** `npx tsc --noEmit`. **Step 3:** Commit `feat(tutorial): capitulos do tour (dashboard, inserir, gerar KPI)`.

---

## Task 4: TourRunner (peça central)

**Files:** `src/app/painel/tour-runner.tsx`

Componente client que orquestra: lê o store; se ativo, pega o capítulo `cap`; se a tela atual não bate, navega; se bate, roda o driver.js. O último step avança o `cap`. Fechar (X) encerra o tour.

- [ ] **Step 1:** Criar `src/app/painel/tour-runner.tsx`:
```tsx
'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { getTour, subTour, setTour, encerrarTutorial } from '@/lib/tour/store'
import { CAPITULOS } from '@/lib/tour/capitulos'

export function TourRunner() {
  const { ativo, cap } = useSyncExternalStore(subTour, getTour, () => ({ ativo: false, cap: 0 }))
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const driverRef = useRef<Driver | null>(null)
  const avancando = useRef(false)

  useEffect(() => {
    if (!ativo) { driverRef.current?.destroy(); driverRef.current = null; return }
    const capitulo = CAPITULOS[cap]
    if (!capitulo) { encerrarTutorial(); return }

    const tabAtual = sp.get('tab') ?? 'geral'
    const telaCasa = pathname === capitulo.pathname && (!capitulo.tab || capitulo.tab === tabAtual)
    if (!telaCasa) {
      // navega pra tela do capítulo; quando chegar, o efeito re-roda e telaCasa=true
      router.replace(capitulo.href, { scroll: false })
      return
    }

    // pequeno delay pra garantir que os elementos do capítulo já montaram (dados/abas)
    const start = window.setTimeout(() => {
      const ehUltimoCap = cap === CAPITULOS.length - 1
      const d = driver({
        showProgress: true,
        progressText: 'Passo {{current}} de {{total}}',
        nextBtnText: ehUltimoCap ? 'Concluir' : 'Próximo',
        prevBtnText: 'Voltar',
        doneBtnText: ehUltimoCap ? 'Concluir' : 'Próxima tela →',
        animate: true, smoothScroll: true, allowClose: true,
        overlayColor: '#0a0a0a', overlayOpacity: 0.6,
        stagePadding: 8, stageRadius: 14,
        popoverClass: 'driver-popover-navy',
        steps: capitulo.steps,
        // ao concluir o último step do capítulo → avança o capítulo (ou encerra)
        onDestroyed: () => {
          if (avancando.current) { avancando.current = false; return }
          // Se o tour ainda está ativo e o usuário chegou ao fim deste capítulo,
          // o onDoneClick abaixo já tratou; aqui é fechar (X/ESC) → encerra tudo.
          encerrarTutorial()
        },
        onDoneClick: () => {
          if (ehUltimoCap) { encerrarTutorial(); return }
          avancando.current = true
          driverRef.current?.destroy()
          setTour({ cap: cap + 1 })   // dispara o efeito → navega/roda o próximo
        },
      })
      driverRef.current = d
      d.drive()
    }, 450)

    return () => { window.clearTimeout(start); driverRef.current?.destroy(); driverRef.current = null }
  }, [ativo, cap, pathname, sp, router])

  return null
}
```
NOTAS de implementação:
- `useSyncExternalStore` precisa do 3º arg (server snapshot) → `() => ({ ativo: false, cap: 0 })` (no SSR o tour fica inativo).
- Se `onDoneClick`/`onDestroyed` não existirem com esses nomes na versão instalada do driver.js, confira a API real (`node_modules/driver.js/dist/driver.d.ts`) e use os hooks equivalentes (`onDestroyStarted`, `onCloseClick`, `onNextClick` no último step). O objetivo é: "Próxima tela" avança o `cap`; "X"/ESC encerra. Ajuste pra cumprir esse comportamento com a API real.

- [ ] **Step 2:** `npx tsc --noEmit` — resolva nomes de hook conforme a API real do driver.js. **Step 3:** Commit `feat(tutorial): TourRunner navega entre capitulos e telas`.

---

## Task 5: Montar no shell + botão + remover tour antigo

**Files:** `src/app/painel/painel-shell.tsx`, `src/app/painel/dashboard/dashboard-client.tsx`, deletar `src/app/painel/dashboard/tour.ts`

- [ ] **Step 1:** Em `painel-shell.tsx`, importar e montar `<TourRunner />` uma vez (dentro do return, ao lado de `{children}`):
```tsx
import { TourRunner } from './tour-runner'
// ...no JSX, dentro do container raiz:
<TourRunner />
```

- [ ] **Step 2:** Em `dashboard-client.tsx`:
  - Trocar o import `import { iniciarTour, tourJaVisto } from './tour'` por `import { iniciarTutorial, tourJaVisto } from '@/lib/tour/store'`.
  - O botão "Ver tutorial": `onClick={() => iniciarTutorial()}`.
  - O auto-start (useEffect): trocar `iniciarTour()` por `iniciarTutorial()`; manter o guard `tourJaVisto()` + `tourAuto.current` + `tab==='geral'` + `m`.
  - Deletar `src/app/painel/dashboard/tour.ts` (`rm`).

- [ ] **Step 3:** `npx tsc --noEmit && npm run build`. **Step 4:** Commit `feat(tutorial): montar runner no shell, botao usa store, remove tour antigo`.

---

## Task 6: data-tour nas telas + animação

**Files:** `dashboard-client.tsx`, `inserir-manual.tsx`, `kpi/simples/page.tsx`, `globals.css`

- [ ] **Step 1:** Confirmar/garantir `data-tour` no dashboard (já existem da versão anterior): `titulo`, `periodo`, `resumo`, `agir`, `tendencias`, `relatorio`, `abas`. Manter.
- [ ] **Step 2:** Em `inserir-manual.tsx`, adicionar: `data-tour="ins-modo"` no toggle Mês/Dia; `data-tour="ins-periodo"` no input de mês/data; `data-tour="ins-grid"` no `grid` de cards de rede.
- [ ] **Step 3:** Em `kpi/simples/page.tsx`, adicionar: `data-tour="gk-escala"` na área/card de upload de escala; `data-tour="gk-unitrac"` no upload do Unitrac; `data-tour="gk-gerar"` no botão "Gerar agora"; `data-tour="gk-resultado"` na área de resultado/downloads (ou no CTA, se o resultado só aparece após gerar — nesse caso aponte pro botão gerar com texto explicando). Ler o arquivo pra achar os elementos certos.
- [ ] **Step 4:** Em `globals.css`, dar vida ao destaque (pulse suave no recorte do driver.js):
```css
.driver-active .driver-overlay { transition: opacity .3s ease; }
@keyframes tour-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(31,56,100,.0); } 50% { box-shadow: 0 0 0 4px rgba(31,56,100,.18); } }
.driver-active-element { border-radius: 12px; animation: tour-pulse 2s ease-in-out infinite; }
```
(Se a classe do elemento destacado na versão instalada for outra, confira em `driver.css`/`driver.d.ts` e ajuste o seletor.)

- [ ] **Step 5:** `npx tsc --noEmit && npm run build`. **Step 6:** Commit `feat(tutorial): data-tour nas telas de inserir/gerar + pulse no destaque`.

---

## Task 7: Validação final + merge
- [ ] `npx tsc --noEmit && npx vitest run && npm run build` — tudo verde; rotas intactas.
- [ ] Merge `--ff-only` pra main + push.

---

## Self-Review
| Requisito (spec) | Task |
|---|---|
| Navega sozinho entre telas | Task 4 (runner) + Task 2 (tab via URL) |
| Dashboard → Inserir → Gerar KPI → fim | Task 3 (capítulos) |
| "As duas" telas de gerar/inserir | Cap 1 (inserir) + Cap 2 (gerar KPI escala+Unitrac) |
| Passo a passo detalhado | Task 3 (steps com copy) |
| Animações / bem feito | driver.js animate + Task 6 (pulse) |
| Persistir progresso entre navegações | Task 1 (store) + runner no shell que não re-monta |
| Substituir tour antigo | Task 5 (rm tour.ts) |

**Riscos:** (1) nomes dos hooks do driver.js (`onDoneClick`/`onDestroyed`) — Task 4 manda conferir a `.d.ts` real. (2) elementos que só montam após dados/aba — mitigado pelo delay de 450ms no runner + navegar antes de rodar. (3) `useSearchParams` exige Suspense boundary em algumas configs do Next — se o build reclamar, o dashboard-client/runner já são client e estão sob o layout; envolver em `<Suspense>` se necessário.

**Fora de escopo (fase 2):** passo dentro da página da LOJA (o cap atual só aponta "clique na loja" no dashboard, não entra na página dela — entrar exigiria um link real com loja específica; deixado pra depois pra não travar o tour se não houver loja).
