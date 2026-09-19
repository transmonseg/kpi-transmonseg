create table if not exists kpi_alvos_snapshot (
  cliente text not null,
  data_referencia date not null,
  capturado_em timestamptz not null default now(),
  qtd_alvos int not null,
  alvos jsonb not null,
  primary key (cliente, data_referencia)
);
alter table kpi_alvos_snapshot enable row level security;
-- Sem policies: leitura/escrita só via service_role (mesmo padrão de kpi_nutrimax_geracoes).
