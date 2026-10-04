# Redesign "estilo Apple" do KPI Transmonseg — design

## Pedido (usuário, 04/10/2026)
- Redesign completo no estilo Apple, no nível do Norte Vendas / Norte Estoque
  (specs `ntb vendas|ntb estoque/docs/superpowers/specs/2026-09-26-redesign-estilo-apple-design.md`).
- Estrutura do menu continua: **Dashboard** primeiro; no topo do dashboard
  escolhe-se QUAL dashboard (Nutry Max, Rio Quality, Portefrio) e ele aparece
  embaixo. **Usuários** continua (criar usuários por rede/empresa, escolher tipo
  de login como hoje), mais organizado. **Empresas**: Benassi com cadeado
  (não faz mais parte — fica no código, travada), Nutry Max, Portefrio,
  Rio Quality e Cozinha iguais.
- Dashboard do Nutry Max focado em performance: taxa, KM, tempo de operação,
  tempo médio por entrega, por placa e por dia; motivos de pendência.
- Sistema lento ao clicar.
- Melhorar tour e animações.

## Evidência
- Prints "antes": `~/ClaudeGerado/kpi-redesign/antes/` (14 telas desktop + mobile).
- Referência real apple.com (04/10): `~/ClaudeGerado/kpi-redesign/ref-apple/`
  — SF Pro Text 17px/-0.374px, títulos SF Pro Display 600 (64–80px, -0.576 a
  -1.2px), texto #1d1d1f, secundário #6e6e73/#86868b, links azuis com chevron,
  superfícies brancas e #f5f5f7, seleção por cartões/listas simples.

## Lentidão (medido)
- Servidor na França; do Brasil ~200 ms de rede por ida e volta.
- Causa do lado do servidor: GoTrue do KPI abria conexão nova com o Postgres a
  cada `/user` (200–600 ms, 2× por clique). Corrigido com pool
  (`/etc/gotrue/kpi-env`: MAX_POOL 10, MAX_IDLE 5, IDLE 10m): `/user` 4–22 ms,
  telas 0,6–1,5 s → 0,2–0,37 s (medido no servidor).
- Também: Supabase pelo atalho interno 127.0.0.1:8020 e login/perfil 1× por
  requisição (commit 96eba89).

## Linguagem visual
Igual ao Vendas/Estoque, com a marca **azul-marinho Transmonseg #1F3864**
(mesma cor das planilhas):
- Fonte do sistema (`-apple-system, "SF Pro Text", "Segoe UI Variable Text",
  system-ui`), números `tabular-nums`; mono só em código.
- Claro: fundo `#f5f5f7`, superfície `#fff`, superfície 2 `#f2f2f7`, texto
  `#1d1d1f`, secundário `#6e6e73`, separador `rgba(60,60,67,.14)`; ok
  `#248a3d`, aviso `#b25000`, erro `#d70015`, info `#0066cc`.
- Escuro: `#000` / `#1c1c1e` / `#2c2c2e`, texto `#f5f5f7`, secundário `#98989d`.
- Marca: `--brand #1F3864` (preenchimento com texto branco), no escuro texto de
  acento `#8fb0e0`. Menu lateral em gradiente marinho, texto branco, item ativo
  em pílula branca translúcida.
- Cartões sem borda com sombra leve; raios 8/12/18; botões/chips em pílula.
- Rótulos em frase normal (sem CAIXA ALTA), títulos 28–30px -0.02em, status =
  ponto + texto, SegmentedControl para visões exclusivas.
- Movimento: `motion/react`, molas sem quique, press 0.97, pílula do menu e do
  segmentado deslizando, count-up nos números, respeita reduced-motion.

## Dashboard
- `/painel?cliente=nutrimax|rioquality|portefrio` — segmentado no topo.
- Dados: cada geração passa a gravar `kpi_romaneio_geracoes.resumo` (jsonb)
  extraído da PRÓPRIA planilha entregue (mesma fonte que o cliente vê):
  taxa, NFs (entregues/pendentes/fora da conta), por carga/placa (NFs, km,
  saída/chegada CD, tempo de operação, tempo médio por entrega) e pendências
  por motivo. Backfill a partir das planilhas salvas.
- Benassi: tela atual sai do `/painel`; rotas Benassi redirecionam pro painel
  com cadeado no menu.

## Fora de escopo
Regras de KPI, planilhas/PDF gerados, dados.
