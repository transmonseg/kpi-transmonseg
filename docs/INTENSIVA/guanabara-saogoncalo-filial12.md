# GUANABARA — São Gonçalo Filial 12 ausente do KPI gerado

**Data investigada:** dia 19/05/2026
**Conclusão:** NÃO é bug do matcher. É falha de captura no parser da escala PDF.

## Diagnóstico

### 1. Cadastro na tabela `lojas`
**ZERO lojas cadastradas** como "São Gonçalo" / Filial 12 da GUANABARA.

### 2. Escala PDF dia 19
**Filial 12 ESTÁ no PDF** (linha do PDF cru):
```
12               1           VAGNER          294               TRUCK   RICARDO /JUNIOR     553       LGT 1200     TRCK
```

Mas o 1º carro (VAGNER cod 294) **está SEM placa preenchida** no PDF da escala original (campo vazio entre "294" e "TRUCK").

O 2º carro (RICARDO/JUNIOR cod 553 LGT-1200) está completo.

### 3. Manual mostra VAGNER FTV-6F42
O KPI manual mostra que VAGNER de fato fez a entrega com placa FTV-6F42 às 06:55/08:55/09:20. Mas essa placa NÃO está na escala PDF — provavelmente preenchida na hora pela operadora.

### 4. Parser
O `parseEscalaGuanabaraPdf` em `src/lib/parsers/escala-guanabara-pdf.ts:107`:
```typescript
if (placa === null) return null  // descarta carro sem placa
```

Para Filial 12:
- Carro 1 (VAGNER, sem placa) → descartado
- Carro 2 (RICARDO/JUNIOR, LGT-1200) → deveria ser capturado

Mas o output `parseEscalaGuanabaraPdf` retorna 37 linhas sem Filial 12. **Bug do parser**: a linha inteira está sendo descartada quando o 1º carro não tem placa, mesmo com 2º carro válido.

## Próximas ações

1. **Cadastrar São Gonçalo / Filial 12** na tabela `lojas` rede=GUANABARA (com nome_normalizado, coordenadas se possível).
2. **Investigar parser** — por que Filial 12 não captura o 2º carro? Hoje testado: 0 linhas retornadas pra Filial 12. Esperado: pelo menos 1 (carro 2 com LGT-1200).
3. **Operacional**: Erica deve completar a placa do 1º carro no PDF da escala antes de subir.

## Detalhe técnico do bug do parser

O `parseRowFromTokens` provavelmente está falhando ao parsear a linha quando tokens vêm desbalanceados (1º carro com 3 tokens, 2º carro com 5 tokens incluindo placa). Bug é na função de split por carro, não em `tokensToCarro`.

Não vou consertar agora — depende de exemplo concreto, não consegui reproduzir o token stream completo a partir do `pdftotext` (cabeçalhos podem afetar). Volto a isso quando o usuário enviar mais casos.
