// Base (CD/garagem) da Rio Quality -- descoberta pelo GPS em 05/09: as 02:25
// da manha, 51 dos 59 caminhoes com CV estavam parados no mesmo ponto
// (raio maximo de 63m entre eles). Reverse geocode: Rua da Fe / Rua
// Madagascar, Parque Columbia (Pavuna), Rio de Janeiro, 21535-000. Nao veio
// de cadastro da Unitrac nem do cliente -- e' o lugar onde a frota dorme.
export const BASE_COORD_RIOQUALITY = { lat: -22.814247, lng: -43.344567 }
export const BASES_COORD_RIOQUALITY = [BASE_COORD_RIOQUALITY]

// Corroboracao por vizinhanca (mesma ideia do base-horarios da Nutry Max,
// que a Rio Quality nao usa porque nao esta' em posicoes_historico): entrega
// sem parada propria, mas com entrega IRMA (mesma placa) confirmada a ate'
// este raio, herda a visita dela -- marcada como viaVizinhanca.
export const RAIO_VIZINHANCA_METROS = 800
