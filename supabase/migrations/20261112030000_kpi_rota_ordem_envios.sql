-- 12/11: o que já foi enviado de ordem da rota em cada dia (tela Ordem da rota).
CREATE OR REPLACE FUNCTION kpi_rota_ordem_envios(p_cliente text, p_de date, p_ate date)
RETURNS TABLE(data date, nfs bigint, placas bigint, enviado_por text, enviado_em timestamptz) LANGUAGE sql STABLE AS $$
  SELECT o.data, count(*), count(DISTINCT o.placa),
         (array_agg(o.enviado_por ORDER BY o.enviado_em DESC))[1], max(o.enviado_em)
    FROM kpi_rota_ordem o
   WHERE o.cliente = p_cliente AND o.data BETWEEN p_de AND p_ate
   GROUP BY o.data ORDER BY o.data
$$;
GRANT EXECUTE ON FUNCTION kpi_rota_ordem_envios(text, date, date) TO service_role;
NOTIFY pgrst, 'reload schema';
