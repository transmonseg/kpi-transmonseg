-- Pedido do usuario 01/09: "quero um historico das geracoes... pra gente
-- poder sempre regerar". kpi_romaneio_geracoes ja existia (auditoria
-- simples, quem/quando/quantas cargas) mas nunca guardava o arquivo -- a
-- pagina de historico dizia explicitamente "baixe de novo gerando o KPI do
-- mesmo dia se precisar". Sem os PDFs originais (Escala + Romaneio) nao
-- da pra regenerar de verdade -- so re-baixar o MESMO xlsx (inutil se o
-- pedido e' aplicar uma correcao de bug e gerar de novo com o fix).
--
-- Guarda os 2 PDFs originais no Storage (service role, sem policy pra
-- `authenticated` -- upload/download so pelo backend, mesmo padrao de
-- kpi-manual-raw) -- "regenerar" = baixar os PDFs de volta e rodar a MESMA
-- pipeline de novo, se beneficiando de qualquer fix aplicado desde entao.
alter table kpi_romaneio_geracoes
  add column if not exists escala_storage_path text,
  add column if not exists romaneio_storage_path text;

insert into storage.buckets (id, name, public)
values ('kpi-romaneio-inputs', 'kpi-romaneio-inputs', false)
on conflict (id) do nothing;
