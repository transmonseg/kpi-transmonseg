# Respostas da Tia Erica — perguntas v2 sobre Unitrac dia 19

Áudio recebido em 2026-05-27.

---

## ✅ P1 — Placa que faz 2 redes diferentes (Prezunic + Zona Sul)

> "São duas entregas separadas. Porque Zona Sul é Zona Sul, Prezunic é Prezunic.
> Se a placa estiver nas duas escalas — tipo, na escala da Zona Sul tiver essa placa
> e na escala da Prezunic também tiver essa placa — você vai considerar o que a
> escala bater."

**Regra:** Cada rede tem KPI separado. O cruzamento é feito por escala — se a placa
aparece em 2 escalas (uma por rede), gera 2 rotas distintas (uma em cada KPI).
Se aparece em só 1 escala, considera só essa.

---

## ✅ P2 — Placa que entregou mas não está na escala

> "Se não tiver na escala, você ignora. Simples."

**Regra:** Placa sem escala daquele dia → não vira rota. As paradas dela no Unitrac
são ignoradas pra fim de KPI.

---

## ✅ P3 — Placa que ficou só na BASE o dia todo

> "Só ficou na base inteiro? Você coloca como NÃO FOI ao cliente.
> Bota como NÃO FOI o cliente."

**Regra:** Placa na escala + só paradas BASE no Unitrac → rota gerada com status
"não foi" / "sem entrega". Não é ignorada (porque está na escala), mas marca
explicitamente como não-entrega.

---

## ⏳ Pendentes (aguardar próximo áudio)

- P4 — Placa que rodou só em outra região (FORA_BASE/ROTA Cantagalo, etc.) — é nossa?
- P5 — Placa que chegou madrugada na loja — entrega normal ou pernoite?
- P6 — Lojas cadastradas com coord = BASE Benassi — erro do cliente?
- P7 — Placa entrou/saiu da BASE 4 vezes — qual saída conta como CD?
- P8 — Assai e Sendas no mesmo endereço — uma loja ou duas?
