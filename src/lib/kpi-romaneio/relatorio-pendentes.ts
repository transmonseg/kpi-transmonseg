// Relatório "pendentes / não entregues" da tela Ao vivo (pedido da cliente
// 15/10): tudo que ainda não foi entregue, uma linha por NF. Função pura sobre
// o que a tela já tem carregado -- nenhuma regra de KPI nova aqui.
// F1-10 (ACH-06, 22/10: 90 linhas no arquivo contra 70 pendências na conta):
// separado em três abas pelo que pesa na taxa, com rota, motivo, o que fazer
// e o link do mapa.
import { nfsForaDaConta, type NfAoVivo, type PlacaAoVivo, type SituacaoNf } from './ao-vivo'
import { ROTULO_INVESTIGACAO, fraseInvestigacao } from './investigacao-rotulos'

export const ROTULO_SITUACAO_NF: Record<SituacaoNf, string> = {
  entregue: 'Entregue',
  sem_rastreador: 'Sem rastreador',
  pendente: 'Pendente',
  nao_confirmada: 'Não confirmada',
  nao_foi: 'Não foi ao cliente',
  revisar: 'A revisar',
  fora_da_conta: 'Fora da conta',
}

export type LinhaPendente = {
  placa: string
  motorista: string
  rota: string
  carga: string
  nf: string
  cliente: string
  endereco: string
  situacao: string
  motivo: string
  oQueFazer: string
  chegada: string
  saida: string
  tempoMin: number | ''
  gps: string
  mapa: string
}

export const COLUNAS_PENDENTES: { chave: keyof LinhaPendente; titulo: string; largura: number }[] = [
  { chave: 'placa', titulo: 'Placa', largura: 11 },
  { chave: 'motorista', titulo: 'Motorista', largura: 22 },
  { chave: 'rota', titulo: 'Rota', largura: 20 },
  { chave: 'carga', titulo: 'Carga', largura: 9 },
  { chave: 'nf', titulo: 'NF', largura: 11 },
  { chave: 'cliente', titulo: 'Cliente', largura: 34 },
  { chave: 'endereco', titulo: 'Endereço', largura: 44 },
  { chave: 'situacao', titulo: 'Situação', largura: 19 },
  { chave: 'motivo', titulo: 'Motivo', largura: 60 },
  { chave: 'oQueFazer', titulo: 'O que fazer', largura: 50 },
  { chave: 'chegada', titulo: 'Chegada', largura: 9 },
  { chave: 'saida', titulo: 'Saída', largura: 9 },
  { chave: 'tempoMin', titulo: 'Tempo (min)', largura: 11 },
  { chave: 'gps', titulo: 'O que o GPS mostra', largura: 60 },
  { chave: 'mapa', titulo: 'Ver no mapa', largura: 14 },
]

function textoGps(n: NfAoVivo): string {
  if (!n.investigacao) return ''
  const titulo = ROTULO_INVESTIGACAO[n.investigacao.categoria].titulo
  return `${titulo}. ${fraseInvestigacao(n.investigacao)}`
}

// O que a operação faz com cada motivo (status do KPI, por prefixo). Só
// orienta: nenhuma ação aqui muda a taxa.
const O_QUE_FAZER: [string, string][] = [
  ['CARGA SEM PLACA', 'Informar a placa que fez a carga (troca de placa no Ao vivo) e gerar de novo'],
  ['PLACA DA ESCALA NÃO PASSOU', 'Conferir qual carro fez a carga e corrigir a placa (troca de placa) antes de gerar de novo'],
  ['VEÍCULO NÃO SAIU DA BASE', 'Confirmar com a operação se a carga saiu em outro carro e registrar a troca de placa'],
  ['CONSULTA AO RASTREADOR', 'O rastreador não respondeu: gerar de novo mais tarde'],
  ['AGUARDANDO', 'Rota em andamento: aguardar o fim da rota'],
  // D-03/D-04 (plano mestre 23/10).
  ['PLACA PROVISÓRIA', 'Informar o carro que fez a carga (troca de placa no Ao vivo) e gerar de novo; até lá fica fora da conta'],
  ['PLACA FICTÍCIA', 'Informar o carro que fez a carga (troca de placa no Ao vivo) e gerar de novo; até lá fica fora da conta'],
  ['SEM RASTREADOR - CONTADA COMO CORRETA - PLACA FORA DA FROTA', 'Conta como correta. Confirmar a placa real (a provável está no rótulo) com a troca de placa no Ao vivo'],
  ['SEM RASTREADOR', 'Conta como correta. Se a placa for provisória, informar a placa real; senão, conferir o equipamento'],
  ['CADASTRO DO CLIENTE NA UNITRAC DIVERGE', 'Corrigir o cadastro do cliente na Unitrac (ponto longe do endereço do romaneio)'],
  ['ENDEREÇO COM COORDENADA IMPRECISA', 'Conferir o ponto do cliente no mapa (endereço sem coordenada exata)'],
  ['COORDENADA APROXIMADA', 'Conferir o ponto do cliente no mapa (endereço sem coordenada exata)'],
  ['ENDEREÇO NÃO LOCALIZADO', 'Conferir o endereço do cliente no cadastro'],
  ['NÃO FOI AO CLIENTE', 'Confirmar com o motorista e pedir o canhoto, se houve entrega'],
  ['VEÍCULO SEM MOVIMENTO', 'Conferir o rastreador do carro e confirmar com o motorista'],
]
function oQueFazer(status: string): string {
  return O_QUE_FAZER.find(([p]) => status.startsWith(p))?.[1] ?? 'Conferir no mapa se a parada do caminhão foi a entrega'
}

export type OpcoesLink = { origem: string; data: string; cliente: string }

function linkMapa(placa: string, nf: string, o?: OpcoesLink): string {
  if (!o) return ''
  return `${o.origem}/painel/ao-vivo?${new URLSearchParams({ placa, nf, data: o.data, cliente: o.cliente }).toString()}`
}

const cmp = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true })
const ordenar = (linhas: LinhaPendente[]) => linhas.sort((a, b) => cmp(a.placa, b.placa) || cmp(a.carga, b.carga) || cmp(a.nf, b.nf))

function linha(p: PlacaAoVivo, n: NfAoVivo, link?: OpcoesLink): LinhaPendente {
  return {
    placa: p.placa,
    motorista: p.motorista ?? '',
    rota: p.destino ?? '',
    carga: n.carga,
    nf: n.nf,
    cliente: n.cliente,
    endereco: n.endereco,
    situacao: ROTULO_SITUACAO_NF[n.situacao],
    motivo: n.status,
    oQueFazer: oQueFazer(n.status),
    chegada: n.chegada ?? '',
    saida: n.saida ?? '',
    tempoMin: n.tempoMin ?? '',
    gps: textoGps(n),
    mapa: linkMapa(p.placa, n.nf, link),
  }
}

/** Todas as NFs que não estão entregues, ordenadas por placa e carga. */
export function linhasPendentes(placas: PlacaAoVivo[], link?: OpcoesLink): LinhaPendente[] {
  const linhas: LinhaPendente[] = []
  for (const p of placas) for (const n of p.nfs) if (n.situacao !== 'entregue') linhas.push(linha(p, n, link))
  return ordenar(linhas)
}

export type AbasPendentes = { afetam: LinhaPendente[]; fora: LinhaPendente[]; semRastreador: LinhaPendente[] }

/** F1-10: as não entregues em três abas. "Afetam a taxa" = denominador −
 *  entregues; "Fora da conta" = o que a taxa não conta (inclui rota ainda em
 *  andamento); "Sem rastreador" = contadas como corretas. Lê também o STATUS,
 *  pra situação antiga gravada (carga sem placa como "revisar"). */
export function linhasPendentesPorAba(placas: PlacaAoVivo[], link?: OpcoesLink): AbasPendentes {
  const abas: AbasPendentes = { afetam: [], fora: [], semRastreador: [] }
  for (const p of placas) {
    const fora = nfsForaDaConta(p.nfs)
    for (const n of p.nfs) {
      if (n.situacao === 'entregue') continue
      const l = linha(p, n, link)
      if (n.situacao === 'sem_rastreador') abas.semRastreador.push(l)
      else if (n.situacao === 'fora_da_conta' || n.situacao === 'pendente' || fora.has(`${n.carga}::${n.nf}`)) abas.fora.push(l)
      else abas.afetam.push(l)
    }
  }
  ordenar(abas.afetam); ordenar(abas.fora); ordenar(abas.semRastreador)
  return abas
}
