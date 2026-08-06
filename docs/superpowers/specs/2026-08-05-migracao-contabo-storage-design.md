# Migração KPI Transmonseg pro Contabo — Sub-projeto 3: Storage self-hosted

Data: 2026-08-05
Status: aprovado em conversa

## Contexto

Sub-projeto 1 (banco self-hosted `kpi_transmonseg`, Postgres+PostgREST
próprios no Contabo) e sub-projeto 2 (auth self-hosted, GoTrue próprio,
11 usuários migrados) estão completos e revisados. Este sub-projeto troca
o Supabase Storage por um Storage self-hosted no mesmo Contabo.

O plano original (spec do sub-projeto 1) previa "storage em disco (troca
Supabase Storage por filesystem no Contabo)" — uma implementação caseira.
Investigação feita durante este brainstorm mudou essa decisão (ver
"Descoberta" abaixo): a implementação caseira quebraria a disciplina de
"zero mudança de código do app até o sub-projeto 4" que os dois
sub-projetos anteriores mantiveram (PostgREST fala o protocolo REST
idêntico ao do Supabase; GoTrue É o mesmo software do Supabase Auth — os
dois permitiram trocar o backend sem tocar uma linha do app). Este spec
usa em vez disso o Storage-API oficial do Supabase (open source, mesmo
software que roda a nuvem deles), que preserva essa mesma propriedade.

Estratégia geral inalterada: roda em paralelo, zero mudança no app de
produção atual (Vercel). Nada aponta produção pro sistema novo até o
sub-projeto 4.

## Descoberta feita durante o brainstorm (não assumida — checada no código e no banco)

- **Monitoramento nunca usou Supabase Storage** — não existe precedente
  já rodando no Contabo pra reaproveitar (diferente do binário do GoTrue,
  que já estava instalado). Este sub-projeto sobe o serviço do zero.
- **5 buckets ativos**, confirmados por grep nos dois repos (`KPI TEMP` e
  `KPI transmonseg`), 100% acesso server-side via service-role key (nenhum
  `getPublicUrl` ou client-side direto):
  - `escalas-raw` / `unitrac-raw` — arquivos brutos (PDF/xlsx) por data.
    Upload hoje é feito por URL assinada direto do browser pro Supabase
    Storage (`createSignedUploadUrl`, 3 rotas de presign) — padrão que
    existe provavelmente por causa do limite de payload/timeout de função
    serverless do Vercel. Sem Vercel, esse limite deixa de existir, mas
    a troca do fluxo de upload fica pro sub-projeto 4 (mudança de código
    do app), não bloqueia este sub-projeto.
  - `kpi-outputs`, `kpi-api-dash`, `nutrimax-outputs` — cache de geração
    (JSON), só o servidor lê/escreve.
- **2 buckets órfãos, confirmados mortos** (grep nos dois repos, zero
  referência): `kpi-manual-raw` (322 arquivos, 40MB — superado pelo commit
  `1d696fc feat(dashboard): baixar KPI de volta sem guardar arquivo bruto`)
  e `kpis-gerados` (31 arquivos, 297KB — de um fluxo antigo do app
  Electron). Origem não é tocada por este sub-projeto, então nada se perde
  não migrando — mesmo padrão das tabelas `lojas_bkp_*` já encontradas na
  revisão do achado de RLS da origem.
- **Volume real** (medido via `storage.objects` na origem):
  `escalas-raw` 486 arquivos/1419MB, `kpi-outputs` 306/127MB, `unitrac-raw`
  43/76MB, `nutrimax-outputs` 35/4.9MB, `kpi-api-dash` 58/3.5MB — total
  ativo ≈1.63GB, trivial pra disco local do Contabo.
- **Porta livre confirmada** (via `ss -tlnp` no Contabo): `5000` (padrão
  do Storage-API), sem conflito com PostgREST (3001/3002), GoTrue
  (9998/9999), Postgres (5432), Caddy (80/443/8443/2019) ou os apps Next
  do Monitoramento (3000/3010).

## Escopo

**Dentro:**
- Storage-API oficial do Supabase (`supabase/storage`, open source),
  processo standalone dedicado no Contabo, porta `127.0.0.1:5000`
  (loopback — mesmo padrão de PostgREST/GoTrue do KPI, nada público até
  o sub-projeto 4), systemd `storage-api-kpi.service`.
- Backend de arquivo local (`STORAGE_BACKEND=file`), sem S3/MinIO — disco
  próprio do Contabo (ex: `/srv/kpi-storage/`).
- Schema `storage` criado em `kpi_transmonseg` pelas próprias migrations
  internas do Storage-API (mesmo padrão do schema `auth` do GoTrue no
  sub-projeto 2) — role dedicado `storage_service_kpi` (login), separado
  de `app_service_kpi`/`gotrue_service_kpi`.
- Reaproveita o `GOTRUE_JWT_SECRET` já configurado no sub-projeto 2 —
  tokens emitidos pelo GoTrue do KPI validam direto no Storage-API novo,
  sem segredo novo pra gerenciar.
- Criação dos 5 buckets ativos no Storage-API novo, com as mesmas flags
  de público/privado da origem (todos privados hoje).
- Migração de TODO arquivo dos 5 buckets ativos — feita via a própria API
  HTTP do Storage-API novo (upload real), não escrita direta na tabela
  interna `storage.objects` — o app referencia arquivo por *path*
  (string), nunca por ID interno, então subir pela API real é mais seguro
  que simular metadado à mão (evita o tipo de divergência de schema que
  apareceu no sub-projeto 1 com `extensions.uuid_generate_v4()`).
- Teste real HTTP pós-migração: download de cada arquivo migrado
  comparado byte-a-byte (hash) contra a origem; upload de teste; signed
  upload URL de teste; remoção de teste — mesmo rigor usado nos dois
  sub-projetos anteriores (nada de "deveria funcionar").
- Zero risco pro Monitoramento e zero risco pra produção atual do KPI
  (Vercel) — mesma garantia dos sub-projetos 1 e 2.

**Fora (sub-projeto 4):**
- Mudança de código do app — as ~20 chamadas a `.storage.*` continuam
  apontando pro Supabase até o corte de produção. Isso inclui decidir se
  simplifica o fluxo de upload de `escalas-raw`/`unitrac-raw` (tirar a URL
  assinada direto do browser, já que o limite do Vercel deixa de existir)
  — decisão adiada de propósito, não é infra.
- `kpi-manual-raw` e `kpis-gerados` — não migram (confirmado morto, ver
  acima). Se algum dia precisar recuperar, os arquivos continuam intactos
  na origem até o projeto Supabase ser desligado.
- Domínio, deploy, corte de produção.

## Arquitetura

```
Supabase cloud (origem, INTOCADO)              Contabo VPS (mesmo host do Monitoramento/demais KPI)
  Storage (5 buckets ativos)  --extrai-->         Storage-API novo (porta 5000, systemd storage-api-kpi)
  via API HTTP (service key)                        ├─ schema storage em kpi_transmonseg
                                                      │   (criado pelas migrations do próprio Storage-API)
                                                      ├─ arquivos em /srv/kpi-storage/ (disco local)
                                                      └─ valida JWT com o MESMO secret do GoTrue do KPI
                                                          (sub-projeto 2) — sem segredo novo
```

GoTrue/PostgREST do Monitoramento (portas 9999/3001, banco `transmonseg`)
e GoTrue/PostgREST do KPI (portas 9998/3002, banco `kpi_transmonseg`) —
intocados, nenhuma sobreposição de processo/porta/banco/role.

## Decisões técnicas

- **Por que Storage-API oficial, não implementação caseira**: preserva a
  mesma propriedade que PostgREST e GoTrue já deram nos sub-projetos
  anteriores — o app continua chamando `.storage.from(bucket).download()/
  upload()/createSignedUploadUrl()` sem mudar nada até o sub-projeto 4.
  Um módulo caseiro exigiria reescrever os ~20 pontos de chamada AGORA,
  misturando mudança de código de app dentro de um sub-projeto que devia
  ser só infra.
- **Backend de arquivo, não S3/MinIO**: volume real é ~1.63GB, disco local
  do Contabo resolve sem depender de mais nenhum serviço externo nem de
  mais um processo rodando (MinIO). Menos peça = menos manutenção, mesmo
  princípio já aplicado ao não reinstalar `pg_cron` no sub-projeto 1.
- **Migração via API HTTP, não INSERT direto na tabela interna**: ao
  contrário da migração de usuários (sub-projeto 2, onde o UUID e o hash
  bcrypt PRECISAVAM ser preservados exatamente pra não quebrar FKs), aqui
  o app só referencia arquivo por path — o Storage-API pode gerar
  qualquer ID interno que quiser, sem consequência. Upload real pela API
  é estritamente mais seguro que simular linhas de metadado à mão.
- **JWT secret reaproveitado do sub-projeto 2**: mesmo princípio de "não
  reinventar segredo novo por serviço" já usado — Storage-API só precisa
  validar o mesmo token que PostgREST já valida.

## Riscos e mitigação

- **Arquivo corrompido ou incompleto na migração** → comparação de hash
  (ex: SHA-256) entre arquivo na origem e arquivo migrado, pros 5 buckets
  inteiros, não amostragem.
- **Storage-API não sobe ou não aceita a config de auth** → mesmo processo
  de validação incremental usado no GoTrue (subir, testar isolado com
  `curl` local, só depois seguir pra migração de dado).
- **Zero risco pro Monitoramento**: porta/processo/banco/role
  inteiramente separados, nenhum comando deste sub-projeto toca
  `transmonseg`/GoTrue 9999/PostgREST 3001.
- **Zero risco pra produção atual do KPI (Vercel)**: nada aponta pro
  Storage-API novo até o sub-projeto 4; leitura da origem é só leitura
  (download dos arquivos pra migrar), nunca escrita/delete.
