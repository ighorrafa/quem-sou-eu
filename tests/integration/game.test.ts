import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { normalizeAnswer } from "@/lib/game/normalize";
import { asUser, createUser, type Db, expectError, fakeUpload, rpc, rpcScalar, startDatabase } from "./harness";

let db: Db;

beforeAll(async () => {
  db = await startDatabase();
}, 180_000);

afterAll(async () => {
  await db?.stop();
});

type Seeded = {
  roomId: string;
  code: string;
  users: string[];
  players: { id: string; user_id: string }[];
};

/** Cria sala com N jogadores, todos com carta e prontos (sem iniciar). */
async function seedRoom(n: number, titles?: string[]): Promise<Seeded> {
  const users: string[] = [];
  for (let i = 0; i < n; i++) users.push(await createUser(db.admin));

  const [created] = await rpc<{ room_id: string; code: string }>(db.admin, users[0], "create_room", {
    p_nickname: "Host",
  });
  for (let i = 1; i < n; i++) {
    await rpcScalar(db.admin, users[i], "join_room", { p_code: created.code, p_nickname: `Jogador ${i}` });
  }

  const players = (
    await db.admin.query("select id, user_id from public.players where room_id = $1 order by joined_at", [
      created.room_id,
    ])
  ).rows as { id: string; user_id: string }[];

  for (let i = 0; i < n; i++) {
    const path = `${created.room_id}/${users[i]}/card.jpg`;
    await fakeUpload(db.admin, path);
    await rpcScalar(db.admin, users[i], "upsert_card", {
      p_room_id: created.room_id,
      p_title: titles?.[i] ?? `Resposta ${i}`,
      p_image_path: path,
    });
    await rpcScalar(db.admin, users[i], "set_ready", { p_room_id: created.room_id, p_ready: true });
  }

  return { roomId: created.room_id, code: created.code, users, players };
}

async function roomRow(roomId: string) {
  return (await db.admin.query("select * from public.rooms where id = $1", [roomId])).rows[0];
}

async function currentUser(roomId: string): Promise<{ userId: string; playerId: string; version: number }> {
  const room = await roomRow(roomId);
  const player = (await db.admin.query("select id, user_id from public.players where id = $1", [room.current_player_id]))
    .rows[0];
  return { userId: player.user_id, playerId: player.id, version: room.turn_version };
}

describe("normalize_answer (SQL) espelha normalizeAnswer (TS)", () => {
  it("produz o mesmo resultado para entradas variadas", async () => {
    const samples = ["Albert Einstein", "  SÃO   PAULO! ", "Pokémon: Go", "Spider-Man", "Copa de 2002", "Ñandú açaí"];
    for (const sample of samples) {
      const { rows } = await db.admin.query("select public.normalize_answer($1) as v", [sample]);
      expect(rows[0].v).toBe(normalizeAnswer(sample));
    }
    const empty = await db.admin.query("select public.normalize_answer($1) as v", ["!!! ..."]);
    expect(empty.rows[0].v).toBeNull();
  });
});

describe("lobby", () => {
  it("cria sala com código válido e o criador como anfitrião", async () => {
    const user = await createUser(db.admin);
    const [created] = await rpc<{ room_id: string; code: string }>(db.admin, user, "create_room", {
      p_nickname: "  Ana  ",
    });
    expect(created.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const room = await roomRow(created.room_id);
    expect(room.host_id).toBe(user);
    expect(room.status).toBe("lobby");
    const player = (await db.admin.query("select nickname from public.players where room_id = $1", [created.room_id]))
      .rows[0];
    expect(player.nickname).toBe("Ana");
  });

  it("não deixa marcar pronto sem carta nem usar imagem de outro usuário", async () => {
    const seeded = await seedRoom(2);
    const stranger = await createUser(db.admin);
    const joined = await rpcScalar(db.admin, stranger, "join_room", { p_code: seeded.code, p_nickname: "Novo" });
    expect(joined).toBe(seeded.roomId);

    await expectError(rpcScalar(db.admin, stranger, "set_ready", { p_room_id: seeded.roomId, p_ready: true }), "card_required");

    const foreignPath = `${seeded.roomId}/${seeded.users[0]}/card.jpg`;
    await expectError(
      rpcScalar(db.admin, stranger, "upsert_card", { p_room_id: seeded.roomId, p_title: "X", p_image_path: foreignPath }),
      "invalid_image_path",
    );
    await expectError(
      rpcScalar(db.admin, stranger, "upsert_card", {
        p_room_id: seeded.roomId,
        p_title: "X",
        p_image_path: `${seeded.roomId}/${stranger}/missing.jpg`,
      }),
      "image_not_uploaded",
    );
    await expectError(
      rpcScalar(db.admin, stranger, "upsert_card", {
        p_room_id: seeded.roomId,
        p_title: "!!!",
        p_image_path: foreignPath,
      }),
      "invalid_title",
    );
  });

  it("esconde a sala de quem não é membro e limita a 12 jogadores", async () => {
    const seeded = await seedRoom(2);
    const outsider = await createUser(db.admin);
    const visible = await asUser(db.admin, outsider, async (c) =>
      (await c.query("select id from public.rooms where id = $1", [seeded.roomId])).rows,
    );
    expect(visible).toHaveLength(0);
    const players = await asUser(db.admin, outsider, async (c) =>
      (await c.query("select id from public.players where room_id = $1", [seeded.roomId])).rows,
    );
    expect(players).toHaveLength(0);

    for (let i = 2; i < 12; i++) {
      const u = await createUser(db.admin);
      await rpcScalar(db.admin, u, "join_room", { p_code: seeded.code, p_nickname: `P${i}` });
    }
    const extra = await createUser(db.admin);
    await expectError(rpcScalar(db.admin, extra, "join_room", { p_code: seeded.code, p_nickname: "Extra" }), "room_full");
  });

  it("só o anfitrião inicia, e só com todos prontos", async () => {
    const seeded = await seedRoom(3);
    await expectError(rpcScalar(db.admin, seeded.users[1], "start_game", { p_room_id: seeded.roomId }), "not_host");

    await rpcScalar(db.admin, seeded.users[2], "set_ready", { p_room_id: seeded.roomId, p_ready: false });
    await expectError(rpcScalar(db.admin, seeded.users[0], "start_game", { p_room_id: seeded.roomId }), "players_not_ready");

    await expectError(
      rpcScalar(db.admin, seeded.users[1], "kick_player", { p_room_id: seeded.roomId, p_player_id: seeded.players[2].id }),
      "not_host",
    );
    await rpcScalar(db.admin, seeded.users[0], "kick_player", { p_room_id: seeded.roomId, p_player_id: seeded.players[2].id });
    const remaining = await db.admin.query("select count(*)::int as n from public.players where room_id = $1", [seeded.roomId]);
    expect(remaining.rows[0].n).toBe(2);
  });

  it("transfere o anfitrião quando ele sai e apaga a sala quando fica vazia", async () => {
    const seeded = await seedRoom(2);
    await rpcScalar(db.admin, seeded.users[0], "leave_room", { p_room_id: seeded.roomId });
    expect((await roomRow(seeded.roomId)).host_id).toBe(seeded.users[1]);
    await rpcScalar(db.admin, seeded.users[1], "leave_room", { p_room_id: seeded.roomId });
    expect(await roomRow(seeded.roomId)).toBeUndefined();
  });
});

describe("partida", () => {
  it("distribui as cartas sem autoatribuição e esconde a carta de cada jogador", async () => {
    const seeded = await seedRoom(5);
    await rpcScalar(db.admin, seeded.users[0], "start_game", { p_room_id: seeded.roomId });

    const room = await roomRow(seeded.roomId);
    expect(room.status).toBe("playing");
    expect(room.turn_version).toBe(1);

    const assignments = (
      await db.admin.query(
        `select a.player_id, c.owner_player_id, c.id as card_id, c.image_path
         from public.assignments a join public.cards c on c.id = a.card_id where a.room_id = $1`,
        [seeded.roomId],
      )
    ).rows as { player_id: string; owner_player_id: string; card_id: string; image_path: string }[];
    expect(assignments).toHaveLength(5);
    expect(new Set(assignments.map((a) => a.card_id)).size).toBe(5);
    for (const a of assignments) expect(a.owner_player_id).not.toBe(a.player_id);

    const orders = (await db.admin.query("select turn_order from public.players where room_id = $1 order by turn_order", [seeded.roomId]))
      .rows.map((r) => r.turn_order);
    expect(orders).toEqual([0, 1, 2, 3, 4]);

    for (const player of seeded.players) {
      const mine = assignments.find((a) => a.player_id === player.id)!;
      const visibleCards = await asUser(db.admin, player.user_id, async (c) =>
        (await c.query("select id, image_path from public.cards where room_id = $1", [seeded.roomId])).rows,
      );
      expect(visibleCards).toHaveLength(4);
      expect(visibleCards.map((c) => c.id)).not.toContain(mine.card_id);

      const visibleImages = await asUser(db.admin, player.user_id, async (c) =>
        (await c.query("select name from storage.objects where bucket_id = 'cards' and name like $1", [`${seeded.roomId}/%`])).rows,
      );
      const names = visibleImages.map((o) => o.name);
      expect(names).not.toContain(mine.image_path);
      expect(names).toContain(`${seeded.roomId}/${player.user_id}/card.jpg`);

      // A atribuição em si é pública (só ids); o conteúdo é que fica oculto.
      const myAssignment = await asUser(db.admin, player.user_id, async (c) =>
        (await c.query("select card_id from public.assignments where room_id = $1 and player_id = $2", [seeded.roomId, player.id])).rows,
      );
      expect(myAssignment).toHaveLength(1);
    }

    // Ninguém mais entra com a partida em andamento.
    const late = await createUser(db.admin);
    await expectError(rpcScalar(db.admin, late, "join_room", { p_code: seeded.code, p_nickname: "Atrasado" }), "room_not_in_lobby");
  });

  it("segue a fila: passar, errar (avança sozinho), acertar (sai da fila) e encerra com ranking", async () => {
    const titles = ["Alpha", "Bravo", "Charlie"];
    const seeded = await seedRoom(3, titles);
    await rpcScalar(db.admin, seeded.users[0], "start_game", { p_room_id: seeded.roomId });

    const answerFor = async (playerId: string) =>
      (
        await db.admin.query(
          "select c.title from public.assignments a join public.cards c on c.id = a.card_id where a.player_id = $1",
          [playerId],
        )
      ).rows[0].title as string;

    // 1) Jogador da vez faz pergunta e passa.
    let turn = await currentUser(seeded.roomId);
    const first = turn.playerId;
    await expectError(
      rpcScalar(db.admin, seeded.users.find((u) => u !== turn.userId)!, "advance_turn", { p_room_id: seeded.roomId, p_turn_version: turn.version }),
      "not_your_turn",
    );
    await rpcScalar(db.admin, turn.userId, "advance_turn", { p_room_id: seeded.roomId, p_turn_version: turn.version });
    let room = await roomRow(seeded.roomId);
    expect(room.turn_version).toBe(2);
    expect(room.current_player_id).not.toBe(first);

    // Versão antiga é rejeitada.
    turn = await currentUser(seeded.roomId);
    await expectError(
      rpcScalar(db.admin, turn.userId, "advance_turn", { p_room_id: seeded.roomId, p_turn_version: 1 }),
      "stale_turn",
    );

    // 2) Palpite errado avança automaticamente.
    const wrongGuesser = turn.playerId;
    const wrong = await rpcScalar<{ correct: boolean }>(db.admin, turn.userId, "submit_guess", {
      p_room_id: seeded.roomId,
      p_turn_version: turn.version,
      p_guess: "resposta errada",
    });
    expect(wrong.correct).toBe(false);
    room = await roomRow(seeded.roomId);
    expect(room.turn_version).toBe(3);
    expect(room.current_player_id).not.toBe(wrongGuesser);
    const wrongEvents = await db.admin.query(
      "select guess from public.turn_events where room_id = $1 and kind = 'guess_wrong'",
      [seeded.roomId],
    );
    expect(wrongEvents.rows.map((r) => r.guess)).toEqual(["resposta errada"]);

    // 3) Palpite certo (ignorando caixa/acentos/espaços) tira o jogador da fila.
    turn = await currentUser(seeded.roomId);
    const winnerId = turn.playerId;
    const answer = await answerFor(winnerId);
    const right = await rpcScalar<{ correct: boolean; position: number; finished: boolean }>(db.admin, turn.userId, "submit_guess", {
      p_room_id: seeded.roomId,
      p_turn_version: turn.version,
      p_guess: `  ${answer.toUpperCase()}! `,
    });
    expect(right).toMatchObject({ correct: true, position: 1, finished: false });

    const winner = (await db.admin.query("select finished_position from public.players where id = $1", [winnerId])).rows[0];
    expect(winner.finished_position).toBe(1);
    room = await roomRow(seeded.roomId);
    expect(room.status).toBe("playing");
    expect(room.current_player_id).not.toBe(winnerId);

    // Quem acertou passa a ver a própria carta; quem não acertou ainda não.
    const winnerUser = seeded.players.find((p) => p.id === winnerId)!.user_id;
    const winnerCards = await asUser(db.admin, winnerUser, async (c) =>
      (await c.query("select id from public.cards where room_id = $1", [seeded.roomId])).rows,
    );
    expect(winnerCards).toHaveLength(3);

    // Jogador fora da fila não joga mais.
    await expectError(
      rpcScalar(db.admin, winnerUser, "advance_turn", { p_room_id: seeded.roomId, p_turn_version: room.turn_version }),
      "not_your_turn",
    );

    // 4) A fila alterna só entre os dois restantes.
    turn = await currentUser(seeded.roomId);
    const a = turn.playerId;
    await rpcScalar(db.admin, turn.userId, "advance_turn", { p_room_id: seeded.roomId, p_turn_version: turn.version });
    turn = await currentUser(seeded.roomId);
    const b = turn.playerId;
    expect(b).not.toBe(a);
    expect(b).not.toBe(winnerId);
    await rpcScalar(db.admin, turn.userId, "advance_turn", { p_room_id: seeded.roomId, p_turn_version: turn.version });
    turn = await currentUser(seeded.roomId);
    expect(turn.playerId).toBe(a);

    // 5) Segundo acerto: o último restante fecha o ranking e a partida termina.
    const secondAnswer = await answerFor(turn.playerId);
    const final = await rpcScalar<{ correct: boolean; position: number; finished: boolean }>(db.admin, turn.userId, "submit_guess", {
      p_room_id: seeded.roomId,
      p_turn_version: turn.version,
      p_guess: secondAnswer,
    });
    expect(final).toMatchObject({ correct: true, position: 2, finished: true });

    room = await roomRow(seeded.roomId);
    expect(room.status).toBe("finished");
    expect(room.current_player_id).toBeNull();

    const ranking = (
      await db.admin.query("select id, finished_position from public.players where room_id = $1 order by finished_position", [seeded.roomId])
    ).rows;
    expect(ranking.map((r) => r.finished_position)).toEqual([1, 2, 3]);
    expect(ranking[0].id).toBe(winnerId);
    expect(ranking[1].id).toBe(a);
    expect(ranking[2].id).toBe(b);

    // Com a partida encerrada, todos veem todas as cartas.
    for (const player of seeded.players) {
      const cards = await asUser(db.admin, player.user_id, async (c) =>
        (await c.query("select id from public.cards where room_id = $1", [seeded.roomId])).rows,
      );
      expect(cards).toHaveLength(3);
    }

    const kinds = (await db.admin.query("select kind from public.turn_events where room_id = $1 order by id", [seeded.roomId])).rows.map(
      (r) => r.kind,
    );
    expect(kinds).toEqual(["start", "pass", "guess_wrong", "guess_right", "pass", "pass", "guess_right", "finish"]);

    // 6) Reinício: volta ao lobby, descarta cartas e desmarca prontos.
    await expectError(rpcScalar(db.admin, seeded.users[1], "restart_game", { p_room_id: seeded.roomId }), "not_host");
    await rpcScalar(db.admin, seeded.users[0], "restart_game", { p_room_id: seeded.roomId });
    room = await roomRow(seeded.roomId);
    expect(room.status).toBe("lobby");
    expect(room.round).toBe(2);
    expect(room.turn_version).toBe(0);
    const cardsLeft = await db.admin.query("select count(*)::int as n from public.cards where room_id = $1", [seeded.roomId]);
    expect(cardsLeft.rows[0].n).toBe(0);
    const readyLeft = await db.admin.query(
      "select count(*)::int as n from public.players where room_id = $1 and (is_ready or finished_position is not null)",
      [seeded.roomId],
    );
    expect(readyLeft.rows[0].n).toBe(0);
  });

  it("não permite palpite vazio e nunca revela a resposta no retorno", async () => {
    const seeded = await seedRoom(2, ["Segredo Um", "Segredo Dois"]);
    await rpcScalar(db.admin, seeded.users[0], "start_game", { p_room_id: seeded.roomId });
    const turn = await currentUser(seeded.roomId);
    await expectError(
      rpcScalar(db.admin, turn.userId, "submit_guess", { p_room_id: seeded.roomId, p_turn_version: turn.version, p_guess: "..." }),
      "invalid_guess",
    );
    const result = await rpcScalar<Record<string, unknown>>(db.admin, turn.userId, "submit_guess", {
      p_room_id: seeded.roomId,
      p_turn_version: turn.version,
      p_guess: "palpite qualquer",
    });
    expect(JSON.stringify(result)).not.toMatch(/segredo/i);
  });
});

describe("concorrência", () => {
  async function race(seeded: Seeded, actions: ((c: Client, userId: string, version: number) => Promise<unknown>)[]) {
    const turn = await currentUser(seeded.roomId);
    const clients = await Promise.all(actions.map(() => db.connect()));
    const results = await Promise.allSettled(actions.map((action, i) => action(clients[i], turn.userId, turn.version)));
    for (const c of clients) await c.end();
    return { results, versionBefore: turn.version };
  }

  it("dois cliques em Próximo avançam a vez uma única vez", async () => {
    const seeded = await seedRoom(3);
    await rpcScalar(db.admin, seeded.users[0], "start_game", { p_room_id: seeded.roomId });

    const { results, versionBefore } = await race(seeded, [
      (c, u, v) => rpcScalar(c, u, "advance_turn", { p_room_id: seeded.roomId, p_turn_version: v }),
      (c, u, v) => rpcScalar(c, u, "advance_turn", { p_room_id: seeded.roomId, p_turn_version: v }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason)).toMatch(/stale_turn|not_your_turn/);

    const room = await roomRow(seeded.roomId);
    expect(room.turn_version).toBe(versionBefore + 1);
    const passes = await db.admin.query("select count(*)::int as n from public.turn_events where room_id = $1 and kind = 'pass'", [seeded.roomId]);
    expect(passes.rows[0].n).toBe(1);
  });

  it("palpite e Próximo simultâneos: apenas uma ação vale", async () => {
    const seeded = await seedRoom(3);
    await rpcScalar(db.admin, seeded.users[0], "start_game", { p_room_id: seeded.roomId });

    const { results, versionBefore } = await race(seeded, [
      (c, u, v) => rpcScalar(c, u, "submit_guess", { p_room_id: seeded.roomId, p_turn_version: v, p_guess: "chute" }),
      (c, u, v) => rpcScalar(c, u, "advance_turn", { p_room_id: seeded.roomId, p_turn_version: v }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const room = await roomRow(seeded.roomId);
    expect(room.turn_version).toBe(versionBefore + 1);
    const events = await db.admin.query(
      "select count(*)::int as n from public.turn_events where room_id = $1 and kind in ('pass', 'guess_wrong')",
      [seeded.roomId],
    );
    expect(events.rows[0].n).toBe(1);
  });

  it("segundo palpite no mesmo turno é rejeitado", async () => {
    const seeded = await seedRoom(3);
    await rpcScalar(db.admin, seeded.users[0], "start_game", { p_room_id: seeded.roomId });
    const turn = await currentUser(seeded.roomId);
    await rpcScalar(db.admin, turn.userId, "submit_guess", { p_room_id: seeded.roomId, p_turn_version: turn.version, p_guess: "um" });
    await expectError(
      rpcScalar(db.admin, turn.userId, "submit_guess", { p_room_id: seeded.roomId, p_turn_version: turn.version, p_guess: "dois" }),
      "not_your_turn",
    );
  });
});
