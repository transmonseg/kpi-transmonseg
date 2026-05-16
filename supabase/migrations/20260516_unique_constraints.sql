-- Adiciona constraints UNIQUE necessárias para upsert idempotente
-- Execute no Supabase Dashboard → SQL Editor

ALTER TABLE public.kpis
  ADD CONSTRAINT kpis_data_rede_id_unique UNIQUE (data, rede_id);

ALTER TABLE public.kpi_rotas
  ADD CONSTRAINT kpi_rotas_escala_linha_id_unique UNIQUE (escala_linha_id);
