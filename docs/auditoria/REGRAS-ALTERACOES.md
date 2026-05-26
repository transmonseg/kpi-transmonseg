# Regras do parser de alterações

> **IMPORTANTE**: ler antes de mexer em `src/lib/parsers/alteracoes-v2.ts` ou similar.

## Formato base do arquivo `alteracoes_<DD>.<MM>.txt`

Cada bloco identifica uma alteração na escala do dia. Estrutura:

```
<REDE/FILIAL/LOJA>
[Sai: <motorista> Cod: <cod> Placa: <placa>]
Entra: <motorista> Cod: <cod> Placa: <placa>
[Tipo: <tipo>]
[Obs: <observação>]
```

## Regras-chave

### 1. `Sai:` é OPCIONAL

Quando a alteração só especifica `Entra: <novo>`, o sistema deve:
1. Identificar a linha original da escala pela combinação **rede + filial** (loja)
2. Substituir motorista/placa daquela linha pelos novos valores do bloco
3. Não exige que `Sai:` esteja explícito

**Exemplo válido (sem `Sai`):**
```
Assai Alcantara I Loja 35
Entra: Paulo Henrique Cod: 807 Placa: DBB-8D19
Tipo: 710 C/ RAMPA
```

→ Sistema procura na escala dia X uma linha com `rede=ASSAI` e `loja=Alcântara I (Loja 35)` e substitui o motorista/placa.

### 2. Múltiplas alterações na mesma filial

Quando uma loja recebe **mais de uma troca** no dia (caso Assaí Barra I dia 19: UGA-1D55 → UBO-5E05 → UBO-5E01), cada bloco é processado **em ordem de leitura do arquivo**. A última substituição prevalece.

### 3. Identificação da loja na escala

O parser deve casar a loja descrita no bloco contra a escala usando:
- **Código da loja** (mais confiável)
- **Nome canônico** (lookup-canonical)
- **Tokens fortes** (Alcântara I, Barra I, etc.)

Ignorar tokens fracos ("Loja", "Filial", "F.") na comparação.

### 4. "Troca de carro" sem motorista novo

Quando o bloco diz `Troca de carro` e só tem placa (sem motorista), o motorista da escala original permanece. Só a placa é substituída.

**Exemplo:**
```
Assai Barra I Senna Loja 133
Troca de carro
Sai: UGA-1D55
Entra: UBO-5E05
Obs: CARRO SEM CHAVE MOTORISTA PERMANECE
```

→ Mantém motorista da escala, substitui apenas a placa.

### 5. `Obs: OVOS NAO SAIU NA ESCALA` (e similares)

Observações que indicam que a entrega **não aconteceu** devem ser respeitadas. O sistema deve marcar `NAO_FOI` ou similar nessa linha, mesmo que GPS confirme passagem na loja.

### 6. Alterações cross-day (entrega no dia seguinte)

Quando a alteração ocorre na escala do dia N mas a entrega acontece no dia N+1 (caso ZS D1_FIXAS — lojas 33, 21, 30, 27, 15, 04, 18, 06, 07, 48, 13), a alteração deve seguir o `data_entrega` da linha original.

### 7. Formato livre vs estruturado

O parser deve aceitar:
- Texto livre (com emojis 🚨, etc.) — formato Tia Érica
- Texto estruturado (este arquivo `.txt`)
- PDF tabular (formato `ALTERACAO DE ESCALA GERAL DD.MM.pdf`)

Combinar fontes quando houver mais de um arquivo no dia.

## Casos reais que o parser DEVE acertar

### Caso 1: Niterói Ponte dia 19 (só Entra explícito no texto original)

Texto:
```
Assai Niterói ponte
Sai : Mesias Cod : 141 Placa : AMW 3424
Entra : LUIZ FERREIRA cod : 789 Placa : LAU 1I64
```

→ Identificar Loja 292 (Niterói Ponte) na escala dia 19 e substituir motorista/placa.

### Caso 2: Carrefour Campo Grande dia 19 — duas linhas (1º e 2º carro)

```
Carrefour Campo Grande
Entra: Renan Cod: 184357 Placa: KRW-8E86
Sai: John Cod: 772 Placa: KVI-9088
Entra: Simao Cod: 184846 Placa: LSN-6I72
Tipo: KIA
```

→ Identificar Loja Carrefour Campo Grande (que tem 1º e 2º carro). 1º carro = Renan (sem troca explícita), 2º carro = Simão substitui John.

### Caso 3: Sem motorista (troca implícita)

```
Assai Alcantara I Loja 35
Entra: Paulo Henrique Cod: 807 Placa: DBB-8D19
```

→ Identificar Loja 35 (Alcântara I) na escala e substituir TODA a tripulação (motorista + placa) pelos valores do bloco.

## Verificação

Após aplicar alterações:
1. Cada linha da escala alterada deve ter `placa_norm` correta
2. `motorista_nome` e `motorista_codigo` atualizados
3. Linhas que receberam `Obs: NAO SAIU` marcadas com flag de cancelamento
4. KPI deve usar a placa **alterada** para matching contra GPS
