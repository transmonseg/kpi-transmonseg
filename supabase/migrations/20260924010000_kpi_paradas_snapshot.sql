-- /stops da Unitrac so' guarda 48h -- gerar um dia depois disso (ex: reprocessar
-- um dia antigo, ou correr o cron noturno com atraso) traz paradas incompletas,
-- fazendo nuncaSaiuDaBase (agregacao.ts) disparar por falta de dado, nao por
-- fato real (ver Task 7, plano 2026-09-24). Guardamos um snapshot por
-- empresa+data+placa que so' CRESCE (upsert mescla, nunca substitui por um
-- conjunto menor) -- mesmo espirito de kpi_alvos_snapshot.
create table if not exists kpi_paradas_snapshot (
  empresa text not null,
  data date not null,
  placa text not null,
  paradas jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (empresa, data, placa)
);
alter table kpi_paradas_snapshot enable row level security;
-- Sem policies: leitura/escrita só via service_role (mesmo padrão de kpi_alvos_snapshot).
