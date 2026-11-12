import { hojeBR } from '@/lib/data-br'
import { TelaOrdemRota } from './tela'

// 12/11: Ordem da rota da Rio Quality (gate no layout da Rio Quality).
export default function OrdemRotaPage() {
  return <TelaOrdemRota hoje={hojeBR()} />
}
