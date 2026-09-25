create table if not exists kpi_placa_sem_rastreador (
  id bigserial primary key,
  empresa text not null,
  placa text not null,
  inicio date not null,
  fim date,
  motivo text,
  responsavel text not null,
  criado_em timestamptz not null default now()
);
alter table kpi_placa_sem_rastreador enable row level security;
-- Sem policies: leitura/escrita só via service_role (mesmo padrão de kpi_nutrimax_geracoes).

-- Seed TTL5J17 (Task 8, plano 2026-09-24-melhorias-relatorio-final-ana): tem
-- `cv` na Unitrac e paradas só na BASE -- pelo dado é indistinguível de
-- caminhão parado (cai em "VEÍCULO SEM MOVIMENTO"). A operação (Ana)
-- confirmou em 24/09 que a placa está sem rastreador desde 23/09.
-- NÃO aplicar em produção sem OK explícito do usuário (deploy manual).
-- insert into kpi_placa_sem_rastreador (empresa, placa, inicio, motivo, responsavel)
-- values ('NUTRY MAX', 'TTL5J17', '2026-09-23', 'informado pela operação 24/09', 'Ana');
