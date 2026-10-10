"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { Room } from "@/lib/game/types";
import type { ConnectionStatus } from "@/lib/hooks/useRoom";

const STATUS_LABEL: Record<Room["status"], string> = {
  lobby: "Lobby",
  playing: "Em jogo",
  finished: "Encerrada",
};

const CONNECTION_LABEL: Record<ConnectionStatus, { text: string; dot: string }> = {
  connecting: { text: "Conectando", dot: "bg-muted" },
  live: { text: "Ao vivo", dot: "bg-success" },
  polling: { text: "Atualizando a cada 15s", dot: "bg-accent" },
  offline: { text: "Sem conexão", dot: "bg-danger" },
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
      // Sem permissão de clipboard: mostra o link para copiar manualmente.
      setFallbackUrl(url);
    }
  }

  const conn = CONNECTION_LABEL[connection];

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-5 py-4">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          Quem Sou Eu?
        </Link>
        <span className="hidden text-border sm:inline">|</span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-2xl font-bold tracking-[0.25em]">{room.code}</span>
          <Button size="sm" variant="secondary" onClick={() => void copyLink()}>
            {copied ? "Link copiado" : "Copiar link"}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <span className="rounded-full border border-border px-3 py-1">{STATUS_LABEL[room.status]}</span>
        <span className="rounded-full border border-border px-3 py-1">Rodada {room.round}</span>
        <span className="rounded-full border border-border px-3 py-1">{playerCount} jogadores</span>
        <span className="flex items-center gap-2 rounded-full border border-border px-3 py-1" title={conn.text}>
          <span className={`size-2 rounded-full ${conn.dot}`} />
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
