// F1-16 (plano mestre 23/10): diagnostico das prioridades da Erica, SO' LEITURA
// e so' para o dono. Para cada NF nao entregue das rotas Itaperuna 2, Tres
// Rios, Duque de Caxias 2 e Zona Norte 2 e das placas RQU2G47, RQV9B26 e
// TOS2B69, atribui a causa provavel: ponto/cadastro, rastreador/sinal, troca de
// placa ou operacao real (src/lib/qualidade/causa-pendencia.ts).
// Fontes: kpi_ao_vivo_calculo (o rotulo e a investigacao do KPI),
// kpi_paradas_snapshot (paradas da frota inteira -> outro carro no cliente) e
// posicoes_historico (leituras atrasadas e buracos de sinal da propria placa).
//
// Uso: PLACAR_SSH=transmonseg-vps npx tsx --tsconfig tsconfig.json \
//        scripts/diagnostico-prioridades-erica.ts 2026-10-13 2026-10-23 --saida <arquivo.md>
import { writeFileSync } from 'fs'
import { haversine } from '../src/lib/utils/geo'
import { classificarCausa, buracoCompativel, descontarApagoes, prioridadeDaErica, ROTAS_ERICA, PLACAS_ERICA, type Buraco, type Causa, type EvidenciaNf, type ResultadoCausa } from '../src/lib/qualidade/causa-pendencia'
import { consultarJson, sqlLiteral } from './qualidade/psql'

type Nf = { nf: string; carga: string; cliente: string; status: string; situacao: string; lat: number | null; lng: number | null; investigacao?: { categoria: string; distM: number | null } | null }
type Placa = { placa: string; destino: string; nfs: Nf[] }
type Parada = { lat: number | null; lng: number | null; chegada: string; duracao_seg: number | null; classificacao: string }
type Sinal = { placa: string; dia: string; cadastrado: boolean; leituras: number; atrasadas: number; buracos: Buraco[] }

const a = process.argv.slice(2)
const datas = a.filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x))
const iSaida = a.indexOf('--saida')
const saida = iSaida >= 0 ? a[iSaida + 1] : null
if (datas.length !== 2 || !saida) { console.error('uso: diagnostico-prioridades-erica.ts <de> <ate> --saida <arquivo.md>'); process.exit(2) }
const [de, ate] = datas.map(sqlLiteral)

const NOME_CAUSA: Record<Causa, string> = { ponto_cadastro: 'Ponto/cadastro', rastreador_sinal: 'Rastreador/sinal', troca_placa: 'Troca de placa', operacao_real: 'Operação real', em_andamento: 'Rota em andamento (23/10)' }
const ORDEM: Causa[] = ['troca_placa', 'rastreador_sinal', 'ponto_cadastro', 'operacao_real', 'em_andamento']

function main() {
  const calc = consultarJson<{ data: string; resultado: { placas: Placa[] } }[]>('kpi_transmonseg',
    `select coalesce(json_agg(json_build_object('data',data,'resultado',resultado) order by data),'[]') from kpi_ao_vivo_calculo where cliente='nutrimax' and data between ${de} and ${ate}`)
  const snaps = consultarJson<{ data: string; placa: string; paradas: Parada[] }[]>('kpi_transmonseg',
    `select coalesce(json_agg(json_build_object('data',data,'placa',placa,'paradas',paradas)),'[]') from kpi_paradas_snapshot where empresa='nutrimax' and data between ${de} and ${ate}`)

  // NFs alvo
  type Alvo = { dia: string; placa: string; destino: string; rota: string | null; placaErica: string | null; n: Nf }
  const alvos: Alvo[] = []
  for (const d of calc) for (const p of d.resultado?.placas ?? []) {
    const pr = prioridadeDaErica(p.destino, p.placa)
    if (!pr) continue
    for (const n of p.nfs) if (n.situacao !== 'entregue') alvos.push({ dia: d.data, placa: p.placa, destino: p.destino, rota: pr.rota, placaErica: pr.placa, n })
  }

  // Paradas da frota por dia (>= 2 min, fora da base)
  const paradasDia = new Map<string, { placa: string; s: Parada }[]>()
  for (const x of snaps) for (const s of x.paradas ?? []) {
    if (s.lat == null || s.lng == null || s.classificacao === 'BASE' || (s.duracao_seg ?? 0) < 120) continue
    paradasDia.set(x.data, [...(paradasDia.get(x.data) ?? []), { placa: x.placa, s }])
  }
  const outraDe = (al: Alvo) => {
    if (al.n.lat == null || al.n.lng == null) return null
    let m: { placa: string; distM: number; hora: string; minutos: number } | null = null
    for (const { placa, s } of paradasDia.get(al.dia) ?? []) {
      if (placa === al.placa) continue
      const d = haversine(al.n.lat, al.n.lng, s.lat!, s.lng!)
      if (d <= 150 && (!m || d < m.distM)) m = { placa, distM: Math.round(d), hora: s.chegada.slice(11, 16), minutos: Math.round((s.duracao_seg ?? 0) / 60) }
    }
    return m
  }
  const outras = alvos.map(outraDe)
  // "Cobre a carga": a mesma outra placa parou em >= 2 NFs e >= metade das pendentes com ponto da carga.
  const porCarga = new Map<string, number[]>()
  alvos.forEach((al, i) => { const k = `${al.dia}|${al.placa}|${al.n.carga}`; porCarga.set(k, [...(porCarga.get(k) ?? []), i]) })
  const cobre = (i: number) => {
    const o = outras[i]; if (!o) return false
    const al = alvos[i]
    const idx = (porCarga.get(`${al.dia}|${al.placa}|${al.n.carga}`) ?? []).filter(j => alvos[j].n.lat != null)
    const iguais = idx.filter(j => outras[j]?.placa === o.placa).length
    return iguais >= 2 && iguais * 2 >= idx.length
  }

  // Sinal da propria placa por dia
  const pares = [...new Set(alvos.map(al => `${al.placa}|${al.dia}`))].map(s => s.split('|'))
  for (const [p] of pares) if (!/^[A-Z0-9]{7}$/.test(p)) throw new Error(`placa inesperada: ${p}`)
  const sinais = pares.length ? consultarJson<Sinal[]>('transmonseg', `
    with alvo(placa, dia) as (values ${pares.map(([p, d]) => `('${p}', ${sqlLiteral(d)}::date)`).join(',')}),
    v as (select a.placa, a.dia, ve.id from alvo a join veiculos ve on replace(ve.placa,'-','') = a.placa),
    h as (select v.placa, v.dia, h.criado_em, h.atraso_min, h.lat, h.lng from v join posicoes_historico h on h.veiculo_id = v.id
          and h.criado_em >= (v.dia::timestamp at time zone 'America/Sao_Paulo') + interval '5 hours'
          and h.criado_em <  (v.dia::timestamp at time zone 'America/Sao_Paulo') + interval '21 hours'),
    tot as (select placa, dia, count(*) as leituras, count(*) filter (where atraso_min > 15) as atrasadas from h group by 1,2),
    f as (select placa, dia, criado_em - make_interval(mins => atraso_min) as t, lat, lng from h where atraso_min <= 15),
    g as (select placa, dia, t, lat, lng, lag(t) over w as t0, lag(lat) over w as la0, lag(lng) over w as lo0 from f window w as (partition by placa, dia order by t)),
    bur as (select placa, dia, json_agg(json_build_object('inicio', to_char(t0 at time zone 'America/Sao_Paulo','HH24:MI'), 'fim', to_char(t at time zone 'America/Sao_Paulo','HH24:MI'),
              'minutos', round(extract(epoch from t - t0) / 60), 'a', json_build_object('lat', la0, 'lng', lo0), 'b', json_build_object('lat', lat, 'lng', lng)) order by t0) as j
            from g where t - t0 >= interval '15 min' group by 1,2)
    select coalesce(json_agg(json_build_object('placa', a.placa, 'dia', a.dia, 'cadastrado', exists(select 1 from v where v.placa = a.placa and v.dia = a.dia),
      'leituras', coalesce(tot.leituras, 0), 'atrasadas', coalesce(tot.atrasadas, 0), 'buracos', coalesce(bur.j, '[]'::json))), '[]')
    from alvo a left join tot using (placa, dia) left join bur using (placa, dia)`) : []
  // Apagao do coletor na frota Nutry: faixas de 10 min (05-21 h) com mais da metade das leituras atrasadas.
  const faixas = consultarJson<{ dia: string; hora: string }[]>('transmonseg', `
    select coalesce(json_agg(json_build_object('dia', to_char(b at time zone 'America/Sao_Paulo','YYYY-MM-DD'), 'hora', to_char(b at time zone 'America/Sao_Paulo','HH24:MI')) order by b), '[]') from (
      select date_bin('10 min', h.criado_em, '2026-01-01'::timestamptz) as b, count(*) as n, count(*) filter (where h.atraso_min > 15) as velhas
        from posicoes_historico h join veiculos v on v.id = h.veiculo_id join clientes c on c.id = v.cliente_id
       where c.cod_user_unitrac = '4096' and h.criado_em >= (${de}::date)::timestamp at time zone 'America/Sao_Paulo'
         and h.criado_em < ((${ate}::date + 1))::timestamp at time zone 'America/Sao_Paulo'
       group by 1) x
     where (b at time zone 'America/Sao_Paulo')::time between '05:00' and '21:00' and velhas * 2 > n`)
  const apagoes = new Map<string, { inicio: string; fim: string }[]>()
  for (const f of faixas) {
    const lista = apagoes.get(f.dia) ?? []
    const [h, m] = f.hora.split(':').map(Number)
    const fim = `${String(Math.floor((h * 60 + m + 10) / 60)).padStart(2, '0')}:${String((m + 10) % 60).padStart(2, '0')}`
    const ult = lista[lista.length - 1]
    if (ult && ult.fim === f.hora) ult.fim = fim
    else lista.push({ inicio: f.hora, fim })
    apagoes.set(f.dia, lista)
  }
  for (const s of sinais) s.buracos = descontarApagoes(s.buracos, apagoes.get(s.dia) ?? [])
  const sinal = new Map(sinais.map(s => [`${s.placa}|${s.dia}`, s]))

  const linhas = alvos.map((al, i) => {
    const s = sinal.get(`${al.placa}|${al.dia}`)
    const o = outras[i]
    const ev: EvidenciaNf = {
      situacao: al.n.situacao, status: al.n.status,
      investigacao: al.n.investigacao ? { categoria: al.n.investigacao.categoria, distM: al.n.investigacao.distM ?? null } : null,
      outraPlaca: o ? { ...o, cobreCarga: cobre(i) } : null,
      buraco: s && al.n.lat != null && al.n.lng != null ? buracoCompativel(s.buracos, al.n.lat, al.n.lng) : null,
      rastreador: s?.cadastrado ? { leituras: s.leituras, atrasadas: s.atrasadas } : null,
    }
    return { ...al, r: classificarCausa(ev) as ResultadoCausa }
  })

  writeFileSync(saida!, relatorio(linhas, datas[0], datas[1], sinais, apagoes))
  const semCausa = linhas.filter(l => !l.r.causa).length
  console.log(`${linhas.length} NFs, ${semCausa} sem causa -> ${saida}`)
  const c: Record<string, number> = {}
  for (const l of linhas) c[`${l.r.causa}/${l.r.forca}`] = (c[`${l.r.causa}/${l.r.forca}`] ?? 0) + 1
  console.log(c)
}

type Linha = { dia: string; placa: string; destino: string; rota: string | null; placaErica: string | null; n: Nf; r: ResultadoCausa }
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const cel = (s: string) => s.replace(/\|/g, '/').replace(/\s+/g, ' ').trim()

function tabelaCausas(ls: Linha[]): string {
  const out = ['| Causa | NFs | forte | fraca |', '|---|---:|---:|---:|']
  for (const c of ORDEM) {
    const x = ls.filter(l => l.r.causa === c); if (!x.length) continue
    out.push(`| ${NOME_CAUSA[c]} | ${x.length} | ${x.filter(l => l.r.forca === 'forte').length} | ${x.filter(l => l.r.forca === 'fraca').length} |`)
  }
  out.push(`| **Total** | **${ls.length}** | | |`)
  return out.join('\n')
}

function tabelaNfs(ls: Linha[]): string {
  const out = ['| Dia | Placa | Rota | NF | Cliente | Rótulo do KPI | Causa | Força | Evidência |', '|---|---|---|---|---|---|---|---|---|']
  for (const l of [...ls].sort((a, b) => a.dia.localeCompare(b.dia) || a.placa.localeCompare(b.placa) || a.n.nf.localeCompare(b.n.nf)))
    out.push(`| ${br(l.dia)} | ${l.placa} | ${cel(l.destino)} | ${l.n.nf} | ${cel(l.n.cliente).slice(0, 28)} | ${cel(l.n.status).slice(0, 45)} | ${NOME_CAUSA[l.r.causa]} | ${l.r.forca} | ${cel(l.r.motivo)} |`)
  return out.join('\n')
}

function relatorio(ls: Linha[], de: string, ate: string, sinais: Sinal[], apagoes: Map<string, { inicio: string; fim: string }[]>): string {
  const fechadas = ls.filter(l => l.r.causa !== 'em_andamento')
  const s: string[] = []
  s.push(`# Diagnóstico das prioridades da Érica (${br(de)} a ${br(ate)})`, '')
  s.push(`F1-16 do plano mestre de 23/10. Só leitura, só para o dono: nada aqui foi gravado no banco nem enviado a ninguém. Gerado em ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC por \`scripts/diagnostico-prioridades-erica.ts\` (KPI).`, '')
  s.push('## Como ler', '')
  s.push(`- **Universo:** toda NF não entregue no cálculo do Ao vivo da Nutry (\`kpi_ao_vivo_calculo\`) nas rotas ${ROTAS_ERICA.join(', ')} e nas placas ${PLACAS_ERICA.join(', ')} (em qualquer rota). 23/10 é o cálculo das ~18:30 BRT, com a rota ainda rodando.`)
  s.push('- **Causas:** *troca de placa* (outro carro da frota parou a ≤150 m do cliente por ≥2 min, ou o KPI marcou carga sem placa/escala divergente); *rastreador/sinal* (sem rastreador, >30% das leituras de 05–21 h com atraso >15 min, buraco de sinal em que o cliente cabe — regra do KN-05 — ou "passou sem registrar parada"); *ponto/cadastro* (o carro esteve a ≤150 m e o KPI não contou, endereço sem coordenada, cadastro divergente, coordenada imprecisa, parada a 500 m–2 km); *operação real* (GPS bom, nenhum carro da frota no cliente).')
  s.push('- **Força:** *forte* = há evidência de GPS que sustenta a causa; *fraca* = só o rótulo do KPI ou evidência indireta. Fraca não é afirmação: é por onde começar a conferir.')
  const ap = [...apagoes].map(([d, l]) => l.map(x => `${br(d)} ${x.inicio}–${x.fim}`).join(', ')).filter(Boolean).join('; ')
  s.push(`- **Apagão do coletor** (mais da metade das leituras da frota Nutry atrasadas): ${ap || 'nenhum'}. Buraco de sinal dentro dele não conta como falha do rastreador da placa (a cadeia de paradas da Unitrac seguiu contínua, KN-05).`)
  s.push('- **A taxa não muda com este diagnóstico.** Ele só diz onde está o problema de cada NF.', '')
  s.push('## Resumo', '')
  s.push(`${fechadas.length} NFs pendentes em dias fechados, **${fechadas.filter(l => l.r.causa).length} com causa atribuída (100%)**. Mais ${ls.length - fechadas.length} de 23/10 ainda em andamento.`, '')
  s.push(tabelaCausas(ls), '')
  s.push('### Por rota', '')
  s.push('| Rota | NFs | Troca de placa | Rastreador/sinal | Ponto/cadastro | Operação real | Em andamento |', '|---|---:|---:|---:|---:|---:|---:|')
  for (const r of ROTAS_ERICA) {
    const x = ls.filter(l => l.rota === r)
    s.push(`| ${r} | ${x.length} | ${ORDEM.map(c => x.filter(l => l.r.causa === c).length).join(' | ')} |`)
  }
  s.push('', '### Por placa (em qualquer rota)', '')
  s.push('| Placa | NFs | Troca de placa | Rastreador/sinal | Ponto/cadastro | Operação real | Em andamento | Leituras atrasadas por dia (05–21 h) |', '|---|---:|---:|---:|---:|---:|---:|---|')
  for (const p of PLACAS_ERICA) {
    const x = ls.filter(l => l.placaErica === p)
    const sin = sinais.filter(z => z.placa === p).sort((a, b) => a.dia.localeCompare(b.dia)).map(z => `${br(z.dia)} ${z.leituras ? Math.round((100 * z.atrasadas) / z.leituras) + '%' : 'sem leitura'}`).join(', ')
    s.push(`| ${p} | ${x.length} | ${ORDEM.map(c => x.filter(l => l.r.causa === c).length).join(' | ')} | ${sin || '—'} |`)
  }
  s.push('')
  for (const r of ROTAS_ERICA) {
    const x = ls.filter(l => l.rota === r)
    s.push(`## Rota ${r}`, '', x.length ? tabelaCausas(x) : 'Nenhuma NF pendente no período.', '')
    if (x.length) s.push(tabelaNfs(x), '')
  }
  for (const p of PLACAS_ERICA) {
    const x = ls.filter(l => l.placaErica === p && !l.rota)
    s.push(`## Placa ${p} fora das rotas acima`, '', x.length ? tabelaCausas(x) : 'Nenhuma NF pendente fora das rotas acima.', '')
    if (x.length) s.push(tabelaNfs(x), '')
  }
  return s.join('\n')
}

main()
