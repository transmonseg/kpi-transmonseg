-- Dashboard por cliente (04/10/2026, pedido do usuario): igual a Benassi, o
-- dashboard so' analisa o KPI que alguem INSERE (botao Inserir KPI) -- nada
-- automatico. Um KPI por cliente por dia; reinserir substitui.
create table if not exists kpi_dashboard_kpis (
  id uuid primary key default gen_random_uuid(),
  cliente text not null,
  data date not null,
  resumo jsonb not null,
  nfs jsonb not null default '[]'::jsonb,
  arquivo_storage_path text,
  arquivo_nome text,
  inserido_por text,
  inserido_em timestamptz not null default now(),
  unique (cliente, data)
);
create index if not exists kpi_dashboard_kpis_cliente_data on kpi_dashboard_kpis (cliente, data);
alter table kpi_dashboard_kpis enable row level security;
-- Sem policies: leitura/escrita so' via service_role (mesmo padrao das outras tabelas do KPI).
grant all on kpi_dashboard_kpis to service_role;
