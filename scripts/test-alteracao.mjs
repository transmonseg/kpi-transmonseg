import { parseAlteracaoText } from '../src/lib/parsers/alteracao-text.ts'

const CASOS = [
  {
    nome: 'SUBSTITUICAO típica (Prezunic)',
    texto: `🚨ALTERAÇÃO 🚨
Prezunic Caxias centenário, Caxias centro
Entra: Sidnei 674 LQE5401
Sai : Anderson 811 LCE4337
Motivo: Pneu do caminhão furou`,
  },
  {
    nome: 'Mercosul placa + obs com ponto',
    texto: `🚨ALTERAÇÃO
Carrefour Madureira
Entra: João 123 UBO5E05
Sai: Pedro 456 LFK-2C56
Obs:. trocou veículo no caminho`,
  },
  {
    nome: 'INCLUSAO (só entra)',
    texto: `Princesa Niterói
Entra: Carlos 99 lqe5h01`,
  },
  {
    nome: 'COMUNICADO',
    texto: `Comunicado: Hoje o Sam's Club Barra começa carregamento às 14h.`,
  },
  {
    nome: 'INFORMATIVO (segunda viagem)',
    texto: `Guanabara Rota 7 — segunda viagem com carro já escalado, motorista Moises.`,
  },
  {
    nome: 'Sai com espaço antes do dois pontos',
    texto: `Atacadão Bangu
ENTRA: WAGNER 22 abc1234
SAI : MARCIO 33 def-5678`,
  },
  {
    nome: 'Sem rede identificável',
    texto: `Loja XYZ
Entra: Joao 11 ABC1234`,
  },
]

for (const c of CASOS) {
  console.log('\n===', c.nome, '===')
  const r = parseAlteracaoText(c.texto)
  console.log('  tipo       :', r.tipo)
  console.log('  rede_id    :', r.rede_id)
  console.log('  loja_raw   :', r.loja_nome_raw)
  console.log('  entra      :', r.entra)
  console.log('  sai        :', r.sai)
  console.log('  motivo     :', r.motivo)
  console.log('  confianca  :', r.confianca)
}
