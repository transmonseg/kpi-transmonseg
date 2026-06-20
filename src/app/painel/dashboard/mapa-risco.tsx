'use client'

import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

export type PontoRisco = { placa: string; hora: string; duracaoMin: number; lat: number; lng: number }

// Mapa das paradas indevidas (FORA_BASE) — bolinha por parada, tamanho pela duração.
// CircleMarker evita o problema clássico de ícone do Leaflet em bundler. Carregado
// via dynamic import (ssr:false) porque o Leaflet precisa de window.
export default function MapaRisco({ pontos }: { pontos: PontoRisco[] }) {
  const validos = pontos.filter(p => p.lat != null && p.lng != null && Math.abs(p.lat) > 1)
  const center: [number, number] = validos.length
    ? [validos.reduce((s, p) => s + p.lat, 0) / validos.length, validos.reduce((s, p) => s + p.lng, 0) / validos.length]
    : [-22.9068, -43.1729] // Centro do Rio (fallback)

  return (
    <MapContainer
      center={center}
      zoom={11}
      scrollWheelZoom={false}
      style={{ height: 380, width: '100%', borderRadius: 'var(--radius-card)' }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {validos.map((p, i) => (
        <CircleMarker
          key={`${p.placa}-${i}`}
          center={[p.lat, p.lng]}
          radius={Math.min(5 + p.duracaoMin / 80, 16)}
          pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.45, weight: 1 }}
        >
          <Tooltip>{p.placa} · {p.duracaoMin} min · às {p.hora}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
