# Convites sem expiração + geração de acessos por rede

## Contexto

O dashboard já tem um sistema de convite (`convites` → `/convite/[token]` →
cria login em `perfis`) restrito por rede (`redes[]`) e mês (`meses[]`). Hoje
todo convite nasce com `expira_em = now() + 7 dias`. O usuário quer gerar
acessos permanentes: 1 login gerente (todas as redes) e logins visualizador
(um por rede + um com todas as redes), sem esses links expirarem.

Produção real do sistema é o Contabo self-hosted (`kpi.transmonseg.com.br`) —
Vercel/Supabase cloud foram descontinuados (ver memória do projeto, corrigida
2026-08-16).

## Parte A — convites nunca expiram (mudança de código, TEMP + definitivo)

- Migration: `alter table convites alter column expira_em drop not null;`
  `alter table convites alter column expira_em drop default;`. Convites
  existentes mantêm o `expira_em` que já tinham (não é retroativo).
- `criarConvite` (`src/app/painel/usuarios/actions.ts`) passa a inserir sem
  `expira_em` (coluna sem default agora = `null` = nunca expira).
- 3 pontos de checagem de expiração passam a tratar `null` como "nunca
  expirado":
  - `src/app/convite/[token]/page.tsx` (`expirado`)
  - `src/app/convite/[token]/actions.ts` (`resgatar`)
  - `src/app/painel/usuarios/page.tsx` (filtro de convites pendentes)
- Aplicar a mesma migration + as mesmas mudanças nos dois repos (KPI TEMP e
  KPI transmonseg definitivo), mantendo o padrão de sincronia do projeto.

Fora de escopo: não mexe em `kpi_manual_links_publicos`/`kpi-publico` (sistema
separado, do KPI Manual, não tem relação com este pedido).

## Parte B — geração dos acessos (execução única, direto no Contabo)

Depois da Parte A no ar em produção, gerar via `criarConvite`/inserção direta
na tabela `convites` do banco `kpi_transmonseg` (Contabo):

| Papel | Redes | Meses | Quantidade |
|---|---|---|---|
| gerente | todas as 18 redes | todos os meses conhecidos | 1 |
| visualizador | 1 rede específica | todos os meses conhecidos | 18 (uma por rede) |
| visualizador | todas as 18 redes | todos os meses conhecidos | 1 |

- `criado_por`: `joaquimsallescp1110@gmail.com` (admin confirmado em
  produção).
- Todos sem `expira_em` (nunca expiram, graças à Parte A).
- Link final: `https://kpi.transmonseg.com.br/convite/<token>`.
- Saída: lista dos 20 links, rotulada por rede/papel, entregue ao usuário.

## Verificação

- Testes automatizados (se existirem para essas actions) continuam passando.
- Teste manual: abrir um link de convite recém-criado, confirmar que não
  mostra "expirado"/"convite indisponível".
- Confirmar no Postgres do Contabo (`kpi_transmonseg.convites`) que as 20
  linhas foram criadas com `expira_em is null`.

## Não-objetivos

- Não altera a granularidade de acesso para nível de loja individual (fica
  por rede, como já é hoje).
- Não constrói UI nova para geração em lote — a Parte B é uma execução
  pontual usando a infra existente (form ou inserção direta via service
  role), não um botão "gerar 18 de uma vez" na tela de Usuários.
- Não mexe em `/kpi-publico` (KPI Manual).
