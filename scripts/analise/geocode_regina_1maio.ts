// REGINA 1 DE MAIO — Rua Primeiro de Maio, 165, Várzea, Teresópolis (perto rodoviária)
const TENTATIVAS = [
  'Rua Primeiro de Maio 165 Várzea Teresópolis',
  'Rua Primeiro de Maio Várzea Teresópolis Rio de Janeiro',
  'Supermercado Regina Primeiro de Maio Teresópolis',
  'Rua 1° de Maio Teresópolis RJ',
  'Rodoviária Teresópolis',  // referência
]

;(async () => {
  for (const q of TENTATIVAS) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=2`
    const resp = await fetch(url, { headers: { 'User-Agent': 'kpi-transmonseg-geocoding' } })
    const data = await resp.json() as Array<{ lat: string; lon: string; display_name: string }>
    console.log(`\nQuery: ${q}`)
    for (const r of data) console.log(`  → ${r.lat},${r.lon}  | ${r.display_name.slice(0,90)}`)
    await new Promise(r => setTimeout(r, 1100))
  }
})()
