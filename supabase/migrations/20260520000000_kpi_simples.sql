-- Persistência das gerações do fluxo KPI Simples
-- O fluxo é in-memory (recebe arquivos via storage, processa, devolve XLSX+PDF base64).
-- Esta tabela registra cada execução bem-sucedida para histórico e regeneração.

CREATE TABLE IF NOT EXISTS public.kpi_simples (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data            DATE NOT NULL,
  gerado_por      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  gerado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Entrada: caminhos no Storage para regenerar
  escala_paths    TEXT[] NOT NULL,
  unitrac_path    TEXT   NOT NULL,

  -- Estado: alterações confirmadas e edits inline aplicados
  alteracoes      JSONB NOT NULL DEFAULT '[]'::jsonb,
  line_edits      JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Sumário leve do output (sem base64 dos arquivos)
  redes           JSONB NOT NULL,  -- [{rede_id, rede_nome, qtd_rotas, qtd_sem_gps}]
  total_rotas     INTEGER NOT NULL DEFAULT 0,
  total_sem_gps   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS kpi_simples_data_idx
  ON public.kpi_simples (data DESC, gerado_em DESC);

CREATE INDEX IF NOT EXISTS kpi_simples_gerado_por_idx
  ON public.kpi_simples (gerado_por, gerado_em DESC);

ALTER TABLE public.kpi_simples ENABLE ROW LEVEL SECURITY;

-- Authenticated users podem ler tudo (sistema interno multi-operador)
DROP POLICY IF EXISTS kpi_simples_read ON public.kpi_simples;
CREATE POLICY kpi_simples_read
  ON public.kpi_simples
  FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users podem inserir as próprias gerações
DROP POLICY IF EXISTS kpi_simples_insert ON public.kpi_simples;
CREATE POLICY kpi_simples_insert
  ON public.kpi_simples
  FOR INSERT
  TO authenticated
  WITH CHECK (gerado_por = auth.uid());

-- Apenas o autor pode apagar a própria geração
DROP POLICY IF EXISTS kpi_simples_delete ON public.kpi_simples;
CREATE POLICY kpi_simples_delete
  ON public.kpi_simples
  FOR DELETE
  TO authenticated
  USING (gerado_por = auth.uid());
