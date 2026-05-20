/**
 * Teste end-to-end do pipeline sem dev server.
 * Usa service role key direto no Supabase REST API.
 */
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const BASE_ESCALA = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/escalas'
const BASE_UNITRAC = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/relatorios-unitrac'

const SUPABASE_URL = 'https://luhwpsckvbctxynifryk.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1aHdwc2NrdmJjdHh5bmlmcnlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODcwMzE0MSwiZXhwIjoyMDk0Mjc5MTQxfQ.t4R0Rxs4l9VH6YoR-8aE6Bno7hRr86m6FQq35CaD6bQ'

const headers = { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' }

async function rest(method, table, body, params = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  if (!r.ok) {
    const t = await r.text(); throw new Error(`${method} ${table}: ${r.status} ${t}`)
  }
  return r.status === 204 ? null : r.json()
}

// ────────────────────────────────────────────────────────────────────────────
// Import parsers via dynamic require (CommonJS modules in node_modules)
// We need to transpile TS first OR call via tsx
// Instead: use tsx to run this
// ────────────────────────────────────────────────────────────────────────────

console.log('Iniciando teste do pipeline...\n')

// Step 1: Check Unitrac DIA14 file
const unitracPath = path.join(BASE_UNITRAC, 'relatorio_unitrac_9086_DIA14.xlsx')
console.log('Unitrac DIA14 existe?', readFileSync(unitracPath).length, 'bytes')

console.log('Script pronto para execução com tsx')
