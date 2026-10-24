// F1-01 (plano mestre 23/10): placar de qualidade diario, SO' LEITURA.
// Mede o dia anterior (Brasilia) nos dois bancos e no log do Postgres e grava
// /srv/kpi-transmonseg/qualidade/AAAA-MM-DD.json com linhas
// (dia, cliente, metrica, valor, detalhe); com --gravar tambem faz upsert em
// qualidade_diaria (unica escrita; OK do dono 23/10). Nunca vai ao cliente;
// nao manda mensagem.
// Cada fonte e' independente: se uma falhar, vira "erros" no JSON e o resto sai.
//
// Uso (no servidor, como root):
//   npx tsx --tsconfig tsconfig.json scripts/placar-qualidade.ts [AAAA-MM-DD] [--saida DIR] [--stdout] [--gravar]
// Pelo Mac (lendo o servidor por ssh):
//   PLACAR_SSH=transmonseg-vps npx tsx scripts/placar-qualidade.ts 2026-10-22 --saida /tmp/q
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { metricasDoAoVivo, metricasAgregadas, contarTimeoutsDoDia, diaDoPlacar, montarPlacar, type LinhaCalculo, type LinhaPlacar } from '../src/lib/qualidade/placar'
import { EMPRESA_NUTRIMAX, EMPRESA_RIOQUALITY } from '../src/lib/kpi-romaneio/constants'
import { consultarJson, gravarNoBanco, rodarNoServidor, sqlGravarPlacar, sqlLiteral } from './qualidade/psql'

const CLIENTES = ['nutrimax', 'rioquality'] as const
const LOGS_PG = ['/var/log/postgresql/postgresql-17-main.log', '/var/log/postgresql/postgresql-17-main.log.1']

type Agregada = { cliente: string | null; metrica: string; valor: number; detalhe?: Record<string, unknown> | null }

function args() {
  const a = process.argv.slice(2)
  let dia: string | null = null, saida = '/srv/kpi-transmonseg/qualidade', stdout = false, gravar = false
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--saida') saida = a[++i]
    else if (a[i] === '--stdout') stdout = true
    else if (a[i] === '--gravar') gravar = true
    else if (/^\d{4}-\d{2}-\d{2}$/.test(a[i])) dia = a[i]
    else { console.error(`argumento desconhecido: ${a[i]}`); process.exit(2) }
  }
  return { dia: dia ?? diaDoPlacar(Date.now()), saida, stdout, gravar }
}

/** Janela do dia de Brasilia em timestamptz. */
const janela = (d: string) => `(${d}::date)::timestamp AT TIME ZONE 'America/Sao_Paulo'`

function sqlCalculo(d: string) {
  return `select coalesce(json_agg(json_build_object('cliente',cliente,'data',data,'calculado_em',calculado_em,'ultimo_erro',ultimo_erro,'ultimo_erro_em',ultimo_erro_em,'resultado',resultado)),'[]')
    from kpi_ao_vivo_calculo where data = ${d} and cliente in ('nutrimax','rioquality')`
}

function sqlKpiOutros(d: string) {
  return `select coalesce(json_agg(x),'[]') from (
    select c.cliente, 'versoes_kpi_do_dia' as metrica, (select count(*) from kpi_romaneio_geracoes g where g.cliente = c.cliente and g.data_referencia = ${d}) as valor
      from (values ('nutrimax'),('rioquality')) c(cliente)
    union all
    -- F3-03: a chave da empresa em kpi_nf_resolucao e' o nome (EMPRESA_NUTRIMAX /
    -- EMPRESA_RIOQUALITY), nao o id do cliente -- antes contava sempre 0.
    select c.cliente, 'resolucoes_operacao', (select count(*) from kpi_nf_resolucao r where r.empresa = c.empresa and r.data = ${d})
      from (values ('nutrimax', '${EMPRESA_NUTRIMAX}'),('rioquality', '${EMPRESA_RIOQUALITY}')) c(cliente, empresa)
  ) x`
}

function sqlMonitoramento(d: string) {
  const t0 = janela(d), t1 = `(${janela(d)} + interval '1 day')`
  return `with cl as (select id, nome, ativo from clientes)
  select coalesce(json_agg(x),'[]') from (
    -- Central Romaneio: cards visiveis por tipo (MON-04: romaneio_ausente 127 em 22/10)
    select cl.nome as cliente, 'alertas_romaneio_' || a.tipo as metrica, count(*) as valor, null::json as detalhe
      from alertas_romaneio a join cl on cl.id = a.cliente_id
     where a.sombra = false and a.desde >= ${t0} and a.desde < ${t1}
     group by cl.nome, a.tipo
    union all
    -- Rotulo humano na Central Romaneio (F5-01: 0 desde 05/10)
    select cl.nome, 'rotulo_humano_romaneio', count(*) filter (where a.origem_acao is not null or a.operador_id is not null),
           json_build_object('falso_positivo', count(*) filter (where a.motivo_falso_positivo is not null))
      from cl left join alertas_romaneio a on a.cliente_id = cl.id and a.resolvido_em >= ${t0} and a.resolvido_em < ${t1}
     where cl.ativo
     group by cl.nome
    union all
    -- Acao humana na Central (alertas): limpar/resolver, em massa ou individual
    select cl.nome, 'acao_humana_central', count(a.id),
           json_build_object('individual', count(*) filter (where a.origem_acao = 'resolver_individual'), 'falso_positivo', count(*) filter (where a.motivo_falso_positivo is not null))
      from cl left join alertas a on a.cliente_id = cl.id and a.origem_acao is not null and a.resolvido_em >= ${t0} and a.resolvido_em < ${t1}
     where cl.ativo
     group by cl.nome
    union all
    -- Alertas novos de cliente desativado (F1-15/D-27: Benassi 28.400 em 24 h)
    select null, 'alertas_cliente_desativado', coalesce(sum(s.n), 0), json_build_object('por_cliente', coalesce(json_object_agg(s.nome, s.n), '{}'::json))
      from (select cl.nome, count(*) as n from alertas a join cl on cl.id = a.cliente_id
             where not cl.ativo and a.desde >= ${t0} and a.desde < ${t1} group by cl.nome) s
    union all
    -- Romaneio carregado no monitoramento (motor de desvio cego quando 0)
    select cl.nome, 'romaneio_pontos', count(r.id), null
      from cl left join veiculos v on v.cliente_id = cl.id
              left join romaneio_pontos r on r.veiculo_id = v.id and r.romaneio_data = ${d} and r.modo_teste = false and r.origem = 'romaneio'
     where cl.ativo
     group by cl.nome
    union all
    select null, 'romaneio_sem_veiculo', count(*), json_build_object('placas', coalesce(json_agg(distinct placa), '[]'::json))
      from romaneio_pontos where romaneio_data = ${d} and modo_teste = false and origem = 'romaneio' and veiculo_id is null
  ) x`
}

async function main() {
  const { dia, saida, stdout, gravar } = args()
  const d = sqlLiteral(dia)
  const grupos: LinhaPlacar[][] = []
  const erros: { fonte: string; erro: string }[] = []
  const fonte = (nome: string, f: () => LinhaPlacar[]) => {
    try { grupos.push(f()) } catch (e) { erros.push({ fonte: nome, erro: String((e as Error).message ?? e).slice(0, 500) }) }
  }

  fonte('kpi_ao_vivo_calculo', () => {
    const rows = consultarJson<LinhaCalculo[]>('kpi_transmonseg', sqlCalculo(d))
    return CLIENTES.flatMap(c => metricasDoAoVivo(dia, rows.find(r => r.cliente === c) ?? { cliente: c, data: dia, calculado_em: null, ultimo_erro: null, resultado: null }))
  })
  fonte('kpi_tabelas', () => metricasAgregadas(dia, consultarJson<Agregada[]>('kpi_transmonseg', sqlKpiOutros(d))))
  fonte('monitoramento', () => metricasAgregadas(dia, consultarJson<Agregada[]>('transmonseg', sqlMonitoramento(d))))
  fonte('log_postgres', () => {
    const linhas = rodarNoServidor('grep', ['-h', 'canceling statement due to statement timeout', ...LOGS_PG]).split('\n')
    return [{ dia, cliente: 'geral', metrica: 'statement_timeouts', valor: contarTimeoutsDoDia(linhas, dia), detalhe: null }]
  })
  fonte('ollama', () => {
    const estado = rodarNoServidor('systemctl', ['is-active', 'ollama']).trim()
    return [{ dia, cliente: 'geral', metrica: 'ollama_ativo', valor: estado === 'active' ? 1 : 0, detalhe: { estado, medido_em: new Date().toISOString() } }]
  })

  const placar = montarPlacar(dia, new Date().toISOString(), grupos, erros)
  const json = JSON.stringify(placar, null, 1)
  if (stdout) console.log(json)
  else {
    mkdirSync(saida, { recursive: true })
    const arq = path.join(saida, `${dia}.json`)
    writeFileSync(arq, json)
    console.log(`placar ${dia}: ${placar.linhas.length} linhas, ${erros.length} erro(s) -> ${arq}`)
  }
  if (gravar) {
    const sql = sqlGravarPlacar(placar.linhas)
    try {
      if (sql) gravarNoBanco('kpi_transmonseg', sql)
      console.log(`qualidade_diaria: ${placar.linhas.length} linhas gravadas`)
    } catch (e) { erros.push({ fonte: 'gravar_qualidade_diaria', erro: String((e as Error).message ?? e).slice(0, 500) }) }
  }
  for (const c of CLIENTES) {
    const v = (m: string) => placar.linhas.find(l => l.cliente === c && l.metrica === m)?.valor
    console.error(`  ${c}: taxa ${v('taxa') ?? '-'} | na conta ${v('nfs_na_conta') ?? '-'} | revisar ${v('revisar') ?? '-'} | nao foi ${v('nao_foi') ?? '-'} | sem placa fora ${v('carga_sem_placa_fora') ?? '-'} | escala div. fora ${v('escala_divergente_fora') ?? '-'} | sem CD ${v('placas_sem_chegada_cd') ?? '-'}`)
  }
  for (const e of erros) console.error(`  ERRO ${e.fonte}: ${e.erro}`)
  process.exit(erros.length ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
