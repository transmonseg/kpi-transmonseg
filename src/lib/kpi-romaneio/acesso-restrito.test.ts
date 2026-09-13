import { describe, it, expect } from "vitest";
import { acessoSomentePorBarco } from "./acesso-restrito";

describe("acessoSomentePorBarco", () => {
  it("reconhece Vila do Abraão na Ilha Grande", () => {
    expect(acessoSomentePorBarco("RUA SANTANA, 58 - VILA DO ABRAAO ILHA GRANDE, ANGRA DOS REIS - PARTE")).toBe(true);
  });

  it("reconhece a grafia com acento e parenteses", () => {
    expect(acessoSomentePorBarco("RUA PROFESSORA ALICE KURY DA SILVA, S/N - VILA DO ABRAÃO (ILHA GRANDE), ANGRA DOS REIS - CD IGREJA")).toBe(true);
  });

  it("reconhece o bairro escrito so como ILHA GRANDE", () => {
    expect(acessoSomentePorBarco("AV NACIB MONTEIRO DE QUEIROZ, 20 - ILHA GRANDE, ANGRA DOS REIS - *")).toBe(true);
  });

  it("nao marca endereco continental de Angra", () => {
    expect(acessoSomentePorBarco("RUA DO COMERCIO, 100 - CENTRO, ANGRA DOS REIS - *")).toBe(false);
  });

  it("nao marca ILHA em nome de rua no continente", () => {
    // Caso real do cache: ESTRADA DA ILHA fica em Guaratiba, Rio de Janeiro --
    // acesso rodoviario normal. So' o par bairro+cidade decide, nunca a
    // presenca da palavra "ilha" no endereco.
    expect(acessoSomentePorBarco("ESTRADA DA ILHA, 4528 - GUARATIBA, RIO DE JANEIRO - *")).toBe(false);
  });
});
