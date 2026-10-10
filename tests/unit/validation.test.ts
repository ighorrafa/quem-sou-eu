import { describe, expect, it } from "vitest";
import {
  MAX_SOURCE_IMAGE_BYTES,
  validateGuess,
  validateImageFile,
  validateNickname,
  validateTitle,
} from "@/lib/game/validation";

describe("validateNickname", () => {
  it("exige entre 1 e 24 caracteres após trim", () => {
    expect(validateNickname("  Ana ")).toEqual({ ok: true, value: "Ana" });
    expect(validateNickname("   ").ok).toBe(false);
    expect(validateNickname("a".repeat(25)).ok).toBe(false);
  });
});

describe("validateTitle / validateGuess", () => {
  it("rejeita textos sem letras ou números", () => {
    expect(validateTitle("!!!").ok).toBe(false);
    expect(validateGuess("...").ok).toBe(false);
    expect(validateTitle("Torre Eiffel").ok).toBe(true);
    expect(validateGuess("2002").ok).toBe(true);
  });

  it("limita o tamanho", () => {
    expect(validateTitle("x".repeat(81)).ok).toBe(false);
    expect(validateGuess("x".repeat(81)).ok).toBe(false);
  });
});

describe("validateImageFile", () => {
  it("aceita apenas JPEG, PNG e WebP dentro do limite", () => {
    expect(validateImageFile({ type: "image/png", size: 1000 }).ok).toBe(true);
    expect(validateImageFile({ type: "image/gif", size: 1000 }).ok).toBe(false);
    expect(validateImageFile({ type: "image/jpeg", size: MAX_SOURCE_IMAGE_BYTES + 1 }).ok).toBe(false);
  });
});
