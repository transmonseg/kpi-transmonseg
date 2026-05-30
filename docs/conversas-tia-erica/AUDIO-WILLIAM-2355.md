# Áudio William (via Tia Erica) — 27/05 23:55 — explicação técnica do bug Unitrac

> William é o ex-responsável pelo KPI. Ele explica COMO o Unitrac decide qual nome de loja mostrar no relatório quando há cadastros sobrepostos.

## Transcrição

> "Cara, é o que eu te falo, infelizmente, enquanto não tiver uma assertividade aí dentro do cadastro, fazer uma automação fica muito ruim, porque você tem que picotar muita coisa. E pode acabar dando mais problema do que já dá.
>
> Isso aí, cara, é tudo por falta de cadastro. A hora que fizer o cadastro certinho, vai bater lá certinho. Entendeu?
>
> Tanto que esse aí que você mandou, o de cima, que tem aí... o maiorzinho que você mandou antes desse último. Tu viu que tem uma hora aqui, tem um **Sendas Bangu primeiro, antes do Regina Lúcia Meira, por quê? Esse caminhão, ele foi na Sendas Bangu.**
>
> Então, **quando o rastreador identifica que ele está no cliente que tem a marcação, ele vai lá para o início.**
>
> Tu pode ver aqui, tá? Base Benassi. Enquanto tá Base Benassi, é porque ele tá dentro da base. Aí ele saiu. **Quando ele sai, o local de parada, que NÃO TEM PONTO DE MARCAÇÃO, ele aparece TUDO que tá na observação.**
>
> Então tu repara que foi Base Benassi, Base Benassi, Base Benassi, três vezes. Aí depois, Regina Lúcio Meira, Abastecedora Rei do Grão e Manoel Vargem Grande. **Isso aqui ele estava na rua, indo em direção ao Sendas de Bangu.**
>
> Aí ele chegou no Sendas de Bangu. Aí embaixo está o Sendas de Bangu, Loja 55.
>
> Aí repete de novo. Regina Lúcio Meira. Aí ele volta pra base de novo. Aí Base Benassi, Base Benassi, Base Benassi. Aí ele vai pra rua. Aí fica Regina Lúcio Meira, Regina Lúcio Meira, Regina Lúcio Meira. Aí depois ele volta pra base. Aí base, base, base. Depois ele volta pra rua de novo. E depois lá no final base de novo.
>
> Então **quando tem um ponto marcado certinho, ele para de aparecer desse jeito aí.**
>
> Então assim, **é erro de cadastro. Tem que acertar o cadastro.**"

---

## 🎯 EXPLICAÇÃO TÉCNICA EXTRAÍDA (CHAVE PRO MATCHER)

### Como o Unitrac mostra nome de loja:

| Situação | O que o Unitrac mostra |
|----------|------------------------|
| Caminhão DENTRO de cliente com geofence cadastrado correto | Nome real da loja (ex: "Sendas Bangu Loja 55") |
| Caminhão DENTRO da BASE | "Base Benassi" |
| Caminhão FORA de qualquer geofence cadastrado (rodando na rua) | **Mostra TODOS os nomes que estão na observação** (cadastros sobrepostos genéricos) |

### Por que aparecem múltiplas redes no mesmo ponto:

Não é que a loja esteja cadastrada lá — **é que o caminhão está EM TRÂNSITO** e o Unitrac, sem ponto de marcação correto, **lista todos os clientes que têm "observação" cobrindo aquela região**.

Quando o caminhão ENTRA num cliente com cadastro certo (Sendas Bangu), o relatório mostra o cliente real. Quando SAI, volta a mostrar os "observações" da rota.

### Conclusão pro nosso sistema:

**As paradas com classificação FORA_BASE + nome tipo "Regina Lúcio Meira / Abastecedora Grão / Emanuel Vargem Grande"** não significam que o caminhão entregou nessas lojas — significa que o caminhão estava **EM TRÂNSITO numa rota** e o Unitrac listou os cadastros da "observação" como local_parada.

Isso bate com o que estamos vendo:
- Paradas FORA_BASE com nomes de várias lojas no mesmo cluster (Rua Charles)
- O cliente está em trânsito, não entregando

→ **Confirma que T20 (descartar paradas LOJA com cod cadastrado em coord errada) está certo.**
→ **Cuidado com T22**: se a parada FORA_BASE tá num cluster sobreposto e o cliente está em TRÂNSITO, não devemos converter pra LOJA. T22 só deve atuar quando a parada **realmente** está na loja física (lat/lng exato do cadastro, não cluster de cadastros falsos sobrepostos).

### Recomendação do William:
> "Enquanto não tiver assertividade no cadastro, fazer automação fica muito ruim. Você tem que picotar muita coisa. Pode acabar dando mais problema do que já dá."

**Tradução**: não tentar consertar cadastros errados via heurística — pedir pra Benassi corrigir cadastro no Unitrac.
