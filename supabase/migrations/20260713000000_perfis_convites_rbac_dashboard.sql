-- RBAC de dashboard por rede: perfis (papel + redes por login) e convites (link
-- de convite, sem precisar de envio de email). Ver docs/superpowers/specs/
-- 2026-07-13-rbac-dashboard-design.md.

create table if not exists perfis (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  papel       text not null check (papel in ('admin', 'gerente', 'visualizador')),
  redes       text[] not null default '{}',
  criado_por  uuid references auth.users(id),
  criado_em   timestamptz not null default now()
);

-- Backfill: usuários existentes (equipe, acesso completo hoje) viram admin.
insert into perfis (user_id, email, papel, redes)
select id, email, 'admin', '{}'
from auth.users
on conflict (user_id) do nothing;

create table if not exists convites (
  token       uuid primary key default gen_random_uuid(),
  email       text not null,
  papel       text not null check (papel in ('gerente', 'visualizador')),
  redes       text[] not null default '{}',
  criado_por  uuid not null references auth.users(id),
  usado_em    timestamptz,
  usado_por   uuid references auth.users(id),
  expira_em   timestamptz not null default (now() + interval '7 days'),
  criado_em   timestamptz not null default now()
);

create index if not exists convites_criado_por_idx on convites(criado_por);
