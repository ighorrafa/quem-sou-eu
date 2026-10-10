import { describe, expect, it } from "vitest";
import { answersMatch, normalizeAnswer } from "@/lib/game/normalize";

describe("normalizeAnswer", () => {
  it("ignora maiúsculas, acentos, pontuação e espaços", () => {
    expect(normalizeAnswer("Albert Einstein")).toBe("alberteinstein");
    expect(normalizeAnswer("  SÃO   PAULO! ")).toBe("saopaulo");
    expect(normalizeAnswer("Pokémon: Go")).toBe("pokemongo");
    expect(normalizeAnswer("Copa de 2002")).toBe("copade2002");
  });

  it("retorna vazio para entradas sem conteúdo", () => {
    expect(normalizeAnswer("")).toBe("");
    expect(normalizeAnswer("!!! ...")).toBe("");
    expect(normalizeAnswer(null)).toBe("");
    expect(normalizeAnswer(undefined)).toBe("");
  });
});

describe("answersMatch", () => {
  it("aceita apenas o título completo normalizado", () => {
    expect(answersMatch("torre eiffel", "Torre Eiffel")).toBe(true);
    expect(answersMatch("Torre-Eiffel", "Torre Eiffel")).toBe(true);
    expect(answersMatch("spiderman", "Spider-Man")).toBe(true);
    expect(answersMatch("Eiffel", "Torre Eiffel")).toBe(false);
    expect(answersMatch("Torre Eifel", "Torre Eiffel")).toBe(false);
  });

  it("nunca casa respostas vazias", () => {
    expect(answersMatch("", "")).toBe(false);
    expect(answersMatch("...", "!!!")).toBe(false);
  });
});
