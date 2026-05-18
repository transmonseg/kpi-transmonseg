-- Migration: clientes_cozinha
-- Tabela relacional para a Matriz de Clientes da Cozinha Industrial

create table if not exists public.clientes_cozinha (
  id            uuid        primary key default gen_random_uuid(),
  codigo        text        not null unique,
  filial        text        not null default '',
  nome          text        not null default '',
  fantasia      text        not null,
  cnpj          text        not null default '',
  cep           text        not null default '',
  endereco      text        not null default '',
  numero        text        not null default '',
  complemento   text        not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Trigger para manter updated_at automatico
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_clientes_cozinha_updated_at on public.clientes_cozinha;
create trigger trg_clientes_cozinha_updated_at
  before update on public.clientes_cozinha
  for each row execute procedure public.set_updated_at();

-- RLS
alter table public.clientes_cozinha enable row level security;

create policy "authenticated_all_clientes_cozinha"
  on public.clientes_cozinha
  for all
  to authenticated
  using (true)
  with check (true);
