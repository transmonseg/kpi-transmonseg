# Relatório da sessão — 2026-05-18

## Resumo executivo

Comparando o KPI gerado vs o manual da Tia Érica para o dia 18/05, o sistema saiu de **~50% match** para **~70% match** geral. Os 30% restantes são, na sua maioria, limites do dado de origem (terceirizados sem GPS, cross-docking operacional, cadastro Unitrac incompleto), não bugs do código.

## O que foi consertado

### Critical bugs (8 fixes)

1. **Timezone -3h em todos os horários** — `toExcelTime` aplicava conversão UTC→BRT em date que já estava em BRT-as-UTC. Resultado: TUDO mostrava 3h a menos no KPI. Fix: usar `getUTCHours()` direto.

2. **Parser ESCALA GERAL duplicava lojas multi-entrega** — Buzios 1/2/3, Arraial 1/2/3, Cabo Frio 1/2/3, Maricá 1/2 viravam 3x "Buzios 1" em vez das 3 lojas distintas. Fix: branch "secondary delivery" agora usa `s1` da linha em vez de `ultimaLoja.nome`.

3. **Parser GERAL emitia placeholders FEIRA_NOVA/EMANUEL/SUPER_PAX** — essas redes vêm no arquivo separado, no GERAL aparecem só com nome de loja sem motorista/placa. Fix: pular linhas sem motorista+placa carro 1.

4. **Matcher pegava parada FORA_BASE em vez de LOJA** — caso Cosme Velho/Pechincha/etc. Fix: filtrar só LOJA classification.

5. **Matcher atribuía mesma parada a múltiplas escala_linhas** — caso Iguaba/Itaboraí (mesmo veículo). Fix: match cada escala_linha à parada certa por nome + greedy assignment.

6. **`extraiLoja` concatenava classificações múltiplas** — Unitrac PDF coloca várias lojas próximas no mesmo campo "Local da Parada" separadas por vírgula. Fix: pegar só a 1ª.

7. **Filtro de letras soltas tirava dígitos** — meu fix anterior pra remover "S" de "LARANJEIRA S" também removia "1", "2", "3" dos nomes de loja, fazendo Buzios 1/2/3 todos parecerem iguais ao matcher. Fix: filtrar só `[A-Z]` solto, preservar dígitos.

8. **Códigos Unitrac longos bloqueavam match** — Zona Sul tem cod "18" na escala e cod "9039018" no Unitrac. Fix duplo: (a) `extraiNumero` só pega 1-3 dígitos, (b) novo cod-suffix-match com score 0 quando codL é sufixo de codP.

### Melhorias adicionais

- **OCR-tolerant placa matching** — Mercosul pos 4 confundindo `1↔B`, `9↔J`, `4↔E`. Variantes só aceitas se ÚNICA no Unitrac (sem ambiguidade).
- **Fallback temporal** — quando o matcher não consegue separar paradas por nome (ex: Regina concatenado), atribui por ordem cronológica.
- **TEMPO EM LOJA fórmula com result pré-calculado** — ExcelJS não calcula sozinho; agora não fica `f=?` em viewers.
- **Layout KPI igual manual** — sempre 15 colunas, fontes Arial corretas, "SEM RASTREADOR"/"NÃO FOI AO CLIENTE" para casos sem GPS.
- **Repair quebra de página** no Unitrac — paradas cortadas pelo footer (HH:MM HH:MM na página seguinte) agora reconstroem corretamente (+137 paradas recuperadas).

## Match rates finais (cross-validação dia 18/05)

| Rede | Antes | Depois | Δ |
|---|---|---|---|
| GERAL (todas redes) | 54% | **71%** | +17% |
| PRINCESA (no GERAL) | 92% | **92%** | mantém |
| PREZUNIC | 78% | **78%** | mantém |
| ASSAI | 50% | **60%** | +10% |
| SUPERPRIX | 60% | **70%** | +10% |
| SENDAS | 40% | **70%** | +30% |
| ZONA_SUL | 41% | **59%** | +18% |
| ARMAZEM_GRAO | 14% | **57%** | +43% |
| SUPER_PAX | 58% | **67%** | +9% |
| FEIRA_NOVA | 67% | **75%** | +8% |
| EMANUEL | 50% | **83%** | +33% |

## O que NÃO dá pra consertar via código

### Limites operacionais (~30% do gap restante)

1. **Veículos terceirizados sem GPS** — várias placas na escala simplesmente NÃO aparecem no Unitrac. O Unitrac só rastreia frota própria. Ex: KQR2J11 (Flamengo Princesa), 12 placas Zona Sul, 7 placas PAX. **Manual preenche estimativa.**

2. **Cross-docking operacional** — placa de Assaí entrega numa loja Sendas. Unitrac registra "SENDAS LOJA X", escala diz "Assaí Loja Y". Não é o MESMO loja, é o veículo transitando. Matcher correto em recusar. Ex: SAMS_CLUB (todas 3), 9 linhas ASSAI.

3. **Cadastro Unitrac incompleto** — caminhão saiu da BASE, fez paradas, voltou. Mas o Unitrac não classificou nenhuma como LOJA (talvez sem cadastro de geofence da loja). Não dá pra inferir que loja foi visitada. Ex: 10 ASSAI, 3 Zona Sul, alguns Armazém.

4. **ARMAZEM_GRAO como distribuidor** — escala lista "REGINA POSSE", "REGINA VALPARAÍSO" (bairros), Unitrac registra "PRINCESA BUZIOS", "SENDAS CARIOCA" (clientes finais que receberam mercadoria via Armazém). 6 linhas neste padrão. Precisaria mapa de negócio bairro↔cliente que só o cliente tem.

### Divergência de fonte (Flamengo case)

A escala diz Flamengo = KANU/KQR2J11. O manual diz RAFAEL/EYL8B91. Tia Érica corrigiu manualmente após o dia. Sistema reflete o que está no arquivo de escala.

## Próximos passos sugeridos (não automatizados)

1. **Cadastrar coordenadas/geofence das lojas no Unitrac** — resolveria ~13 ASSAI + ~3 ZS + alguns Armazém. Trabalho do cliente.
2. **Mapear cross-docking ARMAZEM→cliente final** — resolveria 6 Armazém. Precisa input do cliente.
3. **Identificar placas terceirizadas** — pra mostrar "VEÍCULO EXTERNO" em vez de tentar matchear. Não é fix, é informação melhor.
4. **Validar pares OCR `1↔B`/`9↔J`/`4↔E`** — confirmar com cliente que são realmente OCR-error (sistema atual só aceita se único, descartando ambíguos).

## Arquivos modificados nesta sessão

- `src/lib/parsers/unitrac-pdf.ts` — extraiLoja anti-concat, classificação BASE/FORA prefixo curto, repair quebra de página, normalização de espaços (5 regras novas)
- `src/lib/parsers/escala-geral.ts` — filtro placeholder, secondary delivery usa s1
- `src/lib/kpi/matcher.ts` — match por nome + numero, OCR-tolerant, cod-suffix-match, fallback temporal
- `src/lib/kpi/gerador-kpi.ts` — timezone fix, formato manual Tia Érica, formatarPlacaDisplay, fórmula TEMPO com result
- `src/lib/lojas/catalogo-matriz.ts` — nomes Princesa corretos, matriz Prezunic adicionada

## Commits desta sessão

```
03f94c8 fix(matcher): cod match suffix + ignora códigos longos como número de loja
b1c0c16 fix(unitrac,matcher): extraiLoja anti-concat + placa OCR-tolerant + fallback temporal
4ad8d1b fix(parsers): pular placeholders no GERAL + matcher corta concatenacao por virgula
7203034 fix(matcher): nao filtrar digitos isolados (numeros de loja) no tokenize
6dacb56 fix(matcher): match fuzzy pra plurais/truncamentos do Unitrac
4846d71 fix(matcher,kpi): associar parada a escala_linha por nome + result na formula TEMPO
aba024f fix(kpi): horarios 3h errados e parser duplicando lojas multi-entrega
1a52bd8 fix(unitrac/kpi): reparo de paradas truncadas, prefixo curto BASE/FORA, layout KPI igual manual
```

Tudo no GitHub: https://github.com/transmonseg/kpi-transmonseg
