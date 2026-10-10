// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameBoard } from "@/components/game/GameBoard";
import { Lobby } from "@/components/game/Lobby";
import { Ranking } from "@/components/game/Ranking";
import type { Player, RoomSnapshot } from "@/lib/game/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const now = "2026-10-09T20:00:00.000Z";

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    room_id: "room-1",
    user_id: `user-${id}`,
    nickname: `Jogador ${id.toUpperCase()}`,
    is_ready: true,
    turn_order: null,
    finished_position: null,
    finished_at: null,
    joined_at: now,
    ...overrides,
  };
}

function snapshot(
  partial: Partial<RoomSnapshot> & {
    status: RoomSnapshot["room"]["status"];
    turn_mode?: RoomSnapshot["room"]["turn_mode"];
  },
): RoomSnapshot {
  return {
    room: {
      id: "room-1",
      code: "ABC234",
      host_id: "user-a",
      status: partial.status,
      round: 1,
      turn_version: partial.status === "lobby" ? 0 : 3,
      turn_mode: partial.status === "playing" ? (partial.turn_mode ?? null) : null,
      current_player_id: partial.status === "playing" ? "a" : null,
      created_at: now,
      started_at: partial.status === "lobby" ? null : now,
      finished_at: partial.status === "finished" ? now : null,
      expires_at: now,
    },
    players: partial.players ?? [],
    cards: partial.cards ?? [],
    assignments: partial.assignments ?? [],
    events: partial.events ?? [],
  };
}

/** Cliente falso: registra as RPCs chamadas e devolve respostas simples. */
function fakeSupabase(rpcResponses: Record<string, unknown> = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: rpcResponses[fn] ?? null, error: null };
    }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

const refresh = vi.fn(async () => undefined);

describe("Lobby", () => {
  it("mostra o formulário para quem não está pronto e bloqueia o início para o anfitrião", () => {
    const players = [player("a", { is_ready: false }), player("b")];
    const { client } = fakeSupabase();
    render(
      <Lobby
        supabase={client}
        user={{ id: "user-a" } as never}
        snapshot={snapshot({ status: "lobby", players })}
        me={players[0]}
        isHost
        imageUrls={{}}
        refresh={refresh}
      />,
    );
    expect(screen.getByLabelText("Resposta da carta")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pronto" })).toBeTruthy();
    const start = screen.getByRole("button", { name: "Iniciar partida" }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(screen.getByText("1/2 prontos")).toBeTruthy();
  });

  it("exige imagem antes de marcar pronto", async () => {
    const players = [player("a", { is_ready: false }), player("b")];
    const { client, calls } = fakeSupabase();
    render(
      <Lobby
        supabase={client}
        user={{ id: "user-a" } as never}
        snapshot={snapshot({ status: "lobby", players })}
        me={players[0]}
        isHost={false}
        imageUrls={{}}
        refresh={refresh}
      />,
    );
    fireEvent.change(screen.getByLabelText("Resposta da carta"), { target: { value: "Torre Eiffel" } });
    fireEvent.click(screen.getByRole("button", { name: "Pronto" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/imagem/i));
    expect(calls).toHaveLength(0);
  });

  it("libera o botão de iniciar quando todos estão prontos", async () => {
    const players = [player("a"), player("b"), player("c")];
    const { client, calls } = fakeSupabase();
    render(
      <Lobby
        supabase={client}
        user={{ id: "user-a" } as never}
        snapshot={snapshot({ status: "lobby", players })}
        me={players[0]}
        isHost
        imageUrls={{}}
        refresh={refresh}
      />,
    );
    const start = screen.getByRole("button", { name: "Iniciar partida" }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    await waitFor(() => expect(calls.map((c) => c.fn)).toEqual(["start_game"]));
  });
});

describe("GameBoard", () => {
  const players = [
    player("a", { turn_order: 0 }),
    player("b", { turn_order: 1 }),
    player("c", { turn_order: 2, finished_position: 1 }),
  ];
  // O jogador "a" não recebe a própria carta atribuída (card-a está oculta pelo RLS).
  const cards = [
    { id: "card-b", room_id: "room-1", owner_player_id: "a", title: "Resposta de B", image_path: "room-1/user-a/x.jpg", created_at: now },
    { id: "card-c", room_id: "room-1", owner_player_id: "b", title: "Resposta de C", image_path: "room-1/user-b/x.jpg", created_at: now },
  ];
  const assignments = [
    { room_id: "room-1", player_id: "a", card_id: "card-a" },
    { room_id: "room-1", player_id: "b", card_id: "card-b" },
    { room_id: "room-1", player_id: "c", card_id: "card-c" },
  ];

  it("mostra os controles só para o jogador da vez e esconde a própria carta", () => {
    window.localStorage.setItem("qse:rules-seen", "1");
    const { client } = fakeSupabase();
    render(
      <GameBoard
        supabase={client}
        snapshot={snapshot({ status: "playing", players, cards, assignments })}
        me={players[0]}
        isHost={false}
        imageUrls={{ "room-1/user-a/x.jpg": "blob:b", "room-1/user-b/x.jpg": "blob:c" }}
        refresh={refresh}
      />,
    );
    expect(screen.getByText("É a sua vez!")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fazer uma pergunta" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Palpitar agora" })).toBeTruthy();
    expect(screen.getByText("Só os outros veem a resposta")).toBeTruthy();
    expect(screen.getByText("Resposta de B")).toBeTruthy();
    expect(screen.getByText("Resposta de C")).toBeTruthy();
    expect(screen.getByText("#1")).toBeTruthy();
  });

  it("mostra a modal de regras só na primeira rodada e lembra que já foi vista", () => {
    const { client } = fakeSupabase();
    window.localStorage.clear();
    const first = render(
      <GameBoard
        supabase={client}
        snapshot={snapshot({ status: "playing", players, cards, assignments })}
        me={players[1]}
        isHost={false}
        imageUrls={{}}
        refresh={refresh}
      />,
    );
    const dialog = first.container.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(screen.getByText("Como jogar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Entendi/ }));
    expect(dialog.hasAttribute("open")).toBe(false);
    first.unmount();

    const second = render(
      <GameBoard
        supabase={client}
        snapshot={snapshot({ status: "playing", players, cards, assignments })}
        me={players[1]}
        isHost={false}
        imageUrls={{}}
        refresh={refresh}
      />,
    );
    expect((second.container.querySelector("dialog") as HTMLDialogElement).hasAttribute("open")).toBe(false);
    second.unmount();

    window.localStorage.clear();
    const roundTwo = snapshot({ status: "playing", players, cards, assignments });
    roundTwo.room.round = 2;
    const third = render(
      <GameBoard supabase={client} snapshot={roundTwo} me={players[1]} isHost={false} imageUrls={{}} refresh={refresh} />,
    );
    expect((third.container.querySelector("dialog") as HTMLDialogElement).hasAttribute("open")).toBe(false);
  });

  it("não mostra controles para quem está aguardando", () => {
    const { client } = fakeSupabase();
    render(
      <GameBoard
        supabase={client}
        snapshot={snapshot({ status: "playing", players, cards, assignments })}
        me={players[1]}
        isHost={false}
        imageUrls={{}}
        refresh={refresh}
      />,
    );
    expect(screen.getByText("Vez de Jogador A")).toBeTruthy();
    expect(screen.queryByLabelText("Palpite")).toBeNull();
    expect(screen.queryByRole("button", { name: /Próximo/ })).toBeNull();
  });

  it("envia o palpite com a versão do turno e mostra o resultado", async () => {
    window.localStorage.setItem("qse:rules-seen", "1");
    const { client, calls } = fakeSupabase({ submit_guess: { correct: false, position: null, finished: false } });
    render(
      <GameBoard
        supabase={client}
        snapshot={snapshot({ status: "playing", players, cards, assignments, turn_mode: "guess" })}
        me={players[0]}
        isHost={false}
        imageUrls={{}}
        refresh={refresh}
      />,
    );
    fireEvent.change(screen.getByLabelText("Palpite"), { target: { value: "Alguém" } });
    fireEvent.click(screen.getByRole("button", { name: "Palpitar" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      fn: "submit_guess",
      args: { p_room_id: "room-1", p_turn_version: 3, p_guess: "Alguém" },
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Errou/));
  });
});

describe("Ranking", () => {
  it("ordena por posição e oferece nova rodada ao anfitrião", () => {
    const players = [
      player("a", { turn_order: 0, finished_position: 2 }),
      player("b", { turn_order: 1, finished_position: 1 }),
      player("c", { turn_order: 2, finished_position: 3 }),
    ];
    const { client } = fakeSupabase();
    render(
      <Ranking
        supabase={client}
        snapshot={snapshot({ status: "finished", players })}
        me={players[0]}
        isHost
        imageUrls={{}}
        refresh={refresh}
      />,
    );
    const items = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items[0]).toContain("Jogador B");
    expect(items[1]).toContain("Jogador A");
    expect(items[2]).toContain("Jogador C");
    expect(screen.getByRole("button", { name: "Jogar novamente" })).toBeTruthy();
  });
});
