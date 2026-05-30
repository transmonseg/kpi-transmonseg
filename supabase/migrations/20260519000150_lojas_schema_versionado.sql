-- Versiona o schema da tabela `lojas` (estado real em 2026-05-29: 473 linhas).
--
-- A tabela `lojas` foi criada fora de migrations (seed inicial do projeto), então
-- seu schema NUNCA esteve versionado — impossível auditar o estado real ou recriar
-- o ambiente do zero (achado da auditoria 2026-05-29). Esta migration registra a
-- estrutura de forma IDEMPOTENTE e NÃO-DESTRUTIVA:
--   - `create table if not exists` → em produção a tabela já existe, então é NO-OP
--     completo (o Postgres nem avalia colunas/constraints/funções inline).
--   - a FK pra `redes` entra por DO-block guardado: em produção a constraint já
--     existe (lojas_rede_id_fkey) → pulada; só cria se faltar e `redes` existir.
--
-- Dependências (já presentes em produção): extensão uuid-ossp (uuid_generate_v4),
-- função imutável unaccent_imut e tabela `redes` — todas anteriores a esta migration.
--
-- NOTA DE PRODUTO (deixado como está de propósito): `codigo_unitrac` tem UNIQUE
-- GLOBAL. Como o matcher SEMPRE filtra por rede antes de casar por código, o UNIQUE
-- poderia ser (rede_id, codigo_unitrac) pra permitir o mesmo código Unitrac em redes
-- distintas (hoje o cadastro da 2ª rede é bloqueado e a loja fica órfã). Mudar isso
-- é decisão de produto + migração de dados — fora do escopo desta versão.

create table if not exists public.lojas (
  id uuid primary key default extensions.uuid_generate_v4(),
  rede_id text not null,
  nome text not null,
  nome_normalizado text generated always as (upper(unaccent_imut(nome))) stored,
  nome_curto text,
  codigo_escala text,
  codigo_unitrac text unique,
  nome_unitrac text,
  lat double precision,
  lng double precision,
  raio_metros integer default 200,
  entrega_d1_fixo boolean default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- FK rede_id → redes(id): só adiciona se `redes` existir e a constraint faltar.
do $$ begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'redes')
     and not exists (select 1 from pg_constraint where conname = 'lojas_rede_id_fkey') then
    alter table public.lojas
      add constraint lojas_rede_id_fkey foreign key (rede_id) references public.redes(id);
  end if;
end $$;
