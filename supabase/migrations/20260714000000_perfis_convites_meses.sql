-- Restrição de dashboard por mês (YYYY-MM), no mesmo padrão de `redes`:
-- array direto na linha de perfis/convites, sem tabela de junção.
-- 'admin' sempre vê tudo (bypass em mesesEfetivos, ver src/lib/perfil.ts).
-- 'gerente' e 'visualizador' só veem os meses presentes em `meses`.

alter table perfis add column if not exists meses text[] not null default '{}';
alter table convites add column if not exists meses text[] not null default '{}';

-- Backfill: hoje não existe nenhuma restrição de mês, então os logins
-- não-admin já enxergam maio e junho livremente — preserva esse acesso.
-- Julho fica de fora (dado incompleto, precisa ser liberado explicitamente).
update perfis
set meses = array['2026-05', '2026-06']
where papel <> 'admin' and meses = '{}';
