// Clientes que nao tem acesso rodoviario. Nao e' erro de geocodificacao nem
// cadastro errado do cliente: o caminhao genuinamente nao chega la.
//
// Achado real 12/09 (auditoria do dia 11/09): 9 NFs na Vila do Abraao, Ilha
// Grande. As 22 entradas do cache para la tem coordenada CERTA -- conferido
// contra fonte independente. A placa RBG-2D21 chegou no maximo a 11 km, pela
// costa, a 75 km/h, sem parar. Contar como "NAO FOI AO CLIENTE" todo dia enche
// a lista de triagem com o mesmo caso ja conhecido.
//
// Lista explicita em vez de heuristica: "ilha" no nome do endereco nao quer
// dizer nada (ESTRADA DA ILHA fica em Guaratiba, com acesso rodoviario
// normal). So' o par bairro+cidade decide.
//
// A Ilha da Gigoia (Barra da Tijuca) NAO entra aqui ainda: la a coordenada
// tambem esta errada (22.792 m), entao o caso e' duplo e precisa ser
// reavaliado depois que a task 7 marcar o endereco. Ver "Triagem" na spec.

const BAIRROS_SEM_ACESSO_RODOVIARIO: { bairro: RegExp; cidade: RegExp }[] = [
  { bairro: /\b(VILA DO ABRAAO|ABRAAO|ILHA GRANDE)\b/, cidade: /\bANGRA DOS REIS\b/ },
];

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "VIA, NUM - BAIRRO, CIDADE - complemento" -> o par bairro+cidade esta na
 *  lista de acesso so' por barco? */
export function acessoSomentePorBarco(endereco: string): boolean {
  const seg = endereco.split(" - ");
  if (seg.length < 2 || !seg[1].includes(",")) return false;
  const i = seg[1].lastIndexOf(",");
  const bairro = normalizar(seg[1].slice(0, i));
  const cidade = normalizar(seg[1].slice(i + 1));
  return BAIRROS_SEM_ACESSO_RODOVIARIO.some((r) => r.bairro.test(bairro) && r.cidade.test(cidade));
}
