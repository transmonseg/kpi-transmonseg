# Varredura de Falsos Erros do KPI — base 05.06.2026

> Diagnóstico fundamentado em dados reais: escala de junho × Unitrac de 05.06
> (`relatorio_9987.pdf`) rodados pelos parsers reais do sistema + consulta ao
> banco `lojas` (Supabase `luhwpsckvbctxynifryk`). Nada aqui foi para produção.

Fonte do "ground truth": arquivo do cliente `ERROS IDENTIFICADOS KPI 05.06.xlsx`
(abas 03.06 / 04.06 / 05.06 + listas "FALSO ERRO" e "NECESSÁRIO CADASTRAR PONTOS").

## ⚠️ CORREÇÃO (após cruzar o export oficial do Unitrac)

Cruzando o `unitrac_pontointeresse_consulta.xls` (296 pontos CLIENTES ENTREGAS:
código + endereço + lat/lng + raio) com o banco `lojas` via REST:

- **Cadastro está BOM**: 296/296 códigos presentes como `codigo_unitrac` no banco;
  **coordenadas batem** (zero divergência > 300m); nenhum ponto do export com
  coord zerada no banco. → **Isso derruba** as hipóteses de "coord 0,0 em massa"
  e "ponto arrastado" do nosso lado. O Armazém Central (5353001) com `lat=0` **nem
  está no export** — o próprio Unitrac não tem coord dele (cadastrar é do cliente).
- **Raio oficial do Unitrac = 100m** na maioria → apertado; entregas reais caem fora
  e viram "FORA DE BASE" no relatório.
- **`SEM_GEO=true` confirmado como dor real**: ex. CEJ-3426 parou **17m** de
  `SENDAS CEASA` (raio 150m) e ainda assim saiu `FORA_BASE` (geo desligado + texto
  Unitrac sem código → sem rescue).
- **Limite da varredura**: as placas flagged de 05.06 (GSK, GAR, GBG, KQR, TML, FKY)
  **não estão na escala "geral"** — estão em Zona Sul/Pax/Sendas/Armazém, que não
  tenho. Sem elas não dá pra separar "mudou de rota" de "não foi mesmo".

## O que a varredura provou

### Eixo placa (correção OCR/Mercosul)
- A correção automática **funciona** para os casos de 03/04.06:
  `LCO-0J78→LCO-0978`, `EFU-5H04→EFU-5704`, `GSK-0G53→GSK-0653`,
  `KOP-4J78`/`LMF-2A49` via variante. Fix HLOG operante.
- As **14 placas flagged de 05.06 estão TODAS presentes no Unitrac** → o erro
  delas **não é placa**, é geo/status.
- **Furo real não coberto pelo mapa OCR**: escala `KQR-2011` vs Unitrac
  `KQR-2J11`; escala `NSM-3D98` vs error file `NSM-6D98`. Trocas `0↔J` e `3↔6`
  não estão em `OCR_PARES` (`src/lib/kpi/matcher.ts`) nem na tabela Mercosul.
- 66 placas da escala "geral" sem match no Unitrac — triar: não-foi real ×
  outra base (PDF cobre só Benassi) × furo de placa. (As "geral" não incluem
  Zona Sul/Pax/Armazém — o pipeline real usa 4 parsers de escala.)

### Eixo geo (banco `lojas`)
- 🔴 `ARMAZÉM DO GRÃO (CENTRAL)` (`codigo_unitrac=5353001`) tem **`lat=0, lng=0`**
  → geofence no oceano. `KPH-8C41` nunca casa → "não saiu da base". Bug de dado.
- 🔴 **Produção roda `setSemGeo(true)`** (`src/app/api/kpi/simples/route.ts:546`
  e `preview/route.ts:187`) → match por proximidade DESLIGADO. Combinado com
  lojas de **`codigo_unitrac=null`** (Americanas, Atlântico Sul, Sachinho VG,
  Sendas Central), elas **só casam por nome**. Quando o Unitrac mostra
  "FORA DE BASE" (sem nome), não há como casar → "não foi" com o caminhão lá.
  **Causa-raiz da maioria dos "tem marcação mas não fica verde".**
- 🟡 `Mercado de Santa` (flag `LMF-2049`) **não existe** no banco → cadastrar.
- 🟡 `Sendas Central 1 Carro` tem coord **dentro do raio da base** (−22.827,−43.338)
  → sobreposição base/loja (`KRB-2J76` "não saiu da base").

## As 6 frentes

| Frente | O que é | Causa | Conserta em | Dono |
|--------|---------|-------|-------------|------|
| A. Placa não coberta | KQR-2011↔2J11, NSM-3D98↔6D98 | pares `0↔J`,`3↔6` fora do mapa | Código (`placa.ts`/matcher) | Dev |
| B. Coord 0,0 | Armazém Central | dado quebrado | Dado (migration) | Dev |
| C. Geo OFF + cod null | Americanas, Atlântico, Sachinho, "não fica verde" | `SEM_GEO=true` + `codigo_unitrac` faltando | Código (geo/endereço controlado) + Dado | Dev |
| D. Ponto inexistente | Mercado de Santa | não cadastrado | Dado | Dev/cliente |
| E. Loja na base | Sendas Central | geofence sobre a base | Código (regra overlap) | Dev |
| F. Externo | SASCAR, veículo em 2 escalas, cadastro errado Unitrac | fora do sistema | Cliente | Tia Érica |

## Método de varredura (repetível por KPI)
1. Harness offline: escala × Unitrac → relatório de (a) placas corrigidas,
   (b) placas sem match, (c) flagged vs presença. (Montado em 05.06; pode virar
   script versionado em `scripts/`.)
2. Cruzar cada "sem match" com `lojas`: classificar (lat=0/null, cod null,
   inexistente).
3. Saída: tabela `placa → loja → causa → ação`.

## Ordem sugerida (impacto × risco)
1. **B** — migration da coord 0,0 (risco zero, destrava Armazém Central).
2. **A** — ampliar mapa OCR com guarda de cadastro (anti-over-correction já existe).
3. **C** — maior alavanca, mais delicada. **Revisar branches abertas antes de codar**:
   `feat/kpi-geo-mudou-rota-nao-saiu-base`, `fix/geo-match-por-codigo-parada`.
4. **D/E** — cadastro + regra de overlap.
5. **F** — devolver lista de responsabilidade ao cliente.

## Lembretes de produção
- Deploy é automático: **merge no `main` = no ar para a Tia Érica**.
- Migrations Supabase são aplicadas à parte (auto-deploy não roda migration).
- KPI roda diariamente → priorizar robustez e evitar regressão silenciosa.
