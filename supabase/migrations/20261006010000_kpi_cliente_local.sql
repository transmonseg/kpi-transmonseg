-- Cadastro de locais dos clientes (05/10): coordenada boa de cada cliente
-- (codigo do cliente no romaneio), usada pela geracao do KPI antes do
-- geocode por texto. Aprendida toda noite (scripts/aprender-locais-clientes.ts)
-- ou gravada a mao. kpi_cliente_local_evidencia: uma linha por cliente/dia/
-- origem -- o historico que justifica cada local (auditavel).
create table if not exists kpi_cliente_local (
  empresa text not null,
  cliente_codigo text not null,
  cliente_nome text,
  lat double precision not null,
  lng double precision not null,
  raio_m integer,
  fonte text not null check (fonte in ('manual', 'entrega_confirmada', 'parada_orfa')),
  confirmacoes integer not null default 1,
  endereco_ref text,
  observacao text,
  atualizado_em timestamptz not null default now(),
  primary key (empresa, cliente_codigo)
);
create table if not exists kpi_cliente_local_evidencia (
  empresa text not null,
  cliente_codigo text not null,
  data date not null,
  origem text not null check (origem in ('manual', 'entrega_confirmada', 'parada_orfa')),
  nf text,
  lat double precision not null,
  lng double precision not null,
  dist_geocode_m integer,
  detalhe text,
  criado_em timestamptz not null default now(),
  primary key (empresa, cliente_codigo, data, origem)
);
create index if not exists kpi_cliente_local_evidencia_cliente on kpi_cliente_local_evidencia (empresa, cliente_codigo);
alter table kpi_cliente_local enable row level security;
alter table kpi_cliente_local_evidencia enable row level security;
grant all on kpi_cliente_local to service_role;
grant all on kpi_cliente_local_evidencia to service_role;
notify pgrst, 'reload schema';
