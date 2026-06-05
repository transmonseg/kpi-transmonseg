-- Fix: o fluxo /api/kpi/simples persiste escala_uploads com tipo='KPI_SIMPLES',
-- mas a check constraint não incluía esse valor → o INSERT falhava silenciosamente
-- (catch no route) → escala_uploads/escala_linhas ficavam SEMPRE vazias →
-- inferirSaiDaEscala não tinha escala pra comparar → o "sai" das alterações nunca
-- era identificado (só o "entra"). Adiciona KPI_SIMPLES aos tipos permitidos.

ALTER TABLE public.escala_uploads DROP CONSTRAINT escala_uploads_tipo_check;
ALTER TABLE public.escala_uploads ADD CONSTRAINT escala_uploads_tipo_check
  CHECK (tipo = ANY (ARRAY['GERAL'::text, 'ZONA_SUL'::text, 'PAX'::text, 'ARMAZEM_GRAO'::text, 'GUANABARA'::text, 'KPI_SIMPLES'::text]));
