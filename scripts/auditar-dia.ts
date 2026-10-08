// Uso (no servidor, em /srv/kpi-transmonseg):
//   npx tsx --env-file=.env.production --tsconfig tsconfig.json scripts/auditar-dia.ts 2026-10-08
// So' le. Gera o KPI do dia com o codigo de producao e compara cada NF com o
// GPS do monitoramento (posicoes_historico), fonte independente da Unitrac.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { gerarKpiNutrimax } from '../src/lib/kpi-romaneio/gerar-nutrimax'
import { entradaDoDia } from '../src/lib/kpi-romaneio/ao-vivo-servico'
import { classificarNf, type Veredito } from '../src/lib/kpi-romaneio/auditoria-nf'

const data = process.argv[2]
if (!/^\d{4}-\d{2}-\d{2}$/.test(data ?? '')) throw new Error('uso: auditar-dia.ts AAAA-MM-DD')
const min = (iso: string | null) => (iso ? Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)) : null)

async function main() {
  const entrada = await entradaDoDia('nutrimax', data)
  if (!entrada) throw new Error('sem entrada do dia')
  const coords = new Map<string, { lat: number; lng: number }>()
  const res = await gerarKpiNutrimax(entrada, { aoMontarDetalhe: ({ romaneioGeo }: { romaneioGeo: { nf: string; lat: number | null; lng: number | null }[] }) => {
    for (const l of romaneioGeo) if (l.lat != null && l.lng != null) coords.set(l.nf, { lat: l.lat, lng: l.lng })
  } })
  const alvos = res.detalhe.filter(d => coords.has(d.nf))
  const psql = (db: string, sql: string) => execFileSync('sudo', ['-u', 'postgres', 'psql', '-d', db, '-At', '-F', '|', '-f', '-'], { input: sql, maxBuffer: 128 * 1024 * 1024 }).toString().trim().split('\n').filter(Boolean)
  // Cadastro da Unitrac por NF (o KPI muitas vezes confirma ali, onde o geocode do romaneio e' impreciso).
  const cad = new Map<string, { lat: number; lng: number }>()
  for (const l of psql('kpi_transmonseg', `select a->>'documento', a->>'pontoLat', a->>'pontoLng' from (select alvos from kpi_alvos_snapshot where cliente='nutrimax' and data_referencia='${data}' order by capturado_em desc limit 1) s, jsonb_array_elements(s.alvos) a where a->>'pontoLat' is not null and a->>'pontoLat' <> '0'`)) {
    const [nf, la, ln] = l.split('|'); cad.set(nf, { lat: Number(la), lng: Number(ln) })
  }
  // Pontos a medir: geocode e cadastro de cada NF. Devolve, por ponto, minutos de posicao parada
  // (<=3 km/h, GPS fresco, <=150 m), menor distancia e os minutos-do-dia dessas posicoes.
  const pontos: string[] = []
  for (const d of alvos) {
    const g = coords.get(d.nf)!, placa = `${d.placa.slice(0, 3)}-${d.placa.slice(3)}`
    pontos.push(`('${d.nf}','g','${placa}',${g.lat},${g.lng})`)
    const c = cad.get(d.nf); if (c) pontos.push(`('${d.nf}','c','${placa}',${c.lat},${c.lng})`)
  }
  const dist = `6371000*acos(least(1,cos(radians(v.lat))*cos(radians(h.lat))*cos(radians(h.lng)-radians(v.lng))+sin(radians(v.lat))*sin(radians(h.lat))))`
  const linhasGps = psql('transmonseg', `select v.nf, v.k, count(*) filter (where h.velocidade<=3 and coalesce(h.atraso_min,0)<=2 and ${dist}<=150), min(${dist}) filter (where coalesce(h.atraso_min,0)<=2),
    coalesce(string_agg(distinct (extract(hour from h.criado_em at time zone 'America/Sao_Paulo')*60+extract(minute from h.criado_em at time zone 'America/Sao_Paulo'))::int::text, ',') filter (where h.velocidade<=3 and coalesce(h.atraso_min,0)<=2 and ${dist}<=150),'')
    from (values ${pontos.join(',')}) v(nf,k,placa,lat,lng) join veiculos ve on upper(replace(ve.placa,'-',''))=upper(replace(v.placa,'-',''))
    left join posicoes_historico h on h.veiculo_id=ve.id and h.criado_em >= ('${data}'::date)::timestamp at time zone 'America/Sao_Paulo' and h.criado_em < ('${data}'::date+1)::timestamp at time zone 'America/Sao_Paulo' and abs(h.lat-v.lat)<0.0014 and abs(h.lng-v.lng)<0.0014
    group by v.nf, v.k`)
  const gps = new Map<string, { parado: number; minM: number | null; inis: number[] }>()
  for (const l of linhasGps) {
    const [nf, , p, m, mins] = l.split('|')
    const ms = mins ? mins.split(',').map(Number).sort((a, b) => a - b) : []
    // inicio de cada parada = minuto que abre uma sequencia (salto > 10 min = outra parada)
    const inis = ms.filter((x, i) => i === 0 || x - ms[i - 1] > 10)
    const atual = gps.get(nf) ?? { parado: 0, minM: null, inis: [] }
    gps.set(nf, { parado: Math.max(atual.parado, Number(p)), minM: m === '' ? atual.minM : atual.minM == null ? Number(m) : Math.min(atual.minM, Number(m)), inis: [...atual.inis, ...inis] })
  }
  const linhas: string[] = ['nf;placa;cliente;status;veredito;kpi_chegada;gps_inis;gps_parado_min;gps_min_m;evidencia;observacao']
  const contagem = new Map<Veredito, number>()
  for (const d of alvos) {
    const g = gps.get(d.nf) ?? { parado: 0, minM: null, inis: [] }
    const v = classificarNf({
      status: d.status === 'pendente' ? 'pendente' : 'entregue', emRota: (d.observacao ?? '').startsWith('AGUARDANDO'),
      gpsMinM: g.minM, gpsParadoMin: g.parado, kpiChegadaMin: min(d.chegada), gpsParadoInisMin: g.inis,
    })
    contagem.set(v, (contagem.get(v) ?? 0) + 1)
    linhas.push([d.nf, d.placa, d.clienteNome.replace(/;/g, ','), d.status, v, d.chegada?.slice(11, 16) ?? '', g.inis.map(i => `${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`).join('/'), g.parado, g.minM == null ? '' : Math.round(g.minM), d.evidencia, (d.observacao ?? '').replace(/;/g, ',')].join(';'))
  }
  writeFileSync(`/tmp/auditoria-${data}.csv`, '﻿' + linhas.join('\n'))
  console.log(`NFs com coordenada: ${alvos.length} de ${res.detalhe.length}`)
  for (const [v, n] of [...contagem].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(5), v)
}
main().catch(e => { console.error(e); process.exit(1) })
