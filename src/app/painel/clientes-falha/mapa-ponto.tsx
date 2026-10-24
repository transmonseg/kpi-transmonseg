'use client'

// F4-07 (GEO-24): mapa do painel "Corrigir ponto". Mostra o ponto que o KPI
// usou, o ponto guardado do cliente e as evidências (paradas repetidas da
// placa e cadastro da Unitrac). Só no modo "marcar no mapa" (admin) aparece o
// pino arrastável. Cor única navy; o tipo é dito no texto, não só na cor.
import { useMemo } from 'react'
import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type PontoMapa = { id: string; lat: number; lng: number; rotulo: string; tipo: 'atual' | 'guardado' | 'parada' | 'cadastro'; destaque?: boolean }

const NAVY = '#1F3864' // --color-navy-700
const RAIO: Record<PontoMapa['tipo'], number> = { atual: 7, guardado: 9, parada: 8, cadastro: 6 }

const pino = L.divIcon({
  className: '',
  html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:${NAVY};border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
})

export default function MapaPonto({ pontos, pinoEm, onMoverPino }: {
  pontos: PontoMapa[]
  /** Admin marcando o ponto: posição do pino arrastável. */
  pinoEm?: { lat: number; lng: number } | null
  onMoverPino?: (p: { lat: number; lng: number }) => void
}) {
  const centro = useMemo<[number, number]>(() => {
    const ps = pinoEm ? [pinoEm, ...pontos] : pontos
    if (!ps.length) return [-22.9068, -43.1729]
    return [ps.reduce((s, p) => s + p.lat, 0) / ps.length, ps.reduce((s, p) => s + p.lng, 0) / ps.length]
  }, [pontos, pinoEm])

  return (
    <MapContainer center={centro} zoom={14} scrollWheelZoom={false} style={{ height: 360, width: '100%', borderRadius: 16 }}>
      <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap &copy; CARTO" />
      {pontos.map(p => (
        <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={RAIO[p.tipo] + (p.destaque ? 3 : 0)}
          pathOptions={{ color: NAVY, weight: p.tipo === 'atual' ? 1.5 : 2.5, fillColor: p.tipo === 'atual' ? '#ffffff' : NAVY, fillOpacity: p.tipo === 'cadastro' ? 0.25 : p.tipo === 'atual' ? 0.9 : 0.6, dashArray: p.tipo === 'cadastro' ? '3 3' : undefined }}>
          <Tooltip>{p.rotulo}</Tooltip>
        </CircleMarker>
      ))}
      {pinoEm && onMoverPino && (
        <Marker position={[pinoEm.lat, pinoEm.lng]} icon={pino} draggable
          eventHandlers={{ dragend: e => { const ll = (e.target as L.Marker).getLatLng(); onMoverPino({ lat: Number(ll.lat.toFixed(6)), lng: Number(ll.lng.toFixed(6)) }) } }}>
          <Tooltip permanent direction="top" offset={[0, -22]}>Arraste até o lugar certo</Tooltip>
        </Marker>
      )}
    </MapContainer>
  )
}
