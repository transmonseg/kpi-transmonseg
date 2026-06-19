// Sonda a API aberta do Unitrac (datalayer) pra descobrir endpoints que o sistema
// nunca chamou: histórico de posições (km/velocidade), eventos/alertas de risco,
// motoristas, áreas/cercas. Só leitura (GET/POST de consulta). Reporta status real
// + a cara do JSON (chaves de topo, tamanho, 1 amostra).
const BASE = 'https://datalayer.portalunitrac.com'
const COD = '4586'
const TIMEOUT = 8000

async function hit(method: 'GET' | 'POST', path: string, body?: unknown) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    const r = await fetch(`${BASE}${path}`, {
      method,
      signal: ctrl.signal,
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
    })
    const txt = await r.text()
    let json: any = null
    try { json = JSON.parse(txt) } catch {}
    return { status: r.status, len: txt.length, json, raw: txt.slice(0, 220) }
  } catch (e: any) {
    return { status: -1, len: 0, json: null, raw: `ERRO: ${e?.name ?? e}` }
  } finally { clearTimeout(t) }
}

function resumo(j: any): string {
  if (j == null) return '(não-JSON)'
  if (Array.isArray(j)) return `array[${j.length}]${j[0] ? ' keys=' + Object.keys(j[0]).join(',') : ''}`
  if (typeof j === 'object') {
    const ks = Object.keys(j)
    // se tem uma chave que é array, mostra ela
    for (const k of ks) {
      const v = (j as any)[k]
      if (Array.isArray(v)) return `obj{${ks.join(',')}} → ${k}[${v.length}]${v[0] ? ' keys=' + Object.keys(v[0]).join(',') : ''}`
    }
    return `obj{${ks.join(',')}}`
  }
  return String(j).slice(0, 80)
}

// 1) Frota pra pegar um CV ativo
const frota: any = (await hit('GET', `/veiculos/masn/${COD}`)).json
const cvs: string[] = (frota?.veiculos ?? []).map((v: any) => String(v.cv)).filter(Boolean)
const cv = cvs[0] ?? '18594'
console.log(`Frota: ${cvs.length} veículos. CV de teste: ${cv}\n`)
console.log('STATUS | ENDPOINT'.padEnd(60) + '| RESPOSTA')
console.log('─'.repeat(110))

const probes: Array<[ 'GET'|'POST', string, unknown? ]> = [
  ['GET',  `/veiculos/masn/${COD}`],                       // sanity
  ['GET',  `/mapa_servicos/stops/${cv}/24`],               // sanity (usado)
  ['GET',  `/mapa_servicos/historico/${cv}/24`],
  ['GET',  `/mapa_servicos/posicoes_historico/${cv}/24`],
  ['GET',  `/mapa_servicos/percurso/${cv}/24`],
  ['GET',  `/mapa_servicos/trajeto/${cv}/24`],
  ['GET',  `/mapa_servicos/eventos/${cv}/24`],
  ['GET',  `/mapa_servicos/alertas/${cv}/24`],
  ['GET',  `/mapa_servicos/km/${cv}/24`],
  ['GET',  `/mapa_servicos/odometro/${cv}/24`],
  ['POST', `/mapa_servicos/historico`, [cv]],
  ['POST', `/mapa_servicos/eventos`, [cv]],
  ['POST', `/mapa_servicos/alertas`, [cv]],
  ['POST', `/mapa_servicos/velocidade`, [cv]],
  ['GET',  `/motoristas/masn/${COD}`],
  ['GET',  `/condutores/masn/${COD}`],
  ['GET',  `/areas/masn/${COD}`],
  ['GET',  `/cercas/masn/${COD}`],
  ['GET',  `/mapa_servicos/areas`],
  ['POST', `/mapa_servicos/areas`, [cv]],
]

for (const [m, p, b] of probes) {
  const r = await hit(m, p, b)
  const tag = `${String(r.status).padStart(4)}  | ${m} ${p}`.padEnd(58)
  const info = r.status === 200 ? resumo(r.json) : (r.status === -1 ? r.raw : `len=${r.len} ${r.raw.replace(/\s+/g, ' ').slice(0, 60)}`)
  console.log(`${tag}| ${info}`)
}
process.exit(0)
