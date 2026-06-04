-- Dashboard: volta pra base (coluna "CHEGADA CD" do KPI). Permite medir o tempo de
-- operação real (Saída CD → volta à base). Nullable e retrocompatível: KPIs antigos
-- (sem a coluna) ficam com volta_base = null.
alter table kpi_manual_entradas add column if not exists volta_base text;
