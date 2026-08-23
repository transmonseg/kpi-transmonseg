-- Cache de geocodificacao PROPRIO do lado do KPI (nao mexe em nada do
-- projeto monitoramento nem na tabela romaneio_geocode_cache de la, que e'
-- do motor de desvio). Achado real (23/08/2026, validacao com romaneio de
-- 31/07): a rota do monitoramento (/api/romaneio/geocode) e' de proposito
-- side-effect-free (nunca escreve cache) pro lado da Nutry Max -- sem cache
-- proprio aqui, TODO dia reprocessa do zero os mesmos ~1700 enderecos
-- recorrentes via Nominatim throttled a 1,1s cada (minutos de espera por
-- geracao). Match exato por string (sem normalizacao) -- suficiente pro
-- caso real (mesmo romaneio, mesmo texto de endereco dia a dia); endereco
-- com variacao de formatacao so' cacheia na proxima vez que repetir.
create table if not exists kpi_romaneio_geocode_cache (
  endereco    text primary key,
  lat         double precision not null,
  lng         double precision not null,
  criado_em   timestamptz not null default now()
);

alter table kpi_romaneio_geocode_cache enable row level security;

-- Leitura/escrita so' via service_role (geocode.ts usa createServiceClient)
-- -- sem policy pra `authenticated`, mesmo padrao de kpi_romaneio_geracoes.
