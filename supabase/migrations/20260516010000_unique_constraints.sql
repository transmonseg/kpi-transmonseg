-- Adiciona constraints UNIQUE necessarias para upsert idempotente
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kpis_data_rede_id_unique'
  ) THEN
    ALTER TABLE public.kpis ADD CONSTRAINT kpis_data_rede_id_unique UNIQUE (data, rede_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kpi_rotas_escala_linha_id_unique'
  ) THEN
    ALTER TABLE public.kpi_rotas ADD CONSTRAINT kpi_rotas_escala_linha_id_unique UNIQUE (escala_linha_id);
  END IF;
END $$;
