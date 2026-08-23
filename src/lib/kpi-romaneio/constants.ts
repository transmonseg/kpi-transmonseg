/** Codigo da conta Nutry Max na Unitrac. */
export const COD_USER_NUTRIMAX = '4096'

/** Nome cadastrado da garagem/CD da Nutry Max no Unitrac -- aparece em
 *  `local_parada` como "BASE - BASE GARAGEM, ...". Diferente do Benassi
 *  ("BASE BENASSI"). Migrado de kpi-nutrimax/constants.ts (destruido na
 *  Task 1) -- valor derivado de dado real, nao muda com a reconstrucao. */
export const MARCADOR_BASE_NUTRIMAX = 'BASE - BASE GARAGEM'

/** Coordenada do CD/garagem da Nutry Max em Penha (RJ) -- media de 48
 *  paradas reais classificadas BASE. */
export const BASE_COORD_NUTRIMAX = { lat: -22.816007, lng: -43.277827 }

/** Segunda garagem, Campos dos Goytacazes -- confirmada via GPS ao vivo
 *  (placas TUL1C38/TUI1A90 pernoitando la, ~238km de Penha, fora do raio
 *  da primeira base). Sem essa segunda coordenada, toda placa baseada em
 *  Campos nunca e reconhecida como BASE. */
export const BASE_COORD_NUTRIMAX_CAMPOS = { lat: -21.6886, lng: -41.3113 }

export const BASES_COORD_NUTRIMAX = [BASE_COORD_NUTRIMAX, BASE_COORD_NUTRIMAX_CAMPOS]

/** Raio de deteccao de base -- documentacional/cross-reference. O valor
 *  que REALMENTE vale em runtime e' RAIO_BASE_M em
 *  src/lib/unitrac-api/consolida.ts (tambem 500m hoje) -- consolidaParadasApi
 *  nao recebe raio como parametro, usa a constante interna dela. Se os dois
 *  valores divergirem no futuro, o de consolida.ts e' quem manda; atualize
 *  este comentario, nao passe este numero pra nenhuma chamada (nao ha
 *  parametro que aceite). */
export const RAIO_BASE_METROS = 500

/** Raio do perimetro PROPRIO em volta de cada ponto geocodificado do
 *  romaneio -- mesmo valor ja validado com dado real no projeto irmao
 *  monitoramento pra confirmacao de presenca por GPS (ajuste de 18/08,
 *  ver src/app/api/motor-romaneio/route.ts la). Comeca aqui como o mesmo
 *  valor por ser o unico dado real disponivel sobre precisao de
 *  geocodificacao de endereco brasileiro urbano -- reavaliar com dado
 *  real da Nutry Max especificamente depois da Task 11 (validacao). */
export const RAIO_ENTREGA_METROS = 300

/** `buscarStopsCru` so cobre as ultimas 48h (hoje + ontem) de forma
 *  garantida -- pedir data mais antiga devolve 0 veiculos em silencio.
 *  Migrado de kpi-nutrimax/constants.ts. */
export const DIAS_ALCANCE_API_HOJE_ONTEM = 1

export function foraDoAlcanceApi(data: string, hojeISO: string): boolean {
  const hoje = new Date(`${hojeISO}T00:00:00`).getTime()
  const alvo = new Date(`${data}T00:00:00`).getTime()
  const diffDias = Math.round((hoje - alvo) / 86_400_000)
  // diffDias < 0 == data pedida no futuro -- a API nao tem esse dado (so'
  // cobre hoje/ontem), entao e' tao fora de alcance quanto uma data antiga.
  return diffDias < 0 || diffDias > DIAS_ALCANCE_API_HOJE_ONTEM
}
