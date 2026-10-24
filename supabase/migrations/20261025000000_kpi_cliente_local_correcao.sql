-- F4-07 (GEO-24, ACH-07, D-08): trilha das correções de ponto feitas na tela
-- "Clientes que sempre falham" (/painel/clientes-falha, rota
-- /api/kpi/ponto-cliente). Cada correção grava kpi_cliente_local com fonte
-- 'manual' e UMA linha aqui: quem, quando, de onde (anterior = a linha inteira
-- de kpi_cliente_local antes, null = não existia) para onde (lat/lng), a
-- evidência recalculada no servidor e o anexo (bucket kpi-romaneio-inputs,
-- pasta comprovantes/nutrimax/ponto-cliente/). "Desfazer" restaura `anterior`
-- e preenche desfeita_em/desfeita_por. Nenhum código faz DELETE aqui.
--
-- SEM esta tabela o código funciona igual ao de hoje: a tela lista os clientes
-- e as evidências, mas toda gravação devolve 503 e nada é gravado.
--
-- APLICAR (dono, na janela 21:30-23:45 BRT, banco kpi_transmonseg do Contabo):
--   scp supabase/migrations/20261025000000_kpi_cliente_local_correcao.sql transmonseg-vps:/tmp/
--   ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -v ON_ERROR_STOP=1 -f /tmp/20261025000000_kpi_cliente_local_correcao.sql"
--   (tabela nova e vazia: sem índice grande, sem lock em tabela existente)
-- VERIFICAR:
--   sudo -u postgres psql -d kpi_transmonseg -c '\d kpi_cliente_local_correcao'
--   GET do PostgREST (service role) em /rest/v1/kpi_cliente_local_correcao?limit=1 -> 200 e []
--   tela /painel/clientes-falha › um cliente: o aviso "correção ainda não liberada" some.
-- ROLLBACK (só enquanto estiver vazia; com linhas, guardar antes com \copy):
--   drop table if exists kpi_cliente_local_correcao; notify pgrst, 'reload schema';
create table if not exists kpi_cliente_local_correcao (
  id bigserial primary key,
  empresa text not null,
  cliente_codigo text not null,
  acao text not null check (acao in ('parada', 'cadastro_unitrac', 'aprendido', 'pino')),
  lat double precision not null,
  lng double precision not null,
  endereco_ref text,
  evidencia jsonb not null default '{}'::jsonb,
  documento text,
  observacao text,
  responsavel text not null,
  anterior jsonb,
  criado_em timestamptz not null default now(),
  desfeita_em timestamptz,
  desfeita_por text,
  check (acao <> 'pino' or documento is not null)
);
create index if not exists kpi_cliente_local_correcao_cliente on kpi_cliente_local_correcao (empresa, cliente_codigo, criado_em desc);
alter table kpi_cliente_local_correcao enable row level security;
-- Sem policies: leitura/escrita só via service_role (mesmo padrão de kpi_nf_resolucao).
grant all on kpi_cliente_local_correcao to service_role;
grant usage, select on sequence kpi_cliente_local_correcao_id_seq to service_role;
comment on table kpi_cliente_local_correcao is 'F4-07: trilha das correções de ponto do cliente feitas na tela (quem, quando, evidência, anexo, estado anterior; desfazer)';
notify pgrst, 'reload schema';
