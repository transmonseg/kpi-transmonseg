-- Links de acesso reutilizáveis: qualquer pessoa com o link cria a própria
-- conta (diferente de `convites`, que é de uso único por e-mail). slug é a
-- URL amigável (/acesso/<slug>). ativo=false revoga sem apagar histórico.
create table if not exists links_acesso (
  slug        text primary key,
  papel       text not null check (papel in ('gerente', 'visualizador')),
  redes       text[] not null default '{}',
  meses       text[] not null default '{}',
  criado_por  uuid not null references auth.users(id),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);
