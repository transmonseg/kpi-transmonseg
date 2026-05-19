CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Wrapper IMMUTABLE necessario para usar unaccent em indice funcional
-- Supabase instala unaccent em public; SET search_path garante resolucao
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  SET search_path = public AS
$$SELECT unaccent($1)$$;
