# Correções da verificação manual de 24/09 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir os pendentes do KPI Nutry Max sem criar falso positivo: Pão com cidade certa, GPS congelado fora da conta, "não foi" só quando a placa não passou perto, escala divergente sinalizada em vez de acusar o motorista, e 32 coordenadas corrigidas.

**Architecture:** KPI (`src/lib/kpi-romaneio/*`, route nutrimax + CLI). Regras novas opt-in só Nutry Max (padrão das opções existentes de `montarDetalheEntregas`). Correções de coordenada gravadas no `kpi_romaneio_geocode_cache` só no deploy (Task 6).

**Tech Stack:** TypeScript, Vitest, Python (trava).

**Spec:** verificação manual `~/ClaudeGerado/kpi-regen-0922/verificacao-nao-foi-24-09.csv` (83 NFs de 24/09 classificadas), correções `~/ClaudeGerado/kpi-regen-0922/correcoes-geocode-24-09.csv` (32), análise do Pão `~/ClaudeGerado/kpi-regen-0922/analise-pao-24-09.md`, decisões do usuário 26/09: "não existe troca de caminhão"; "placa sem rastreador sai do KPI"; "não foi" precisa ser verificado.

## Global Constraints

- Nunca explicar nada como "outra placa entregou" na Nutry Max.
- Fuso: convenção existente (dígitos BRT + 'Z' no KPI; ponte UTC real). Sem conversão nova.
- Rio Quality idêntico (opções desligadas por padrão).
- Trava obrigatória antes de deploy: `python3 scripts/verificar-kpi-gabaritos.py <22> <23> <24> --gabarito-ana ~/ClaudeGerado/kpi-regen-0922/ana/3EB03B05595E016C8E5F85_Validacao_Romaneio_Paradas_KPI_22-09-2026.xlsx` sai 0; gabarito Ana 22/09 ≥988 / ≥1104 / ≤29.
- Gerações de verificação sempre numa cópia em /tmp no `transmonseg-vps`; nunca tocar `/srv/kpi-transmonseg` nem pm2 fora do deploy.

## Review Focus

- NF do Pão em bairro de Niterói/São Gonçalo/Maricá/Itaboraí: endereço sai com a cidade certa (Task 1 testa).
- Placa com GPS congelado (mesma posição o dia inteiro) e cv cadastrado: sai SEM RASTREADOR, sem tempo em loja falso, fora da taxa (Task 2 testa).
- Placa com GPS normal que passou a 8 m do cliente sem parar: rótulo "PASSOU…", nunca "NÃO FOI" (Task 3 testa).
- Escala com placa divergente (RBJ2J67 × carga 98593 em 24/09): NFs não saem "NÃO FOI" e nunca "OUTRA PLACA" (Task 4 testa).
- Correção de coordenada nunca sobrescreve fonte `manual` (Task 5 testa).

---

### Task 1: Pão — cidade pelo bairro e linha longa

**Files:** Modify `src/lib/kpi-romaneio/parse-pao.ts` (~L29-36 mapa bairro→cidade; parsing de linha longa); Test `src/lib/kpi-romaneio/parse-pao.test.ts`.

- [ ] Testes que falham, com linhas reais do PDF `~/ClaudeGerado/kpi-regen-0922/grupo/AC02742B6B548AB57796FD427099EED8_PROGRAMAÇÃO JAC (CONGELADO) 24-09.pdf` (extrair com pdftotext -layout): Icaraí, Ingá, Santa Rosa, São Francisco, Camboinhas, Pendotiba, Piratininga, Itaipu → NITEROI; Nova Cidade, Mutondo → SAO GONCALO; Outeiro das Pedras → ITABORAI; Inoã, Itaipuaçu, e "PREZUNIC MARICA … CENTRO" → MARICA; bairro desconhecido → mantém o comportamento atual. Linha longa que hoje vira endereço "858,4561.518,24R$" / "107370265,40R$" → endereço, bairro e números corretos (NF 216009 e as que o `analise-pao-24-09.md` lista).
- [ ] Implementar mapa completo (todos os bairros que aparecem no PDF de 24/09 + os de 22-25/09 se houver PDFs no storage `nutrimax/*` com Pão) e corrigir o corte de colunas. Suíte verde. Commit `fix(kpi): pao com cidade pelo bairro e linha longa`.

### Task 2: GPS congelado e placa declarada sem rastreador — sem visita falsa, fora da conta

**Files:** Modify `src/lib/kpi-romaneio/agregacao.ts` (semRastreadorNoDia / semMovimento ~L837, uso da visita da ponte), possivelmente `src/lib/kpi-romaneio/base-horarios.ts` (sinal de GPS congelado da ponte, ver `teveGpsCongelado` no monitoramento); Test `agregacao.test.ts`.

- [ ] Testes que falham: (a) placa em `kpi_placa_sem_rastreador` (temRastreador=false) com visitas vindas da ponte (GPS congelado, ex. TTL5J17 23-24/09 com visita 00:00–23:59) → todas as NFs `SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO`, sem chegada/saída/tempo, evidência `sem_rastreador`; (b) placa com cv e GPS congelado o dia todo (sinal da ponte ou: todas as posições do dia no mesmo ponto ≤50 m e atraso médio > 60 min) → idem, fora da taxa, em vez de `VEÍCULO SEM MOVIMENTO`; (c) placa realmente parada na base com GPS vivo (posições atualizando) → continua `VEÍCULO SEM MOVIMENTO`.
- [ ] Implementar (opt-in Nutry Max). Suíte verde. Commit `fix(kpi): gps congelado e placa sem rastreador nao geram visita`.

### Task 3: "NÃO FOI AO CLIENTE" só quando a placa não passou perto

Casos reais 24/09 (verificação manual): RQV9E37 2388069 (GPS a 8 m), TUO1D10 2388557 (340 m), RBJ7H78 2389720 (143 m), RQU2E34 2389291 (400 m) saíram "NÃO FOI".

**Files:** Modify `agregacao.ts` (cálculo de `distPropria` / rótulos PASSOU e NÃO FOI); Test `agregacao.test.ts`.

- [ ] Descobrir por que esses casos não caem em `PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA` (hipótese: `distPropria` usa só paradas, não a menor distância do GPS contínuo; ou o raio do "passou" é menor que 500 m). Testes que falham com a menor distância do trajeto a 8/143/340/400 m → `PASSOU…`, evidência `passagem_sem_parada`, dist preenchida; trajeto a >2 km → continua `NÃO FOI`.
- [ ] Implementar usando a menor distância do trajeto contínuo da própria placa (dado da ponte; se não houver, das paradas). Suíte verde. Commit `fix(kpi): nao foi so quando a placa nao passou perto`.

### Task 4: Escala divergente — sinalizar, não acusar

Caso real 24/09: escala e romaneio põem carga 98593 na RBJ2J67 e 98589 na RQV6I51; o GPS da RBJ2J67 ficou a 3–10 km dos 18 clientes da 98593 enquanto veículo da frota parou a 8–400 m deles.

**Files:** Modify `agregacao.ts`; Test `agregacao.test.ts`.

- [ ] Testes que falham: carga com ≥5 NFs em que a placa da escala nunca chegou a ≤2 km de ≥50% dos clientes E existe parada (≥2 min) de algum veículo da frota a ≤500 m desses clientes → essas NFs saem `pendente` com `PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA`, evidência `sem_evidencia`, sem horário, NUNCA "ENTREGUE POR OUTRA PLACA" nem "NÃO FOI". Abaixo do limiar → classificação normal. Opção desligada → nada muda.
- [ ] Implementar (opt-in Nutry Max; `acharParadaDeOutraPlaca` só como sinal, nunca como confirmação). Suíte verde. Commit `feat(kpi): escala divergente vira conferir escala em vez de nao foi`.

### Task 5: Correções de coordenada verificadas + casos na trava

**Files:** Create `scripts/aplicar-correcoes-geocode.ts` (+ test); Modify `scripts/gabaritos/casos-rotulados.csv`.

- [ ] Script: lê `correcoes-geocode-24-09.csv` (`endereco;lat;lng;fonte;evidencia`), sem `--aplicar` só imprime; com `--aplicar` faz backup CSV das linhas atuais do `kpi_romaneio_geocode_cache` e upsert `{endereco, lat, lng, confiavel: true, motivo: null, fonte: 'verificacao_manual'}`; nunca sobrescreve `fonte='manual'`; relata gravados/pulados. Teste de montagem do payload e do skip de manual.
- [ ] Acrescentar em `casos-rotulados.csv` os casos da verificação manual de 24/09: `NAO FOI DE FATO` → nao_entregue; `GEOCODE ERRADO`/`AUSENTE` → entregue (fonte verificacao_manual_24-09). Não incluir CONFLITO nem INCONCLUSIVO.
- [ ] Commit `feat(kpi): script de correcoes de geocode verificadas e casos na trava`. NÃO aplicar em produção aqui.

### Task 6: Medição, trava, revisão e deploy (deploy só com OK do usuário)

- [ ] Na cópia /tmp do servidor, aplicar as correções num cache sobreposto só em memória se possível; senão medir antes/depois da aplicação real no deploy. Regenerar 22/23/24 (24 também com Pão). Trava deve sair 0. Reportar: resolução automática 24/09 com e sem Pão, "não foi", "conferir escala", sem rastreador.
- [ ] Revisão final (modelo mais forte). Pedir OK do usuário. Deploy: push definitivo + TEMP, pull/build/restart, aplicar `aplicar-correcoes-geocode.ts --aplicar` com backup, regenerar 24/09 e rodar a trava de novo.
