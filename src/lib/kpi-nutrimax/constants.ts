/** Nome cadastrado da garagem/CD da Nutry Max no Unitrac — aparece em
 *  `local_parada` como "BASE - BASE GARAGEM, ...". Diferente do Benassi
 *  ("BASE BENASSI"), por isso não dá pra usar o default do parser. */
export const MARCADOR_BASE_NUTRIMAX = 'BASE - BASE GARAGEM'

/** Coordenada do CD/garagem da Nutry Max em Penha (RJ) — derivada de 48 paradas
 *  reais classificadas BASE após o fix do marcador (commit a13331c), média das
 *  coordenadas (todas a poucos metros uma da outra). Usada por
 *  `consolidaParadasApi` pra classificar paradas via API como BASE (raio
 *  de 500m em volta). */
export const BASE_COORD_NUTRIMAX = { lat: -22.816007, lng: -43.277827 }

/** Segunda garagem da Nutry Max, em Campos dos Goytacazes — descoberta
 *  2026-07-18 (relato do cliente + confirmação via GPS ao vivo: TUL1C38 e
 *  TUI1A90 pernoitando no mesmo ponto, a ~238km da base de Penha, então fora
 *  do raio de 500m dela). Sem essa segunda coordenada, `consolidaParadasApi`
 *  nunca reconhece a garagem de Campos como BASE pras placas baseadas lá —
 *  vira FORA_BASE (ou LOJA, se cair perto de algum cliente cadastrado). */
export const BASE_COORD_NUTRIMAX_CAMPOS = { lat: -21.6886, lng: -41.3113 }

export const BASES_COORD_NUTRIMAX = [BASE_COORD_NUTRIMAX, BASE_COORD_NUTRIMAX_CAMPOS]
