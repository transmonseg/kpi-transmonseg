# KPI de Romaneio — Nutry Max do zero, Implementation Plan

> **Para agentes:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans pra executar este plano task-by-task.

**Goal:** Destruir os três geradores de KPI da Nutry Max (nenhum produz o formato real usado) e reconstruir do zero um pipeline por carga que confirma entrega via status da Unitrac (nunca via coordenada da Unitrac, que tem erro conhecido) e via GPS real contra perímetro geocodificado por nós.

**Architecture:** Escala (planejado) + Romaneio (executado, documental) → geocodificação diária de cada endereço (reuso do pipeline do monitoramento via HTTP local) → cruzamento com Unitrac `/alvos` (status/NF, nunca coordenada) + GPS real (`buscarStopsCru`/`consolidaParadasApi`, incluindo o campo `fim_real` recém-adicionado) → perímetro próprio decide chegada/saída/tempo por ponto → agregação por carga → XLSX no formato exato da amostra.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Vitest, ExcelJS, Supabase (Postgres/Storage), `pdf-parse` + `pdfjs-serverless` (extração de PDF), API Unitrac.

**Spec:** `docs/superpowers/specs/2026-08-23-kpi-romaneio-nutrimax-design.md`

## Global Constraints

- **Espelhamento em 2 repos, sempre.** `/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg` (main, canônico) e `/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP` (main, fork/deploy). Todo arquivo alterado tem que ficar byte-idêntico nos dois — trabalhe no `KPI transmonseg`, copie, confirme com `diff`, commit nos dois com a mesma mensagem.
- **Não tocar:** `src/lib/kpi/*` (motor do Benassi), `src/app/api/kpi/simples/*`, e os dois commits já aplicados nesta sessão (`fim_real` em `matcher.ts`/`consolida.ts`/`types/unitrac.ts`, e o fix de `escala-geral.ts`) — já estão prontos e fora do escopo desta reconstrução.
- **Não tocar** no projeto monitoramento além do que a Task 3 decidir ser estritamente necessário pra expor geocodificação — o motor de desvio e a Central não podem mudar de comportamento.
- **Nada de deploy nem migration em produção sem perguntar** — cada task que tocar o banco (Task 1, Task 10) para antes de aplicar e pede autorização explícita.
- `cod_user_unitrac` da Nutry Max = `'4096'` — confirme contra `src/lib/kpi-nutrimax/constants.ts` antes de apagar (Task 1), e leve o valor adiante.
- Comandos padrão do projeto: `npm test` (vitest), `npm run lint`, `npm run build` (o typecheck acontece dentro do build, não existe script dedicado).
- Todo comentário em código explica o PORQUÊ (uma decisão não óbvia, um dado real que motivou o valor), nunca o QUE (o nome já diz).

---

### Task 1: Destruição completa do pipeline antigo

**Files:**
- Delete: `src/lib/kpi-nutrimax/` (diretório inteiro — todos os `.ts`/`.test.ts`: `gerador.ts`, `gerador-kpi-loja.ts`, `gerador-romaneio-conferencia.ts`, `matcher.ts`, `api-paradas.ts`, `confirma-endereco.ts`, `parse-romaneio.ts`, `parse-escala.ts`, `parse-xlsx.ts`, `cobertura.ts`, `historico.ts`, `resumo-viagem.ts`, `km-ors.ts`, `kpi-loja.ts`, `romaneio-conferencia.ts`, `types.ts`, `constants.ts`, e todos os `.test.ts` correspondentes)
- Delete: `src/app/api/kpi-nutrimax/upload/route.ts` (e o diretório `src/app/api/kpi-nutrimax/` se ficar vazio)
- Delete: `src/app/api/kpi/nutrimax/romaneio/route.ts`
- Delete: `src/app/api/kpi/nutrimax/historico/reabrir/route.ts`
- Delete: `src/app/painel/nutrimax/dashboard/` (diretório inteiro)
- Delete: `src/app/painel/nutrimax/historico/` (diretório inteiro)
- Delete: `src/app/painel/nutrimax/inserir/` (diretório inteiro)
- Delete: `src/app/painel/nutrimax/romaneio/` (diretório inteiro)
- Delete: `scripts/geocodificar-clientes-nutrimax.ts`
- **NÃO apagar ainda:** `src/app/api/kpi/nutrimax/gerar/route.ts` e `src/app/painel/nutrimax/gerar/page.tsx` — ficam vazios/quebrados temporariamente (import de módulo apagado); serão reescritos na Task 9. Deixe uma nota `// TODO(Task 9): reescrever do zero, ver docs/superpowers/plans/2026-08-23-kpi-romaneio-nutrimax.md` no topo de cada um por enquanto, e comente todo o corpo que quebrar o build (ou o build vai falhar até a Task 9 — tudo bem, as próximas tasks não dependem de build passando até a Task 9 inclusive, mas rode `npm run lint`/`npm test` normalmente, que não tocam essas duas rotas se ficarem comentadas).
- Create: `supabase/migrations/<timestamp>_drop_kpi_nutrimax_antigo.sql` (timestamp no formato `YYYYMMDDHHMMSS`, maior que o mais recente em `supabase/migrations/`)
- Remove: worktree `.claude/worktrees/nutrimax-kpi-correcoes` (branch `worktree-nutrimax-kpi-correcoes`)
- Delete: `docs/superpowers/plans/2026-07-28-nutrimax-kpi-correcoes.md` (não commitado, arquivo solto — confirme com `git status` que está mesmo untracked antes de apagar)

**Step 1: Confirmar o valor de `cod_user_unitrac` antes de apagar**

```bash
grep -n "COD_USER_NUTRIMAX\|cod_user_unitrac" src/lib/kpi-nutrimax/constants.ts src/lib/kpi-nutrimax/*.ts
```
Expected: encontra `'4096'` associado à Nutry Max. Anote — vai ser usado nas Tasks 6+.

**Step 2: Confirmar que o worktree órfão não tem nada além do já sabido**

```bash
git -C .claude/worktrees/nutrimax-kpi-correcoes log --oneline main..worktree-nutrimax-kpi-correcoes
git -C .claude/worktrees/nutrimax-kpi-correcoes status --short
```
Expected: só os commits já identificados (`9bc9a6f`, `b1d6cf6`, `c84a456`, `74814b6`, `04b2e0f` — ajustes de dwell mínimo escopados pra Nutry Max, sobre o pipeline sendo destruído) e um único arquivo untracked (a planilha "ESCALA DO ARMAZÉM DO GRÃO MAIO.xlsx", que não é desta feature — não precisa preservar, mas não é motivo pra travar a remoção). Se aparecer qualquer coisa muito diferente disso (ex: trabalho não relacionado a Nutrimax/dwell), PARE e reporte — não remova sem entender o que é.

**Step 3: Remover o worktree**

```bash
git worktree remove .claude/worktrees/nutrimax-kpi-correcoes --force
git worktree prune
git branch -D worktree-nutrimax-kpi-correcoes
```
Expected: worktree e branch removidos, `git worktree list` não mostra mais nada além do repo principal.

**Step 4: Apagar o plano solto obsoleto**

```bash
git status --short docs/superpowers/plans/2026-07-28-nutrimax-kpi-correcoes.md
```
Expected: `??` (untracked). Se for esse o caso:
```bash
rm docs/superpowers/plans/2026-07-28-nutrimax-kpi-correcoes.md
```

**Step 5: Apagar a biblioteca, rotas e painéis**

```bash
git rm -r src/lib/kpi-nutrimax/
git rm -r src/app/api/kpi-nutrimax/
git rm src/app/api/kpi/nutrimax/romaneio/route.ts
git rm src/app/api/kpi/nutrimax/historico/reabrir/route.ts
git rm -r src/app/painel/nutrimax/dashboard/
git rm -r src/app/painel/nutrimax/historico/
git rm -r src/app/painel/nutrimax/inserir/
git rm -r src/app/painel/nutrimax/romaneio/
git rm scripts/geocodificar-clientes-nutrimax.ts
```
Expected: cada comando lista os arquivos removidos, sem erro.

**Step 6: Neutralizar temporariamente as duas rotas que sobrevivem**

Abra `src/app/api/kpi/nutrimax/gerar/route.ts` e `src/app/painel/nutrimax/gerar/page.tsx`. Comente o corpo inteiro (ou substitua por um placeholder mínimo que compile — ex. a rota retorna `NextResponse.json({ erro: 'em reconstrucao' }, { status: 503 })`, a página renderiza `<p>Em reconstrução — ver Task 9.</p>`), removendo todos os imports de `@/lib/kpi-nutrimax/*` (que não existe mais). Isso é temporário e será substituído por completo na Task 9 — não tente fazer funcionar de verdade agora.

**Step 7: Rodar lint e test pra confirmar que nada mais referencia o que foi apagado**

```bash
npm run lint
npm test
```
Expected: sem erro de import quebrado. Pode haver testes de OUTRAS features falhando por razões pré-existentes — se acontecer, rode `git stash && npm test` pra comparar contra o baseline antes desta task, documente no report se algo já falhava antes.

**Step 8: Migration de DROP das 4 tabelas**

Primeiro confirme os nomes exatos:
```bash
ls supabase/migrations/ | grep -i nutrimax
```
Depois crie `supabase/migrations/<novo_timestamp>_drop_kpi_nutrimax_antigo.sql`:

```sql
-- Destrói o pipeline antigo de KPI da Nutry Max (nunca usado em produção real,
-- só teste — decisão do usuário 2026-08-23, ver
-- docs/superpowers/specs/2026-08-23-kpi-romaneio-nutrimax-design.md).
-- Substituído por um pipeline novo que confirma entrega via status da
-- Unitrac (nunca via coordenada, que tem erro conhecido) + geofence próprio
-- geocodificado a partir do romaneio do dia.
drop table if exists kpi_nutrimax_entradas;
drop table if exists kpi_nutrimax_status_placa_flags;
drop table if exists kpi_nutrimax_geracoes;
drop table if exists nutrimax_clientes_geo;
```

**NÃO aplique esta migration ainda.** Ela é aplicada só depois que todo o resto do plano estiver pronto e revisado (ou antes, se o controller decidir que faz sentido aplicar cedo — mas sempre com autorização explícita do usuário antes do `supabase db push`/equivalente, nunca automático).

**Step 9: Commit**

```bash
git add -A
git commit -m "chore: destroi pipeline antigo de KPI da Nutry Max (nunca usado em producao)

Os 3 geradores existentes (gerador.ts, gerador-kpi-loja.ts,
gerador-romaneio-conferencia.ts) nao produzem o formato real usado
(KPI-Nutry-Max-{data}.xlsx por carga com SAIDA CD/CHEGADA CD/TEMPO
OPERACAO). Decisao do usuario: destruir tudo e reconstruir com Unitrac
como fonte de STATUS (nunca de localizacao -- coordenada tem erro
conhecido) + geofence proprio geocodificado do romaneio do dia.

Ver docs/superpowers/specs/2026-08-23-kpi-romaneio-nutrimax-design.md"
```

**Step 10: Espelhar no repo TEMP**

```bash
cd "../KPI TEMP"
git rm -r src/lib/kpi-nutrimax/ src/app/api/kpi-nutrimax/ \
  src/app/api/kpi/nutrimax/romaneio/route.ts \
  src/app/api/kpi/nutrimax/historico/reabrir/route.ts \
  src/app/painel/nutrimax/dashboard/ src/app/painel/nutrimax/historico/ \
  src/app/painel/nutrimax/inserir/ src/app/painel/nutrimax/romaneio/ \
  scripts/geocodificar-clientes-nutrimax.ts
cp "../KPI transmonseg/src/app/api/kpi/nutrimax/gerar/route.ts" src/app/api/kpi/nutrimax/gerar/route.ts
cp "../KPI transmonseg/src/app/painel/nutrimax/gerar/page.tsx" src/app/painel/nutrimax/gerar/page.tsx
cp "../KPI transmonseg/supabase/migrations/<novo_timestamp>_drop_kpi_nutrimax_antigo.sql" "supabase/migrations/<novo_timestamp>_drop_kpi_nutrimax_antigo.sql"
diff -rq src/app/api/kpi/nutrimax/gerar/route.ts "../KPI transmonseg/src/app/api/kpi/nutrimax/gerar/route.ts"
diff -rq src/app/painel/nutrimax/gerar/page.tsx "../KPI transmonseg/src/app/painel/nutrimax/gerar/page.tsx"
```
Expected: `diff -rq` sem saída (idêntico). Commit com a mesma mensagem do Step 9. **Não dê push ainda** — só depois que o controller revisar a task.

---

### Task 2: Estrutura nova + tipos

**Files:**
- Create: `src/lib/kpi-romaneio/types.ts`
- Create: `src/lib/kpi-romaneio/constants.ts`
- Test: `src/lib/kpi-romaneio/constants.test.ts`

**Step 1: Criar os tipos base**

```ts
// src/lib/kpi-romaneio/types.ts

/** Uma linha do Romaneio de Entrega -- um cliente dentro de uma carga/placa. */
export type LinhaRomaneio = {
  carga: string
  destino: string
  placa: string
  motorista: string
  ajudantes: string[]
  nf: string
  clienteCodigo: string
  clienteNome: string
  endereco: string
}

/** Uma linha da Escala de Rota -- o planejado. */
export type LinhaEscala = {
  carga: string
  placaRaw: string
  placaNorm: string
  destino: string
  motorista: string
  ajudante1: string | null
  ajudante2: string | null
  pesoKg: number | null
  entPlanejado: number | null
  nfPlanejado: number | null
}

/** LinhaRomaneio + coordenada, quando a geocodificacao deu certo. Ausencia
 *  de lat/lng NAO bloqueia o resto do pipeline -- ver secao "Tratamento de
 *  erro" da spec: status da linha ainda pode vir confirmado via Unitrac. */
export type LinhaGeocodificada = LinhaRomaneio & {
  lat: number | null
  lng: number | null
}

/** Uma visita confirmada por GPS dentro do perimetro PROPRIO (nunca o raio
 *  que a Unitrac cadastra para o alvo -- ver spec, secao "Descoberta que
 *  mudou o desenho duas vezes"). */
export type Visita = {
  nf: string
  chegada: string // ISO
  saida: string // ISO (fim_real do cluster, nao a chegada do proximo)
  distanciaMetrosDoPonto: number
}

export type StatusEntrega = 'confirmado_unitrac' | 'confirmado_gps' | 'pendente'

/** Uma linha de saida, cliente dentro de uma carga -- usada internamente
 *  antes da agregacao por carga. */
export type LinhaConfirmada = LinhaGeocodificada & {
  status: StatusEntrega
  horaConfirmacao: string | null // ISO -- feitoISO do alvo, ou a chegada da Visita
}

/** Uma carga inteira, pronta pro XLSX -- exatamente as colunas da amostra. */
export type LinhaKpiRomaneio = {
  carga: string
  placa: string
  destino: string
  motorista: string
  ajudante1: string | null
  ajudante2: string | null
  pesoKg: number | null
  clientesPlanejados: number | null
  nfPlanejado: number | null
  paradasReais: number
  kmPercorrido: number | null
  saidaCd: string | null // ISO
  chegadaCd: string | null // ISO
  tempoOperacaoMin: number | null
  status: 'OK' | 'INCOMPLETO'
}
```

**Step 2: Migrar as constantes de base (dado real, não reinventar)**

```ts
// src/lib/kpi-romaneio/constants.ts

/** Codigo da conta Nutry Max na Unitrac. */
export const COD_USER_NUTRIMAX = '4096'

/** Nome cadastrado da garagem/CD da Nutry Max no Unitrac -- aparece em
 *  `local_parada` como "BASE - BASE GARAGEM, ...". Diferente do Benassi
 *  ("BASE BENASSI"). Migrado de kpi-nutrimax/constants.ts (destruido na
 *  Task 1) -- valor derivado de dado real, nao muda com a reconstrucao. */
export const MARCADOR_BASE_NUTRIMAX = 'BASE - BASE GARAGEM'

/** Coordenada do CD/garagem da Nutry Max em Penha (RJ) -- media de 48
 *  paradas reais classificadas BASE. */
export const BASE_COORD_NUTRIMAX = { lat: -22.816007, lng: -43.277827 }

/** Segunda garagem, Campos dos Goytacazes -- confirmada via GPS ao vivo
 *  (placas TUL1C38/TUI1A90 pernoitando la, ~238km de Penha, fora do raio
 *  da primeira base). Sem essa segunda coordenada, toda placa baseada em
 *  Campos nunca e reconhecida como BASE. */
export const BASE_COORD_NUTRIMAX_CAMPOS = { lat: -21.6886, lng: -41.3113 }

export const BASES_COORD_NUTRIMAX = [BASE_COORD_NUTRIMAX, BASE_COORD_NUTRIMAX_CAMPOS]

/** Raio de deteccao de base -- documentacional/cross-reference. O valor
 *  que REALMENTE vale em runtime e' RAIO_BASE_M em
 *  src/lib/unitrac-api/consolida.ts (tambem 500m hoje) -- consolidaParadasApi
 *  nao recebe raio como parametro, usa a constante interna dela. Se os dois
 *  valores divergirem no futuro, o de consolida.ts e' quem manda; atualize
 *  este comentario, nao passe este numero pra nenhuma chamada (nao ha
 *  parametro que aceite). */
export const RAIO_BASE_METROS = 500

/** Raio do perimetro PROPRIO em volta de cada ponto geocodificado do
 *  romaneio -- mesmo valor ja validado com dado real no projeto irmao
 *  monitoramento pra confirmacao de presenca por GPS (ajuste de 18/08,
 *  ver src/app/api/motor-romaneio/route.ts la). Comeca aqui como o mesmo
 *  valor por ser o unico dado real disponivel sobre precisao de
 *  geocodificacao de endereco brasileiro urbano -- reavaliar com dado
 *  real da Nutry Max especificamente depois da Task 11 (validacao). */
export const RAIO_ENTREGA_METROS = 300

/** `buscarStopsCru` so cobre as ultimas 48h (hoje + ontem) de forma
 *  garantida -- pedir data mais antiga devolve 0 veiculos em silencio.
 *  Migrado de kpi-nutrimax/constants.ts. */
export const DIAS_ALCANCE_API_HOJE_ONTEM = 1

export function foraDoAlcanceApi(data: string, hojeISO: string): boolean {
  const hoje = new Date(`${hojeISO}T00:00:00`).getTime()
  const alvo = new Date(`${data}T00:00:00`).getTime()
  const diffDias = Math.round((hoje - alvo) / 86_400_000)
  return diffDias > DIAS_ALCANCE_API_HOJE_ONTEM
}
```

Note: `foraDoAlcanceApi` mudou de assinatura -- recebe `hojeISO` como parâmetro em vez de chamar `hojeBR()` internamente, pra ficar testável sem depender de relógio real (o módulo antigo importava `hojeBR` de `@/lib/data-br`; mantemos essa função disponível pro chamador real passar `hojeBR()`, mas a função pura não conhece hora do sistema).

**Step 3: Teste de `foraDoAlcanceApi`**

```ts
// src/lib/kpi-romaneio/constants.test.ts
import { describe, it, expect } from 'vitest'
import { foraDoAlcanceApi } from './constants'

describe('foraDoAlcanceApi', () => {
  it('hoje esta dentro do alcance', () => {
    expect(foraDoAlcanceApi('2026-08-23', '2026-08-23')).toBe(false)
  })
  it('ontem esta dentro do alcance', () => {
    expect(foraDoAlcanceApi('2026-08-22', '2026-08-23')).toBe(false)
  })
  it('anteontem ja esta fora do alcance', () => {
    expect(foraDoAlcanceApi('2026-08-21', '2026-08-23')).toBe(true)
  })
})
```

**Step 4: Rodar o teste**

```bash
npx vitest run src/lib/kpi-romaneio/constants.test.ts
```
Expected: 3 passed.

**Step 5: Commit e espelhar**

```bash
git add src/lib/kpi-romaneio/
git commit -m "feat(kpi-romaneio): tipos e constantes base (migradas de kpi-nutrimax)"
```
Copie os 3 arquivos pro `KPI TEMP`, confirme com `diff`, commit igual.

---

### Task 3: Decisão e implementação da geocodificação (investigação + ponte)

**Contexto que a spec deixou pro plano decidir:** os dois projetos (`KPI transmonseg` e `monitoramento`) rodam no mesmo VPS (`transmonseg-vps`), como processos PM2 irmãos, repos e `node_modules` separados -- sem import direto possível.

**Step 1: Investigar o pipeline de geocodificação do monitoramento**

Leia, no repo `/Users/joaquimsalles/Projects/Transmonseg/monitoramento/MONITORAMENTO TEMP`:
- `src/lib/romaneio-llm-extrator.ts` -- é aqui que endereço vira coordenada?
- `src/app/api/romaneio/upload/route.ts` -- como essa rota chama a extração?
- `src/app/api/romaneio/processar-geocode/route.ts` -- geocodificação assíncrona hoje roda como cron; qual função pura ela chama?

Responda por escrito no report: existe uma função pura `endereco: string → Promise<{lat,lng} | null>` isolável, sem side-effect em `romaneio_pontos`? Se sim, qual arquivo/função exatamente.

**Step 2: Decidir o caminho**

- **Se existe função pura isolável:** crie uma rota HTTP nova e enxuta no projeto monitoramento, ex. `POST /api/geocode` (nome a definir por você olhando a convenção de nomes de rota já usada lá), que recebe `{ enderecos: string[] }` e devolve `{ resultados: Array<{lat:number,lng:number} | null> }` -- **sem gravar nada em `romaneio_pontos` ou qualquer tabela**, side-effect-free. Proteja com o mesmo padrão de header `x-motor-key` já usado nas rotas internas de lá (`process.env.MOTOR_SECRET`). Documente no topo do arquivo por que essa rota existe e quem a chama (o projeto KPI, via HTTP local).
- **Se não existir de forma limpa** (a extração está emaranhada com o LLM extractor + upload + persistência de um jeito que isolar seria arriscado ou grande): **não force**. Documente por que no report, e replique a lógica de geocodificação diretamente em `src/lib/kpi-romaneio/geocode.ts` (mesma técnica -- provavelmente um serviço de geocode como Nominatim/Google, ver o que `romaneio-llm-extrator.ts` usa por baixo -- mas um arquivo próprio, sem depender do projeto irmão).

Qualquer que seja o caminho, **não altere nenhum comportamento existente do monitoramento** além de, no caminho HTTP, adicionar a rota nova isolada.

**Step 3: Implementar `src/lib/kpi-romaneio/geocode.ts`**

Interface estável independente da decisão do Step 2 (quem consome não precisa saber qual caminho foi escolhido):

```ts
// src/lib/kpi-romaneio/geocode.ts
export type ResultadoGeocode = { lat: number; lng: number } | null

/** Geocodifica uma lista de enderecos brasileiros. Falha em um endereco
 *  individual NAO lanca -- devolve null naquela posicao (fail-open, ver
 *  spec: uma linha sem coordenada ainda pode ser confirmada via Unitrac). */
export async function geocodificarEnderecos(enderecos: string[]): Promise<ResultadoGeocode[]>
```

Implemente por dentro de acordo com a decisão do Step 2. Se for HTTP local, use `fetch` com timeout explícito (referência: 20s, mesmo valor usado no monitoramento pra chamadas de rede que podem pendurar -- ver `TIMEOUT_UNITRAC_MS` lá) -- nunca deixe uma chamada de geocodificação travar o pipeline inteiro sem limite.

**Step 4: Teste**

```ts
// src/lib/kpi-romaneio/geocode.test.ts
```
Teste unitário do parsing/tratamento de resposta (mock do `fetch` se HTTP, ou mock do serviço de geocode se replicado) -- casos: todos os endereços geocodificam, um falha no meio (fail-open, não derruba os outros), timeout de um endereço não trava os demais (se a implementação for sequencial, documente; se for paralela, teste que uma promise rejeitada não derruba `Promise.all` -- use `Promise.allSettled` ou equivalente).

**Step 5: Commit e espelhar** (nos 2 repos KPI; se a Step 2 criou rota nova no monitoramento, commit e espelhe **também** nos 2 repos do monitoramento -- `MONITORAMENTO TEMP` e `MONITORAMENTO transmonseg` -- seguindo a disciplina de espelhamento de lá).

---

### Task 4: Parser da Escala de Rota

**Files:**
- Create: `src/lib/kpi-romaneio/parse-escala.ts`
- Test: `src/lib/kpi-romaneio/parse-escala.test.ts`

**Contexto real que não pode ser reaprendido do zero (o arquivo antigo já foi apagado na Task 1 -- estes fatos sobrevivem porque são sobre um PDF externo que o cliente manda, não sobre a arquitetura que estamos jogando fora):**

- `pdf-parse` **trava** ("Illegal character: 41") especificamente no PDF de Escala da Nutry Max ("8081 - Escala de Rota"). Use `pdfjs-serverless` (`import { getDocument } from 'pdfjs-serverless'`), preservando X/Y de cada fragmento de texto -- mesma técnica de `src/lib/parsers/unitrac-pdf-coord.ts` (leia esse arquivo como referência de como já se faz isso neste repo).
- O layout usa colunas por faixa de X porque o PDF às vezes gruda células adjacentes num único item de texto e às vezes não (varia com o tamanho do conteúdo). Faixas conhecidas de uma versão real do relatório (ponto de partida, **confirme/ajuste contra um PDF real da Nutry Max antes de considerar pronto** -- pode ter mudado):
  - Carga: X entre 8 e 28, regex `^\d{4,6}$`
  - Veículo/placa: X entre 35 e 60, placa via regex `([A-Z]{3}[\s-]?\d[A-Z0-9]\d{2}|[A-Z]{3}[\s-]?\d{4})$`
  - Destino: X entre 85 e 145
  - Peso: X entre 188 e 216
  - ENT planejado: X entre 216 e 231
  - NF planejado + motorista (grudados): X entre 231 e 398, regex `^(\d+)\s+(.+)$` (grupo 1 = NF, grupo 2 = motorista)
  - Ajudante 1: X entre 398 e 558
  - Ajudante 2: X entre 558 e 715

**Step 1: Escreva a função pura primeiro, com teste sintético (sem PDF real ainda)**

```ts
// src/lib/kpi-romaneio/parse-escala.ts
import { getDocument } from 'pdfjs-serverless'
import type { LinhaEscala } from './types'

export type ItemTexto = { str: string; x: number }
type ItemComLinha = ItemTexto & { y: number; page: number }
type LinhaVisual = { y: number; page: number; items: ItemTexto[] }

const CARGA_RE = /^\d{4,6}$/
const PLACA_RE = /([A-Z]{3}[\s-]?\d[A-Z0-9]\d{2}|[A-Z]{3}[\s-]?\d{4})$/
const NF_MOTORISTA_RE = /^(\d+)\s+(.+)$/

function itensEmFaixa(items: ItemTexto[], min: number, max: number): ItemTexto[] {
  return items.filter(it => it.x >= min && it.x < max).sort((a, b) => a.x - b.x)
}

function textoEmFaixa(items: ItemTexto[], min: number, max: number): string {
  return itensEmFaixa(items, min, max).map(it => it.str.trim()).filter(Boolean).join(' ').trim()
}

function normalizaPlaca(p: string): string {
  return p.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Pura -- recebe os itens de UMA linha visual (ja agrupados por Y) e
 *  devolve a linha da escala, ou null se nao for linha de dado. */
export function linhaParaEscala(items: ItemTexto[]): LinhaEscala | null {
  const cargaItem = itensEmFaixa(items, 8, 28)[0]
  if (!cargaItem || !CARGA_RE.test(cargaItem.str.trim())) return null

  const veiculoRaw = textoEmFaixa(items, 35, 60)
  const placaM = veiculoRaw.match(PLACA_RE)
  if (!placaM) return null
  const placaRaw = placaM[1].trim()

  const destino = textoEmFaixa(items, 85, 145)
  const pesoRaw = itensEmFaixa(items, 188, 216)[0]?.str.trim() ?? null
  const entRaw = itensEmFaixa(items, 216, 231)[0]?.str.trim() ?? null
  const nfMotoristaRaw = textoEmFaixa(items, 231, 398)
  const ajudante1 = textoEmFaixa(items, 398, 558) || null
  const ajudante2 = textoEmFaixa(items, 558, 715) || null

  const nfM = nfMotoristaRaw.match(NF_MOTORISTA_RE)
  const nfPlanejado = nfM ? parseInt(nfM[1], 10) : null
  const motorista = nfM ? nfM[2].trim() : nfMotoristaRaw

  return {
    carga: cargaItem.str.trim(),
    placaRaw,
    placaNorm: normalizaPlaca(placaRaw),
    destino,
    motorista,
    ajudante1,
    ajudante2,
    pesoKg: pesoRaw ? parseInt(pesoRaw.replace(/\./g, ''), 10) : null,
    entPlanejado: entRaw ? parseInt(entRaw, 10) : null,
    nfPlanejado,
  }
}

function agruparPorLinha(items: ItemComLinha[], tol = 3): LinhaVisual[] {
  const sorted = [...items].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page
    if (Math.abs(a.y - b.y) > tol) return b.y - a.y
    return a.x - b.x
  })
  const linhas: LinhaVisual[] = []
  for (const it of sorted) {
    const last = linhas[linhas.length - 1]
    if (last && it.page === last.page && Math.abs(last.y - it.y) <= tol) {
      last.items.push(it)
    } else {
      linhas.push({ y: it.y, page: it.page, items: [it] })
    }
  }
  return linhas
}

export async function parseEscala(buffer: Buffer): Promise<LinhaEscala[]> {
  const pdf = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise
  const items: ItemComLinha[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    for (const item of content.items) {
      if (!('str' in item)) continue
      const it = item as { str: string; transform: number[] }
      if (!it.str.trim()) continue
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], page: p })
    }
  }
  const linhas = agruparPorLinha(items)
  return linhas.map(l => linhaParaEscala(l.items)).filter((l): l is LinhaEscala => l !== null)
}
```

**Step 2: Teste sintético de `linhaParaEscala`**

```ts
// src/lib/kpi-romaneio/parse-escala.test.ts
import { describe, it, expect } from 'vitest'
import { linhaParaEscala } from './parse-escala'

function item(str: string, x: number) { return { str, x } }

describe('linhaParaEscala', () => {
  it('extrai uma linha completa', () => {
    const items = [
      item('93758', 10),
      item('TTL7D40', 40),
      item('CAMPOS', 90),
      item('1.200', 190),
      item('8', 220),
      item('12 LUAN VIANA AREAS RIBEIRO', 240),
      item('LEANDRO DA HORA BATISTA', 400),
    ]
    const linha = linhaParaEscala(items)
    expect(linha).toEqual({
      carga: '93758',
      placaRaw: 'TTL7D40',
      placaNorm: 'TTL7D40',
      destino: 'CAMPOS',
      motorista: 'LUAN VIANA AREAS RIBEIRO',
      ajudante1: 'LEANDRO DA HORA BATISTA',
      ajudante2: null,
      pesoKg: 1200,
      entPlanejado: 8,
      nfPlanejado: 12,
    })
  })

  it('linha sem carga valida (cabecalho/titulo) volta null', () => {
    expect(linhaParaEscala([item('CARGA', 10), item('PLACA', 40)])).toBeNull()
  })

  it('linha sem placa reconhecivel volta null', () => {
    expect(linhaParaEscala([item('93758', 10), item('texto qualquer', 40)])).toBeNull()
  })
})
```

**Step 3: Rodar o teste**

```bash
npx vitest run src/lib/kpi-romaneio/parse-escala.test.ts
```
Expected: 3 passed.

**Step 4: Commit e espelhar**

---

### Task 5: Parser do Romaneio de Entrega

**Files:**
- Create: `src/lib/kpi-romaneio/parse-romaneio.ts`
- Test: `src/lib/kpi-romaneio/parse-romaneio.test.ts`

**Formato real do texto extraído** (confirmado contra um PDF real de 20/08/2026 -- `pdf-parse` já funciona bem nesse documento, ao contrário do de Escala): cada carga vem como um bloco:

```
CARGA/DESTINO:  96149 / ITAPERUNA          PLACA/MOTORISTA:  RQU6E83 / JOBERTO DA MATA REIS
AJUDANTE(S):  ,

NF / CLIENTE: 2331233 / 136063 - RESTAURANTE CAIÇARA
ROD BR 356, S/N - BOA FORTUNA, ITAPERUNA - KM 03
NF / CLIENTE: 2331234 / 136347 - MERCADO IDEAL
RUA OLIVIA FARIA, 29 - CENTRO, ITALVA - *
...
Total de 38 clientes
```

Note que o texto extraído por `pdf-parse` gruda `PLACA/MOTORISTA:` **depois** de `CARGA/DESTINO:` na mesma linha visual, mesmo a ordem no PDF sendo a mostrada acima (a extração linear do pdf-parse não preserva ordem de coluna) -- o regex de cabeçalho precisa casar os dois campos na mesma linha, capturando primeiro o que vem primeiro no TEXTO (placa/motorista), não no layout visual.

**Step 1: Implementação**

```ts
// src/lib/kpi-romaneio/parse-romaneio.ts
import type { LinhaRomaneio } from './types'

const HEADER_RE = /^PLACA\/MOTORISTA:(.+?)\s*\/\s*(.+?)CARGA\/DESTINO:(\d+)\s*\/\s*(.+)$/
const AJUDANTE_RE = /^AJUDANTE\(S\):(.*)$/
const NF_CLIENTE_RE = /^(\d+)\s*\/\s*(\d+)\s*-\s*(.+)$/
const FIM_CLIENTE_RE = /^NF\s*\/\s*CLIENTE:\s*$/
const TOTAL_RE = /^Total de \d+ clientes?$/i

type Contexto = { carga: string; destino: string; placa: string; motorista: string; ajudantes: string[] }

/** Pura -- recebe o texto ja extraido (pdf-parse) e devolve as linhas.
 *  Separada do I/O de PDF pra ser testavel sem PDF real. */
export function parseRomaneioTexto(texto: string): LinhaRomaneio[] {
  const linhas: LinhaRomaneio[] = []
  let ctx: Contexto | null = null
  let pendente: { nf: string; codigo: string; nome: string } | null = null

  for (const raw of texto.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    const h = line.match(HEADER_RE)
    if (h) {
      ctx = { placa: h[1].trim(), motorista: h[2].trim(), carga: h[3], destino: h[4].trim(), ajudantes: [] }
      pendente = null
      continue
    }
    if (!ctx) continue

    const aj = line.match(AJUDANTE_RE)
    if (aj) {
      ctx.ajudantes = aj[1].split(',').map(s => s.trim()).filter(Boolean)
      continue
    }
    if (TOTAL_RE.test(line) || FIM_CLIENTE_RE.test(line)) {
      pendente = null
      continue
    }

    const nfM = line.match(NF_CLIENTE_RE)
    if (nfM && !pendente) {
      pendente = { nf: nfM[1], codigo: nfM[2], nome: nfM[3].trim() }
      continue
    }
    if (pendente) {
      linhas.push({
        carga: ctx.carga,
        destino: ctx.destino,
        placa: ctx.placa,
        motorista: ctx.motorista,
        ajudantes: ctx.ajudantes,
        nf: pendente.nf,
        clienteCodigo: pendente.codigo,
        clienteNome: pendente.nome,
        endereco: line,
      })
      pendente = null
    }
  }
  return linhas
}

export async function parseRomaneio(buffer: Buffer): Promise<LinhaRomaneio[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
  const { text } = await pdfParse(buffer)
  return parseRomaneioTexto(text)
}
```

**Step 2: Teste**

```ts
// src/lib/kpi-romaneio/parse-romaneio.test.ts
import { describe, it, expect } from 'vitest'
import { parseRomaneioTexto } from './parse-romaneio'

const TEXTO_EXEMPLO = `
PLACA/MOTORISTA:  RQU6E83 / JOBERTO DA MATA REIS          CARGA/DESTINO:96149 / ITAPERUNA
AJUDANTE(S):  ,

NF / CLIENTE: 2331233 / 136063 - RESTAURANTE CAIÇARA
ROD BR 356, S/N - BOA FORTUNA, ITAPERUNA - KM 03
NF / CLIENTE: 2331234 / 136347 - MERCADO IDEAL
RUA OLIVIA FARIA, 29 - CENTRO, ITALVA - *
Total de 2 clientes
`

describe('parseRomaneioTexto', () => {
  it('extrai as linhas de um bloco de carga', () => {
    const linhas = parseRomaneioTexto(TEXTO_EXEMPLO)
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toEqual({
      carga: '96149',
      destino: 'ITAPERUNA',
      placa: 'RQU6E83',
      motorista: 'JOBERTO DA MATA REIS',
      ajudantes: [],
      nf: '2331233',
      clienteCodigo: '136063',
      clienteNome: 'RESTAURANTE CAIÇARA',
      endereco: 'ROD BR 356, S/N - BOA FORTUNA, ITAPERUNA - KM 03',
    })
  })

  it('duas cargas seguidas nao vazam contexto uma na outra', () => {
    const dupla = TEXTO_EXEMPLO + `
PLACA/MOTORISTA:  TTL5J17 / OUTRO MOTORISTA          CARGA/DESTINO:96150 / OUTRO DESTINO
AJUDANTE(S):  ,

NF / CLIENTE: 9999999 / 000000 - OUTRO CLIENTE
RUA X, 1 - BAIRRO, CIDADE - *
`
    const linhas = parseRomaneioTexto(dupla)
    expect(linhas).toHaveLength(3)
    expect(linhas[2].carga).toBe('96150')
    expect(linhas[2].placa).toBe('TTL5J17')
  })

  it('ajudantes preenchidos sao separados corretamente', () => {
    const comAjudantes = TEXTO_EXEMPLO.replace('AJUDANTE(S):  ,', 'AJUDANTE(S): FULANO DE TAL, CICLANO')
    const linhas = parseRomaneioTexto(comAjudantes)
    expect(linhas[0].ajudantes).toEqual(['FULANO DE TAL', 'CICLANO'])
  })
})
```

**Step 3: Rodar o teste**

```bash
npx vitest run src/lib/kpi-romaneio/parse-romaneio.test.ts
```
Expected: 3 passed.

**Step 4: Commit e espelhar**

---

### Task 6: Integração Unitrac (status + GPS)

**Files:**
- Create: `src/lib/kpi-romaneio/unitrac.ts`
- Test: `src/lib/kpi-romaneio/unitrac.test.ts`

**Investigação obrigatória antes de escrever código** (as assinaturas abaixo foram confirmadas por leitura de código nesta sessão, mas confirme de novo, os arquivos podem ter mudado):

```bash
grep -n "export type AlvoApi" -A 20 src/lib/unitrac-api/alvos.ts
grep -n "export async function buscarAlvos\|export async function buscarFrota\|export async function buscarStopsCru" src/lib/unitrac-api/*.ts
grep -n "export function consolidaParadasApi" -A 15 src/lib/unitrac-api/consolida.ts
grep -n "export type MapaPontos" -A 3 src/lib/unitrac-api/pontos.ts
```

Confirme especificamente: `consolidaParadasApi(eventos, pontos, data, placaNorm, baseCoord)` aceita `pontos: MapaPontos = {}` (objeto vazio) sem lançar erro, e nesse caso **nunca classifica nenhum cluster como `LOJA`** (porque não há geofence pra casar) -- todo cluster fora do raio de base vira `FORA_BASE`. **Isso é o que queremos**: não usamos a geofence da Unitrac pra loja (ela tem erro conhecido), só pra BASE. Se o comportamento não for esse, documente no report e ajuste a estratégia (ex.: filtrar/reclassificar `LOJA` como `FORA_BASE` depois de chamar a função, em vez de confiar em `pontos={}`).

**Step 1: Implementação**

```ts
// src/lib/kpi-romaneio/unitrac.ts
import { buscarFrota, buscarAlvos, buscarStopsCru, consolidaParadasApi, type AlvoApi } from '@/lib/unitrac-api'
// UnitracParadaRow é definido em matcher.ts (Benassi), não em unitrac-api --
// consolida.ts importa de lá mas não reexporta. Confirme com
// `grep -n "export.*UnitracParadaRow" src/lib/kpi/matcher.ts src/lib/unitrac-api/*.ts`
// antes de escrever este import -- se a organização mudou desde que este
// plano foi escrito, ajuste a origem.
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { COD_USER_NUTRIMAX, BASES_COORD_NUTRIMAX } from './constants'

export async function buscarAlvosDoDia(placas: string[]): Promise<AlvoApi[]> {
  const frota = await buscarFrota(COD_USER_NUTRIMAX)
  const cvs = frota.filter(v => placas.includes(v.placaNorm)).map(v => v.cv)
  if (cvs.length === 0) return []
  return buscarAlvos(cvs)
}

/** GPS real do dia pra uma placa, classificado so em BASE/FORA_BASE --
 *  NUNCA LOJA (a geofence de loja da Unitrac tem erro conhecido, nao
 *  usamos ela pra decidir visita -- ver montarVisitas.ts). */
export async function buscarParadasDoDia(cv: string, placaNorm: string, data: string, horas: number): Promise<UnitracParadaRow[]> {
  const eventos = await buscarStopsCru(cv, horas)
  // pontos={} garante que consolidaParadasApi nunca resolve geofence de
  // loja -- todo cluster fora da base vira FORA_BASE, que e exatamente
  // a granularidade que queremos (a classificacao real de visita e
  // nossa, feita em montarVisitas.ts contra o endereco geocodificado).
  return consolidaParadasApi(eventos, {}, data, placaNorm, BASES_COORD_NUTRIMAX)
}
```

**Step 2: Teste** (mock de `buscarFrota`/`buscarAlvos`/`buscarStopsCru`/`consolidaParadasApi` -- ver como outros arquivos do projeto já mockam `@/lib/unitrac-api`, ex. `src/lib/kpi/matcher.test.ts` ou testes de `src/app/api/kpi/simples/route.ts` se existirem, pra seguir o mesmo padrão de mock)

Casos: `buscarAlvosDoDia` filtra a frota certa pelas placas pedidas; placa sem correspondência na frota não gera CV, não quebra; `buscarParadasDoDia` chama `consolidaParadasApi` com `pontos={}` e `BASES_COORD_NUTRIMAX` (as duas bases).

**Step 3: Rodar teste, commit, espelhar**

---

### Task 7: Perímetro + dwell (`montarVisitas`) e agregação por carga

**Files:**
- Create: `src/lib/kpi-romaneio/visitas.ts`
- Create: `src/lib/kpi-romaneio/agregacao.ts`
- Test: `src/lib/kpi-romaneio/visitas.test.ts`
- Test: `src/lib/kpi-romaneio/agregacao.test.ts`

**Step 1: `montarVisitas` -- perímetro próprio, nunca o raio da Unitrac**

```ts
// src/lib/kpi-romaneio/visitas.ts
import { haversine } from '@/lib/utils/geo'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { LinhaGeocodificada, Visita } from './types'
import { RAIO_ENTREGA_METROS } from './constants'

/** Pra cada linha geocodificada da placa, acha a parada FORA_BASE cujo
 *  centro do cluster caiu dentro do nosso raio -- nunca do raio que a
 *  Unitrac cadastrou pro alvo (esse tem erro conhecido, ver spec).
 *  Quando duas linhas geocodificadas ficam perto uma da outra, cada
 *  parada e atribuida ao ponto MAIS PROXIMO (nao ao primeiro que bate),
 *  pra nao "roubar" a visita de um ponto vizinho. */
export function montarVisitas(
  linhas: LinhaGeocodificada[],
  paradas: UnitracParadaRow[],
): Map<string, Visita> {
  // nf -> Visita
  const visitas = new Map<string, Visita>()
  const linhasComCoord = linhas.filter((l): l is LinhaGeocodificada & { lat: number; lng: number } => l.lat != null && l.lng != null)

  for (const parada of paradas) {
    if (parada.classificacao !== 'FORA_BASE') continue
    if (parada.lat == null || parada.lng == null) continue

    let melhor: { linha: LinhaGeocodificada; dist: number } | null = null
    for (const linha of linhasComCoord) {
      const dist = haversine(parada.lat, parada.lng, linha.lat as number, linha.lng as number)
      if (dist > RAIO_ENTREGA_METROS) continue
      if (!melhor || dist < melhor.dist) melhor = { linha, dist }
    }
    if (!melhor) continue

    const existente = visitas.get(melhor.linha.nf)
    // se ja existe visita pra essa NF, fica a de MAIOR duracao (parada mais
    // longa e mais provavel de ser a entrega real, nao um trafego lento)
    const duracaoNova = new Date(parada.fim_real ?? parada.saida).getTime() - new Date(parada.chegada).getTime()
    const duracaoExistente = existente ? new Date(existente.saida).getTime() - new Date(existente.chegada).getTime() : -1
    if (duracaoNova > duracaoExistente) {
      visitas.set(melhor.linha.nf, {
        nf: melhor.linha.nf,
        chegada: parada.chegada,
        saida: parada.fim_real ?? parada.saida,
        distanciaMetrosDoPonto: melhor.dist,
      })
    }
  }
  return visitas
}
```

Nota: `parada.fim_real` é o campo aditivo já commitado nesta sessão em `src/lib/kpi/matcher.ts` (`UnitracParadaRow.fim_real`) -- confirme que `consolidaParadasApi` (chamado na Task 6) já preenche esse campo (deveria, é o mesmo código que recebeu o fix). Se `fim_real` vier `undefined` em algum caso, caia pra `parada.saida`.

**Step 2: Teste de `montarVisitas`**

Casos: ponto geocodificado com parada GPS dentro do raio (visita confirmada, distância correta); ponto sem nenhuma parada por perto (sem visita); duas paradas diferentes perto do mesmo ponto, uma mais longa que a outra (fica a mais longa); dois pontos geocodificados próximos um do outro com uma única parada GPS entre eles (a parada vai pro ponto mais próximo, não pro primeiro da lista); parada classificada `BASE` é ignorada mesmo se geograficamente perto de um ponto de entrega (não pode virar visita).

**Step 3: `agregarPorCarga`**

```ts
// src/lib/kpi-romaneio/agregacao.ts
import type { AlvoApi } from '@/lib/unitrac-api'
// UnitracParadaRow vem de matcher.ts, não de unitrac-api -- mesma ressalva
// de unitrac.ts (Task 6).
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { LinhaEscala, LinhaGeocodificada, LinhaKpiRomaneio, Visita } from './types'

function minutosEntre(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
}

/** Uma carga = todas as linhas do romaneio com o mesmo `carga`+`placa`.
 *  Cruza com a Escala (planejado) e decide status por NF: confirmado se
 *  alvo.situacao===1 (Unitrac) OU se ha Visita (GPS no nosso perimetro) --
 *  nunca por coordenada do alvo (ver spec). */
export function agregarPorCarga(
  carga: string,
  placaNorm: string,
  linhasRomaneio: LinhaGeocodificada[],
  escala: LinhaEscala | null,
  alvos: AlvoApi[],
  visitasPorNf: Map<string, Visita>,
  paradasGps: UnitracParadaRow[],
  kmPercorrido: number | null,
): LinhaKpiRomaneio {
  const alvoPorNf = new Map(alvos.filter(a => a.documento).map(a => [a.documento as string, a]))

  let confirmadas = 0
  for (const linha of linhasRomaneio) {
    const alvo = alvoPorNf.get(linha.nf)
    const confirmadoUnitrac = alvo?.situacao === 1
    const confirmadoGps = visitasPorNf.has(linha.nf)
    if (confirmadoUnitrac || confirmadoGps) confirmadas++
  }

  const eventosBase = paradasGps.filter(p => p.classificacao === 'BASE')
  const primeiraBase = eventosBase.length > 0 ? eventosBase[0] : null
  const ultimaBase = eventosBase.length > 0 ? eventosBase[eventosBase.length - 1] : null
  // saida CD = fim da PRIMEIRA permanencia na base (quando o caminhao sai
  // pra rua); chegada CD = inicio da ULTIMA permanencia na base (quando
  // volta no fim do dia). Placa que nunca aparece em BASE fica com os
  // dois vazios -- nao inventa horario.
  const saidaCd = primeiraBase ? (primeiraBase.fim_real ?? primeiraBase.saida) : null
  const chegadaCd = ultimaBase ? ultimaBase.chegada : null

  const nfPlanejado = escala?.nfPlanejado ?? null
  const status: 'OK' | 'INCOMPLETO' = nfPlanejado != null && confirmadas < nfPlanejado ? 'INCOMPLETO' : 'OK'

  return {
    carga,
    placa: placaNorm,
    destino: escala?.destino ?? linhasRomaneio[0]?.destino ?? '',
    motorista: escala?.motorista ?? linhasRomaneio[0]?.motorista ?? '',
    ajudante1: escala?.ajudante1 ?? null,
    ajudante2: escala?.ajudante2 ?? null,
    pesoKg: escala?.pesoKg ?? null,
    clientesPlanejados: escala?.entPlanejado ?? null,
    nfPlanejado,
    paradasReais: confirmadas,
    kmPercorrido,
    saidaCd,
    chegadaCd,
    tempoOperacaoMin: saidaCd && chegadaCd ? minutosEntre(saidaCd, chegadaCd) : null,
    status,
  }
}
```

**Step 4: Teste de `agregarPorCarga`**

Casos: todas as NF confirmadas via Unitrac → `status: 'OK'`, `paradasReais` igual ao total; uma NF pendente na Unitrac mas confirmada via `Visita` → conta como confirmada, `status` ainda pode ser `OK`; uma NF nem na Unitrac nem com Visita → não conta, `status: 'INCOMPLETO'` se `nfPlanejado` exigir mais; múltiplos ciclos BASE→FORA_BASE→BASE no dia (pega a PRIMEIRA saída e a ÚLTIMA chegada, não o meio); placa sem nenhum evento BASE no dia → `saidaCd`/`chegadaCd`/`tempoOperacaoMin` todos `null`, não zerados; `escala === null` (carga sem correspondência na Escala) → campos vindos da escala ficam `null`, mas o resto (`carga`, `placa`, `paradasReais`) continua calculável a partir só do romaneio.

**Step 5: Rodar testes, commit, espelhar**

---

### Task 8: Gerador de XLSX

**Files:**
- Create: `src/lib/kpi-romaneio/gerador-xlsx.ts`
- Test: `src/lib/kpi-romaneio/gerador-xlsx.test.ts`

**Step 1: Implementação**

```ts
// src/lib/kpi-romaneio/gerador-xlsx.ts
import ExcelJS from 'exceljs'
import type { LinhaKpiRomaneio } from './types'

export const COLUNAS_KPI_ROMANEIO = [
  'CARGA', 'PLACA', 'DESTINO', 'MOTORISTA', 'AJUDANTE 1', 'AJUDANTE 2', 'PESO (KG)',
  'CLIENTES PLANEJADOS', 'NF PLANEJADO', 'PARADAS REAIS', 'KM PERCORRIDO',
  'SAÍDA CD', 'CHEGADA CD', 'TEMPO OPERAÇÃO', 'STATUS',
] as const

function formatarHora(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

function formatarMinutos(min: number | null): string {
  if (min == null) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h${String(m).padStart(2, '0')}min`
}

export async function gerarKpiRomaneioXlsx(linhas: LinhaKpiRomaneio[], data: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()
  const ws = wb.addWorksheet(`KPI ${data}`)
  ws.addRow([...COLUNAS_KPI_ROMANEIO])
  for (const l of linhas) {
    ws.addRow([
      l.carga, l.placa, l.destino, l.motorista, l.ajudante1 ?? '', l.ajudante2 ?? '',
      l.pesoKg ?? '', l.clientesPlanejados ?? '', l.nfPlanejado ?? '', l.paradasReais,
      l.kmPercorrido != null ? Math.round(l.kmPercorrido * 10) / 10 : '',
      formatarHora(l.saidaCd), formatarHora(l.chegadaCd), formatarMinutos(l.tempoOperacaoMin),
      l.status,
    ])
  }
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
```

**Step 2: Teste**

```ts
// src/lib/kpi-romaneio/gerador-xlsx.test.ts
```
Casos: gera workbook com o header exato (compare `COLUNAS_KPI_ROMANEIO` contra a lista da amostra, célula a célula); uma linha com todos os campos preenchidos produz os valores formatados certos (hora em HH:MM, tempo em `XhYYmin`); campos `null` viram string vazia, não `"null"` nem `0`. Leia o buffer de volta com `ExcelJS.Workbook().xlsx.load(buffer)` pra afirmar contra células reais, não só confiar que `addRow` não lançou.

**Step 3: Rodar teste, commit, espelhar**

---

### Task 9: Rota e página novas (`/api/kpi/nutrimax/gerar`, `/painel/nutrimax/gerar`)

**Files:**
- Modify: `src/app/api/kpi/nutrimax/gerar/route.ts` (reescrever do zero, substituindo o placeholder da Task 1)
- Modify: `src/app/painel/nutrimax/gerar/page.tsx` (reescrever do zero, substituindo o placeholder da Task 1)

**Step 1: Monte a orquestração completa na rota**

A rota recebe upload de Escala + Romaneio (multipart, mesmo padrão de `FormData` já usado no projeto -- confira um exemplo de rota de upload existente, ex. as que sobreviveram em `src/app/api/kpi/simples/`, pra seguir a mesma convenção de leitura de `FormData`/validação de arquivo/mensagem de erro 400/422). Sequência:

1. `parseEscala(escalaBuffer)` + `parseRomaneio(romaneioBuffer)`.
2. Agrupa `LinhaRomaneio[]` por `carga`+`placa`.
3. `geocodificarEnderecos()` pra todos os endereços únicos do dia de uma vez (não um a um -- eficiência, e pra respeitar rate-limit do que quer que a Task 3 tenha decidido).
4. Pra cada placa envolvida: `buscarAlvosDoDia`, `buscarParadasDoDia` (Task 6).
5. `montarVisitas` (Task 7) por placa.
6. `agregarPorCarga` (Task 7) por carga.
7. `gerarKpiRomaneioXlsx` (Task 8).
8. Salva geração (Task 10) e devolve o arquivo (mesmo content-type/disposition já usado nas rotas antigas -- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="KPI-Nutry-Max-{data}.xlsx"`).

**Step 2: KM percorrido** -- confirme de onde vem hoje pro resto do projeto (`ResumoViagemPlacaNutrimax`/`km-ors.ts` foram destruídos; o equivalente pro Benassi está em algum lugar de `src/lib/kpi/`). Se o cálculo de km real via ORS entre paradas sequenciais já existe como função genérica reusável, reuse; se era específico do módulo destruído, reimplemente de forma enxuta aqui (soma de distância entre paradas GPS consecutivas do dia, mesma fonte de dado -- `buscarStopsCru`/paradas cruas).

**Step 3: Página** -- reescreva `page.tsx` seguindo o padrão visual/de upload de `src/app/painel/nutrimax/gerar/page.tsx` **anterior à Task 1** (você não tem mais o arquivo, mas o padrão de upload de 2 arquivos + botão "Gerar" + download do resultado é comum a várias telas do projeto -- veja `src/app/painel/nutrimax/romaneio/page.tsx` no histórico do git se precisar de referência visual: `git show HEAD~<n>:src/app/painel/nutrimax/romaneio/page.tsx` contando os commits desde a Task 1).

**Step 4: Smoke test manual**

```bash
npm run dev
```
Suba pela UI um par sintético de Escala+Romaneio (pode ser um PDF mínimo de teste, não precisa ser real ainda -- isso é só pra confirmar que a rota não quebra, a validação com dado real é a Task 11) e confirme que baixa um `.xlsx` com o header certo.

**Step 5: `npm run build` precisa passar limpo** (as duas rotas placeholder da Task 1 são a razão de isso ter ficado pendente até agora).

**Step 6: Commit e espelhar**

---

### Task 10: Tabela de histórico simples

**Files:**
- Create: `supabase/migrations/<novo_timestamp>_kpi_romaneio_geracoes.sql`
- Create: `src/lib/kpi-romaneio/historico.ts`
- Test: `src/lib/kpi-romaneio/historico.test.ts`

**Step 1: Migration**

```sql
-- Historico de geracoes do KPI de romaneio -- auditoria simples (quando,
-- por quem, qual arquivo), NAO granular por NF como a tabela antiga
-- destruida (kpi_nutrimax_entradas). Ver spec 2026-08-23.
create table if not exists kpi_romaneio_geracoes (
  id uuid primary key default gen_random_uuid(),
  cliente text not null, -- 'nutrimax' por enquanto; sem FK, sem enum -- generalizacao futura
  data_referencia date not null,
  gerado_em timestamptz not null default now(),
  gerado_por text,
  qtd_cargas int not null,
  arquivo_storage_path text
);
create index if not exists kpi_romaneio_geracoes_cliente_data_idx on kpi_romaneio_geracoes (cliente, data_referencia);
```

**NÃO aplique ainda** -- mesma regra da Task 1, autorização explícita antes de qualquer `push`/`db push` em produção.

**Step 2: `salvarGeracao`**

```ts
// src/lib/kpi-romaneio/historico.ts
import { createServiceClient } from '@/lib/supabase/service'

export async function salvarGeracao(params: {
  cliente: string
  dataReferencia: string
  geradoPor: string | null
  qtdCargas: number
  arquivoStoragePath: string | null
}): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('kpi_romaneio_geracoes').insert({
    cliente: params.cliente,
    data_referencia: params.dataReferencia,
    gerado_por: params.geradoPor,
    qtd_cargas: params.qtdCargas,
    arquivo_storage_path: params.arquivoStoragePath,
  })
  if (error) throw new Error(`Falha ao salvar geracao: ${error.message}`)
}
```

**Step 3: Teste** (mock do client Supabase -- veja como outros testes do projeto mockam `createServiceClient`, seguir o mesmo padrão)

**Step 4: Commit e espelhar**

---

### Task 11: Validação com dado real

**Não é uma task de código -- é o gate final antes de considerar a feature pronta.**

**Step 1:** Consiga um par real de Escala + Romaneio da Nutry Max de um dia já processado pelo sistema (peça ao usuário se não houver um salvo em `docs/` -- **não foi encontrado nenhum arquivo real de Escala/Romaneio da Nutry Max salvo neste repo durante o planejamento**, os únicos PDFs de Escala salvos são de outro cliente/formato).

**Step 2:** Rode o pipeline completo (via `npm run dev` + upload manual pela UI, ou um script one-off chamando as funções em sequência) contra esse dia real.

**Step 3:** Compare linha a linha contra o que o usuário já sabe daquele dia (SAÍDA CD/CHEGADA CD batem com a realidade? PARADAS REAIS bate com o que de fato foi entregue? STATUS reflete cargas que o usuário sabe que tiveram problema?).

**Step 4:** Reporte ao controller discrepâncias encontradas -- não corrija sozinho parâmetro nenhum (raio, janela de tempo) sem antes mostrar o caso concreto que motivou a mudança.

**Step 5:** Só depois desta validação o controller pergunta ao usuário sobre aplicar as migrations pendentes (Task 1 Step 8, Task 10 Step 1) e fazer deploy.

---

## Fora de escopo deste plano

- Aplicar as migrations em produção (Tasks 1 e 10 criam os arquivos, não aplicam).
- Deploy (build+restart no VPS) -- gate humano separado, depois da Task 11.
- Recriar dashboard/histórico/inserir/romaneio-conferência -- só se pedido de novo.
- Generalizar pra outro cliente -- fase futura, spec própria.
