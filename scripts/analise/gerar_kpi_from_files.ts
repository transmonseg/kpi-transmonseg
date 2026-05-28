/**
 * Gera KPIs (modo sem-geo) lendo DIRETO DOS ARQUIVOS das pastas ESCALA DIA XX.
 * Não depende de dados de movimento do banco — só do cadastro de lojas (referência).
 * Parseia escalas + Unitrac PDF de cada dia, roda matcher, gera XLSX por rede.
 *
 * Uso: npx tsx scripts/analise/gerar_kpi_from_files.ts <dia 18|19|20|21|22|25>
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseEscalaGuanabaraPdf } from '@/lib/parsers/escala-guanabara-pdf'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { cruzaEscalaUnitrac, setSemGeo } from '@/lib/kpi/matcher'
import { gerarKpi, type LinhaParaKpi } from '@/lib/kpi/gerador-kpi'
import { parseAlteracaoText } from '@/lib/parsers/alteracao-text'
import { aplicarAlteracoes, parsedToConfirmada } from '@/lib/kpi/aplicar-alteracoes'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const OUT_DIR = 'docs/conversas-tia-erica/kpi-beta'

// Mapa de arquivos por dia (escalas + relatório Unitrac PDF)
const ARQ: Record<string, { dir: string; geral?: string; zs?: string; pax?: string; armazem?: string; guanabara?: string; unitrac: string; alt?: string }> = {
  '18': { dir: 'ESCALA DIA 18', geral: 'ESCALA GERAL DE MAIO 1 (6).xlsx', zs: 'ESCALA ZONA SUL - MAIO (6).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (5).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx', guanabara: 'ESCALA 18.04 (1).pdf', unitrac: 'relatorio_9401.pdf', alt: 'ALTERACOES/alteracoes_18.05.txt' },
  '19': { dir: 'ESCALA DIA 19', geral: 'ESCALA GERAL DE MAIO 1 (6).xlsx', zs: 'ESCALA ZONA SUL - MAIO (6).xlsx', pax: 'ESCALA - PAX , FEIRA NOVA , EMANUEL.xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx', guanabara: 'ESCALA 19.05.pdf', unitrac: 'relatorio_9572.pdf', alt: 'ALTERACOES/alteracoes_19.05.txt' },
  '20': { dir: 'ESCALA DIA 20', geral: 'ESCALA GERAL DE MAIO 1 (7).xlsx', zs: 'ESCALA ZONA SUL - MAIO (7).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (6).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO.xlsx', guanabara: 'ESCALA 21.pdf', unitrac: 'relatorio_9522.pdf', alt: 'ALTERACOES/alteracoes_20.05.txt' },
  '21': { dir: 'ESCALA DIA 21', geral: 'ESCALA GERAL DE MAIO 1 (7).xlsx', zs: 'ESCALA ZONA SUL - MAIO (7).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (6).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx', unitrac: 'relatorio_9553.pdf', alt: 'ALTERACOES/alteracoes_21.05.txt' },
  '22': { dir: 'ESCALA DIA 22', geral: 'ESCALA GERAL DE MAIO 0.xlsx', zs: 'ESCALA ZONA SUL - MAIO (8).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (7).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx', unitrac: 'relatorio_9589 (1).pdf', alt: 'ALTERACOES/alteracoes.txt' },
  '25': { dir: 'ESCALA DIA 25', geral: 'ESCALA GERAL DE MAIO 0 (2).xlsx', zs: 'ESCALA ZONA SUL - MAIO (9).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (7).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx', guanabara: 'ESCALA 25.05.pdf', unitrac: 'relatorio_9652.pdf', alt: 'ALTERACOES/whatsapp-25.md' },
}

let _pid = 0
function pid() { return `f${++_pid}` }

;(async () => {
  setSemGeo(true)
  const dia = process.argv[2]
  if (!ARQ[dia]) { console.error('Dia inválido. Use 18|19|20|21|22|25'); process.exit(1) }
  const cfg = ARQ[dia]
  const data = `2026-05-${dia}`
  const dirPath = `${BASE}/${cfg.dir}`
  console.log(`\n=== Gerando KPI from-files — dia ${dia} ===`)

  // 1) Parseia escalas dos arquivos
  const escala: any[] = []
  const addEscala = async (tipo: string, arquivo: string | undefined, parser: (b: Buffer, d: string) => Promise<any[]>) => {
    if (!arquivo) return
    const p = `${dirPath}/${arquivo}`
    if (!existsSync(p)) { console.log(`  ⚠ ${tipo}: arquivo não existe (${arquivo})`); return }
    try {
      const linhas = await parser(readFileSync(p), data)
      linhas.forEach((l: any) => { l.id = l.id ?? pid() })
      escala.push(...linhas)
      console.log(`  ✓ ${tipo}: ${linhas.length} linhas`)
    } catch (e: any) { console.log(`  ✗ ${tipo}: ${e.message}`) }
  }
  await addEscala('GERAL', cfg.geral, parseEscalaGeral)
  await addEscala('ZONA_SUL', cfg.zs, parseEscalaZonaSul)
  await addEscala('PAX', cfg.pax, parseEscalaPax)
  await addEscala('ARMAZEM_GRAO', cfg.armazem, parseEscalaArmazemGrao)
  await addEscala('GUANABARA', cfg.guanabara, parseEscalaGuanabaraPdf)

  // 1b) Aplica ALTERAÇÕES (trocas de placa de última hora). Sem isso, o sistema
  // procura a placa original (que não saiu) e a entrega some. Ex dia 19: Assaí
  // Alcântara I trocou LSN-6I72 → DBB-8D19.
  if (cfg.alt) {
    const altPath = `${dirPath}/${cfg.alt}`
    if (existsSync(altPath)) {
      const txt = readFileSync(altPath, 'utf-8')
      // separa por blocos (linha em branco) e parseia cada um
      const blocos = txt.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
      const confirmadas = blocos
        .map(b => { try { return parseAlteracaoText(b) } catch { return null } })
        .filter((p): p is NonNullable<typeof p> => !!p && (p.tipo === 'SUBSTITUICAO' || p.tipo === 'INCLUSAO' || p.tipo === 'SWAP') && !!p.entra)
        .map(parsedToConfirmada)
      // aplicarAlteracoes muta in-place e retorna a mesma referência
      aplicarAlteracoes(escala as any, confirmadas)
      console.log(`  ✓ Alterações: ${confirmadas.length} aplicadas (${blocos.length} blocos)`)
    } else {
      console.log(`  ⚠ Alterações: arquivo não existe (${cfg.alt})`)
    }
  }

  // 2) Parseia Unitrac PDF
  const pdfPath = `${dirPath}/${cfg.unitrac}`
  const veiculos = await parseUnitracPdf(readFileSync(pdfPath), null)
  const paradas: any[] = []
  for (const v of veiculos) {
    for (const p of v.paradas) {
      paradas.push({
        id: pid(), placa_norm: v.placa_norm, chegada: p.chegada.toISOString(),
        saida: p.saida?.toISOString() ?? null, duracao_seg: p.duracao_seg, distancia_km: p.distancia_km,
        endereco: p.endereco, lat: p.lat, lng: p.lng, local_parada: p.local_parada,
        codigo_loja: p.codigo_loja, nome_loja: p.nome_loja, classificacao: p.classificacao, loja_id: null, ordem: p.ordem,
      })
    }
  }
  console.log(`  ✓ Unitrac: ${veiculos.length} veículos, ${paradas.length} paradas`)

  // 3) Cadastro de lojas (referência estável)
  const { data: lojas } = await sb.from('lojas')
    .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
    .eq('ativo', true)

  // 4) Roda matcher por rede e gera XLSX
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  const redeIds = [...new Set(escala.filter(l => l.rede_id).map(l => l.rede_id as string))]
  for (const rid of redeIds) {
    const linhasRede = escala.filter(l => l.rede_id === rid)
    const placasRede = new Set(linhasRede.filter(l => l.placa_norm).map(l => l.placa_norm as string))
    const paradasRede = paradas.filter(p => placasRede.has(p.placa_norm))
    const rotas = await cruzaEscalaUnitrac(
      linhasRede, paradasRede,
      (lojas ?? []).filter(l => l.rede_id === rid) as Parameters<typeof cruzaEscalaUnitrac>[2],
    )
    const escById = new Map(linhasRede.map(l => [l.id, l]))
    const linhas: LinhaParaKpi[] = rotas.map((r: any, idx: number) => {
      const e = escById.get(r.escala_linha_id)
      const ps = (r.paradas ?? []) as any[]
      const p1 = ps[0], p2 = ps[1], p3 = ps[2]
      return {
        kpi_id: 'ff', escala_linha_id: r.escala_linha_id, ordem: idx + 1,
        loja_nome: e?.loja_nome_raw ?? '', motorista: e?.motorista_nome ?? null,
        motorista_codigo: e?.motorista_codigo ?? null, placa: r.placa_norm ?? null,
        carro_ordem: (e?.carro_ordem ?? 1) as 1 | 2, saida_cd: r.saida_cd ?? null,
        chd_loja_1: p1 ? new Date(p1.chegada) : null, saida_loja_1: p1 ? new Date(p1.saida) : null, tempo_loja_1_min: p1?.duracao_min ?? null,
        chd_loja_2: p2 ? new Date(p2.chegada) : null, saida_loja_2: p2 ? new Date(p2.saida) : null, tempo_loja_2_min: p2?.duracao_min ?? null,
        chd_loja_3: p3 ? new Date(p3.chegada) : null, saida_loja_3: p3 ? new Date(p3.saida) : null, tempo_loja_3_min: p3?.duracao_min ?? null,
        observacao: null, anomalias_codigos: [],
      }
    })
    const buf = await gerarKpi({ rede_id: rid, data, linhas })
    const { writeFileSync } = await import('fs')
    writeFileSync(`${OUT_DIR}/KPI-${rid}-${data}-FF.xlsx`, buf)
  }
  console.log(`  ✓ ${redeIds.length} XLSX gerados (sufixo -FF)`)
})().catch(e => { console.error(e); process.exit(1) })
