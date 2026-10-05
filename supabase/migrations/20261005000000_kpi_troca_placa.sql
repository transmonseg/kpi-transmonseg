-- Troca de placa informada pela operação (tela "Placas do dia", 05/10):
-- naquele dia, a carga da placa X da escala foi feita pela placa Y. Lida na
-- geração do KPI (aplicarTrocasDePlaca) antes de qualquer outra regra.
create table if not exists kpi_troca_placa (
  id bigserial primary key,
  empresa text not null,
  data date not null,
  carga text,
  placa_escala text not null,
  placa_real text not null,
  responsavel text not null,
  criado_em timestamptz not null default now()
);
create index if not exists kpi_troca_placa_empresa_data on kpi_troca_placa (empresa, data);
alter table kpi_troca_placa enable row level security;
grant all on kpi_troca_placa to service_role;
grant usage, select on sequence kpi_troca_placa_id_seq to service_role;
grant all on kpi_placa_sem_rastreador to service_role;
grant usage, select on sequence kpi_placa_sem_rastreador_id_seq to service_role;
notify pgrst, 'reload schema';
