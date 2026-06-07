# Geo até 500m + distância no preview — varredura + plano

**Data:** 2026-06-06 · **Decisão:** Joaquim

## Parte 1 — Como o geo funciona HOJE (varredura)

### Modo de produção
- `SEM_GEO = true` em prod (`route.ts`) → **desliga** o match por proximidade GLOBAL
  (`resolveForaBaseGeo`, que casaria qualquer parada à loja mais próxima de qualquer
  rede). Foi desligado porque os geofences do Unitrac se sobrepõem.
- O **resgate restrito à loja esperada** (abaixo) CONTINUA rodando (`opts.geoEndereco`).

### Resgate FORA_BASE da loja esperada — `matcher.ts` ~2293–2433
Só roda pra rotas SEM parada (linha que não casou por código/nome). Passos:
1. Resolve `esperada = lojaEsperadaDaLinha(linha)` — por código exato/único, senão por
   nome (com **containment**, fix do SPID). É a loja que a ESCALA diz.
2. **(1)** Pra cada parada FORA_BASE sem código: `matchGeoEndereco(esperada, hardMetros =
   min(max(raio,100),200))`. Casa se `dist ≤ hard` (`coord`), ou `dist ≤ 250m` **com
   confirmação de rua/bairro** (`coord+rua`).
3. **(1b)** "Abismo natural" (que adicionei): resgata até **300m** SÓ se a esperada for a
   loja única perto (2ª loja a ≥2× a distância). — *vai ser REMOVIDO.*
4. **(2)** Loja duplicada no cadastro: parada LOJA gêmea a ≤60m.
5. Consolida o cluster de paradas, seta:
   - `rota.geo_confiavel = melhorDist ≤ raio` (dentro do raio → alta confiança)
   - `rota._matchMeta.requiresReview = !geo_confiavel` (fora do raio → revisão)
   - `algorithm: 'geo'`

### `matchGeoEndereco` (`lib/lojas/match-geo-endereco.ts`)
- `hardMetros` (default 100) = casa direto; `confirmMetros` (250) = casa só com rua+bairro.
- Recebe SÓ a loja esperada (1 elemento) → não há "duas lojas" a desempatar aqui: ele
  só checa proximidade da loja que a escala espera.

### Status / UI
- `status-rota.ts`: `viaGeo + geoConfiavel` → `ENTREGUE_GEO` sem revisão; `viaGeo` fora do
  raio → `ENTREGUE_GEO` + revisão.
- **A distância (`melhorDist`) é calculada mas NUNCA é exposta** no preview/UI hoje.

### Limitação atual (o que motiva a mudança)
Teto efetivo de 150–300m. Entregas reais que o caminhão registra como FORA_BASE a
207m (Méier) / 250m (Freguesia) — fora da doca — não casavam.

---

## Parte 2 — Plano de EXECUÇÃO

**Regra nova:** a parada FORA_BASE casa a loja que a ESCALA espera se estiver a **≤500m**.
Confia na escala (escala errada = problema da operação, não do sistema). **Sem revisão.**
**Mostra a distância exata em metros** em cada linha geo do preview.

### Tarefa 1 — Matcher (bloco 1, ~2293–2433)
- Trocar `hardMetros` de `min(max(raio,100),200)` → **`GEO_MAX_METROS = 500`** (constante).
- **Remover** o bloco (1b) "abismo natural" + os 2 testes dele (subsumido por ≤500 e a
  regra agora confia na escala, não no desempate por unicidade).
- Anexar a distância: `rota.geo_dist_metros = Math.round(melhorDist)`.
- Sem revisão: `rota.geo_confiavel = true` p/ esses matches (conta como entregue).
- **Não mexer** no 2º bloco (troca de carro) nem no SEM_GEO.

### Tarefa 2 — Tipo `RotaKpi`
- `geo_dist_metros?: number | null`.

### Tarefa 3 — Rota → preview (`route.ts`)
- Levar `geo_dist_metros` pro objeto da linha do preview.
- `geoConfiavel` passa true p/ geo (sem requiresReview).

### Tarefa 4 — UI (`page.tsx`)
- Em cada linha com `algoritmo === 'geo'`, mostrar **"📍 230m"** (metros exatos).

### Tarefa 5 — Testes
- Méier (FORA_BASE 207m) e Freguesia (250m) reais → casam.
- SPID Carioca (0m) segue casando.
- `geo_dist_metros` preenchido e aparece no preview.
- Suíte inteira verde (remover/ajustar os testes do abismo natural).

### Risco aceito (explícito do dono)
500m em área densa pode creditar uma parada perto-mas-não-entregue. Mitigação =
a distância fica à vista (operador julga). Sem flag escondida, por decisão do dono.
