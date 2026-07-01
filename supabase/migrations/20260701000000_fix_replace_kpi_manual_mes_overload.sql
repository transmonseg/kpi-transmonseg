-- Existe uma sobrecarga duplicada de replace_kpi_manual_mes criada fora do fluxo
-- de migrations (p_uploaded_by text, ao lado da original com p_uploaded_by uuid
-- de 20260606000100). O PostgREST não consegue escolher entre as duas e toda
-- chamada da RPC falha com PGRST203 "Could not choose the best candidate
-- function" — quebrando 100% dos uploads mensais de KPI manual.
drop function if exists public.replace_kpi_manual_mes(text, text, jsonb, text);
