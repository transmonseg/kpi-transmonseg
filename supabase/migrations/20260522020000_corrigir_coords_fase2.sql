-- Corrige coordenadas imprecisas das 4 geofences da FASE 2.
--
-- Origem das coords: paradas reais do PDF Unitrac relatorio_9553.pdf (dia 20/05/2026),
-- extraídas via parseUnitracPdf + scripts/find-real-coords.mjs.
-- Método: centroide das paradas longas (≥15 min) de cada placa nas proximidades
-- da geofence, filtradas por distância < 5 km da coord anterior.
--
-- Resultados antes da correção (distância parada real ↔ geofence):
--   9006160  Norte Shopping:   LJS2172 parada [2] = 780 m
--   8590574  Niteroi Barcas:   LMF2049 parada [2] = 726 m
--   8590575  Iguaba (ALT):     LRA9C41 parada [4] = 624 m  ← coords também estavam TROCADAS com 8590576
--   8590576  Itaborai (ALT):   LRA9C41 parada [3] = 765 m  ← idem
--
-- Após correção: todas as paradas ficam a ≤ 31 m da geofence.
--
-- Observação sobre 8590575/8590576:
--   A migration 20260522010000 copiou as coords dos registros canônicos 8590570 e 8590573,
--   mas as atribuiu de forma invertida (iguaba recebeu coords de itaborai e vice-versa).
--   Este script corrige tanto a imprecisão quanto a troca.

-- ============================================================
-- CARREFOUR NORTE SHOPPING (9006160)
-- Coord anterior: -22.892000, -43.282000  (imprecisa ~808 m)
-- Coord real:     -22.885575, -43.285680  (centroide de 2 paradas ≥15 min)
-- ============================================================
UPDATE lojas
SET
  lat        = -22.885575,
  lng        = -43.285680,
  updated_at = now()
WHERE codigo_unitrac = '9006160';

-- ============================================================
-- PRINCESA NITEROI BARCAS (8590574)
-- Coord anterior: -22.895000, -43.124000  (imprecisa ~726 m)
-- Coord real:     -22.888470, -43.123890  (parada única ≥15 min)
-- ============================================================
UPDATE lojas
SET
  lat        = -22.888470,
  lng        = -43.123890,
  updated_at = now()
WHERE codigo_unitrac = '8590574';

-- ============================================================
-- PRINCESA IGUABA ALT (8590575)
-- Coord anterior: -22.745330, -42.852640  (ERRADA — era de Itaboraí)
-- Coord real:     -22.840650, -42.223430  (centroide paradas [4]+[6] de LRA9C41)
-- ============================================================
UPDATE lojas
SET
  lat        = -22.840650,
  lng        = -42.223430,
  updated_at = now()
WHERE codigo_unitrac = '8590575';

-- ============================================================
-- PRINCESA ITABORAI ALT (8590576)
-- Coord anterior: -22.840630, -42.223500  (ERRADA — era de Iguaba)
-- Coord real:     -22.745530, -42.852585  (centroide paradas [3]+[7] de LRA9C41)
-- ============================================================
UPDATE lojas
SET
  lat        = -22.745530,
  lng        = -42.852585,
  updated_at = now()
WHERE codigo_unitrac = '8590576';

-- ============================================================
-- VERIFICAÇÃO
-- ============================================================
-- SELECT codigo_unitrac, nome_unitrac, lat, lng
-- FROM lojas
-- WHERE codigo_unitrac IN ('9006160', '8590574', '8590575', '8590576')
-- ORDER BY codigo_unitrac;
