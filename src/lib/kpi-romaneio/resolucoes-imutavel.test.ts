import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'

// F3-03: regerar o dia (Nutry ou RQ, tela ou fechamento) nunca apaga nem
// altera a resolução da operação -- kpi_nf_resolucao só recebe INSERT
// (resolucoes.ts) e a geração só lê. Guarda contra um DELETE/UPDATE novo.
const RAIZ = path.resolve(__dirname, '../../..')

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = path.join(dir, n)
    if (statSync(p).isDirectory()) return n === 'node_modules' || n.startsWith('.') ? [] : arquivos(p)
    return /\.(ts|tsx|mjs|sql)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : []
  })
}

describe('kpi_nf_resolucao só recebe INSERT', () => {
  const usos = [...arquivos(path.join(RAIZ, 'src')), ...arquivos(path.join(RAIZ, 'scripts'))]
    .map(p => ({ p, s: readFileSync(p, 'utf8') }))
    .filter(x => x.s.includes('kpi_nf_resolucao'))

  it('quem toca na tabela: leitura, insert e o placar', () => {
    expect(usos.length).toBeGreaterThan(0)
  })
  it('nenhum código apaga ou altera uma resolução', () => {
    for (const { p, s } of usos) {
      expect(s, p).not.toMatch(/from\(\s*['"]kpi_nf_resolucao['"]\s*\)\s*\.\s*(delete|update|upsert)\b/)
      expect(s, p).not.toMatch(/(delete\s+from|update|truncate)\s+(public\.)?kpi_nf_resolucao\b/i)
    }
  })
})
