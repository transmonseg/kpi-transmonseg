# Índice — Análise match placa-por-placa (5 dias)

Verificação manual: para cada placa única, comparou-se a escala (todas as redes — Geral, PAX, Armazém, Zona Sul, Guanabara) com as paradas LOJA do Unitrac.

Critério de match (igual ao matcher V2.1, sem cross-rede sobreposto):
1. `codigo_escala` exato com `codigo_loja` (ou suffix-match)
2. Se não, tokens de nome em comum (ignorando palavras genéricas: LOJA, SUL, ASSAI, etc)
3. Códigos em ROTAS_GIGANTES descartados do match exato (raio ≥ 5km, ver `rotas-gigantes.ts`)

## Sumário consolidado dos 5 dias

| Diagnóstico | Dia 18 | Dia 19 | Dia 20 | Dia 21 | Dia 22 | **Total** | % |
|-------------|--------|--------|--------|--------|--------|-----------|---|
| **OK_FULL** (todas rotas batem) | 68 | 56 | 71 | 61 | 74 | **330** | 38% |
| **OK_PARCIAL** (parte das rotas) | 16 | 24 | 14 | 19 | 15 | **88** | 10% |
| **FALHA_MATCH** (paradas ≠ escala) | 4 | 4 | 6 | 6 | 3 | **23** | 3% |
| **PLACA_AUSENTE** (escala sim, Unitrac não) | 35 | 41 | 36 | 35 | 29 | **176** | 20% |
| **INATIVA** (CD-only crônica) | 11 | 11 | 11 | 9 | 8 | **50** | 6% |
| **FORA_ESCALA** (Unitrac sim, escala não) | 39 | 28 | 38 | 31 | 39 | **175** | 20% |
| **Total placas únicas** | 173 | 164 | 176 | 161 | 168 | **842** | |

## Interpretação

- **OK_FULL (38%)**: o sistema casa direito. Esses são os 100% certos.
- **OK_PARCIAL (10%)**: o sistema casa ALGUMAS rotas da placa, mas não todas. **Esses são os casos onde o usuário vê "placa casou mas 1 rota faltou"**. Total 88 casos nos 5 dias — atacar primeiro.
- **FALHA_MATCH (3%)**: paradas LOJA existem no Unitrac mas nenhuma bate com escala. Geralmente:
  - Lojas Armazém do Grão (BOA VISTA/POSSE/16 DE MARÇO/MATRIZ) que aparecem só como geofence rota gigante REGINA no Unitrac
  - Lojas SAMS Barra Ayrton Senna, Prezunic SPID Jacarepagua que não têm geofence Unitrac próprio
- **PLACA_AUSENTE (20%)**: a escala previa entrega mas o veículo nem rodou no Unitrac. Não é bug do matcher — é dado da escala que não se realizou.
- **INATIVA (6%)**: as 31 placas CD-only crônicas (lista negra V2.1). Correto não casarem.
- **FORA_ESCALA (20%)**: veículo rodou no Unitrac mas não estava na escala. Pode ser:
  - Substituição não anotada (placa A trocou por B no dia)
  - Veículo de apoio do CD que saiu por algum motivo
  - Escala diferente que não foi importada

## Arquivos por dia

- [Dia 18 — 173 placas](./analise-match-dia-18.md)
- [Dia 19 — 164 placas](./analise-match-dia-19.md)
- [Dia 20 — 176 placas](./analise-match-dia-20.md)
- [Dia 21 — 161 placas](./analise-match-dia-21.md)
- [Dia 22 — 168 placas](./analise-match-dia-22.md)

## Ações priorizadas

1. **88 OK_PARCIAL** — examinar quais rotas faltaram casar e por quê. Padrões esperados:
   - Loja com nome muito diferente no Unitrac (escala "Mercado de Santa" vs Unitrac "9966101 SUPERMARKET COELHO NETO")
   - Rota gigante bloqueando match exato (escala "Princesa Inga" cod=— vs parada Unitrac 8590556 PRINCESA INGÁ — esse SIM deveria casar)
   - Lojas faltando codigo_unitrac no cadastro

2. **23 FALHA_MATCH** — investigar onde a parada real está no Unitrac:
   - Armazém do Grão BOA VISTA/POSSE/16 DE MARÇO: paradas reais aparecem como REGINA (5353012/14/16) — geofence rota gigante engloba todas essas lojas
   - Solução: cadastrar codigo_unitrac das lojas físicas → quando aparece "REGINA" no Unitrac, casa pela primeira loja da escala que tenha o código

3. **176 PLACA_AUSENTE** — sem fix possível no matcher. Pode ser:
   - Erro de digitação na escala (sem dado pra confirmar)
   - Veículo quebrou / motorista folgou — escala estava errada

4. **175 FORA_ESCALA** — investigar substituições não anotadas (alterações de plataforma).
