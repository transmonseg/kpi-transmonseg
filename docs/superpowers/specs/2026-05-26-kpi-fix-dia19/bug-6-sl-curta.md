# Bug 6 — SL muito curta (LOJA → FORA_BASE adjacente perdido)

## Causa raiz hipotética

`matcher.ts:estendeSaidaPorForaBase` (linha 340) estende SL quando LOJA curta (≤15min) é seguida de FORA_BASE longo (≥30min) NA MESMA ÁREA (≤300m). Funciona pra PREZUNIC Fonseca dia 20.

Mas no dia 19 vários casos NÃO satisfazem todos os critérios:
- ATACADAO Manilha: LOJA dura mais de 15min mas SL termina cedo
- GUANABARA Bento Ribeiro: LOJA muito curta (4min!) + FORA_BASE longe?
- ASSAI Galeão: SL muito tarde (problema oposto)

Critérios atuais (15min/30min/300m/10min gap) podem precisar ajuste OU outros patterns existem (LOJA + N FORA_BASE consecutivos, ou LOJA + outra LOJA dentro do raio).

## Evidência (dia 19)

| Rede | Loja | Manual SL | Gerado SL | Δ |
|------|------|-----------|-----------|---|
| ZS | 43 Barra | 16:55 | 16:20 | 35min |
| ZS | 45 Flamengo | 18:00 | 16:19 | 101min |
| ATACADAO | Manilha | 10:20 | 08:07 | 133min |
| CARREFOUR | Sulacap | 07:15 | 06:32 | 43min |
| PREZUNIC | Caxias Centro | 06:30 | 06:17 | 13min |
| GUANABARA | Bento Ribeiro | 12:50 | 10:36 | 134min |
| GUANABARA | Bonsucesso | 11:55 | 10:50 | 65min |
| ASSAI | Macaé | 10:30 | 06:21 | 249min |
| PRINCESA | Buzios 1 (2ª) | 17:30 | 06:32 | 658min |

## Solução proposta

1. **Investigar GPS de cada caso** (skill `pdf`/`xlsx` se necessário):
   - Tem FORA_BASE longo seguindo LOJA? Em que dist?
   - LOJA dura quanto?

2. **Ajustar critérios baseado nos dados:**
   - Talvez aumentar raio pra 500m
   - Talvez aceitar gap maior (20min)
   - Talvez seguir cadeia LOJA → FORA_BASE → FORA_BASE (multi-step)

3. **NÃO** flexibilizar irrestritamente — pode quebrar casos OK (PRINCESA, GUANABARA OK).

## Arquivos a tocar

- `src/lib/kpi/matcher.ts:340` (`estendeSaidaPorForaBase`)

## Critério de aceite (tolerante — bug de timing)

- [ ] Das 9 lojas listadas, pelo menos 6 com Δ SL ≤15min após fix
- [ ] Não-regressão: PREZUNIC Fonseca dia 20 continua resolvido (SL=09:28)
- [ ] Não-regressão: nenhuma loja OK no dia 19 vira ❌ por SL longa demais

## Teste vitest

Adicionar casos no teste existente de `estendeSaidaPorForaBase`:
- LOJA 39min + FORA_BASE 234min dist=660m (Vilar dos Teles caso real, hoje NÃO estende)
- LOJA 245min + LOJA 90min + LOJA 15min (Recreio padrão, deveria parar na 1ª LOJA?)

## Rollback

`git revert`. Risco: novos casos podem estender demais.

## Status

🔍 Aguardando investigação
