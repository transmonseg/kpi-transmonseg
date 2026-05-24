# Fase 0 — Sanitização do Cadastro de Lojas

## Por que esta fase é fundação

Sem `codigo_unitrac` e `nome_unitrac` corretos no cadastro, qualquer matcher (atual ou novo) precisa cair em fallbacks (geo/fuzzy) que geram bugs. Esta é a base de tudo.

## Estado atual (auditoria)

```
Total: 347 lojas ativas
Sem codigo_unitrac:  129 (37%)
Sem nome_unitrac:    200 (58%)
Sem lat/lng:           8 (2%)
```

Redes mais críticas:
- ASSAI: 100% sem `codigo_unitrac`
- EMANUEL/FEIRA_NOVA/VIANENSE/SAMS_CLUB: 100% sem `nome_unitrac`
- SUPER_PAX: 95% sem `nome_unitrac`

## Estratégia: auto-preenchimento por cross-reference

Em vez de cadastrar manualmente, usar dados que já temos:

**Lógica:**
```
Pra cada loja L sem codigo_unitrac:
  Achar todas as escalas (dias 18-22) que tenham essa loja
  Pegar as placas dessas escalas
  Buscar no Unitrac as paradas dessas placas
  Contar quais codigo_loja aparecem
  Se UM código aparece em ≥70% das placas → atribuir à loja L
  Senão → manter null e listar pra revisão manual
```

Mesma lógica para `nome_unitrac` (mas comparando `local_parada` / `nome_loja` textuais).

## Subtarefas

### 0.1. Script `auto_preencher_unitrac.ts`

**Localização:** `scripts/correcao/auto_preencher_unitrac.ts`

**Input:** todas as escalas + Unitrac dias 18, 19, 20, 21, 22

**Output:**
- Arquivo `docs/db-changes/2026-05-24-preencher-unitrac-PROPOSTAS.json` com:
  ```json
  [
    {
      "loja_id": "abc-123",
      "loja_nome": "Prezunic - Caxias Centro",
      "campo": "codigo_unitrac",
      "valor_proposto": "7000123",
      "confianca": 0.85,
      "evidencia": "Apareceu em 6/7 placas que serviram essa loja"
    }
  ]
  ```
- Nada é aplicado no banco automaticamente — só proposta

### 0.2. Revisão e aplicação

- Eu mostro a proposta pro dono
- Dono aprova bloco a bloco (alta confiança / média / baixa)
- Aplica UPDATE no Supabase com SQL log
- Salva rollback em `scripts/db-changes/2026-05-24-rollback-unitrac.sql`

### 0.3. Auditoria de duplicatas

Script `auditar_duplicatas.ts`:
- Lojas com nomes muito similares na mesma rede
- Lojas em rede errada (ex: "PREZUNIC FREGUESIA" cadastrada como SENDAS)
- Lojas inativas que aparecem em escalas recentes
- Lojas ativas que nunca aparecem em nenhuma escala

### 0.4. Cadastrar lojas novas (futuras escalas)

Pra escalas que o dono manda no futuro:
- Detectar nomes novos não cadastrados
- Tentar buscar no Unitrac correspondente
- Se achar `codigo_unitrac` consistente → cria registro
- Senão → reportar pra cadastro manual (com proposta de lat/lng via Nominatim)

## Critério de sucesso

- [ ] <10% das lojas sem `codigo_unitrac` (atual: 37%)
- [ ] <20% das lojas sem `nome_unitrac` (atual: 58%)
- [ ] Lista documentada de lojas que NÃO foi possível auto-preencher
- [ ] Verificação dia 22 (`verificar_kpi_22_completo.ts`) não regride

## Reversibilidade

Cada UPDATE no Supabase gera:
- SQL log em `docs/db-changes/2026-05-24-T<HHMM>-preencher-unitrac.sql`
- Rollback script em `scripts/db-changes/2026-05-24-T<HHMM>-rollback.sql`

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Atribuir codigo_unitrac errado | Threshold de confiança 70%+; lista pra revisão |
| Duplicidade de codigo_unitrac em redes diferentes | Validar unicidade antes de aplicar |
| Quebrar matcher atual | Rodar `verificar_kpi_22_completo` antes/depois |
