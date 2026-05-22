-- Fase 2: atribuir codigo_unitrac a lojas CARREFOUR e PRINCESA que estavam sem código
-- Identificadas no cruzamento do dia 20/05/2026 como geofences não mapeadas.
--
-- Situação encontrada via auditoria:
--   - Lojas JdF, Campos, Macaé, Iguaba Grande e Itaboraí já existem com codigo_unitrac
--     em registros canônicos. As entradas faltantes são duplicatas/aliases sem código.
--   - Norte Shopping e Niterói Barcas existem como entradas únicas sem codigo_unitrac.
--
-- Estratégia: UPDATE com ON CONFLICT (codigo_unitrac tem UNIQUE constraint).
-- Próximos códigos livres: Carrefour > 9006159 → 9006160+; Princesa > 8590573 → 8590574+

-- ============================================================
-- CARREFOUR - NORTE SHOPPING (único registro, sem código)
-- ============================================================
UPDATE lojas
SET
  codigo_unitrac = '9006160',
  nome_unitrac   = 'CARREFOUR NORTE SHOPPING (MEIER)',
  lat            = -22.892,
  lng            = -43.282,
  updated_at     = now()
WHERE id = '43e26491-1e7e-4ff2-a29e-f08d2706c3b5'
  AND codigo_unitrac IS NULL;

-- ============================================================
-- CARREFOUR - JUIZ DE FORA duplicata (sem código)
-- Registro canônico é 9006156. Este alias recebe código próprio
-- para que o geofence não fique sem vínculo unitrac.
-- ============================================================
UPDATE lojas
SET
  codigo_unitrac = '9006161',
  nome_unitrac   = 'CARREFOUR JUIZ DE FORA (ALT)',
  updated_at     = now()
WHERE id = 'd0c16c1b-3ccb-4a27-a2c1-6940e8d6abf0'
  AND codigo_unitrac IS NULL;

-- ============================================================
-- PRINCESA - NITERÓI BARCAS (único registro, sem código)
-- ============================================================
UPDATE lojas
SET
  codigo_unitrac = '8590574',
  nome_unitrac   = 'PRINCESA NITEROI BARCAS',
  lat            = -22.895,
  lng            = -43.124,
  updated_at     = now()
WHERE id = '970c7963-1d89-42e3-9b5d-c25b3eda0eaf'
  AND codigo_unitrac IS NULL;

-- ============================================================
-- PRINCESA - IGUABA duplicata (sem código)
-- Registro canônico é 8590570. Esta entrada duplicada recebe
-- código próprio para viabilizar geofence independente.
-- ============================================================
UPDATE lojas
SET
  codigo_unitrac = '8590575',
  nome_unitrac   = 'PRINCESA IGUABA (ALT)',
  updated_at     = now()
WHERE id = '46ace1e6-cd66-41b1-8c82-3163ce90b56f'
  AND codigo_unitrac IS NULL;

-- ============================================================
-- PRINCESA - ITABORAÍ duplicata (sem código)
-- Registro canônico é 8590573. Esta entrada duplicada recebe
-- código próprio.
-- ============================================================
UPDATE lojas
SET
  codigo_unitrac = '8590576',
  nome_unitrac   = 'PRINCESA ITABORAI (ALT)',
  updated_at     = now()
WHERE id = '20bbae08-2de6-439f-b39d-4516fdf63fef'
  AND codigo_unitrac IS NULL;

-- ============================================================
-- VERIFICAÇÃO: confirmar que os 5 registros foram atualizados
-- ============================================================
-- SELECT id, codigo_unitrac, rede_id, nome FROM lojas
-- WHERE codigo_unitrac IN ('9006160','9006161','8590574','8590575','8590576');
