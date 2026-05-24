/**
 * Testa cenários comuns de bloco de texto colado pelo usuário (WhatsApp, email),
 * para identificar onde splitAlteracoes falha em separar múltiplas alterações.
 */
import { parseAlteracaoText } from '@/lib/parsers/alteracao-text'
import { splitAlteracoes } from '@/lib/parsers/alteracao-split'

const casos: Array<{ nome: string; texto: string; esperado: number }> = [
  {
    nome: 'Caso 1: Múltiplas "Alteração X"',
    esperado: 2,
    texto: `Alteração Carrefour - Campo Grande
Entra: KRW-8E86 motorista RENAN cod 184357
Sai: KVI-9088 motorista JHON cod 772

Alteração Prezunic - Caxias Centenário
Entra: LQE-5401 motorista SIDNEY cod 674
Sai: -`,
  },
  {
    nome: 'Caso 2: Filial N (zona sul)',
    esperado: 2,
    texto: `Alteração zona sul
Filial 30
Entra: KRW-8E86 RENAN 184357
Sai: KVI-9088 JHON 772

Filial 21
Entra: LQE-5401 SIDNEY 674`,
  },
  {
    nome: 'Caso 3: Texto livre sem "Alteração"',
    esperado: 2,
    texto: `Carrefour - Campo Grande
Entra: KRW-8E86 RENAN
Sai: KVI-9088 JHON

Prezunic - Caxias
Entra: LQE-5401 SIDNEY`,
  },
  {
    nome: 'Caso 4: WhatsApp narrativo',
    esperado: 2,
    texto: `Carrefour Campo Grande: troca pelo KRW-8E86 RENAN cod 184357
Prezunic Caxias Centenário agora é LQE-5401 SIDNEY cod 674`,
  },
  {
    nome: 'Caso 5: Lista com bullets',
    esperado: 3,
    texto: `- Carrefour Campo Grande: entra KRW-8E86 RENAN
- Prezunic Caxias: entra LQE-5401 SIDNEY
- Sams Club Niteroi: entra ABC-1D23 ZOZIMO`,
  },
  {
    nome: 'Caso 6: Apenas placas e nomes (curto)',
    esperado: 2,
    texto: `Carrefour Campo Grande → KRW-8E86 RENAN
Prezunic Caxias → LQE-5401 SIDNEY`,
  },
]

for (const c of casos) {
  process.stdout.write(`\n=== ${c.nome} ===\n`)
  const blocos = splitAlteracoes(c.texto)
  const parseados = blocos.map(b => parseAlteracaoText(b)).filter(r => r.entra || r.sai)
  const tag = parseados.length === c.esperado ? '✓' : '✗'
  process.stdout.write(`${tag} blocos=${blocos.length} parseados_com_dados=${parseados.length}/${c.esperado}\n`)
  for (const p of parseados) {
    const sai = p.sai?.placa_norm ?? '-'
    const entra = p.entra?.placa_norm ?? '-'
    process.stdout.write(`   rede=${p.rede_id ?? '?'} loja="${(p.loja_nome_raw ?? '?').slice(0, 30)}" entra=${entra} sai=${sai} conf=${p.confianca}\n`)
  }
}
