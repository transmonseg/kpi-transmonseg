-- Dashboard: entradas de KPI manual (uma por loja/dia/rede) + bucket dos XLSX crus
create table if not exists kpi_manual_entradas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  rede_id text not null,
  loja text not null,
  placa text,
  motorista text,
  status text not null check (status in ('entregue','nao_foi','sem_rastreador')),
  saida_cd text,
  chd text,
  sai text,
  uploaded_by uuid,
  created_at timestamptz default now()
);
create index if not exists idx_kpi_manual_data on kpi_manual_entradas(data);
create index if not exists idx_kpi_manual_rede on kpi_manual_entradas(rede_id);

insert into storage.buckets (id, name, public)
values ('kpi-manual-raw', 'kpi-manual-raw', false)
on conflict (id) do nothing;
