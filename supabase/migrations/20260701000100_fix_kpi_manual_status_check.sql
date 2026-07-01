-- O check constraint original (20260528000000) só aceitava 3 status
-- ('entregue','nao_foi','sem_rastreador'), mas o parser foi enriquecido em
-- e23dec0 (17/06) pra produzir 7 valores ('entregue','em_rota','nao_foi',
-- 'mudou_de_rota','desatualizado','sem_rastreador','indefinido') sem que a
-- constraint tivesse sido atualizada junto. Como o insert do mês inteiro roda
-- numa única transação (replace_kpi_manual_mes), UMA linha com status fora dos
-- 3 antigos derrubava a importação inteira do mês/rede — explica os erros em
-- quase toda rede no dashboard.
alter table public.kpi_manual_entradas drop constraint if exists kpi_manual_entradas_status_check;
alter table public.kpi_manual_entradas add constraint kpi_manual_entradas_status_check
  check (status in ('entregue','em_rota','nao_foi','mudou_de_rota','desatualizado','sem_rastreador','indefinido'));
