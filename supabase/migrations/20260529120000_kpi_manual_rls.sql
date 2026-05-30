-- RLS na kpi_manual_entradas (era a única tabela do app sem RLS habilitado).
-- Escrita só pelo service client das rotas /api/kpi-manual/* (service_role bypassa RLS);
-- leitura liberada para usuários autenticados, igual ao padrão de kpi_simples.
alter table public.kpi_manual_entradas enable row level security;

create policy "kpi_manual_read"
  on public.kpi_manual_entradas
  for select
  to authenticated
  using (true);
