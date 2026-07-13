-- O convite não fixa mais o email de quem vai usar: a pessoa escolhe o próprio
-- email (e senha) na hora de resgatar o link. O convite só carrega o cargo
-- (papel + redes). Ver docs/superpowers/specs/2026-07-13-rbac-dashboard-design.md.
alter table convites drop column if exists email;
