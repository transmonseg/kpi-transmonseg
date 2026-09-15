# Motor de confirmação: posição bruta como fonte primária — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inverter a prioridade de fonte de parada do motor de confirmação — a posição contínua própria (`derivarParadas`, já em produção como fallback histórico) passa a ser a fonte primária para toda geração, não só para dias fora da janela de 48h da Unitrac; a API de paradas já processada pela Unitrac vira sinal secundário, usado só quando não há cobertura própria ou quando há apagão de sinal detectado.

**Architecture:** A ponte HTTP `POST /api/kpi/base-horarios?incluirParadas` (monitoramento) já expõe `derivarParadas` sobre `posicoes_historico`. Ela ganha um campo novo, `apagaoDeSinal`, calculado a partir de `atraso_min` na mesma consulta que já lê as posições. `resolverParadas` (KPI, `unitrac.ts`) troca seu parâmetro de decisão de `foraDaJanela` para `apagaoDeSinal`: sem apagão, a ponte manda sempre (se tiver dado); com apagão, cai para a Unitrac. Os call sites (Nutry Max: rota + script; Rio Quality: pipeline) passam a pedir `incluirParadas: true` sempre, não só fora da janela.

**Tech Stack:** Next.js (ambos os repos — leia `node_modules/next/dist/docs/` antes de mexer em rota, `AGENTS.md` avisa que a versão difere do que você conhece), TypeScript, Vitest, Postgres via Supabase client (monitoramento) e `pg` direto (script de auditoria, não tocado aqui).

**Spec:** `docs/superpowers/specs/2026-09-14-motor-confirmacao-posicao-bruta-design.md` (este repo). Leia a spec — o plano argumenta a partir dela, incluindo a correção de 14/09 (seção "2a. Apagão de sinal") que mudou o desenho depois da brainstorm inicial.

## Global Constraints

- **Dois repos por projeto, sempre em sincronia.** Mudança no monitoramento vai para `/Users/joaquimsalles/Projects/Transmonseg/monitoramento/MONITORAMENTO transmonseg` **e** `/Users/joaquimsalles/Projects/Transmonseg/monitoramento/MONITORAMENTO TEMP`. Mudança no KPI vai para `/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg` **e** `/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP`. Cada par é commitado e pushado junto.
- **Commit termina com:**
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01KDT93K5kwJgVYnWFt4pmJ9
  ```
- **Limiar de apagão**: `atraso_min > 15` (minutos). Medido, não escolhido a dedo — degrau real na distribuição de produção: 283.183 leituras na faixa 10-15min contra 5.932 na faixa 15-20min.
- **Escopo**: Nutry Max e Rio Quality (decisão do usuário nesta rodada — diferente das fases anteriores, que eram só Nutry Max). Não muda geocodificação, `buscarAlvosDoDia`, `buscarFrota`, nem classificação BASE/FORA_BASE de `derivarParadas`.
- **Fail-open** em toda falha nova: chamada à ponte falhando, resposta malformada, ou "sem cobertura" — nunca inventa negativa por falta de dado, cai para a Unitrac.
- Testes: `npm test` em cada repo. Baseline no início desta fase: monitoramento a confirmar no Step 1 (cresceu ao longo do dia, não assumir um número fixo sem checar); KPI 1047 passando (medido em 14/09, após os itens 3a/3b).
- Banco de produção: `ssh transmonseg-vps "sudo -u postgres psql -d transmonseg ..."` / `-d kpi_transmonseg`. Nenhuma migration nesta fase — `atraso_min` já existe como coluna em `posicoes_historico`.

---

## File Structure

**Monitoramento** (`MONITORAMENTO transmonseg` + `MONITORAMENTO TEMP`)

- Modify `src/app/api/kpi/base-horarios/route.ts` — tipo `Posicao` ganha `atraso_min`; nova função `teveApagaoDeSinal`; resposta ganha `apagaoDeSinal`.
- Modify `src/app/api/kpi/base-horarios/route.test.ts` — testes para `teveApagaoDeSinal` e para o campo na resposta.

**KPI** (`KPI transmonseg` + `KPI TEMP`)

- Modify `src/lib/kpi-romaneio/base-horarios.ts` — `HorarioBase` ganha `apagaoDeSinal`; parsing e passagem do campo.
- Modify `src/lib/kpi-romaneio/base-horarios.test.ts` — cobertura do parsing novo.
- Modify `src/lib/kpi-romaneio/unitrac.ts` — `resolverParadas` troca `foraDaJanela` por `apagaoDeSinal`.
- Modify `src/lib/kpi-romaneio/unitrac.test.ts` — reescreve os 4 testes de `resolverParadas` para o novo parâmetro.
- Modify `src/app/api/kpi/nutrimax/gerar/route.ts` — `incluirParadas: true` sempre; `resolverParadas` recebe `apagaoDeSinal` do mapa da ponte.
- Modify `scripts/gerar-nutrimax-real-arquivo.ts` — mesmas duas mudanças.
- Modify `src/lib/kpi-rioquality/pipeline.ts` — closure padrão de `buscarParadas` passa a consultar a ponte (`BASES_COORD_RIOQUALITY`) e aplicar `resolverParadas`.
- Create `src/lib/kpi-rioquality/pipeline.test.ts` — cobertura do closure padrão novo (não existe teste de pipeline hoje).

---

### Task 1: Monitoramento — detectar apagão de sinal

Entrega sozinha: a ponte passa a saber dizer, por placa/dia, se houve degradação de sinal na janela — sem isso, nenhuma outra task tem como decidir a prioridade com segurança.

**Files:**
- Modify: `MONITORAMENTO transmonseg/src/app/api/kpi/base-horarios/route.ts`
- Modify: `MONITORAMENTO transmonseg/src/app/api/kpi/base-horarios/route.test.ts`
- (espelhar em `MONITORAMENTO TEMP`)

**Interfaces:**
- Consumes: nada novo — mesma tabela `posicoes_historico`, mesma consulta já existente na rota.
- Produces:
  ```ts
  export function teveApagaoDeSinal(posicoes: Posicao[], limiarMin?: number): boolean
  ```
  Consumido pela Task 2 via o campo `apagaoDeSinal` na resposta HTTP da rota.

- [ ] **Step 1: Rodar a suíte e anotar o baseline**

```bash
cd "MONITORAMENTO transmonseg" && npm test 2>&1 | tail -3
```
Anote o número — esta fase não assume um valor fixo porque o repo cresceu ao longo do dia.

- [ ] **Step 2: Escrever os testes que falham**

Adicionar a `src/app/api/kpi/base-horarios/route.test.ts`:

```ts
import { teveApagaoDeSinal } from './route'

describe('teveApagaoDeSinal', () => {
  const base = { lat: -22.9, lng: -43.2, criado_em: '2026-09-11T10:00:00Z' }

  it('false quando todo atraso_min esta dentro do normal', () => {
    const posicoes = [
      { ...base, velocidade: 0, atraso_min: 2 },
      { ...base, velocidade: 0, atraso_min: 5 },
      { ...base, velocidade: 0, atraso_min: 10 },
    ]
    expect(teveApagaoDeSinal(posicoes)).toBe(false)
  })

  it('true quando alguma leitura passa do limiar (15min)', () => {
    // Caso real (RQV3G18, 09/09): atraso subindo de 17 ate 47+ com lat/lng
    // congelados enquanto o rastreador estava sem comunicar.
    const posicoes = [
      { ...base, velocidade: 0, atraso_min: 2 },
      { ...base, velocidade: 0, atraso_min: 17 },
      { ...base, velocidade: 0, atraso_min: 25 },
    ]
    expect(teveApagaoDeSinal(posicoes)).toBe(true)
  })

  it('false com lista vazia -- sem posicao nenhuma nao e apagao, e' + ' sem cobertura (tratado em outro lugar)', () => {
    expect(teveApagaoDeSinal([])).toBe(false)
  })

  it('respeita limiar customizado, pra teste isolado do valor exato', () => {
    const posicoes = [{ ...base, velocidade: 0, atraso_min: 8 }]
    expect(teveApagaoDeSinal(posicoes, 5)).toBe(true)
    expect(teveApagaoDeSinal(posicoes, 10)).toBe(false)
  })

  it('exatamente no limiar nao conta como apagao (estritamente maior que)', () => {
    const posicoes = [{ ...base, velocidade: 0, atraso_min: 15 }]
    expect(teveApagaoDeSinal(posicoes)).toBe(false)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd "MONITORAMENTO transmonseg" && npx vitest run src/app/api/kpi/base-horarios/route.test.ts
```
Esperado: FAIL — `teveApagaoDeSinal` não é exportado de `./route`.

- [ ] **Step 4: Implementar**

Em `route.ts`, atualizar o tipo `Posicao` (linha ~43):
```ts
type Posicao = { lat: number; lng: number; criado_em: string; velocidade: number; atraso_min: number };
```

Acrescentar, perto de `derivarParadas` (depois dela, mesma seção do arquivo):
```ts
// Achado real 14/09 (planejamento da fase que torna esta ponte fonte
// PRIMARIA de parada, nao so' fallback): quando o rastreador para de
// comunicar, o poller deste projeto continua gravando a ULTIMA posicao
// conhecida, com atraso_min subindo -- isso ou congela sem gerar parada,
// ou pior, derivarParadas ve varias leituras identicas se repetindo e
// deriva uma parada FALSA no ponto onde o sinal caiu. Caso real medido:
// placa RQV3G18, 09/09, atraso subindo de 2 pra 34+ enquanto ela rodava
// de verdade entre Trapiche e Macae (a Unitrac, que recebe o trecho em
// lote ao reconectar, mostra a parada real; esta ponte, nao).
//
// Limiar medido em producao (3 dias de posicoes_historico), nao chutado:
// 283.183 leituras na faixa 10-15min contra so' 5.932 na faixa 15-20min --
// degrau nitido bem em 15min.
const LIMIAR_APAGAO_MIN = 15;

export function teveApagaoDeSinal(posicoes: Posicao[], limiarMin = LIMIAR_APAGAO_MIN): boolean {
  return posicoes.some((p) => p.atraso_min > limiarMin);
}
```

Atualizar a consulta (linha ~576, dentro do loop `for (const placaBruta of placas)`):
```ts
    const { data: posicoesRows, error: erroPosicoes } = await admin
      .from("posicoes_historico")
      .select("lat, lng, criado_em, velocidade, atraso_min")
```

E o objeto de resposta (linha ~594):
```ts
    const paradas = incluirParadas ? derivarParadas(posicoes, basesCentro) : undefined;
    const apagaoDeSinal = incluirParadas ? teveApagaoDeSinal(posicoes) : undefined;
    resultados.push({
      placa: placaBruta,
      saidaBase,
      chegadaBase,
      kmPercorrido,
      ...(visitas ? { visitas } : {}),
      ...(paradas ? { paradas } : {}),
      ...(apagaoDeSinal !== undefined ? { apagaoDeSinal } : {}),
    });
```

E o tipo do array `resultados` (linha ~552), acrescentar `apagaoDeSinal?: boolean;`.

`apagaoDeSinal` só é calculado quando `incluirParadas` é pedido, mesmo raciocínio de "o payload cresce e quem não usa não paga o custo" já aplicado a `paradas` — o campo só importa para quem também pediu paradas.

- [ ] **Step 5: Rodar e ver passar**

```bash
cd "MONITORAMENTO transmonseg" && npx vitest run src/app/api/kpi/base-horarios/route.test.ts
```
Esperado: 5 passando.

- [ ] **Step 6: Rodar a suíte inteira**

```bash
cd "MONITORAMENTO transmonseg" && npm test
```
Esperado: baseline do Step 1 + 5.

- [ ] **Step 7: Espelhar no TEMP, commitar e pushar**

---

### Task 2: KPI — receber e repassar `apagaoDeSinal`

**Files:**
- Modify: `KPI transmonseg/src/lib/kpi-romaneio/base-horarios.ts`
- Modify: `KPI transmonseg/src/lib/kpi-romaneio/base-horarios.test.ts`
- (espelhar em `KPI TEMP`)

**Interfaces:**
- Consumes: campo `apagaoDeSinal?: boolean` na resposta HTTP da ponte (Task 1).
- Produces: `HorarioBase.apagaoDeSinal?: boolean`. Consumido pela Task 4/5/6 via `horarioBasePorPlaca.get(placaNorm)?.apagaoDeSinal`.

- [ ] **Step 1: Escrever o teste que falha**

Localizar o arquivo de teste existente (`base-horarios.test.ts`, deve existir dado que `base-horarios.ts` tem lógica de parsing testável — se não existir, criar seguindo o padrão de `unitrac.test.ts` para mocks de `fetch`). Adicionar:

```ts
it('repassa apagaoDeSinal quando a ponte manda true', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      resultados: [
        { placa: 'RQU2G47', saidaBase: null, chegadaBase: null, kmPercorrido: null, apagaoDeSinal: true },
      ],
    }),
  }) as unknown as typeof fetch
  process.env.MOTOR_SECRET = 'x'
  const mapa = await buscarHorariosBase(['RQU2G47'], '2026-09-11', new Map(), true)
  expect(mapa.get('RQU2G47')?.apagaoDeSinal).toBe(true)
})

it('apagaoDeSinal vira false quando ausente ou malformado -- nunca undefined pro chamador', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      resultados: [{ placa: 'RQU2G47', saidaBase: null, chegadaBase: null, kmPercorrido: null }],
    }),
  }) as unknown as typeof fetch
  process.env.MOTOR_SECRET = 'x'
  const mapa = await buscarHorariosBase(['RQU2G47'], '2026-09-11', new Map(), true)
  expect(mapa.get('RQU2G47')?.apagaoDeSinal).toBe(false)
})
```

Antes de escrever, ler o topo de `base-horarios.test.ts` para copiar o padrão exato de mock de `fetch` e de reset de `process.env.MOTOR_SECRET` que os testes vizinhos já usam — não inventar um padrão novo.

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd "KPI transmonseg" && npx vitest run src/lib/kpi-romaneio/base-horarios.test.ts
```
Esperado: FAIL — `apagaoDeSinal` sempre `undefined`.

- [ ] **Step 3: Implementar**

Em `base-horarios.ts`:

No tipo `HorarioBase` (perto de `paradas?: ParadaBridge[]`):
```ts
  // Achado real 14/09: quando true, a ponte teve leitura com atraso_min
  // acima do limiar de apagao (LIMIAR_APAGAO_MIN, ver route.ts do
  // monitoramento) na janela desta placa/dia -- as paradas derivadas
  // acima NAO sao confiaveis para esse dia (podem ser congelamento na
  // ultima posicao conhecida, nao permanencia real). resolverParadas usa
  // este campo pra decidir se prefere esta ponte ou a Unitrac.
  apagaoDeSinal?: boolean
```

No tipo `ResultadoBruto`:
```ts
  apagaoDeSinal?: unknown
```

Em `validarResultado`, no `return`:
```ts
    return { placa: obj.placa, saidaBase: obj.saidaBase, chegadaBase: obj.chegadaBase, kmPercorrido: obj.kmPercorrido, visitas: visitasBrutas, paradas: paradasBrutas, apagaoDeSinal: obj.apagaoDeSinal === true }
```
(e acrescentar `apagaoDeSinal?: unknown` na assinatura do objeto `obj` dentro da função, ao lado de `visitas?: unknown; paradas?: unknown`).

Em `buscarLote`, no `mapa.set(...)`:
```ts
      mapa.set(r.placa, {
        saidaBase: paraBrtMascaradoComoUtc(r.saidaBase),
        chegadaBase: paraBrtMascaradoComoUtc(r.chegadaBase),
        kmPercorrido: r.kmPercorrido,
        visitasPorNf,
        paradas,
        apagaoDeSinal: r.apagaoDeSinal === true,
      })
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd "KPI transmonseg" && npx vitest run src/lib/kpi-romaneio/base-horarios.test.ts
```

- [ ] **Step 5: Rodar a suíte inteira**

```bash
cd "KPI transmonseg" && npm test
```
Esperado: 1047 + os novos testes desta task.

- [ ] **Step 6: Espelhar no TEMP, commitar e pushar**

---

### Task 3: KPI — `resolverParadas` troca `foraDaJanela` por `apagaoDeSinal`

**Files:**
- Modify: `KPI transmonseg/src/lib/kpi-romaneio/unitrac.ts`
- Modify: `KPI transmonseg/src/lib/kpi-romaneio/unitrac.test.ts`
- (espelhar em `KPI TEMP`)

**Interfaces:**
- Consumes: `HorarioBase.apagaoDeSinal` (Task 2).
- Produces:
  ```ts
  export function resolverParadas(
    daUnitrac: UnitracParadaRow[],
    daPonte: { chegada: string; saida: string; duracaoSeg: number; lat: number; lng: number; classificacao: 'BASE' | 'FORA_BASE' }[] | undefined,
    placaNorm: string,
    apagaoDeSinal: boolean,
  ): UnitracParadaRow[]
  ```
  Assinatura igual à de hoje, só o 4º parâmetro muda de nome e de sentido. Consumido pelas Tasks 4, 5 e 6.

- [ ] **Step 1: Reescrever os testes existentes (falham antes de implementar)**

`unitrac.test.ts` já tem 4 testes em `describe('resolverParadas', ...)` (linhas 217-241) escritos para o comportamento antigo (`foraDaJanela`). Substituir o bloco inteiro:

```ts
// Achado real 14/09 (planejamento da fase que inverte a prioridade de
// fonte de parada): antes, a ponte so' era preferida fora da janela de
// 48h da Unitrac. Agora e' preferida SEMPRE, exceto quando ha' apagao de
// sinal detectado (ver route.ts do monitoramento, teveApagaoDeSinal) --
// nesse caso a ponte pode estar mostrando uma parada FALSA (congelamento
// na ultima posicao conhecida), entao cai pra Unitrac mesmo tendo dado.
describe('resolverParadas', () => {
  const daPonteEx = [
    { chegada: '2026-09-11T10:00:00.000Z', saida: '2026-09-11T10:20:00.000Z', duracaoSeg: 1200, lat: -22.9, lng: -43.2, classificacao: 'FORA_BASE' as const },
  ]
  const daUnitracEx = [{ id: 'unitrac-x' }] as unknown as import('@/lib/kpi/matcher').UnitracParadaRow[]

  it('sem apagao, com dado da ponte: usa a ponte mesmo com a Unitrac tendo devolvido algo (nova prioridade)', () => {
    const r = resolverParadas(daUnitracEx, daPonteEx, 'RQU2G47', false)
    expect(r).toEqual(paradasDaPonte(daPonteEx, 'RQU2G47'))
  })

  it('sem apagao, sem dado nenhum na ponte: cai pro que a Unitrac devolveu (fail-open, nunca erro seco)', () => {
    const r = resolverParadas(daUnitracEx, undefined, 'RQU2G47', false)
    expect(r).toBe(daUnitracEx)
  })

  it('com apagao detectado: usa a Unitrac mesmo com a ponte tendo dado -- a ponte pode estar mostrando parada falsa', () => {
    const r = resolverParadas(daUnitracEx, daPonteEx, 'RQU2G47', true)
    expect(r).toBe(daUnitracEx)
  })

  it('com apagao e sem dado nenhum da Unitrac: lista vazia, nunca inventa (fail-open nos dois lados)', () => {
    const r = resolverParadas([], daPonteEx, 'RQU2G47', true)
    expect(r).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd "KPI transmonseg" && npx vitest run src/lib/kpi-romaneio/unitrac.test.ts
```
Esperado: FAIL — o 1º e o 3º teste esperam o comportamento novo, que o código antigo não tem (`resolverParadas` hoje devolve `daUnitracEx` no 1º caso, não `paradasDaPonte(...)`).

- [ ] **Step 3: Implementar**

Em `unitrac.ts`, substituir a função inteira (mantendo o comentário histórico do achado de 11/09 logo acima, e acrescentando o novo abaixo dele):

```ts
// Achado real 14/09 (fase que torna a ponte fonte PRIMARIA, nao so'
// fallback pra fora da janela): a inversao de prioridade abaixo e'
// segura DESDE QUE o chamador tenha checado apagao de sinal antes --
// ver teveApagaoDeSinal (monitoramento, route.ts) e o comentario em
// HorarioBase.apagaoDeSinal (base-horarios.ts). Sem essa checagem, um
// apagao faria a ponte parecer que tem dado bom (congelado na ultima
// posicao) bem na hora em que a Unitrac tem a informacao certa
// (recebe o trecho em lote ao reconectar) -- teria revertido a fase
// 3a em vez de completa-la.
export function resolverParadas(
  daUnitrac: UnitracParadaRow[],
  daPonte: { chegada: string; saida: string; duracaoSeg: number; lat: number; lng: number; classificacao: 'BASE' | 'FORA_BASE' }[] | undefined,
  placaNorm: string,
  apagaoDeSinal: boolean,
): UnitracParadaRow[] {
  if (apagaoDeSinal) return daUnitrac
  return daPonte?.length ? paradasDaPonte(daPonte, placaNorm) : daUnitrac
}
```

Isso substitui a função `resolverParadas` de hoje (que tinha o parâmetro `foraDaJanela` e dois `if`/branches). O comentário de achado real de 11/09 que já existe acima da função (explicando o bug do "retalho parcial da Unitrac") continua valendo como contexto histórico — não apagar, só não é mais o que decide o branch.

**Nota sobre a seção 3 da spec (failover se a chamada à ponte falhar)**: não precisa de código novo. `buscarHorariosBase`/`buscarLote` (`base-horarios.ts`) já é fail-open — qualquer falha de rede, timeout, resposta não-OK ou JSON inválido devolve um `Map` vazio (`console.error` já emitido em cada caso, ver `buscarLote`). Com o mapa vazio, `horarioBasePorPlaca.get(placaNorm)` é `undefined` nas Tasks 4/5/6, então `apagaoDeSinal` vira `false` (via `?? false`) e `daPonte` vira `undefined` — `resolverParadas` cai para `daUnitrac` pelo mesmo caminho de "sem dado nenhum na ponte" que já está testado no Step 1. Confirme isso lendo `buscarLote` antes de seguir, não implemente nada adicional para este caso.

- [ ] **Step 4: Rodar e ver passar**

```bash
cd "KPI transmonseg" && npx vitest run src/lib/kpi-romaneio/unitrac.test.ts
```
Esperado: 4 passando (mais os testes de `paradasDaPonte` e outras funções do arquivo, intocados).

- [ ] **Step 5: Rodar a suíte inteira**

```bash
cd "KPI transmonseg" && npm test
```

- [ ] **Step 6: Espelhar no TEMP, commitar e pushar**

---

### Task 4: KPI — ligar em `nutrimax/gerar/route.ts`

**Files:**
- Modify: `KPI transmonseg/src/app/api/kpi/nutrimax/gerar/route.ts:132-137,183,204-208,229-231`
- (espelhar em `KPI TEMP`)

**Interfaces:**
- Consumes: `buscarHorariosBase` (Task 2) e `resolverParadas` (Task 3).
- Produces: nada consumido por outra task — ponto de integração final para o caminho de geração via rota HTTP.

Este arquivo não tem teste de integração de ponta a ponta hoje (é uma rota HTTP que orquestra várias chamadas de rede) — a verificação real é a Task 7 (rodada com dado real). Esta task é código de wiring, sem TDD próprio; confira cuidadosamente contra o arquivo real antes de editar, os números de linha abaixo podem ter deslocado com os commits do dia.

- [ ] **Step 1: Ler o arquivo e confirmar as linhas atuais**

```bash
grep -n "foraDaJanelaUnitrac\|resolverParadas\|buscarHorariosBase" "KPI transmonseg/src/app/api/kpi/nutrimax/gerar/route.ts"
```

- [ ] **Step 2: Trocar a chamada de `buscarHorariosBase`**

Onde hoje está (dentro do `Promise.all` que busca `frota`, `alvosBrutos`, `horarioBasePorPlaca`):
```ts
    buscarHorariosBase(placasNorm, data, pontosPorPlacaBridge, foraDaJanelaUnitrac),
```
trocar para:
```ts
    // Achado real 14/09: pede paradas SEMPRE agora, nao so' fora da janela
    // -- a ponte virou fonte primaria (ver resolverParadas em unitrac.ts).
    buscarHorariosBase(placasNorm, data, pontosPorPlacaBridge, true),
```

- [ ] **Step 3: Trocar os dois call sites de `resolverParadas`**

Onde hoje está (duas ocorrências, uma no `Promise.all` das placas do romaneio, outra no `Promise.all` da frota extra):
```ts
    const paradas = resolverParadas(daUnitrac, daPonte, placaNorm, foraDaJanelaUnitrac)
```
e
```ts
    paradasPorPlaca.set(placaNorm, resolverParadas(daUnitrac, daPonte, placaNorm, foraDaJanelaUnitrac))
```
trocar `foraDaJanelaUnitrac` por `horarioBasePorPlaca.get(placaNorm)?.apagaoDeSinal ?? false` nas duas:
```ts
    const paradas = resolverParadas(daUnitrac, daPonte, placaNorm, horarioBasePorPlaca.get(placaNorm)?.apagaoDeSinal ?? false)
```
```ts
    paradasPorPlaca.set(placaNorm, resolverParadas(daUnitrac, daPonte, placaNorm, horarioBasePorPlaca.get(placaNorm)?.apagaoDeSinal ?? false))
```

- [ ] **Step 4: Não remover `foraDaJanelaUnitrac`/`foraDoAlcanceApi`**

A variável `foraDaJanelaUnitrac` (calculada com `foraDoAlcanceApi(data, hojeBR())`) continua sendo usada pelo `console.warn` de log logo abaixo dela e é informação útil para diagnóstico — deixar como está, só parou de ser o parâmetro que decide a fonte de parada. Não apagar essa lógica.

- [ ] **Step 5: Build e suíte**

```bash
cd "KPI transmonseg" && npm test && npm run build
```
Esperado: nenhuma regressão (este arquivo não tem teste próprio, mas não pode quebrar o build nem os testes de `unitrac.ts`/`base-horarios.ts` que ele importa).

- [ ] **Step 6: Commitar e pushar (não espelhar em TEMP nesta task — ver Task 5)**

Este arquivo (`nutrimax/gerar/route.ts`) só existe no repo principal. Commitar normalmente.

---

### Task 5: KPI — mesma mudança no script

**Files:**
- Modify: `KPI transmonseg/scripts/gerar-nutrimax-real-arquivo.ts:72-73,95-101,119-125`
- (espelhar em `KPI TEMP`)

**Interfaces:**
- Consumes: mesmas de Task 4.
- Produces: nada.

- [ ] **Step 1: Ler o arquivo e confirmar as linhas atuais**

```bash
grep -n "foraDaJanelaUnitrac\|resolverParadas\|buscarHorariosBase" "KPI transmonseg/scripts/gerar-nutrimax-real-arquivo.ts"
```

- [ ] **Step 2: Aplicar as mesmas três trocas da Task 4**

Linha ~73: `buscarHorariosBase(placasNorm, data, pontosPorPlacaBridge, foraDaJanelaUnitrac)` → `buscarHorariosBase(placasNorm, data, pontosPorPlacaBridge, true)`.

Linhas ~101 e ~125: `resolverParadas(paradas, daPonte, placaNorm, foraDaJanelaUnitrac)` (e a variante `daPonteExtra`) → trocar o último argumento por `horarioBasePorPlaca.get(placaNorm)?.apagaoDeSinal ?? false`. Confirme o nome exato da variável do mapa de horários neste arquivo antes de editar (pode não se chamar `horarioBasePorPlaca` igual à rota — leia a declaração no topo da função).

Mesma orientação da Task 4: não remover `foraDaJanelaUnitrac`/`foraDoAlcanceApi`, só parar de usá-los como decisor de fonte de parada.

- [ ] **Step 3: Build e suíte**

```bash
cd "KPI transmonseg" && npm test && npx tsc --noEmit
```

- [ ] **Step 4: Espelhar no TEMP, commitar e pushar**

---

### Task 6: KPI — Rio Quality entra pela porta que já existe

**Files:**
- Modify: `KPI transmonseg/src/lib/kpi-rioquality/pipeline.ts`
- Create: `KPI transmonseg/src/lib/kpi-rioquality/pipeline.test.ts`
- (espelhar em `KPI TEMP`)

**Interfaces:**
- Consumes: `buscarHorariosBase`, `resolverParadas`, `BASES_COORD_RIOQUALITY` (já existe em `./constants`).
- Produces: nada consumido por outra task nesta fase.

Não existe `pipeline.test.ts` hoje — este arquivo é novo, e cobre só o closure padrão de `buscarParadas` que esta task muda, não o pipeline inteiro (fora de escopo).

- [ ] **Step 1: Escrever o teste que falha**

O closure padrão de `buscarParadas` hoje é anônimo, definido dentro de `gerarKpiRioQuality` — não dá para testar isolado sem montar um pipeline inteiro. O Step 3 extrai esse closure para uma função nomeada e exportada, `buscarParadasPadraoRioQuality`; este teste já é escrito contra essa função (ainda não existe — é isso que faz o teste falhar).

Criar `src/lib/kpi-rioquality/pipeline.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/unitrac-api', () => ({
  normPlaca: (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, ''),
  buscarStopsCru: vi.fn(),
  consolidaParadasApi: vi.fn(),
}))
vi.mock('@/lib/kpi-romaneio/base-horarios', () => ({
  buscarHorariosBase: vi.fn(),
}))

import { buscarStopsCru, consolidaParadasApi } from '@/lib/unitrac-api'
import { buscarHorariosBase } from '@/lib/kpi-romaneio/base-horarios'
import { buscarParadasPadraoRioQuality } from './pipeline'

describe('buscarParadasPadraoRioQuality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.MOTOR_SECRET = 'x'
  })

  it('sem apagao: prefere a parada da ponte', async () => {
    const daPonte = [
      { chegada: '2026-09-11T10:00:00.000Z', saida: '2026-09-11T10:20:00.000Z', duracaoSeg: 1200, lat: -22.9, lng: -43.2, classificacao: 'FORA_BASE' as const },
    ]
    vi.mocked(buscarHorariosBase).mockResolvedValue(new Map([
      ['RQU2G47', { saidaBase: null, chegadaBase: null, kmPercorrido: null, paradas: daPonte, apagaoDeSinal: false }],
    ]))
    vi.mocked(buscarStopsCru).mockResolvedValue([])
    vi.mocked(consolidaParadasApi).mockReturnValue([{ id: 'da-unitrac' }] as never)

    const r = await buscarParadasPadraoRioQuality('12345', 'RQU2G47', '2026-09-11')
    expect(r).toHaveLength(1)
    expect((r[0] as unknown as { id: string }).id).not.toBe('da-unitrac')
  })

  it('com apagao: cai pra Unitrac mesmo com a ponte tendo parada', async () => {
    const daPonte = [
      { chegada: '2026-09-11T10:00:00.000Z', saida: '2026-09-11T10:20:00.000Z', duracaoSeg: 1200, lat: -22.9, lng: -43.2, classificacao: 'FORA_BASE' as const },
    ]
    vi.mocked(buscarHorariosBase).mockResolvedValue(new Map([
      ['RQU2G47', { saidaBase: null, chegadaBase: null, kmPercorrido: null, paradas: daPonte, apagaoDeSinal: true }],
    ]))
    vi.mocked(buscarStopsCru).mockResolvedValue([])
    const daUnitrac = [{ id: 'da-unitrac' }]
    vi.mocked(consolidaParadasApi).mockReturnValue(daUnitrac as never)

    const r = await buscarParadasPadraoRioQuality('12345', 'RQU2G47', '2026-09-11')
    expect(r).toBe(daUnitrac)
  })

  it('sem dado na ponte: cai pra Unitrac (fail-open)', async () => {
    vi.mocked(buscarHorariosBase).mockResolvedValue(new Map())
    vi.mocked(buscarStopsCru).mockResolvedValue([])
    const daUnitrac = [{ id: 'da-unitrac' }]
    vi.mocked(consolidaParadasApi).mockReturnValue(daUnitrac as never)

    const r = await buscarParadasPadraoRioQuality('12345', 'RQU2G47', '2026-09-11')
    expect(r).toBe(daUnitrac)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd "KPI transmonseg" && npx vitest run src/lib/kpi-rioquality/pipeline.test.ts
```
Esperado: FAIL — `buscarParadasPadraoRioQuality` não existe ainda (o closure hoje é anônimo, dentro de `gerarKpiRioQuality`).

- [ ] **Step 3: Extrair e implementar**

Em `pipeline.ts`, acrescentar os imports que faltam:
```ts
import { buscarHorariosBase } from '@/lib/kpi-romaneio/base-horarios'
import { resolverParadas } from '@/lib/kpi-romaneio/unitrac'
```

Extrair o closure padrão para uma função nomeada e exportada, ANTES da definição de `gerarKpiRioQuality`:

```ts
// Achado real 14/09 (fase que torna a ponte fonte PRIMARIA de parada
// tambem pra Rio Quality, nao so' Nutry Max): antes, o default aqui
// SEMPRE usava o feed de paradas ja processado pela Unitrac
// (consolidaParadasApi sobre buscarStopsCru). Agora consulta primeiro a
// ponte do monitoramento (mesma fonte que a Nutry Max usa, ver
// resolverParadas em unitrac.ts), com a base propria da Rio Quality
// (BASES_COORD_RIOQUALITY, nao a da Nutry Max). Extraida como funcao
// nomeada (em vez de closure anonimo dentro de gerarKpiRioQuality) pra
// ser testavel isolada, sem precisar montar um pipeline inteiro.
//
// Uma chamada a ponte POR PLACA (nao em lote) -- Rio Quality tem menos
// placas por geracao que a Nutry Max; se isso se mostrar lento na
// medicao real, agrupar como a Nutry Max ja faz (buscarHorariosBase
// aceita array de placas). Decisao de nao otimizar cedo: YAGNI ate
// medir.
export async function buscarParadasPadraoRioQuality(
  cv: string,
  placaNorm: string,
  data: string,
): Promise<UnitracParadaRow[]> {
  const [daUnitracEventos, horarioBasePorPlaca] = await Promise.all([
    buscarStopsCru(cv, 48),
    buscarHorariosBase([placaNorm], data, new Map(), true),
  ])
  // base propria da Rio Quality (descoberta pelo GPS, ver constants.ts) --
  // NAO usar buscarParadasDoDia, que classifica pelas bases da Nutry Max
  const daUnitrac = consolidaParadasApi(daUnitracEventos, {}, data, placaNorm, BASES_COORD_RIOQUALITY)
  const horario = horarioBasePorPlaca.get(placaNorm)
  return resolverParadas(daUnitrac, horario?.paradas, placaNorm, horario?.apagaoDeSinal ?? false)
}
```

Trocar o corpo de `gerarKpiRioQuality` (dentro da função, onde hoje está):
```ts
  const buscarParadas =
    params.buscarParadas ??
    (async (cv: string, placaNorm: string, d: string) =>
      consolidaParadasApi(await buscarStopsCru(cv, 48), {}, d, placaNorm, BASES_COORD_RIOQUALITY))
```
por:
```ts
  const buscarParadas = params.buscarParadas ?? buscarParadasPadraoRioQuality
```

E atualizar o comentário da doc do parâmetro `buscarParadas` na assinatura de `gerarKpiRioQuality` (hoje diz `/** injetavel pra teste; padrao = Unitrac stops (48h) sem base cadastrada */`) para:
```ts
  /** injetavel pra teste; padrao = buscarParadasPadraoRioQuality (ponte do
   *  monitoramento primeiro, Unitrac como sinal secundario -- ver
   *  resolverParadas) */
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd "KPI transmonseg" && npx vitest run src/lib/kpi-rioquality/pipeline.test.ts
```
Esperado: 3 passando.

- [ ] **Step 5: Rodar a suíte inteira e build**

```bash
cd "KPI transmonseg" && npm test && npm run build
```

- [ ] **Step 6: Espelhar no TEMP, commitar e pushar**

---

### Task 7: Deploy e medição

**Files:** nenhum de código.

**Interfaces:**
- Consumes: tudo acima.
- Produces: o número que decide se esta fase fica no ar.

- [ ] **Step 1: Deploy dos dois serviços**

```bash
ssh transmonseg-vps "cd /srv/transmonseg/definitivo && git pull && npm run build && pm2 restart transmonseg-definitivo"
ssh transmonseg-vps "cd /srv/kpi-transmonseg && git pull && npm run build && pm2 restart kpi-transmonseg"
```

- [ ] **Step 2: Smoke test da rota da ponte em produção**

```bash
ssh transmonseg-vps "set -a; . /srv/transmonseg/definitivo/.env.production; set +a; curl -s -X POST http://127.0.0.1:3010/api/kpi/base-horarios -H \"x-motor-key: \$MOTOR_SECRET\" -H 'Content-Type: application/json' -d '{\"placas\":[\"RQU-2G47\"],\"data\":\"2026-09-11\",\"incluirParadas\":true}' --max-time 30"
```
Confirme que a resposta tem o campo `apagaoDeSinal` (`true` ou `false`) dentro do resultado dessa placa.

- [ ] **Step 3: Regerar 11 e 12/09 (Nutry Max) e comparar**

Usar `scripts/gerar-nutrimax-real-arquivo.ts` para os dois dias, com os PDFs já usados nas fases anteriores (`/tmp/escala-11.pdf`, `/tmp/romaneio-11.pdf`, `/tmp/escala-12.pdf`, `/tmp/romaneio-12.pdf` no VPS). Comparar contra os arquivos já gerados no fim da Fase 2 (`kpi-11-novo.xlsx`/equivalente e `kpi-12-3ab.xlsx`, salvos no scratchpad da sessão anterior se ainda existirem, ou regerar um "antes" a partir do commit anterior a esta fase se não existirem mais).

Métricas a conferir, por dia:
- Contagem de confirmadas (`CONFIRMADO (GPS)`) — não pode colapsar nem inflar sem explicação.
- Contagem de `VEÍCULO SEM MOVIMENTO NO DIA` — não pode voltar a subir sem justificativa (era o bug corrigido mais cedo hoje).
- Quantas placas/dias tiveram `apagaoDeSinal: true` — é a medida direta de quanto a nova checagem está custando em fallback pra Unitrac. Reportar esse número explicitamente; a spec já assumiu esse custo como aceitável, mas precisa ser visível.

- [ ] **Step 4: Rodar o dia de Rio Quality disponível**

Usar `scripts/gerar-rioquality-real-arquivo.ts` (ou a rota) com o dado real mais recente disponível para Rio Quality. Comparar confirmadas antes/depois — não pode piorar em relação ao pipeline atual (Unitrac direta).

- [ ] **Step 5: Escrever o resultado na spec**

Acrescentar uma seção "Resultado medido" ao fim de `docs/superpowers/specs/2026-09-14-motor-confirmacao-posicao-bruta-design.md`, com as tabelas antes/depois dos dias testados e a contagem de apagões detectados.

- [ ] **Step 6: Commitar**

---

## Fora do escopo desta fase

- Persistir as paradas da Unitrac no momento da geração, para que reprocessar um dia antigo use exatamente a mesma entrada que gerou os números originais (mencionado como "próximo passo" no comentário histórico de `unitrac.ts`, não pedido nesta fase).
- Granularidade de apagão por parada individual em vez de por placa/dia inteiro (ver seção 2a da spec — decisão deliberada de manter simples).
- Qualquer mudança em geocodificação, `buscarAlvosDoDia`, `buscarFrota`, ou na classificação BASE/FORA_BASE de `derivarParadas`.
- Agrupar em lote as chamadas da Rio Quality à ponte (uma por placa nesta fase) — só se a medição da Task 7 mostrar necessidade.
