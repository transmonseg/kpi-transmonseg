-- Adiciona campo de análise gerada por IA na tabela kpis
alter table kpis add column if not exists analise_ia text;
