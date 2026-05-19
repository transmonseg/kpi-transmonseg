CREATE TABLE IF NOT EXISTS alias_loja (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias             text NOT NULL,
  alias_norm        text NOT NULL,
  canonical_loja_id uuid NOT NULL REFERENCES canonical_loja(id) ON DELETE CASCADE,
  confidence        double precision NOT NULL DEFAULT 1.0
                    CHECK (confidence >= 0.1 AND confidence <= 1.0),
  source            text NOT NULL DEFAULT 'manual', -- seed | ocr | manual | review
  confirmacoes      integer NOT NULL DEFAULT 0,
  auto_approve      boolean NOT NULL DEFAULT false,
  last_seen_at      timestamptz DEFAULT now(),
  created_at        timestamptz DEFAULT now(),
  UNIQUE (alias_norm, canonical_loja_id)
);

CREATE INDEX IF NOT EXISTS idx_alias_loja_trgm
  ON alias_loja USING gin (immutable_unaccent(alias_norm) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_alias_loja_norm_exact
  ON alias_loja (alias_norm);

ALTER TABLE alias_loja ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read" ON alias_loja FOR SELECT TO authenticated USING (true);
CREATE POLICY "service write"      ON alias_loja FOR ALL    TO service_role  USING (true);
