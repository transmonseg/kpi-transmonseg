# Migração KPI Transmonseg pro Contabo — Sub-projeto 2: Auth self-hosted (GoTrue)

Data: 2026-08-05
Status: aprovado em conversa

## Contexto

Sub-projeto 1 (banco self-hosted `kpi_transmonseg`, Postgres+PostgREST próprios no Contabo) está completo e revisado. Este sub-projeto sobe um GoTrue próprio pro KPI, substituindo o Supabase Auth — mesmo padrão já provado no Monitoramento em julho (`docs/plans/2026-07-25-migracao-contabo.md`, Tasks 8/9 daquele repo, 8 usuários migrados com sucesso, senha bcrypt portável direto, sem reset).

Estratégia geral inalterada: roda em paralelo, zero mudança no app de produção atual (Vercel). Auth novo fica pronto e testado, mas nada aponta produção pra ele até o sub-projeto 4.

## Escopo

**Dentro:**
- GoTrue standalone no Contabo, processo/porta/config/role de banco **totalmente dedicados ao KPI** — não reusa nem compartilha nada do GoTrue do Monitoramento (que já roda na porta 9999, banco `transmonseg`).
- Schema `auth` criado em `kpi_transmonseg`, populado pelas próprias migrations internas do GoTrue na primeira subida.
- Migração dos 11 usuários reais (`id`, `email`, `encrypted_password` bcrypt, `email_confirmed_at`, `created_at`, `raw_user_meta_data`) do Supabase Auth de origem pro `auth.users` novo — mesmo UUID, mesmo hash de senha (preserva as FKs que `perfis`/`convites` já têm pro `user_id`, e ninguém precisa resetar senha).
- `GOTRUE_DISABLE_SIGNUP=true` (mesma decisão já em vigor no Monitoramento e implícita no fluxo atual do KPI — cadastro só via convite, tabela `convites` já migrada no sub-projeto 1).
- Restaurar as 13 FKs pra `auth.users(id)` que o sub-projeto 1 não pôde criar (schema `auth` não existia ainda — achado da revisão final do sub-projeto 1).
- Criar o role `authenticated` (vazio, sem login — só existe pra bater com a origem) e recriar as 31 policies de RLS que o referenciam (também não migraram no sub-projeto 1 pelo mesmo motivo).
- Configurar `jwt-secret` no PostgREST do KPI (`/etc/postgrest/kpi.conf`, porta 3002) — pendência deixada explicitamente em aberto no sub-projeto 1 ("sem jwt-secret ainda").
- Teste real de login (HTTP `POST /token?grant_type=password` contra o GoTrue novo) com um usuário migrado de verdade, confirmando JWT válido.

**Fora (sub-projetos seguintes):**
- Storage de arquivos (sub-projeto 3).
- Mudança de código do app, deploy, domínio, corte de produção (sub-projeto 4).

## Arquitetura

```
Supabase cloud (origem, INTOCADO)              Contabo VPS (mesmo host do Monitoramento)
  auth.users (11 linhas)     --extrai-->          GoTrue novo (porta 9998, systemd gotrue-kpi)
                                                     └─ auth.users em kpi_transmonseg
                                                          (schema criado pelas migrations do próprio GoTrue)
                                                     PostgREST do KPI (porta 3002) passa a
                                                     validar JWT real via jwt-secret do GoTrue novo
```

GoTrue do Monitoramento (porta 9999, banco `transmonseg`) — intocado, nenhuma sobreposição de processo/porta/banco/role.

## Decisões técnicas (herdadas do precedente do Monitoramento, não reinventadas)

- **Binário**: `/usr/local/bin/gotrue` já existe no Contabo (instalado pro Monitoramento) — reusa o MESMO binário (mesma versão, GoTrue v2.193.1), só um `EnvironmentFile`/systemd unit novo. Não precisa baixar de novo.
- **JWT secret**: novo, dedicado (`openssl rand -base64 32`) — não reusa o do Monitoramento. Efeito colateral aceito e documentado: quando isso for pra produção (sub-projeto 4), sessões antigas do Supabase Auth ficam inválidas, usuários logam de novo uma vez — mesmo trade-off já aceito e documentado no Monitoramento.
- **Migração de senha**: bcrypt é portável entre Supabase Auth e GoTrue standalone (Supabase Auth É o GoTrue, mesmo formato de hash) — confirmado empiricamente no Monitoramento, sem re-hash nem reset.
- **RLS/`authenticated`**: criar o role e as policies, mesmo sabendo (achado da spec do sub-projeto 1) que 37/38 rotas do KPI usam service role e ignoram RLS — é defesa em profundidade + evita erro de "role does not exist" espalhado, custo baixo de replicar.

## Riscos e mitigação

- **Coluna de `auth.users` do GoTrue novo divergir da extraída do Supabase** → o plano manda comparar `\d auth.users` do banco novo contra as colunas extraídas ANTES de escrever o INSERT (mesmo passo que o Monitoramento já precisou fazer).
- **Zero risco pro Monitoramento**: porta/processo/banco/role/JWT secret inteiramente separados, nenhum comando deste sub-projeto toca `transmonseg`/GoTrue 9999.
- **Zero risco pra produção atual do KPI (Vercel)**: nada aponta pro GoTrue novo até o sub-projeto 4.
