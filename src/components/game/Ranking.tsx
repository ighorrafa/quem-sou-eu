"use client";

import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { restartGame } from "@/lib/game/api";
import { describeError } from "@/lib/game/errors";
import { rankPlayers } from "@/lib/game/turns";
import type { Player, RoomSnapshot } from "@/lib/game/types";
import { EventFeed } from "./EventFeed";

type RankingProps = {
  supabase: SupabaseClient;
  snapshot: RoomSnapshot;
  me: Player;
  isHost: boolean;
  imageUrls: Record<string, string>;
  refresh: () => Promise<void>;
};

const MEDALS = ["1º", "2º", "3º"];

export function Ranking({ supabase, snapshot, me, isHost, imageUrls, refresh }: RankingProps) {
  const { room, players, cards, assignments, events } = snapshot;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ranked = useMemo(() => rankPlayers(players), [players]);
  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const cardForPlayer = useMemo(() => {
    const map = new Map<string, (typeof cards)[number] | undefined>();
    for (const a of assignments) map.set(a.player_id, cardsById.get(a.card_id));
    return map;
  }, [assignments, cardsById]);

  async function handleRestart() {
    setPending(true);
    setError(null);
    try {
      await restartGame(supabase, room.id);
      await refresh();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
      <Card className="flex flex-col gap-5">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Fim de jogo</p>
          <h2 className="text-2xl font-bold">Ranking da rodada {room.round}</h2>
        </div>
        <ol className="flex flex-col gap-3">
          {ranked.map((player, index) => {
            const card = cardForPlayer.get(player.id);
            const url = card ? imageUrls[card.image_path] : undefined;
            return (
              <li
                key={player.id}
                className={`flex items-center gap-4 rounded-2xl border px-4 py-3 ${
                  index === 0 ? "border-accent bg-accent/10" : "border-border bg-background/30"
                }`}
              >
                <span className="w-10 text-center text-lg font-bold">
                  {MEDALS[index] ?? `${player.finished_position ?? index + 1}º`}
                </span>
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={card ? `Carta: ${card.title}` : ""} className="size-14 rounded-xl object-cover" />
                ) : (
                  <div className="size-14 rounded-xl bg-surface-strong" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {player.nickname}
                    {player.id === me.id && <span className="ml-1 text-xs font-normal text-muted">(você)</span>}
                  </p>
                  <p className="truncate text-sm text-muted">{card ? `Era: ${card.title}` : "Carta indisponível"}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Próxima rodada</h2>
          {isHost ? (
            <>
              <p className="text-sm text-muted">Todos voltam ao lobby e enviam novas cartas.</p>
              {error && <Alert tone="error">{error}</Alert>}
              <Button size="lg" onClick={() => void handleRestart()} loading={pending}>
                Jogar novamente
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted">O anfitrião pode iniciar uma nova rodada. Fique nesta página.</p>
          )}
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Jogadas</h2>
          <EventFeed events={events} players={players} />
        </Card>
      </div>
    </div>
  );
}
