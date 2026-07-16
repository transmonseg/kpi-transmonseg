/** Nome cadastrado da garagem/CD da Nutry Max no Unitrac — aparece em
 *  `local_parada` como "BASE - BASE GARAGEM, ...". Diferente do Benassi
 *  ("BASE BENASSI"), por isso não dá pra usar o default do parser. */
export const MARCADOR_BASE_NUTRIMAX = 'BASE - BASE GARAGEM'

/** Coordenada do CD/garagem da Nutry Max — derivada de 48 paradas reais
 *  classificadas BASE após o fix do marcador (commit a13331c), média das
 *  coordenadas (todas a poucos metros uma da outra). Usada por
 *  `consolidaParadasApi` pra classificar paradas via API como BASE (raio
 *  de 500m em volta). */
export const BASE_COORD_NUTRIMAX = { lat: -22.816007, lng: -43.277827 }
