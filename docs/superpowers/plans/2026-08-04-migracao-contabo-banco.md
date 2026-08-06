# Migração KPI pro Contabo — Banco Self-Hosted (Sub-projeto 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ter um banco Postgres self-hosted no Contabo (`kpi_transmonseg`), com schema e dado idênticos ao Supabase de produção do KPI, servido por um PostgREST próprio, validado por contagem de linha e queries reais — sem tocar em nenhuma linha de código do app nem em nada que a produção atual (Vercel) usa.

**Architecture:** Novo banco (`kpi_transmonseg`) no MESMO servidor Postgres self-hosted que já roda o Monitoramento no Contabo. `pg_dump`/`pg_restore` rodando direto no Contabo (schema depois dado, separados). PostgREST próprio (porta 3002, `web_anon`/`app_service` mesmo padrão do Monitoramento). Job de `pg_cron` do KPI (decay de confiança) agendado via `cron.schedule_in_database()` a partir do banco `transmonseg` (onde o worker do pg_cron realmente roda, `cron.database_name = transmonseg`).

**Tech Stack:** PostgreSQL 17.10 self-hosted (Contabo, Ubuntu), PostgREST, pg_cron 1.6 (já instalada em `transmonseg`, reusada via `cron.schedule_in_database` — não instalada em `kpi_transmonseg`, ver Task 1 Step 3), extensions em `kpi_transmonseg`: `pg_trgm`/`unaccent`.

## Global Constraints

- Zero mudança no banco/PostgREST/GoTrue do Monitoramento — processos e configs totalmente separados.
- Zero mudança no Supabase de origem (`luhwpsckvbctxynifryk`) — só leitura via `pg_dump`.
- Zero mudança no app de produção (Vercel) — nada aponta pro banco novo até o sub-projeto 4.
- Toda credencial nova (senha do role, etc.) registrada em `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md` antes de considerar a task concluída.
- Comandos remotos via `ssh transmonseg-vps "..."` (alias já configurado, ver `~/.ssh/config`).

---

### Task 1: Criar o banco, roles e extensions no Contabo

**Files:**
- Nenhum arquivo local — comandos SQL direto via SSH no Contabo.
- Atualizar: `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md` (adicionar seção nova).

**Interfaces:**
- Produces: banco `kpi_transmonseg` existente, role `app_service_kpi` (login, `noinherit`, `bypassrls`, senha gerada) com GRANT ALL em `public`, role `web_anon_kpi` (sem login, sem grants) — nomes com sufixo `_kpi` pra não colidir com os roles `app_service`/`web_anon` já existentes do Monitoramento no mesmo cluster.

- [ ] **Step 1: Gerar senha forte pro novo role**

Run: `openssl rand -base64 24`

Guardar o valor gerado (vai ser usado no Step 2 e no Step 5).

- [ ] **Step 2: Criar banco + roles no Contabo**

Run (substituir `<SENHA_GERADA>` pelo valor do Step 1):

```bash
ssh transmonseg-vps "sudo -u postgres psql -c \"create database kpi_transmonseg;\""
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"
create role app_service_kpi noinherit login bypassrls password '<SENHA_GERADA>';
create role web_anon_kpi nologin noinherit;
grant all on all tables in schema public to app_service_kpi;
grant all on all sequences in schema public to app_service_kpi;
grant usage on schema public to app_service_kpi;
grant usage on schema public to web_anon_kpi;
grant web_anon_kpi to app_service_kpi;
\""
```

Expected: dois `CREATE ROLE` e um `CREATE DATABASE` sem erro (os GRANTs em Step 2 não afetam nada ainda, schema está vazio — rodam de novo depois do restore no Task 3, sem problema, são idempotentes).

**Achado real (Task 5, execução original): faltava `grant web_anon_kpi to app_service_kpi`.** Sem essa membership, o PostgREST não consegue `SET ROLE web_anon_kpi` pra atender requisição anônima (`db-anon-role`) — devolve `401 permission denied to set role`. Confirmado que o Monitoramento tem esse mesmo padrão (`app_service` é membro de `web_anon`, via `pg_auth_members`). Já incluído no comando acima; se a Task 1 já tiver rodado sem essa linha, aplicar isolado: `ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c 'grant web_anon_kpi to app_service_kpi;'"`.

- [ ] **Step 3: Instalar extensions**

**Correção pós-execução (achado real, Task 1 rodada em 04/08):** `pg_cron`
NÃO entra aqui. É extension "singleton" por cluster Postgres —
`cron.database_name` (`postgresql.conf`) já está fixo em `transmonseg`
(banco do Monitoramento, 14 jobs ativos, 4 rodando a cada minuto), e
`CREATE EXTENSION pg_cron` só é permitido NESSE banco especificamente —
tentar em `kpi_transmonseg` dá `ERROR: can only create extension in
database transmonseg`, e por rodar dentro de uma transação implícita
(`psql -c` com múltiplos comandos), o erro faz ROLLBACK de tudo que veio
antes na mesma chamada (inclusive `pg_trgm`/`unaccent`, se estiverem no
mesmo `-c`). Isso não é um problema real: a Task 4 já resolve o
agendamento do job do KPI via `cron.schedule_in_database()` chamado a
partir de `transmonseg` (onde o worker do pg_cron já roda) — nenhuma
extension precisa existir em `kpi_transmonseg` pra isso funcionar. Rodar
`pg_trgm`/`unaccent` numa chamada SEPARADA de `pg_cron` (nem tentar
`pg_cron` aqui).

Run:

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"
create extension if not exists pg_trgm;
create extension if not exists unaccent;
\""
```

Expected: dois `CREATE EXTENSION` (ou aviso "already exists" pro pg_trgm, que já vem no `shared_preload_libraries` do cluster — sem erro real).

Verificar: `ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c '\\dx'"` — lista `pg_trgm`, `unaccent`, `plpgsql`. NÃO lista `pg_cron` (esperado — ver Task 4).

- [ ] **Step 4: Registrar no vault**

Adicionar em `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md` (usar a ferramenta de edição, não escrever a senha em texto solto no chat):

```markdown
## Contabo — banco self-hosted (2026-08-04, sub-projeto 1 da migração)

Banco `kpi_transmonseg` no MESMO servidor Postgres que já roda o
Monitoramento (mesmo VPS, ver seção Contabo em monitoramento/chaves.md).

```
usuário: app_service_kpi
senha: <SENHA_GERADA>
```

Role sem login `web_anon_kpi` (sem grants, mesmo padrão `web_anon` do
Monitoramento — usado pelo PostgREST quando não há Authorization header).
```

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/chaves-apis-joaquim && git add sistema-kpi/chaves.md && git commit -m "docs(kpi): banco self-hosted criado no Contabo (sub-projeto 1)"
```

---

### Task 2: Migrar o schema (sem dado) do Supabase pro Contabo

**Files:**
- Nenhum arquivo local — dump temporário fica em `/tmp` no Contabo, apagado no final da task.

**Interfaces:**
- Consumes: `DATABASE_URL` do Supabase de origem (`~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md`, seção "Senha direta do Postgres").
- Produces: schema completo (tabelas, sequences, funções RPC, policies de RLS, triggers) replicado em `kpi_transmonseg`.

- [ ] **Step 1: Dump do schema, rodando direto no Contabo**

Run (o Contabo tem acesso de saída à internet — roda pg_dump lá direto contra o Supabase, sem passar arquivo pela máquina local):

```bash
ssh transmonseg-vps "pg_dump '<DATABASE_URL do Supabase de origem — ver ~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md, seção Senha direta do Postgres>' \
  --schema-only \
  --schema=public \
  --no-owner --no-privileges \
  -f /tmp/kpi_schema.sql"
```

Expected: comando termina sem erro, arquivo `/tmp/kpi_schema.sql` criado no Contabo.

Verificar: `ssh transmonseg-vps "wc -l /tmp/kpi_schema.sql"` — deve ter algumas centenas/milhares de linhas (37 migrations acumuladas).

- [ ] **Step 1b: Corrigir referência a `extensions.uuid_generate_v4()` (achado real, 1ª execução da Task 2)**

O dump do Supabase referencia `extensions.uuid_generate_v4()` (schema interno do Supabase, fora do `--schema=public`) como `DEFAULT` de `id uuid` em 12 tabelas: `alteracoes`, `anomalias`, `escala_linhas`, `escala_uploads`, `kpi_linhas`, `kpi_rotas`, `kpis`, `lojas`, `motoristas`, `unitrac_paradas`, `unitrac_uploads`, `veiculos`. Esse schema não existe (nem precisa existir) em `kpi_transmonseg`. As outras 14 tabelas do mesmo dump já usam `DEFAULT gen_random_uuid()` (função nativa do Postgres 13+, sem extension) com sucesso — mesma semântica (UUID v4 aleatório). Decisão: padronizar as 12 tabelas pra usar a mesma função nativa, em vez de replicar o schema `extensions` do Supabase (mais simples, sem dependência nova, sem divergência de comportamento).

Run:

```bash
ssh transmonseg-vps "sed -i 's/extensions\.uuid_generate_v4()/gen_random_uuid()/g' /tmp/kpi_schema.sql"
```

Verificar: `ssh transmonseg-vps "grep -c 'extensions\.' /tmp/kpi_schema.sql"` — Expected: `0`.

- [ ] **Step 2: Restaurar o schema no banco novo**

Antes de restaurar, garantir estado limpo (schema `public` vazio) — evita erros de "already exists" se este step já foi tentado antes:

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;'"
```

Run:

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -f /tmp/kpi_schema.sql > /tmp/restore_schema.log 2>&1; tail -80 /tmp/restore_schema.log"
```

Expected: sequência de `CREATE TABLE`/`CREATE FUNCTION`/`ALTER TABLE`/`CREATE POLICY` etc. Os seguintes tipos de erro são esperados e não bloqueiam (ligados a objetos/roles que só existem no Supabase, não à estrutura das tabelas em si): `role "authenticated"/"service_role" does not exist` (roles de auth do Supabase, não usadas — a app usa `app_service_kpi`/`web_anon_kpi`), `schema "auth" does not exist` (funções tipo `auth.uid()` em policies RLS — só a policy específica falha, não a tabela), `schema "public" already exists` (não deveria mais aparecer depois do DROP/CREATE acima, mas inofensivo se aparecer). Qualquer erro do tipo `relation "public.X" does not exist` ou `CREATE TABLE`/`CREATE FUNCTION` falhando de verdade — isso SIM é bloqueante, investigar antes de prosseguir (não deveria mais acontecer depois do Step 1b).

- [ ] **Step 3: Conferir que as 26 tabelas existem**

Run:

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"select count(*) from information_schema.tables where table_schema='public';\""
```

Expected: **26** (as `lojas_bkp_*`, se vierem no dump, contam pra esse total — não são um problema, são backups manuais antigos da origem). Se vier diferente de 26, listar as tabelas (`select table_name from information_schema.tables where table_schema='public' order by 1;`) e comparar contra a lista completa desta sessão antes de prosseguir — não prosseguir com contagem divergente sem entender a diferença.

- [ ] **Step 4: Aplicar os GRANTs de novo (agora que o schema existe)**

Run:

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"
grant all on all tables in schema public to app_service_kpi;
grant all on all sequences in schema public to app_service_kpi;
\""
```

- [ ] **Step 5: Limpar o dump temporário**

Run: `ssh transmonseg-vps "rm /tmp/kpi_schema.sql"`

- [ ] **Step 6: Commit**

Nada pra commitar nesta task (mudança só no banco remoto) — pular pra próxima task.

---

### Task 3: Migrar o dado do Supabase pro Contabo

**Files:**
- Nenhum arquivo local — dump temporário em `/tmp` no Contabo.

**Interfaces:**
- Consumes: schema já criado (Task 2).
- Produces: todas as linhas das 26 tabelas replicadas em `kpi_transmonseg`, idênticas em contagem ao Supabase de origem.

- [ ] **Step 1: Dump do dado**

Run:

```bash
ssh transmonseg-vps "pg_dump '<DATABASE_URL do Supabase de origem — ver ~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md, seção Senha direta do Postgres>' \
  --data-only \
  --schema=public \
  --disable-triggers \
  -f /tmp/kpi_data.sql"
```

`--disable-triggers`: evita que triggers de auditoria/RLS disparem durante a carga em massa (mesmo padrão de restore de dado em produção).

Expected: comando termina sem erro.

- [ ] **Step 2: Restaurar o dado**

Run:

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -f /tmp/kpi_data.sql 2>&1 | tail -80"
```

Expected: sequência de `COPY N` (uma linha por tabela) sem erro de `violates foreign key constraint` (se aparecer, é ordem de carga — `pg_dump` já ordena por dependência de FK corretamente por padrão, não deveria acontecer; se acontecer, investigar antes de prosseguir, não ignorar).

- [ ] **Step 3: Validar contagem de linha por tabela (origem vs destino)**

Run — pega a contagem no destino (Contabo):

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"
select relname, n_live_tup from pg_stat_user_tables where schemaname='public' order by relname;
\""
```

Como `n_live_tup` só atualiza depois de um `ANALYZE`, rodar `ANALYZE` antes:

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c 'ANALYZE;'"
```

Comparar contra os números já medidos nesta sessão via PostgREST do Supabase: `kpi_manual_entradas=19681`, `escala_linhas=5934`, `lojas=451`, `clientes_cozinha=415`, `kpi_simples=608`, `perfis=11`, `veiculos=224`, `canonical_loja=127`, `alias_loja=110`, `redes=19`, `escala_uploads=61`, `kpi_nutrimax_geracoes=35`, `kpi_fechamentos=2`, `convites=5`. As demais (kpi_linhas, kpi_geracoes, kpis, anomalias, alteracoes, kpi_nutrimax_entradas, kpi_rotas, unitrac_paradas, unitrac_uploads, motoristas, review_queue) devem estar em 0.

Se algum número não bater, NÃO prosseguir pra próxima task — investigar a tabela específica (provável causa: RLS na origem bloqueando o pg_dump se rodou com um usuário sem bypass — usar sempre a connection string com usuário `postgres`, que já tem bypass, como usado no Step 1).

- [ ] **Step 4: Rodar 3 queries de integridade nos dois bancos e comparar**

`src/lib/kpi/dashboard-metricas.ts` só agrega dado já buscado em JS (não tem SQL próprio) — as queries de validação abaixo batem direto nas tabelas maiores/mais centrais, cobrindo agregação + join + soma numérica:

```sql
-- 1. Agregação simples pela maior tabela
select rede_id, count(*) from kpi_manual_entradas group by rede_id order by 1;

-- 2. Join entre lojas e a rede (garante FK/relacionamento intacto)
select r.nome, count(l.id) from lojas l join redes r on r.id = l.rede_id group by r.nome order by 1;

-- 3. Soma numérica (garante tipo/precisão preservados no restore) --
-- confirmado nesta sessão: kpi_manual_entradas NÃO tem coluna numérica
-- (é status/texto) -- usa escala_linhas.peso_kg (integer) em vez disso.
select sum(peso_kg) from escala_linhas;
```

Rodar cada query contra a origem (via `psql` apontando pra Supabase, mesma connection string do Step 1 desta task) e contra o destino (`kpi_transmonseg`), comparar resultado linha a linha.

Expected: resultado idêntico nos dois lados.

- [ ] **Step 5: Limpar o dump temporário**

Run: `ssh transmonseg-vps "rm /tmp/kpi_data.sql"`

- [ ] **Step 6: Commit**

Nada pra commitar (mudança só no banco remoto) — pular pra próxima task.

---

### Task 4: Reagendar o job de pg_cron do KPI (cross-database)

**Files:**
- Nenhum arquivo local.

**Interfaces:**
- Consumes: banco `transmonseg` (onde `cron.database_name` aponta e o worker do pg_cron realmente roda — confirmado nesta sessão) e o job já existente `confidence-decay-daily` da migration `20260519000700_cron_decay.sql`.
- Produces: job `kpi-confidence-decay-daily` agendado e rodando contra `kpi_transmonseg` via `cron.schedule_in_database`.

- [ ] **Step 1: Confirmar que o job NÃO foi criado automaticamente pelo restore**

O `pg_dump`/`pg_restore` do schema (Task 2) recria a FUNÇÃO/lógica das migrations, mas `cron.schedule(...)` é uma CHAMADA de função que insere uma linha em `cron.job` — como essa tabela mora no schema `cron` da database `transmonseg` (não em `kpi_transmonseg`), o restore do Task 2 NÃO deveria ter criado o job. Confirmar:

Run: `ssh transmonseg-vps "sudo -u postgres psql -d transmonseg -c \"select jobid, jobname, database from cron.job where jobname like '%kpi%' or jobname like '%confidence%';\""`

Expected: 0 linhas (job ainda não existe).

- [ ] **Step 2: Agendar o job via `cron.schedule_in_database`**

Run (chamado a partir de `transmonseg`, onde o worker do pg_cron roda, mas apontando o `command` pra rodar dentro de `kpi_transmonseg`):

```bash
ssh transmonseg-vps "sudo -u postgres psql -d transmonseg -c \"
SELECT cron.schedule_in_database(
  'kpi-confidence-decay-daily',
  '0 3 * * *',
  \\\$\\\$
    UPDATE alias_loja SET
      confidence = GREATEST(0.1, confidence - (
        0.01 * EXTRACT(EPOCH FROM (now() - last_seen_at)) / 86400.0
      )),
      auto_approve = CASE WHEN confidence < 0.5 THEN false ELSE auto_approve END
    WHERE source != 'seed'
      AND last_seen_at < now() - INTERVAL '1 day'
      AND confidence > 0.1;
  \\\$\\\$,
  'kpi_transmonseg'
);
\""
```

(Escapes `\\\$\\\$` são pra sobreviver ao shell + `-c` do psql ao mesmo tempo — se der erro de parsing, rodar via arquivo `.sql` temporário em vez de `-c` inline: escrever o SQL acima com `$$...$$` normal num arquivo `/tmp/kpi_cron.sql` no Contabo via heredoc SSH, depois `psql -d transmonseg -f /tmp/kpi_cron.sql`.)

Expected: `schedule_in_database` retorna um `jobid` (inteiro).

- [ ] **Step 3: Confirmar o job agendado**

Run: `ssh transmonseg-vps "sudo -u postgres psql -d transmonseg -c \"select jobid, jobname, schedule, database from cron.job where jobname='kpi-confidence-decay-daily';\""`

Expected: 1 linha, `database = kpi_transmonseg`.

- [ ] **Step 4: Commit**

Nada pra commitar — pular pra próxima task.

---

### Task 5: Subir o PostgREST próprio do KPI

**Files:**
- Create (no Contabo, via SSH): `/etc/postgrest/kpi.conf`
- Create (no Contabo, via SSH): `/etc/systemd/system/postgrest-kpi.service`

**Interfaces:**
- Consumes: `app_service_kpi`/senha (Task 1), banco `kpi_transmonseg` (Task 2/3).
- Produces: PostgREST respondendo em `127.0.0.1:3002`, API REST completa do schema `kpi_transmonseg`.

- [ ] **Step 1: Criar o arquivo de config**

Run (substituir `<SENHA_GERADA>` pela senha do Task 1 — mesmo padrão exato do `/etc/postgrest/transmonseg.conf` já em produção pro Monitoramento):

```bash
ssh transmonseg-vps "cat > /etc/postgrest/kpi.conf << 'EOF'
db-uri = \"postgresql://app_service_kpi:<SENHA_GERADA>@localhost:5432/kpi_transmonseg\"
db-schemas = \"public\"
db-anon-role = \"web_anon_kpi\"
server-port = 3002
server-host = \"127.0.0.1\"
EOF"
ssh transmonseg-vps "chmod 600 /etc/postgrest/kpi.conf && chown postgres:postgres /etc/postgrest/kpi.conf"
```

Nota: sem `jwt-secret` por enquanto (o GoTrue do KPI ainda não existe — isso é o sub-projeto 2; sem `jwt-secret` configurado, qualquer request com `Authorization` presente vai dar 500 `PGRST300`, mesmo comportamento que o Monitoramento tinha antes de sua própria Task 12 — aceitável nesta task, que só valida o schema/dado, não login).

- [ ] **Step 2: Criar o systemd unit**

Run (mesmo padrão exato de `/etc/systemd/system/postgrest.service`, trocando o nome e o config):

```bash
ssh transmonseg-vps "cat > /etc/systemd/system/postgrest-kpi.service << 'EOF'
[Unit]
Description=PostgREST KPI
After=postgresql.service

[Service]
ExecStart=/usr/local/bin/postgrest /etc/postgrest/kpi.conf
Restart=always
User=postgres

[Install]
WantedBy=multi-user.target
EOF"
ssh transmonseg-vps "systemctl daemon-reload && systemctl enable postgrest-kpi && systemctl start postgrest-kpi"
```

- [ ] **Step 3: Confirmar rodando**

Run: `ssh transmonseg-vps "systemctl status postgrest-kpi --no-pager | head -10"`

Expected: `Active: active (running)`.

- [ ] **Step 4: Testar com curl real (sem Authorization — usa web_anon_kpi)**

Run: `ssh transmonseg-vps "curl -s 'http://127.0.0.1:3002/lojas?limit=3'"`

Expected: `[]` ou `{"message":"permission denied for table lojas",...}` (esperado — `web_anon_kpi` não tem GRANT nenhum, mesmo comportamento do `web_anon` do Monitoramento; isso PROVA que o PostgREST está de pé e conversando com o banco certo, só ainda sem permissão pra ler, o que é o esperado nesta task).

- [ ] **Step 5: Testar via curl usando conexão direta (bypassa PostgREST, confirma o dado em si)**

Run: `ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c 'select nome from lojas limit 3;'"`

Expected: 3 nomes de loja reais (confirma que o dado está lá e legível, independente do PostgREST).

- [ ] **Step 6: Registrar no vault**

Adicionar em `~/Projects/chaves-apis-joaquim/sistema-kpi/chaves.md`, mesma seção do Task 1:

```markdown
PostgREST próprio: `127.0.0.1:3002` (systemd `postgrest-kpi.service`,
config `/etc/postgrest/kpi.conf`). Sem `jwt-secret` ainda — configurado
no sub-projeto 2 (auth/GoTrue), junto com `db-anon-role` passando a
aceitar JWT real.
```

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/chaves-apis-joaquim && git add sistema-kpi/chaves.md && git commit -m "docs(kpi): PostgREST proprio no ar (porta 3002), banco migrado e validado"
```

---

## Verificação final do sub-projeto 1

- [ ] Contagem de linha por tabela batendo 100% entre origem (Supabase) e destino (Contabo) — Task 3, Step 3.
- [ ] 3 queries reais de negócio com resultado idêntico nos dois bancos — Task 3, Step 4.
- [ ] Job de pg_cron agendado e confirmado em `cron.job` — Task 4, Step 3.
- [ ] PostgREST respondendo em `127.0.0.1:3002` — Task 5, Step 3/4.
- [ ] Nenhuma linha de código do app (`src/`) alterada nesta sessão — só banco/infra no Contabo + vault.
- [ ] Vercel/Supabase de produção intocados — nenhum teste rodou `INSERT`/`UPDATE`/`DELETE` contra a origem, só `SELECT` via `pg_dump`.

Próximo passo (fora deste plano): sub-projeto 2, GoTrue + migração de usuários/convites — só começar depois do usuário revisar este sub-projeto concluído.
