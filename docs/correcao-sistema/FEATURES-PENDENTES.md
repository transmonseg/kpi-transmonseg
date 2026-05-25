# Features pendentes (UI + matcher)

## 1. Tela de revisão pré-KPI

**Problema**: hoje o sistema processa escala + Unitrac e gera o KPI direto. A pessoa não tem oportunidade de ver O QUE casou e O QUE NÃO casou antes de bater o documento final. Quando o KPI sai com erros, é tarde demais — já passou.

**Solução proposta**: nova tela "Revisão antes de gerar KPI". Layout:

```
┌─────────────────────────────────────────────────────────────┐
│ Revisão Dia 18/05/2026                                      │
├─────────────────────────────────────────────────────────────┤
│ ZONA SUL                       │ PRINCESA                   │
│ ✓ 24 placas casaram            │ ✓ 22 placas casaram        │
│ ⚠ 3 parciais (revisar)         │ ⚠ 1 parcial (revisar)      │
│ ⊙ 6 sem rastreador             │ ⊙ 2 sem rastreador         │
│ [ver detalhes]                 │ [ver detalhes]             │
├────────────────────────────────┼────────────────────────────┤
│ PREZUNIC                       │ SENDAS                     │
│ ✓ 28 placas casaram            │ ✓ 9 placas casaram         │
│ ⚠ 5 parciais (revisar)         │ ⚠ 2 parciais (revisar)     │
│ ⊙ 4 sem rastreador             │ ⊙ 1 sem rastreador         │
│ [ver detalhes]                 │ [ver detalhes]             │
└────────────────────────────────┴────────────────────────────┘

[Cancelar]                     [Gerar KPI →]
```

Ao clicar em "ver detalhes" da rede, abre lista:

```
ZONA SUL — detalhes
─────────────────────────────────
✓ AFY7J99 WANDERLEY (Loja 08, 42, 36) — match 4/4
✓ AKZ2594 NILTON (Loja 19) — match 1/1
⚠ CYB3B90 EVERTON (Loja 47, 31, 10) — match 1/3 ← REVISAR
   - "Zona Sul Loja 31" → 9039105 ✓
   - "Zona Sul Loja 47" → SEM PARADA ✗
   - "Zona Sul Loja 10" → SEM PARADA ✗
⊙ KOP4978 MILTON (Loja 29, 28) — SEM RASTREADOR
   - placa só BASE BENASSI o dia todo
   - tia preenche manual ou deixa em branco
```

Critérios visuais:
- **Verde ✓**: tudo bateu, pode gerar
- **Amarelo ⚠**: parcial, alguma rota faltou — pessoa decide se gera assim ou ajusta cadastro
- **Cinza ⊙**: sem rastreador (escala existe, Unitrac sem paradas LOJA) — KPI sai sem horários

Botão "Ignorar e seguir mesmo assim" pra cada caso parcial.

**Endpoint**: criar `/api/kpi/preview?data=...&redes=...` retornando JSON com mesmo formato do `analise-match-dia-N.md`.

---

## 2. Match por nome em rotas gigantes (Armazém do Grão)

**Problema**: lojas ARMAZEM DO GRAO (BOA VISTA, POSSE, 16 DE MARÇO, MATRIZ) caem no mesmo geofence Unitrac REGINA (5353012/14/16/17 — rota gigante 50km). A escala diz "ARMAZEM DO GRAO BOA VISTA" mas o Unitrac registra parada como "REGINA BARRA DO IMBUY".

**Match por nome falha** porque:
- Escala tokens: {BOA, VISTA} (ARMAZEM e GRAO são REDES_TOKEN, filtrados)
- Unitrac tokens: {REGINA, BARRA, IMBUY}
- 0 tokens em comum → matchScore = Infinity

**No KPI manual a Tia consegue** porque ela SABE que REGINA = ARMAZEM e atribui em ordem cronológica.

**Solução**: implementar o "T8 N:N fallback" especificamente para ARMAZEM_GRAO:
- Se placa tem N linhas ARMAZEM_GRAO E o Unitrac tem ≥ N paradas em geofences REGINA (5353xxx),
- Atribuir em ordem cronológica: 1ª parada → 1ª linha da escala, 2ª → 2ª, etc.

Alternativa mais simples: setar `codigo_unitrac` em todas as 4 lojas ARMAZEM físicas como `5353012,5353014,5353016,5353017` (aliases). Aí codCasa funciona pra qualquer das 4.

---

## 3. Lojas faltando no cadastro (FALHA_MATCH)

Detectadas durante análise placa-por-placa dos 5 dias:

- **Sam's - Barra (Ayrton Senna)** (SAMS_CLUB) — aparece 5 dias na escala, sem cadastro
- **Prezunic SPID - Jacarepagua / Parque das Rosas / Freguesia** (PREZUNIC) — 3 lojas SPID novas
- **Prezunic - Botafogo / Serra Azul** (PREZUNIC) — divergência de nome
- **Americanas** (SENDAS) — investigar (Americanas não é loja Sendas? Talvez SAMS?)
- **Santo Agostinho** (SENDAS) — 23080000 já está como rota gigante; revisar
- **VILA_NOVA, AGULHAS_NEGRAS** (EMANUEL) — lojas EMANUEL faltando

Ação: pesquisar lat/lng de cada e cadastrar.

---

## 4. Substituições não anotadas (IGNORAR — 175 casos)

Placas no Unitrac sem escala — pode ser substituição não importada.

Investigar tabela `alteracoes` e ver se aparece substituição correspondente.
