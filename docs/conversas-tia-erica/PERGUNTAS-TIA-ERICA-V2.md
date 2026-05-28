# Perguntas pra Tia Erica — exemplos concretos do Unitrac dia 19

> Tia, olha só, eu peguei o relatório do Unitrac do dia 19/05 e separei algumas situações que apareceram lá. Pra eu fazer a planilha igualzinha você faria, preciso entender essas 8 coisas. Sempre que possível eu coloquei a página do relatório e a placa pra você achar fácil.

---

## 1. Placa que faz 2 REDES diferentes no mesmo dia

**Exemplo 1 — página 60, placa KOP-4978 (motorista MILTON):**
Saiu da BASE de manhã, foi pra **Prezunic Cidade de Deus**, depois foi pra **Zona Sul Loja 18 e Loja 20**. Ou seja: 1 placa fez Prezunic + Zona Sul no mesmo dia.

**Exemplo 2 — página 119, placa LKW-2B80 (motorista ALEX):**
Fez **Zona Sul Loja 18** e depois foi pro **MEGA BOX Olaria** (que é endereço da Zona Sul também).

**❓ Tia, quando uma placa atende DUAS REDES no mesmo dia, como fica?**
- É 2 KPIs (uma pra cada rede)?
- Conta como 2 entregas separadas?
- Ou é tudo junto na rede principal?

---

## 2. Placa que entregou mas NÃO ESTÁ NA ESCALA daquele dia

**Exemplo 1 — página 28, placa CPI-4C84:**
Essa placa NÃO aparece na escala do dia 19, mas o Unitrac mostra ela em **Sendas Mendanha**.

**Exemplo 2 — página 198, placa GBG-5C11:**
Também NÃO está na escala dia 19, mas atendeu **Sendas Mesquita**.

**❓ Tia, quando uma placa entrega e não tá na escala, o que isso significa?**
- É placa substituta (a original quebrou)?
- É reforço de última hora?
- Eu conto essa entrega ou ignoro?

---

## 3. Placa que ficou SÓ NA BASE o dia inteiro

**Exemplo 1 — página 14, placa LAS-0711:**
Passou 24h dentro da BASE Benassi (Av Brasil 9561, Olaria). Não saiu nenhuma vez.

**Exemplo 2 — página 17, placa LPI-1E68:**
Mesma coisa, ficou na BASE o dia todo.

**❓ Tia, quando a placa só fica na BASE e não vai pra nenhuma loja, o que conto?**
- Marco como "NÃO FOI" / "NÃO SAIU"?
- Ou conto saída_CD em branco?
- Ou nem entra no relatório?

---

## 4. Placa que só passa em LUGAR FORA DA NOSSA REGIÃO (FORA_BASE)

**Exemplo 1 — página 20, placa SRQ-9F05:**
Não passou pela BASE, não foi em loja nossa. O Unitrac mostra ela em **CANTAGALO (interior do RJ)** — bem longe da nossa região.

**Exemplo 2 — página 198, placa LRA-9C40:**
Mesma coisa — rodando em outra região, fora das nossas redes.

**❓ Tia, essas placas são nossas?**
- É outro contrato da Triforce (que não esse aqui)?
- Devo ignorar elas?
- Ou aparecem no Unitrac mas não fazem parte do nosso serviço?

---

## 5. Placa que chega na LOJA de MADRUGADA (antes de 6h)

**Exemplo 1 — página 79, placa KVH-9J42 (motorista MARCIO):**
Chegou na **Zona Sul Loja 04** às **4:30 da manhã**.

**Exemplo 2 — página 76, placa KUL-1425 (motorista FELIPE):**
Chegou na **Prezunic Vila Isabel** às **3:50 da manhã**.

**❓ Tia, quando a placa chega na loja super cedo (madrugada), conta como entrega normal?**
- Ou é "pernoite" (dormiu lá pra começar de manhã)?
- A janela da loja abre cedo assim mesmo?
- Como diferencio "entrega" de "estacionamento pra esperar abrir"?

---

## 6. Cadastros que estão com COORDENADA IGUAL DA NOSSA BASE

Quando olhei o cadastro de algumas lojas no Unitrac, achei isso:

- **EMANUEL CACHAMORRA** (cod 17659002) → cadastrada exatamente em -22.828, -43.338 que é **MEGA BOX Olaria** (nossa BASE!)
- **O BOM CAMPO GRANDE** (cod 17659001) → mesma coisa, lat/lng = BASE
- **EMANUEL VARGEM GRANDE** (cod 17659003) → idem, BASE
- **REDE ECONOMIA SANTA MARIA** (cod 25140000) → idem

Aí toda vez que a placa entrava na nossa BASE pra carregar, o sistema pensava que ela estava entregando NESSAS LOJAS (porque o ponto deles era igual o nosso).

**❓ Tia, isso é erro do cliente ter cadastrado a loja deles com o endereço da nossa BASE no Unitrac?**
- Eles erram o cadastro?
- A gente pode pedir pra corrigir?
- Ou tem outra explicação?

---

## 7. Placa que entra e sai VÁRIAS VEZES da BASE no mesmo dia

**Exemplo — página 60, placa KOP-4978:**
Essa placa entrou e saiu da BASE 4 vezes no dia 19. Saiu 6h, voltou 10h, saiu 14h, voltou 18h, saiu 22h.

**❓ Tia, qual saída da BASE conta como "saída do CD" pro KPI?**
- A primeira saída do dia?
- A última?
- Cada saída vira uma rota separada?

---

## 8. Quando ASSAI e SENDAS compartilham o MESMO endereço

**Exemplo — página 24, placa AKZ-2594 (motorista NILTON):**
Foi pra "**Assai Freguesia**" com código de loja 560019. Mas esse código também aparece como **Sendas** no cadastro, no mesmo lugar físico.

**❓ Tia, Assai e Sendas têm lojas em PRÉDIOS COMPARTILHADOS?**
- É a mesma loja com 2 fachadas?
- O sistema deve contar como Assai OU Sendas?
- Ou as duas?

---

## Resumo das 8 dúvidas (versão curta, se quiser pular):

1. Placa fez 2 redes (Prezunic + ZS) — vira 2 KPIs?
2. Placa entregou e não tá na escala — substituta?
3. Placa só ficou na BASE — não foi?
4. Placa rodou em outra região — outro contrato?
5. Placa chegou madrugada na loja — entrega ou pernoite?
6. Lojas com cadastro no MESMO ponto da BASE — erro do cliente?
7. Placa entra/sai da BASE 4 vezes — qual saída conta?
8. Assai e Sendas no mesmo endereço — uma loja ou duas?
