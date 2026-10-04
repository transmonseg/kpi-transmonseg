'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

export type PontoRisco = { placa: string; hora: string; duracaoMin: number; lat: number; lng: number }

// Severidade pela duração da parada — cor + rótulo (não depende só de cor: o
// tamanho da bolha também cresce com a duração, e o popup diz por extenso).
function severidade(min: number) {
  if (min >= 90) return { cor: '#ef4444', label: 'crítica' } // ≥ 1h30 parado
  if (min >= 30) return { cor: '#f97316', label: 'alta' }    // 30min – 1h30
  return { cor: '#eab308', label: 'moderada' }               // < 30min
}

const fmtDur = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

// Lê o tema atual (.dark no <html>) e reage a troca de tema em tempo real.
function useTemaDark() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const el = document.documentElement
    const ler = () => setDark(el.classList.contains('dark'))
    ler()
    const obs = new MutationObserver(ler)
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

// Mapa das paradas indevidas (FORA_BASE). Bolha por parada: cor pela severidade,
// tamanho pela duração. Hover mostra resumo; clique abre o detalhe (explicação).
export default function MapaRisco({ pontos }: { pontos: PontoRisco[] }) {
  const dark = useTemaDark()
  const validos = pontos.filter(p => p.lat != null && p.lng != null && Math.abs(p.lat) > 1)
  const center: [number, number] = validos.length
    ? [validos.reduce((s, p) => s + p.lat, 0) / validos.length, validos.reduce((s, p) => s + p.lng, 0) / validos.length]
    : [-22.9068, -43.1729] // Centro do Rio (fallback)

  // Tiles que acompanham o tema: escuro (CARTO Dark Matter) no dark, claro
  // (CARTO Positron) no light — combina com o fundo preto do painel.
  const tile = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'

  return (
    <div className="relative">
      <MapContainer
        center={center}
        zoom={11}
        scrollWheelZoom={false}
        style={{ height: 420, width: '100%', borderRadius: 'var(--radius-card)' }}
      >
        <TileLayer key={dark ? 'dark' : 'light'} url={tile} attribution='&copy; OpenStreetMap &copy; CARTO' />
        {validos.map((p, i) => {
          const s = severidade(p.duracaoMin)
          return (
            <CircleMarker
              key={`${p.placa}-${i}`}
              center={[p.lat, p.lng]}
              radius={Math.min(6 + p.duracaoMin / 70, 18)}
              pathOptions={{ color: s.cor, fillColor: s.cor, fillOpacity: 0.5, weight: 1.5 }}
            >
              <Tooltip>{p.placa} · {fmtDur(p.duracaoMin)}</Tooltip>
              <Popup>
                <div className="mapa-pop">
                  <div className="mapa-pop-placa">{p.placa}</div>
                  <div className="mapa-pop-sev" style={{ color: s.cor }}>● parada {s.label}</div>
                  <div className="mapa-pop-linha">Ficou <strong>{fmtDur(p.duracaoMin)}</strong> parado fora de loja e da base.</div>
                  <div className="mapa-pop-linha">Chegou às <strong>{p.hora}</strong>.</div>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>

      {/* Legenda — explica a cor (severidade) e o tamanho (duração) das bolhas. */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/90 px-3 py-2 text-[11px] shadow-soft backdrop-blur">
        <div className="mb-1 font-semibold text-[var(--color-fg)]">Tempo parado</div>
        <div className="flex items-center gap-1.5 text-[var(--color-fg-muted)]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#eab308' }} /> menos de 30min</div>
        <div className="flex items-center gap-1.5 text-[var(--color-fg-muted)]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#f97316' }} /> 30min a 1h30</div>
        <div className="flex items-center gap-1.5 text-[var(--color-fg-muted)]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#ef4444' }} /> mais de 1h30</div>
        <div className="mt-1 text-[10px] text-[var(--color-fg-subtle)]">Bolha maior = parada mais longa</div>
      </div>
    </div>
  )
}
