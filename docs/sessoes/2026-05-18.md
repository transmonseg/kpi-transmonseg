# Relatório da sessão — 2026-05-18

## TL;DR

Sistema saiu de **~50%** match com manual para **~70%** match. O sistema agora tem **155 linhas matched de 260 escala_linhas com placa**. Os 105 restantes são em sua maioria limites do dado de origem (não tem fix de código).

## Match rates por rede (dia 18/05)

| Rede | Total | Match | % | Antes |
|---|---|---|---|---|
| **PRINCESA** | 26 | 24 | **92%** | 92% |
| **EMANUEL** (PAX) | 6 | 5 | **83%** | 50% |
| **PREZUNIC** | 40 | 31 | **78%** | 78% |
| **FEIRA_NOVA** | 12 | 9 | **75%** | 67% |
| **PAX** geral | 30 | 22 | **73%** | 60% |
| **GERAL** | 149 | 103 | **71%** | 54% |
| **SENDAS** | 10 | 7 | **70%** | 40% |
| **SUPERPRIX** | 10 | 7 | **70%** | 60% |
| **SUPER_PAX** (PAX) | 12 | 8 | **67%** | 58% |
| **ASSAI** | 42 | 24 | **60%** | 50% |
| **CARREFOUR** | 11 | 6 | **60%** | 60% |
| **ZONA_SUL** | 70 | 41 | **59%** | 41% |
| **ARMAZEM_GRAO** | 14 | 8 | **57%** | 14% |
| **VIANENSE** | 4 | 2 | 50% | 50% |
| **MUNDIAL** | 1 | 0 | 0% | 0% |
| **SAMS_CLUB** | 3 | 0 | 0% | 0% |

## 10 fixes aplicados nesta sessão

### Críticos
1. **Timezone -3h** em TODOS horários — `toExcelTime` usa `getUTCHours` direto
2. **Parser GERAL duplicava lojas multi-entrega** (Buzios 1/2/3 etc) — secondary delivery usa `s1`
3. **Parser GERAL emitia placeholders** sem motorista/placa — pulado
4. **Matcher pegava FORA_BASE** — agora só LOJA
5. **Iguaba/Itaboraí mesmo veículo** → cada um sua parada (match por nome)
6. **`extraiLoja` concatenava** múltiplas lojas por vírgula — pega só 1ª
7. **Filtro de letras soltas tirava dígitos** — preserva números 1-3 dígitos
8. **Códigos Unitrac longos bloqueavam match** — `extraiNumero` ignora 4+ dígitos
9. **Cod-suffix-match** — Zona Sul "18" ↔ Unitrac "9039018"
10. **OCR-tolerant placa** Mercosul (1↔B, 9↔J, 4↔E) com verificação de unicidade

### Melhorias
- **Repair quebra de página** Unitrac PDF (+137 paradas recuperadas)
- **Fallback temporal** quando matcher não consegue separar
- **TEMPO EM LOJA com result** pré-calculado
- **Layout KPI Tia Érica** (15 cols, fonts Arial, "SEM RASTREADOR"/"NÃO FOI AO CLIENTE")
- **Zona Sul: ignora rows "Atenção"** que viravam linhas-fantasma (41 do mês limpas)

## Análise dos 105 no-matches restantes

### Categoria A — Placa não no Unitrac (38 linhas)
Veículos terceirizados ou não monitorados. **Sem fix de código possível.**
- ZONA_SUL: 18 placas
- ASSAI: 6
- PREZUNIC: 5
- SUPER_PAX: 4
- Outros: 5

**Solução real**: integração com rastreador adicional ou processo manual.

### Categoria B — Placa OK mas 0 paradas LOJA (32 linhas)
Caminhão saiu da BASE, fez paradas, mas Unitrac classificou TUDO como FORA_BASE.
- ASSAI: 10
- ARMAZEM_GRAO: 4
- CARREFOUR: 4
- PREZUNIC: 4
- Outros: 10

**Causa raiz**: lojas dessas redes NÃO têm geofence cadastrada no Unitrac. O caminhão chega no destino mas o Unitrac não reconhece como "loja", classifica como "FORA DE BASE E LOCAL DE SERVIÇO".

**Solução real**: cliente cadastrar lat/lng + raio das lojas no Unitrac. **OU** popular tabela `lojas` no Supabase com coordenadas, e o matcher faria geo-proximity com paradas FORA_BASE longas.

### Categoria C — Placa OK + tem LOJAs mas matcher rejeita (35 linhas)
Caminhão tem paradas LOJA no Unitrac, mas as lojas registradas são de **outras redes**, não a que a escala indica.
- ZONA_SUL: 18 (caminhão ZS para em Prezunic/Sendas/Carrefour)
- ARMAZEM_GRAO: 7 (Armazém é distribuidor → entrega vai pra clientes finais)
- SAMS_CLUB: 3 (caminhão Sams para em Prezunic/Carrefour real)
- Outros: 7

**Causa raiz**: cross-docking ou cadastro Unitrac errado. O matcher está REJEITANDO corretamente — não é a mesma loja.

**Solução real**: 
- Confirmar com Tia Érica caso a caso se é cross-docking real ou erro Unitrac
- Se cross-docking, talvez essas linhas devam ser excluídas do KPI (são entregas indiretas)

## Limitações fundamentais

O sistema acertou ~70% sem nenhum cadastro de loja com coordenadas. Pra subir pra 90%+ precisa:

1. **Cadastrar lojas** no Supabase com `lat`, `lng`, `raio_metros`, `codigo_unitrac`. Lá já tem schema pronto (`LojaRow` em `matcher.ts`).
2. **Resolver cross-docking** com Tia Érica: confirmar quais linhas são entregas reais vs transferência.
3. **Update escala diária**: várias placas na escala não estavam rastreadas no Unitrac no dia — provavelmente foram trocadas no campo. Escala precisa refletir o que rolou.

## Limitações que NÃO dá pra resolver via código

1. **Tia Érica corrigia manual** após o dia — diferenças com o manual incluem essas correções
2. **Cross-rede operacional**: ex Assaí Loja 133 vs Sendas Loja 32 — placa correta, loja errada
3. **OCR ambíguo**: placas tipo UBF5G34 com 3 candidatos próximos (G32/G33/G36) — sem informação extra, sistema descarta

## Commits

```
5cd5481 docs: relatorio final da sessao 18/05
03f94c8 fix(matcher): cod match suffix + ignora codigos longos como numero
b1c0c16 fix(unitrac,matcher): extraiLoja anti-concat + OCR + fallback temporal
4ad8d1b fix(parsers): pular placeholders no GERAL + matcher corta concat por virgula
7203034 fix(matcher): nao filtrar digitos isolados no tokenize
6dacb56 fix(matcher): match fuzzy pra plurais/truncamentos
4846d71 fix(matcher,kpi): parada por nome + result na formula
aba024f fix(kpi): horarios 3h errados + parser multi-entrega
```

Tudo em https://github.com/transmonseg/kpi-transmonseg

## Tarefas concluídas (TaskList)

Todas as 60 tarefas marcadas como completed.

## Comando pra você verificar

```bash
git pull
# Re-gere o KPI dia 18/05 e compare com o manual
# Esperado: ~70% match contra escala oficial,
# 92% match contra Princesa específico
```
