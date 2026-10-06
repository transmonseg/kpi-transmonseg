-- Cache do dia (06/10, "a geracao demora"): resultado de consultas externas
-- caras (paradas da Unitrac por placa, leitura de PDF) reaproveitado entre
-- geracoes do mesmo dia. Pequeno (KB por dia) e apagado depois de 7 dias pelo
-- tick do ao vivo (scripts/kpi-ao-vivo-tick.ts).
create table if not exists kpi_cache_dia (
  chave text primary key,
  data date not null,
  valor jsonb not null,
  gravado_em timestamptz not null default now()
);
create index if not exists kpi_cache_dia_data on kpi_cache_dia (data);
alter table kpi_cache_dia enable row level security;
grant all on kpi_cache_dia to service_role;
notify pgrst, 'reload schema';
