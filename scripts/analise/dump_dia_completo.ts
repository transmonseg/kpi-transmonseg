/**
 * Dump COMPLETO de um dia, placa por placa, juntando:
 *  - escala (lojas+rede que a placa devia fazer)
 *  - paradas Unitrac (LOJA com codigo/horario)
 *  - KPI gerado pelo sistema (-FF) por loja
 *  - KPI manual da Tia (aba do dia) por loja
 * Output: docs/conversas-tia-erica/dumps/dump-dia-<dia>.txt
 * Uso: npx tsx scripts/analise/dump_dia_completo.ts <dia>
 */
import { config } from 'dotenv'; config({ path: '.env.local' })
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import ExcelJS from 'exceljs'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseEscalaGuanabaraPdf } from '@/lib/parsers/escala-guanabara-pdf'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const MANUAL_DIR = 'C:/Users/media/Downloads/KPI SMANUAIS'
const FF_DIR = 'docs/conversas-tia-erica/kpi-beta'
const OUT_DIR = 'docs/conversas-tia-erica/dumps'

const ARQ: Record<string, any> = {
  '18': { dir: 'ESCALA DIA 18', geral: 'ESCALA GERAL DE MAIO 1 (6).xlsx', zs: 'ESCALA ZONA SUL - MAIO (6).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (5).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx', guanabara: 'ESCALA 18.04 (1).pdf', unitrac: 'relatorio_9401.pdf' },
  '19': { dir: 'ESCALA DIA 19', geral: 'ESCALA GERAL DE MAIO 1 (6).xlsx', zs: 'ESCALA ZONA SUL - MAIO (6).xlsx', pax: 'ESCALA - PAX , FEIRA NOVA , EMANUEL.xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx', guanabara: 'ESCALA 19.05.pdf', unitrac: 'relatorio_9572.pdf' },
  '20': { dir: 'ESCALA DIA 20', geral: 'ESCALA GERAL DE MAIO 1 (7).xlsx', zs: 'ESCALA ZONA SUL - MAIO (7).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (6).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO.xlsx', guanabara: 'ESCALA 21.pdf', unitrac: 'relatorio_9522.pdf' },
  '21': { dir: 'ESCALA DIA 21', geral: 'ESCALA GERAL DE MAIO 1 (7).xlsx', zs: 'ESCALA ZONA SUL - MAIO (7).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (6).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx', unitrac: 'relatorio_9553.pdf' },
  '22': { dir: 'ESCALA DIA 22', geral: 'ESCALA GERAL DE MAIO 0.xlsx', zs: 'ESCALA ZONA SUL - MAIO (8).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (7).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx', unitrac: 'relatorio_9589 (1).pdf' },
  '25': { dir: 'ESCALA DIA 25', geral: 'ESCALA GERAL DE MAIO 0 (2).xlsx', zs: 'ESCALA ZONA SUL - MAIO (9).xlsx', pax: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (7).xlsx', armazem: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx', guanabara: 'ESCALA 25.05.pdf', unitrac: 'relatorio_9652.pdf' },
}
const REDE_MANUAL: Record<string,string> = {
  ARMAZEM_GRAO:'KPI ARMAZEM DO GRAO (2).xlsx', ASSAI:'KPI ASSAI (4).xlsx', ATACADAO:'KPI ATACADAO (4).xlsx',
  CARREFOUR:'KPI CARREFOUR (4).xlsx', GUANABARA:'KPI GUANABARA (4).xlsx', PREZUNIC:'KPI PREZUNIC (6).xlsx',
  PRINCESA:'KPI PRINCESA (11).xlsx', SUPER_PAX:'KPI SUPERPAX.xlsx', SUPERPRIX:'KPI SUPERPRIX (4).xlsx', ZONA_SUL:'KPI ZONA SUL.xlsx',
}
function hhmm(d:Date){return String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')}
function ct(v:any):string{if(v==null)return'';if(v instanceof Date)return hhmm(v);if(typeof v==='object'){if(v.text)return v.text;if(v.result!=null)return ct(v.result);if(v.richText)return v.richText.map((r:any)=>r.text).join('');return''}return String(v).trim()}

;(async()=>{
  const dia = process.argv[2]
  const cfg = ARQ[dia]; if(!cfg){console.error('dia invalido');process.exit(1)}
  const data = `2026-05-${dia}`
  const dir = `${BASE}/${cfg.dir}`

  // escala from files
  const escala:any[]=[]
  const add=async(rede:string,arq:string|undefined,parser:any)=>{ if(!arq||!existsSync(`${dir}/${arq}`))return; try{const ls=await parser(readFileSync(`${dir}/${arq}`),data);escala.push(...ls)}catch{} }
  await add('GERAL',cfg.geral,parseEscalaGeral); await add('ZS',cfg.zs,parseEscalaZonaSul); await add('PAX',cfg.pax,parseEscalaPax)
  await add('ARM',cfg.armazem,parseEscalaArmazemGrao); await add('GB',cfg.guanabara,parseEscalaGuanabaraPdf)

  // unitrac
  const veic = await parseUnitracPdf(readFileSync(`${dir}/${cfg.unitrac}`), null)
  const parByPlaca=new Map<string,any[]>()
  for(const v of veic) parByPlaca.set(v.placa_norm, v.paradas)

  // escala by placa
  const escByPlaca=new Map<string,any[]>()
  for(const e of escala){ if(!e.placa_norm)continue; const a=escByPlaca.get(e.placa_norm)??[]; a.push(e); escByPlaca.set(e.placa_norm,a) }

  // manual by rede → loja → entregas (1o e 2o carro)
  const manualByRedeLoja=new Map<string,Map<string,string[]>>()
  for(const [rede,fm] of Object.entries(REDE_MANUAL)){
    try{
      const wb=new ExcelJS.Workbook(); await wb.xlsx.readFile(`${MANUAL_DIR}/${fm}`)
      const ws=wb.getWorksheet(dia); if(!ws)continue
      let hr=3; for(let r=1;r<=10;r++)if(/REDES|FILIAIS/i.test(ct(ws.getRow(r).getCell(1).value))){hr=r;break}
      const m=new Map<string,string[]>()
      for(let r=hr+1;r<=ws.rowCount;r++){
        const loja=ct(ws.getRow(r).getCell(1).value); if(!loja||loja.length<2)continue
        const c1=`${ct(ws.getRow(r).getCell(4).value)} ${ct(ws.getRow(r).getCell(6).value)}/${ct(ws.getRow(r).getCell(7).value)}`
        m.set(loja, (m.get(loja)??[]).concat(c1))
      }
      manualByRedeLoja.set(rede,m)
    }catch{}
  }

  // dump
  const out:string[]=[`# DUMP COMPLETO DIA ${dia} — placa por placa\n`]
  const placas=[...new Set([...escByPlaca.keys()])].sort()
  for(const placa of placas){
    const escs=escByPlaca.get(placa)??[]
    const pars=(parByPlaca.get(placa)??[]).filter((p:any)=>p.classificacao==='LOJA'&&p.codigo_loja)
    out.push(`\n■ PLACA ${placa}`)
    out.push(`  ESCALA: ${escs.map(e=>`[${e.rede_id}]${e.loja_nome_raw}(cod ${e.loja_codigo_raw??'-'})`).join(' | ')}`)
    if(pars.length) out.push(`  UNITRAC LOJA: ${pars.map((p:any)=>`${hhmm(p.chegada)}-${p.saida?hhmm(p.saida):'?'} cod=${p.codigo_loja} ${(p.nome_loja||'').slice(0,22)}`).join(' | ')}`)
    else out.push(`  UNITRAC LOJA: (nenhuma parada LOJA)`)
  }
  if(!existsSync(OUT_DIR))mkdirSync(OUT_DIR,{recursive:true})
  writeFileSync(`${OUT_DIR}/dump-dia-${dia}.txt`, out.join('\n'))
  console.log(`OK dump-dia-${dia}.txt — ${placas.length} placas`)
})().catch(e=>{console.error(e);process.exit(1)})
