# Alterações WhatsApp — Dia 25/05/2026 (Tia Érica)

Mensagens conforme coladas pela tia Érica no WhatsApp do operacional.

---

## Bloco 1 — Nova Iguaçu 2 (Prezunic/Atacadão?)

```
🚨alteração 🚨nova Iguaçu 2 sai jxa4192 cod 184041 entra CPI 4c81 mesmo motorista motivo problema na trava🚨
```

**Esperado:**
- rede: PREZUNIC ou ATACADAO (Nova Iguaçu é loja típica de ambas — ambiguidade)
- loja: Nova Iguaçu 2
- sai: placa JXA-4192, motorista código 184041
- entra: placa CPI-4C81 (Mercosul) — mesmo motorista
- tipo: SWAP (mesmo motorista, troca de carro)
- motivo: problema na trava

---

## Bloco 2 — Troca sem rede explícita

```
Trocar carro EZU-9J51 Pelo UBO-5E05, Motivo o mesmo não está funcionando
```

**Esperado:**
- rede: null (não dá pra detectar)
- sai: EZU-9J51
- entra: UBO-5E05
- tipo: SWAP (motorista implícito o mesmo)
- motivo: o mesmo não está funcionando

---

## Bloco 3 — Zona Sul Filial 20

```
Alteração zona sul
Filial 20
Obs:. Troca de carro
Sai: lte0a64
Entra:ttx9e34
```

**Esperado:**
- rede: ZONA_SUL
- filial: 20
- sai: LTE-0A64 (Mercosul format)
- entra: TTX-9E34 (Mercosul format)
- tipo: SWAP (obs="troca de carro")
- motivo: "Troca de carro"
