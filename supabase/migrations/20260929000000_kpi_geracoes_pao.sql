-- Guarda o PDF do Romaneio do Pao junto com Escala e Romaneio, pra que a
-- regeneracao reconstrua o dia completo. Nulo em geracoes antigas.
alter table kpi_romaneio_geracoes add column if not exists pao_storage_path text;
