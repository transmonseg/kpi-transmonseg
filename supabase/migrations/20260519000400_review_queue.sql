CREATE TABLE IF NOT EXISTS review_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escala_linha_id   uuid,
  data              date NOT NULL,
  rede_id           text NOT NULL,
  raw_name          text NOT NULL,
  raw_name_norm     text NOT NULL,
  matched_name      text,
  match_score       double precision,
  algorithm         text,
  status            text NOT NULL DEFAULT 'pending',
  resolved_name     text,
  resolved_by       text,
  version           integer NOT NULL DEFAULT 0,
  created_at        timestamptz DEFAULT now(),
  resolved_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_review_queue_pending
  ON review_queue (status, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_review_queue_trgm
  ON review_queue USING gin (immutable_unaccent(raw_name_norm) gin_trgm_ops);

CREATE OR REPLACE FUNCTION bump_review_version()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.version = OLD.version + 1; RETURN NEW; END;
$$;

CREATE TRIGGER trg_review_version
  BEFORE UPDATE ON review_queue
  FOR EACH ROW EXECUTE FUNCTION bump_review_version();

ALTER TABLE review_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated all" ON review_queue FOR ALL TO authenticated USING (true);
