/**
 * Texto do aviso de sugestão de troca, usado na observação do PDF e no motivo do painel.
 * Apresentação num só lugar (DRY). Sem travessão (regra de copy).
 *  - alta: carro da rede com rota própria esteve nesta loja (sinal forte).
 *  - baixa: hipótese só geográfica (placa passou perto), não confirmada.
 */
export function textoSugestaoTroca(
  placa: string,
  confianca: 'alta' | 'baixa',
  hora: string | null,
): string {
  const h = hora ? ` às ${hora}` : ''
  return confianca === 'alta'
    ? `Possível troca: a placa ${placa} esteve nesta loja${h}, confirmar.`
    : `Verificar: nenhum carro da escala registrou GPS aqui; a placa ${placa} passou perto${h} (não confirmado).`
}
