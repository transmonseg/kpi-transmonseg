/**
 * Extrai todas as escalas (Geral, PAX, Armazém, ZS) dos 5 dias pra formato MD legível.
 * NÃO faz match — só converte xlsx pra texto. Match é manual.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import type { LinhaEscala } from '@/lib/types/escala'

const BASE_DIR = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'

const DIAS = [
  { data: '2026-05-18', pasta: 'ESCALA DIA 18', geral: 'ESCALA GERAL DE MAIO 1 (6).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (5).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx', zonasul: 'ESCALA ZONA SUL - MAIO (6).xlsx' },
  { data: '2026-05-19', pasta: 'ESCALA DIA 19', geral: 'ESCALA GERAL DE MAIO 1 (6).xlsx', pax: 'ESCALA - PAX , FEIRA NOVA , EMANUEL.xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx', zonasul: 'ESCALA ZONA SUL - MAIO (6).xlsx' },
  { data: '2026-05-20', pasta: 'ESCALA DIA 20', geral: 'ESCALA GERAL DE MAIO 1 (7).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (6).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO.xlsx', zonasul: 'ESCALA ZONA SUL - MAIO (7).xlsx' },
  { data: '2026-05-21', pasta: 'ESCALA DIA 21', geral: 'ESCALA GERAL DE MAIO 1 (7).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (6).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx', zonasul: 'ESCALA ZONA SUL - MAIO (7).xlsx' },
  { data: '2026-05-22', pasta: 'ESCALA DIA 22', geral: 'ESCALA GERAL DE MAIO 0.xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (7).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx', zonasul: 'ESCALA ZONA SUL - MAIO (8).xlsx' },
]

function tryRead(path: string): Buffer | null { try { return readFileSync(path) } catch { return null } }

function formatar(escalas: LinhaEscala[], titulo: string): string[] {
  const md: string[] = []
  md.push(`## ${titulo}`)
  md.push('')
  if (escalas.length === 0) { md.push('_(sem linhas)_', ''); return md }

  // Agrupa por placa+rede
  const grupos = new Map<string, LinhaEscala[]>()
  for (const l of escalas) {
    const k = `${l.placa_norm ?? '—'}|${l.rede_id}|${l.motorista_nome ?? '—'}`
    const arr = grupos.get(k) ?? []
    arr.push(l)
    grupos.set(k, arr)
  }
  for (const [key, linhas] of [...grupos.entries()].sort()) {
    const [placa, rede, mot] = key.split('|')
    md.push(`### ${placa} [${rede}] motorista: ${mot}`)
    for (const l of linhas.sort((a, b) => a.carro_ordem - b.carro_ordem)) {
      md.push(`- ordem=${l.carro_ordem} | loja="${l.loja_nome_raw}" | cod=${l.loja_codigo_raw ?? '—'}`)
    }
    md.push('')
  }
  return md
}

async function main() {
  mkdirSync('docs/correcao-sistema/escalas-extraidas', { recursive: true })
  for (const dia of DIAS) {
    console.log(`processando ${dia.data}...`)
    const md: string[] = []
    md.push(`# Escalas ${dia.data} (todas)`)
    md.push('')

    for (const [titulo, path, parser] of [
      ['Escala Geral', dia.geral, parseEscalaGeral],
      ['Escala PAX/FEIRA_NOVA/EMANUEL', dia.pax, parseEscalaPax],
      ['Escala Armazém do Grão', dia.armazem, parseEscalaArmazemGrao],
      ['Escala Zona Sul', dia.zonasul, parseEscalaZonaSul],
    ] as const) {
      const buf = tryRead(`${BASE_DIR}/${dia.pasta}/${path}`)
      if (!buf) { md.push(`## ${titulo}\n\n_(arquivo não encontrado)_\n`); continue }
      try {
        const escalas = (await parser(buf, dia.data)).filter(e => e.data_entrega === dia.data)
        md.push(...formatar(escalas, `${titulo} — ${escalas.length} linhas`))
      } catch (e) {
        md.push(`## ${titulo}\n\n_(erro: ${(e as Error).message})_\n`)
      }
    }

    writeFileSync(`docs/correcao-sistema/escalas-extraidas/dia-${dia.data.slice(-2)}.md`, md.join('\n'), 'utf8')
    console.log(`  escrito: docs/correcao-sistema/escalas-extraidas/dia-${dia.data.slice(-2)}.md`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
