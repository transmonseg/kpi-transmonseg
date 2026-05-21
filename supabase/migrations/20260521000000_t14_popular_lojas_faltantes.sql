-- T14: popula codigo_unitrac em lojas existentes e insere lojas faltantes
-- Identificadas a partir de auditoria de unitrac_paradas dos dias 18-20/05/2026.
-- nome_normalizado é generated column — omitido nos INSERTs.
-- Migration aplicada em produção em 21/05/2026 via mcp__plugin_supabase_supabase__apply_migration.

-- ============================================================
-- PASSO 1: UPDATE — popula codigo_unitrac em lojas existentes
-- ============================================================

UPDATE lojas
SET codigo_unitrac = '5353003', nome_unitrac = 'ARMAZEM DO GRÃO (ITAIPAVA)', updated_at = now()
WHERE id = '30d9bac4-c855-4ce9-afd7-df87677fe078';

UPDATE lojas
SET codigo_unitrac = '5353006', nome_unitrac = 'ARMAZEM DO GRAO (CORREAS)', updated_at = now()
WHERE id = '75fafaea-40d4-4aa7-bb7e-d76b32317897';

UPDATE lojas
SET codigo_unitrac = '6018000', nome_unitrac = 'MEGA BOX (OLARIA)', updated_at = now()
WHERE id = '53cc5fff-06b9-4cce-873f-26f0a7c454f7';

UPDATE lojas
SET codigo_unitrac = '6018001', nome_unitrac = 'MEGA BOX 2 (RECREIO)', updated_at = now()
WHERE id = '77a9221b-93cf-4b7d-bc8f-b2d43af56e40';

-- Princesa Copacabana: codigo_escala fica NULL (parser de Princesa nunca preenche
-- loja_codigo_raw, então setar "034" criaria pista falsa de match numérico).
UPDATE lojas
SET codigo_unitrac = '8590034', nome_unitrac = 'PRINCESA COPACABANA', updated_at = now()
WHERE id = '217bc5e9-a159-4d55-9fee-8d3be1b45c16';

-- ============================================================
-- PASSO 2: INSERT — lojas faltantes (5)
-- ============================================================

INSERT INTO lojas (rede_id, nome, codigo_escala, codigo_unitrac, nome_unitrac, ativo)
VALUES
  ('ZONA_SUL',  'Zona Sul Loja 03 - Copacabana',     '03', '9039003', '03 - ZONA SUL - COPACABANA',     true),
  ('ZONA_SUL',  'Zona Sul Loja 05 - Copacabana III', '05', '9039005', '05 - ZONA SUL - COPACABANA III', true),
  ('GUANABARA', 'GB 28 - Santa Cruz',                '28', '71028',   'GB 28 - SANTA CRUZ',             true),
  ('GUANABARA', 'GB 30 - Bonsucesso',                '30', '71030',   'GB 30 - BONSUCESSO',             true),
  ('GUANABARA', 'GB 33 - Tijuca',                    '33', '71033',   'GB 33 - TIJUCA',                 true);
