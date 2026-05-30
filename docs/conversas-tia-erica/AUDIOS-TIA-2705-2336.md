# Áudios Tia Erica + William (27/05 23:22 → 23:42)

Conversa em paralelo: Joaquim (eu) ⇄ Tia Erica ⇄ William (ex-responsável pelo KPI).
Confirmação: **vários problemas estão no cadastro INTERNO do Unitrac, não no nosso sistema.**

---

## Cronologia

### 23:22:27 — Tia
> "Eu acho que a fórmula está puxando de alguma coisa errada, porque mesmo que gerem PDF, não tem como puxar repetido."

### 23:23:11 — Tia (1ª dúvida sobre cadastros sobrepostos)
> "Não, não é repetido. Por exemplo, em um local só de parada, ter ao mesmo tempo aqui Base Benassi, Regina Lúcio, Abastecedora do Grão da Serra e Emanuel Vargem Grande. Isso é uma das dúvidas. Quando gera KPI, isso tudo aqui eu considero como locais diferentes, mesmo sendo o mesmo endereço? É essa a primeira dúvida."

### 23:24:46 — Tia
> "Só que eu acho que isso é específico de uma rede só."

### 23:25:17 — Tia
> "Não, mas elas não são o mesmo endereço não. Aí está como local de entrega, uma coluna anterior tem os endereços. Só que isso aí é alguma coisa cadastrada errada com nome de entrega."

### 23:26:55 — Tia (exemplo concreto: Rua Charles)
> "Ok, então por exemplo, o primeiro endereço que tem aqui é o endereço Rua Charles, aí tem local da parada Base Benassi, aí tem Regina Lúcio, a base tesoura do Grão da Serra, Emanuel Vargem Grande. Se a placa tiver que pegar alguma informação daqui, ela vai considerar como? Porque Emanuel é uma das redes, né? Só que aqui também está a base Benassi. Ele vai considerar que isso aqui é uma saída... é uma local parada na base. Ou no Emanuel? Ou é tudo o mesmo lugar? Essa aqui eu ainda não consegui entender."

### 23:27:57 — Tia (confirmação: cadastro errado no Unitrac)
> "Não, não é o mesmo lugar. Você pode ver que os endereços são diferentes, mas se fizeram algum cadastro dentro do endereço, é alguma coisa interna da Unitrac."

### 23:28:13 — Tia
> "A maioria, o cliente é Armazém do Grão, não é isso?"

### 23:28:40 — Tia
> "É, o Armazém do Grão aparece em todos."

### 23:30:41 — Tia (consultou o William)
> "Joaquim, eu tô conversando com o menino que fazia KPI. Ele que cadastrou alguma coisa errada internamente dentro da Unitrack. Você pode ver que a maioria é só esse cliente que tá dando isso."

### 23:34:24 — Tia (confirmação técnica do William)
> "Pelo que o William está me falando aqui, a gente não vai conseguir fazer automação não. Ele está mandando de outro cliente aqui. Quem faz os cadastros é a própria cliente. Isso está internamente dentro do Netrack. Agora o que me espanta é que **ele puxa a geolocalização da rua, mas o nome é outro**."

### 23:36:45 — Tia
> "É doideira mesmo, estranho."

### 23:36:57 — Tia (descrição técnica do bug do Unitrac)
> "Então, o rastreador puxa a posição, mas a questão da API, ela está sobrepondo independente do rastreador, por quê? Lá, quando coloca isso, se você olhar aí na parte de baixo ali, tem veículo e rota no final lá. Esse rota aí entra ali no local de parada. Eu não sei porquê, nem como, mas **a API entende aquilo ali e está colocando aquilo ali em vez de deixar vazio**. Aí é caso interno lá, que eu já bati com você desde o início. Tem que ver como é que é o sistema deles interno para poder ver se dá para corrigir. Eles têm que acertar lá pra gente poder puxar o relatório certo. Senão realmente não vai puxar."

### 23:40:19 — Tia
> "Vou precisar chamar a Benassi. Pelo que o William está me falando aqui, vou ter que chamar ele para alteração de cadastro."

### 23:40:33 — Tia (resumo do que funciona vs falha)
> "É, o tanto que eu tava estranhando, porque é o seguinte, o sistema que a gente tá desenvolvendo, né, ele puxava, por exemplo, **Princesa batia, certo? Carrefour às vezes ia certo, praticamente certo. Prezunic ia... O Guanabara tava indo... Porém, o Armazém do Grão. O Emanuel. O... Tinha mais um que também não ia de jeito nenhum**. Esqueci qual era agora. Não iam que é exatamente esses que a gente está percebendo um erro."

### 23:41:21 — Tia
> "Porque o sistema tá puxando certinho quando tá certo. Por exemplo, o Princesa, quando tá lá, o Benassi e o local, ele puxa certinho, mas tava com essa onda aí. E essa coisa de rota, também tava me deixando... O tanto que eu te perguntei sobre essas rotas, só que uma região ampla. Se dentro dessa região ampla, eu consideraria como chegada e local... isso que eu também não tinha entendido. Mas pelo que parece, é erro, né?"

### 23:42:27 — Tia
> "Então, na verdade, o Dom Emanuel não está cadastrado no sistema."

### 23:42:30 — Tia (caso Assai/Sendas mesmo código — explicação da P8)
> "Um exemplo, todas as lojas tem um código de cadastro, que fica antes do que eu te falei. **Tem um que, por exemplo, o Assai Freguesia está com o mesmo código do Sendas, no mesmo lugar**. É um outro erro que eu acho que tem a ver com isso aí, que eu reparei que eu achei que podia ser só coisa na minha cabeça, mas é real. Então é uma coisa real. Por exemplo, Assai Freguesia, que eu acho que é uma loja com o mesmo código, ou seja, **a mesma localização de uma das Sendas**."

---

## Conclusões-chave

### 1. Diagnóstico OFICIAL: cadastro errado é DO UNITRAC, não nosso
- **Quem cadastra**: o cliente (rede) cadastra suas lojas no Unitrac
- **Quem fazia KPI antes**: William (consultou agora)
- **Confirmação dele**: "Não vai conseguir fazer automação não, isso está internamente dentro do Unitrack"
- **A Tia vai pedir alteração de cadastro** chamando a Benassi

### 2. Redes que funcionam vs falham

| Funciona | Falha |
|----------|-------|
| **Princesa** (bate) | **Armazém do Grão** ⚠️ |
| **Carrefour** (quase sempre certo) | **Emanuel** ⚠️ |
| **Prezunic** | (esqueceu mais um) |
| **Guanabara** | |

→ Coincide exatamente com os clientes que cadastram errado no Unitrac.

### 3. Bug específico do Unitrac descoberto:
- **Mesma coordenada GPS, nomes diferentes**: a rua Charles tem **Base Benassi + Regina Lúcio + Abastecedora Grão da Serra + Emanuel Vargem Grande** TODOS no mesmo endereço — porque o cliente cadastrou mais de uma loja no mesmo geofence.
- **API do Unitrac sobrepõe rota independente do rastreador**: "está colocando aquilo ali em vez de deixar vazio" — bug da própria Unitrac.
- **Geolocalização correta + nome errado**: o GPS bate, mas o nome da loja que aparece é outro.

### 4. Caso Assai/Sendas mesmo código (P8 respondida):
- **Assai Freguesia tem o MESMO código de uma Sendas** no Unitrac
- É bug de cadastro do cliente — mesma localização, mesmo código, redes diferentes
- "É uma loja com o mesmo código, ou seja, a mesma localização de uma das Sendas"

### 5. Dom Emanuel não cadastrado no sistema:
- Confirmado: "Dom Emanuel não está cadastrado no sistema"

---

## Implicações pro nosso sistema

### O que NÃO devemos tentar consertar (não é nosso bug):
1. Geofences sobrepostos (cliente cadastra várias lojas no mesmo endereço)
2. Nome de loja errado vs GPS correto (Unitrac bug interno)
3. Códigos duplicados entre redes diferentes (cliente erra)

### O que JÁ está sendo bem tratado pela gente:
- T20: paradas LOJA com geofence sobreposto → re-mapeia pela proximidade física do cadastro
- T20-BASE: paradas em região da BASE Benassi → sempre BASE
- T22 (recém adicionado): FORA_BASE com GPS no raio do cadastro → vira LOJA

### Redes onde focar testes (porque o cadastro do cliente é ruim):
- **ARMAZEM_GRAO** ⚠️
- **EMANUEL** ⚠️
- (a "esquecida" — provavelmente SENDAS/ASSAI por causa do código duplicado)

### Próxima ação da Tia:
- Pedir à Benassi (Unitrac) pra acertar os cadastros
- Aguardar correção do lado do cliente
