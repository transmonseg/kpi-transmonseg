import { buscarFrota, buscarAlvos, buscarStopsCru, consolidaParadasApi, type AlvoApi } from '@/lib/unitrac-api'
// UnitracParadaRow é definido em matcher.ts (Benassi), não em unitrac-api --
// consolida.ts importa de lá mas não reexporta.
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { COD_USER_NUTRIMAX, BASES_COORD_NUTRIMAX } from './constants'

/** Alvos (plano de entregas) do dia pras placas da escala. Resolve placa → cv
 *  via frota da conta Nutrimax; placa sem correspondência na frota é ignorada
 *  (best-effort, nunca lança). */
export async function buscarAlvosDoDia(placas: string[]): Promise<AlvoApi[]> {
  const frota = await buscarFrota(COD_USER_NUTRIMAX)
  const cvs = frota.filter(v => placas.includes(v.placaNorm)).map(v => v.cv)
  if (cvs.length === 0) return []
  return buscarAlvos(cvs)
}

/** GPS real do dia pra uma placa, classificado só em BASE/FORA_BASE --
 *  NUNCA LOJA (a geofence de loja da Unitrac tem erro conhecido, não
 *  usamos ela pra decidir visita -- ver montarVisitas.ts, task futura). */
export async function buscarParadasDoDia(cv: string, placaNorm: string, data: string, horas: number): Promise<UnitracParadaRow[]> {
  const eventos = await buscarStopsCru(cv, horas)
  // pontos={} garante que consolidaParadasApi nunca resolve geofence de
  // loja (acharLojaPorCoordenada itera Object.values({}) = vazio, sempre
  // retorna null) -- todo cluster fora da base vira FORA_BASE, que é
  // exatamente a granularidade que queremos (a classificação real de
  // visita é nossa, feita em montarVisitas.ts contra o endereço geocodificado).
  return consolidaParadasApi(eventos, {}, data, placaNorm, BASES_COORD_NUTRIMAX)
}

// Achado real 12/09 (auditoria KPI Nutry Max): buscarStopsCru so' alcanca
// 48h. No dia 12 nao dava mais pra reprocessar o dia 10 pra medir o efeito
// das correcoes de geocode -- e' o mesmo teto que ja bloqueia reauditoria de
// qualquer dia passado. O monitoramento guarda posicao continua PERMANENTE,
// entao da' pra montar as mesmas paradas de la (ver derivarParadas na rota
// /api/kpi/base-horarios). Converte pro formato que o resto do pipeline ja'
// consome (UnitracParadaRow), sem geofence de loja -- BASE/FORA_BASE so',
// mesma granularidade de buscarParadasDoDia.
// LIMITE CONHECIDO, medido no dia 09/09 (2361 NFs, mesmo dia pelos dois
// caminhos): a ponte confirma 1978 entregas contra 2075 do feed da Unitrac.
// A diferenca NAO e' o piso de duracao (testado 5min e 2min, mesmo numero) --
// e' APAGAO DE SINAL. Quando o rastreador para de comunicar, o polling deste
// projeto continua gravando a ULTIMA posicao conhecida (com atraso_min
// subindo), entao a posicao continua fica congelada e nao ha dwell pra
// derivar; ja o feed da Unitrac recebe o trecho em lote quando o aparelho
// reconecta, e mostra as paradas que aconteceram no apagao. Caso documentado
// nesta sessao: RQV3G18 em 09/09, atraso subindo de 2 para 34+ min enquanto
// a placa rodava Trapiche/Macae.
//
// Por isso a ordem importa e esta como esta: DENTRO das 48h manda o feed da
// Unitrac; fora dele, a ponte -- que e' pior que o feed, mas
// incomparavelmente melhor que nao poder reprocessar o dia nenhum.
//
// Proximo passo pra fechar essa lacuna: persistir as paradas da Unitrac no
// momento da geracao (elas ja sao buscadas), pra que reprocessar um dia
// antigo use exatamente a mesma entrada que gerou os numeros originais.
export function paradasDaPonte(
  paradas: { chegada: string; saida: string; duracaoSeg: number; lat: number; lng: number; classificacao: 'BASE' | 'FORA_BASE' }[],
  placaNorm: string,
): UnitracParadaRow[] {
  return paradas.map((p, i) => ({
    id: `${placaNorm}-ponte-${i + 1}`,
    placa_norm: placaNorm,
    chegada: p.chegada,
    saida: p.saida,
    // A ponte devolve o fim REAL da permanencia (ultima leitura parada), nao
    // a chegada do proximo lugar -- entao fim_real e saida coincidem aqui,
    // diferente do feed da Unitrac (ver consolidaParadasApi).
    fim_real: p.saida,
    duracao_seg: p.duracaoSeg,
    local_parada: p.classificacao === 'BASE' ? 'BASE' : 'FORA DE BASE E LOCAL DE SERVICO',
    codigo_loja: null,
    nome_loja: null,
    lat: p.lat,
    lng: p.lng,
    endereco: null,
    classificacao: p.classificacao,
    ordem: i + 1,
  }))
}
