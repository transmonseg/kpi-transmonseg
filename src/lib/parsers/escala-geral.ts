import ExcelJS from 'exceljs'
import { normalizaPlaca, placaValida } from '@/lib/utils/placa'
import { formataDataISO } from '@/lib/utils/data-brasileira'
import type { LinhaEscala } from '@/lib/types/escala'

// Códigos válidos são apenas numéricos. Texto não é código.
function asCodigoNumerico(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (s === '' || !/^\d+$/.test(s)) return null
  return s
}

// Sanitiza placa: se não bate com formato real, devolve string vazia
function placaSanitizada(p: string | null): string {
  if (!p) return ''
  return placaValida(p) ? normalizaPlaca(p) : ''
}

// Tokens de cabeçalho que NUNCA são placa real. Quando aparecem na coluna de
// placa, a linha inteira é cabeçalho de sub-seção vazado como dado.
const PLACA_HEADER_TOKENS = new Set(['PLACA', 'PLACAS', 'FORNECEDOR', 'FORNECEDORES'])

// Tokens de cabeçalho que NUNCA são nome de loja. Variações com espaço entre
// "REDES" e "FILIAIS" também batem (ver normalizaCabecalhoLoja).
const LOJA_HEADER_TOKENS = new Set([
  'REDES/FILIAIS',
  'REDES / FILIAIS',
  'REDES/ FILIAIS',
  'REDES /FILIAIS',
])

// Normaliza string de loja pra detectar cabeçalho "REDES/FILIAIS" com variações
// de espaço, acento e caixa. O(1) por linha (regex, sem alocação extra).
function normalizaCabecalhoLoja(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Filtro O(1) por linha: detecta linhas-cabeçalho vazadas como dado.
// Rejeita se placa ∈ tokens reservados, loja ∈ tokens reservados, OU placa
// não-vazia que não bate com regex de placa válida (brasileira antiga ou Mercosul).
// Exportado pra teste.
export function isHeaderLikeRow(
  placaRaw: string | null,
  lojaNomeRaw: string | null
): boolean {
  if (placaRaw) {
    const pUp = placaRaw.toUpperCase().trim()
    if (PLACA_HEADER_TOKENS.has(pUp)) return true
  }
  if (lojaNomeRaw) {
    const lUp = normalizaCabecalhoLoja(lojaNomeRaw)
    if (LOJA_HEADER_TOKENS.has(lUp)) return true
    // Variação sem barra: "REDES FILIAIS"
    if (lUp === 'REDES FILIAIS') return true
  }
  return false
}

const ABAS_SKIP = new Set(['2° ENTREGA ', 'ARMAZÉM ', 'MOTORISTAS', 'MATRIZ'])

// Aceita sufixo " (N)" que o Excel adiciona sozinho quando alguém duplica uma
// aba (ex: "18 (2)") -- sem isso, a aba inteira é ignorada em silêncio.
const RE_DIA_ABA = /^\d{1,2}(\s*\(\d+\))?\s*$/

function cellVal(cell: ExcelJS.Cell | undefined): unknown {
  if (!cell) return null
  // ExcelJS exposes a top-level `.result` property that already resolves shared
  // formulas (both master and slave cells). Use it whenever it has a meaningful
  // value so that sharedFormula slave cells don't fall through to the raw object.
  const result = (cell as unknown as { result?: unknown }).result
  if (result !== undefined && result !== null) return result
  const v = cell.value
  if (v === null || v === undefined) return null
  if (typeof v === 'object' && v !== null) {
    if ('text' in v) return (v as { text: string }).text
    if ('result' in v) return (v as { result: unknown }).result
    if ('richText' in v)
      return (v as { richText: { text: string }[] }).richText.map(r => r.text).join('')
    // sharedFormula slave with no result — return null instead of the raw object
    if ('sharedFormula' in v) return null
  }
  return v
}

function asStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function asNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return isNaN(v) ? null : v
  const n = parseFloat(String(v))
  return isNaN(n) ? null : n
}

function normText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function extractLojaCodigo(nome: string): string | null {
  const m = nome.match(/\bLoja\s+(\d+)/i)
  return m ? m[1] : null
}

function limpaLoja(nome: string): string {
  return nome.replace(/●/g, '').trim()
}

function inferRedeFromLoja(nome: string): string {
  const n = normText(nome)
  if (n.includes('ASSAI') || n.includes('ASSAÍ')) return 'ASSAI'
  if (n.includes('ATACADAO') || n.includes('ATACADÃO')) return 'ATACADAO'
  if (n.includes('CARREFOUR')) return 'CARREFOUR'
  if (n.includes('PREZUNIC')) return 'PREZUNIC'
  if (n.includes('PRINCESA')) return 'PRINCESA'
  if (n.includes('GUANABARA')) return 'GUANABARA'
  if (n.includes("SAM'S") || n.includes('SAMS')) return 'SAMS_CLUB'
  if (n.includes('VIANENSE')) return 'VIANENSE'
  if (n.includes('CAB') && n.includes('PETROPOLIS')) return 'CAB_PETROPOLIS'
  if (n.includes('SENDAS')) return 'SENDAS'
  if (n.includes('FEIRA NOVA')) return 'FEIRA_NOVA'
  if (n.includes('EMANUEL')) return 'EMANUEL'
  if (n.includes('ARMAZEM') && n.includes('GRAO')) return 'ARMAZEM_GRAO'
  if (n.includes('SUPER PAX') || n.includes('SUPERPAX')) return 'SUPER_PAX'
  if (n.includes('SUPERCOMPRAS')) return 'SUPERCOMPRAS'
  if (n.includes('SUPER PRIX') || n.includes('SUPERPRIX')) return 'SUPERPRIX'
  if (n.includes('MUNDIAL')) return 'MUNDIAL'
  return 'DESCONHECIDO'
}

function inferRedeFromSeparator(sep: string): string | null {
  const n = normText(sep)
  if (n.includes('ASSAI') || n.includes('ASSAÍ')) return 'ASSAI'
  if (n.includes('ATACADAO') || n.includes('ATACADÃO')) {
    // Sub-headers like "Atacadão - Manilha" are within ATACADAO, not a new rede separator
    // They have the store format, so we return ATACADAO to update current rede
    return 'ATACADAO'
  }
  if (n.includes('CARREFOUR')) return 'CARREFOUR'
  if (n.includes('SUPER PRIX') || n.includes('SUPERPRIX')) return 'SUPERPRIX'
  if (n.includes('PREZUNIC') || n.includes('LOJAS DO PREZUNIC')) return 'PREZUNIC'
  if (n.includes('PRINCESA')) return 'PRINCESA'
  if (n.includes('GUANABARA')) return 'GUANABARA'
  if (n.includes("SAM'S") || n.includes('SAMS CLUB') || n.includes('SAM S CLUB')) return 'SAMS_CLUB'
  if (n.includes('VIANENSE')) return 'VIANENSE'
  if (n.includes('CAB') && n.includes('PETROPOLIS')) return 'CAB_PETROPOLIS'
  if (n.includes('SENDAS')) return 'SENDAS'
  if (n.includes('FEIRA NOVA')) return 'FEIRA_NOVA'
  if (n.includes('GRUPO EMANUEL') || (n.includes('EMANUEL') && !n.includes('ATACADAO'))) return 'EMANUEL'
  if ((n.includes('ARMAZEM') || n.includes('ARMAZÉM')) && (n.includes('GRAO') || n.includes('GRÃO'))) return 'ARMAZEM_GRAO'
  if (n.includes('SUPER PAX') || n.includes('SUPERPAX')) return 'SUPER_PAX'
  if (n.includes('MUNDIAL')) return 'MUNDIAL'
  return null
}

function extractDateFromWorksheet(ws: ExcelJS.Worksheet): Date | null {
  for (let rowNum = 1; rowNum <= 5; rowNum++) {
    const row = ws.getRow(rowNum)
    for (let col = 1; col <= 20; col++) {
      const v = cellVal(row.getCell(col))
      if (v instanceof Date) {
        return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())
      }
      if (typeof v === 'string') {
        const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/)
        if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
        const m2 = v.match(/(\d{4})-(\d{2})-(\d{2})/)
        if (m2) return new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]))
      }
    }
  }
  return null
}

function parseDayTab(ws: ExcelJS.Worksheet, dataISO: string): LinhaEscala[] {
  const linhas: LinhaEscala[] = []

  let redeAtual = 'DESCONHECIDO'
  let turnoAtual: 'MANHA' | 'TARDE' = 'MANHA'
  let modoBenassi = false
  let modoForaEscala = false

  let ultimaLoja: {
    nome: string
    codigo: string | null
    peso: number | null
    paletes: number | null
    rowNum: number
  } | null = null

  ws.eachRow((row, rowNum) => {
    if (rowNum <= 4) return

    const v1 = cellVal(row.getCell(1))
    const v2 = cellVal(row.getCell(2))
    const v3 = cellVal(row.getCell(3))
    const v4 = cellVal(row.getCell(4))

    const s1 = asStr(v1)

    if (!s1) return

    const n0 = normText(s1)

    // Skip column-header rows (appear inside BENASSI/FORA_ESCALA sub-sections)
    if (n0.includes('REDES') && (n0.includes('FILIAI') || n0.includes('FILIAL'))) return
    // Skip TOTAL summary rows (col4 may carry a formula, so isSeparator won't catch them)
    if (n0.startsWith('TOTAL')) return

    // Merged-cell rows: all columns carry the same text (ExcelJS propagates the master cell value).
    // These are either rede section headers or BENASSI/FORA_ESCALA mode switches.
    const v4str = asStr(v4)
    const isMergedHeader = v4str !== null && v4str === s1

    const isSeparator = isMergedHeader || v4 === null || v4 === undefined || v4str === null

    if (isSeparator) {
      // Linha com col4 vazia mas com motorista: é uma loja própria
      // (multi-entrega: mesmo veículo serve várias lojas, só 1ª linha tem qty em col4).
      // Usa nomeLoja vindo da própria linha (s1), NÃO de ultimaLoja.
      // hasWeight NÃO é mais requisito: linhas com motorista+placa são preservadas
      // mesmo quando peso vem de sharedFormula escrava e resolva null.
      const hasWeight = !isMergedHeader && asNum(v2) !== null
      const v6check = asStr(cellVal(row.getCell(6)))
      const temMotorista = v6check !== null
      const v8check = asStr(cellVal(row.getCell(8)))
      const temPlaca = v8check !== null
      // Aceita a linha se tem peso OU se tem motorista+placa (cobre sharedFormula)
      if (!isMergedHeader && (hasWeight || (temMotorista && temPlaca)) && (temMotorista || ultimaLoja !== null)) {
        const v5 = cellVal(row.getCell(5))
        const v6 = cellVal(row.getCell(6))
        const v7 = cellVal(row.getCell(7))
        const v8 = cellVal(row.getCell(8))
        const v9 = cellVal(row.getCell(9))
        const v10 = cellVal(row.getCell(10))
        const v11 = cellVal(row.getCell(11))
        const v12 = cellVal(row.getCell(12))

        const placaRaw1 = asStr(v8)
        const placaRaw2 = asStr(v12)

        // Pula placeholders sem motorista/placa de carro 1 (redes em arquivo separado)
        if (!placaRaw1 && !asStr(v6)) return

        // Bug #3: rejeita linhas-cabeçalho vazadas mesmo no path "separator com peso"
        // (caso a planilha venha sem linha em branco entre seções de redes).
        if (isHeaderLikeRow(placaRaw1, limpaLoja(s1))) return
        if (placaRaw1 && !placaValida(placaRaw1)) return

        // Usa nome da própria linha se for diferente do ultimaLoja, senão herda
        const nomeLojaLinha = limpaLoja(s1)
        const usaNomeProprio = !ultimaLoja || nomeLojaLinha !== ultimaLoja.nome
        const nomeLojaFinal = usaNomeProprio ? nomeLojaLinha : ultimaLoja!.nome
        const codigoLojaFinal = usaNomeProprio ? extractLojaCodigo(nomeLojaLinha) : ultimaLoja!.codigo

        const tipoEmissao = modoBenassi ? 'BENASSI' : modoForaEscala ? 'FORA_ESCALA' : 'NORMAL'
        const redeFromLoja2 = inferRedeFromLoja(nomeLojaFinal)
        const redeId = modoBenassi
          ? (redeFromLoja2 !== 'DESCONHECIDO' ? redeFromLoja2 : 'SENDAS')
          : modoForaEscala ? redeFromLoja2
          : redeFromLoja2 !== 'DESCONHECIDO' ? redeFromLoja2 : redeAtual

        const placa1San = placaSanitizada(placaRaw1)
        const codigo1San = asCodigoNumerico(v7)
        const carro1: LinhaEscala = {
          data: dataISO,
          data_entrega: dataISO,
          rede_id: redeId,
          loja_nome_raw: nomeLojaFinal,
          loja_codigo_raw: codigoLojaFinal,
          placa_norm: placa1San,
          placa_raw: placa1San ? placaRaw1 : null,
          motorista_nome: asStr(v6),
          motorista_codigo: codigo1San,
          tipo_carro: asStr(v5),
          carro_ordem: 1,
          turno: turnoAtual,
          tipo_emissao: tipoEmissao,
          obs: modoForaEscala ? 'FORA_ESCALA' : null,
          restricao: null,
          peso_kg: asNum(v2),
          paletes: asNum(v3),
          raw_row_num: rowNum,
        }
        linhas.push(carro1)
        // Atualiza ultimaLoja pra próxima iteração
        if (usaNomeProprio) {
          ultimaLoja = { nome: nomeLojaFinal, codigo: codigoLojaFinal, peso: asNum(v2), paletes: asNum(v3), rowNum }
        }

        const motor2 = asStr(v10)
        const placa2San = placaSanitizada(placaRaw2)
        const codigo2 = asCodigoNumerico(v11)
        // Carro 2 real exige PLACA — sem placa, texto na col 10 é restrição
        if (motor2 !== null && placa2San !== '') {
          const carro2: LinhaEscala = {
            ...carro1,
            placa_norm: placa2San,
            placa_raw: placaRaw2,
            motorista_nome: motor2,
            motorista_codigo: codigo2,
            tipo_carro: asStr(v9),
            carro_ordem: 2,
            restricao: null,
          }
          linhas.push(carro2)
        } else {
          // Sem placa real → texto em v9/v10 é restrição do 1º carro
          const restricao = [asStr(v9), motor2].filter(Boolean).join(' ') || null
          if (restricao) linhas[linhas.length - 1] = { ...carro1, restricao }
        }
        return
      }

      // True separator
      const sepText = s1
      const n = normText(sepText)

      if (n.includes('TOTAL =') || n.startsWith('TOTAL')) return

      if (
        n.includes('CARREGAMENTO DIARIO') &&
        (n.includes('EMISSAO BENASSI') || n.includes('BENASSI'))
      ) {
        modoBenassi = true
        modoForaEscala = false
        redeAtual = 'SENDAS'
        return
      }

      if (
        n.includes('CARREGAMENTO DIARIO') &&
        (n.includes('PEDIDOS FORA ESCALA') || n.includes('FORA ESCALA'))
      ) {
        modoForaEscala = true
        modoBenassi = false
        return
      }

      if (n.includes('SO A TARDE') || n.includes('SO TARDE') || n.includes('SÓ A TARDE') || n.includes('SÓ TARDE')) {
        turnoAtual = 'TARDE'
        return
      }

      const rede = inferRedeFromSeparator(sepText)
      if (rede !== null) {
        redeAtual = rede
      }

      return
    }

    // Data row
    const nomeLoja = limpaLoja(s1)
    const codigo = extractLojaCodigo(nomeLoja)
    const peso = asNum(v2)
    const paletes = asNum(v3)

    ultimaLoja = { nome: nomeLoja, codigo, peso, paletes, rowNum }

    const v5 = cellVal(row.getCell(5))
    const v6 = cellVal(row.getCell(6))
    const v7 = cellVal(row.getCell(7))
    const v8 = cellVal(row.getCell(8))
    const v9 = cellVal(row.getCell(9))
    const v10 = cellVal(row.getCell(10))
    const v11 = cellVal(row.getCell(11))
    const v12 = cellVal(row.getCell(12))

    const placaRaw1 = asStr(v8)
    const placaRaw2 = asStr(v12)

    // Pula linhas placeholder: redes cuja escala de veículos vem em arquivo separado
    // (FEIRA_NOVA, EMANUEL, SUPER_PAX) aparecem no GERAL só com nome da loja e peso.
    // Sem motorista E sem placa de carro 1, não há o que cruzar com Unitrac.
    if (!placaRaw1 && !asStr(v6)) return

    // Bug #3: rejeita linhas-cabeçalho vazadas como dado (placa="PLACAS"/"FORNECEDOR",
    // loja="REDES/ FILIAIS"). Sem este filtro, eram classificadas como VIANENSE.
    if (isHeaderLikeRow(placaRaw1, nomeLoja)) return
    // Placa não-vazia que não bate com formato real (3 letras + 4 dígitos antigo,
    // ou Mercosul 3L+1D+1L+2D) também é cabeçalho/lixo. Sem placa válida, não há
    // o que cruzar com Unitrac.
    if (placaRaw1 && !placaValida(placaRaw1)) return

    // Filtra linhas com motorista "SEM PEDIDO" / "CARRO ESCALADO" (placeholder
    // de loja sem entrega no dia). Auditoria do dia 19/05 mostrou 4 linhas
    // CARREFOUR + 1 Assaí Cordovil que infavam contagem.
    const motoristaUpper = asStr(v6)?.toUpperCase() ?? ''
    if (
      motoristaUpper.includes('SEM PEDIDO') ||
      motoristaUpper.includes('CARRO ESCALADO') ||
      placaRaw1?.toUpperCase().includes('SEM PEDIDO')
    ) return

    const tipoEmissao = modoBenassi ? 'BENASSI' : modoForaEscala ? 'FORA_ESCALA' : 'NORMAL'
    const redeFromLoja = inferRedeFromLoja(nomeLoja)
    const redeId = modoBenassi ? 'SENDAS'
      : modoForaEscala ? redeFromLoja
      : redeFromLoja !== 'DESCONHECIDO' ? redeFromLoja : redeAtual

    const restricao1: string | null = (() => {
      const motor2 = asStr(v10)
      if (motor2 === null) {
        return asStr(v9)
      }
      return null
    })()

    const placa1San = placaSanitizada(placaRaw1)
    const codigo1San = asCodigoNumerico(v7)
    const carro1: LinhaEscala = {
      data: dataISO,
      data_entrega: dataISO,
      rede_id: redeId,
      loja_nome_raw: nomeLoja,
      loja_codigo_raw: codigo,
      placa_norm: placa1San,
      placa_raw: placa1San ? placaRaw1 : null,
      motorista_nome: asStr(v6),
      motorista_codigo: codigo1San,
      tipo_carro: asStr(v5),
      carro_ordem: 1,
      turno: turnoAtual,
      tipo_emissao: tipoEmissao,
      obs: modoForaEscala ? 'FORA_ESCALA' : null,
      restricao: restricao1,
      peso_kg: peso,
      paletes,
      raw_row_num: rowNum,
    }
    linhas.push(carro1)

    const motor2 = asStr(v10)
    const placa2San = placaSanitizada(placaRaw2)
    const codigo2 = asCodigoNumerico(v11)
    // Carro 2 real exige PLACA — sem placa, texto na col 10 é restrição (ex: "CARGA COMPARTILHADA")
    if (motor2 !== null && placa2San !== '') {
      const carro2: LinhaEscala = {
        ...carro1,
        placa_norm: placa2San,
        placa_raw: placaRaw2,
        motorista_nome: motor2,
        motorista_codigo: codigo2,
        tipo_carro: asStr(v9),
        carro_ordem: 2,
        restricao: null,
      }
      linhas.push(carro2)
    } else if (motor2 !== null || asStr(v9) !== null) {
      // Sem placa → texto da col 9/10 é restrição/observação do 1º carro
      const restricao = [asStr(v9), motor2].filter(Boolean).join(' ') || null
      if (restricao) linhas[linhas.length - 1] = { ...carro1, restricao }
    }
  })

  return linhas
}

export async function parseEscalaGeral(
  buffer: ArrayBuffer | Buffer,
  dataAlvo?: string
): Promise<LinhaEscala[]> {
  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = (buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer) as any
  await wb.xlsx.load(buf)

  const resultado: LinhaEscala[] = []

  // Pré-parse de dataAlvo para derivar data direto do nome da aba (dia = número da aba)
  let alvoAno: number | null = null
  let alvoMes: number | null = null
  if (dataAlvo) {
    const parts = dataAlvo.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (parts) {
      alvoAno = Number(parts[1])
      alvoMes = Number(parts[2])
    }
  }

  wb.eachSheet(ws => {
    const name = ws.name

    if (ABAS_SKIP.has(name)) return

    const trimmed = name.trim()
    if (!RE_DIA_ABA.test(trimmed)) return

    let dataISO: string

    if (alvoAno !== null && alvoMes !== null) {
      // Quando dataAlvo está disponível, a data da aba = ano/mês de dataAlvo + dia do nome da aba.
      // Isso evita depender de qualquer célula dentro da planilha para determinar a data.
      // parseInt (não Number): trimmed pode vir com sufixo de duplicação, ex "18 (2)"
      const dia = parseInt(trimmed, 10)
      dataISO = `${alvoAno}-${String(alvoMes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
      if (dataISO !== dataAlvo) return
    } else {
      const dateFromSheet = extractDateFromWorksheet(ws)
      if (!dateFromSheet) {
        console.warn(`[escala-geral] Aba "${trimmed}": data não encontrada, aba ignorada.`)
        return
      }
      dataISO = formataDataISO(dateFromSheet)
    }

    const linhas = parseDayTab(ws, dataISO)
    resultado.push(...linhas)
  })

  return resultado
}
