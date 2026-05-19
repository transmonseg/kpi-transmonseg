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

  SELECT id INTO v_canonical_id FROM canonical_loja WHERE nome_norm = v_norm LIMIT 1;
  IF v_canonical_id IS NULL THEN
    INSERT INTO canonical_loja (name, nome_norm) VALUES (p_resolved_name, v_norm)
    RETURNING id INTO v_canonical_id;
  END IF;

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
