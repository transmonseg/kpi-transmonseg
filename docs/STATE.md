# KPI Perfeição — Estado Atual

> **Para retomar a sessão após compactação:** leia este arquivo PRIMEIRO. Tudo aqui aponta para a verdade.

**Última atualização:** 2026-05-24
**Spec mestre:** `docs/superpowers/specs/2026-05-24-kpi-perfeicao-rede-por-rede-design.md`
**Plano ativo:** (a definir após writing-plans)
**Status global:** Iniciando pre-flight

---

## Onde estamos AGORA

- **Rede atual:** Pre-flight (antes da rede 1)
- **Iteração atual:** —
- **Última iteração concluída:** —
- **Último commit relevante:** `36a8117 docs(spec): design completo correção KPI rede-por-rede`

## Próximo passo concreto

Criar plano de pre-flight via skill `writing-plans`, depois executar.

---

## Como retomar (passo a passo)

Se você é um Claude novo (sessão compactada) lendo isto:

1. **Leia o spec:** `docs/superpowers/specs/2026-05-24-kpi-perfeicao-rede-por-rede-design.md` — a fonte de verdade do que estamos fazendo.
2. **Veja commits recentes:** `git log --oneline -15`
3. **Veja tasks ativas:** use a tool `TaskList`
4. **Veja último snapshot:** `ls -lt docs/snapshots/ | head -3` se a pasta existir
5. **Valide baseline:** `npx vitest run` deve passar todos os testes
6. **Continue do "Próximo passo concreto" acima**

---

## Invariantes (NUNCA quebrar)

- 263+ testes vitest passando.
- TypeScript zero erros (`npx tsc --noEmit`).
- ZONA_SUL nunca regride (canário do projeto).
- Cada fix vira commit atômico.
- Cada UPDATE no Supabase tem log em `docs/db-changes/` + script de rollback em `scripts/db-changes/`.

---

## Histórico de redes processadas

(Será preenchido conforme cada rede for finalizada)

| Rede | Iterações | Antes | Depois | Commit final | Report |
|------|-----------|-------|--------|--------------|--------|

---

## Snapshots gerados

(Será preenchido conforme snapshots forem gerados)

| Timestamp | Descrição | Arquivo |
|-----------|-----------|---------|

---

## Atualizações deste arquivo

Atualize SEMPRE que:
- Iniciar uma nova rede
- Concluir uma iteração
- Aplicar um fix significativo
- Gerar snapshot
- Encontrar bloqueador
