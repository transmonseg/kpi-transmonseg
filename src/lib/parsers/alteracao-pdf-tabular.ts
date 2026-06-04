import { getDocument } from 'pdfjs-serverless'
import { normalizaPlaca } from '@/lib/utils/placa'
import type { AlteracaoParsed, VeiculoSlot } from './alteracao-text'

/**
 * Parser para PDFs de "ALTERAÇÃO DE ESCALA" no formato tabular (planilha convertida em PDF).
 *
 * Estrutura esperada:
 *   REDES / FILIAIS | 1º CARRO (TIPO MOTORISTA CÓD PLACA) | 2º CARRO (TIPO MOTORISTA CÓD PLACA)
 *
 * pdf-parse perde a estrutura tabular porque junta texto sequencialmente. Usamos
 * pdfjs-serverless que expõe coordenadas X/Y de cada fragmento de texto, e
 * reconstruímos as linhas/colunas a partir disso.
 *
 * Cada linha de dados vira até 2 AlteracaoParsed (uma por carro preenchido).
 * O parser NÃO interpreta "entra/sai" — trata cada carro como uma INCLUSAO,
 * porque na tabela 1º/2º CARRO representam a escala atualizada, não substituição.
 */

interface PdfItem { x: number; y: number; str: string }

const PLACA_RE = /\b([A-Z]{3}[\s-]?\d[A-Z0-9]\d{2})\b/i

const REDE_MAP: Array<{ pat: string; id: string }> = [
  { pat: 'prezunic', id: 'PREZUNIC' },
  { pat: 'princesa', id: 'PRINCESA' },
  { pat: 'carrefour', id: 'CARREFOUR' },
  { pat: 'assa', id: 'ASSAI' },
  { pat: 'atacad', id: 'ATACADAO' },
  { pat: 'super prix', id: 'SUPERPRIX' },
  { pat: 'superprix', id: 'SUPERPRIX' },
  { pat: "sam's", id: 'SAMS_CLUB' },
  { pat: 'sams club', id: 'SAMS_CLUB' },
  { pat: 'vianen', id: 'VIANENSE' },
  { pat: 'sendas', id: 'SENDAS' },
  { pat: 'guanabara', id: 'GUANABARA' },
  { pat: 'super pax', id: 'SUPER_PAX' },
  { pat: 'superpax', id: 'SUPER_PAX' },
  { pat: 'feira nova', id: 'FEIRA_NOVA' },
  { pat: 'emanuel', id: 'EMANUEL' },
  { pat: 'armaz', id: 'ARMAZEM_GRAO' },
  { pat: 'zona sul', id: 'ZONA_SUL' },
  { pat: 'mundial', id: 'MUNDIAL' },
  { pat: 'cab petropolis', id: 'CAB_PETROPOLIS' },
]

function detectaRede(texto: string): string | null {
  const lower = texto.toLowerCase()
  for (const { pat, id } of REDE_MAP) {
    if (lower.includes(pat)) return id
  }
  return null
}

/**
 * Esquema da tabela: cada coluna tem um anchor X (do header) e um nome.
 * Items das linhas de dados são atribuídos à coluna cujo anchor X é mais próximo.
 */
interface Coluna { name: string; x: number }

interface TabelaSchema {
  colunas: Coluna[] // ordem fixa: redes, tipo1, mot1, cod1, placa1, [tipo2, mot2, cod2, placa2]
  headerY: number
  temCarro2: boolean
}

function montaSchema(headerItems: PdfItem[]): TabelaSchema | null {
  // Normaliza removendo acentos (CÓD → COD)
  const norm = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const labels = headerItems.map(it => ({ ...it, label: norm(it.str) }))

  const redes = labels.find(l => l.label.includes('REDES') || l.label.includes('FILIAIS') || l.label === 'LOJA')
  if (!redes) return null

  const tipos = labels.filter(l => l.label === 'TIPO CARRO' || l.label === 'TIPO').sort((a, b) => a.x - b.x)
  const motoristas = labels.filter(l => l.label === 'MOTORISTA' || l.label === 'NOME').sort((a, b) => a.x - b.x)
  const cods = labels.filter(l => l.label === 'COD' || l.label === 'CODIGO').sort((a, b) => a.x - b.x)
  const placas = labels.filter(l => l.label === 'PLACA' || l.label === 'PLACAS').sort((a, b) => a.x - b.x)

  if (tipos.length === 0 || motoristas.length === 0 || placas.length === 0) return null

  // Anchor X de cada coluna. Pra REDES usa início do nome (esquerda), não centro do header,
  // porque na tabela os nomes longos das lojas começam bem à esquerda.
  const colunas: Coluna[] = [
    { name: 'redes', x: 24 }, // anchor à esquerda (origem dos nomes de loja)
    { name: 'tipo1', x: tipos[0].x },
    { name: 'mot1', x: motoristas[0].x },
    { name: 'cod1', x: cods[0]?.x ?? motoristas[0].x + 80 },
    { name: 'placa1', x: placas[0].x },
  ]
  const temCarro2 = tipos.length >= 2 && motoristas.length >= 2 && placas.length >= 2
  if (temCarro2) {
    colunas.push(
      { name: 'tipo2', x: tipos[1].x },
      { name: 'mot2', x: motoristas[1].x },
      { name: 'cod2', x: cods[1]?.x ?? motoristas[1].x + 80 },
      { name: 'placa2', x: placas[1].x },
    )
  }

  return { colunas, headerY: redes.y, temCarro2 }
}

function colunaMaisProxima(itemX: number, colunas: Coluna[]): string {
  let minDist = Infinity
  let nome = colunas[0].name
  for (const c of colunas) {
    const d = Math.abs(itemX - c.x)
    if (d < minDist) { minDist = d; nome = c.name }
  }
  return nome
}

function celula(items: PdfItem[], colunaNome: string, colunas: Coluna[]): string {
  return items
    .filter(it => colunaMaisProxima(it.x, colunas) === colunaNome)
    .sort((a, b) => a.x - b.x)
    .map(it => it.str.trim())
    .filter(Boolean)
    .join(' ')
    .trim()
}

function extraiPlaca(s: string): { raw: string; norm: string } | null {
  const m = s.match(PLACA_RE)
  if (!m) return null
  const raw = m[1].toUpperCase()
  return { raw, norm: normalizaPlaca(raw) }
}

function extraiCodigoMotorista(motoristaCelula: string, codCelula: string): { motorista: string | null; codigo: number | null } {
  // CÓD às vezes vem grudado no motorista (ex: "184357" sozinho em cod, ou "RENAN 184357" mesclado).
  // Lógica: pega primeiro número que pareça código.
  const tudo = `${motoristaCelula} ${codCelula}`.trim()
  const codMatch = tudo.match(/\b(\d{2,7})\b/)
  const codigo = codMatch ? parseInt(codMatch[1], 10) : null
  let motorista = motoristaCelula
  if (codigo !== null) {
    motorista = motorista.replace(new RegExp(`\\b${codigo}\\b`, 'g'), '').trim()
  }
  if (!motorista) motorista = null as unknown as string
  return { motorista: motorista || null, codigo: isNaN(codigo as number) ? null : codigo }
}

function montaSlot(tipoCarro: string, motoristaCel: string, codCel: string, placaCel: string): VeiculoSlot | null {
  const placa = extraiPlaca(placaCel) ?? extraiPlaca(motoristaCel) ?? extraiPlaca(codCel)
  const { motorista, codigo } = extraiCodigoMotorista(motoristaCel, codCel)
  if (!placa && !motorista && codigo === null) return null

  // Bug C dia 25 (auditoria 2026-05-27): tipo do carro NAO deve grudar no nome
  // do motorista. Antes virava "TRUCK C/ RAMPA E REFRI ALLAN" e o sistema usava
  // a string inteira como motorista_nome em escala_linhas e nos KPIs.
  // Decisao: motorista vence sempre que existir; tipoCarro so vira nome quando
  // a coluna MOTORISTA esta vazia (caso raro).
  const tipoLimpo = tipoCarro.trim()
  const nomeFinal: string | null = motorista
    ? motorista
    : (tipoLimpo || null)

  return {
    motorista_nome: nomeFinal,
    motorista_codigo: codigo,
    placa_raw: placa?.raw ?? null,
    placa_norm: placa?.norm ?? null,
  }
}

export async function parseAlteracaoPdfTabular(buffer: Buffer): Promise<AlteracaoParsed[]> {
  if (buffer.length === 0) return []

  const pdf = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise
  const todasAlteracoes: AlteracaoParsed[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()

    const items: PdfItem[] = []
    for (const it of content.items) {
      if (!('str' in it)) continue
      const txt = (it as { str: string }).str
      if (!txt.trim()) continue
      const tr = (it as { transform: number[] }).transform
      items.push({ x: tr[4], y: tr[5], str: txt })
    }

    // Agrupa por linha (Y dentro de tolerância)
    const tol = 3
    items.sort((a, b) => b.y - a.y || a.x - b.x)
    const linhas: PdfItem[][] = []
    let atual: PdfItem[] = []
    let lastY: number | null = null
    for (const it of items) {
      if (lastY === null || Math.abs(it.y - lastY) <= tol) {
        atual.push(it)
        if (lastY === null) lastY = it.y
      } else {
        if (atual.length > 0) linhas.push(atual)
        atual = [it]
        lastY = it.y
      }
    }
    if (atual.length > 0) linhas.push(atual)

    // Encontra header: linha que contém "REDES" ou "FILIAIS" e "PLACA"
    const headerLinhaIdx = linhas.findIndex(lin => {
      const txt = lin.map(it => it.str).join(' ').toUpperCase()
      return (txt.includes('REDE') || txt.includes('FILIAIS')) && txt.includes('PLACA')
    })
    if (headerLinhaIdx === -1) continue

    const schema = montaSchema(linhas[headerLinhaIdx])
    if (!schema) continue

    // Linhas de dados: todas abaixo do header (y < headerY)
    const dataLines = linhas.slice(headerLinhaIdx + 1).filter(lin => lin[0].y < schema.headerY)

    for (const lin of dataLines) {
      const redesCel = celula(lin, 'redes', schema.colunas)
      if (!redesCel) continue // linha vazia ou só metadados (ex: "CARGA COMPARTILHADA")

      const slot1 = montaSlot(
        celula(lin, 'tipo1', schema.colunas),
        celula(lin, 'mot1', schema.colunas),
        celula(lin, 'cod1', schema.colunas),
        celula(lin, 'placa1', schema.colunas),
      )

      let slot2: VeiculoSlot | null = null
      if (schema.temCarro2) {
        slot2 = montaSlot(
          celula(lin, 'tipo2', schema.colunas),
          celula(lin, 'mot2', schema.colunas),
          celula(lin, 'cod2', schema.colunas),
          celula(lin, 'placa2', schema.colunas),
        )
      }

      const redeId = detectaRede(redesCel)

      // Cada carro preenchido vira 1 alteração separada (tipo INCLUSAO)
      // Confiança alta quando: rede detectada + placa válida
      function build(slot: VeiculoSlot | null, ordem: number): AlteracaoParsed | null {
        if (!slot) return null
        const confianca: AlteracaoParsed['confianca'] = redeId && slot.placa_norm
          ? 'alta'
          : (slot.placa_norm ? 'media' : 'baixa')
        return {
          tipo: 'INCLUSAO',
          rede_id: redeId,
          loja_nome_raw: redesCel,
          entra: slot,
          sai: null,
          motivo: `${ordem}º CARRO`,
          texto_original: `${redesCel} | ${ordem}º CARRO: ${[slot.motorista_nome, slot.motorista_codigo, slot.placa_raw].filter(Boolean).join(' ')}`,
          confianca,
        }
      }

      const a1 = build(slot1, 1)
      const a2 = build(slot2, 2)
      if (a1) todasAlteracoes.push(a1)
      if (a2) todasAlteracoes.push(a2)
    }
  }

  return todasAlteracoes
}
