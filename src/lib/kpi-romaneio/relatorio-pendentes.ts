// Relatório "pendentes / não entregues" da tela Ao vivo (pedido da cliente
// 15/10): tudo que ainda não foi entregue, uma linha por NF. Função pura sobre
// o que a tela já tem carregado -- nenhuma regra de KPI nova aqui.
import type { NfAoVivo, PlacaAoVivo, SituacaoNf } from './ao-vivo'
import { ROTULO_INVESTIGACAO, fraseInvestigacao } from './investigacao-rotulos'

export const ROTULO_SITUACAO_NF: Record<SituacaoNf, string> = {
  entregue: 'Entregue',
  sem_rastreador: 'Sem rastreador',
  pendente: 'Pendente',
  nao_confirmada: 'Não confirmada',
  nao_foi: 'Não foi ao cliente',
  revisar: 'A revisar',
}

export type LinhaPendente = {
  placa: string
  motorista: string
  carga: string
  nf: string
  cliente: string
  endereco: string
  situacao: string
  chegada: string
  saida: string
  tempoMin: number | ''
  gps: string
}

export const COLUNAS_PENDENTES: { chave: keyof LinhaPendente; titulo: string; largura: number }[] = [
  { chave: 'placa', titulo: 'Placa', largura: 11 },
  { chave: 'motorista', titulo: 'Motorista', largura: 22 },
  { chave: 'carga', titulo: 'Carga', largura: 9 },
  { chave: 'nf', titulo: 'NF', largura: 11 },
  { chave: 'cliente', titulo: 'Cliente', largura: 34 },
  { chave: 'endereco', titulo: 'Endereço', largura: 44 },
  { chave: 'situacao', titulo: 'Situação', largura: 19 },
  { chave: 'chegada', titulo: 'Chegada', largura: 9 },
  { chave: 'saida', titulo: 'Saída', largura: 9 },
  { chave: 'tempoMin', titulo: 'Tempo (min)', largura: 11 },
  { chave: 'gps', titulo: 'O que o GPS mostra', largura: 60 },
]

function textoGps(n: NfAoVivo): string {
  if (!n.investigacao) return ''
  const titulo = ROTULO_INVESTIGACAO[n.investigacao.categoria].titulo
  return `${titulo}. ${fraseInvestigacao(n.investigacao)}`
}

/** Todas as NFs que não estão entregues, ordenadas por placa e carga. */
export function linhasPendentes(placas: PlacaAoVivo[]): LinhaPendente[] {
  const linhas: LinhaPendente[] = []
  for (const p of placas) {
    for (const n of p.nfs) {
      if (n.situacao === 'entregue') continue
      linhas.push({
        placa: p.placa,
        motorista: p.motorista ?? '',
        carga: n.carga,
        nf: n.nf,
        cliente: n.cliente,
        endereco: n.endereco,
        situacao: ROTULO_SITUACAO_NF[n.situacao],
        chegada: n.chegada ?? '',
        saida: n.saida ?? '',
        tempoMin: n.tempoMin ?? '',
        gps: textoGps(n),
      })
    }
  }
  const cmp = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true })
  return linhas.sort((a, b) => cmp(a.placa, b.placa) || cmp(a.carga, b.carga) || cmp(a.nf, b.nf))
}
