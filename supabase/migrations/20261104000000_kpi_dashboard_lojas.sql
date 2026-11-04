-- Dashboard do cliente (04/11): tempo na loja, lojas atendidas, horários e
-- ranking de lojas, a partir das NFs ENTREGUES gravadas em
-- kpi_dashboard_kpis.nfs (a planilha do KPI). Dia parcial (rota em
-- andamento) fica fora, igual aos totais do dashboard. Tempo válido para
-- média: 1 a 240 min (acima disso é o carro parado por outro motivo).
create or replace function public.kpi_dashboard_lojas(p_cliente text, p_de date, p_ate date)
returns jsonb
language sql stable
security definer
set search_path = public
as $$
with dias as (
  select data, nfs from kpi_dashboard_kpis
  where cliente = p_cliente and data between p_de and p_ate
    and coalesce((resumo->>'aguardando')::int, 0) = 0
),
nf as (
  select d.data,
    n->>'placa' as placa,
    n->>'carga' as carga,
    upper(regexp_replace(btrim(coalesce(n->>'cliente', '')), '\s+', ' ', 'g')) as loja,
    btrim(coalesce(n->>'cliente', '')) as nome,
    case when n->>'chegada' ~ '^\d{1,2}:\d{2}$'
      then split_part(n->>'chegada', ':', 1)::int * 60 + split_part(n->>'chegada', ':', 2)::int end as cheg_min,
    case when n->>'tempoMin' ~ '^\d+(\.\d+)?$' then (n->>'tempoMin')::numeric end as tempo
  from dias d, jsonb_array_elements(d.nfs) n
  where n->>'categoria' is null
),
valido as (select * from nf where tempo between 1 and 240),
por_loja as (
  select loja, mode() within group (order by nome) as nome, count(*) as visitas,
    round(avg(tempo) filter (where tempo between 1 and 240), 1) as media,
    count(*) filter (where tempo between 1 and 240) as com_tempo
  from nf where loja <> '' group by loja
),
janela as (
  select data, placa, carga, min(cheg_min) as primeira, max(cheg_min) as ultima
  from nf where cheg_min is not null group by 1, 2, 3
)
select jsonb_build_object(
  'entregas', (select count(*) from nf),
  'comTempo', (select count(*) from valido),
  'tempoMedio', (select round(avg(tempo), 1) from valido),
  'tempoMediano', (select percentile_cont(0.5) within group (order by tempo) from valido),
  'lojasAtendidas', (select count(*) from por_loja),
  'primeiraEntrega', (select round(avg(primeira)) from janela),
  'ultimaEntrega', (select round(avg(ultima)) from janela),
  'faixas', (select jsonb_build_object(
      'ate10', count(*) filter (where tempo < 10),
      'de10a20', count(*) filter (where tempo >= 10 and tempo < 20),
      'de20a30', count(*) filter (where tempo >= 20 and tempo < 30),
      'de30a60', count(*) filter (where tempo >= 30 and tempo < 60),
      'acima60', count(*) filter (where tempo >= 60)) from valido),
  'porHora', (select coalesce(jsonb_agg(jsonb_build_object('hora', h, 'entregas', n) order by h), '[]')
      from (select cheg_min / 60 as h, count(*) as n from nf where cheg_min is not null group by 1) x),
  'porDia', (select coalesce(jsonb_agg(jsonb_build_object('data', data, 'tempoMedio', m, 'lojas', l) order by data), '[]')
      from (select data, round(avg(tempo) filter (where tempo between 1 and 240), 1) as m, count(distinct loja) as l from nf group by data) x),
  'maisTempo', (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'visitas', visitas, 'media', media) order by media desc, visitas desc), '[]')
      from (select * from por_loja where com_tempo >= least(3, (select count(*) from dias)) order by media desc, visitas desc limit 10) x),
  'maisAtendidas', (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'visitas', visitas, 'media', media) order by visitas desc, nome), '[]')
      from (select * from por_loja order by visitas desc, nome limit 10) x)
);
$$;

revoke all on function public.kpi_dashboard_lojas(text, date, date) from public, anon, authenticated;
grant execute on function public.kpi_dashboard_lojas(text, date, date) to service_role;
notify pgrst, 'reload schema';
