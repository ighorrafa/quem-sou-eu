import { describe, expect, it } from "vitest";
import { activeQueue, dealCardsInRing, nextActivePlayer, rankPlayers } from "@/lib/game/turns";

const players = [
  { id: "a", turn_order: 0, finished_position: null },
  { id: "b", turn_order: 1, finished_position: null },
  { id: "c", turn_order: 2, finished_position: null },
  { id: "d", turn_order: 3, finished_position: null },
];

describe("nextActivePlayer", () => {
  it("segue a ordem de turno com wrap-around", () => {
    expect(nextActivePlayer(players, "a")).toBe("b");
    expect(nextActivePlayer(players, "d")).toBe("a");
  });

  it("pula quem já acertou", () => {
    const withFinished = players.map((p) => (p.id === "b" ? { ...p, finished_position: 1 } : p));
    expect(nextActivePlayer(withFinished, "a")).toBe("c");
    const onlyOne = players.map((p) => (p.id === "a" ? p : { ...p, finished_position: 1 }));
    expect(nextActivePlayer(onlyOne, "a")).toBeNull();
  });
});

describe("activeQueue", () => {
  it("começa pelo jogador atual e mantém a ordem", () => {
    expect(activeQueue(players, "c").map((p) => p.id)).toEqual(["c", "d", "a", "b"]);
  });

  it("remove quem já terminou", () => {
    const withFinished = players.map((p) => (p.id === "d" ? { ...p, finished_position: 1 } : p));
    expect(activeQueue(withFinished, "c").map((p) => p.id)).toEqual(["c", "a", "b"]);
  });
});

describe("dealCardsInRing", () => {
  it("nunca entrega a própria carta e usa todas as cartas", () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let n = 2; n <= 12; n++) {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      for (let round = 0; round < 20; round++) {
        const deal = dealCardsInRing(ids, random);
        expect(deal.size).toBe(n);
        const received = new Set<string>();
        for (const [player, cardOwner] of deal) {
          expect(cardOwner).not.toBe(player);
          received.add(cardOwner);
        }
        expect(received.size).toBe(n);
      }
    }
  });

  it("exige pelo menos 2 jogadores", () => {
    expect(() => dealCardsInRing(["solo"])).toThrow();
  });
});

describe("rankPlayers", () => {
  it("ordena por posição de acerto e deixa pendentes no fim", () => {
    const ranked = rankPlayers([
      { id: "a", nickname: "A", turn_order: 0, finished_position: 2 },
      { id: "b", nickname: "B", turn_order: 1, finished_position: null },
      { id: "c", nickname: "C", turn_order: 2, finished_position: 1 },
    ]);
    expect(ranked.map((p) => p.id)).toEqual(["c", "a", "b"]);
  });
});
