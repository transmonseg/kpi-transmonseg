# scripts/dev/

Utilitários de debug e exploração usados durante o desenvolvimento dos parsers e do pipeline KPI. **Não são parte do produto final** — ficam aqui só como referência histórica.

Convenções:

- `debug-*` — inspeções pontuais de bugs específicos
- `inspect-*` — varreduras exploratórias de arquivos de entrada
- `test-*` — scripts ad-hoc rodados via `node` (não confundir com `vitest`, que vive em `src/**/*.test.ts`)
- `shift-*`, `set-sheet-date`, `rename-sheet` — manipulação manual de XLSX
- `reset-*`, `reprocessar-*`, `verify-*` — operações datadas, específicas de um dia

Se for tocar parser ou pipeline e precisar repetir uma investigação parecida, copie pra cá com nome novo. Não delete os antigos sem confirmar com o criador.
