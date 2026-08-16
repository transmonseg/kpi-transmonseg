# Links de acesso reutilizáveis (`/acesso/<slug>`)

## Contexto

Os 20 convites gerados no pedido anterior (ver
`2026-08-16-convites-sem-expiracao-design.md`) são de uso único: o primeiro
que preenche email/senha "gasta" o link (`usado_em`), e o token é um UUID
feio de compartilhar. O usuário agora quer links permanentes e reutilizáveis
— qualquer pessoa que receba o link cria a própria conta — com URL legível
por tipo (`/acesso/prezunic`, `/acesso/gerente`, etc), em vez do
`/convite/<uuid>` de uso único.

Isso é um conceito diferente de `convites` (convite pessoal, uso único, por
e-mail) — não reaproveita a tabela nem a rota existente, para não misturar
os dois modelos.

## Modelo de dados

Nova tabela `links_acesso` (migration
`20260816010000_links_acesso.sql`, aplicada só no Contabo — mesma regra do
pedido anterior, produção real é `kpi_transmonseg` self-hosted):

```sql
create table if not exists links_acesso (
  slug        text primary key,
  papel       text not null check (papel in ('gerente', 'visualizador')),
  redes       text[] not null default '{}',
  meses       text[] not null default '{}',
  criado_por  uuid not null references auth.users(id),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);
```

## Rota `/acesso/[slug]`

Mesma tela visual de `/convite/[token]` ("Definir sua senha"), copiada para
`src/app/acesso/[slug]/page.tsx` + `actions.ts`:

- Busca `links_acesso` por `slug` (não por token).
- Bloqueado só quando: não existe, ou `ativo = false`. Sem conceito de
  "já usado" nem "expirado" — não há `usado_em`/`expira_em` nesta tabela.
- `resgatar`: mesma lógica de `convite/actions.ts` (cria `auth.users` +
  insere `perfis` com `papel`/`redes`/`meses`/`criado_por` do
  `links_acesso`), mas **sem** marcar nada como consumido — o mesmo slug
  pode ser resgatado de novo por outro e-mail indefinidamente. Se alguém
  tentar com um e-mail já cadastrado, `auth.admin.createUser` retorna erro
  normal (já tratado pelo fluxo existente).
- Revogação: sem UI nova — desativar (`ativo = false`) ou apagar a linha
  via SQL direto quando pedido. Fora de escopo construir botão no painel
  agora (mesma decisão do pedido anterior — YAGNI até ser pedido).

## Geração dos 20 slugs

Mesmos 20 tipos do pedido anterior (1 gerente todas-as-redes, 18
visualizador uma-rede-cada, 1 visualizador todas-as-redes), agora com slug
em vez de UUID:

- `gerente` → papel gerente, todas as 18 redes.
- `visualizador` → papel visualizador, todas as 18 redes.
- Uma por rede: código da rede em minúsculo com `_`→`-` (`ZONA_SUL` →
  `zona-sul`, `SUPER_PAX` → `super-pax`, `ARMAZEM_GRAO` → `armazem-grao`,
  `SAMS_CLUB` → `sams-club`, `CAB_PETROPOLIS` → `cab-petropolis`, resto
  igual ao código em minúsculo).

Execução via script pontual (mesmo padrão do pedido anterior — não
comitado, roda do scratchpad, apaga depois).

## Limpeza dos 20 convites antigos (uuid, gerados minutos atrás)

Nenhum foi usado ainda. Apagar as 20 linhas de `convites` criadas
naquele passo (`criado_em` mais recente, `criado_por` =
`joaquimsallescp1110@gmail.com`, `expira_em is null`) — ficam substituídas
pelos links de `/acesso`.

## Verificação

- `npx tsc --noEmit` + `npx vitest run` limpos nos dois repos.
- Abrir um `/acesso/<slug>` real no navegador, confirmar tela "Definir sua
  senha" sem erro.
- SQL: 20 linhas em `links_acesso`, 0 linhas remanescentes dos convites
  antigos gerados no pedido anterior.

## Não-objetivos

- Sem UI de gestão (criar/revogar/listar `links_acesso`) no painel — só
  backend + rota de resgate + geração pontual dos 20.
- Não mexe em `convites`/`/convite` (continua existindo para convite
  pessoal de uso único, se algum dia for usado de novo) nem em
  `/kpi-publico`.
- Não muda granularidade de acesso (continua por rede, não por loja).
