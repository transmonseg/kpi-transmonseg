-- 12/11: ordem planejada da roteirização (Rio Quality, relatório da Fusion com
-- ORDEM). Uma linha por NF do dia; reenvio do relatório substitui o dia.
CREATE TABLE IF NOT EXISTS kpi_rota_ordem (
  cliente text NOT NULL,
  data date NOT NULL,
  nf text NOT NULL,
  romaneio text NOT NULL,
  placa text NOT NULL,
  ordem integer NOT NULL CHECK (ordem > 0),
  previsao_inicio text,
  previsao_fim text,
  enviado_por text,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente, data, nf)
);
ALTER TABLE kpi_rota_ordem ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON kpi_rota_ordem TO service_role;
NOTIFY pgrst, 'reload schema';
