# Spec: Universal Escala Fallback Parser

**Data:** 2026-05-18  
**Status:** Aprovado

## Problema

O sistema tem parsers dedicados para 5 formatos (GERAL, ZONA_SUL, PAX, ARMAZEM_GRAO, GUANABARA). Se um arquivo de formato desconhecido for enviado, o sistema retorna 400. O objetivo é adicionar um fallback heurístico que extrai o máximo possível de qualquer XLSX ou PDF.

## Arquitetura

### Novo arquivo
`src/lib/parsers/escala-universal.ts`  
Exporta `parseEscalaUniversal(buffer, dataAlvo?): Promise<LinhaEscala[]>`

### Arquivo modificado
`src/app/api/escalas/upload/route.ts`  
- Adiciona UNIVERSAL como penúltima tentativa no fluxo AUTO
- Adiciona campo `aviso?: string` na response JSON

### Sem alterações de banco
`rede_id: 'DESCONHECIDO'` é string válida na coluna existente.

## Fluxo AUTO atualizado

```
ZONA_SUL → ARMAZEM_GRAO → PAX → GERAL → [GUANABARA se PDF]
  ↓ ainda 0 linhas?
UNIVERSAL — rede_id: 'DESCONHECIDO'
  ↓ ainda 0 linhas?
400 "formato não identificado"
```

## Lógica heurística XLSX

1. **Detecção de cabeçalho:** varre as primeiras 5 linhas de cada aba procurando células que contenham palavras-chave: `PLACA`, `MOTORISTA`, `LOJA`, `ROTA`, `DATA`, `CARRO`, `CÓDIGO`, `COD`, `NOME`, `CLIENTE`
2. **Mapeamento de colunas:** associa índice de coluna → campo LinhaEscala pelo melhor match de keyword
3. **Fallback posicional:** se sem cabeçalho, coluna com mais matches de regex de placa → `placa_raw`; coluna com mais strings em maiúsculas → `motorista_nome`; primeira string longa → `loja_nome_raw`
4. **Data:** usa `dataAlvo` (parâmetro), ou nome da aba se parecer dia (número 1–31), ou primeira célula com padrão `DD/MM/YYYY`
5. **Defaults:** `rede_id: 'DESCONHECIDO'`, `turno: 'MANHA'`, `carro_ordem: 1`, `tipo_emissao: 'NORMAL'`
6. **Normalização de placa:** usa utilitário `normalizaPlaca()` existente

## Lógica heurística PDF

1. Extrai texto com pdf-parse
2. Varre linhas procurando matches de regex de placa: `/[A-Z]{3}[\s-]?\d[A-Z0-9]\d{2}/i`
3. Para cada placa encontrada, linha anterior = motorista (se string de nome), linha seguinte = loja
4. Mesmos defaults do XLSX

## Response da API

Quando fallback universal for acionado:
```json
{
  "upload_id": "...",
  "qtd_linhas": 12,
  "qtd_orfas": 3,
  "substituiu": false,
  "tipo_detectado": "DESCONHECIDO",
  "aviso": "Formato não reconhecido. Dados extraídos por heurística — verifique se as informações estão corretas."
}
```

## UI

O componente de upload já exibe `tipo_detectado`. Acrescenta banner amarelo (`Alert variant="warning"`) quando `aviso` estiver presente na response.

## O que NÃO entra no escopo

- Confirmação/revisão manual antes de salvar
- Chamadas a LLM externo
- Novos tipos no enum `TipoEscala` além de `DESCONHECIDO`
- Alterações de banco
