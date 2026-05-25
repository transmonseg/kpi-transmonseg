/**
 * EXTRAÇÃO TEXTUAL — sem inferência.
 * Lê PDFs convertidos em /tmp/r{18,19,20,21,22}.txt e separa por placa.
 * Pra cada placa, lista apenas: placa, viagem, e os "Local da Parada"
 * exatamente como vêm no PDF. Não decide nada — só apresenta.
 *
 * Output: docs/correcao-sistema/todas-placas/dia-{D}.md (5 arquivos)
 *
 * Depois EU (Claude) leio cada arquivo do começo ao fim.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'

const DIAS = [18, 19, 20, 21, 22]

interface Bloco {
  placa: string
  cabecalho: string  // linha do "Veículo XXX-NNNN  Início Fim Qtd Distância..."
  paradas: Array<{
    chegada: string
    saida: string
    duracao: string
    endereco: string
    lat: string
    lng: string
    local: string  // "BASE BENASSI", "FORA DE BASE", ou "[CODIGO] - [NOME]"
  }>
}

function processarDia(dia: number): Bloco[] {
  const txt = readFileSync(`C:/Users/media/AppData/Local/Temp/r${dia}.txt`, 'utf8')
  const linhas = txt.split('\n')

  const blocos: Bloco[] = []
  let blocoAtual: Bloco | null = null

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]
    // Linha de início de placa: "ABC-1234  18/05/2026 00:00 ..."
    const m = l.match(/^([A-Z]{3}[-]?[A-Z0-9]{4,5})\s+(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})/)
    if (m) {
      if (blocoAtual) blocos.push(blocoAtual)
      blocoAtual = { placa: m[1], cabecalho: l.trim(), paradas: [] }
      continue
    }

    // Linhas de paradas (têm formato data + hora chegada/saída)
    const mp = l.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(0D \d{2}:\d{2}:\d{2})/)
    if (mp && blocoAtual) {
      // Tenta extrair lat/lng e local da mesma linha ou próximas
      // Lat/lng é -22.XXXXXX -43.XXXXXX
      let endereco = '', lat = '', lng = '', local = ''
      // Lat/lng pode estar na mesma linha
      const ll = l.match(/(-\d{2}\.\d{4,6})\s+(-\d{2}\.\d{4,6})/)
      if (ll) { lat = ll[1]; lng = ll[2] }

      // Local da Parada e endereço estão espalhados nas próximas linhas
      // Vou pegar texto até a próxima parada ou próxima placa
      const buffer: string[] = []
      for (let j = i + 1; j < Math.min(i + 25, linhas.length); j++) {
        const next = linhas[j]
        if (next.match(/^([A-Z]{3}[-]?[A-Z0-9]{4,5})\s+\d{2}\/\d{2}\/\d{4}/)) break  // próxima placa
        if (next.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/)) break  // próxima parada
        if (next.match(/^         \d{2}\/\d{2}\/\d{4}/)) break // próxima parada com indent
        buffer.push(next)
      }
      const blob = buffer.join(' ').replace(/\s+/g, ' ').trim()
      // Lat/lng se ainda não achei
      if (!lat) {
        const ll2 = blob.match(/(-\d{2}\.\d{4,6})\s+(-\d{2}\.\d{4,6})/)
        if (ll2) { lat = ll2[1]; lng = ll2[2] }
      }
      // Local: aparece após o lat/lng
      // Categorias: BASE BENASSI / FORA DE BASE / [CODIGO]
      const localMatch = blob.match(/(BASE BENASSI[^A-Za-z]*BASE BENASSI(?:,\s*\d+\s*-\s*[A-Z][A-Z0-9\s\-./()]+)*|FORA DE BASE E LOCAL DE SERVI[ÇC]O|\d+\s*-\s*[A-Z][A-Z0-9\s\-./()]+(?:,\s*\d+\s*-\s*[A-Z][A-Z0-9\s\-./()]+)*)/i)
      local = localMatch ? localMatch[0].replace(/\s+/g, ' ').trim() : ''

      // Endereço: tudo antes do lat/lng (best effort)
      if (lat) {
        const idx = blob.indexOf(lat)
        endereco = blob.substring(0, idx).trim().slice(0, 100)
      } else {
        endereco = blob.slice(0, 100)
      }

      blocoAtual.paradas.push({
        chegada: mp[1] + ' ' + (l.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/)?.[2] ?? ''),
        saida: mp[2],
        duracao: mp[3],
        endereco, lat, lng, local,
      })
    }
  }
  if (blocoAtual) blocos.push(blocoAtual)
  return blocos
}

function escreverMd(dia: number, blocos: Bloco[]): void {
  const linhas: string[] = []
  linhas.push(`# Dia ${dia}/05/2026 — todas as placas`)
  linhas.push('')
  linhas.push(`Total: ${blocos.length} placas`)
  linhas.push('')
  linhas.push('Formato: 1 seção por placa, listando cada parada com Local da Parada')
  linhas.push('')

  for (const b of blocos) {
    linhas.push(`## ${b.placa}`)
    linhas.push('')
    linhas.push(`\`${b.cabecalho}\``)
    linhas.push('')
    linhas.push(`Paradas (${b.paradas.length}):`)
    for (const p of b.paradas) {
      const localShort = p.local || '?'
      linhas.push(`- \`${p.duracao}\` | \`${p.lat || '???'}, ${p.lng || '???'}\` | ${p.endereco.slice(0, 60)} | **${localShort}**`)
    }
    linhas.push('')
  }

  mkdirSync('docs/correcao-sistema/todas-placas', { recursive: true })
  writeFileSync(`docs/correcao-sistema/todas-placas/dia-${dia}.md`, linhas.join('\n'), 'utf8')
}

function main() {
  for (const dia of DIAS) {
    const blocos = processarDia(dia)
    escreverMd(dia, blocos)
    console.log(`Dia ${dia}: ${blocos.length} placas → docs/correcao-sistema/todas-placas/dia-${dia}.md`)
  }
}

main()
