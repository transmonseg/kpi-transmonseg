// Verifica o que cada parser extrai dos arquivos do usuário pra data 2026-05-15
import fs from 'node:fs'
import path from 'node:path'

const DOWNLOADS = 'C:/Users/media/Downloads'
const DATA_ALVO = '2026-05-15'

const arquivos = {
  GERAL:        `${DOWNLOADS}/ESCALA GERAL DE MAIO 1 (2).xlsx`,
  ZONA_SUL:     `${DOWNLOADS}/ESCALA ZONA SUL - MAIO (4).xlsx`,
  PAX:          `${DOWNLOADS}/ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (3).xlsx`,
  ARMAZEM_GRAO: `${DOWNLOADS}/ESCALA DO ARMAZÉM DO GRÃO MAIO (3).xlsx`,
  GUANABARA:    `${DOWNLOADS}/escala 15.005 (5).pdf`,
  UNITRAC:      `${DOWNLOADS}/relatorio_9206.pdf`,
}

// Stubs DOMMatrix etc pra pdf-parse v1 (deveria nem precisar mas garantia)
globalThis.DOMMatrix = globalThis.DOMMatrix || class { constructor() {} }
globalThis.Path2D = globalThis.Path2D || class { constructor() {} }
globalThis.ImageData = globalThis.ImageData || class { constructor() {} }

async function loadFile(p) {
  if (!fs.existsSync(p)) throw new Error(`arquivo não encontrado: ${p}`)
  const buf = fs.readFileSync(p)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

async function main() {
  console.log(`\n=== Verificação para ${DATA_ALVO} ===\n`)
  console.log('UI mostra:')
  console.log('  GERAL: 838 linhas | ZONA_SUL: 459 | PAX: erro | ARMAZEM: erro | GUANABARA: 27')
  console.log()

  // GERAL
  try {
    const { parseEscalaGeral } = await import('../src/lib/parsers/escala-geral.ts')
    const buf = await loadFile(arquivos.GERAL)
    const linhas = await parseEscalaGeral(buf, DATA_ALVO)
    const redes = [...new Set(linhas.map(l => l.rede_id))]
    console.log(`GERAL          → ${linhas.length} linhas (redes detectadas: ${redes.length} → ${redes.slice(0, 10).join(', ')}${redes.length > 10 ? '...' : ''})`)
  } catch (e) {
    console.log(`GERAL          → ERRO: ${e.message}`)
  }

  // ZONA_SUL
  try {
    const { parseEscalaZonaSul } = await import('../src/lib/parsers/escala-zona-sul.ts')
    const buf = await loadFile(arquivos.ZONA_SUL)
    const linhas = await parseEscalaZonaSul(buf, DATA_ALVO)
    console.log(`ZONA_SUL       → ${linhas.length} linhas`)
  } catch (e) {
    console.log(`ZONA_SUL       → ERRO: ${e.message}`)
  }

  // PAX
  try {
    const { parseEscalaPax } = await import('../src/lib/parsers/escala-pax.ts')
    const buf = await loadFile(arquivos.PAX)
    const linhas = await parseEscalaPax(buf, DATA_ALVO)
    const redes = [...new Set(linhas.map(l => l.rede_id))]
    console.log(`PAX            → ${linhas.length} linhas (redes: ${redes.join(', ')})`)
  } catch (e) {
    console.log(`PAX            → ERRO: ${e.message}`)
  }

  // ARMAZEM_GRAO
  try {
    const { parseEscalaArmazemGrao } = await import('../src/lib/parsers/escala-armazem-grao.ts')
    const buf = await loadFile(arquivos.ARMAZEM_GRAO)
    const linhas = await parseEscalaArmazemGrao(buf, DATA_ALVO)
    console.log(`ARMAZEM_GRAO   → ${linhas.length} linhas`)
  } catch (e) {
    console.log(`ARMAZEM_GRAO   → ERRO: ${e.message}`)
  }

  // GUANABARA
  try {
    const { parseEscalaGuanabaraPdf } = await import('../src/lib/parsers/escala-guanabara-pdf.ts')
    const buf = fs.readFileSync(arquivos.GUANABARA)
    const linhas = await parseEscalaGuanabaraPdf(buf, DATA_ALVO)
    console.log(`GUANABARA      → ${linhas.length} linhas (data alvo ${DATA_ALVO})`)
    if (linhas.length === 0) {
      // Tenta sem dataAlvo pra ver qual data tá no PDF
      const semFiltro = await parseEscalaGuanabaraPdf(buf)
      const datas = [...new Set(semFiltro.map(l => l.data_entrega))]
      console.log(`               PDF na verdade tem data: ${datas.join(', ')} (${semFiltro.length} linhas total)`)
    }
  } catch (e) {
    console.log(`GUANABARA      → ERRO: ${e.message}`)
  }

  // UNITRAC PDF (não filtra por data, só conta)
  try {
    const { parseUnitracPdf } = await import('../src/lib/parsers/unitrac-pdf.ts')
    const buf = fs.readFileSync(arquivos.UNITRAC)
    const veiculos = await parseUnitracPdf(buf)
    const totalParadas = veiculos.reduce((acc, v) => acc + v.paradas.length, 0)
    console.log(`UNITRAC        → ${veiculos.length} veículos / ${totalParadas} paradas`)
  } catch (e) {
    console.log(`UNITRAC        → ERRO: ${e.message}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
