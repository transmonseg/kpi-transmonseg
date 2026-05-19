import type { RotaKpi, AnomaliaDetectada } from '@/lib/types/kpi'

export async function analisaKpiComIA(
  _kpiId: string,
  rotas: RotaKpi[],
  anomalias: AnomaliaDetectada[],
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY não configurada')

  const model = process.env.OPENROUTER_MODEL ?? 'google/gemma-4-31b-it:free'

  const totalRotas = rotas.length
  const comGps = rotas.filter(r => r.paradas.length > 0).length
  const semGps = totalRotas - comGps

  const high   = anomalias.filter(a => a.severidade === 'HIGH').length
  const medium = anomalias.filter(a => a.severidade === 'MEDIUM').length
  const low    = anomalias.filter(a => a.severidade === 'LOW').length

  const listaAnomalias = anomalias.slice(0, 20)
    .map(a => `- [${a.severidade}] ${a.codigo}: ${a.descricao}${a.sugestao ? ` → ${a.sugestao}` : ''}`)
    .join('\n')

  const prompt = `Você é um analista de KPI de logística de distribuição. Analise os dados abaixo e escreva um parecer executivo em português.

DADOS DO DIA:
- Total de rotas: ${totalRotas}
- Rotas com GPS registrado: ${comGps}
- Rotas sem GPS: ${semGps}
- Anomalias críticas (HIGH): ${high}
- Anomalias moderadas (MEDIUM): ${medium}
- Anomalias baixas (LOW): ${low}

ANOMALIAS DETECTADAS:
${listaAnomalias || '(nenhuma anomalia detectada)'}

Escreva um resumo executivo com três seções:
1. Situação geral do dia
2. Pontos críticos (se houver)
3. Recomendações

Seja objetivo e direto. Máximo de 200 palavras.`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://kpi.transmonseg.com.br',
      'X-Title': 'KPI Transmonseg',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`OpenRouter ${res.status}: ${errBody}`)
  }

  const json = await res.json() as {
    choices: Array<{ message: { content: string } }>
  }

  return json.choices[0]?.message?.content?.trim() ?? ''
}
