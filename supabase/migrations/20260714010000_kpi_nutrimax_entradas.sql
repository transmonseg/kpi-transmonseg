-- KPI Nutrimax: granularidade cliente/NF (não tem "rede" nem "loja" — cliente único,
-- N rotas/dia identificadas por carga+placa). Upload é por dia (não por mês, como o
-- Benassi) — cada Romaneio processado é de um dia específico.

create table if not exists kpi_nutrimax_entradas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  carga text not null,
  destino text not null,
  placa text not null,
  motorista text,
  nf text not null,
  cliente_codigo text,
  cliente_nome text not null,
  endereco text,
  status text not null check (status in ('entregue', 'pendente')),
  hora_realizado timestamptz,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_kpi_nutrimax_data on kpi_nutrimax_entradas(data);
create index if not exists idx_kpi_nutrimax_placa on kpi_nutrimax_entradas(placa);
create index if not exists idx_kpi_nutrimax_carga on kpi_nutrimax_entradas(carga);

alter table kpi_nutrimax_entradas enable row level security;

create policy "kpi_nutrimax_read"
  on kpi_nutrimax_entradas
  for select
  to authenticated
  using (true);

-- Escrita só via service_role (rotas de API), mesmo padrão de kpi_manual_entradas —
-- sem policy de insert/update/delete pra `authenticated`.
