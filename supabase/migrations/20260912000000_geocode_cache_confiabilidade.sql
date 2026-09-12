-- Achado real 11-12/09 (auditoria do KPI Nutry Max dos dias 09 e 10/09, com a
-- Ana conferindo caso a caso no portal da Unitrac): coordenadas com erro de
-- 22km (Praca Santos Dumont/Gavea), 27km (Rua Equador/Santo Cristo) e 131km
-- (Av Santos Dumont/Piabeta -> foi parar em Resende) estavam no cache como se
-- fossem match exato de rua.
--
-- O estrago no relatorio nao e' so' "entrega nao confirma": e' pior, porque o
-- pipeline tira CONCLUSOES NEGATIVAS em cima da coordenada errada --
--   1. atribui a entrega a OUTRA placa ("CARGA TRANSFERIDA") so' porque algum
--      caminhao da frota passou perto do ponto errado;
--   2. afirma "NAO FOI AO CLIENTE (caminhao nao esteve na regiao)" quando a
--      placa de origem entregou certinho, longe do ponto errado.
-- No dia 10/09 a Ana auditou os 25 casos de carga transferida na mao: 100%
-- falsos (13 "nenhuma das duas placas foi ao local" + 12 "feito pela placa de
-- origem").
--
-- A ponte do monitoramento (/api/romaneio/geocode) passou a devolver `fonte`
-- (cnefe | local | cnefe_bairro | google | nominatim) e `validado` (se a
-- coordenada foi checada contra o ponto de referencia da cidade -- ver
-- migration 078 do monitoramento). Estas colunas guardam isso do lado do KPI
-- pra decidir em que coordenada da' pra confiar.
--
-- `confiavel` default true: linha antiga (gravada antes desta migration) nao
-- tem como saber, e assumir suspeita reclassificaria o cache inteiro. Linha
-- nova grava o valor real vindo da ponte.
ALTER TABLE kpi_romaneio_geocode_cache
  ADD COLUMN IF NOT EXISTS fonte text,
  ADD COLUMN IF NOT EXISTS confiavel boolean NOT NULL DEFAULT true;
