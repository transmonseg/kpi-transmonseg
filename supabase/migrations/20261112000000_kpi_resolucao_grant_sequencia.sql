-- 12/11: a sequence do id nunca foi liberada para o service_role, então todo
-- INSERT em kpi_nf_resolucao falhava ("permission denied for sequence") e
-- nenhuma conferência manual chegou a ser gravada. Aplicado em produção.
GRANT USAGE, SELECT ON SEQUENCE kpi_nf_resolucao_id_seq TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO service_role;
