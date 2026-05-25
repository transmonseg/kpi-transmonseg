/**
 * Dump cru de TODAS as escalas + alterações + Unitrac do dia 19/05.
 * Output: docs/auditoria/dump-dia-19/{escala}.md
 * Eu (Claude) leio esses .md depois para fazer match manual placa-por-placa.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseEscalaGuanabaraPdf } from '@/lib/parsers/escala-guanabara-pdf'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import type { LinhaEscala } from '@/lib/types/escala'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'
const DATA = '2026-05-19'
const OUT = 'docs/auditoria/dump-dia-19'

function fmtHHMM(d: Date): string {
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0')
}

function dumpEscala(nome: string, escala: LinhaEscala[]) {
  const porRede = new Map<string, LinhaEscala[]>()
  for (const l of escala) {
    const arr = porRede.get(l.rede_id) ?? []
    arr.push(l)
    porRede.set(l.rede_id, arr)
  }

  let md = `# Escala ${nome} — dia 19/05/2026\n\n`
  md += `Total de linhas: ${escala.length}\n\n`

  for (const [rede, linhas] of [...porRede.entries()].sort((a, b) => b[1].length - a[1].length)) {
    md += `\n## ${rede} (${linhas.length} linhas)\n\n`

    // Agrupa por placa
    const porPlaca = new Map<string, LinhaEscala[]>()
    for (const l of linhas) {
      const p = l.placa_norm || '(SEM_PLACA)'
      const arr = porPlaca.get(p) ?? []
      arr.push(l)
      porPlaca.set(p, arr)
    }
    md += `Placas únicas: ${porPlaca.size}\n\n`

    md += `| Placa | Motorista | Carro | Lojas (cod • nome) |\n`
    md += `|---|---|---|---|\n`
    for (const placa of [...porPlaca.keys()].sort()) {
      const arr = porPlaca.get(placa)!
      const motorista = arr[0].motorista_nome ?? '?'
      const carro = arr[0].carro_ordem
      const lojas = arr.map(l => `[${l.loja_codigo_raw ?? '?'}] ${l.loja_nome_raw}`).join(' · ')
      md += `| ${placa} | ${motorista} | ${carro} | ${lojas} |\n`
    }
    md += '\n'
  }

  return md
}

async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

  // 1) ZONA_SUL
  console.log('Lendo ZONA_SUL...')
  const escalaZS = await parseEscalaZonaSul(readFileSync(BASE + '/ESCALA ZONA SUL - MAIO (6).xlsx'), DATA)
  writeFileSync(OUT + '/01-zona-sul.md', dumpEscala('ZONA SUL', escalaZS), 'utf8')

  // 2) GERAL (várias redes)
  console.log('Lendo ESCALA GERAL...')
  const escalaGeral = await parseEscalaGeral(readFileSync(BASE + '/ESCALA GERAL DE MAIO 1 (6).xlsx'), DATA)
  writeFileSync(OUT + '/02-geral.md', dumpEscala('GERAL (várias redes)', escalaGeral), 'utf8')

  // 3) PAX/FEIRA_NOVA/EMANUEL
  console.log('Lendo ESCALA PAX...')
  const escalaPax = await parseEscalaPax(readFileSync(BASE + '/ESCALA - PAX , FEIRA NOVA , EMANUEL.xlsx'), DATA)
  writeFileSync(OUT + '/03-pax-feira-nova-emanuel.md', dumpEscala('PAX / FEIRA NOVA / EMANUEL', escalaPax), 'utf8')

  // 4) ARMAZÉM DO GRÃO
  console.log('Lendo ARMAZÉM DO GRÃO...')
  const escalaArm = await parseEscalaArmazemGrao(readFileSync(BASE + '/ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx'), DATA)
  writeFileSync(OUT + '/04-armazem-grao.md', dumpEscala('ARMAZÉM DO GRÃO', escalaArm), 'utf8')

  // 5) GUANABARA
  console.log('Lendo GUANABARA...')
  const escalaGb = await parseEscalaGuanabaraPdf(readFileSync(BASE + '/ESCALA 19.05.pdf'), DATA)
  writeFileSync(OUT + '/05-guanabara.md', dumpEscala('GUANABARA', escalaGb), 'utf8')

  // 6) UNITRAC (XLSX + PDF combinados)
  console.log('Lendo UNITRAC...')
  const veicXlsx = await parseUnitrac(readFileSync(BASE + '/relatorio_9391.xlsx'))
  const veicPdf = await parseUnitracPdf(readFileSync(BASE + '/relatorio_9572.pdf'), new Set()).catch(() => [])
  const todos = new Map()
  for (const v of veicXlsx) todos.set(v.placa_norm, { src: 'XLSX', v })
  for (const v of veicPdf) if (!todos.has(v.placa_norm)) todos.set(v.placa_norm, { src: 'PDF', v })

  let mdU = `# Unitrac — dia 19/05/2026\n\n`
  mdU += `Veículos únicos: ${todos.size} (${veicXlsx.length} XLSX, ${veicPdf.length} PDF)\n\n`

  const placasOrdenadas = [...todos.keys()].sort()
  for (const placa of placasOrdenadas) {
    const { src, v } = todos.get(placa)
    const paradas = [...v.paradas].sort((a: any, b: any) => +new Date(a.chegada) - +new Date(b.chegada))
    const lojas = paradas.filter((p: any) => p.classificacao === 'LOJA')
    const bases = paradas.filter((p: any) => p.classificacao === 'BASE')
    const foras = paradas.filter((p: any) => p.classificacao === 'FORA_BASE')

    mdU += `## ${placa} (${src})\n\n`
    mdU += `${v.paradas.length} paradas total · ${bases.length} BASE · ${lojas.length} LOJA · ${foras.length} FORA_BASE\n\n`

    if (paradas.length > 0) {
      mdU += `| Tipo | Chegada-Saída | Duração | cod_loja | Nome/Local |\n`
      mdU += `|---|---|---|---|---|\n`
      for (const p of paradas) {
        const dur = p.duracao_seg ? Math.round(p.duracao_seg / 60) + 'min' : '?'
        const nome = (p.nome_loja ?? p.local_parada ?? '').slice(0, 60)
        mdU += `| ${p.classificacao} | ${fmtHHMM(p.chegada)}-${fmtHHMM(p.saida ?? p.chegada)} | ${dur} | ${p.codigo_loja ?? '-'} | ${nome} |\n`
      }
    }
    mdU += '\n'
  }
  writeFileSync(OUT + '/06-unitrac.md', mdU, 'utf8')

  // 7) ALTERACOES (cópia direta)
  const alt = readFileSync(BASE + '/ALTERACOES/alteracoes_19.05.txt', 'utf8')
  writeFileSync(OUT + '/00-alteracoes.md', `# Alterações — dia 19/05/2026\n\n\`\`\`\n${alt}\n\`\`\`\n`, 'utf8')

  console.log(`\n✓ Dumps salvos em ${OUT}/`)
}

main().catch(e => { console.error(e); process.exit(1) })
