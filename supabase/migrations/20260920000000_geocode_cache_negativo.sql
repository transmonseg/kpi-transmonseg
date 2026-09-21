-- Endereços que a ponte respondeu como "não resolvi" (HTTP 200, resultado null) ficam
-- aqui por 48h para a geração não reprocessá-los toda vez (~5 min/geração, medido 18/09).
create table if not exists kpi_romaneio_geocode_negativo (
  endereco text primary key,
  tentado_em timestamptz not null default now()
);
alter table kpi_romaneio_geocode_negativo enable row level security;
-- Sem policies: só service_role (mesmo padrão de kpi_romaneio_geocode_cache).
