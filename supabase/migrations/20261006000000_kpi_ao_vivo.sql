-- KPI ao vivo (spec 2026-10-06-kpi-ao-vivo-design.md).
-- kpi_ao_vivo_dia: o romaneio do dia JA' LIDO (sem o arquivo), subido de manha.
-- kpi_ao_vivo_calculo: o ultimo calculo do KPI (tela le daqui) + trava entre
-- processos (servidor e o tick do cron nunca calculam ao mesmo tempo).
create table if not exists kpi_ao_vivo_dia (
  cliente text not null,
  data date not null,
  romaneio jsonb not null,
  escala jsonb not null default '[]'::jsonb,
  pao jsonb not null default '{"linhas":[],"escala":[]}'::jsonb,
  escala_enviada boolean not null default false,
  pao_enviado boolean not null default false,
  enviado_por text,
  enviado_em timestamptz not null default now(),
  primary key (cliente, data)
);
create table if not exists kpi_ao_vivo_calculo (
  cliente text not null,
  data date not null,
  calculado_em timestamptz,
  duracao_ms integer,
  resultado jsonb,
  ultimo_erro text,
  ultimo_erro_em timestamptz,
  rodando_desde timestamptz,
  primary key (cliente, data)
);
alter table kpi_ao_vivo_dia enable row level security;
alter table kpi_ao_vivo_calculo enable row level security;
grant all on kpi_ao_vivo_dia to service_role;
grant all on kpi_ao_vivo_calculo to service_role;
notify pgrst, 'reload schema';
