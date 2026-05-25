// Geocodifica endereços via Nominatim (OpenStreetMap, free, 1 req/sec)

const ENDERECOS = [
  // ARMAZEM DO GRÃO Petrópolis (do site oficial armazemdograo.com)
  { nome: 'ARMAZEM DO GRAO (CAPELA)',         addr: 'Rua Dr. Paulo Hervê, 955, Bingen, Petrópolis, RJ' },
  { nome: 'ARMAZEM DO GRAO (CORREAS)',        addr: 'Rua Castro Alves, 112, Corrêas, Petrópolis, RJ' },
  { nome: 'ARMAZEM DO GRAO (MOSELA)',         addr: 'Rua Mosela, 983, Mosela, Petrópolis, RJ' },
  { nome: 'ARMAZEM DO GRAO (QUITANDINHA)',    addr: 'Rua General Rondon, 550, Quitandinha, Petrópolis, RJ' },
  { nome: 'ARMAZEM DO GRAO (16 DE MARCO)',    addr: 'Rua 16 de Março, 195, Centro, Petrópolis, RJ' },
  { nome: 'ARMAZEM DO GRAO (BARRA DA TIJUCA)',addr: 'Av. das Américas, 11599, Recreio dos Bandeirantes, Rio de Janeiro, RJ' },
  { nome: 'ARMAZEM DO GRAO (ITAIPAVA)',       addr: 'Estrada União e Indústria, 12235, Itaipava, Petrópolis, RJ' },
  { nome: 'ARMAZEM DO GRAO (VALPARAISO)',     addr: 'Valparaíso, Petrópolis, RJ' },
  { nome: 'ARMAZEM DO GRAO (BOA VISTA)',      addr: 'Estrada União e Indústria, 12235, Itaipava, Petrópolis, RJ' },
  { nome: 'ARMAZEM DO GRAO MATRIZ (POSSE)',   addr: 'Posse, Petrópolis, RJ' },
  // REGINA / ABASTECEDORA Teresópolis
  { nome: 'REGINA BARRA DO IMBUY',            addr: 'Av. Presidente Roosevelt, 1360, Barra do Imbuí, Teresópolis, RJ' },
  { nome: 'REGINA 1 DE MAIO',                 addr: 'Rua Primeiro de Maio, 165, Rodoviária, Teresópolis, RJ' },
  { nome: 'REGINA LUCIO MEIRA',               addr: 'Avenida Lúcio Meira, 85, Várzea, Teresópolis, RJ' },
  { nome: 'ABASTECEDORA GRAO DA SERRA (ALTO)',addr: 'Bairro Alto, Teresópolis, RJ' },
]

;(async () => {
  for (const e of ENDERECOS) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(e.addr)}&limit=1`
    const resp = await fetch(url, { headers: { 'User-Agent': 'kpi-transmonseg-geocoding' } })
    const data = await resp.json() as Array<{ lat: string; lon: string; display_name: string }>
    if (data.length > 0) {
      const r = data[0]
      console.log(`✓ ${e.nome.padEnd(40)} ${r.lat},${r.lon}  | ${r.display_name.slice(0, 70)}`)
    } else {
      console.log(`✗ ${e.nome.padEnd(40)} NÃO ENCONTRADO`)
    }
    await new Promise(r => setTimeout(r, 1100)) // rate limit
  }
})()
