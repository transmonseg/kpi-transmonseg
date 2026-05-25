# Varredura completa de bugs PDF + ARMAZÉM DO GRÃO + Regras universais

**Data:** 2026-05-25 (segunda execução do dia)
**Status:** Autorizado pelo usuário a executar sem aprovação enquanto ele come.

---

## Contexto

5 vídeos da Tia Érica transcritos:
- **17:08:42** (6:33) — Regras principais: saída do CD = última base antes da loja; múltiplas paradas mesma loja = CHD primeira + SL última.
- **17:08:43-1** (2:06) — Estrutura limpa da escala geral (motorista + código + placa).
- **17:08:43-2** (3:04) — ZONA SUL: usa só NÚMERO de filial; horário 10-14h = mesmo dia, 17h = D+1.
- **17:08:43** (54s) — Como gerar o relatório Unitrac (PDF, analítico, todos veículos).
- **17:08:44** (3:34) — KPI Zona Sul usa fórmulas internas PROC-V.

Usuário reclamou: **"ARMAZÉM DO GRÃO está uma merda"**. Pediu varredura completa de bugs, focar em horários, ler todas as páginas do PDF (não só a primeira).

---

## Fases

### FASE 1 — Comparar ARMAZÉM DO GRÃO manual × gerado

**Hipótese inicial:**
- Cadastro REGINA pode ter 4 lojas mapeadas pra mesma geofence agregada
- `REDES_GEOFENCE_AGREGADO` em matcher.ts pode estar com lógica incompleta
- Pode ter problemas com a escala (parser-armazem-grao tem casos especiais)

**Ações:**
1. Comparar `KPI ARMAZEM_GRAO MANUAL.xlsx` aba mais recente × KPI gerado mais recente do dia
2. Categorizar diffs (SC errada, CHD errada, SL errada, placa errada)
3. Pra cada diff: rastrear no PDF cru o que tá lá

**Critério de aceite:**
- DIFFs reais identificados e categorizados
- Pelo menos 1 bug específico do Armazém corrigido (se houver)

---

### FASE 2 — Varredura de paradas perdidas no parser PDF

**Hipótese:**
- Parser pode estar perdendo paradas em páginas específicas (quebras, encoding, etc.)
- Algumas placas podem ter número de paradas no header diferente do que o parser extrai

**Ações:**
1. Pra cada placa no PDF: comparar `qtd_paradas` do header vs `paradas.length` do parser
2. Onde divergir > 1: investigar a placa específica
3. Procurar padrões (sempre na última parada? quebra de página específica?)

**Critério:**
- Lista de placas com paradas perdidas
- Padrões agrupados
- Fix se for padrão identificável

---

### FASE 3 — Verificar regras universais vs código atual

**Re-revisar cada regra dos vídeos:**

1. **Saída do CD = última BASE antes da LOJA**
   - Já implementado em `computeSaidaCdParaParada` ✓ (hack ZONA_SUL removido)
   - Verificar: cobre todos os tipos de "BASE" (BASE BENASSI, FAKE_EXIT em base, etc.)?

2. **Múltiplas paradas mesma loja consecutivas → consolidar**
   - Já implementado em `consolidarParadasMesmoCliente` ✓ (agora também por nome)
   - Verificar: cobre "rua lateral" do vídeo?

3. **Visitas separadas (1ª + 2ª entrega) → manter ambas**
   - Já implementado em `deduplicarPorCodigo` ✓ (gap ≥60min)
   - Verificar: aplica pra todas as redes?

4. **ZONA SUL — número de filial, horário 17h = D+1**
   - Parser ZONA_SUL: já entende número de filial (`zona-sul-base.ts`)
   - Regra de horário 17h = D+1: verificar `escala-zona-sul.ts`

5. **Veículo sem código mas com endereço/coordenada → geo match**
   - Já implementado: geo fallback no matcher (lat/lng → loja por raio)

**Critério:**
- Cada regra checada na codebase
- Fixes onde estiver incompleto

---

### FASE 4 — Bugs gerais do parser PDF

**Bugs já corrigidos esta semana (recap):**
1. Regex coord+letra só MAIÚSCULA
2. ROTA `2018xxx` como LOJA
3. BASE+LOJA concatenadas viravam BASE
4. PDF KPI 3h atrás
5. Vírgula+coord sem espaço
6. CEP virava código loja
7. BASE/FORA via `startsWith` (não substring)
8. Default LOJA → FORA_BASE
9. `extraiLoja` indexOf(' - ') no meio
10. Timezone duplo na tela revisão
11. ANOM-11 timezone
12. `formataHora` local time

**Casos não cobertos (investigar):**
- Quebra de página no MEIO do header de veículo?
- Tokens grudados que não casam nenhuma regex existente?

---

### FASE 5 — Commits atômicos

Cada bug = 1 commit. Push imediato.

---

## Princípios

- **NÃO mexer em coisa que já funciona** sem evidência de bug.
- **Cada fix tem teste de regressão.**
- **NÃO inventar regras** — só as confirmadas pelos vídeos.
- **Documentar achados** em `docs/INTENSIVA/`.

---

## Cronograma

Execução direta enquanto o usuário come. Foco em achar bugs reais, não em refatorar.
