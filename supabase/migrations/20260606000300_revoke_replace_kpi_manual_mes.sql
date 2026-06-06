-- A RPC replace_kpi_manual_mes (SECURITY DEFINER) só deve ser chamada pelo SERVIDOR
-- (service_role, via service key). O grant default de CREATE FUNCTION é pra PUBLIC
-- (inclui anon/authenticated) — então anon podia apagar+injetar kpi_manual_entradas
-- via /rest/v1/rpc. Revoga de PUBLIC e re-concede só ao service_role.
revoke execute on function public.replace_kpi_manual_mes(text, text, jsonb, uuid) from public;
revoke execute on function public.replace_kpi_manual_mes(text, text, jsonb, uuid) from anon, authenticated;
grant execute on function public.replace_kpi_manual_mes(text, text, jsonb, uuid) to service_role;
