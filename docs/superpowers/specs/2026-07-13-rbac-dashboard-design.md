# RBAC de dashboard por rede

## Contexto

Hoje só existe um tipo de login: acesso completo (KPI, lojas, cozinha, dashboard). O
`/cadastro` está aberto (qualquer um com o link cria conta completa sozinho — decisão
consciente do commit `f5404e4`, revertendo o fechamento do commit `1f82413`). Nenhuma
rota checa permissão por rede — todas usam o client de serviço e só checam "tem sessão
válida?" (gap documentado nos commits `1f82413`/`f5404e4`).

Pedido do Joaquim: poder criar um segundo tipo de login, só-leitura, restrito à tela de
Dashboard e a um subconjunto de redes (das 18 em `src/lib/kpi/redes.ts`), sem acesso a
nenhuma outra tela do sistema (KPI, Lojas, Cozinha, Histórico).

## Modelo de papéis

- **Admin** — como hoje. Acesso completo a tudo. Os 5 usuários existentes viram Admin
  no backfill da migration (nada muda pra eles).
- **Gerente** — só a tela de Dashboard (`/painel`), filtrada às redes dele. Read-only
  (sem "Inserir KPIs"). Pode gerar link de convite para novos logins **Visualizador**,
  mas só com redes dentro do próprio conjunto de redes que ele já tem. Não pode criar
  outro Gerente nem Admin.
- **Visualizador** — só a tela de Dashboard, filtrada às redes dele. Read-only. Não
  convida ninguém.

`/cadastro` fecha (mesmo padrão do commit `1f82413`): daqui pra frente, todo login novo
nasce de um convite gerado por Admin ou Gerente.

## Dados

Duas tabelas novas (migration):

- `perfis` — `user_id` (PK, FK `auth.users`), `email` (cache pra listagem), `papel`
  (`admin`/`gerente`/`visualizador`), `redes` (`text[]`), `criado_por` (FK
  `auth.users`, null pro backfill), `criado_em`. Backfill: todo `auth.users` existente
  recebe uma linha `admin`.
- `convites` — `token` (PK uuid), `email` (do convidado, definido por quem convida),
  `papel` (`gerente`/`visualizador`), `redes` (`text[]`), `criado_por` (FK
  `auth.users`), `usado_em`, `usado_por`, `expira_em` (default `now() + 7 days`),
  `criado_em`.

Sem linha em `perfis` (fora do backfill) = zero acesso — estado defensivo,
inalcançável em uso normal já que toda criação de conta passa a exigir convite.

## Fluxo do convite

1. Admin/Gerente, na tela `/painel/usuarios`, escolhe papel + redes + email do
   convidado → gera uma linha em `convites` → mostra a URL `/convite/<token>` pra
   copiar e mandar manualmente (WhatsApp etc).
2. A pessoa abre o link, vê o email (fixo, definido no passo 1) e escolhe uma senha.
3. Ao confirmar: cria o usuário no Supabase Auth (admin API, `email_confirm: true`),
   grava a linha em `perfis` (papel/redes/criado_por vindos do convite), marca o
   convite como usado, redireciona pro `/login`.
4. Link expira em 7 dias ou no primeiro uso (o que vier primeiro).

## Enforcement

`src/lib/supabase/middleware.ts` passa a resolver o perfil do usuário autenticado (uma
query a mais, indexada por PK) e, se `papel !== 'admin'`, restringe as rotas
alcançáveis a: `/painel` (a própria tela de Dashboard), `/api/dashboard`,
`/api/dashboard/beta` (fonte de fallback que a tela já busca em paralelo),
`/painel/usuarios` (só se `papel === 'gerente'`) e as rotas públicas existentes
(`/login`, `/dashboard` público). Qualquer outra rota redireciona de volta pro
`/painel`.

`/api/dashboard` e `/api/dashboard/beta` passam a interseccionar o parâmetro `redes`
da query com `perfis.redes` do usuário quando `papel !== 'admin'` — defesa em
profundidade, não confia só no filtro client-side. Isso reaproveita o parâmetro
`redes` que essas rotas já aceitam hoje (usado pelo filtro "Redes:" da própria tela).

## UI

- `src/app/painel/nav.tsx`: recebe o papel via prop. Admin vê o menu completo de hoje.
  Gerente vê "Dashboard" + "Usuários". Visualizador vê só "Dashboard".
- `src/app/painel/page.tsx`: busca o perfil; se não-admin, passa `redesPermitidas` e
  `restrito` pro `DashboardClient` — esconde as abas "Inserir KPIs"/"Histórico" e os
  botões "Ver tutorial"/"Gerar relatório" (reaproveita o padrão que já existe pro link
  público `/dashboard`, que já esconde essas abas via a prop `standalone`), e o
  dropdown "Redes:" só lista as redes permitidas em vez das 18.
- `src/app/painel/usuarios/page.tsx` (novo): formulário "Gerar convite" + lista de
  logins restritos existentes (Admin vê todos; Gerente só os que ele mesmo criou) com
  botão "Revogar" (`auth.admin.deleteUser`, cascade apaga a linha de `perfis`).
- `src/app/convite/[token]/page.tsx` (novo): formulário de senha pra redimir o
  convite. Rota pública (adiciona à lista de páginas públicas do middleware).
- `src/app/login/page.tsx` + `src/lib/supabase/middleware.ts`: remove o link "Criar
  conta" e a rota `/cadastro` da lista de páginas públicas (mesmo diff do commit
  `1f82413`).

## Fora de escopo (confirmado com o Joaquim)

- Restringir por rede as outras telas (KPI manual, Lojas, Cozinha, Histórico) — só o
  Dashboard, por enquanto.
- Convite por email automático — o link é gerado e enviado manualmente por quem
  convida.
- Gerente convidar outro Gerente — só Admin cria Gerente.
