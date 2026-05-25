// Gera análise match placa-por-placa pra 1 dia
// Uso: node scripts/correcao/gerar_analise_dia.js <dia>
//   dia: 18, 19, 20, 21, 22
const fs = require('fs')
const dia = process.argv[2]
if (!dia) { console.error('uso: node gerar_analise_dia.js <dia>'); process.exit(1) }

const escalaPath = `docs/correcao-sistema/escalas-extraidas/dia-${dia}.md`
const unitracTmpPath = `docs/correcao-sistema/unitrac-parsed/dia${dia}.txt`

const escala = fs.readFileSync(escalaPath, 'utf8')
const placasEscala = {}
let placaAtual = null, redeAtual = null, motAtual = null
for (const linha of escala.split('\n')) {
  const m = linha.match(/^### (\S+) \[(\w+)\] motorista: (.+)$/)
  if (m) { placaAtual = m[1]; redeAtual = m[2]; motAtual = m[3]; continue }
  if (placaAtual && linha.startsWith('- ordem=')) {
    const lm = linha.match(/loja="([^"]+)".*cod=(\S+)/)
    if (!lm) continue
    placasEscala[placaAtual] = placasEscala[placaAtual] || []
    placasEscala[placaAtual].push({ rede: redeAtual, mot: motAtual, loja: lm[1], cod: lm[2] })
  }
}

const unitrac = {}
for (const linha of fs.readFileSync(unitracTmpPath, 'utf8').split('\n')) {
  if (!linha.trim()) continue
  const [placa, cod, nome] = linha.split('|')
  const k = placa.replace(/-/g, '')
  unitrac[k] = unitrac[k] || []
  unitrac[k].push({ cod, nome })
}

const inativos = new Set(['ALS4H33','AMI1562','AMR9986','AMW4D50','DDI6J90','DJB6D42','EOF4331','EOF4951','EVU7F71','EZU9325','EZU9D26','EZU9D27','EZU9J51','FTV6F42','GAR0802','GBC6E12','GBG5C11','GEB9H31','KPT5B20','LQD9H59','LRA9C40','LRA9C41','PVA1H61','QSO8D04','SFG2F72','SFG2F73','UBF5G32','UBF5G33','UBF5G36','UBG7F79','UFL5C85'])

const rotasGigantes = new Set(['2018001','2018002','2018005','2018006','2018007','2018008','2018009','2018013','2018014','2018016','2018018','2018019','2018022','2018023','2018035','2018038','2018040','5353012','5353014','5353016','5353017','7012010','9039124','11139000','13156084','15755000','17659000','17659001','17659002','17659003','17659004','20577000','21468000','21469000','23080000','25140000','25414000','28023000'])

const todasPlacas = new Set([...Object.keys(placasEscala), ...Object.keys(unitrac)])
const stats = { OK_FULL: 0, OK_PARCIAL: 0, FALHA_MATCH: 0, PLACA_AUSENTE: 0, INATIVA: 0, FORA_ESCALA: 0 }

const corpo = []
const placasOrdenadas = [...todasPlacas].sort()

for (const placa of placasOrdenadas) {
  const esc = placasEscala[placa] || []
  const uni = unitrac[placa] || []

  corpo.push('---')
  corpo.push(`## ${placa}`)
  corpo.push('')

  if (esc.length === 0) {
    corpo.push(`**Não está na escala. Está no Unitrac com ${uni.length} loja(s).**`)
    corpo.push('')
    for (const u of uni) corpo.push(`- Unitrac: \`${u.cod} ${u.nome}\`${rotasGigantes.has(u.cod) ? ' ⚠ ROTA GIGANTE' : ''}`)
    corpo.push('')
    corpo.push('**Diagnóstico:** ⊗ FORA_ESCALA — veículo rodou mas não estava escalado')
    stats.FORA_ESCALA++
    corpo.push('')
    continue
  }

  corpo.push(`**Escala (${esc.length} linha(s)):**`)
  for (const e of esc) corpo.push(`- [${e.rede}] ${e.mot} | loja="${e.loja}" cod=${e.cod}`)
  corpo.push('')

  if (inativos.has(placa)) {
    corpo.push('**Diagnóstico:** ⊘ PLACA_INATIVA — em lista negra (CD-only crônico)')
    stats.INATIVA++
    corpo.push('')
    continue
  }

  if (uni.length === 0) {
    corpo.push('**Unitrac:** SEM PARADAS LOJA')
    corpo.push('')
    corpo.push('**Diagnóstico:** ⊙ PLACA_AUSENTE_OU_SO_BASE')
    stats.PLACA_AUSENTE++
    corpo.push('')
    continue
  }

  corpo.push(`**Unitrac (${uni.length} loja(s)):**`)
  for (const u of uni) corpo.push(`- \`${u.cod} ${u.nome}\`${rotasGigantes.has(u.cod) ? ' ⚠ rota gigante' : ''}`)
  corpo.push('')

  const norm = (s) => (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const stopwords = new Set(['LOJA','REDE','ASSAI','PRINCESA','PREZUNIC','CARREFOUR','SUPERPRIX','SUPER','PRIX','PAX','SENDAS','GUANABARA','MUNDIAL','VIANENSE','EMANUEL','ZONA','SUL','ENTREGA','ARMAZEM','GRAO','MERCADO','FEIRA','NOVA','ATACADAO','SAMS','CLUB','SAM','ROTA'])
  function tokens(s) {
    return new Set(norm(s).split(/[^A-Z0-9]+/).filter(t => t.length >= 2 && !stopwords.has(t)))
  }

  const matches = []
  for (const e of esc) {
    const eTokens = tokens(e.loja)
    const eCod = e.cod === '—' ? null : e.cod
    let achou = null
    let motivoMatch = ''
    if (eCod) {
      for (const u of uni) {
        if (rotasGigantes.has(u.cod)) continue
        if (u.cod === eCod) { achou = u; motivoMatch = `cod exato ${eCod}`; break }
        if (u.cod.endsWith(eCod)) { achou = u; motivoMatch = `suffix cod ${eCod}→${u.cod}`; break }
        if (eCod.length >= 2 && /^\d+$/.test(eCod) && u.cod.endsWith(eCod.padStart(3, '0'))) { achou = u; motivoMatch = `padStart cod ${eCod}→${u.cod}`; break }
      }
    }
    if (!achou) {
      let melhor = null, melhorScore = 0
      for (const u of uni) {
        if (rotasGigantes.has(u.cod)) continue
        const uTokens = tokens(u.nome)
        let comum = 0
        for (const t of eTokens) if (uTokens.has(t)) comum++
        if (comum > melhorScore) { melhorScore = comum; melhor = u }
      }
      if (melhor && melhorScore >= 1) { achou = melhor; motivoMatch = `nome ${melhorScore} tokens` }
    }
    matches.push({ escala: e, match: achou, motivo: motivoMatch })
  }

  const okCount = matches.filter(m => m.match).length
  corpo.push('**Match resultado:**')
  for (const m of matches) {
    if (m.match) corpo.push(`- ✓ "${m.escala.loja}" → \`${m.match.cod} ${m.match.nome}\` (${m.motivo})`)
    else corpo.push(`- ✗ "${m.escala.loja}" → SEM MATCH`)
  }
  corpo.push('')

  let diag
  if (okCount === esc.length) { diag = '✓ OK_FULL'; stats.OK_FULL++ }
  else if (okCount === 0) { diag = '✗ FALHA_MATCH'; stats.FALHA_MATCH++ }
  else { diag = '⚠ OK_PARCIAL'; stats.OK_PARCIAL++ }
  corpo.push(`**Diagnóstico:** ${diag} (${okCount}/${esc.length})`)
  corpo.push('')
}

const cabe = []
cabe.push(`# Análise match placa-por-placa — Dia ${dia}/05/2026`)
cabe.push('')
cabe.push(`Total placas analisadas: ${todasPlacas.size}`)
cabe.push('')
cabe.push('## Sumário')
cabe.push('')
cabe.push('| Diagnóstico | Qtd |')
cabe.push('|------|-----|')
for (const [k, v] of Object.entries(stats).sort((a, b) => b[1] - a[1])) cabe.push(`| ${k} | ${v} |`)
cabe.push('')

const out = [...cabe, ...corpo].join('\n')
fs.writeFileSync(`docs/correcao-sistema/analise-match-dia-${dia}.md`, out, 'utf8')
console.log(`dia ${dia}:`, stats)
console.log('Salvo:', `docs/correcao-sistema/analise-match-dia-${dia}.md`)
