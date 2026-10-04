import ExcelJS from 'exceljs'

// Dashboard (redesign 04/10/2026): resumo de cada geração extraído da PRÓPRIA
// planilha entregue -- os números do dashboard batem com o que a operação
// recebeu, sem segunda regra de cálculo. Gravado em
// kpi_romaneio_geracoes.resumo (jsonb).

export type CargaResumo = {
  carga: string
  placa: string
  destino: string
  motorista: string
  nfPlanejado: number | null
  nfConfirmadas: number | null
  km: number | null
  saida: string | null
  chegada: string | null
  tempoOperacaoMin: number | null
  tempoMedioMin: number | null
  /** NFs da carga que ficaram FORA da taxa (sem rastreador, carga inteira com
   *  placa da escala divergente, carga sem placa) -- a taxa por placa ignora. */
  nfForaDaConta?: number
}

export type NfResumo = {
  placa: string
  carga: string
  nf: string
  cliente: string
  endereco: string
  chegada: string | null
  saida: string | null
  tempoMin: number | null
  status: string
  categoria: string | null // null = ENTREGUE
}

export type ResumoGeracao = {
  versao: 1
  taxa: number | null
  nfsNaConta: number | null
  entregues: number | null
  pendentes: number
  semRastreador: number
  /** NFs "AGUARDANDO - ROTA EM ANDAMENTO": geração no meio do dia (parcial). */
  aguardando?: number
  foraDaConta: number | null
  cargas: CargaResumo[]
  motivos: Record<string, number>
}

const ABAS_FIXAS = new Set(['Auditoria', 'Avisos'])

function texto(v: ExcelJS.CellValue): string {
  if (v == null) return ''
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map(t => t.text).join('')
    if ('result' in v) return String(v.result ?? '')
    if ('text' in v) return String(v.text)
  }
  return String(v)
}

function numero(v: ExcelJS.CellValue): number | null {
  // Célula numérica (KM 310.2, NF 31) vem como number -- nunca reinterpretar
  // o ponto decimal como milhar.
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = texto(v).trim()
  if (!s) return null
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function inteiroBr(s: string): number {
  return Number(s.replace(/\./g, ''))
}

/** "10h38min" -> 638; "0h22min" -> 22; vazio -> null. */
export function minutosDeDuracao(s: string): number | null {
  const m = /^\s*(\d+)h(\d+)min\s*$/.exec(s)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Categoria curta do STATUS de uma NF não entregue (rótulo do relatório). */
export function categoriaPendencia(status: string): string {
  const s = status.toUpperCase()
  if (s.startsWith('SEM RASTREADOR')) return 'Sem rastreador'
  if (s.startsWith('AGUARDANDO')) return 'Aguardando fim da rota'
  if (s.startsWith('VEÍCULO NÃO SAIU DA BASE') || s.startsWith('VEÍCULO SEM MOVIMENTO')) return 'Não saiu da base'
  if (s.startsWith('PARADA COMPARTILHADA')) return 'Parada compartilhada (revisar)'
  if (s.startsWith('PARADA CURTA DE OUTRO ENDEREÇO')) return 'Parada de outro endereço'
  if (s.startsWith('CADASTRO DO CLIENTE NA UNITRAC DIVERGE')) return 'Cadastro divergente'
  if (s.startsWith('ENDEREÇO COM COORDENADA IMPRECISA') || s.startsWith('COORDENADA APROXIMADA')) return 'Coordenada imprecisa'
  if (s.startsWith('ENDEREÇO NÃO LOCALIZADO')) return 'Endereço não localizado'
  if (s.startsWith('NÃO FOI AO CLIENTE')) return 'Não foi ao cliente'
  if (s.startsWith('PARADA PRÓXIMA')) return 'Parada próxima'
  if (s.startsWith('PASSOU NO ENDEREÇO') || s.startsWith('PAROU NO ENDEREÇO')) return 'Passou sem registrar'
  if (s.startsWith('CLIENTE SEM ACESSO RODOVIÁRIO')) return 'Ilha (sem estrada)'
  if (s.startsWith('CARGA SEM PLACA')) return 'Carga sem placa'
  if (s.startsWith('PLACA DA ESCALA NÃO PASSOU')) return 'Placa da escala divergente'
  if (s.startsWith('SEM CONFIRMAÇÃO') || s === '') return 'Sem confirmação'
  return 'Outros'
}

export async function extrairResumoKpiXlsx(buf: Buffer | ArrayBuffer): Promise<ResumoGeracao> {
  return (await extrairKpiCompleto(buf)).resumo
}

/** Data do KPI: nome da aba principal ("KPI 2026-10-02") ou o título
 *  ("..., 02 de Outubro de 2026"). null quando não dá pra saber. */
function dataDoKpi(wb: ExcelJS.Workbook): string | null {
  const nome = wb.worksheets[0]?.name ?? ''
  const m = /(\d{4}-\d{2}-\d{2})/.exec(nome)
  if (m) return m[1]
  const titulo = texto(wb.worksheets[0]?.getCell(1, 1).value ?? null)
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  const t = /(\d{1,2}) de ([a-zç]+) de (\d{4})/i.exec(titulo)
  if (t) {
    const mi = meses.indexOf(t[2].toLowerCase())
    if (mi >= 0) return `${t[3]}-${String(mi + 1).padStart(2, '0')}-${t[1].padStart(2, '0')}`
  }
  return null
}

const hhmm = (s: string) => (/^\d{1,2}:\d{2}$/.test(s.trim()) ? s.trim() : null)

export async function extrairKpiCompleto(buf: Buffer | ArrayBuffer): Promise<{ data: string | null; resumo: ResumoGeracao; nfs: NfResumo[] }> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as ArrayBuffer)
  const principal = wb.worksheets[0]
  const nfs: NfResumo[] = []

  const cargas: CargaResumo[] = []
  let linhaTaxa = ''
  principal.eachRow((row, n) => {
    const v = row.values as ExcelJS.CellValue[] // 1-based
    const c1 = texto(v[1])
    if (c1.startsWith('TAXA DE CONFIRMAÇÃO')) { linhaTaxa = c1; return }
    if (n < 3 || !c1 || c1 === 'CARGA') return
    const placa = texto(v[2])
    if (!placa) return
    cargas.push({
      carga: c1,
      placa,
      destino: texto(v[3]),
      motorista: texto(v[4]),
      nfPlanejado: numero(v[9]),
      nfConfirmadas: numero(v[10]),
      km: numero(v[12]),
      // Só horário (a planilha põe "SEM RASTREADOR" nessas colunas às vezes).
      saida: /^\d{1,2}:\d{2}$/.test(texto(v[13]).trim()) ? texto(v[13]).trim() : null,
      chegada: /^\d{1,2}:\d{2}$/.test(texto(v[14]).trim()) ? texto(v[14]).trim() : null,
      tempoOperacaoMin: minutosDeDuracao(texto(v[15])),
      tempoMedioMin: minutosDeDuracao(texto(v[16])),
    })
  })

  const mTaxa = /TAXA DE CONFIRMAÇÃO:\s*([\d,]+)%\s*\(([\d.]+) de ([\d.]+) NFs/.exec(linhaTaxa)
  const mFora = /([\d.]+) fora da conta\)/.exec(linhaTaxa.split('|')[1] ?? linhaTaxa)
  const taxa = mTaxa ? Number(mTaxa[1].replace(',', '.')) : null
  const entregues = mTaxa ? inteiroBr(mTaxa[2]) : null
  const nfsNaConta = mTaxa ? inteiroBr(mTaxa[3]) : null

  const motivos: Record<string, number> = {}
  let pendentes = 0
  let semRastreador = 0
  let aguardando = 0
  for (const ws of wb.worksheets.slice(1)) {
    if (ABAS_FIXAS.has(ws.name)) continue
    ws.eachRow((row, n) => {
      if (n < 4) return
      const v = row.values as ExcelJS.CellValue[]
      const nf = texto(v[2])
      if (!/^\d+$/.test(nf)) return
      const status = texto(v[8]).trim()
      const entregue = status.startsWith('ENTREGUE')
      nfs.push({
        placa: ws.name,
        carga: texto(v[1]),
        nf,
        cliente: texto(v[3]),
        endereco: texto(v[4]),
        chegada: hhmm(texto(v[5])),
        saida: hhmm(texto(v[6])),
        tempoMin: minutosDeDuracao(texto(v[7])),
        status,
        categoria: entregue ? null : categoriaPendencia(status),
      })
      if (entregue) return
      const cat = categoriaPendencia(status)
      if (cat === 'Sem rastreador') semRastreador++
      else if (cat === 'Aguardando fim da rota') aguardando++
      else pendentes++
      motivos[cat] = (motivos[cat] ?? 0) + 1
    })
  }

  // Fora da conta por carga+placa: mesma regra da linha de taxa da planilha
  // (sem rastreador e carga sem placa sempre; placa da escala divergente só
  // quando a carga INTEIRA tem o rótulo).
  const porCarga = new Map<string, NfResumo[]>()
  for (const n of nfs) porCarga.set(`${n.carga}::${n.placa}`, [...(porCarga.get(`${n.carga}::${n.placa}`) ?? []), n])
  for (const c of cargas) {
    const lista = porCarga.get(`${c.carga}::${c.placa}`) ?? []
    const inteiraDivergente = lista.length > 0 && lista.every(n => n.categoria === 'Placa da escala divergente')
    c.nfForaDaConta = lista.filter(n => n.categoria === 'Sem rastreador' || n.categoria === 'Carga sem placa' || (inteiraDivergente && n.categoria === 'Placa da escala divergente')).length
    // Carga inteira trocada está FORA da taxa: não é pendência (04/10).
    if (inteiraDivergente) {
      const resto = (motivos['Placa da escala divergente'] ?? 0) - lista.length
      if (resto > 0) motivos['Placa da escala divergente'] = resto
      else delete motivos['Placa da escala divergente']
    }
  }
  if (motivos['Carga sem placa']) delete motivos['Carga sem placa']

  const resumo: ResumoGeracao = {
    versao: 1,
    taxa,
    nfsNaConta,
    entregues,
    // Pendentes NA CONTA (denominador - entregues) quando a linha de taxa
    // existe; senão, a contagem das abas (inclui carga sem placa).
    pendentes: nfsNaConta != null && entregues != null ? nfsNaConta - entregues : pendentes,
    semRastreador,
    aguardando,
    foraDaConta: mFora ? inteiroBr(mFora[1]) : null,
    cargas,
    motivos,
  }
  return { data: dataDoKpi(wb), resumo, nfs }
}
