"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { advanceTurn, submitGuess } from "@/lib/game/api";
import { describeError, errorCode } from "@/lib/game/errors";
import type { GuessResult, Room } from "@/lib/game/types";
import { GUESS_MAX, validateGuess } from "@/lib/game/validation";

type TurnControlsProps = {
  supabase: SupabaseClient;
  room: Room;
  onResult: (result: GuessResult | null) => void;
  refresh: () => Promise<void>;
};

/**
 * Controles exclusivos do jogador da vez. Uma única ação por turno:
 * "Próximo" após a pergunta, ou um palpite (que consome a vez em qualquer caso).
 */
export function TurnControls({ supabase, room, onResult, refresh }: TurnControlsProps) {
  const [guess, setGuess] = useState("");
  const [pending, setPending] = useState<"pass" | "guess" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const turnVersion = room.turn_version;

  // Nova vez: limpa o formulário (estado derivado durante a renderização).
  const [seenVersion, setSeenVersion] = useState(turnVersion);
  if (seenVersion !== turnVersion) {
    setSeenVersion(turnVersion);
    setGuess("");
    setError(null);
  }

  useEffect(() => {
    input.current?.focus();
  }, [turnVersion]);

  async function run(action: "pass" | "guess", task: () => Promise<GuessResult | null>) {
    if (pending) return;
    setPending(action);
    setError(null);
    try {
      const result = await task();
      onResult(result);
      await refresh();
    } catch (err) {
      const code = errorCode(err);
      if (code === "stale_turn" || code === "not_your_turn") {
        await refresh();
      }
      setError(describeError(err));
    } finally {
      setPending(null);
    }
  }

  function handleGuess(event: FormEvent) {
    event.preventDefault();
    const check = validateGuess(guess);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    void run("guess", () => submitGuess(supabase, room.id, turnVersion, check.value));
  }

  function handlePass() {
    void run("pass", async () => {
      await advanceTurn(supabase, room.id, turnVersion);
      return null;
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-accent bg-accent/10 p-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accent">Sua vez</p>
        <p className="mt-1 text-sm text-foreground">
          Faça uma pergunta pelo Discord e clique em <strong>Próximo</strong>, ou arrisque um palpite. Só uma das duas
          ações por vez.
        </p>
      </div>
      <form onSubmit={handleGuess} className="flex flex-col gap-3 sm:flex-row">
        <TextInput
          ref={input}
          value={guess}
          maxLength={GUESS_MAX}
          placeholder="Quem (ou o que) você acha que é?"
          aria-label="Palpite"
          disabled={pending !== null}
          onChange={(e) => setGuess(e.target.value)}
        />
        <Button type="submit" loading={pending === "guess"} disabled={pending === "pass"}>
          Palpitar
        </Button>
      </form>
      <p className="-mt-2 text-xs text-muted">Errar não elimina, mas passa a vez automaticamente.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={handlePass} loading={pending === "pass"} disabled={pending === "guess"}>
          Próximo (passar a vez)
        </Button>
        <span className="text-xs text-muted">Use depois de fazer a sua pergunta.</span>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
