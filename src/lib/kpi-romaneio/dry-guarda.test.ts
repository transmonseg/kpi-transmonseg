import { describe, it, expect } from 'vitest'
import { escritaBloqueada } from './dry-guarda'

// F0-07 (plano mestre 23/10): o teste a seco regravava kpi_romaneio_geocode_cache
// e o cache negativo. Bloqueia toda escrita no Supabase (REST e storage); deixa
// leitura e RPC (funcoes de consulta) passarem.
const BASE = 'http://127.0.0.1:8000'
describe('escritaBloqueada', () => {
  it('bloqueia upsert/insert/update/delete no PostgREST e upload no storage', () => {
    expect(escritaBloqueada(`${BASE}/rest/v1/kpi_romaneio_geocode_cache?on_conflict=endereco`, 'POST', BASE)).toBe(true)
    expect(escritaBloqueada(`${BASE}/rest/v1/kpi_ao_vivo_calculo?cliente=eq.nutrimax`, 'PATCH', BASE)).toBe(true)
    expect(escritaBloqueada(`${BASE}/rest/v1/kpi_cache_dia?data=lt.2026-10-01`, 'DELETE', BASE)).toBe(true)
    expect(escritaBloqueada(`${BASE}/storage/v1/object/kpi-romaneio-inputs/x.xlsx`, 'POST', BASE)).toBe(true)
  })
  it('deixa passar leitura, RPC e chamadas fora do Supabase (ponte do monitoramento)', () => {
    expect(escritaBloqueada(`${BASE}/rest/v1/kpi_ao_vivo_calculo?select=resultado`, 'GET', BASE)).toBe(false)
    expect(escritaBloqueada(`${BASE}/rest/v1/rpc/cnefe_candidatos_por_rua`, 'POST', BASE)).toBe(false)
    expect(escritaBloqueada('http://127.0.0.1:3010/api/romaneio/geocode', 'POST', BASE)).toBe(false)
  })
})
