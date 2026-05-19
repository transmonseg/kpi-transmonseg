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
  SELECT DISTINCT ON (t.input_name)
    t.input_name,
    c.id,
    c.name,
    similarity(immutable_unaccent(lower(trim(t.input_name))), c.nome_norm) AS trgm_score,
    'canonical'::text
  FROM unnest(p_names) AS t(input_name)
  JOIN canonical_loja c ON c.nome_norm % immutable_unaccent(lower(trim(t.input_name)))
  WHERE similarity(immutable_unaccent(lower(trim(t.input_name))), c.nome_norm) >= p_threshold

  UNION ALL

  SELECT DISTINCT ON (t.input_name)
    t.input_name,
    a.canonical_loja_id,
    c2.name,
    similarity(immutable_unaccent(lower(trim(t.input_name))), a.alias_norm) AS trgm_score,
    'alias'::text
  FROM unnest(p_names) AS t(input_name)
  JOIN alias_loja a ON a.alias_norm % immutable_unaccent(lower(trim(t.input_name)))
  JOIN canonical_loja c2 ON c2.id = a.canonical_loja_id
  WHERE similarity(immutable_unaccent(lower(trim(t.input_name))), a.alias_norm) >= p_threshold
    AND a.confidence >= 0.5

  ORDER BY input_name, trgm_score DESC
$$;

CREATE OR REPLACE FUNCTION find_similar_pending(
  p_name      text,
  p_row_id    uuid,
  p_threshold float DEFAULT 0.4
)
RETURNS TABLE (id uuid, raw_name text, match_score float)
LANGUAGE sql STABLE AS $$
  SELECT rq.id, rq.raw_name,
    similarity(immutable_unaccent(lower(p_name)), rq.raw_name_norm) AS match_score
  FROM review_queue rq
  WHERE rq.status = 'pending'
    AND rq.id != p_row_id
    AND rq.raw_name_norm % immutable_unaccent(lower(p_name))
    AND similarity(immutable_unaccent(lower(p_name)), rq.raw_name_norm) >= p_threshold
  ORDER BY match_score DESC
  LIMIT 20
$$;
