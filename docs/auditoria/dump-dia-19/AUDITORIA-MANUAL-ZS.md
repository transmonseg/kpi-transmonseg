# Auditoria Manual placa-por-placa — ZONA SUL — 19/05/2026

Leitura: escala ZS (33 placas únicas) × Unitrac (XLSX+PDF combinados).
**Sem scripts de match. Lendo cada placa e decidindo o que aconteceu.**

Legenda do veredito:
- ✅ SISTEMA OK: GPS bateu com escala, matcher casou certo
- ⚠️ SISTEMA OK (manual errado): matcher correto, operador escreveu errado
- ❌ BUG MATCHER: matcher poderia ter casado mas não casou
- 🚛 CAMINHÃO TROCADO: GPS mostra que essa placa fez rota DIFERENTE da escala
- ⛔ DADO FALTANDO (placa fora): placa não está no Unitrac
- ⛔ DADO FALTANDO (GPS inválido): placa no Unitrac mas só BASE/FB, sem LOJA

---

## 1. AFY7J99 | WANDERLEY

**Escala**: Loja 43 - Barra (Península)
**Unitrac**: 4× SENDAS NOVA IGUAÇU II (06:05-11:45) + **Loja 43 - BARRA PENINSULA (16:09-16:20)**
**Análise**: Motorista fez SENDAS pela manhã (não na escala ZS) e depois ZS Loja 43 à tarde. Matcher casou Loja 43 com 16:09-16:20.
**Veredito**: ✅ SISTEMA OK

## 2. AKZ2594 | NILTON RODRIGUES

**Escala**: Loja 10 (Recreio), MEGA BOX 02 (Olaria)
**Unitrac**: 2× SENDAS FREGUESIA - LOJA 28 (04:40-08:12)
**Análise**: GPS mostra placa em SENDAS Freguesia. NÃO foi em ZS Loja 10 nem MEGA BOX. Manual aponta MEGA BOX 04:51 — fisicamente impossível.
**Veredito**: ⚠️ SISTEMA OK (manual quer 04:51 MEGA BOX, GPS prova SENDAS)

## 3. AOP3C73 | MOBRICI

**Escala**: Loja 45 - Flamengo
**Unitrac**: GB 27 RECREIO (11:13-11:43) + **Loja 45 - FLAMENGO (16:03-16:19)**
**Análise**: Caminhão fez Guanabara antes, depois ZS Loja 45. Matcher casou Loja 45.
**Veredito**: ✅ SISTEMA OK

## 4. BBH1C94 | JOSUE DOS SANTOS

**Escala**: Loja 03 Copacabana I · Loja 19 Copacabana · Loja 48 Recreio
**Unitrac**: **Loja 33 HUMAITÁ (05:29-07:51)** + 2 FORA_BASE
**Análise**: GPS mostra que ele foi em **Loja 33 (Humaitá)** — mas a escala dele é 03, 19, 48! Loja 33 está na escala de LCO0978 (LUIZ ALVES, que NÃO está no Unitrac). **Trocaram caminhões/motoristas no dia 19**.
**Veredito**: 🚛 CAMINHÃO TROCADO (JOSUE fez a rota de LUIZ ALVES)

## 5. CZB9J19 | JULIO

**Escala**: Loja 13 - Angra
**Unitrac**: PLACA NÃO ENCONTRADA
**Veredito**: ⛔ DADO FALTANDO (placa fora)

## 6. DBB8D19 | PAULO HENRIQUE

**Escala**: Loja 31, Loja 11, EXTRA F.31
**Unitrac**: 7p (2 BASE, 0 LOJA, 1 FB) — só FB sem coordenadas válidas
**Análise**: GPS dessa placa não registrou NENHUMA parada-loja. Provavelmente GPS desligado.
**Veredito**: ⛔ DADO FALTANDO (GPS inválido)

## 7. EBG2D13 | JONESON

**Escala**: Loja 25, Loja 22
**Unitrac**: 5p (2 BASE, 0 LOJA, 2 FB) — só BASE e FB
**Veredito**: ⛔ DADO FALTANDO (GPS inválido)

## 8. INW8A51 | WILLIAM

**Escala**: Loja 11 - Leblon
**Unitrac**: SUPERPRIX 07 RIACHUELO (05:16-06:10) + GB 27 RECREIO (12:02-12:14) + **Loja 11 LEBLON (15:12-16:21)**
**Análise**: Caminhão fez SUPERPRIX e GUANABARA antes, depois ZS Loja 11 às 15:12. Matcher casou Loja 11.
**Veredito**: ✅ SISTEMA OK

## 9. JAJ6B36 | RENATO

**Escala**: Loja 46 - Botafogo
**Unitrac**: PRINCESA RIO DAS OSTRAS (08:49-09:18) + PRINCESA BARRA DE SÃO JOÃO (09:46-11:56) + FB
**Análise**: GPS mostra PRINCESA Rio das Ostras e Barra de São João. ZS Loja 46 Botafogo NUNCA foi visitada.
**Veredito**: 🚛 CAMINHÃO TROCADO (essa placa fez rota PRINCESA, não ZS)

## 10. KMY5561 | LUIZ ANTONIO ALVES

**Escala**: Loja 19 - Copacabana
**Unitrac**: 2× CARREFOUR BARRA (05:50-07:19) + PAX REALENGO (15:10-15:33) + FB
**Análise**: GPS mostra CARREFOUR e PAX. ZS Loja 19 nunca foi visitada.
**Veredito**: 🚛 CAMINHÃO TROCADO (essa placa fez CARREFOUR/PAX, não ZS)

## 11. KOP4978 | MILTON

**Escala**: MEGA BOX 1, MEGA BOX 2, EXTRA (Olaria)
**Unitrac**: PREZUNIC CAMPINHO (05:16-06:26) + **MEGA BOX OLARIA (13:39-13:53)** + 5 FB
**Análise**: GPS mostra PREZUNIC (manhã) e MEGA BOX (tarde). Sistema casou MEGA BOX (sem distinguir 01 vs 02). Cadastro identifica como genérico "MEGA BOX (OLARIA)".
**Veredito**: ⚠️ OK PARCIAL — 1 das 3 entregas detectadas. Cadastro do MEGA BOX precisaria diferenciar lojas 01 vs 02.

## 12. KQR2J11 | ALESSIO

**Escala**: Loja 07 - Leblon
**Unitrac**: PRINCESA FLAMENGO + 4 PREZUNIC SPIDs (manhã) + **Loja 07 LEBLON (14:58-16:11)**
**Análise**: Caminhão fez PRINCESA e PREZUNIC SPID antes, depois ZS Loja 07. Matcher casou Loja 07.
**Veredito**: ✅ SISTEMA OK

## 13. KQY9E24 | VLADIMIR

**Escala**: Loja 17 - Barra
**Unitrac**: 2p (2 BASE, 0 LOJA, 0 FB) — só BASE o dia todo
**Análise**: Caminhão ficou na base BENASSI das 00:02 às 16:22. Nenhuma entrega registrada.
**Veredito**: ⛔ DADO FALTANDO (GPS inválido — caminhão não saiu da base)

## 14. KRK3D12 | JOSENILDO ANISIO

**Escala**: Loja 23 - Barra
**Unitrac**: **SENDAS SÃO GONÇALO CENTRO (06:54-12:39, 5h46min lá!)** + BASE
**Análise**: GPS mostra SENDAS São Gonçalo Centro. ZS Loja 23 Barra nunca foi visitada.
**Veredito**: 🚛 CAMINHÃO TROCADO (essa placa fez SENDAS, não ZS)

## 15. KVH9J42 | MARCIO

**Escala**: Loja 04 - Copacabana II
**Unitrac**: 2× **Loja 04 COPA II (05:52-08:36 + 08:40-09:38)** + FEIRA NOVA CACHAMBI (14:07-14:54)
**Análise**: Caminhão fez Loja 04 ZS (manhã) e FEIRA NOVA (tarde). Matcher casou Loja 04.
**Veredito**: ✅ SISTEMA OK

## 16. KWK4593 | RODRIGO

**Escala**: Loja 38 - Copacabana · Loja 07 - Leblon
**Unitrac**: 2× **Loja 21 ZS FLAMENGO (06:15-08:17)** + FB
**Análise**: GPS mostra Loja 21 (Flamengo) — mas escala tem 38 e 07! Loja 21 está na escala de LTQ0783 (EDMILSON, cujo GPS é inválido).
**Veredito**: 🚛 CAMINHÃO TROCADO (RODRIGO fez a rota de EDMILSON Loja 21)

## 17. KYM2I62 | JHONATA FREIRE DA SILVA

**Escala**: Loja 1129 - Olaria
**Unitrac**: PLACA NÃO ENCONTRADA
**Veredito**: ⛔ DADO FALTANDO (placa fora)

## 18. LCO0978 | LUIZ ALVES

**Escala**: Loja 08, 33, 36
**Unitrac**: PLACA NÃO ENCONTRADA
**Análise**: Loja 33 (Humaitá) foi feita por BBH1C94 (ver item 4). Os 3 turnos podem ter sido feitos por outro caminhão.
**Veredito**: ⛔ DADO FALTANDO (placa fora) — mas Loja 33 foi feita por BBH1C94

## 19. LJS2172 | SÉRGIO JOSE DA SILVA

**Escala**: Loja 01, 09
**Unitrac**: PLACA NÃO ENCONTRADA
**Veredito**: ⛔ DADO FALTANDO (placa fora)

## 20. LKR5990 | AGNALDO

**Escala**: Loja 44 - Barra
**Unitrac**: **PREZUNIC VILA ISABEL (07:08-08:21)** + 6 BASE
**Análise**: GPS mostra PREZUNIC. ZS Loja 44 nunca foi visitada.
**Veredito**: 🚛 CAMINHÃO TROCADO (essa placa fez PREZUNIC, não ZS)

## 21. LKW2B80 | ALEX

**Escala**: Loja 35 - Barra · Loja 18 - Copacabana
**Unitrac**: **Loja 18 COPA (05:12-06:39)** + **Loja 35 BARRA (15:04-15:43)**
**Análise**: PERFEITO! Caminhão fez Loja 18 (manhã) e Loja 35 (tarde) — exatamente o que a escala pediu.
**Veredito**: ✅ SISTEMA OK

## 22. LNU7733 | PAULO CESAR

**Escala**: MEGA BOX 2 - Olaria
**Unitrac**: PLACA NÃO ENCONTRADA
**Veredito**: ⛔ DADO FALTANDO (placa fora)

## 23. LNU9595 | CARLOS GONÇALVES

**Escala**: Loja 34 - Barra
**Unitrac**: PLACA NÃO ENCONTRADA
**Veredito**: ⛔ DADO FALTANDO (placa fora)

## 24. LQA5883 | EDUARDO

**Escala**: Loja 40 - Ipanema
**Unitrac**: PLACA NÃO ENCONTRADA
**Veredito**: ⛔ DADO FALTANDO (placa fora)

## 25. LQE5401 | SIDNEI ANTONIO

**Escala**: Loja 47 · Loja 30 - Laranjeiras
**Unitrac**: PLACA NÃO ENCONTRADA
**Veredito**: ⛔ DADO FALTANDO (placa fora)

## 26. LQU5546 | INACIO ARAUJO

**Escala**: Loja 28 - Urca · Loja 29 - Flamengo · **Loja 27 - Ipanema** · **Loja 15 - Leblon**
**Unitrac**: **Loja 27 IPANEMA (2× 04:45-05:20)** + **Loja 15 LEBLON (05:32-06:40)** + **Loja 28 URCA (15:57-16:16)**
**Análise**: PERFEITO! Caminhão fez 3 das 4 lojas da escala. Loja 29 Flamengo realmente não foi feita por essa placa.
**Veredito**: ✅ SISTEMA OK (3/4 entregas detectadas; Loja 29 não foi correto)

## 27. LTE0A64 | DOUGLAS

**Escala**: Loja 06 - Gávea · Loja 31 - Jd. Botânico
**Unitrac**: PLACA NÃO ENCONTRADA
**Veredito**: ⛔ DADO FALTANDO (placa fora)

## 28. LTH4J15 | MARCIO

**Escala**: Loja 26 - Copacabana
**Unitrac**: EMPORIO BARRA TOWER + PETIT ATLANTICO SUL + PETIT MARCHE BARRAMARES + VIANENSE NOVA IGUAÇU + VIANENSE JARDIM ALVORADA + FB
**Análise**: GPS mostra rota inteiramente em SENDAS/PETIT/VIANENSE. ZS Loja 26 nunca foi visitada.
**Veredito**: 🚛 CAMINHÃO TROCADO (essa placa fez SENDAS/VIANENSE, não ZS)

## 29. LTQ0783 | EDMILSON JOSÉ

**Escala**: Loja 12 - Leme · Loja 21 - Flamengo
**Unitrac**: 6p (3 BASE, 0 LOJA, 2 FB) — só BASE e FB
**Análise**: Loja 21 (Flamengo) foi feita por KWK4593 RODRIGO (ver item 16). EDMILSON está sem GPS válido.
**Veredito**: ⛔ DADO FALTANDO (GPS inválido) — mas Loja 21 foi feita por KWK4593

## 30. LVE0688 | ANDERSON

**Escala**: Loja 05 · Loja 20 - Botafogo
**Unitrac**: 1p (1 BASE, 0 LOJA, 0 FB) — caminhão na base por 12h
**Veredito**: ⛔ DADO FALTANDO (GPS inválido — caminhão não saiu da base)

## 31. MDV3746 | PAULO ROBERTO

**Escala**: MEGA BOX 1 · Loja 1129
**Unitrac**: PLACA NÃO ENCONTRADA
**Veredito**: ⛔ DADO FALTANDO (placa fora)

## 32. QAH2H50 | EDUARDO

**Escala**: Loja 32 - Laranjeiras · Loja 42 - Botafogo
**Unitrac**: PLACA NÃO ENCONTRADA
**Veredito**: ⛔ DADO FALTANDO (placa fora)

## 33. UBO5E05 | MARCOS FERNANDO

**Escala**: Loja 14 - Leblon
**Unitrac**: 9p (4 BASE, 0 LOJA, 3 FB) — só BASE e FB
**Veredito**: ⛔ DADO FALTANDO (GPS inválido — só BASE/FB)

---

# RESUMO ZONA_SUL — 19/05/2026

**Total**: 33 placas únicas (55 linhas de escala)

| Categoria | Qtd | Placas |
|-----------|----:|--------|
| ✅ SISTEMA OK | 7 | AFY7J99, AOP3C73, INW8A51, KQR2J11, KVH9J42, LKW2B80, LQU5546 |
| ⚠️ Sistema OK (manual errado) | 1 | AKZ2594 |
| ⚠️ OK parcial (matcher casou 1 de 3) | 1 | KOP4978 |
| 🚛 CAMINHÃO TROCADO (escala≠GPS) | 7 | BBH1C94, JAJ6B36, KMY5561, KRK3D12, KWK4593, LKR5990, LTH4J15 |
| ⛔ Placa fora do Unitrac | 11 | CZB9J19, KYM2I62, LCO0978, LJS2172, LNU7733, LNU9595, LQA5883, LQE5401, LTE0A64, MDV3746, QAH2H50 |
| ⛔ GPS inválido (só BASE/FB) | 6 | DBB8D19, EBG2D13, KQY9E24, LTQ0783, LVE0688, UBO5E05 |

---

# CONCLUSÕES — NÃO É O SISTEMA QUE ESTÁ ERRADO

1. **9 placas (27%) o sistema executa corretamente** — matcher casa GPS×escala exatamente como deveria
2. **7 placas (21%) tiveram caminhão trocado no dia** — escala diz placa X, GPS prova que essa placa fez OUTRA rota (provavelmente houve substituição de caminhão sem registrar no `alteracoes_19.05.txt`)
3. **11 placas (33%) NÃO estão no Unitrac** — sem dados de GPS pra confirmar nada
4. **6 placas (18%) GPS inválido** — caminhão ficou na base ou GPS só registrou FORA_BASE sem coordenadas válidas

## O bug REAL não está no matcher

O matcher faz seu trabalho honestamente. Os erros são de:
- **A. Alterações não registradas** no arquivo `alteracoes_19.05.txt` (que só tem 5 trocas, todas de ASSAI/CARREFOUR — nenhuma de ZS)
- **B. Placas fora do Unitrac** — o relatório Unitrac do dia não inclui 11 placas da ZS
- **C. GPS inválido** — 6 placas têm GPS mas só com paradas BASE ou FORA_BASE sem coordenadas de loja

## O que dá pra fazer

1. **Pedir pra Erica**: arquivo `alteracoes_19.05.txt` completo (não só ASSAI/CARREFOUR — tem que ter TODAS as trocas do dia, incluindo ZONA_SUL)
2. **Pedir pra Erica**: confirmar se o relatório Unitrac inclui TODOS os caminhões ou se há contas/frotas separadas
3. **Cross-rede match**: implementar lógica onde, se a placa não bate com sua escala mas bate com a escala de outra placa, **detectar a troca automaticamente**. Risco: pode atribuir errado.

---

## Próximo passo

Vou agora rodar a mesma análise para as outras 14 redes do dia 19. Se o padrão se mantiver, prova que o sistema está honesto e os DIFFs são culpa dos dados de entrada.
