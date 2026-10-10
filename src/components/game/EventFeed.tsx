"use client";

import type { Player, TurnEvent } from "@/lib/game/types";

function describe(event: TurnEvent, byId: Map<string, Player>): string | null {
  const name = event.player_id ? (byId.get(event.player_id)?.nickname ?? "Alguém") : null;
  switch (event.kind) {
    case "start":
      return `A partida começou. ${name ?? "Alguém"} joga primeiro.`;
    case "mode_question":
      return `${name} escolheu fazer uma pergunta nesta vez.`;
    case "mode_guess":
      return `${name} escolheu palpitar (sem perguntas nesta vez).`;
    case "pass":
      return `${name} fez uma pergunta e passou a vez.`;
    case "guess_wrong":
      return `${name} chutou "${event.guess}" e errou.`;
    case "guess_right":
      return `${name} acertou: "${event.guess}".`;
    case "finish":
      return "Fim de jogo. Confira o ranking.";
    case "restart":
      return "O anfitrião voltou a sala para o lobby.";
    default:
      return null;
  }
}

export function EventFeed({ events, players }: { events: TurnEvent[]; players: Player[] }) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const items = events
    .map((event) => ({ id: event.id, text: describe(event, byId), kind: event.kind }))
    .filter((item): item is { id: number; text: string; kind: TurnEvent["kind"] } => item.text !== null)
    .reverse();

  if (items.length === 0) {
    return <p className="text-sm text-muted">Nenhuma jogada ainda.</p>;
  }

  return (
    <ol className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1 text-sm" aria-live="polite">
      {items.map((item) => (
        <li
          key={item.id}
          className={`border-l-2 py-1 pl-3 ${
            item.kind === "guess_right"
              ? "border-success text-success"
              : item.kind === "guess_wrong"
                ? "border-danger/70 text-foreground"
                : item.kind === "mode_guess" || item.kind === "mode_question"
                  ? "border-accent text-accent-strong"
                  : "border-border text-muted"
          }`}
        >
          {item.text}
        </li>
      ))}
    </ol>
  );
}
