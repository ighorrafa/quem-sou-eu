"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { restartGame } from "@/lib/game/api";
import { describeError } from "@/lib/game/errors";
import { activeQueue } from "@/lib/game/turns";
import type { GuessResult, Player, RoomSnapshot } from "@/lib/game/types";
import { ConfirmDialog } from "@/components/ui/Modal";
import { EventFeed } from "./EventFeed";
import { PlayerCardTile } from "./PlayerCardTile";
import { RulesModal } from "./RulesModal";
import { TurnControls } from "./TurnControls";

type GameBoardProps = {
  supabase: SupabaseClient;
  snapshot: RoomSnapshot;
  me: Player;
  isHost: boolean;
  imageUrls: Record<string, string>;
  refresh: () => Promise<void>;
};

export function GameBoard({ supabase, snapshot, me, isHost, imageUrls, refresh }: GameBoardProps) {
  const { room, players, cards, assignments, events } = snapshot;
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [hostError, setHostError] = useState<string | null>(null);
  const [restartPending, setRestartPending] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const cardForPlayer = useMemo(() => {
    const map = new Map<string, (typeof cards)[number] | null>();
    for (const a of assignments) map.set(a.player_id, cardsById.get(a.card_id) ?? null);
    return map;
  }, [assignments, cardsById]);

  const current = players.find((p) => p.id === room.current_player_id) ?? null;
  const isMyTurn = current?.id === me.id;
  const iFinished = me.finished_position !== null;
  const queue = activeQueue(players, room.current_player_id);
  const ordered = [...players].sort((a, b) => (a.turn_order ?? 0) - (b.turn_order ?? 0));

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(timer);
  }, [feedback]);

  function handleResult(result: GuessResult | null) {
    if (!result) {
      setFeedback({ tone: "success", text: "Vez passada." });
      return;
    }
    if (result.correct) {
      setFeedback({ tone: "success", text: `Acertou! Você ficou em ${result.position}º lugar.` });
    } else {
      setFeedback({ tone: "error", text: "Errou. A vez passou para o próximo jogador." });
    }
  }

  async function handleRestart() {
    setRestartPending(true);
    setHostError(null);
    try {
      await restartGame(supabase, room.id);
      setConfirmRestart(false);
      await refresh();
    } catch (err) {
      setHostError(describeError(err));
      setConfirmRestart(false);
    } finally {
      setRestartPending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
      <RulesModal round={room.round} />
      <ConfirmDialog
        open={confirmRestart}
        title="Encerrar a partida?"
        description="Todos voltam para o lobby e as cartas desta rodada são descartadas."
        confirmLabel="Encerrar e voltar ao lobby"
        danger
        loading={restartPending}
        onConfirm={() => void handleRestart()}
        onCancel={() => setConfirmRestart(false)}
      />
      <div className="flex flex-col gap-5">
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Agora</p>
            <p className="text-2xl font-bold">
              {isMyTurn ? "É a sua vez!" : current ? `Vez de ${current.nickname}` : "Aguardando..."}
            </p>
          </div>
          <div className="text-right text-sm text-muted">
            <p>{queue.length} ainda adivinhando</p>
            <p>{players.length - queue.length} já acertaram</p>
          </div>
        </Card>

        {feedback && <Alert tone={feedback.tone}>{feedback.text}</Alert>}

        {isMyTurn && !iFinished && (
          <TurnControls supabase={supabase} room={room} onResult={handleResult} refresh={refresh} />
        )}

        {iFinished && (
          <Alert tone="success">
            Você já acertou e ficou em {me.finished_position}º lugar. Continue acompanhando os outros jogadores.
          </Alert>
        )}

        <section aria-label="Cartas dos jogadores" className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {ordered.map((player) => (
            <PlayerCardTile
              key={player.id}
              player={player}
              card={cardForPlayer.get(player.id) ?? null}
              imageUrl={(() => {
                const card = cardForPlayer.get(player.id);
                return card ? imageUrls[card.image_path] : undefined;
              })()}
              isMe={player.id === me.id}
              isCurrent={player.id === room.current_player_id}
            />
          ))}
        </section>
      </div>

      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Fila</h2>
          <ol className="flex flex-col gap-1.5 text-sm">
            {queue.map((p, index) => {
              const player = players.find((x) => x.id === p.id);
              if (!player) return null;
              return (
                <li
                  key={p.id}
                  className={`flex items-center justify-between rounded-lg px-3 py-1.5 ${
                    index === 0 ? "bg-accent/15 font-semibold text-accent-strong" : "bg-background/40"
                  }`}
                >
                  <span className="truncate">
                    {index + 1}. {player.nickname}
                    {player.id === me.id && " (você)"}
                  </span>
                  {index === 0 && <span className="text-xs">jogando</span>}
                </li>
              );
            })}
          </ol>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Jogadas</h2>
          <EventFeed events={events} players={players} />
        </Card>

        {isHost && (
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Anfitrião</h2>
            {hostError && <Alert tone="error">{hostError}</Alert>}
            <Button variant="danger" onClick={() => setConfirmRestart(true)} loading={restartPending}>
              Encerrar e voltar ao lobby
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
