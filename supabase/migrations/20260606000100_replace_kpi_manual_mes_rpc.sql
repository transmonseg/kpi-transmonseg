create or replace function public.replace_kpi_manual_mes(
  p_rede_id text,
  p_mes text,
  p_entradas jsonb,
  p_uploaded_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ini date;
  v_fim date;
begin
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'Mes invalido: %', p_mes using errcode = '22007';
  end if;

  v_ini := (p_mes || '-01')::date;
  v_fim := (v_ini + interval '1 month - 1 day')::date;

  delete from public.kpi_manual_entradas
  where rede_id = p_rede_id
    and data between v_ini and v_fim;

  insert into public.kpi_manual_entradas (
    data,
    rede_id,
    loja,
    placa,
    motorista,
    status,
    saida_cd,
    chd,
    sai,
    volta_base,
    uploaded_by
  )
  select
    e.data,
    e.rede_id,
    e.loja,
    e.placa,
    e.motorista,
    e.status,
    e.saida_cd,
    e.chd,
    e.sai,
    e.volta_base,
    p_uploaded_by
  from jsonb_to_recordset(p_entradas) as e(
    data date,
    rede_id text,
    loja text,
    placa text,
    motorista text,
    status text,
    saida_cd text,
    chd text,
    sai text,
    volta_base text
  )
  where e.rede_id = p_rede_id
    and e.data between v_ini and v_fim;
end;
$$;
