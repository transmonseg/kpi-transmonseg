import { haversine } from '@/lib/utils/geo'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

// Nao existe hoje nenhuma funcao generica reusavel de "km real via distancia
// entre paradas GPS" no projeto. O unico "km" que aparece em outro lugar
// (`distancia_km` em src/lib/types/unitrac.ts / src/lib/parsers/unitrac-pdf.ts)
// vem de um campo de TEXTO de um relatorio PDF da Unitrac (fluxo Benassi) --
// fonte de dado incompativel com o que temos aqui (so eventos GPS crus via
// API, sem PDF de relatorio). O modulo especifico da Nutry Max que calculava
// km via ORS (`kpi-nutrimax/km-ors.ts`) foi destruido na Task 1 do
// romaneio-nutrimax e nunca foi generico o bastante pra reusar mesmo se
// existisse ainda.
//
// Implementacao enxuta pra Task 9: soma a distancia em linha reta (haversine)
// entre os centros de cluster de paradas GPS consecutivas do dia, na ordem
// em que aconteceram (`ordem`, ja preenchido sequencialmente por
// consolidaParadasApi). Isso subestima ligeiramente ruas com curva, mas e
// correto e monotonico com a distancia real percorrida -- suficiente ate a
// Task 11 (validacao com dado real) decidir se vale a pena trocar por
// distancia de rota real (ex.: ORS) entre paradas.

/** Km percorrido no dia por uma placa. Retorna `null` (nao `0`) quando ha
 *  menos de 2 paradas com coordenada -- "sem dado" e diferente de "km
 *  percorrido zero" (mesma filosofia de SAIDA CD/CHEGADA CD em
 *  agregarPorCarga: nunca inventa numero quando falta GPS). */
export function calcularKmPercorrido(paradas: UnitracParadaRow[]): number | null {
  const comCoord = paradas
    .filter((p): p is UnitracParadaRow & { lat: number; lng: number } => p.lat != null && p.lng != null)
    .slice()
    .sort((a, b) => a.ordem - b.ordem)

  if (comCoord.length < 2) return null

  let metros = 0
  for (let i = 1; i < comCoord.length; i++) {
    const a = comCoord[i - 1]
    const b = comCoord[i]
    metros += haversine(a.lat, a.lng, b.lat, b.lng)
  }
  return metros / 1000
}
