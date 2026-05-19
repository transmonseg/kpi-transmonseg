CREATE EXTENSION IF NOT EXISTS pg_cron;

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
