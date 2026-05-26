# Plano: Conserto Zona Sul end-to-end

## Contexto

Dia 19 ZONA SUL gerado vs manual: 22 de 47 lojas batendo qualitativamente. 25 com problemas:
- 9 lojas "sys diz FOI, manual diz NÃO_FOI"
- 4 lojas com CHD/SL deslocado ~40min (01, 09, 43, 45)
- 1 loja off por horas (25 Jd.Botânico)
- 1 sem match (33 Humaitá)
- 6 nome mismatch (Mega Box, Loja 47, EXTRA F.31, Loja 36)

Fontes de verdade disponíveis:
1. **Aba `endereço filiais`** do manual ZS — 48 lojas com endereço completo (rua, número, bairro, CEP)
2. **Manual ZS aba 19** — placa, motorista, SC, CHD, SL por loja (formato sem coluna COD)
3. **Vídeo v43-2 (Tia Érica)** — regras operacionais ZS:
   - Carregamento 10h-14h: caminhão sai no MESMO DIA (saídas ~12h, 15h, 16h)
   - **Carregamento 17h: caminhão sai DIA SEGUINTE, primeiro horário**
   - Escala ZS só lista número da loja (28, 29...) sem nome
4. **Unitrac dia 19** (XLSX + PDF) — GPS por placa
5. **Escala ZS dia 19** — placa, motorista, número da loja
6. **Cadastro Supabase** (lojas onde rede_id=ZONA_SUL) — atual

## Hipóteses de causa raiz

**H1 — Cadastro com drift**: igual ARMAZEM. Coords Nominatim/legacy erradas. Sintoma: lojas com 1-2 min off (correto geograficamente mas SL pego de parada próxima) ou sem match.

**H2 — Cross-day (saída 17h)**: caminhão carregado às 17h dia 18 entrega dia 19. Sistema busca dia 19 mas paradas estão dia 18. Sintoma: lojas com horários da madrugada/manhã que deveriam ser noite anterior.

**H3 — T18 plate-swap atribuindo errado**: caso GPS:NAO mas T18 pega parada de outra placa. Sintoma: "sys diz FOI, manual diz NÃO_FOI".

**H4 — Mapeamento de nome quebrado**: Mega Box / Loja 47 / EXTRA F.31 — nome no cadastro difere do nome no manual. Sintoma: "SÓ MANUAL" / "SÓ GERADO".

**H5 — Múltiplas paradas mesma loja não consolidando**: lojas com CHD/SL ~40min off. Sistema pega 2ª parada quando deveria pegar 1ª, ou vice-versa.

## Fases

### Fase 1 — Levantamento (read-only)

1.1 Extrair as 48 lojas oficiais da aba `endereço filiais` (script `enderecos_zs.ts`) e gerar tabela:
- Nome canônico (formato "Zona Sul Loja N - Bairro")
- Rua, número, bairro, CEP

1.2 Listar cadastro atual ZS no Supabase. Diff contra lista oficial:
- Faltando (existe no manual, não no banco)
- Sobrando (existe no banco, não no manual)
- Match por nome ambiguo

1.3 Identificar todas as placas que fizeram ZS dia 19 (manual + escala). Para cada placa, dump GPS dia 19 completo.

1.4 Mapear escala dia 19 → manual dia 19 (qual placa fez qual loja, em qual horário).

### Fase 2 — Cadastro: triangulação cross-day

Para cada loja problemática:
2.1 Procurar nos dias 02-21 quando essa loja recebeu entrega.
2.2 Para cada dia com entrega, achar parada GPS da placa correspondente que bate o horário manual (±5min).
2.3 Coordenadas consistentes em ≥2 dias → coord canônica da loja.
2.4 Comparar com cadastro atual; gerar diff (drift em metros).
2.5 Aplicar updates via script idempotente (com flag `--apply`).

### Fase 3 — Análise específica dia 19

Para cada bug categoria, executar diagnóstico:

3.1 **"sys FOI vs manual NÃO_FOI"** (9 lojas): pra cada loja, verificar:
- A placa cadastrada na escala tem paradas GPS nesse horário?
- Se sim: GPS prova manual está errado → marcar como conflito
- Se não: T18 está pegando parada de outra placa → revisar T18 guards

3.2 **CHD/SL deslocado ~40min** (4 lojas): pra cada loja:
- Listar todas paradas LOJA da placa
- Comparar com horário manual
- Identificar se sistema escolheu parada errada (ex: 2ª em vez de 1ª)

3.3 **Loja 25 off por horas**: caso isolado.
- Verificar paradas GPS específicas
- Identificar T18 ou consolidação errada

3.4 **Sem match (Loja 33 Humaitá)**: placa cadastrada tem GPS? Cadastro Loja 33 OK?

3.5 **Nome mismatch**: criar aliases ou renomear no cadastro:
- Mega Box 1/2 — pode ser entrega especial
- Loja 47 (com/sem "Catete") — alias

### Fase 4 — Investigar H2 (cross-day)

4.1 Listar entregas manual ZS dia 19 com SC ≥17:00 do dia 18.
4.2 Verificar se sistema está corretamente associando ao dia 19 ou se erra.
4.3 Se erra, adicionar lógica no matcher para puxar paradas do dia anterior quando SC ≥17:00.

### Fase 5 — Implementar fixes

Em ordem:
5.1 **Cadastro** (Fase 2) — aplicar updates de coords
5.2 **Aliases** (Fase 3.5) — adicionar/renomear lojas
5.3 **Matcher fixes** — só se necessário (T18, cross-day)

### Fase 6 — Validação

6.1 Reverificar dia 19 ZS: meta 40+/47 batendo qualitativamente.
6.2 Reverificar dias 18, 20, 21 ZS pra confirmar não regrediu.
6.3 Reverificar ARMAZEM dia 19, 20, 21 pra confirmar não quebrou.
6.4 Vitest 282/282.

## Riscos

- **R1 (alta)**: matcher precisa de fix cross-day; pode afetar outras redes.
- **R2 (média)**: fixes de cadastro podem quebrar match de dias antigos via cod_unitrac.
- **R3 (baixa)**: aliases Mega Box / Loja 47 podem confundir dedup.

## Critério de aceite

- Dia 19 ZS: ≥40/47 lojas batendo qualitativamente (1-3 min off)
- Dias 18, 20, 21 ZS: nenhum regredido
- ARMAZEM dias 19, 20, 21: nenhum regredido
- Vitest 282/282
- Conflitos manual-vs-GPS documentados em `docs/conflitos-manual.md` (para revisão Tia Érica)
