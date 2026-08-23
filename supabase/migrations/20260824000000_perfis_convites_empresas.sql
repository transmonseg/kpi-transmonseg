-- Escopo por empresa, no mesmo padrão de `redes`/`meses`: array direto na
-- linha de perfis/convites, sem tabela de junção. 'admin' sempre vê tudo
-- (bypass em empresaLiberada, ver src/lib/perfil.ts). 'redes' continua
-- sendo sub-escopo só dentro de 'benassi' -- não muda de sentido.
-- Ver docs/superpowers/specs/2026-08-23-empresa-acesso-nav-design.md.

alter table perfis add column if not exists empresas text[] not null default '{}';
alter table convites add column if not exists empresas text[] not null default '{}';

-- Backfill: hoje 100% dos logins restritos são de Benassi. Cobre também
-- convites pendentes — sem isso, um convite ainda não resgatado no momento
-- da migration nasceria com empresas={} e o login resultante ficaria sem
-- acesso a nada (nem no nav, nem em nenhuma rota).
update perfis set empresas = array['benassi'] where empresas = '{}';
update convites set empresas = array['benassi'] where empresas = '{}' and usado_em is null;
