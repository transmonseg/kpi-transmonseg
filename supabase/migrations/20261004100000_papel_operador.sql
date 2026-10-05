-- Papel 'operador': login que VÊ e GERA KPI só das empresas liberadas no perfil
-- (ex.: só Nutry Max). Não acessa Usuários, Cozinha nem as outras empresas.
alter table perfis drop constraint if exists perfis_papel_check;
alter table perfis add constraint perfis_papel_check check (papel in ('admin', 'gerente', 'visualizador', 'operador'));
alter table convites drop constraint if exists convites_papel_check;
alter table convites add constraint convites_papel_check check (papel in ('gerente', 'visualizador', 'operador'));
