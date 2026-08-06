# Migração KPI Transmonseg pro Contabo — Sub-projeto 1: Banco self-hosted

Data: 2026-08-04
Status: aprovado em conversa

## Contexto

O sistema KPI Transmonseg roda hoje 100% em Vercel (app) + Supabase cloud
(banco, auth, storage), projeto `luhwpsckvbctxynifryk`. Decisão do usuário:
consolidar tudo no mesmo Contabo VPS que já hospeda o Monitoramento
(self-hosted Postgres + PostgREST + GoTrue via PM2, ver
`~/Projects/chaves-apis-joaquim/monitoramento/chaves.md`), motivo: menos
provedores pra gerenciar, tudo debaixo do mesmo VPS que já é pago e
controlado.

Migração inteira é grande demais pra um spec só — decomposta em 4
sub-projetos sequenciais:

1. **Banco self-hosted** (este spec) — Postgres + schema + dado migrado e
   validado, SEM tocar em produção.
2. Auth self-hosted (GoTrue + usuários/convites migrados).
3. Storage em disco (troca Supabase Storage por filesystem no Contabo).
4. App + deploy (PM2, domínio `kpi.transmonseg.com.br`, corte final —
   decisão de quando/se desligar o Vercel fica pro usuário, só depois de
   validação).

**Estratégia geral (vale pros 4 sub-projetos): rodar em paralelo, não
big-bang.** O Vercel + Supabase atual continua no ar intocado durante toda
a migração. Só no sub-projeto 4, depois de validado, o usuário decide
cortar de vez.

## Descoberta feita durante o brainstorm (não assumida — checada no código)

37 das 38 rotas de API (`src/app/api/**/route.ts`) usam a service role key
(`createServiceClient`/`SUPABASE_SERVICE_ROLE_KEY`), que já ignora RLS por
completo. A autorização real (RBAC por rede, convites, papel
gerente/visualizador) acontece no CÓDIGO da aplicação (checagem de
`perfis`/sessão), não no RLS do Postgres — RLS existe (~20 policies em
12 migrations) mas é defesa em profundidade, não o mecanismo primário.
Mesmo padrão já encontrado no Monitoramento em julho. Consequência prática:
migrar as policies de RLS como estão (sem re-validação política por
política) é seguro — não é o que protege o sistema hoje.

## Escopo deste sub-projeto

**Dentro:**
- Banco Postgres novo (`kpi_transmonseg`) no MESMO servidor self-hosted que
  já roda o Monitoramento no Contabo (não um servidor novo — reusa
  hardware/serviço já existente, `systemctl` já gerenciado).
- Extensions necessárias instaladas (`pg_trgm`, `unaccent` — usadas pelo
  fuzzy matching de lojas, confirmar lista completa lendo as 37
  migrations antes de rodar).
- Schema + dado migrados via `pg_dump`/`pg_restore` direto do Supabase
  cloud (`DATABASE_URL` no vault, `luhwpsckvbctxynifryk`) pro banco novo
  local.
- PostgREST **próprio** pra esse banco (porta nova, ex. 3002 — NÃO reusa o
  do Monitoramento, que está amarrado ao banco dele).
- Validação: contagem de linha por tabela batendo exato contra a origem
  (Supabase), mais uma bateria de queries reais (ex. as agregações do
  dashboard) rodando contra o banco novo e comparando resultado com o
  Supabase atual.

**Fora (sub-projetos seguintes):**
- GoTrue/auth (#2).
- Storage/arquivos (#3).
- Qualquer mudança no código do app, deploy, domínio (#4).
- Decisão de desligar Vercel/Supabase (só no #4, e só o usuário decide).

## Dado real (medido nesta sessão, via PostgREST do Supabase atual)

Total ~26 mil linhas nas tabelas com dado. Maiores: `kpi_manual_entradas`
(19.681), `escala_linhas` (5.934), `lojas` (451), `clientes_cozinha` (415),
`kpi_simples` (608). Resto é dezenas ou menos. `perfis` (usuários): 11.
Várias tabelas vazias hoje (`kpi_linhas`, `kpi_geracoes`, `kpis`,
`anomalias`, `alteracoes`, `kpi_nutrimax_entradas`, `kpi_rotas`,
`unitrac_paradas`, `unitrac_uploads`, `motoristas`, `review_queue`) —
migrar o schema delas mesmo assim (podem ter sido substituídas por tabelas
mais novas, ou ainda não usadas; não é decisão deste sub-projeto decidir
se são código morto).

Volume pequeno: risco de migração é de CORRETUDE (schema, extensions,
sequences, defaults, RLS), não de escala/performance.

## Arquitetura

```
Supabase cloud (luhwpsckvbctxynifryk)          Contabo VPS (mesmo do Monitoramento)
  Postgres (origem, INTOCADO)      --dump-->      Postgres self-hosted
                                                     └─ banco novo: kpi_transmonseg
                                                          └─ PostgREST novo (porta nova)
```

Nenhuma mudança no Postgres do Monitoramento nem no PostgREST/GoTrue dele
— bancos e processos totalmente separados no mesmo host físico.

## Passos de alto nível (detalhados no plano de implementação)

1. Ler as 37 migrations, listar extensions/RPCs/sequences necessárias.
2. Criar o banco `kpi_transmonseg` + role de acesso (mesmo padrão
   `app_service` do Monitoramento) no Postgres do Contabo.
3. `pg_dump --schema-only` da origem → aplicar no banco novo → instalar
   extensions que faltarem → confirmar schema idêntico (diff de
   `\d+` tabela por tabela, ou `pg_dump --schema-only` dos dois lados
   comparado).
4. `pg_dump --data-only` da origem → aplicar no banco novo.
5. Validação: contagem de linha por tabela (script), mais 3-5 queries
   reais do dashboard rodando nos dois bancos e comparando resultado.
6. PostgREST novo configurado e testado via curl direto (mesmo padrão do
   Monitoramento Task 7/12) — sem nenhuma rota do app de produção
   apontando pra ele ainda.
7. Registrar no vault (`chaves-apis-joaquim/sistema-kpi/chaves.md`) tudo
   que for criado (senha do banco, porta do PostgREST, etc.).

## Riscos e mitigação

- **Extension faltando derruba o restore** → ler todas as 37 migrations
  antes de rodar (passo 1), não descobrir na hora do erro.
- **RLS mal migrado quebra queries no futuro (sub-projeto 4)** → migrar
  como está; dado que 37/38 rotas usam service role (bypassa RLS), o
  impacto de uma policy errada é limitado à 1 rota até prova em
  contrário — mas registrar esse risco residual pro sub-projeto 4
  validar antes do corte real.
- **Divergência de dado entre origem e destino** → validação por
  contagem + queries reais (passo 5) antes de considerar este
  sub-projeto concluído.
- **Zero risco pra produção atual**: todo este sub-projeto roda em
  paralelo, sem nenhuma rota do app de produção (Vercel) apontando pro
  banco novo em nenhum momento.
