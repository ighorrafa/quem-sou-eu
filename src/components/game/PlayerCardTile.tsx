"use client";

import type { Card as CardType, Player, TurnMode } from "@/lib/game/types";

type PlayerCardTileProps = {
  player: Player;
  card: CardType | null;
  imageUrl: string | undefined;
  isMe: boolean;
  isCurrent: boolean;
  turnMode?: TurnMode | null;
  size?: "default" | "featured";
};

/**
 * Carta na "testa" de um jogador. A carta do próprio usuário chega como null
 * (o banco não a entrega) e aparece oculta até ele acertar.
 */
export function PlayerCardTile({
  player,
  card,
  imageUrl,
  isMe,
  isCurrent,
  turnMode = null,
  size = "default",
}: PlayerCardTileProps) {
  const finished = player.finished_position !== null;
  const hidden = isMe && !card;
  const featured = size === "featured" && isCurrent;

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border bg-surface transition-all duration-300 ${
        isCurrent
          ? "turn-pulse border-accent shadow-lg shadow-accent/10 ring-2 ring-accent/30"
          : "border-border/80"
      } ${finished ? "opacity-65 grayscale-[0.35]" : ""} ${featured ? "rounded-3xl" : ""}`}
      aria-label={`Carta de ${player.nickname}${isCurrent ? ", jogando agora" : ""}`}
    >
      <div className={`relative bg-background/60 ${featured ? "aspect-[4/5]" : "aspect-square"}`}>
        {hidden ? (
          <div className="flex size-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-surface-strong to-background text-muted">
            <span className={`font-black text-accent ${featured ? "text-7xl" : "text-5xl"}`}>?</span>
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
          <span
            className={`absolute left-2 top-2 rounded-full bg-accent font-bold text-[#05210f] shadow-md ${
              featured ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"
            }`}
          >
            Jogando
          </span>
        )}
        {isCurrent && turnMode === "question" && (
          <span className="absolute bottom-2 right-2 rounded-lg bg-background/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-strong backdrop-blur-sm">
            Pergunta
          </span>
        )}
        {isCurrent && turnMode === "guess" && (
          <span className="absolute bottom-2 right-2 rounded-lg bg-amber-400/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#3d2a00] backdrop-blur-sm">
            Palpite
          </span>
        )}
        {finished && (
          <span className="absolute right-2 top-2 rounded-full bg-success px-2 py-0.5 text-xs font-bold text-[#032b12]">
            #{player.finished_position}
          </span>
        )}
      </div>
      <div className={`flex flex-col gap-0.5 ${featured ? "px-4 py-3" : "px-3 py-2"}`}>
        <p className={`truncate font-semibold ${featured ? "text-base" : "text-sm"}`}>
          {player.nickname}
          {isMe && <span className="ml-1 text-xs font-normal text-muted">(você)</span>}
        </p>
        <p className="truncate text-xs text-muted">{hidden ? "Só os outros veem a resposta" : (card?.title ?? "...")}</p>
      </div>
    </article>
  );
}
