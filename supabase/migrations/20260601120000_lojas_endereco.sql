-- Colunas de endereço na tabela `lojas`, alimentadas pelo registro de Pontos de
-- Interesse do Unitrac (export "unitrac_pontointeresse_consulta", casado por
-- codigo_unitrac = IDENTIFICADOR). Servem ao match por geo/endereço de paradas
-- FORA_BASE (feature 2026-06-01): coordenada é a chave, rua/bairro confirmam.
-- Aditivo, nullable, sem impacto no schema/dados existentes.
alter table public.lojas add column if not exists endereco  text;
alter table public.lojas add column if not exists bairro    text;
alter table public.lojas add column if not exists municipio text;
alter table public.lojas add column if not exists numero    text;

-- Filtro de desambiguação do matcher (mesma rua em municípios diferentes).
create index if not exists idx_lojas_municipio on public.lojas (municipio);
