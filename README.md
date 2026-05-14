# KPI TRANSMONSEG

Sistema web de gestão de escalas e KPI de entregas da TRANSMONSEG.

## Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (Auth)
- ExcelJS (parsing e geração de XLSX)
- pdf-lib (geração de PDF)

## Setup local

1. **Instalar dependências**

   ```bash
   npm install
   ```

2. **Configurar variáveis de ambiente**

   Copie `.env.example` para `.env.local` e preencha:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<seu-projeto>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxxx
   ```

3. **Rodar dev server**

   ```bash
   npm run dev
   ```

   Acesse http://localhost:3000

## Estrutura

```
src/
├── app/
│   ├── page.tsx              # Home (redireciona conforme auth)
│   ├── login/                # Login
│   ├── cadastro/             # Cadastro
│   ├── painel/               # Área autenticada
│   │   ├── page.tsx          # Dashboard
│   │   └── cozinha/          # Cozinha: upload + processamento
│   └── api/
│       └── cozinha/          # API que parseia e gera os arquivos
├── lib/
│   ├── supabase/             # Clients (browser, server, middleware)
│   └── parsers/              # Lógica de parse XLSX, geração XLSX/PDF
└── middleware.ts             # Proteção de rotas
```

## Módulos

### Cozinha (V1)

Upload da escala da Cozinha Industrial. O sistema extrai rota, motorista e placa de cada bloco lado a lado da aba MODELO e gera XLSX e PDF limpos.

Detalhes técnicos do parser em `src/lib/parsers/cozinha-parser.ts`.

### KPI Benassi (próximo)

Geração automática de KPI a partir da escala e do relatório Unitrac. Em desenvolvimento.

## Deploy

Auto-deploy via Vercel a cada push em `main`. As variáveis de ambiente são configuradas no painel do Vercel.
