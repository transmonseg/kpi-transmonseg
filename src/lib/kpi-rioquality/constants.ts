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

// Faixa ampliada de confirmacao (achado 05/09, conferencia manual de 20
// entregas): o romaneio da Rio Quality nao tem NUMERO, entao a coordenada e'
// de trecho de rua. Duas entregas com geocode comprovadamente certo (85m da
// Rua Raul Pompeia; Rua Beira Rio em Mage) ficaram pendentes porque a parada
// estava a 607m e 547m. Entre RAIO_ENTREGA_METROS e este valor a entrega
// confirma, mas sai MARCADA no relatorio (nunca como confirmacao normal).
export const RAIO_CONFIRMACAO_AMPLIADO_METROS = 800

// Corredor da rua (relatorio rq-mesmo-lugar-e-sem-rastreador.md, 01/10): a RQ
// nao manda NUMERO, entao todos os clientes de uma rua caem num ponto so'
// (o da ponta mais perto do centro). Entrega pendente confirma quando a
// PROPRIA placa parou >= PERMANENCIA_MIN_CORREDOR_MIN a <= RAIO_PARADA_
// CORREDOR_M de QUALQUER ponto CNEFE da mesma rua no mesmo municipio (ate'
// RAIO_MAX_CORREDOR_M do ponto aproximado). Medido no relatorio: recupera
// 123 de 209 falsos negativos, placebo (paradas de outra placa) 2,4%.
export const RAIO_PARADA_CORREDOR_M = 200
export const PERMANENCIA_MIN_CORREDOR_MIN = 2
export const RAIO_MAX_CORREDOR_M = 8_000
// O ponto aproximado precisa estar perto de algum ponto da rua (senao o
// geocode nao e' desta rua/municipio e o corredor nao vale).
export const RAIO_ANCORAGEM_CORREDOR_M = 2_000
// Rua "longa": pontos CNEFE espalhados por mais que isto -- sem parada na
// rua, o pendente sai 'COORDENADA APROXIMADA (RUA SEM NUMERO) - CONFERIR'
// em vez de 'NAO FOI AO CLIENTE' (o ponto pode estar longe do cliente).
export const EXTENSAO_RUA_LONGA_M = 1_000
