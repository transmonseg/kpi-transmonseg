# Histórico Nutry Max — Design

**Status:** Aprovado
**Data:** 2026-07-17

## Contexto

Os dois módulos "Gerar KPI" e "Gerar Romaneio" da Nutry Max hoje são
puramente in-memory: o usuário sobe os PDFs, a rota processa tudo e devolve
`{ resumo, linhas, xlsxBase64, filename }` direto na resposta HTTP — nada é
persistido. Fechar a aba ou navegar pra outra tela perde o resultado; pra ver
de novo é preciso re-subir os mesmos arquivos e gerar tudo de novo.

O Benassi já resolve isso pro "Gerar KPI" dele: cada geração é salva em
`kpi_simples` (resumo) + um `cache.json` completo em Storage
(`kpi-outputs/{id}/cache.json`), e a tela `/painel/historico` lista as
gerações passadas — clicar numa leva de volta pra tela de gerar, que se
repopula a partir do cache, sem reprocessar nada.

## Escopo

- Tabela nova `kpi_nutrimax_geracoes`, compartilhada pelos dois módulos
  (coluna `tipo`: `KPI` ou `ROMANEIO`).
- Bucket novo `nutrimax-outputs`, um `cache.json` por geração — **sem**
  guardar os PDFs originais (decisão consciente: se o cache sumir, a pessoa
  re-sobe os arquivos e gera de novo; não há fallback de reprocessamento
  como o Benassi tem, porque esses dois fluxos não têm "alterações"/"line
  edits" que justifiquem essa complexidade extra).
- Persistência é **best-effort**: se salvar no banco/Storage falhar, a
  geração NÃO é bloqueada — o usuário recebe o XLSX normalmente, só não
  aparece no Histórico depois (mesma filosofia já usada no enriquecimento
  via API: nunca travar o resultado principal por causa de uma etapa
  secundária).
- Tela `/painel/nutrimax/historico`, paginada, com filtro por tipo e por
  intervalo de data. Reabrir uma geração **navega** pra
  `/painel/nutrimax/gerar?geracao={id}` ou `/painel/nutrimax/romaneio?geracao={id}`
  (igual ao padrão do Benassi) — a tela de destino se repopula sozinha.
- Fora de escopo: reprocessamento a partir dos PDFs originais, edição de uma
  geração já salva, exclusão de geração pela UI (a rota de reabrir não
  precisa de DELETE agora — pode vir depois se pedido).

## Arquitetura

### Migration `supabase/migrations/20260717000000_kpi_nutrimax_geracoes.sql`

```sql
create table kpi_nutrimax_geracoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('KPI', 'ROMANEIO')),
  data date not null,
  filename text not null,
  resumo jsonb not null,
  gerado_por uuid not null references auth.users(id),
  gerado_em timestamptz not null default now()
);

create index kpi_nutrimax_geracoes_gerado_em_idx on kpi_nutrimax_geracoes (gerado_em desc);
create index kpi_nutrimax_geracoes_tipo_data_idx on kpi_nutrimax_geracoes (tipo, data desc);

alter table kpi_nutrimax_geracoes enable row level security;

create policy "kpi_nutrimax_geracoes_read"
  on kpi_nutrimax_geracoes
  for select
  to authenticated
  using (true);

-- Escrita só via service_role (rotas de API) — mesmo padrão de
-- kpi_nutrimax_entradas — sem policy de insert/update/delete pra `authenticated`.
```

`resumo` guarda exatamente o objeto `resumo` que cada rota já calcula hoje
(`{total,ok,incompletos,semRastreador}` pro KPI,
`{total,ok,divergentes,ausentes,pesoTotalKg}` pro Romaneio), mais
`modoApi: boolean` no caso do KPI (pra mostrar um badge "via API" na lista).

### Módulo novo `src/lib/kpi-nutrimax/historico.ts`

```ts
export async function salvarGeracao(
  svc: SupabaseClient,
  params: {
    tipo: 'KPI' | 'ROMANEIO'
    data: string
    filename: string
    resumo: Record<string, unknown>
    geradoPor: string
    payload: unknown // o corpo completo que vai pro cache.json
  },
): Promise<string | null>
```
Insere em `kpi_nutrimax_geracoes`, sobe `nutrimax-outputs/{id}/cache.json`
(cria o bucket sob demanda, idempotente, mesmo padrão do `kpi-outputs` do
Benassi). Devolve o `id` gerado, ou `null` se qualquer etapa falhar (nunca
lança — quem chama decide se loga o warning).

```ts
export async function buscarGeracao(
  svc: SupabaseClient,
  id: string,
): Promise<{ tipo: 'KPI' | 'ROMANEIO'; payload: unknown } | null>
```
Busca a linha (pra saber o `tipo`), baixa e faz parse do `cache.json`.
`null` se a geração não existe ou o cache sumiu.

### Rotas existentes — `gerar/route.ts` e `romaneio/route.ts`

Depois de montar o objeto de resposta (o mesmo de hoje), cada rota chama
`salvarGeracao` num bloco `try/catch` e inclui `geracaoId` (ou `null`) na
resposta JSON. Nenhuma outra mudança de comportamento.

### Rota nova `src/app/api/kpi/nutrimax/historico/reabrir/route.ts`

```ts
export async function POST(req: NextRequest) {
  // autenticação igual às outras rotas
  const { id } = await req.json()
  const geracao = await buscarGeracao(svc, id)
  if (!geracao) return new NextResponse('Geração não encontrada ou expirada — gere novamente.', { status: 404 })
  return NextResponse.json({ tipo: geracao.tipo, ...geracao.payload })
}
```

### Tela nova `src/app/painel/nutrimax/historico/page.tsx`

Server Component, query direta via `createServiceClient()` — mesmo padrão
do `/painel/historico` do Benassi (paginação `.range()`, filtros via
`searchParams`, sem client-side fetch). Colunas: Data, Tipo (badge), Resumo
(texto compacto montado a partir do JSONB — ex. "71 cargas · 53 OK · 12
incompletos · 6 sem rastreador"), Gerado em. Cada linha é um link pra
`/painel/nutrimax/gerar?geracao={id}` (tipo KPI) ou
`/painel/nutrimax/romaneio?geracao={id}` (tipo ROMANEIO).

### Telas de gerar — `useEffect` de reabertura

Em `gerar/page.tsx` e `romaneio/page.tsx`, um `useEffect` no mount lê
`?geracao=` da querystring (mesmo mecanismo do Benassi:
`new URLSearchParams(window.location.search)`), e se presente faz
`POST /api/kpi/nutrimax/historico/reabrir { id }`, popula `resumo`/`linhas`/
`resultado` direto (sem tocar nos estados de arquivo/data), mostra um banner
"Reabrindo geração #{id}…" enquanto carrega, e um link "← Voltar pro
Histórico" depois de carregado.

### Nav

`src/app/painel/nav.tsx` — link "Histórico" novo no grupo Nutry Max, entre
"Gerar Romaneio" e "Gerar KPI" (ou depois dos dois — ordem exata decidida na
implementação, sem impacto funcional).

## Testes

- `historico.ts`: `salvarGeracao` grava linha + cache.json, devolve `null`
  sem lançar quando o insert falha (mock do client); `buscarGeracao` lê e
  faz parse corretamente, devolve `null` quando a linha não existe e quando
  o cache.json não existe.
- Rotas: sem teste de integração direto (mesmo padrão do resto do projeto);
  smoke test manual via chrome-devtools-mcp cobre o fluxo completo (gerar →
  aparece no histórico → reabrir → tela repopulada) antes do push.
