# Bug 2 — Placa do gerado ≠ manual (plate-swap mal feito ou parser nome)

## Causa raiz hipotética

Dois sub-casos:

**2A: Plate-swap T18 atribui placa errada**
Quando placa escalada está ausente no Unitrac, T18 procura outra placa cujo GPS bate a loja. Em alguns casos pega a placa errada (carro com geofence próximo).

**2B: Parser de nome confunde tokens**
GUANABARA Campo Grande F.10: motorista "ARTHUR" foi quebrado em "ART" + "HUR-1841" (tratado como placa). Bug no parser de escala / detector de placa.

## Evidência (dia 19)

| Rede | Loja | Manual placa | Gerado placa | Sub-caso |
|------|------|--------------|--------------|----------|
| ZS | 33 | BBH-1C94 | LCO-0978 (sem dado) | 2A |
| ZS | 21 1ª | KWK-4593 | LTQ-0783 (sem dado) | 2A |
| ZS | 07 1ª | LCO-0978 | KWK-4593 (tempos errados) | 2A |
| ZS | 48 | RJL-7D33 NÃO_FOI | BBH-1C94 / 04:49 | 2A |
| ZS | 31 1ª | DBB-8D19 | LTE-0A64 SEM | 2A |
| GUANABARA | Campo Grande F.10 | KNI-8942 (ARTHUR) | HUR-1841 (ART) | 2B |

## Solução proposta

**Pra 2A:** Investigar T18 — talvez precise guard mais estrito quando placa GPS está em loja com geofence proximal mas não exata.
**Pra 2B:** Olhar parser de escala que quebra motorista — usar regex de placa Mercosul mais estrita.

## Arquivos a tocar

- `src/lib/kpi/matcher.ts` — T18 plate-swap (linhas 1306-1456)
- `src/lib/parsers/escala-guanabara-pdf.ts` ou similar (parser que produz "ART" + "HUR-1841")
- `src/lib/utils/placa.ts` (regex de placa)

## Critério de aceite (estrito)

- [ ] ZS Loja 33 dia 19: placa = BBH-1C94 (não LCO-0978)
- [ ] GUANABARA Campo Grande F.10: motorista = ARTHUR, placa = KNI-8942
- [ ] Demais lojas listadas: placa = manual

## Teste vitest

- Teste pra parser GUANABARA: nome com "ART" no início não vira placa
- Teste pra T18: caso BBH-1C94 (Josué) → Loja 33, não Loja 48

## Rollback

`git revert` do commit. Pode ter casos legítimos que dependiam do comportamento.

## Status

🔍 Aguardando investigação
