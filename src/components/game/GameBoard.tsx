"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { restartGame } from "@/lib/game/api";
import { describeError } from "@/lib/game/errors";
import { activeQueue } from "@/lib/game/turns";
import type { GuessResult, Player, RoomSnapshot } from "@/lib/game/types";
import { ConfirmDialog } from "@/components/ui/Modal";
import { EventFeed } from "./EventFeed";
import { PlayerCardTile } from "./PlayerCardTile";
import { RulesModal } from "./RulesModal";
import { TurnControls } from "./TurnControls";
import { TurnSpotlight } from "./TurnSpotlight";

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
  const ordered = useMemo(() => {
    const list = [...players].sort((a, b) => (a.turn_order ?? 0) - (b.turn_order ?? 0));
    const curId = room.current_player_id;
    if (!curId) return list;
    const idx = list.findIndex((p) => p.id === curId);
    if (idx <= 0) return list;
    return [list[idx], ...list.slice(0, idx), ...list.slice(idx + 1)];
  }, [players, room.current_player_id]);

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

  const stillGuessing = queue.length;
  const alreadyWon = players.length - stillGuessing;

  return (
    <div className="flex flex-col gap-8 pb-10">
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

      {/* Acessibilidade / testes: mantém frase legível fora do hero visual */}
      <p className="sr-only" aria-live="polite">
        {isMyTurn ? "É a sua vez!" : current ? `Vez de ${current.nickname}` : "Aguardando"}
      </p>

      <TurnSpotlight
        current={current}
        isMyTurn={isMyTurn}
        turnMode={room.turn_mode}
        iFinished={iFinished}
        queue={queue}
        players={players}
        me={me}
      />

      {feedback && <Alert tone={feedback.tone}>{feedback.text}</Alert>}

      {isMyTurn && !iFinished && (
        <TurnControls supabase={supabase} room={room} onResult={handleResult} refresh={refresh} />
      )}

      {iFinished && (
        <Alert tone="success">
          Você já acertou e ficou em {me.finished_position}º lugar. Continue acompanhando os outros jogadores.
        </Alert>
      )}

      <section aria-label="Mesa — cartas na testa" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">Mesa</h2>
            <p className="text-sm text-muted">
              {stillGuessing} ainda adivinhando · {alreadyWon} já acertaram
            </p>
          </div>
          {!isMyTurn && current && !iFinished && (
            <p className="text-sm text-muted">
              Vez de <span className="font-semibold text-foreground">{current.nickname}</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:gap-5">
          {ordered.map((player) => {
            const isCurrent = player.id === room.current_player_id;
            return (
              <div
                key={player.id}
                className={`transition duration-300 ${isCurrent ? "col-span-2 sm:col-span-1 lg:scale-[1.03] lg:z-[1]" : "opacity-[0.88] sm:opacity-100"}`}
              >
                <PlayerCardTile
                  player={player}
                  card={cardForPlayer.get(player.id) ?? null}
                  imageUrl={(() => {
                    const card = cardForPlayer.get(player.id);
                    return card ? imageUrls[card.image_path] : undefined;
                  })()}
                  isMe={player.id === me.id}
                  isCurrent={isCurrent}
                  turnMode={isCurrent ? room.turn_mode : null}
                  size={isCurrent ? "featured" : "default"}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section aria-label="Atividade da partida" className="game-panel flex flex-col gap-3 rounded-2xl p-5 sm:p-6">
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-muted">O que aconteceu</h2>
        <EventFeed events={events} players={players} />
      </section>

      {isHost && (
        <section aria-label="Opções do anfitrião" className="game-panel flex flex-col gap-3 rounded-2xl p-5 sm:p-6">
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-muted">Anfitrião</h2>
          {hostError && <Alert tone="error">{hostError}</Alert>}
          <Button variant="danger" onClick={() => setConfirmRestart(true)} loading={restartPending}>
            Encerrar e voltar ao lobby
          </Button>
        </section>
      )}
    </div>
  );
}
