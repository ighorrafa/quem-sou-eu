"use client";

import type { Card as CardType, Player } from "@/lib/game/types";

type PlayerCardTileProps = {
  player: Player;
  card: CardType | null;
  imageUrl: string | undefined;
  isMe: boolean;
  isCurrent: boolean;
};

/**
 * Carta na "testa" de um jogador. A carta do próprio usuário chega como null
 * (o banco não a entrega) e aparece oculta até ele acertar.
 */
export function PlayerCardTile({ player, card, imageUrl, isMe, isCurrent }: PlayerCardTileProps) {
  const finished = player.finished_position !== null;
  const hidden = isMe && !card;

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border bg-surface transition ${
        isCurrent ? "turn-pulse border-accent" : "border-border"
      } ${finished ? "opacity-70" : ""}`}
      aria-label={`Carta de ${player.nickname}`}
    >
      <div className="relative aspect-square bg-background/60">
        {hidden ? (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-muted">
            <span className="text-5xl font-black text-accent">?</span>
            <span className="text-xs uppercase tracking-widest">sua carta</span>
          </div>
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={card ? `Carta: ${card.title}` : "Carta"} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-muted">
            <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          </div>
        )}
        {isCurrent && (
          <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-[#05210f]">
            vez
          </span>
        )}
        {finished && (
          <span className="absolute right-2 top-2 rounded-full bg-success px-2 py-0.5 text-xs font-bold text-[#032b12]">
            #{player.finished_position}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-3 py-2">
        <p className="truncate text-sm font-semibold">
          {player.nickname}
          {isMe && <span className="ml-1 text-xs font-normal text-muted">(você)</span>}
        </p>
        <p className="truncate text-xs text-muted">{hidden ? "Só os outros veem a resposta" : (card?.title ?? "...")}</p>
      </div>
    </article>
  );
}
