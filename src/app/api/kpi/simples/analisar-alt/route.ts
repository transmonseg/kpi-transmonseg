import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseAlteracaoText, type AlteracaoParsed } from '@/lib/parsers/alteracao-text'
import { parseAlteracaoPdfTabular } from '@/lib/parsers/alteracao-pdf-tabular'
import { splitAlteracoes } from '@/lib/parsers/alteracao-split'
import type { SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>

/**
 * Tenta extrair alterações de um PDF.
 *
 * Estratégia em 2 etapas:
 *   1) Parser tabular (pdfjs-serverless com coordenadas): reconstrói linhas/colunas
 *      da tabela. Funciona para "ALTERAÇÕES NA ESCALA GERAL" com header REDES|TIPO|MOTORISTA|CÓD|PLACA.
 *   2) Fallback texto (pdf-parse + parseAlteracaoText): pra PDFs que são texto narrativo
 *      ("Alteração Prezunic: entra X, sai Y").
 */
async function extrairAlteracoesPdf(buf: Buffer): Promise<{ alteracoes: AlteracaoParsed[]; fonte: string }> {
  // 1) Tentar parser tabular primeiro
  try {
    const tabulares = await parseAlteracaoPdfTabular(buf)
    if (tabulares.length > 0) return { alteracoes: tabulares, fonte: 'pdf-tabular' }
  } catch {
    // ignora, tenta fallback
  }

  // 2) Fallback: pdf-parse + splitAlteracoes + parseAlteracaoText
  const { text } = await pdfParse(buf)
  const partes = splitAlteracoes(text)
  const results = partes.map(p => parseAlteracaoText(p)).filter(r => r.entra || r.sai)
  return {
    alteracoes: results.length > 0 ? results : [parseAlteracaoText(text)],
    fonte: 'pdf-texto',
  }
}

const STOP_TOKENS = new Set([
  'LOJA', 'FILIAL', 'CARRO', 'REDE', 'CARREFOUR', 'ASSAI', 'PREZUNIC',
  'PRINCESA', 'SUPERPRIX', 'SENDAS', 'GUANABARA', 'ATACADAO', 'VIANENSE',
  'MUNDIAL', 'EMANUEL', 'MEGA', 'BOX', 'ZONA', 'SUL', 'ARMAZEM',
  'PAX', 'FEIRA', 'NOVA', 'SAMS', 'CLUB', 'CAB', 'PETROPOLIS', 'SUPER',
])

function normTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function tokensFortes(s: string): string[] {
  return normTexto(s).split(' ').filter(t => t.length >= 4 && !STOP_TOKENS.has(t))
}

/**
 * Preenche `sai` (motorista/placa) inferindo da escala original do dia.
 * Match por rede + (número de filial OU tokens fortes do nome).
 *
 * Caso típico: alteração tipo "Carrefour Campo Grande / Entra: Simão LSN-6I72"
 * (sem `Sai:` explícito). Sistema busca escala dia=data, acha a linha CARREFOUR
 * com "Campo Grande" no nome, copia motorista_nome/placa pra `sai`.
 */
async function inferirSaiDaEscala(
  parsed: AlteracaoParsed[],
  data: string,
  supabase: SupabaseClient,
): Promise<AlteracaoParsed[]> {
  if (!data) return parsed

  const { data: escala } = await supabase
    .from('escala_linhas')
    .select('rede_id, loja_nome_raw, loja_codigo_raw, motorista_nome, motorista_codigo, placa_norm, placa_raw, carro_ordem')
    .eq('data_entrega', data)

  if (!escala?.length) return parsed

  return parsed.map(p => {
    if (p.sai && (p.sai.placa_norm || p.sai.motorista_nome)) return p
    if (!p.loja_nome_raw) return p

    let linhaMatch: typeof escala[number] | null = null

    // 1) Match por número de filial (ex: "Loja 35", "Filial 23")
    const filialM = p.loja_nome_raw.match(/\b(\d{1,3})\b/)
    if (filialM) {
      const filialInt = parseInt(filialM[1], 10)
      linhaMatch = escala.find(l => {
        if (p.rede_id && l.rede_id !== p.rede_id) return false
        const codInt = parseInt(l.loja_codigo_raw ?? '', 10)
        return !isNaN(codInt) && codInt === filialInt
      }) ?? null
    }

    // 2) Match por tokens fortes (ex: "Carrefour Campo Grande", "Assai Sao Goncalo Camil")
    if (!linhaMatch) {
      const altTok = tokensFortes(p.loja_nome_raw)
      if (altTok.length >= 1) {
        linhaMatch = escala.find(l => {
          if (p.rede_id && l.rede_id !== p.rede_id) return false
          const linTok = new Set(tokensFortes(l.loja_nome_raw ?? ''))
          return altTok.every(t => linTok.has(t))
        }) ?? null
      }
    }

    if (!linhaMatch) return p

    return {
      ...p,
      sai: {
        motorista_nome: linhaMatch.motorista_nome ?? null,
        motorista_codigo: linhaMatch.motorista_codigo ? parseInt(String(linhaMatch.motorista_codigo), 10) : null,
        placa_raw: linhaMatch.placa_raw ?? null,
        placa_norm: linhaMatch.placa_norm ?? null,
      },
    }
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const ct = req.headers.get('content-type') ?? ''

  // Caminho A: PDF via formData → roteador tabular-first
  if (!ct.includes('application/json')) {
    const fd = await req.formData()
    const dataField = fd.get('data')
    const data = typeof dataField === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dataField) ? dataField : ''
    const pdfFile = fd.get('pdf')
    if (pdfFile instanceof File) {
      const buf = Buffer.from(await pdfFile.arrayBuffer())
      const { alteracoes } = await extrairAlteracoesPdf(buf)
      const inferidas = await inferirSaiDaEscala(alteracoes, data, supabase)
      return NextResponse.json(inferidas)
    }
    const textoField = fd.get('texto')
    if (typeof textoField === 'string') {
      const partes = splitAlteracoes(textoField)
      const results = partes.map(p => parseAlteracaoText(p)).filter(r => r.entra || r.sai)
      const alteracoes = results.length > 0 ? results : [parseAlteracaoText(textoField)]
      const inferidas = await inferirSaiDaEscala(alteracoes, data, supabase)
      return NextResponse.json(inferidas)
    }
    return new NextResponse('Envie "texto" ou "pdf".', { status: 400 })
  }

  // Caminho B: JSON com texto
  const body = await req.json().catch(() => null)
  if (!body?.texto) return new NextResponse('"texto" obrigatório.', { status: 400 })
  const texto = String(body.texto)
  const data = typeof body.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.data) ? body.data : ''
  const partes = splitAlteracoes(texto)
  const results = partes.map(p => parseAlteracaoText(p)).filter(r => r.entra || r.sai)
  const alteracoes = results.length > 0 ? results : [parseAlteracaoText(texto)]
  const inferidas = await inferirSaiDaEscala(alteracoes, data, supabase)
  return NextResponse.json(inferidas)
}
