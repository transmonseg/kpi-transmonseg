-- =============================================================================
-- Fix 1 (Critical): batch_trgm_lookup — DISTINCT ON must wrap the whole UNION ALL
-- The previous implementation placed DISTINCT ON inside each UNION ALL arm,
-- which does not guarantee a single best match per input_name. The DISTINCT ON
-- must operate on the combined result set ordered by trgm_score DESC.
-- =============================================================================

CREATE OR REPLACE FUNCTION batch_trgm_lookup(
  p_names     text[],
  p_threshold float DEFAULT 0.25
)
RETURNS TABLE (
  input_name   text,
  canonical_id uuid,
  canonical_nm text,
  trgm_score   float,
  match_source text
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT DISTINCT ON (sub.input_name)
    sub.input_name, sub.canonical_id, sub.canonical_nm, sub.trgm_score, sub.match_source
  FROM (
    SELECT
      t.input_name,
      c.id AS canonical_id,
      c.name AS canonical_nm,
      similarity(immutable_unaccent(lower(trim(t.input_name))), c.nome_norm) AS trgm_score,
      'canonical'::text AS match_source
    FROM unnest(p_names) AS t(input_name)
    JOIN canonical_loja c ON c.nome_norm % immutable_unaccent(lower(trim(t.input_name)))
    WHERE similarity(immutable_unaccent(lower(trim(t.input_name))), c.nome_norm) >= p_threshold

    UNION ALL

    SELECT
      t.input_name,
      a.canonical_loja_id AS canonical_id,
      c2.name AS canonical_nm,
      similarity(immutable_unaccent(lower(trim(t.input_name))), a.alias_norm) AS trgm_score,
      'alias'::text AS match_source
    FROM unnest(p_names) AS t(input_name)
    JOIN alias_loja a ON a.alias_norm % immutable_unaccent(lower(trim(t.input_name)))
    JOIN canonical_loja c2 ON c2.id = a.canonical_loja_id
    WHERE similarity(immutable_unaccent(lower(trim(t.input_name))), a.alias_norm) >= p_threshold
      AND a.confidence >= 0.5
  ) sub
  ORDER BY sub.input_name, sub.trgm_score DESC
$$;


-- =============================================================================
-- Fix 2 (Critical): cron_decay — unschedule before scheduling to be idempotent
-- Re-running the migration without this guard creates duplicate cron jobs.
-- =============================================================================

DO $$
BEGIN
  PERFORM cron.unschedule('confidence-decay-daily');
EXCEPTION WHEN others THEN NULL;
END $$;

SELECT cron.schedule(
  'confidence-decay-daily',
  '0 3 * * *',
  $$
    UPDATE alias_loja SET
      confidence = GREATEST(0.1, confidence - (
        0.01 * EXTRACT(EPOCH FROM (now() - last_seen_at)) / 86400.0
      )),
      auto_approve = CASE WHEN confidence < 0.5 THEN false ELSE auto_approve END
    WHERE source != 'seed'
      AND last_seen_at < now() - INTERVAL '1 day'
      AND confidence > 0.1;
  $$
);


-- =============================================================================
-- Fix 3 (Critical): bulk_approve_rows — replace SELECT+INSERT with atomic upsert
-- The original SELECT then conditional INSERT is a race condition: two concurrent
-- callers can both see NULL and both attempt the INSERT, causing a unique violation.
-- ON CONFLICT makes the whole operation atomic.
-- =============================================================================

CREATE OR REPLACE FUNCTION bulk_approve_rows(
  p_ids             uuid[],
  p_resolved_name   text,
  p_expected_version integer DEFAULT NULL
)
RETURNS TABLE (updated_id uuid, conflict boolean)
LANGUAGE plpgsql AS $$
DECLARE
  v_canonical_id uuid;
  v_norm         text;
  v_row          review_queue;
BEGIN
  v_norm := immutable_unaccent(lower(trim(p_resolved_name)));

  -- Atomic upsert: creates a new canonical or refreshes nome_norm if name already exists.
  INSERT INTO canonical_loja (name, nome_norm)
  VALUES (p_resolved_name, v_norm)
  ON CONFLICT (name) DO UPDATE SET nome_norm = EXCLUDED.nome_norm
  RETURNING id INTO v_canonical_id;

  FOR v_row IN SELECT * FROM review_queue WHERE id = ANY(p_ids) AND status = 'pending' LOOP
    IF p_expected_version IS NOT NULL AND v_row.version != p_expected_version THEN
      RETURN QUERY SELECT v_row.id, true; CONTINUE;
    END IF;

    UPDATE review_queue
    SET status = 'approved', resolved_name = p_resolved_name,
        resolved_by = current_user, resolved_at = now()
    WHERE id = v_row.id;

    INSERT INTO alias_loja
      (alias, alias_norm, canonical_loja_id, confidence, source, confirmacoes, auto_approve)
    VALUES (
      v_row.raw_name,
      immutable_unaccent(lower(trim(v_row.raw_name))),
      v_canonical_id, 0.6, 'review', 1, false
    )
    ON CONFLICT (alias_norm, canonical_loja_id) DO UPDATE SET
      confirmacoes  = alias_loja.confirmacoes + 1,
      confidence    = LEAST(1.0, alias_loja.confidence + 0.1),
      auto_approve  = CASE WHEN alias_loja.confirmacoes + 1 >= 5 THEN true
                          ELSE alias_loja.auto_approve END,
      last_seen_at  = now();

    RETURN QUERY SELECT v_row.id, false;
  END LOOP;
END;
$$;


-- =============================================================================
-- Fix 4 (Important): review_queue RLS — reduce to SELECT only for authenticated
-- Writes must go through bulk_approve_rows RPC (service_role) to enforce business
-- logic (version check, alias upsert). Direct DELETE/UPDATE by authenticated users
-- is not safe and was allowed by the overly broad FOR ALL policy.
-- =============================================================================

DROP POLICY IF EXISTS "authenticated all" ON review_queue;
CREATE POLICY "authenticated read" ON review_queue FOR SELECT TO authenticated USING (true);
-- Writes happen via bulk_approve_rows RPC (service_role)


-- =============================================================================
-- Fix 5 (Important): canonical_loja — add UNIQUE constraint on nome_norm
-- Needed so that the ON CONFLICT (name) upsert in bulk_approve_rows cannot
-- produce duplicate normalised names, and to support future upserts keyed on
-- nome_norm. Safe because the table is empty at this point in the migration chain.
-- =============================================================================

ALTER TABLE canonical_loja
  ADD CONSTRAINT canonical_loja_nome_norm_unique UNIQUE (nome_norm);
