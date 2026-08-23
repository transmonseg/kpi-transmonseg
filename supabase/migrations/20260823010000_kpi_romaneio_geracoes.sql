-- Historico de geracoes do KPI de romaneio -- auditoria simples (quando,
-- por quem, qual arquivo), NAO granular por NF como a tabela antiga
-- destruida (kpi_nutrimax_entradas). Ver spec 2026-08-23.
create table if not exists kpi_romaneio_geracoes (
  id uuid primary key default gen_random_uuid(),
  cliente text not null, -- 'nutrimax' por enquanto; sem FK, sem enum -- generalizacao futura
  data_referencia date not null,
  gerado_em timestamptz not null default now(),
  gerado_por text,
  qtd_cargas int not null,
  arquivo_storage_path text
);
create index if not exists kpi_romaneio_geracoes_cliente_data_idx on kpi_romaneio_geracoes (cliente, data_referencia);

alter table kpi_romaneio_geracoes enable row level security;

create policy "kpi_romaneio_geracoes_read"
  on kpi_romaneio_geracoes
  for select
  to authenticated
  using (true);

-- Escrita só via service_role (salvarGeracao usa createServiceClient) —
-- mesmo padrão de kpi_nutrimax_geracoes — sem policy de insert/update/delete
-- pra `authenticated`.
