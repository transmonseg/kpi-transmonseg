-- Adiciona o terceiro status do Unitrac (situacao=98, sem documentação oficial —
-- inferido como confirmação indireta/em lote, ver comentário em
-- src/lib/kpi-nutrimax/types.ts) e duas flags calculadas a partir da frota/alvos:
-- placa_rastreada (a placa transmitiu algo no dia) e placa_duplicada (mesma placa
-- em mais de uma carga no dia).

alter table kpi_nutrimax_entradas drop constraint if exists kpi_nutrimax_entradas_status_check;
alter table kpi_nutrimax_entradas add constraint kpi_nutrimax_entradas_status_check
  check (status in ('entregue', 'pendente', 'confirmado_indireto'));

alter table kpi_nutrimax_entradas add column if not exists placa_rastreada boolean not null default true;
alter table kpi_nutrimax_entradas add column if not exists placa_duplicada boolean not null default false;
