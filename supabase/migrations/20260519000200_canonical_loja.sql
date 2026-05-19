CREATE TABLE IF NOT EXISTS canonical_loja (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  nome_norm   text NOT NULL,
  lat         double precision,
  lng         double precision,
  raio_metros integer DEFAULT 300,
  rede_id     text,
  created_at  timestamptz DEFAULT now()
);

-- GIN trigram no nome normalizado — ativa operador %
CREATE INDEX IF NOT EXISTS idx_canonical_loja_trgm
  ON canonical_loja USING gin (immutable_unaccent(nome_norm) gin_trgm_ops);

ALTER TABLE canonical_loja ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read" ON canonical_loja FOR SELECT TO authenticated USING (true);
CREATE POLICY "service write"      ON canonical_loja FOR ALL    TO service_role  USING (true);
