import { readdirSync, existsSync } from 'fs'
const dir = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20'
const files = readdirSync(dir).filter(f => /ARMAZ/i.test(f))
console.log('Arquivos ARMAZEM dia 20:')
for (const f of files) {
  const path = dir + '/' + f
  console.log('  ' + f + ' | existsSync=' + existsSync(path) + ' | len=' + f.length)
}
