# Escopo por empresa + reorganização de navegação — Design

## Contexto

Hoje o sistema tem duas dimensões de escopo de acesso para logins não-admin,
ambas em `perfis`/`convites` como colunas `text[]`: `redes` (grupos de loja
da Benassi) e `meses` (meses de KPI liberados). Não existe nenhum conceito de
"empresa" — o sistema atende só a Benassi de fato, com Nutry Max tendo uma
única tela nova (`/painel/nutrimax/gerar`) sem check de permissão nenhum, e
Portefrio sem nenhuma tela (só investigação de API concluída, registrada no
cofre de credenciais).

O pedido do usuário: um seletor de empresa (Benassi / Nutry Max / Portefrio)
no topo do painel, convites que escolhem a que empresa(s) aquele login
pertence — podendo ser mais de uma —, e a navegação lateral reorganizada de
grupo plano para Empresa → sub-abas (Gerar KPI, Histórico, Lojas, etc). Para
admin isso é puramente cosmético (eles já veem tudo). Para logins convidados
(gerente/visualizador) precisa ser enforcement real: um login preso a
Nutrimax não pode ver nada de Benassi, e vice-versa; dentro de Benassi, o
sub-escopo por `redes` continua existindo como já existe hoje.

"Cozinha" está fora de qualquer mudança aqui — fica exatamente como está.

## Decisão de escopo desta feature

Esta feature entrega o **encanamento de controle de acesso** (coluna nova,
UI de convite, função de checagem, reorganização visual do nav) e o aplica
às telas que **já existem** hoje (Benassi completo, Nutry Max "Gerar KPI").
Ela não constrói telas novas de Nutry Max (Histórico, Lojas, Dashboard) nem
nada de Portefrio — isso é trabalho futuro, fora deste escopo. Portefrio
entra como valor de empresa atribuível a um login (para não precisar mexer
de novo no modelo de dados quando a tela existir), mas não aparece em
nenhuma navegação ainda, por não ter nenhuma página.

## Modelo de dados

Nova coluna `empresas text[] NOT NULL DEFAULT '{}'` em `perfis` e em
`convites`, no mesmo padrão das colunas `redes`/`meses` já existentes
(migration `20260713000000_perfis_convites_rbac_dashboard.sql`). Backfill:
todo perfil existente recebe `empresas = '{"benassi"}'` — hoje 100% dos
logins restritos são de Benassi.

Novo módulo `src/lib/kpi/empresas.ts`, espelhando `src/lib/kpi/redes.ts`:

```ts
export const EMPRESAS = ['benassi', 'nutrimax', 'portefrio'] as const

export const EMPRESA_LABEL: Record<string, string> = {
  benassi: 'Benassi',
  nutrimax: 'Nutry Max',
  portefrio: 'Portefrio',
}
```

`redes` continua com o mesmo sentido de hoje: sub-escopo *dentro* de
Benassi. Não muda de forma nem de nome. `meses` continua sendo um conceito
específico de Benassi (é a única empresa com histórico mensal de KPI hoje)
— não se estende a Nutrimax/Portefrio nesta feature.

## `src/lib/perfil.ts`

O tipo `Perfil` ganha o campo `empresas: string[]`. `getPerfil` passa a ler
e devolver essa coluna (mesmo padrão de `redes`/`meses`). Nova função:

```ts
export function empresaValida(e: string): e is (typeof EMPRESAS)[number] {
  return (EMPRESAS as readonly string[]).includes(e)
}

export function empresaLiberada(perfil: Perfil, empresa: string): boolean {
  return perfil.papel === 'admin' || perfil.empresas.includes(empresa)
}
```

Mesma filosofia de `redeValida`/`mesLiberado`: admin sempre passa, o resto
depende da lista guardada no perfil.

## Enforcement real (o ponto crítico)

Hoje `POST /api/kpi/nutrimax/gerar` e `GET /painel/nutrimax/gerar` só
checam `supabase.auth.getUser()` — qualquer login autenticado, mesmo um
visualizador Benassi, já consegue gerar um KPI da Nutry Max hoje. Isso é
uma lacuna de autorização existente, não introduzida por esta feature, mas
que esta feature precisa fechar como parte do trabalho:

- `src/app/api/kpi/nutrimax/gerar/route.ts`: depois de obter o `user`,
  chamar `getPerfil(user.id)` e checar `empresaLiberada(perfil, 'nutrimax')`
  — se falso, responder 403.
- `src/app/painel/nutrimax/gerar/page.tsx`: mesma checagem no server
  component, redirecionando para `/painel` se não liberado (mesmo padrão
  de redirect que `usuarios/page.tsx` já usa pra `papel === 'visualizador'`).
- `src/app/painel/kpi/*` (páginas e rotas de Benassi: `simples`,
  `visualizar`, `lojas`, `historico`, `dashboard/beta`): ganham a mesma
  checagem para `'benassi'`. Hoje essas páginas já checam `papel` e/ou
  `redes` em alguns casos (ex.: `kpi/visualizar` já filtra por `redes`) —
  a checagem de empresa se soma a essa, não substitui o filtro de `redes`
  que já existe.

## Convite (`criarConvite` + UI)

Novo componente `src/app/painel/usuarios/empresas-checkboxes.tsx`, no
mesmo padrão de `redes-checkboxes.tsx` (checkboxes em pill, multi-seleção,
sem depender de JS além do próprio componente client). Em
`usuarios/page.tsx`, o formulário de `criarConvite` passa a exigir escolher
ao menos uma empresa, antes dos campos de redes/meses. Client-side, os
blocos `RedesCheckboxes`/`MesesCheckboxes` só aparecem quando `benassi`
está marcado entre as empresas escolhidas (esses dois campos não fazem
sentido para Nutrimax/Portefrio).

`criarConvite` (`usuarios/actions.ts`) grava `empresas` no insert de
`convites`, com a mesma validação de "não pode outorgar mais empresa do
que o próprio criador tem" que já existe para `redes` em gerentes (um
gerente preso a `empresas=['benassi']` não pode convidar alguém para
`nutrimax`). `resgatar` (`convite/[token]/actions.ts`) copia `empresas` do
convite para a linha nova em `perfis`, igual já faz com `redes`/`meses`.

A tela de convite (`convite/[token]/page.tsx`) mostra as empresas do
convite no resumo, ao lado de redes/meses (`EMPRESA_LABEL` no lugar de
`REDE_LABEL`).

## Navegação (`nav.tsx`)

Para **admin**: sem gate nenhum, é reorganização visual. O grupo hoje
chamado genericamente `'KPI'` (que é na prática só Benassi) passa a se
chamar `'Benassi'` explicitamente. `'Nutry Max'` continua como grupo
próprio, do jeito que já é. Ambos passam a ficar visualmente agrupados sob
um separador `"Empresas"` no menu, antes de `'Cozinha'` (que fica
intocado, fora desse agrupamento). Portefrio não entra no nav — não tem
página nenhuma ainda.

Para **não-admin**: a função `PainelNav` monta a lista olhando
`perfil.empresas` e (dentro de Benassi) `perfil.redes` — mas como hoje a
ÚNICA tela que um não-admin acessa é o Dashboard (`kpi/visualizar`, já
gated por `redes`), na prática o comportamento visível não muda ainda: o
link de Dashboard só aparece se `empresaLiberada(perfil, 'benassi')`. Isso
deixa a estrutura pronta para quando existirem telas de Nutrimax/Portefrio
para não-admin — ponto em que só se adiciona a entrada correspondente,
sem mexer de novo no mecanismo de gate.

## Seletor de empresa no topo do painel

Um controle (tabs ou dropdown) no header do painel, mostrando Benassi e
Nutry Max (Portefrio omitido, sem página). Clicar leva para a raiz daquela
empresa (`/painel/kpi/simples` para Benassi, `/painel/nutrimax/gerar` para
Nutry Max). Para admin aparecem as duas opções sempre. Para não-admin,
só aparecem as empresas em `perfil.empresas`; um login com uma única
empresa não precisa nem ver o seletor (não há nada para trocar).

## Testes

- `perfil.test.ts` (ou arquivo equivalente, se existir): casos novos para
  `empresaLiberada`/`empresaValida` espelhando os já existentes de
  `redeValida`/`mesLiberado`.
- Teste do fluxo de convite: gerente preso a uma empresa não consegue
  criar convite para outra.
- Teste manual (não automatizado, é rota autenticada de UI): confirmar que
  um visualizador sem `nutrimax` em `empresas` recebe 403/redirect ao
  tentar acessar `/api/kpi/nutrimax/gerar` e `/painel/nutrimax/gerar`.

## Fora de escopo (explicitamente)

- Construir telas novas de Nutry Max (Histórico, Lojas, Dashboard) ou
  qualquer coisa de Portefrio.
- Mexer em `Cozinha` de qualquer forma.
- Deploy/aplicação de migration em produção — fica como gate humano
  separado, igual todo o resto do sistema.
