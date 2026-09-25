-- Resolucao manual por NF (Task 4, plano 2026-09-24-melhorias-relatorio-final-ana):
-- requisito P0 do PDF da Ana -- "persistir status automatico ORIGINAL, resolucao
-- manual, responsavel, data/hora, documento e historico; nova execucao nao pode
-- apagar". Linhas nunca sao UPDATE/DELETE: cada resolucao nova e' um INSERT --
-- historico = todas as linhas da NF, vigente = a de maior `criado_em`
-- (resolucoes.ts/resolucaoVigente). Isso e' o que garante os dois casos do
-- Review Focus do plano: NF resolvida que some do romaneio numa regeracao nao
-- perde a resolucao (a tabela nao depende do romaneio pra existir), e duas
-- resolucoes da mesma NF nao se apagam (a segunda so' vence por ser mais
-- recente, a primeira continua na tabela).
create table if not exists kpi_nf_resolucao (
  id bigserial primary key,
  empresa text not null,
  data date not null,
  nf text not null,
  resolucao text not null check (resolucao in ('entregue','entregue_tempo_conferido','entregue_rastro_oscilante','entregue_outra_placa','nao_esteve_no_local','desatualizado')),
  placa_executora text,
  observacao text,
  responsavel text not null,
  documento text,
  criado_em timestamptz not null default now()
);
create index if not exists kpi_nf_resolucao_busca on kpi_nf_resolucao (empresa, data, nf, criado_em desc);
alter table kpi_nf_resolucao enable row level security;
-- Sem policies: leitura/escrita só via service_role (mesmo padrão de kpi_alvos_snapshot).
