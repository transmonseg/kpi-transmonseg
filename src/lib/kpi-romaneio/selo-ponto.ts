// F4-07 (GEO-24): selo de precisão do ponto do cliente e raio do círculo de
// incerteza no mapa ("Ver no monitoramento" e mini-mapa da fila Conferir). O
// raio só sai da precisão informada pela cascata do CNEFE (mesmos raios da
// ponte do monitoramento: romaneio-geocode.ts/cnefe-escolha.ts); sem precisão
// conhecida fica só o selo. Correção à mão e cadastro vêm primeiro.
export type CodigoSelo = 'manual' | 'cadastro' | 'exato' | 'exato_nao_confirmado' | 'interpolado' | 'trecho' | 'rua' | 'bairro' | 'aproximado'

const RAIO_POR_PRECISAO: Record<string, number> = { exato: 30, exato_nao_confirmado: 30, interpolado: 50, trecho: 300, rua: 1000 }

export function seloPonto(p: { precisao?: string | null; fonte?: string | null; impreciso?: boolean }): { codigo: CodigoSelo; raioM: number | null } | null {
  if (p.fonte === 'manual' || p.fonte === 'verificacao_manual') return { codigo: 'manual', raioM: null }
  if (p.fonte === 'cadastro_unitrac') return { codigo: 'cadastro', raioM: null }
  if (p.precisao && p.precisao in RAIO_POR_PRECISAO) return { codigo: p.precisao as CodigoSelo, raioM: RAIO_POR_PRECISAO[p.precisao] }
  if (p.fonte === 'cnefe_bairro') return { codigo: 'bairro', raioM: null }
  if (p.impreciso) return { codigo: 'aproximado', raioM: null }
  return null
}

export const ROTULO_SELO: Record<CodigoSelo, string> = {
  manual: 'Ponto corrigido à mão',
  cadastro: 'Cadastro da Unitrac',
  exato: 'Número exato',
  exato_nao_confirmado: 'Número sem CEP/bairro confirmando',
  interpolado: 'Entre números da rua',
  trecho: 'Trecho da rua',
  rua: 'Só a rua',
  bairro: 'Centro do bairro',
  aproximado: 'Ponto aproximado',
}
