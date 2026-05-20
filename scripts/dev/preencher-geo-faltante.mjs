// Tenta achar coordenadas pras lojas Zona Sul sem geo, usando paradas LOJA
// do Unitrac do dia 19 com nomes similares.

import { readFile } from 'node:fs/promises'
import { parseUnitrac } from '../../src/lib/parsers/unitrac.ts'
import { normalizaNome, levenshtein } from '../../src/lib/utils/texto.ts'

const lojasSemGeo = [
  { id: '566f4a53-8209-402c-8134-c44344bac2f8', nome: 'ZONA SUL LOJA 13 - ANGRA', codigo_unitrac: '9039013' },
  { id: '7d709538-a25d-4c7c-993d-72ee0caa2f0b', nome: 'ZONA SUL LOJA 21 - FLAMENGO', codigo_unitrac: '9039021' },
  { id: '8586bdaf-ab8e-4de9-a100-68af990865d2', nome: 'ZONA SUL LOJA 30 - LARANJEIRAS', codigo_unitrac: '9039030' },
  { id: '172b71a0-46e3-4ebf-b87c-12a98ef5a3dd', nome: 'ZONA SUL LOJA 33 - HUMAITA', codigo_unitrac: '9039033' },
  { id: '61c01550-b4b4-4ab9-b3c8-2910f38c63f9', nome: 'ZONA SUL LOJA 48 - RECREIO', codigo_unitrac: '9039048' },
]

const buf = await readFile('C:/Users/media/Downloads/dia 19/relatorio_9521.xlsx')
const veiculos = await parseUnitrac(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
const paradas = veiculos.flatMap(v => v.paradas.filter(p => p.classificacao === 'LOJA' && p.lat != null && p.lng != null))

console.log('UPDATEs sugeridos:\n')
for (const l of lojasSemGeo) {
  // Tenta por codigo primeiro
  const byCode = paradas.find(p => p.codigo_loja === l.codigo_unitrac)
  if (byCode) {
    console.log(`UPDATE lojas SET lat=${byCode.lat}, lng=${byCode.lng}, raio_metros=COALESCE(raio_metros, 200), nome_unitrac='${(byCode.nome_loja ?? '').replace(/'/g, "''")}' WHERE id='${l.id}';  -- via código ${l.codigo_unitrac} → ${byCode.nome_loja}`)
    continue
  }
  // Tenta por nome similar
  const normL = normalizaNome(l.nome)
  const byName = paradas.find(p => {
    if (!p.nome_loja) return false
    const normP = normalizaNome(p.nome_loja)
    return levenshtein(normL, normP) <= 5 || normP.includes(normL.split(' ').pop() ?? 'xxx')
  })
  if (byName) {
    console.log(`UPDATE lojas SET lat=${byName.lat}, lng=${byName.lng}, raio_metros=COALESCE(raio_metros, 200), nome_unitrac='${(byName.nome_loja ?? '').replace(/'/g, "''")}' WHERE id='${l.id}';  -- via nome ~ ${byName.nome_loja}`)
  } else {
    console.log(`-- ${l.nome}: SEM MATCH no Unitrac dia 19 (placa pode estar fora do rastreio)`)
  }
}
