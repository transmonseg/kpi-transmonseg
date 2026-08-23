-- Destrói o pipeline antigo de KPI da Nutry Max (nunca usado em produção real,
-- só teste — decisão do usuário 2026-08-23, ver
-- docs/superpowers/specs/2026-08-23-kpi-romaneio-nutrimax-design.md).
-- Substituído por um pipeline novo que confirma entrega via status da
-- Unitrac (nunca via coordenada, que tem erro conhecido) + geofence próprio
-- geocodificado a partir do romaneio do dia.
drop table if exists kpi_nutrimax_entradas;
drop table if exists kpi_nutrimax_status_placa_flags;
drop table if exists kpi_nutrimax_geracoes;
drop table if exists nutrimax_clientes_geo;
