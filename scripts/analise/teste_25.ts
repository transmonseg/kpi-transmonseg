import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'

const DATA = '2026-05-25'
const buf = readFileSync('C:/Users/media/Downloads/ESCALA GERAL DE MAIO 0 (1).xlsx')

;(async () => {
  const escala = await parseEscalaGeral(buf, DATA)
  // Procura ANDERSON ou LCE4337
  const candidatos = escala.filter(l =>
    (l.motorista_nome ?? '').toUpperCase().includes('ANDERSON') ||
    l.placa_norm === 'LCE4337'
  )
  console.log(`Encontrados ${candidatos.length} linhas de ANDERSON/LCE4337:`)
  for (const l of candidatos) {
    console.log(`  rede=${l.rede_id} | placa=${l.placa_norm} | motorista=${l.motorista_nome} | carro=${l.carro_ordem} | loja_cod=${l.loja_codigo_raw} | loja=${l.loja_nome_raw}`)
  }

  console.log('\nTotal de linhas PREZUNIC:', escala.filter(l => l.rede_id === 'PREZUNIC').length)
  const placasPrezunic = [...new Set(escala.filter(l => l.rede_id === 'PREZUNIC').map(l => l.placa_norm))]
  console.log('Placas únicas PREZUNIC:', placasPrezunic.length)
  console.log('LCE4337 está nas placas PREZUNIC?', placasPrezunic.includes('LCE4337'))
})()
