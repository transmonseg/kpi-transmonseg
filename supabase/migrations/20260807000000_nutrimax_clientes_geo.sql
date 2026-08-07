-- Cadastro geocodificado dos clientes da Nutry Max (a partir da "Relação
-- clientes.xlsx" que o cliente forneceu — 577 lojas, endereço completo).
-- Usado como reforço quando a Unitrac não confirma uma entrega via /alvos:
-- confere se o GPS parou dentro de um raio do endereço real cadastrado.
-- Populado uma vez por script (scripts/geocodificar-clientes-nutrimax.ts),
-- mantido manualmente — não é escrito pelo app em uso normal.
create table if not exists nutrimax_clientes_geo (
  id            uuid primary key default gen_random_uuid(),
  nome_fantasia text not null,
  razao_social  text,
  endereco      text not null,
  bairro        text,
  municipio     text,
  cep           text,
  lat           double precision not null,
  lng           double precision not null,
  -- precisão que o geocodificador devolveu ('point'|'street'|'centroid'|...)
  -- — usado pra calibrar o raio de match (endereço exato vs. centro da rua).
  accuracy      text not null,
  raio_m        integer not null,
  criado_em     timestamptz not null default now()
);

create index if not exists nutrimax_clientes_geo_nome_idx
  on nutrimax_clientes_geo (upper(nome_fantasia));

alter table nutrimax_clientes_geo enable row level security;

create policy "nutrimax_clientes_geo_read"
  on nutrimax_clientes_geo
  for select
  to authenticated
  using (true);
