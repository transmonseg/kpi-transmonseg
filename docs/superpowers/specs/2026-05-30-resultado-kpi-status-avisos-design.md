# Melhorar o resultado do KPI gerado: status, colunas e avisos de revisão

**Data:** 2026-05-30
**Status:** Aprovado (brainstorming)

## Objetivo

Melhorar a tela de resultado da geração de KPI (`/painel/kpi/simples`) para que cada rota tenha um **status claro**, todas as **colunas operacionais** apareçam, e o sistema **sinalize o que precisa de revisão**. Tudo **só na tela** (o XLSX/PDF oficiais NÃO mudam).

## Contexto do código existente

- Paradas do rastreador são classificadas em `BASE`, `LOJA`, `FORA_BASE`, `FAKE_EXIT` (`src/lib/kpi/matcher.ts`).
- A "base Benassi" é um geofence (lat/lng + raio 1500m), função `isBaseBenassi` em `matcher.ts`.
- O gerador (`src/lib/kpi/gerador-kpi.ts`) já distingue: sem GPS, "rastreado mas ficou na base" (`sem_entrega`), e parou fora da base.
- Há sistema de anomalias (`src/lib/kpi/anomalia.ts`) com regras ANOM-XX.
- A linha do preview (`PreviewLinha` em `src/app/painel/kpi/simples/page.tsx`) já carrega `tem_gps`, `confianca` (HIGH/LOW/UNMATCHED), `anomalias[]` e `algoritmo` — mas a tela só mostra 9 colunas e uns ícones resumidos no cabeçalho.
- O preview é montado no backend em `src/app/api/kpi/simples/route.ts`, que tem acesso ao resultado completo do matcher (paradas classificadas).

## Decisões (do usuário)

1. Veículo com rastreador que ficou só na base → status **"Não foi ao cliente"**.
2. Veículo que parou fora da base num ponto não reconhecido como loja → status **"Fora de base"** E a linha é **marcada pra revisão**.
3. Os status aparecem **só na tela** do resultado; XLSX e PDF ficam como estão.
4. Melhorar a interface com: coluna de Status, painel de avisos de revisão, colunas que faltam, e destaque das linhas a revisar.

## Design

### 1. Derivação de status (backend, função pura testável)

Nova função em `src/lib/kpi/status-rota.ts`:

```
type StatusRota = 'ENTREGUE' | 'SEM_RASTREADOR' | 'NAO_FOI_AO_CLIENTE' | 'FORA_DE_BASE'

derivarStatus(dados) -> { status: StatusRota, revisar: boolean, motivoRevisao: string | null }
```

Regras (avaliadas nesta ordem):
| Status | Condição | revisar |
|---|---|---|
| `SEM_RASTREADOR` | placa na escala, zero parada GPS (`!tem_gps`) | false |
| `NAO_FOI_AO_CLIENTE` | tem GPS, mas todas as paradas relevantes são BASE Benassi (sem LOJA e sem FORA_BASE com loja) | false |
| `FORA_DE_BASE` | parou em `FORA_BASE` sem `loja_id` (ponto não reconhecido) | **true** ("parada fora de base, conferir") |
| `ENTREGUE` | tem GPS e visitou a loja (chegada/saída na LOJA) | false |

A função recebe o que o `route.ts` já tem do matcher (flag de GPS + lista de paradas classificadas da placa/rota). Cobrir cada caso com teste unitário (`status-rota.test.ts`).

### 2. Enriquecer `PreviewLinha` (backend)

`route.ts` adiciona à linha do preview:
- `status: StatusRota`
- `revisar: boolean`, `motivoRevisao: string | null`
- `saida_loja_fmt: string | null` (saída da loja)
- `tempo_operacao_fmt: string | null` (saída base → volta base, via `calcTempoOperacao` que já existe)
- `chegada_base_fmt: string | null` (volta à base)

(Todos derivados do resultado do matcher/gerador, que já calcula esses tempos.)

### 3. Coluna "Status" na tela

Em `RedePreviewSection`/`PreviewRow` (`page.tsx`): nova coluna **Status** com badge colorido:
- Entregue → verde; Sem rastreador → vermelho; Não foi ao cliente → amarelo; Fora de base → laranja.

### 4. Colunas que faltam

Adicionar à tabela (algumas `hidden` em telas pequenas, seguindo o padrão atual): **Saída Loja**, **Tempo de Operação**, **Chegada Base**.

### 5. Painel de "Avisos de revisão"

No topo do resultado (por rede ou consolidado), um painel que conta e lista o que revisar:
- Placa faltando (`placa == null`)
- Baixa confiança / não-casada (`confianca === 'LOW' | 'UNMATCHED'`)
- Anomalias detectadas (`anomalias.length > 0`)
- Fora de base (`revisar === true`)

Cada item clicável faz scroll/realce até a linha correspondente.

### 6. Destaque das linhas a revisar

Linhas com `revisar === true`, sem placa, UNMATCHED ou com anomalia ganham realce sutil (fundo/borda âmbar + ícone de alerta no início da linha).

## Arquivos

- **Criar:** `src/lib/kpi/status-rota.ts` + `src/lib/kpi/status-rota.test.ts`
- **Modificar:** `src/app/api/kpi/simples/route.ts` (enriquecer preview), `src/app/painel/kpi/simples/page.tsx` (tipo `PreviewLinha`, coluna Status, colunas extras, painel de avisos, destaque)

## Restrições

- **Não tocar** no XLSX/PDF gerados (modelo oficial preservado).
- **Não fazer push/deploy pro Vercel** nesta fase — testar localmente (`npm run dev`) primeiro.
- Português correto, sem travessão.

## Testes

- Unitários de `derivarStatus` cobrindo os 4 status + a flag de revisão.
- `tsc`, `build` e a suíte vitest verdes antes de considerar pronto.
