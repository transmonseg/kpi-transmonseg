-- 09/11: conferencia manual em qualquer tela (Ao vivo e mapa da entrega do
-- monitoramento). 'confirmada_operacao' = a operacao conferiu (Unitrac,
-- motorista, cliente) e confirma a entrega sem canhoto; 'desfeita' = volta a
-- valer o automatico (clicou errado). Continua so' INSERT (historico inteiro).
alter table kpi_nf_resolucao drop constraint if exists kpi_nf_resolucao_resolucao_check;
alter table kpi_nf_resolucao add constraint kpi_nf_resolucao_resolucao_check check (resolucao in (
  'entregue','entregue_tempo_conferido','entregue_rastro_oscilante','entregue_outra_placa',
  'nao_esteve_no_local','desatualizado','confirmada_operacao','desfeita'));
