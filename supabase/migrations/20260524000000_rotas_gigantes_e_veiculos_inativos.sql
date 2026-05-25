-- Sprint A3+A4 — Tabelas auxiliares pra V2.1:
--   1. rotas_gigantes_unitrac: códigos Unitrac que NÃO devem ser usados como match exato
--      (raio ≥ 5km cobrem múltiplas lojas — usar matching geo da loja-alvo)
--   2. veiculos_inativos: placas CD-only crônicas (sempre só BASE BENASSI), descartar do matcher

CREATE TABLE IF NOT EXISTS public.rotas_gigantes_unitrac (
  codigo TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  raio_estimado_metros INTEGER,
  paradas_observadas INTEGER,
  motivo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.veiculos_inativos (
  placa TEXT PRIMARY KEY,
  motivo TEXT,
  dias_observados INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: leitura pública (service_role já bypass)
ALTER TABLE public.rotas_gigantes_unitrac ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veiculos_inativos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rotas_gigantes_select" ON public.rotas_gigantes_unitrac FOR SELECT USING (true);
CREATE POLICY "veiculos_inativos_select" ON public.veiculos_inativos FOR SELECT USING (true);
