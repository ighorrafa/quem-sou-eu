import { describe, expect, it } from "vitest";
import { generateRoomCode, isValidRoomCode, ROOM_CODE_ALPHABET, sanitizeRoomCode } from "@/lib/game/roomCode";

describe("sanitizeRoomCode", () => {
  it("normaliza espaços, minúsculas e caracteres extras", () => {
    expect(sanitizeRoomCode(" ab c12 3 ")).toBe("ABC123");
    expect(sanitizeRoomCode("abc-123-xyz")).toBe("ABC123");
  });
});

describe("isValidRoomCode", () => {
  it("aceita apenas 6 caracteres do alfabeto sem ambiguidade", () => {
    expect(isValidRoomCode("ABC234")).toBe(true);
    expect(isValidRoomCode("ABC12O")).toBe(false); // 1 e O não existem
    expect(isValidRoomCode("ABCDE")).toBe(false);
    expect(isValidRoomCode("abc234")).toBe(false);
  });
});

describe("generateRoomCode", () => {
  it("gera códigos válidos com um gerador determinístico", () => {
    let seed = 0.1;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode(random);
      expect(isValidRoomCode(code)).toBe(true);
      for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    }
  });
});
