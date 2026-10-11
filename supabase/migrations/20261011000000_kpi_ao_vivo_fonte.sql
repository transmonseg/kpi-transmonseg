-- supabase/migrations/20261011000000_kpi_ao_vivo_fonte.sql
alter table kpi_ao_vivo_dia add column if not exists fonte text not null default 'manual';
comment on column kpi_ao_vivo_dia.fonte is 'manual | fusion — origem do manifesto do dia';
