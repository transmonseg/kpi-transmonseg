# KPI TRANSMONSEG

Sistema web de geração e gestão de KPI de entregas da TRANSMONSEG. Lê as escalas diárias das redes atendidas, cruza com o relatório de rastreamento Unitrac, gera os XLSX e PDF por rede e mantém histórico auditável de cada geração.

**Produção:** [kpi-transmonseg.vercel.app](https://kpi-transmonseg.vercel.app)

> Sistema desenhado, construído e mantido por **Joaquim Salles** para a operação logística da TRANSMONSEG.

---

## O que o sistema faz

1. **Lê escalas** de cinco redes em formatos heterogêneos (Geral XLSX, PAX, Zona Sul, Armazém do Grão, Guanabara PDF da HLOG)
2. **Lê Unitrac** (XLSX ou PDF) com paradas de cada veículo
3. **Cruza escala × Unitrac** por placa, motorista e janela de tempo; deduplica linhas multi-escala (PAX cobre redes da GERAL sem placa) e detecta anomalias
4. **Gera relatórios** XLSX e PDF por rede, prontos para envio
5. **Persiste e historica** cada geração — cada `kpi_geracao` tem auditoria de quem, quando e com que arquivos
6. **Gerencia alterações** de motorista/placa em lote a partir de texto cru de WhatsApp (parser de linguagem natural com confiança alta/média/baixa)
7. **Permite edição inline** de linhas direto na pré-visualização e re-geração sem re-upload

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Linguagem | TypeScript 5 estrito |
| UI | Tailwind 4 + Phosphor Icons + Geist Mono/Sans |
| Auth/DB/Storage | Supabase (Postgres, RLS, Storage com presigned URLs) |
| Parsers XLSX | ExcelJS + `xlsx` (SheetJS, vendorado em `vendor/`) |
| Parsers PDF | pdf-parse + pdfjs-serverless |
| Geração PDF | pdf-lib |
| Testes | Vitest + happy-dom |
| Deploy | Vercel (auto-deploy de `main`) |
| Integração IA | MCP server local em `mcp/` para Claude Code |

---

## Setup local

1. **Pré-requisitos:** Node 24+, conta Supabase com projeto criado.
2. **Instalar:**
   ```bash
   npm install
   ```
3. **Variáveis de ambiente:** copie `.env.example` para `.env.local` e preencha com as chaves do projeto Supabase.
4. **Migrations:** rodar as migrations em `supabase/migrations/` via Supabase CLI ou painel.
5. **Dev server:**
   ```bash
   npm run dev
   ```
   Acesse [http://localhost:3000](http://localhost:3000).

Outros comandos:

```bash
npm test           # vitest run
npm run test:watch # vitest --watch
npm run lint       # eslint
npm run build      # produção
```

---

## Estrutura do projeto

```
src/
├── app/
│   ├── page.tsx                       # Landing pública
│   ├── login/, cadastro/              # Auth
│   ├── painel/                        # Área autenticada
│   │   ├── page.tsx                   # Dashboard (stats, atalhos)
│   │   ├── kpi/dia/                   # KPI persistente do dia (histórico + edição)
│   │   ├── kpi/simples/               # Geração rápida one-shot (in-memory)
│   │   ├── alteracoes/nova/           # Form V2 de alterações (parser + lote)
│   │   ├── lojas/                     # Registro canônico de lojas
│   │   ├── cozinha/                   # Romaneio da Cozinha Industrial
│   │   ├── revisao/                   # Fila de revisão de anomalias
│   │   └── historico/                 # Auditoria de gerações
│   └── api/
│       ├── kpi/                       # processar, gerar, listar, editar
│       ├── escalas/                   # upload, presign, preview
│       ├── unitrac/                   # upload, presign
│       ├── alteracoes/                # parsear-v2, aplicar-lote
│       ├── lojas/                     # canonical/alias CRUD
│       ├── cozinha/                   # romaneio
│       └── anomalias/                 # revisão
├── lib/
│   ├── parsers/                       # 24 arquivos: escalas, unitrac, alteracoes
│   ├── kpi/                           # matcher, gerador-kpi, gerador-pdf, anomalias
│   ├── supabase/                      # clients browser/server/middleware/service
│   ├── lojas/                         # trigram lookup canonical
│   └── hooks/, theme/, types/, utils/
└── components/
    ├── ui/                            # Button, Input, Card, Badge (DS interno)
    ├── ApplyToSimilarSheet.tsx        # Bottom sheet pra aplicar revisão em lote
    └── FilaRevisao.tsx                # Fila genérica de revisão

mcp/server.ts                          # MCP server local (8 tools p/ Claude Code)
supabase/migrations/                   # 12 migrations versionadas
scripts/                               # Utilitários úteis (seed, comparar, gerar local)
scripts/dev/                           # Debug histórico (não é parte do produto)
docs/                                  # Análises técnicas e relatórios de sessão
```

---

## Fluxos principais

### KPI Simples (one-shot, in-memory)

Rota: `/painel/kpi/simples` → `POST /api/kpi/simples`

1. Upload de escalas (1+ arquivos) via presigned URL
2. Upload do Unitrac via presigned URL
3. Servidor baixa, parseia cada formato, deduplica, cruza, gera XLSX+PDF por rede
4. UI mostra preview editável; cada célula de placa e motorista pode ser corrigida
5. Botão "Re-gerar" reaplica edições sem re-upload

### KPI Persistente (com histórico)

Rota: `/painel/kpi/dia` → `POST /api/kpi/processar` → `POST /api/kpi/gerar`

- Cada `kpi_geracao` é gravada em `kpi_rotas` com `aplicada_por`, `aplicada_em` e arquivos de origem
- Edições de linha persistem em `kpi_rotas`/`escala_linhas`
- Timeline de gerações por dia exposta na UI

### Alterações V2

Rota: `/painel/alteracoes/nova` → `POST /api/alteracoes/parsear-v2` → `POST /api/alteracoes/aplicar-lote`

Cola o texto cru da mensagem do WhatsApp. O parser detecta `sai/entra`, motorista, placa, filial, rede e confiança. Lote aplicado atualiza `escala_linhas` e dispara `/api/kpi/processar` para as redes afetadas.

---

## Parsers de escala suportados

| Parser | Arquivo de origem | Detalhes |
|---|---|---|
| `escala-geral` | XLSX consolidado | Layout multi-rede em colunas |
| `escala-pax` | XLSX PAX | Cobre redes da GERAL sem placa — usado para deduplicação |
| `escala-zona-sul` | XLSX Zona Sul | Layout próprio |
| `escala-armazem-grao` | XLSX Armazém do Grão | Colunas de fornecedor a partir da 13ª |
| `escala-guanabara-pdf` | PDF HLOG | Parseia tokens com posição absoluta |

O detector roda os parsers em ordem e fica com o primeiro que retornar ≥ 3 linhas reconhecidas.

---

## Tabelas Supabase

`escalas_uploads`, `linhas_uploads`, `unitrac_uploads`, `paradas`, `kpi_rotas`, `kpi_geracoes`, `escala_linhas`, `alteracoes`, `lojas`, `lojas_canonical`, `lojas_alias`, `redes`, `cozinha_clientes`, `review_queue`, `analises_ia`, `anomalias`.

Migrations versionadas em `supabase/migrations/` (12 arquivos, prefixadas com timestamp).

---

## MCP Server (`mcp/`)

Servidor local que expõe o pipeline pra Claude Code:

| Tool | O que faz |
|---|---|
| `parse_escala_*` | 5 parsers de escala como tools |
| `parse_unitrac`, `parse_unitrac_pdf` | Parsers Unitrac |
| `load_files` | Insere lote no Supabase |
| `processar_kpi` | Matcher + anomalias |
| `gerar_kpi`, `query_kpi`, `clear_data` | Geração e admin |

Útil para debug de parsing direto da IDE.

---

## Deploy

Auto-deploy via Vercel a cada push em `main`. Variáveis de ambiente configuradas no painel do projeto Vercel `kpi-transmonseg`.

---

## Convenções

- Português em commits, código de domínio, comentários e docs (corretamente acentuado).
- Travessão (`—`) só em texto editorial; nunca em copy de produto.
- Sem `console.log` em código de produção — usar `console.error` apenas para erros reais.
- Commits no padrão `<tipo>(<escopo>): <descrição>` (`feat`, `fix`, `refactor`, `chore`, `docs`).
- Antes de mexer em parser ou matcher, rodar `npm test` localmente.

---

## Créditos

Desenhado e construído por **Joaquim Salles** para a operação logística da TRANSMONSEG.
