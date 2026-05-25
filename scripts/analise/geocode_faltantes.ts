const ENDERECOS = [
  { nome: 'REGINA 1 DE MAIO',                 addr: 'Rua Primeiro de Maio, 165, Várzea, Teresópolis, RJ 25955-010' },
  { nome: 'ABASTECEDORA GRAO DA SERRA (ALTO)',addr: 'Avenida Oliveira Botelho, 328, Alto, Teresópolis, RJ 25961-146' },
]

;(async () => {
  for (const e of ENDERECOS) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(e.addr)}&limit=1`
    const resp = await fetch(url, { headers: { 'User-Agent': 'kpi-transmonseg-geocoding' } })
    const data = await resp.json() as Array<{ lat: string; lon: string; display_name: string }>
    if (data.length > 0) {
      const r = data[0]
      console.log(`✓ ${e.nome.padEnd(40)} ${r.lat},${r.lon}  | ${r.display_name.slice(0, 90)}`)
    } else {
      console.log(`✗ ${e.nome.padEnd(40)} NÃO ENCONTRADO`)
    }
    await new Promise(r => setTimeout(r, 1100))
  }
})()
