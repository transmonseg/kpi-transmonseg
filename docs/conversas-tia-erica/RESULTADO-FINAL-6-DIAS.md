# Resultado final — KPI automático sem geofence (6 dias)

Análise completa: dias 18, 19, 20, 21, 22 e 25 de maio. Lido **direto dos arquivos**
(escalas + relatórios Unitrac + alterações de placa), comparado loja por loja com os
KPIs manuais da Tia Erica, casando por placa, lendo os 2 carros, tolerância 10 min.

## Precisão por rede (consolidado 6 dias)

| Rede | Acertos | Precisão | Situação |
|------|:--:|:--:|---|
| **PRINCESA** | 128/159 | **81%** | ✅ pronto pro cliente |
| **PREZUNIC** | 183/244 | **75%** | ✅ pronto pro cliente |
| **CARREFOUR** | 37/55 | **67%** | ✅ bom |
| **SUPERPRIX** | 39/59 | **66%** | ✅ bom |
| ZONA_SUL | 138/245 | 56% | ⚠️ misto |
| ASSAI | 106/202 | 52% | ⚠️ saída + cadastro |
| GUANABARA | 20/46 | 43% | ⚠️ dado parcial |
| ARMAZEM | 18/68 | 26% | 🔴 cadastro na base |
| SUPER_PAX | 41/176 | 23% | 🔴 cadastro + sem GPS |
| ATACADAO | 2/10 | 20% | 🔴 sem GPS |

## O que o sistema JÁ faz certo (tudo que é pegável, ele pega)

1. **Match por código/nome/placa** — sem geofence (que era a fonte dos erros do Unitrac).
2. **Distribuição multi-loja** — placa que entrega em várias lojas, cada parada vai pra loja certa pelo código.
3. **Saída = última de paradas consecutivas** — placa que muda de portão/lado na mesma loja conta da 1ª chegada à última saída.
4. **2 carros por loja** — 1ª e 2ª entrega lidas corretamente.
5. **Alterações de placa de última hora** — troca registrada (ex: Alcântara trocou LSN-6I72 → DBB-8D19) é aplicada antes do cruzamento.

## Por que as redes baixas não sobem (NÃO é falha do código)

São 3 causas, todas fora do controle do sistema:

1. **Cadastro errado no Unitrac** (ARMAZEM, EMANUEL/FEIRA NOVA dentro do Super Pax): a loja está cadastrada em cima da BASE Benassi ou com geofence sobreposto. O sistema, corretamente, deixa vazio em vez de inventar. **Só a Benassi corrige no Unitrac.**
2. **Sem rastreador** (SUPER_PAX, ATACADAO): a placa escalada não tem nenhuma parada no relatório Unitrac — o rastreador não capturou. Não há o que pegar.
3. **Saída ambígua** (ASSAI): a placa entrega rápido e fica horas estacionada na loja. Sem geofence, não dá pra distinguir "voltou pra entregar" de "estacionou".

## Recomendação

- **Liberar pro cliente agora**: Princesa, Prezunic, Carrefour, Superprix (66-81%, sem invenção de dado).
- **Aguardar correção de cadastro na Benassi**: Armazém, Emanuel, Feira Nova.
- **Revisão manual pontual**: Assaí (saída) e casos sem rastreador.
