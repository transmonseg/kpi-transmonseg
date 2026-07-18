-- Histórico dos módulos "Gerar KPI" e "Gerar Romaneio" da Nutry Max — tabela
-- única com coluna `tipo`, mesma filosofia do kpi_simples do Benassi mas sem
-- granularidade linha-a-linha (a Nutry Max não tem lojas/redes como entidades
-- relacionais). O resultado completo de cada geração fica em Storage
-- (nutrimax-outputs/{id}/cache.json), aqui só o resumo pra listar rápido.
create table kpi_nutrimax_geracoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('KPI', 'ROMANEIO')),
  data date not null,
  filename text not null,
  resumo jsonb not null,
  gerado_por uuid not null references auth.users(id),
  gerado_em timestamptz not null default now()
);

create index kpi_nutrimax_geracoes_gerado_em_idx on kpi_nutrimax_geracoes (gerado_em desc);
create index kpi_nutrimax_geracoes_tipo_data_idx on kpi_nutrimax_geracoes (tipo, data desc);

alter table kpi_nutrimax_geracoes enable row level security;

create policy "kpi_nutrimax_geracoes_read"
  on kpi_nutrimax_geracoes
  for select
  to authenticated
  using (true);

-- Escrita só via service_role (rotas de API) — mesmo padrão de
-- kpi_nutrimax_entradas — sem policy de insert/update/delete pra `authenticated`.
