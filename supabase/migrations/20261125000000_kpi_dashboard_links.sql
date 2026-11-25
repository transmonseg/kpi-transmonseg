-- 25/11: link do Dashboard (Nutry/RQ) travado num dia ou período, pra mandar
-- pra quem não tem login. O token é a própria permissão; só o servidor lê
-- (service client), por isso RLS ligada e sem policy.
create table if not exists kpi_dashboard_links (
  token       uuid primary key default gen_random_uuid(),
  cliente     text not null,
  de          date not null,
  ate         date not null check (ate >= de),
  criado_por  uuid not null references auth.users(id),
  criado_em   timestamptz not null default now()
);
alter table kpi_dashboard_links enable row level security;
