#!/usr/bin/env tsx
/**
 * MCP server local para o Claude testar diretamente o sistema KPI Transmonseg.
 * NÃO vai pra produção. NÃO faz parte do build do Next.
 *
 * Tools:
 *  - parse_escala_geral(file)        → roda parser GERAL num XLSX local
 *  - parse_escala_zona_sul(file)     → roda parser ZONA SUL
 *  - parse_escala_pax(file)          → roda parser PAX
 *  - parse_unitrac(file)             → roda parser Unitrac
 *  - load_files(data, files)         → sobe arquivos no DB de uma data
 *  - processar_kpi(data, rede_id?)   → roda matcher + anomalias (mesma lógica do endpoint)
 *  - query_kpi(data)                 → retorna KPIs + anomalias da data
 *  - clear_data(data?)               → limpa banco (escala/unitrac/kpis)
 */

import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

import { parseEscalaGeral } from '../src/lib/parsers/escala-geral.js'
import { parseEscalaZonaSul } from '../src/lib/parsers/escala-zona-sul.js'
import { parseEscalaPax } from '../src/lib/parsers/escala-pax.js'
import { parseUnitrac } from '../src/lib/parsers/unitrac.js'
import { parseUnitracPdf } from '../src/lib/parsers/unitrac-pdf.js'
import { cruzaEscalaUnitrac } from '../src/lib/kpi/matcher.js'
import { detectaAnomalias } from '../src/lib/kpi/anomalia.js'

// Carrega .env.local também (Next.js convention)
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios em .env.local')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function loadFileBuffer(filePath: string): Promise<Buffer> {
  return await readFile(filePath)
}

function ok(content: unknown) {
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  return { content: [{ type: 'text' as const, text }] }
}

function err(message: string) {
  return { content: [{ type: 'text' as const, text: `ERRO: ${message}` }], isError: true }
}

const server = new McpServer({
  name: 'kpi-transmonseg-dev',
  version: '0.1.0',
})

// ─── parse_escala_geral ──────────────────────────────────────
server.registerTool(
  'parse_escala_geral',
  {
    title: 'Parsear escala GERAL',
    description: 'Roda o parser de escala GERAL num arquivo XLSX local. Retorna linhas extraídas (placa, rede, motorista, loja, etc.) sem inserir no banco. Útil pra testar mudanças no parser sem upload.',
    inputSchema: {
      file: z.string().describe('Caminho absoluto do XLSX'),
      data_alvo: z.string().optional().describe('Filtrar por data YYYY-MM-DD (opcional)'),
    },
  },
  async ({ file, data_alvo }) => {
    try {
      const buf = await loadFileBuffer(file)
      const linhas = await parseEscalaGeral(buf, data_alvo)
      return ok({
        total_linhas: linhas.length,
        datas_distintas: [...new Set(linhas.map(l => l.data))].sort(),
        redes_distintas: [...new Set(linhas.map(l => l.rede_id))].sort(),
        sample: linhas.slice(0, 5),
      })
    } catch (e: any) {
      return err(e.message)
    }
  },
)

// ─── parse_escala_zona_sul ───────────────────────────────────
server.registerTool(
  'parse_escala_zona_sul',
  {
    title: 'Parsear escala ZONA SUL',
    description: 'Roda o parser de escala Zona Sul num XLSX local. Retorna linhas com lojas resolvidas. Verifica regra do 17:00+ = dia seguinte.',
    inputSchema: {
      file: z.string().describe('Caminho absoluto do XLSX'),
      data_alvo: z.string().optional().describe('Filtrar por data YYYY-MM-DD'),
    },
  },
  async ({ file, data_alvo }) => {
    try {
      const buf = await loadFileBuffer(file)
      const linhas = await parseEscalaZonaSul(buf, data_alvo)
      return ok({
        total_linhas: linhas.length,
        datas_distintas: [...new Set(linhas.map(l => l.data))].sort(),
        datas_entrega_distintas: [...new Set(linhas.map(l => l.data_entrega))].sort(),
        sample: linhas.slice(0, 5),
      })
    } catch (e: any) {
      return err(e.message)
    }
  },
)

// ─── parse_escala_pax ────────────────────────────────────────
server.registerTool(
  'parse_escala_pax',
  {
    title: 'Parsear escala PAX',
    description: 'Parser PAX (Super Pax, Feira Nova, Emanuel). Por nome de aba = dia.',
    inputSchema: {
      file: z.string().describe('Caminho absoluto do XLSX'),
      data_alvo: z.string().optional(),
    },
  },
  async ({ file, data_alvo }) => {
    try {
      const buf = await loadFileBuffer(file)
      const linhas = await parseEscalaPax(buf, data_alvo)
      return ok({
        total_linhas: linhas.length,
        datas_distintas: [...new Set(linhas.map(l => l.data))].sort(),
        redes_distintas: [...new Set(linhas.map(l => l.rede_id))].sort(),
        sample: linhas.slice(0, 5),
      })
    } catch (e: any) {
      return err(e.message)
    }
  },
)

// ─── parse_unitrac ───────────────────────────────────────────
server.registerTool(
  'parse_unitrac',
  {
    title: 'Parsear relatório Unitrac',
    description: 'Roda o parser Unitrac num XLSX. Retorna paradas extraídas por veículo (sem inserir no banco). Verifica consolidação de paradas consecutivas mesma loja.',
    inputSchema: {
      file: z.string().describe('Caminho absoluto do XLSX'),
    },
  },
  async ({ file }) => {
    try {
      const buf = await loadFileBuffer(file)
      const veiculos = await parseUnitrac(buf)
      const totalParadas = veiculos.reduce((s, v) => s + v.paradas.length, 0)
      return ok({
        total_veiculos: veiculos.length,
        total_paradas: totalParadas,
        sample_veiculos: veiculos.slice(0, 3).map(v => ({
          placa_norm: v.placa_norm,
          inicio_viagem: v.inicio_viagem,
          fim_viagem: v.fim_viagem,
          qtd_paradas: v.paradas.length,
          primeiras_3_paradas: v.paradas.slice(0, 3),
        })),
      })
    } catch (e: any) {
      return err(e.message)
    }
  },
)

// ─── parse_unitrac_pdf ───────────────────────────────────────
server.registerTool(
  'parse_unitrac_pdf',
  {
    title: 'Parsear PDF Unitrac',
    description: 'Parser do PDF do Unitrac (Relatório Parada e Serviço Analítico). Tem coluna "Local da Parada" que o XLSX não tem, classificando automaticamente cada parada como BASE/LOJA/FORA. Use o PDF pra dados reais do dia.',
    inputSchema: { file: z.string().describe('Caminho absoluto do PDF') },
  },
  async ({ file }) => {
    try {
      const buf = await loadFileBuffer(file)
      const veiculos = await parseUnitracPdf(buf)
      const total = veiculos.reduce((s, v) => s + v.paradas.length, 0)
      return ok({
        total_veiculos: veiculos.length,
        total_paradas: total,
        classificacoes: veiculos.flatMap(v => v.paradas).reduce((acc, p) => {
          acc[p.classificacao] = (acc[p.classificacao] ?? 0) + 1
          return acc
        }, {} as Record<string, number>),
        sample: veiculos.slice(0, 2),
      })
    } catch (e: any) {
      return err(e.message)
    }
  },
)

// ─── load_files ──────────────────────────────────────────────
server.registerTool(
  'load_files',
  {
    title: 'Carregar arquivos no banco',
    description: 'Lê 1+ arquivos (escala GERAL/ZONA_SUL/PAX + Unitrac), parseia e INSERE no banco como se fosse um upload via UI. Para uma data específica. Não pula validações.',
    inputSchema: {
      data: z.string().describe('Data YYYY-MM-DD da escala/relatório'),
      escala_geral_file: z.string().optional(),
      escala_zona_sul_file: z.string().optional(),
      escala_pax_file: z.string().optional(),
      unitrac_file: z.string().optional().describe('XLSX do Unitrac'),
      unitrac_pdf_file: z.string().optional().describe('PDF do Unitrac (formato analítico). Se especificado, é usado em vez do XLSX.'),
    },
  },
  async ({ data, escala_geral_file, escala_zona_sul_file, escala_pax_file, unitrac_file, unitrac_pdf_file }) => {
    try {
      const supabase = sb()
      const userId = process.env.MCP_DEV_USER_ID || null

      const results: any = { data, inserted: {} }

      // Escalas
      const escalas: Array<{ tipo: 'GERAL' | 'ZONA_SUL' | 'PAX'; file?: string; parser: any }> = [
        { tipo: 'GERAL', file: escala_geral_file, parser: parseEscalaGeral },
        { tipo: 'ZONA_SUL', file: escala_zona_sul_file, parser: parseEscalaZonaSul },
        { tipo: 'PAX', file: escala_pax_file, parser: parseEscalaPax },
      ]

      for (const e of escalas) {
        if (!e.file) continue
        const buf = await loadFileBuffer(e.file)
        const linhas = await e.parser(buf, data)
        if (linhas.length === 0) {
          results.inserted[e.tipo] = { linhas: 0, msg: 'nenhuma linha pra esta data' }
          continue
        }
        // Insere upload
        const { data: up, error: upErr } = await supabase.from('escala_uploads').insert({
          data_escala: data,
          tipo: e.tipo,
          arquivo_path: e.file,
          nome_arquivo: e.file.split(/[\/\\]/).pop(),
          qtd_linhas: linhas.length,
          status: 'processado',
          uploaded_by: userId,
          processado_em: new Date().toISOString(),
        }).select('id').single()
        if (upErr) throw new Error(`upload ${e.tipo}: ${upErr.message}`)
        // Insere linhas
        const rows = linhas.map((l: any) => ({ ...l, escala_upload_id: up.id }))
        const { error: linhasErr } = await supabase.from('escala_linhas').insert(rows)
        if (linhasErr) throw new Error(`linhas ${e.tipo}: ${linhasErr.message}`)
        results.inserted[e.tipo] = { linhas: linhas.length, upload_id: up.id }
      }

      // Unitrac — aceita PDF (preferido, tem Local da Parada) ou XLSX
      const unitracPath = unitrac_pdf_file || unitrac_file
      const isUnitracPdf = !!unitrac_pdf_file
      if (unitracPath) {
        const buf = await loadFileBuffer(unitracPath)
        const veiculos = isUnitracPdf ? await parseUnitracPdf(buf) : await parseUnitrac(buf)
        const totalParadas = veiculos.reduce((s, v) => s + v.paradas.length, 0)
        const { data: up, error: upErr } = await supabase.from('unitrac_uploads').insert({
          data_relatorio: data,
          arquivo_path: unitracPath,
          nome_arquivo: unitracPath.split(/[\/\\]/).pop(),
          qtd_abas: veiculos.length,
          qtd_paradas: totalParadas,
          status: 'processado',
          uploaded_by: userId,
          processado_em: new Date().toISOString(),
        }).select('id').single()
        if (upErr) throw new Error(`unitrac upload: ${upErr.message}`)

        // Flatten paradas
        const paradaRows: any[] = []
        for (const v of veiculos) {
          for (const p of v.paradas) {
            paradaRows.push({
              unitrac_upload_id: up.id,
              placa_norm: v.placa_norm,
              chegada: p.chegada.toISOString(),
              saida: p.saida?.toISOString() ?? null,
              duracao_seg: p.duracao_seg,
              distancia_km: p.distancia_km,
              endereco: p.endereco,
              lat: p.lat,
              lng: p.lng,
              local_parada: p.local_parada,
              codigo_loja: p.codigo_loja,
              nome_loja: p.nome_loja,
              classificacao: p.classificacao,
              ordem: p.ordem,
            })
          }
        }
        // Insere em batches de 500 pra não estourar limite
        for (let i = 0; i < paradaRows.length; i += 500) {
          const batch = paradaRows.slice(i, i + 500)
          const { error } = await supabase.from('unitrac_paradas').insert(batch)
          if (error) throw new Error(`paradas batch ${i}: ${error.message}`)
        }
        results.inserted['UNITRAC'] = { veiculos: veiculos.length, paradas: totalParadas, upload_id: up.id }
      }

      return ok(results)
    } catch (e: any) {
      return err(e.message)
    }
  },
)

// ─── processar_kpi ───────────────────────────────────────────
server.registerTool(
  'processar_kpi',
  {
    title: 'Processar KPI (matcher + anomalias)',
    description: 'Lê escala+unitrac do banco pra uma data, roda cruzaEscalaUnitrac + detectaAnomalias, e INSERE kpis/kpi_rotas/anomalias. Mesma lógica do endpoint /api/kpi/processar mas sem auth.',
    inputSchema: {
      data: z.string().describe('Data YYYY-MM-DD'),
      rede_id: z.string().optional().describe('Filtrar uma rede só (opcional)'),
    },
  },
  async ({ data, rede_id }) => {
    try {
      const supabase = sb()

      let q = supabase.from('escala_linhas').select('id, rede_id, placa_norm, loja_nome_raw, loja_codigo_raw, motorista_nome, carro_ordem, data_entrega').eq('data_entrega', data)
      if (rede_id) q = q.eq('rede_id', rede_id)
      const { data: escalaLinhas, error: escalaErr } = await q
      if (escalaErr) throw new Error(`buscar escala: ${escalaErr.message}`)
      if (!escalaLinhas?.length) return ok({ msg: 'Nenhuma escala encontrada pra esta data', data })

      const placas = [...new Set(escalaLinhas.filter(l => l.placa_norm).map(l => l.placa_norm as string))]
      const { data: paradaRows, error: paradaErr } = await supabase
        .from('unitrac_paradas')
        .select('id, placa_norm, chegada, saida, duracao_seg, distancia_km, endereco, lat, lng, local_parada, codigo_loja, nome_loja, classificacao, loja_id, ordem, unitrac_uploads!inner(data_relatorio)')
        .eq('unitrac_uploads.data_relatorio', data)
        .in('placa_norm', placas.length ? placas : ['__nenhuma__'])
      if (paradaErr) throw new Error(`buscar paradas: ${paradaErr.message}`)

      const { data: lojas } = await supabase
        .from('lojas')
        .select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros')
        .eq('ativo', true)

      const redeIds = [...new Set(escalaLinhas.map(l => l.rede_id as string))]
      const { data: redes } = await supabase.from('redes').select('id, nome, janela_inicio, janela_fim').in('id', redeIds)
      const janelasRede = new Map(
        (redes ?? [])
          .filter(r => r.janela_inicio && r.janela_fim)
          .map(r => [r.id as string, { janela_inicio: r.janela_inicio as string, janela_fim: r.janela_fim as string }]),
      )

      const summary: any = { data, redes: [] }

      for (const rid of redeIds) {
        const linhasRede = escalaLinhas.filter(l => l.rede_id === rid)
        const placasRede = new Set(linhasRede.filter(l => l.placa_norm).map(l => l.placa_norm as string))
        const paradasRede = (paradaRows ?? []).filter(p => placasRede.has(p.placa_norm as string))

        const rotas = cruzaEscalaUnitrac(
          linhasRede as any,
          paradasRede as any,
          (lojas ?? []).filter(l => l.rede_id === rid) as any,
        )

        const paradasIndex = new Map<string, any[]>()
        for (const p of paradasRede) {
          const list = paradasIndex.get(p.placa_norm as string) ?? []
          list.push({
            id: p.id as string,
            classificacao: p.classificacao as string,
            chegada: new Date(p.chegada as string),
            saida: p.saida ? new Date(p.saida as string) : null,
            duracao_seg: p.duracao_seg as number | null,
            lat: p.lat as number | null,
            lng: p.lng as number | null,
          })
          paradasIndex.set(p.placa_norm as string, list)
        }

        const anomalias = detectaAnomalias({
          rotas,
          escalaLinhas: linhasRede as any,
          paradasIndex,
          janelasRede,
          data,
        })

        // UPSERT kpis
        const { data: kpiRecord, error: kpiErr } = await supabase.from('kpis').upsert(
          {
            data,
            rede_id: rid,
            status: 'rascunho',
            qtd_linhas: rotas.length,
            qtd_anomalias_high: anomalias.filter(a => a.severidade === 'HIGH').length,
            qtd_anomalias_medium: anomalias.filter(a => a.severidade === 'MEDIUM').length,
            qtd_anomalias_low: anomalias.filter(a => a.severidade === 'LOW').length,
            gerada_em: new Date().toISOString(),
            gerada_por: process.env.MCP_DEV_USER_ID || null,
          },
          { onConflict: 'data,rede_id', ignoreDuplicates: false },
        ).select('id').single()
        if (kpiErr) throw new Error(`upsert kpi ${rid}: ${kpiErr.message}`)

        const rotaRows = rotas.map(r => ({
          escala_linha_id: r.escala_linha_id,
          data: r.data,
          rede_id: r.rede_id,
          placa_norm: r.placa_norm,
          saida_cd: r.saida_cd?.toISOString() ?? null,
          paradas_json: r.paradas.map(p => ({
            parada_id: p.parada_id,
            loja_id: p.loja_id,
            nome: p.nome,
            chegada: p.chegada.toISOString(),
            saida: p.saida.toISOString(),
            duracao_min: p.duracao_min,
            classificacao: p.classificacao,
          })),
          anomalias_codigos: r.anomalias_codigos,
          status: r.status,
        }))
        if (rotaRows.length) {
          const { error: rotaErr } = await supabase.from('kpi_rotas').upsert(rotaRows, { onConflict: 'escala_linha_id' })
          if (rotaErr) throw new Error(`upsert kpi_rotas ${rid}: ${rotaErr.message}`)
        }

        // Re-fetch ids pra anomalia mapping
        const { data: rotasDb } = await supabase
          .from('kpi_rotas')
          .select('id, escala_linha_id')
          .in('escala_linha_id', rotas.map(r => r.escala_linha_id))
        const rotaIdByEscalaLinhaId = new Map((rotasDb ?? []).map(r => [r.escala_linha_id as string, r.id as string]))

        const kpiRotaIds = [...rotaIdByEscalaLinhaId.values()]
        if (kpiRotaIds.length) await supabase.from('anomalias').delete().in('kpi_rota_id', kpiRotaIds)

        if (anomalias.length) {
          const anomRows = anomalias.map(a => ({
            data: a.data,
            kpi_rota_id: a.kpi_rota_id ? rotaIdByEscalaLinhaId.get(a.kpi_rota_id) ?? null : null,
            parada_id: a.parada_id,
            codigo: a.codigo,
            severidade: a.severidade,
            descricao: a.descricao,
            sugestao: a.sugestao,
            payload_json: a.payload,
            status: 'pendente',
          }))
          const { error: anomErr } = await supabase.from('anomalias').insert(anomRows)
          if (anomErr) throw new Error(`insert anomalias ${rid}: ${anomErr.message}`)
        }

        summary.redes.push({
          rede_id: rid,
          rotas: rotas.length,
          anomalias: {
            HIGH: anomalias.filter(a => a.severidade === 'HIGH').length,
            MEDIUM: anomalias.filter(a => a.severidade === 'MEDIUM').length,
            LOW: anomalias.filter(a => a.severidade === 'LOW').length,
          },
        })
      }
      return ok(summary)
    } catch (e: any) {
      return err(e.message)
    }
  },
)

// ─── query_kpi ───────────────────────────────────────────────
server.registerTool(
  'query_kpi',
  {
    title: 'Consultar KPIs de uma data',
    description: 'Retorna KPIs + contagem de anomalias por rede pra uma data. Opcionalmente inclui detalhes das anomalias.',
    inputSchema: {
      data: z.string().describe('Data YYYY-MM-DD'),
      incluir_anomalias: z.boolean().optional().describe('Se true, retorna lista detalhada de anomalias'),
    },
  },
  async ({ data, incluir_anomalias }) => {
    try {
      const supabase = sb()
      const { data: kpis } = await supabase.from('kpis').select('*').eq('data', data).order('rede_id')
      const result: any = { data, kpis: kpis ?? [] }
      if (incluir_anomalias && kpis?.length) {
        const { data: anomalias } = await supabase.from('anomalias').select('*').eq('data', data).order('severidade')
        result.anomalias = anomalias ?? []
      }
      return ok(result)
    } catch (e: any) {
      return err(e.message)
    }
  },
)

// ─── clear_data ──────────────────────────────────────────────
server.registerTool(
  'clear_data',
  {
    title: 'Limpar dados de upload',
    description: 'Apaga escala_uploads/linhas + unitrac_uploads/paradas + kpis/kpi_rotas/anomalias. Mantém lojas e redes. Se data for fornecida, apaga só dessa data.',
    inputSchema: {
      data: z.string().optional().describe('Data YYYY-MM-DD (opcional, se omitir apaga TUDO)'),
    },
  },
  async ({ data }) => {
    try {
      const supabase = sb()
      if (data) {
        await supabase.from('anomalias').delete().eq('data', data)
        await supabase.from('kpi_rotas').delete().eq('data', data)
        await supabase.from('kpis').delete().eq('data', data)
        await supabase.from('unitrac_paradas').delete().in('unitrac_upload_id',
          (await supabase.from('unitrac_uploads').select('id').eq('data_relatorio', data)).data?.map(u => u.id) ?? [])
        await supabase.from('unitrac_uploads').delete().eq('data_relatorio', data)
        await supabase.from('escala_linhas').delete().in('escala_upload_id',
          (await supabase.from('escala_uploads').select('id').eq('data_escala', data)).data?.map(u => u.id) ?? [])
        await supabase.from('escala_uploads').delete().eq('data_escala', data)
        return ok({ msg: `Dados da data ${data} apagados` })
      }
      // Sem data: limpa tudo
      await supabase.from('anomalias').delete().gt('data', '1900-01-01')
      await supabase.from('kpi_rotas').delete().gt('data', '1900-01-01')
      await supabase.from('kpis').delete().gt('data', '1900-01-01')
      await supabase.from('unitrac_paradas').delete().gt('chegada', '1900-01-01')
      await supabase.from('unitrac_uploads').delete().gt('data_relatorio', '1900-01-01')
      await supabase.from('escala_linhas').delete().gt('data', '1900-01-01')
      await supabase.from('escala_uploads').delete().gt('data_escala', '1900-01-01')
      return ok({ msg: 'TODOS os dados apagados (lojas e redes mantidas)' })
    } catch (e: any) {
      return err(e.message)
    }
  },
)

// ─── start ───────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[mcp-kpi-dev] servidor MCP rodando via stdio')
}
main().catch((e) => {
  console.error('[mcp-kpi-dev] FATAL:', e)
  process.exit(1)
})
