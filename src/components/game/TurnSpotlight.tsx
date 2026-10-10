"use client";

import type { Player, TurnMode } from "@/lib/game/types";

type TurnSpotlightProps = {
  current: Player | null;
  isMyTurn: boolean;
  turnMode: TurnMode | null;
  iFinished: boolean;
  queue: { id: string }[];
  players: Player[];
  me: Player;
};

function phaseLabel(
  current: Player | null,
  isMyTurn: boolean,
  turnMode: TurnMode | null,
  iFinished: boolean,
): { title: string; hint: string } {
  if (iFinished) {
    return {
      title: "Você já acertou",
      hint: "Acompanhe quem ainda está na mesa.",
    };
  }
  if (!current) {
    return { title: "Aguardando", hint: "A partida está sincronizando…" };
  }
  if (turnMode === null) {
    return isMyTurn
      ? { title: "Escolha sua jogada", hint: "Pergunta no Discord ou palpite direto — todos vão ver." }
      : {
          title: `${current.nickname} está decidindo`,
          hint: "Aguarde: pergunta ou palpite nesta vez.",
        };
  }
  if (turnMode === "question") {
    return isMyTurn
      ? { title: "Faça sua pergunta", hint: "Sim ou não no Discord. Depois toque em Próximo." }
      : {
          title: `${current.nickname} vai perguntar`,
          hint: "Responda no Discord. Palpite não vale nesta vez.",
        };
  }
  return isMyTurn
    ? { title: "Hora do palpite", hint: "Sem perguntas nesta vez — digite a resposta completa." }
    : {
        title: `${current.nickname} vai palpitar`,
        hint: "Sem perguntas nesta vez. Fique de olho na mesa.",
      };
}

export function TurnSpotlight({
  current,
  isMyTurn,
  turnMode,
  iFinished,
  queue,
  players,
  me,
}: TurnSpotlightProps) {
  const phase = phaseLabel(current, isMyTurn, turnMode, iFinished);
  const displayName = iFinished ? me.nickname : current?.nickname ?? "—";
  const upNext = queue.slice(1, 4).map((q) => players.find((p) => p.id === q.id)?.nickname).filter(Boolean);

  return (
    <section
      aria-labelledby="turn-spotlight-heading"
      className={`game-spotlight relative overflow-hidden rounded-3xl px-6 py-8 sm:px-10 sm:py-10 ${
        isMyTurn && !iFinished ? "game-spotlight--yours" : "game-spotlight--other"
      }`}
    >
      <div className="relative z-[1] flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3">
          <p id="turn-spotlight-heading" className="text-xs font-bold uppercase tracking-[0.35em] text-muted">
            {iFinished ? "Fora da fila" : isMyTurn ? "Sua vez" : "Agora joga"}
          </p>
          <p className="font-display text-4xl font-black leading-none tracking-tight sm:text-5xl md:text-6xl">
            {iFinished ? (
              displayName
            ) : isMyTurn ? (
              <>
                <span className="text-accent-strong">Você</span>
              </>
            ) : (
              displayName
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-background/50 px-3 py-1 text-sm font-semibold text-foreground backdrop-blur-sm">
              {phase.title}
            </span>
            {turnMode === "question" && (
              <span className="rounded-full border border-accent/40 bg-accent/15 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-accent-strong">
                Pergunta
              </span>
            )}
            {turnMode === "guess" && (
              <span className="rounded-full border border-amber-400/40 bg-amber-400/15 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-200">
                Palpite
              </span>
            )}
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-muted sm:text-base">{phase.hint}</p>
        </div>

        {!iFinished && queue.length > 0 && (
          <div className="flex shrink-0 flex-col gap-2 rounded-2xl border border-border/60 bg-background/30 px-4 py-3 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted">Ordem na mesa</p>
            <ol className="flex flex-wrap gap-2">
              {queue.map((entry, index) => {
                const player = players.find((p) => p.id === entry.id);
                if (!player) return null;
                const active = index === 0;
                return (
                  <li
                    key={entry.id}
                    className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm ${
                      active
                        ? "bg-accent/20 font-bold text-accent-strong ring-1 ring-accent/50"
                        : "bg-surface/80 text-foreground/90"
                    }`}
                  >
                    <span
                      className={`flex size-6 items-center justify-center rounded-full text-xs ${
                        active ? "bg-accent text-[#05210f]" : "bg-border text-muted"
                      }`}
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <span className="max-w-[8rem] truncate">
                      {player.nickname}
                      {player.id === me.id && " · você"}
                    </span>
                    {active && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-accent-strong">jogando</span>
                    )}
                  </li>
                );
              })}
            </ol>
            {upNext.length > 0 && (
              <p className="text-xs text-muted">
                Depois: {upNext.join(", ")}
                {queue.length > 4 ? "…" : ""}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
