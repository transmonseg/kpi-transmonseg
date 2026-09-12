-- Achado real 12/09: marcar uma coordenada como nao confiavel resolve metade do
-- problema -- a outra metade e' a Ana saber POR QUE, pra decidir se conserta o
-- cadastro do cliente (endereco errado no romaneio) ou se e' erro nosso de
-- geocodificacao. Ver a secao "Triagem" da spec de 12/09.
--
-- Nullable de proposito: linha antiga nao tem motivo conhecido, e "sem motivo"
-- e' informacao diferente de "motivo vazio".
ALTER TABLE kpi_romaneio_geocode_cache
  ADD COLUMN IF NOT EXISTS motivo text;
