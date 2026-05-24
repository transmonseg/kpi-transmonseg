/**
 * FASE 0 — Auto-preenchimento de codigo_unitrac e nome_unitrac.
 *
 * Estratégia:
 *   Pra cada loja sem codigo_unitrac:
 *     Achar todas as escalas (dias 18-22) que tem essa loja
 *     Pegar as placas dessas escalas
 *     Buscar no Unitrac as paradas dessas placas
 *     Contar quais codigo_loja aparecem (só LOJA, não BASE/FORA)
 *     Se UM código aparece em ≥70% das placas → atribuir à loja
 *     Senão → null, listar pra revisão manual
 *
 *   Mesma lógica para nome_unitrac (mas comparando nome_loja).
 *
 * Output:
 *   docs/db-changes/2026-05-24-propostas-unitrac.json com lista de propostas
 *   NADA é aplicado no banco automaticamente.
 *
 * Uso: npx tsx scripts/correcao/auto_preencher_unitrac.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaGuanabaraPdf } from '@/lib/parsers/escala-guanabara-pdf'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import type { LinhaEscala } from '@/lib/types/escala'
import type { ParadaUnitrac } from '@/lib/types/unitrac'

const BASE_DIR = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'

// Mapeamento: data → arquivos disponíveis
const DIAS = [
  { data: '2026-05-18', pasta: 'ESCALA DIA 18' },
  { data: '2026-05-19', pasta: 'ESCALA DIA 19' },
  { data: '2026-05-20', pasta: 'ESCALA DIA 20' },
  { data: '2026-05-21', pasta: 'ESCALA DIA 21' },
  { data: '2026-05-22', pasta: 'ESCALA DIA 22' },
]

// Arquivos dentro de cada pasta (nomes podem variar levemente por dia)
const ARQUIVOS_PADRAO = {
  geral: ['ESCALA GERAL DE MAIO 0.xlsx', 'ESCALA GERAL DE MAIO 1 (6).xlsx', 'ESCALA GERAL DE MAIO 1.xlsx'],
  pax: ['ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (7).xlsx', 'ESCALA - PAX , FEIRA NOVA , EMANUEL.xlsx', 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (5).xlsx'],
  armazem: ['ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx', 'ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx'],
  zonasul: ['ESCALA ZONA SUL - MAIO (8).xlsx', 'ESCALA ZONA SUL - MAIO (7).xlsx'],
  guanabara: ['ESCALA 23.05.pdf', 'ESCALA 19.05.pdf'],
  unitrac: ['relatorio_9588.xlsx', 'relatorio_9589.xlsx', 'relatorio_9402.xlsx', 'relatorio_9391.xlsx'],
}

interface Loja {
  id: string
  rede_id: string
  nome: string
  nome_normalizado: string
  codigo_escala: string | null
  codigo_unitrac: string | null
  nome_unitrac: string | null
  lat: number | null
  lng: number | null
  raio_metros: number | null
}

interface Proposta {
  loja_id: string
  loja_nome: string
  rede_id: string
  campo: 'codigo_unitrac' | 'nome_unitrac'
  valor_proposto: string
  confianca: number  // 0-1
  evidencia: {
    placas_que_serviram_loja: number
    placas_com_parada_no_codigo: number
    detalhes: string
  }
}

function tentarLerArquivo(pasta: string, candidatos: string[]): Buffer | null {
  for (const nome of candidatos) {
    try {
      return readFileSync(`${BASE_DIR}/${pasta}/${nome}`)
    } catch { /* tenta próximo */ }
  }
  return null
}

async function carregarEscalasDoDia(pasta: string, data: string): Promise<LinhaEscala[]> {
  const todas: LinhaEscala[] = []

  const bufGeral = tentarLerArquivo(pasta, ARQUIVOS_PADRAO.geral)
  if (bufGeral) {
    try { todas.push(...await parseEscalaGeral(bufGeral, data)) } catch { /* erro silencioso */ }
  }

  const bufPax = tentarLerArquivo(pasta, ARQUIVOS_PADRAO.pax)
  if (bufPax) {
    try { todas.push(...await parseEscalaPax(bufPax, data)) } catch { /* erro */ }
  }

  const bufArmazem = tentarLerArquivo(pasta, ARQUIVOS_PADRAO.armazem)
  if (bufArmazem) {
    try { todas.push(...await parseEscalaArmazemGrao(bufArmazem, data)) } catch { /* erro */ }
  }

  const bufZonaSul = tentarLerArquivo(pasta, ARQUIVOS_PADRAO.zonasul)
  if (bufZonaSul) {
    try { todas.push(...await parseEscalaZonaSul(bufZonaSul, data)) } catch { /* erro */ }
  }

  const bufGuanabara = tentarLerArquivo(pasta, ARQUIVOS_PADRAO.guanabara)
  if (bufGuanabara) {
    try { todas.push(...await parseEscalaGuanabaraPdf(bufGuanabara, data)) } catch { /* erro */ }
  }

  return todas
}

async function carregarUnitracDoDia(pasta: string): Promise<ParadaUnitrac[]> {
  const buf = tentarLerArquivo(pasta, ARQUIVOS_PADRAO.unitrac)
  if (!buf) return []
  try {
    const veiculos = await parseUnitrac(buf)
    return veiculos.flatMap(v => v.paradas)
  } catch {
    return []
  }
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
}

// Palavras genéricas que não distinguem lojas (não conta como "token significativo")
const TOKENS_GENERICOS = new Set([
  'LOJA', 'ENTREGA', 'CARRO', 'ARMAZEM', 'GRAO', 'GRÃO', 'DO', 'DA', 'DE', 'EM',
  'I', 'II', 'III', 'IV', 'V', '1', '2', '3', '4', '5',
  // Nomes de redes (não distinguem lojas dentro da rede)
  'ZONA', 'SUL', 'PREZUNIC', 'PRINCESA', 'CARREFOUR', 'ASSAI', 'ASSAÍ', 'ATACADAO',
  'SUPER', 'SUPERPRIX', 'SAMS', 'CLUB', 'VIANENSE', 'SENDAS', 'GUANABARA', 'GB',
  'PAX', 'FEIRA', 'NOVA', 'EMANUEL', 'MUNDIAL', 'CAB', 'PETROPOLIS', 'PETRÓPOLIS',
  'MEGA', 'BOX', 'EXTRA', 'O', 'A', 'NO', 'NA',
])

/**
 * Extrai tokens significativos do nome de uma loja.
 * Retorna palavras textuais (geográfico) + número de loja (se houver).
 *
 * Ex: "Zona Sul Loja 07 - Leblon" → { textuais: ["LEBLON"], numero: "07" }
 *     "Carrefour Campo Grande"   → { textuais: ["CAMPO", "GRANDE"], numero: null }
 */
function tokensSignificativos(nomeLoja: string): { textuais: string[]; numero: string | null } {
  const norm = normalizar(nomeLoja)
  const textuais = [...new Set(
    norm.replace(/[^A-Z0-9 ]/g, ' ')
      .split(' ')
      .filter(p => p.length >= 3 && !TOKENS_GENERICOS.has(p) && !/^\d+$/.test(p))
  )]
  // Extrai número de loja/filial (ex: "Loja 07", "Filial 30")
  let numero: string | null = null
  const m1 = norm.match(/\b(?:LOJA|FILIAL)\s+(\d{1,3})\b/i)
  if (m1) numero = m1[1].padStart(2, '0')
  return { textuais, numero }
}

/**
 * Verifica se o nome do Unitrac é compatível com a loja:
 *   - DEVE compartilhar pelo menos UM token textual
 *   - Se loja tem número e Unitrac começa com número, eles DEVEM bater
 */
function nomeUnitracCompativel(loja: Loja, nomeUnitrac: string): boolean {
  const { textuais, numero } = tokensSignificativos(loja.nome)
  if (textuais.length === 0) return false  // loja com nome genérico, não dá pra confirmar
  const nomeUNorm = normalizar(nomeUnitrac)

  // Algum token textual tem que bater
  if (!textuais.some(t => nomeUNorm.includes(t))) return false

  // Se loja tem número e Unitrac começa com número, devem ser iguais
  if (numero) {
    const matchNumUnitrac = nomeUNorm.match(/^(\d{1,3})\b/)
    if (matchNumUnitrac) {
      const numU = matchNumUnitrac[1].padStart(2, '0')
      if (numU !== numero) return false
    }
  }
  return true
}

async function main() {
  console.log('=== FASE 0 — Auto-preencher codigo_unitrac e nome_unitrac ===\n')

  // 1. Carregar lojas do banco
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data: lojasRaw, error } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)
  if (error) throw error
  const lojas = (lojasRaw ?? []) as Loja[]
  console.log(`Lojas ativas: ${lojas.length}`)
  console.log(`  Sem codigo_unitrac: ${lojas.filter(l => !l.codigo_unitrac).length}`)
  console.log(`  Sem nome_unitrac:   ${lojas.filter(l => !l.nome_unitrac).length}`)

  // 2. Carregar todas as escalas + unitrac dos dias 18-22
  console.log('\nCarregando dados dos dias 18-22...')
  type EscalaPorDia = { data: string; linhas: LinhaEscala[]; paradas: ParadaUnitrac[] }
  const dadosPorDia: EscalaPorDia[] = []
  for (const { data, pasta } of DIAS) {
    process.stdout.write(`  ${data}... `)
    const linhas = await carregarEscalasDoDia(pasta, data)
    const paradas = await carregarUnitracDoDia(pasta)
    process.stdout.write(`${linhas.length} escalas, ${paradas.length} paradas\n`)
    dadosPorDia.push({ data, linhas, paradas })
  }

  // 3a. Construir índices reversos: codigo_unitrac/nome_unitrac já cadastrados em OUTRAS lojas
  // Esses são "ocupados" — não podem ser sugeridos pra lojas vazias.
  const codigosOcupados = new Map<string, string>()  // codigo → loja_id que já usa
  const nomesOcupados = new Map<string, string>()
  for (const l of lojas) {
    if (l.codigo_unitrac) codigosOcupados.set(l.codigo_unitrac, l.id)
    if (l.nome_unitrac) nomesOcupados.set(normalizar(l.nome_unitrac), l.id)
  }

  // 3b. Pra cada loja, encontrar paradas associadas via cross-ref
  console.log('\nProcessando cross-reference por loja...\n')
  const propostas: Proposta[] = []
  const semPropostas: Loja[] = []

  for (const loja of lojas) {
    const precisaCodigo = !loja.codigo_unitrac
    const precisaNome = !loja.nome_unitrac
    if (!precisaCodigo && !precisaNome) continue

    // Coletar todas placas que servem essa loja em todas escalas
    const placasParaLoja = new Set<string>()
    for (const dia of dadosPorDia) {
      const linhasDessaLoja = dia.linhas.filter(l =>
        l.rede_id === loja.rede_id &&
        normalizar(l.loja_nome_raw).includes(normalizar(loja.nome).split(' ').slice(-2).join(' '))
      )
      for (const l of linhasDessaLoja) {
        if (l.placa_norm) placasParaLoja.add(l.placa_norm)
      }
    }

    if (placasParaLoja.size === 0) {
      semPropostas.push(loja)
      continue
    }

    // Pra cada placa, achar paradas LOJA no Unitrac
    // Contar quais codigo_loja / nome_loja aparecem
    // CRÍTICO: filtrar códigos/nomes que JÁ estão cadastrados em outras lojas (pertencem a outra rede/loja)
    const contagemCodigo = new Map<string, number>()
    const contagemNome = new Map<string, number>()
    let placasComParada = 0

    for (const dia of dadosPorDia) {
      const paradasPlacas = dia.paradas.filter(p =>
        p.placa_norm && placasParaLoja.has(p.placa_norm) && p.classificacao === 'LOJA'
      )
      if (paradasPlacas.length === 0) continue
      placasComParada++

      // Códigos únicos por placa neste dia, ignorando os ocupados por outras lojas
      const codigosDia = new Set<string>()
      const nomesDia = new Set<string>()
      for (const p of paradasPlacas) {
        if (p.codigo_loja) {
          const ocupadoPor = codigosOcupados.get(p.codigo_loja)
          if (!ocupadoPor || ocupadoPor === loja.id) codigosDia.add(p.codigo_loja)
        }
        if (p.nome_loja) {
          const nomeNorm = normalizar(p.nome_loja)
          const ocupadoPor = nomesOcupados.get(nomeNorm)
          if (!ocupadoPor || ocupadoPor === loja.id) nomesDia.add(nomeNorm)
        }
      }
      for (const c of codigosDia) contagemCodigo.set(c, (contagemCodigo.get(c) ?? 0) + 1)
      for (const n of nomesDia) contagemNome.set(n, (contagemNome.get(n) ?? 0) + 1)
    }

    if (placasComParada === 0 || (contagemCodigo.size === 0 && contagemNome.size === 0)) {
      semPropostas.push(loja)
      continue
    }

    // Achar o nome_loja mais frequente que COMPARTILHA TOKEN SIGNIFICATIVO com a loja cadastrada
    let nomeProposto: string | null = null
    if (precisaNome && contagemNome.size > 0) {
      const candidatos = [...contagemNome.entries()]
        .filter(([nome]) => nomeUnitracCompativel(loja, nome))
        .sort((a, b) => b[1] - a[1])
      if (candidatos.length > 0) {
        const [topNome, topCount] = candidatos[0]
        const confianca = topCount / placasComParada
        if (confianca >= 0.5) {  // threshold mais baixo já que filtramos por token
          nomeProposto = topNome
          propostas.push({
            loja_id: loja.id,
            loja_nome: loja.nome,
            rede_id: loja.rede_id,
            campo: 'nome_unitrac',
            valor_proposto: topNome,
            confianca,
            evidencia: {
              placas_que_serviram_loja: placasParaLoja.size,
              placas_com_parada_no_codigo: topCount,
              detalhes: `Nome "${topNome}" compartilha token significativo (${tokensSignificativos(loja.nome).textuais.join(',')}) e aparece em ${topCount}/${placasComParada} dias`,
            },
          })
        }
      }
    }

    // Pra codigo_unitrac, só sugerir se conseguimos confirmar via nome_unitrac (consistência)
    // Estratégia: pegar o codigo das paradas que tem nome compatível com a loja
    if (precisaCodigo && nomeProposto) {
      // Buscar nas paradas dos dias o codigo_loja que aparece junto com nomeProposto
      const codigosDoNomeProposto = new Map<string, number>()
      for (const dia of dadosPorDia) {
        const paradas = dia.paradas.filter(p =>
          p.placa_norm && placasParaLoja.has(p.placa_norm) &&
          p.classificacao === 'LOJA' &&
          p.nome_loja && normalizar(p.nome_loja) === nomeProposto
        )
        const codsDia = new Set<string>()
        for (const p of paradas) {
          if (p.codigo_loja) codsDia.add(p.codigo_loja)
        }
        for (const c of codsDia) codigosDoNomeProposto.set(c, (codigosDoNomeProposto.get(c) ?? 0) + 1)
      }
      if (codigosDoNomeProposto.size > 0) {
        const [topCodigo, topCount] = [...codigosDoNomeProposto.entries()].sort((a, b) => b[1] - a[1])[0]
        propostas.push({
          loja_id: loja.id,
          loja_nome: loja.nome,
          rede_id: loja.rede_id,
          campo: 'codigo_unitrac',
          valor_proposto: topCodigo,
          confianca: 1.0,
          evidencia: {
            placas_que_serviram_loja: placasParaLoja.size,
            placas_com_parada_no_codigo: topCount,
            detalhes: `Cod ${topCodigo} aparece em paradas cujo nome_loja é "${nomeProposto}" (confirmado via nome)`,
          },
        })
      }
    }
  }

  // 4. Salvar proposta
  mkdirSync('docs/db-changes', { recursive: true })
  const outPath = 'docs/db-changes/2026-05-24-propostas-unitrac.json'
  writeFileSync(outPath, JSON.stringify({
    geradoEm: new Date().toISOString(),
    totalPropostas: propostas.length,
    porCampo: {
      codigo_unitrac: propostas.filter(p => p.campo === 'codigo_unitrac').length,
      nome_unitrac: propostas.filter(p => p.campo === 'nome_unitrac').length,
    },
    porConfianca: {
      alta: propostas.filter(p => p.confianca >= 0.95).length,
      media: propostas.filter(p => p.confianca >= 0.8 && p.confianca < 0.95).length,
      baixa: propostas.filter(p => p.confianca < 0.8).length,
    },
    propostas,
  }, null, 2), 'utf8')

  // 5. Lojas sem proposta (precisam revisão manual)
  const semPropostaPath = 'docs/db-changes/2026-05-24-lojas-sem-proposta.json'
  writeFileSync(semPropostaPath, JSON.stringify({
    geradoEm: new Date().toISOString(),
    total: semPropostas.length,
    lojas: semPropostas.map(l => ({
      id: l.id,
      rede_id: l.rede_id,
      nome: l.nome,
      tem_codigo_unitrac: !!l.codigo_unitrac,
      tem_nome_unitrac: !!l.nome_unitrac,
    })),
  }, null, 2), 'utf8')

  // 6. Resumo
  console.log('\n=== RESULTADO ===\n')
  console.log(`Total propostas: ${propostas.length}`)
  console.log(`  codigo_unitrac: ${propostas.filter(p => p.campo === 'codigo_unitrac').length}`)
  console.log(`  nome_unitrac:   ${propostas.filter(p => p.campo === 'nome_unitrac').length}`)
  console.log(`\nPor confiança:`)
  console.log(`  Alta (≥95%):   ${propostas.filter(p => p.confianca >= 0.95).length}`)
  console.log(`  Média (80-95%): ${propostas.filter(p => p.confianca >= 0.8 && p.confianca < 0.95).length}`)
  console.log(`  Baixa (70-80%): ${propostas.filter(p => p.confianca >= 0.7 && p.confianca < 0.8).length}`)
  console.log(`\nLojas sem proposta (precisam revisão manual): ${semPropostas.length}`)
  console.log(`\nArquivos gerados:`)
  console.log(`  ${outPath}`)
  console.log(`  ${semPropostaPath}`)
  console.log(`\n[NADA aplicado no banco. Aprovação manual necessária.]`)
}

main().catch(e => { console.error(e); process.exit(1) })
