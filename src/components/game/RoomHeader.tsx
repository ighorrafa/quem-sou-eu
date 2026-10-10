"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { Room } from "@/lib/game/types";
import type { ConnectionStatus } from "@/lib/hooks/useRoom";

const STATUS_LABEL: Record<Room["status"], string> = {
  lobby: "Lobby",
  playing: "Em jogo",
  finished: "Fim",
};

const CONNECTION_LABEL: Record<ConnectionStatus, { text: string; dot: string }> = {
  connecting: { text: "Conectando", dot: "bg-muted" },
  live: { text: "Ao vivo", dot: "bg-success" },
  polling: { text: "A cada 15s", dot: "bg-accent" },
  offline: { text: "Offline", dot: "bg-danger" },
};

export function RoomHeader({
  room,
  connection,
  playerCount,
}: {
  room: Room;
  connection: ConnectionStatus;
  playerCount: number;
}) {
  const [copied, setCopied] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyLink() {
    const url = `${window.location.origin}/sala/${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setFallbackUrl(null);
    } catch {
      setFallbackUrl(url);
    }
  }

  const conn = CONNECTION_LABEL[connection];
  const inGame = room.status === "playing";

  return (
    <header className="flex flex-col gap-3 border-b border-border/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/" className="font-display text-lg font-bold tracking-tight hover:text-accent-strong">
          Quem Sou Eu?
        </Link>
        <span className="font-mono text-xl font-bold tracking-[0.2em] text-foreground sm:text-2xl">{room.code}</span>
        <Button size="sm" variant="secondary" onClick={() => void copyLink()}>
          {copied ? "Copiado!" : "Convidar"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
        <span
          className={`rounded-full px-2.5 py-1 font-semibold ${
            inGame ? "bg-accent/15 text-accent-strong" : "bg-surface-strong text-muted"
          }`}
        >
          {STATUS_LABEL[room.status]}
        </span>
        <span className="text-muted">
          Rod. {room.round} · {playerCount} jogadores
        </span>
        <span className="flex items-center gap-1.5 text-muted" title={conn.text}>
          <span className={`size-1.5 rounded-full ${conn.dot}`} />
          {conn.text}
        </span>
      </div>
      {fallbackUrl && (
        <input
          readOnly
          value={fallbackUrl}
          aria-label="Link da sala"
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-xs text-foreground"
        />
      )}
    </header>
  );
}
