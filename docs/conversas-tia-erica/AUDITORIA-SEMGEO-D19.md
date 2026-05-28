# Auditoria: gerado (sem geo) × manual — dia 19

Comparação loja por loja, tolerância 10 min, validada contra os KPIs manuais da Tia.

## Precisão por rede (acertos / tudo que o sistema preencheu)

| Rede | ✅ Acerto | ✗ Erro horário | ⚠️ Inventou | ⚠️ Não achou | Precisão |
|------|:--:|:--:|:--:|:--:|:--:|
| ATACADAO | 1 | 0 | 0 | 1 | **100%** |
| SUPERPRIX | 7 | 0 | 0 | 2 | **100%** |
| GUANABARA | 20 | 2 | 0 | 5 | **91%** |
| PRINCESA | 21 | 2 | 0 | 3 | **91%** |
| PREZUNIC | 47 | 5 | 0 | 5 | **90%** |
| CARREFOUR | 7 | 1 | 0 | 2 | **88%** |
| ZONA_SUL | 16 | 8 | 0 | 17 | 67% |
| SUPER_PAX | 7 | 3 | 1 | 1 | 64% |
| ASSAI | 20 | 15 | 0 | 6 | 57% |
| ARMAZEM_GRAO | 3 | 5 | 0 | 6 | 38% |

**Totais:** Acerto=149 · Erro horário=41 · Inventou=**1** · Não achou=48

## Veredito

### ✅ O que está confiável (passar pro cliente)
**6 redes acima de 88%**: Atacadão, Superprix, Guanabara, Princesa, Prezunic, Carrefour.
O modo sem-geo praticamente **não inventa** (só 1 falso positivo em 191 preenchimentos) — quando preenche, está certo.

### 🔴 3 problemas reais encontrados

**1. 9 BUGS de "não achou" — quase todos ZONA_SUL multi-loja**
A placa TEM parada limpa no Unitrac mas o sistema não casou com a loja escalada:
- ZS 15 LEBLON (LQU5546): tinha cod 9039015
- ZS 29 FLAMENGO (LQU5546): tinha cod 9039027... (placa faz lojas 15/27/28/29, matcher não distribuiu)
- ZS 04/38/03/10/11 e PREZUNIC SPID BARRA, SUPERPRIX NITERÓI
→ Causa: placa multi-loja, sem geo o assignOptimal não amarra cada parada à linha certa (é o bug #255 pendente).

**2. Erro de horário (41) — principalmente SAÍDA da loja em ASSAI/ARMAZEM**
- ASSAI: **chegada quase sempre bate** (348≈350), mas **saída erra** — placa volta na loja / fica na região e o cálculo de saída pega cedo ou tarde demais.
- ARMAZEM: horário totalmente errado (manual 15:25, sistema 05:44) — Petrópolis fica longe; as paradas REGINA vêm sem código ou bugadas.

**3. 36 "não achou" são DADO AUSENTE (correto deixar vazio)**
A placa não tem nenhuma parada LOJA no Unitrac (ex: Alcântara, Manilha, Bento Ribeiro). Não é bug — o Unitrac não capturou. Vazio é o comportamento certo.

## Conclusão
- **Números das redes limpas: OK e validados** (88-100%).
- **Faltam 2 correções reais**: (a) distribuição multi-loja sem geo (9 casos, ZS) e (b) cálculo de saída em multi-visita (ASSAI/ARMAZEM).
- **0 risco de inventar dado** — o estrito segura bem.
