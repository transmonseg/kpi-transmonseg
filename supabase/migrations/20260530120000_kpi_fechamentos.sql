-- Fechamento (carimbo de revisão) de KPI manual por rede e dia. "Só carimba":
-- registra quem revisou e quando, sem travar edição. Granularidade = (data, rede_id).
-- Escrita só pelo service client das rotas (/api/kpi-manual/fechar); leitura liberada
-- pra usuários autenticados, igual ao padrão de kpi_manual_entradas.
create table if not exists public.kpi_fechamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  rede_id text not null,
  fechado_por uuid,
  fechado_por_nome text,
  fechado_em timestamptz not null default now(),
  observacao text,
  unique (data, rede_id)
);

alter table public.kpi_fechamentos enable row level security;

create policy "fechamento_read"
  on public.kpi_fechamentos
  for select
  to authenticated
  using (true);
