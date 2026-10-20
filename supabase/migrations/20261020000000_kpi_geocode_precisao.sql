-- supabase/migrations/20261020000000_kpi_geocode_precisao.sql
-- Auditoria 20/10 (GEO-01): precisao do ponto informada pela ponte do
-- monitoramento (exato | interpolado | trecho | rua). Nula = desconhecida
-- (linhas antigas). So' ponto exato/interpolado sustenta "nao foi ao cliente".
alter table kpi_romaneio_geocode_cache add column if not exists precisao text;
comment on column kpi_romaneio_geocode_cache.precisao is 'exato | interpolado | trecho | rua (ponte do monitoramento, 20/10); nulo = desconhecida';
notify pgrst, 'reload schema';
