-- 12/11: dias com ordem da rota guardada (tela Ordem da rota, filtro de período).
CREATE OR REPLACE FUNCTION kpi_rota_ordem_dias(p_cliente text, p_de date, p_ate date)
RETURNS TABLE(data date) LANGUAGE sql STABLE AS $$
  SELECT DISTINCT o.data FROM kpi_rota_ordem o
   WHERE o.cliente = p_cliente AND o.data BETWEEN p_de AND p_ate
   ORDER BY o.data
$$;
GRANT EXECUTE ON FUNCTION kpi_rota_ordem_dias(text, date, date) TO service_role;
NOTIFY pgrst, 'reload schema';
