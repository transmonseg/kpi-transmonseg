// Auditoria da GEOCODIFICACAO (08/10, "a geocodificacao pode estar errando e marcando
// coisa como entregue"). Roda NO SERVIDOR, so' le:
//   FAKE_HOJE=2026-10-09 npx tsx --env-file=.env.production --tsconfig tsconfig.json scripts/auditar-geocode.ts 2026-10-08
// Para cada NF compara tres pontos -- o geocode do romaneio, o cadastro da Unitrac e
// onde o caminhao PARADO de fato esteve (GPS cru do monitoramento) -- e cruza com a
// fonte do geocode (kpi_romaneio_geocode_cache). Saida: /tmp/geocode-<dia>.csv + resumo.
if (process.env.FAKE_HOJE) {
  const orig = Date.prototype.toLocaleDateString
  Date.prototype.toLocaleDateString = function (this: Date, ...a: any[]) {
    if (Math.abs(this.getTime() - Date.now()) < 5000 && a[0] === 'en-CA') return process.env.FAKE_HOJE as string
    return orig.apply(this, a as any)
  }
}
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { gerarKpiNutrimax } from '../src/lib/kpi-romaneio/gerar-nutrimax'
import { entradaDoDia } from '../src/lib/kpi-romaneio/ao-vivo-servico'
import { chaveCacheEndereco } from '../src/lib/kpi-romaneio/endereco-cep'

const data = process.argv[2]
if (!/^\d{4}-\d{2}-\d{2}$/.test(data ?? '')) throw new Error('uso: auditar-geocode.ts AAAA-MM-DD')
const psql = (db: string, sql: string) => execFileSync('sudo', ['-u', 'postgres', 'psql', '-d', db, '-At', '-F', '|', '-f', '-'], { input: sql, maxBuffer: 256 * 1024 * 1024 }).toString().trim().split('\n').filter(Boolean)
const R = Math.PI / 180
const hav = (a: number, b: number, c: number, d: number) => 6371000 * Math.acos(Math.min(1, Math.cos(a * R) * Math.cos(c * R) * Math.cos((d - b) * R) + Math.sin(a * R) * Math.sin(c * R)))
const q = (s: string) => s.replace(/'/g, "''")

async function main() {
  const entrada = await entradaDoDia('nutrimax', data)
  if (!entrada) throw new Error('sem entrada do dia')
  let geo: any[] = []
  const res = await gerarKpiNutrimax(entrada, { semLocaisClientes: !!process.env.SEM_LOCAIS, aoMontarDetalhe: (a: any) => { geo = a.romaneioGeo } })
  const geoPorNf = new Map(geo.map(g => [g.nf, g]))
  const det = res.detalhe.filter((d: any) => geoPorNf.get(d.nf)?.lat != null)

  // Cadastro da Unitrac por NF.
  const cad = new Map<string, { lat: number; lng: number; sit: string }>()
  for (const l of psql('kpi_transmonseg', `select a->>'documento', a->>'pontoLat', a->>'pontoLng', a->>'situacao' from (select alvos from kpi_alvos_snapshot where cliente='nutrimax' and data_referencia='${data}' order by capturado_em desc limit 1) s, jsonb_array_elements(s.alvos) a where a->>'pontoLat' is not null and a->>'pontoLat' <> '0'`)) {
    const [nf, la, ln, sit] = l.split('|'); cad.set(nf, { lat: Number(la), lng: Number(ln), sit })
  }
  // Fonte do geocode (cache do KPI), pela mesma chave que a geracao usa.
  const chaves = [...new Set(det.map((d: any) => chaveCacheEndereco(d.endereco)))]
  const fonte = new Map<string, { fonte: string; confiavel: string; motivo: string }>()
  for (const l of psql('kpi_transmonseg', `select endereco, coalesce(fonte,''), confiavel::text, coalesce(motivo,'') from kpi_romaneio_geocode_cache where endereco in (${chaves.map(c => `'${q(c)}'`).join(',')})`)) {
    const [e, f, c, m] = l.split('|'); fonte.set(e, { fonte: f || 'sem_fonte', confiavel: c, motivo: m })
  }
  // GPS: por NF e ponto (g=geocode, c=cadastro): minutos parado <=150 m e menor distancia.
  const pontos: string[] = []
  for (const d of det) {
    const g = geoPorNf.get(d.nf), placa = `${d.placa.slice(0, 3)}-${d.placa.slice(3)}`
    pontos.push(`('${d.nf}','g','${placa}',${g.lat},${g.lng})`)
    const c = cad.get(d.nf); if (c) pontos.push(`('${d.nf}','c','${placa}',${c.lat},${c.lng})`)
  }
  const dist = `6371000*acos(least(1,cos(radians(v.lat))*cos(radians(h.lat))*cos(radians(h.lng)-radians(v.lng))+sin(radians(v.lat))*sin(radians(h.lat))))`
  const gps = new Map<string, { parado: number; minM: number | null }>()
  for (const l of psql('transmonseg', `select v.nf, v.k, count(*) filter (where h.velocidade<=3 and coalesce(h.atraso_min,0)<=2 and ${dist}<=150), min(${dist}) filter (where coalesce(h.atraso_min,0)<=2)
    from (values ${pontos.join(',')}) v(nf,k,placa,lat,lng) join veiculos ve on upper(replace(ve.placa,'-',''))=upper(replace(v.placa,'-',''))
    left join posicoes_historico h on h.veiculo_id=ve.id and h.criado_em >= ('${data}'::date)::timestamp at time zone 'America/Sao_Paulo' and h.criado_em < ('${data}'::date+1)::timestamp at time zone 'America/Sao_Paulo' and abs(h.lat-v.lat)<0.0014 and abs(h.lng-v.lng)<0.0014
    group by v.nf, v.k`)) {
    const [nf, k, p, m] = l.split('|'); gps.set(`${nf}|${k}`, { parado: Number(p), minM: m === '' ? null : Number(m) })
  }

  const linhas = ['nf;placa;cliente;endereco;status;evidencia;classe;fonte_geo;geo_confiavel;geo_motivo;d_geo_cad_m;geo_parado_min;cad_parado_min;kpi_dist_parada_m;feito_unitrac']
  const cont = new Map<string, number>()
  const porFonte = new Map<string, Record<string, number>>()
  for (const d of det) {
    const g = geoPorNf.get(d.nf), c = cad.get(d.nf)
    const f = fonte.get(chaveCacheEndereco(d.endereco)) ?? { fonte: 'sem_cache', confiavel: '', motivo: '' }
    const gg = gps.get(`${d.nf}|g`) ?? { parado: 0, minM: null }, gc = gps.get(`${d.nf}|c`) ?? { parado: 0, minM: null }
    const dGC = c ? Math.round(hav(g.lat, g.lng, c.lat, c.lng)) : null
    const entregue = d.status !== 'pendente'
    const noGeo = gg.parado >= 2, noCad = gc.parado >= 2
    let classe: string
    if (entregue) classe = noGeo ? 'ENTREGUE_geocode_ok' : noCad ? 'ENTREGUE_so_pelo_cadastro (geocode errado)' : (gg.minM == null && gc.minM == null) ? 'ENTREGUE_sem_gps' : 'ENTREGUE_sem_parada_no_geocode_nem_cadastro'
    else classe = (gg.parado >= 3 || gc.parado >= 3) ? `NAO_ENTREGUE_mas_GPS_parou (${gg.parado >= 3 ? 'no geocode' : 'no cadastro'})` : 'NAO_ENTREGUE_ok'
    cont.set(classe, (cont.get(classe) ?? 0) + 1)
    const pf = porFonte.get(f.fonte) ?? {}; pf[classe.split(' ')[0]] = (pf[classe.split(' ')[0]] ?? 0) + 1; porFonte.set(f.fonte, pf)
    linhas.push([d.nf, d.placa, d.clienteNome.replace(/;/g, ','), d.endereco.replace(/;/g, ','), d.status, d.evidencia, classe, f.fonte, g.geoConfiavel === false ? 'nao' : 'sim', g.geoMotivo ?? f.motivo, dGC ?? '', gg.parado, c ? gc.parado : '', d.distParadaM == null ? '' : Math.round(d.distParadaM), c?.sit ?? ''].join(';'))
  }
  writeFileSync(`/tmp/geocode-${data}${process.env.SEM_LOCAIS ? '-sem-locais' : ''}.csv`, '﻿' + linhas.join('\n'))
  console.log(`NFs com geocode: ${det.length} de ${res.detalhe.length}`)
  for (const [k, n] of [...cont].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(5), k)
  console.log('--- por fonte do geocode (classe x fonte)')
  for (const [f, o] of [...porFonte].sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0))) console.log(f.padEnd(24), JSON.stringify(o))
}
main().catch(e => { console.error(e); process.exit(1) })
