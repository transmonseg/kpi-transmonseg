# INTENSIVA FINAL — Design Spec
**Data:** 2026-05-25
**Autor:** Claude (autorizado pelo usuário enquanto ele está fora)
**Objetivo:** Fechar bugs conhecidos antes da mega-análise rede-por-rede com os KPIs manuais que serão fornecidos.

---

## Contexto

Estamos na fase final do sistema KPI Transmonseg. A operadora já está testando. O usuário entregou 7 KPIs manuais de referência (em `INTENSIVA/KPIS_MANUAIS_REFERENCIA/`) e em breve enviará os KPIs gerados pelo sistema para cada dia em que existe escala disponível.

Na sessão anterior, 12 bugs foram identificados e corrigidos (timezone, ROTAS classificadas como LOJA, regex de coordenadas, etc.). Restam:

1. **Header do KPI gerado vaza como "loja"** quando o gerado é lido depois (caso GUANABARA dia 19 mostrou linha `RELATORIOKPIGUANABARATERCAFEIRA19DEMAIODE2026`).
2. **Upload Unitrac deve aceitar XLSX e PDF como OBRIGATÓRIO** — hoje o usuário pode subir só um e o sistema gera KPI com dados incompletos.
3. **São Gonçalo Filial 12 da GUANABARA não aparece no gerado dia 19** — investigar se é cadastro de loja ou filtro da escala.

---

## Escopo desta intensiva

### IN — vou fazer agora:

1. **Bug do header vazando** — corrigir leitor de KPI gerado para pular linhas até encontrar o cabeçalho real ("REDES / FILIAIS"). Afeta `scripts/analise/*` e qualquer leitor de KPI gerado downstream.
2. **XLSX + PDF obrigatórios no upload Unitrac** — modificar `/api/kpi/simples` (e/ou a tela de upload) para EXIGIR ambos os formatos. Razão: vimos que XLSX e PDF do mesmo dia podem ter dados ligeiramente diferentes (timing de export). O sistema deve combinar os dois (PDF = fonte de paradas tardias quando XLSX foi exportado mais cedo; XLSX = formato mais limpo de parsing).
3. **Investigar GUANABARA São Gonçalo Filial 12 ausente** — verificar se a loja está cadastrada na tabela `lojas`, se a placa está no Unitrac, e se a escala da Guanabara dia 19 (PDF) inclui essa filial.

### OUT — fora deste spec (volta depois):

- Análise comparativa manual × gerado (aguardando o usuário enviar os KPIs gerados pra cada dia).
- Cadastro de geofences no Unitrac (problema externo, não código).
- Trocas de placa não registradas no arquivo de alterações (problema operacional, não código).

---

## 1. Bug — Header KPI vaza como linha

### Problema atual

Em `scripts/analise/comparar_guanabara.ts:lerKpi()`, o loop começa em `r=1` e aceita qualquer célula da coluna 1 que tenha texto. A primeira linha do KPI gerado é o título ("RELATÓRIO KPI - GUANABARA / Terça-feira, 19 de Maio de 2026") e entra como "loja". O mesmo problema afeta qualquer comparador downstream.

### Causa raiz

O parser do KPI gerado não tem ancoragem semântica. Lê toda linha com texto na col A.

### Fix

Detectar o cabeçalho `REDES / FILIAIS` (linha imediatamente anterior aos dados) e começar a leitura na linha logo abaixo. Aplicar em todos os leitores de KPI:
- `scripts/analise/comparar_guanabara.ts`
- `scripts/analise/analise_18_geral.ts`
- `scripts/analise/analise_19_geral.ts`
- `scripts/analise/auditoria_completa_19.ts`

Criar utilitário compartilhado `scripts/analise/_lib/ler-kpi.ts` que retorna `Linha[]` filtrado.

### Critério de aceite

Rodar `comparar_guanabara.ts`: linha "RELATORIOKPIGUANABARA..." não aparece como "SÓ GERADO".

---

## 2. XLSX + PDF obrigatórios no upload Unitrac

### Problema atual

Em `/api/kpi/simples` (e na tela `painel/kpi/simples/page.tsx`), o `unitracBucketPaths` aceita qualquer mistura de arquivos. Se o usuário sobe só XLSX, o sistema processa só XLSX e perde paradas tardias que estão no PDF. Se sobe só PDF, perde a precisão de timestamps do XLSX.

### Causa raiz

Validação ausente. O backend processa o que vier.

### Fix

**Backend** (`/api/kpi/simples/route.ts`):
- Validar que `unitracBucketPaths` contém pelo menos 1 arquivo `.xlsx` E pelo menos 1 `.pdf` antes de processar.
- Retornar erro 400 com mensagem clara: "É obrigatório enviar tanto o Unitrac em XLSX quanto em PDF (eles podem ter dados diferentes; o sistema combina os dois)."

**Frontend** (`painel/kpi/simples/page.tsx`):
- No componente de upload, exigir 1 XLSX e 1 PDF antes de habilitar o botão "Gerar KPI".
- Mostrar mensagem clara: "Suba os 2 formatos do Unitrac (XLSX + PDF). O sistema combina os dois para máxima precisão."

**Combinação de dados** (matcher):
- O matcher já recebe `paradasIndex` agregado. Modificar `cruzaEscalaUnitrac` para deduplicar paradas (mesma placa, chegada, saída) entre XLSX e PDF, escolhendo a versão MAIS COMPLETA (mais paradas LOJA classificadas). Hoje o matcher só recebe um pool de paradas — vou unificar antes de cruzar com a escala.

### Critério de aceite

Tentar gerar KPI subindo só XLSX: erro 400 claro. Tentar com só PDF: erro 400 claro. Tentar com ambos: gera normalmente, com paradas deduplicadas.

---

## 3. Investigar São Gonçalo Filial 12 (Guanabara)

### Problema atual

O KPI GUANABARA gerado do dia 19 tem 27 lojas. O manual tem 28 (todas as filiais menos algumas pulada). Falta "Gb São Gonçalo - Filial 12".

### Possíveis causas

1. **Loja não cadastrada** na tabela `lojas` (rede=GUANABARA, codigo_escala=12).
2. **Loja cadastrada mas inativa** (ativo=false).
3. **Escala dia 19 do Guanabara não inclui** filial 12 (escala original é PDF, ver `ESCALA 19.05.pdf`).
4. **Loja com nome desnormalizado** (parser não casa "São Gonçalo" com "SAO GONCALO").

### Fix

Investigar nessa ordem:
1. SELECT na tabela `lojas` para "São Gonçalo" rede GUANABARA.
2. Olhar o PDF da escala Guanabara dia 19, ver se filial 12 está listada.
3. Se filial 12 não está na escala → operacional (Erica não escalou nesse dia).
4. Se está na escala mas não está no cadastro → cadastrar.
5. Se está em ambos → bug no parser (ver dump da escala-guanabara-pdf).

### Critério de aceite

Diagnóstico documentado com a causa identificada. Se for bug de código, corrigir.

---

## Plano de execução

Sequência (atômica, cada um vira commit):

1. **Bug header**: criar `_lib/ler-kpi.ts`, refatorar 4 scripts de análise, commit.
2. **XLSX+PDF obrigatório**: validação backend + frontend, deduplicação no matcher, commit.
3. **Investigar São Gonçalo**: rodar script de diagnóstico, documentar achados em `docs/INTENSIVA/guanabara-saogoncalo-filial12.md`, fix se aplicável, commit.

Cada commit + push imediato.

---

## Princípios

- **NÃO mexer no matcher core** sem ter o fixture do gerado vs manual (espera o usuário).
- **NÃO refatorar arquivos não relacionados.**
- **Tudo deve ter teste de regressão** (vitest existing).
- **Commits atômicos** por bug.

---

## Riscos

- Deduplicação de paradas entre XLSX e PDF pode introduzir paradas duplicadas se a chave de dedup for fraca. Mitigação: chave = `placa_norm + chegada_iso + saida_iso`.
- Validação obrigatória de PDF pode quebrar uploads em andamento se houver gerações em batch que não passaram pelo frontend. Mitigação: lançar erro só na rota; manter compatibilidade interna.

---

**Próxima ação:** começar pelo Bug 1 (header).
