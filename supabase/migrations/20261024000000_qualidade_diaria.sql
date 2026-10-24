-- F1-01 (plano mestre 23/10): placar de qualidade diario. Uma linha por
-- (dia, cliente, metrica); gravada pelo scripts/placar-qualidade.ts --gravar
-- (cron 06:30 BRT). So' uso interno: RLS ligado e sem policy (anon e
-- authenticated nao leem nada; o service role ignora RLS).
create table if not exists public.qualidade_diaria (
  dia date not null,
  cliente text not null,
  metrica text not null,
  valor numeric,
  detalhe jsonb,
  medido_em timestamptz not null default now(),
  primary key (dia, cliente, metrica)
);
alter table public.qualidade_diaria enable row level security;
notify pgrst, 'reload schema';
