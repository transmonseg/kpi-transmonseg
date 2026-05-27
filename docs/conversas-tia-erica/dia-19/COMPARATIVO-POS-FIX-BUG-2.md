# Comparativo pré/pós fix Bug 2 (Geo fallback restrito a LOJA)

Fix aplicado em `matcher.ts:1118-1130`: o Geo fallback Category B agora só aceita paradas `classificacao === 'LOJA'`. Paradas `FORA_BASE`/`FAKE_EXIT` nunca viram entrega (regra da Tia Erica 2026-05-27).

## Resultado por rede

| Rede | Pré-fix | Pós-fix | Δ |
|------|---------|---------|---|
| ARMAZEM_GRAO | 21% | **~93%** | +72pp |
| ASSAI | 88% | **~95%** | +7pp |
| ATACADAO | 50% | **100%** | +50pp |
| CAB_PETROPOLIS | 0% | 0% (cadastro) | — |
| CARREFOUR | 75% | **~85%** | +10pp |
| FEIRA_NOVA | 92% | 92% | 0 |
| GUANABARA | 90% | **~95%** | +5pp |
| MUNDIAL | 100% | 100% | — |
| PRINCESA | 96% | **100%** | +4pp |
| PREZUNIC | 90% | **~95%** | +5pp |
| SAMS_CLUB | 100% | 100% | — |
| SENDAS | 55% | ~70% | +15pp |
| SUPERCOMPRAS | 0% | 0% (cadastro) | — |
| SUPER_PAX | 70% | ~75% | +5pp |
| SUPERPRIX | 95% | 95% | — |
| VIANENSE | 100% | 100% | — |
| ZONA_SUL | 75% | **~90%** | +15pp |

**Total estimado: 79% → ~89%** (+10pp absoluto).

## Bugs resolvidos pelo fix

| Caso | Antes | Depois |
|------|-------|--------|
| PRINCESA LMF2049 Niterói Barcas | 05:14/05:58/06:36 inventado | vazio ✅ |
| ATACADAO QSS1E48 Manilha | 04:47/06:21/10:17 inventado | vazio ✅ |
| ZS LJS2172 L01/L09 | inventado | vazio ✅ |
| ZS UBO5E05 L14 | inventado | vazio ✅ |
| ZS EBG2D13 L22/L25 | inventado | vazio ✅ |
| ZS LQE5401 L47 | inventado | vazio ✅ |
| ZS DBB8D19 EXTRA F.31 | inventado | vazio ✅ |
| ASSAI DBB8D19 Alcântara I | 05:11/06:36/09:13 inventado | vazio ✅ |
| ASSAI KXB6E57 Campinho | inventado | vazio ✅ |
| ASSAI CEJ3426 Pilares | inventado | vazio ✅ |
| CARREFOUR LJS2B72 Norte Shopping | 05:29/05:56/06:37 inventado | vazio ✅ |
| CARREFOUR TJQ6J26 Sulacap | 05:55/06:18/07:16 inventado | vazio ✅ |
| PREZUNIC KNC1I34 Jardim Oceanico/Marapendi | inventado | vazio ✅ |
| PREZUNIC HNG2B61 Botafogo SA | inventado | vazio ✅ |
| GUANABARA LBB5205 BENTO RIBEIRO | inventado | vazio ✅ |
| GUANABARA GVH0163 BONSUCESSO | inventado | vazio ✅ |
| GUANABARA LIA7683 TANQUE | inventado | vazio ✅ |
| FEIRA_NOVA EFU5704 Irajá | inventado | vazio ✅ |

## Bugs remanescentes

| Caso | Status | Causa |
|------|--------|-------|
| ARMAZEM_GRAO REGINA 1 DE MAIO | clonada 15:38/16:26 = BARRA IMBUY | fallback parada compartilhada ainda atribui mesma parada quando scorePair === 0 e dist ≤ 500m. Reginas estão fisicamente próximas. |
| CAB Petrópolis | 0% — atribui FEIRA NOVA BOA DICA | cadastro: cod 7012010 não está cadastrado pra CAB |
| SUPERCOMPRAS COSMOS | 0% — atribui Mercado Santo Agostinho | cadastro: cod 23080000 atribuído erroneamente |
| CARREFOUR Campo Grande SIMÃO | atribui EMANUEL VARGEM GRANDE | cadastro: cod 17659003? ou bug na priorização |
| ZS L07 RODRIGO/KWK4593 | atribui parada Loja 21 como Loja 07 | matcher escolhe parada errada quando há múltiplas LOJAs |
| ZS L48 Recreio BBH1C94 | atribui HUMAITA L33 como L48 | mesma causa |
| ZS MEGA BOX | continua vazio | cods 6018000/6018001 não casam com ZONA_SUL |
| SENDAS PETIT/EMPORIO | atribuído como SENDAS Atlantico Sul/Tower/Barramares | cadastro: validar se PETIT é mesma loja física |

## Próximos passos

1. **Fix banco lojas:**
   - INSERT/UPDATE: `codigo_unitrac=7012010` → CAB Petrópolis
   - REVISAR: `codigo_unitrac=23080000` → era SUPERCOMPRAS COSMOS, deveria ser FEIRA_NOVA Mercado Santo Agostinho ou loja independente?
   - REVISAR: PETIT cods 22144000/22144002/22980000 (são SENDAS ou loja própria?)
   - INVESTIGAR: cadastro Carrefour Campo Grande (LSN6I72 está pegando EMANUEL)
   - INVESTIGAR: MEGA BOX cods 6018000/6018001 (rede certa?)

2. **Investigar clonagem residual** ARMAZEM_GRAO REGINA 1 DE MAIO (matcher.ts:1236-1268).

3. **Investigar L07 RODRIGO / L48 BBH1C94** — paradas LOJA reais sendo atribuídas à loja errada da mesma rede.
