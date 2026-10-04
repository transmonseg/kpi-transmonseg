-- Dashboard do redesign (04/10/2026): numeros de cada geracao lidos da
-- planilha entregue (src/lib/kpi-romaneio/resumo-dashboard.ts). Aditiva.
alter table kpi_romaneio_geracoes add column if not exists resumo jsonb;
