# Analise ASSAI — dia 19/05/2026 (tol 10min)

**Total lojas:** 41
- Acerto completo: 23
- Chegada certa, saida >10min: 3
- SEM-RASTRE valido: 3
- Sem timestamp: 6
- **LOJA ERRADA (bug):** 1
- **INVENTADO (bug):** 5
- SEM-RASTRE errado: 0

## Saidas erradas (chd OK, saida diverge >10min)
| Loja | Placa | Sai sistema | Sai Unitrac |
|---|---|---|---|
| Assaí - Carioca Shopping - Loja 316 | QSW3B65 | 10:41 | 09:41 |
| Assaí - Mendanha (Campo Grande) - L | LFJ8442 | 11:21 | 08:29 |
| Assaí - São João do Meriti  - Loja  | EAC4D65 | 11:54 | 08:31 |

## Loja ERRADA (timestamp bate mas loja outra)
| Loja sistema | Placa | Horario | Loja real (Unitrac) |
|---|---|---|---|
| Assaí - Petrópolis- Loja 181 | KMZ7057 | 04:27-05:59 | SENDAS PETRÓPOLIS - LJ 38 |

## INVENTADO (sistema deu timestamp sem GPS perto)
| Loja | Placa | Motivo |
|---|---|---|
| Assaí - Alcântara I - Loja 35 | DBB8D19 | FORA_BASE perto 06:36 |
| Assaí - Alcântara II - Loja 293 | FQN6J72 | FORA_BASE perto 06:46 |
| Assaí - Barra I (Senna) - Loja 133 | UBO5E05 | FORA_BASE perto 06:06 |
| Assaí - Campinho - Loja 37 | KXB6E57 | FORA_BASE perto 06:23 |
| Assaí - Pilares - Loja 128 | CEJ3426 | FORA_BASE perto 06:07 |
