-- Link público (sem login) pra visualizar o KPI Manual de um dia/redes
-- específico. O token é a própria permissão — segue o mesmo padrão de
-- `convites` (token uuid, default gen_random_uuid(), sem RLS, tudo via
-- service client no servidor).
create table if not exists kpi_manual_links_publicos (
  token       uuid primary key default gen_random_uuid(),
  data        date not null,
  redes       text[] not null,
  criado_por  uuid not null references auth.users(id),
  criado_em   timestamptz not null default now()
);

create index if not exists kpi_manual_links_publicos_criado_por_idx
  on kpi_manual_links_publicos(criado_por);
