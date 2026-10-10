"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { joinRoom, peekRoom } from "@/lib/game/api";
import { describeError } from "@/lib/game/errors";
import { isValidRoomCode } from "@/lib/game/roomCode";
import type { PeekRoomResult } from "@/lib/game/types";
import { useRoom } from "@/lib/hooks/useRoom";
import { GameBoard } from "./GameBoard";
import { JoinForm } from "./JoinForm";
import { Lobby } from "./Lobby";
import { Ranking } from "./Ranking";
import { RoomHeader } from "./RoomHeader";
import { SessionGate } from "./SessionGate";

export function RoomView({ code }: { code: string }) {
  if (!isValidRoomCode(code)) {
    return (
      <Card className="mx-auto w-full max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">Código inválido</h1>
        <p className="text-sm text-muted">O código da sala tem 6 letras e números.</p>
        <Link href="/" className="inline-block">
          <Button variant="secondary">Voltar ao início</Button>
        </Link>
      </Card>
    );
  }

  return <SessionGate>{({ supabase, user }) => <RoomEntry code={code} supabase={supabase} user={user} />}</SessionGate>;
}

type EntryState =
  | { phase: "checking" }
  | { phase: "not_found" }
  | { phase: "join"; peek: PeekRoomResult }
  | { phase: "closed"; peek: PeekRoomResult }
  | { phase: "ready"; roomId: string }
  | { phase: "error"; message: string };

function RoomEntry({ code, supabase, user }: { code: string; supabase: SupabaseClient; user: User }) {
  const [state, setState] = useState<EntryState>({ phase: "checking" });
  const [attempt, setAttempt] = useState(0);
  const check = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    const apply = (next: EntryState) => {
      if (!cancelled) setState(next);
    };
    (async () => {
      try {
        const peek = await peekRoom(supabase, code);
        if (!peek) return apply({ phase: "not_found" });
        if (peek.is_member) {
          const roomId = await joinRoom(supabase, code, "");
          return apply({ phase: "ready", roomId });
        }
        if (peek.status !== "lobby") return apply({ phase: "closed", peek });
        apply({ phase: "join", peek });
      } catch (err) {
        apply({ phase: "error", message: describeError(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, code, attempt]);

  // Sala fechada: tenta de novo periodicamente até o anfitrião voltar ao lobby.
  useEffect(() => {
    if (state.phase !== "closed") return;
    const timer = setInterval(check, 5000);
    return () => clearInterval(timer);
  }, [state.phase, check]);

  if (state.phase === "checking") {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-muted">
        <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Procurando a sala {code}...
      </div>
    );
  }

  if (state.phase === "not_found") {
    return (
      <Card className="mx-auto w-full max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">Sala não encontrada</h1>
        <p className="text-sm text-muted">
          Confira o código <span className="font-mono text-foreground">{code}</span>. Salas expiram 24 horas após a
          última partida.
        </p>
        <Link href="/" className="inline-block">
          <Button variant="secondary">Voltar ao início</Button>
        </Link>
      </Card>
    );
  }

  if (state.phase === "error") {
    return (
      <Card className="mx-auto w-full max-w-md space-y-4 text-center">
        <Alert tone="error">{state.message}</Alert>
        <Button variant="secondary" onClick={() => void check()}>
          Tentar novamente
        </Button>
      </Card>
    );
  }

  if (state.phase === "closed") {
    return (
      <Card className="mx-auto w-full max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">Partida em andamento</h1>
        <p className="text-sm text-muted">
          A sala <span className="font-mono text-foreground">{code}</span> tem {state.peek.player_count} jogadores e já
          começou. Assim que o anfitrião voltar ao lobby, você poderá entrar.
        </p>
        <p className="text-xs text-muted">Verificando automaticamente...</p>
      </Card>
    );
  }

  if (state.phase === "join") {
    return (
      <JoinForm
        code={code}
        playerCount={state.peek.player_count}
        onJoin={async (nickname) => {
          const roomId = await joinRoom(supabase, code, nickname);
          setState({ phase: "ready", roomId });
        }}
      />
    );
  }

  return <RoomScreen supabase={supabase} user={user} roomId={state.roomId} code={code} />;
}

function RoomScreen({
  supabase,
  user,
  roomId,
  code,
}: {
  supabase: SupabaseClient;
  user: User;
  roomId: string;
  code: string;
}) {
  const { snapshot, loading, error, notFound, connection, imageUrls, refresh } = useRoom(supabase, roomId, true);

  const me = useMemo(() => snapshot?.players.find((p) => p.user_id === user.id) ?? null, [snapshot, user.id]);

  if (loading && !snapshot) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-muted">
        <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Entrando na sala...
      </div>
    );
  }

  if (notFound || !snapshot) {
    return (
      <Card className="mx-auto w-full max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">Você saiu da sala</h1>
        <p className="text-sm text-muted">A sala foi encerrada ou você foi removido pelo anfitrião.</p>
        {error && <Alert tone="error">{error}</Alert>}
        <Link href="/" className="inline-block">
          <Button variant="secondary">Voltar ao início</Button>
        </Link>
      </Card>
    );
  }

  if (!me) {
    // A sessão não corresponde a um jogador (ex.: removido). Força nova verificação.
    return (
      <Card className="mx-auto w-full max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">Você não está mais nesta sala</h1>
        <p className="text-sm text-muted">
          Sala <span className="font-mono text-foreground">{code}</span>. Recarregue para entrar de novo.
        </p>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Entrar novamente
        </Button>
      </Card>
    );
  }

  const isHost = snapshot.room.host_id === user.id;

  return (
    <div className="flex flex-col gap-6">
      <RoomHeader room={snapshot.room} connection={connection} playerCount={snapshot.players.length} />
      {error && <Alert tone="warning">{error}</Alert>}
      {snapshot.room.status === "lobby" && (
        <Lobby supabase={supabase} user={user} snapshot={snapshot} me={me} isHost={isHost} imageUrls={imageUrls} refresh={refresh} />
      )}
      {snapshot.room.status === "playing" && (
        <GameBoard supabase={supabase} snapshot={snapshot} me={me} isHost={isHost} imageUrls={imageUrls} refresh={refresh} />
      )}
      {snapshot.room.status === "finished" && (
        <Ranking supabase={supabase} snapshot={snapshot} me={me} isHost={isHost} imageUrls={imageUrls} refresh={refresh} />
      )}
    </div>
  );
}
