"use client";



import { useEffect, useRef, useState, type FormEvent } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { Alert } from "@/components/ui/Alert";

import { Button } from "@/components/ui/Button";

import { TextInput } from "@/components/ui/Field";

import { advanceTurn, chooseTurnMode, submitGuess } from "@/lib/game/api";

import { describeError, errorCode } from "@/lib/game/errors";

import type { GuessResult, Room, TurnMode } from "@/lib/game/types";

import { GUESS_MAX, validateGuess } from "@/lib/game/validation";



type TurnControlsProps = {

  supabase: SupabaseClient;

  room: Room;

  onResult: (result: GuessResult | null) => void;

  refresh: () => Promise<void>;

};



/**

 * Controles do jogador da vez: escolhe pergunta ou palpite (uma vez), depois só a ação correspondente.

 */

export function TurnControls({ supabase, room, onResult, refresh }: TurnControlsProps) {

  const [guess, setGuess] = useState("");

  const [pending, setPending] = useState<"mode" | "pass" | "guess" | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [guessConfirmOpen, setGuessConfirmOpen] = useState(false);

  const [noQuestionsAck, setNoQuestionsAck] = useState(false);

  const input = useRef<HTMLInputElement>(null);

  const turnVersion = room.turn_version;

  const mode = room.turn_mode;



  const [seenVersion, setSeenVersion] = useState(turnVersion);

  if (seenVersion !== turnVersion) {

    setSeenVersion(turnVersion);

    setGuess("");

    setError(null);

    setGuessConfirmOpen(false);

    setNoQuestionsAck(false);

  }



  useEffect(() => {

    if (mode === "guess") input.current?.focus();

  }, [turnVersion, mode]);



  async function run<T>(action: typeof pending, task: () => Promise<T>): Promise<T | undefined> {

    if (pending) return;

    setPending(action);

    setError(null);

    try {

      const result = await task();

      await refresh();

      return result;

    } catch (err) {

      const code = errorCode(err);

      if (code === "stale_turn" || code === "not_your_turn" || code === "turn_mode_already_set") {

        await refresh();

      }

      setError(describeError(err));

      return undefined;

    } finally {

      setPending(null);

    }

  }



  async function pickMode(chosen: TurnMode) {

    if (chosen === "guess" && !guessConfirmOpen) {

      setGuessConfirmOpen(true);

      setNoQuestionsAck(false);

      return;

    }

    if (chosen === "guess" && !noQuestionsAck) {

      setError("Marque que você não fará perguntas nesta vez.");

      return;

    }

    await run("mode", async () => {

      await chooseTurnMode(supabase, room.id, turnVersion, chosen);

      setGuessConfirmOpen(false);

    });

  }



  function handleGuess(event: FormEvent) {

    event.preventDefault();

    const check = validateGuess(guess);

    if (!check.ok) {

      setError(check.error);

      return;

    }

    void run("guess", async () => {

      const result = await submitGuess(supabase, room.id, turnVersion, check.value);

      onResult(result);

      return result;

    });

  }



  function handlePass() {

    void run("pass", async () => {

      await advanceTurn(supabase, room.id, turnVersion);

      onResult(null);

      return null;

    });

  }



  if (mode === null) {

    return (

      <div className="game-panel flex flex-col gap-4 rounded-2xl border-accent/30 p-5 ring-1 ring-accent/20 sm:p-6">

        <div>

          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accent">Sua vez</p>

          <p className="mt-1 text-sm text-foreground">

            Escolha o que vai fazer nesta vez. A escolha fica visível para todos e não pode ser trocada até passar a

            vez.

          </p>

        </div>

        {!guessConfirmOpen ? (

          <div className="flex flex-col gap-3 sm:flex-row">

            <Button

              className="flex-1"

              loading={pending === "mode"}

              disabled={pending !== null}

              onClick={() => void pickMode("question")}

            >

              Fazer uma pergunta

            </Button>

            <Button

              variant="secondary"

              className="flex-1"

              disabled={pending !== null}

              onClick={() => void pickMode("guess")}

            >

              Palpitar agora

            </Button>

          </div>

        ) : (

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-4">

            <p className="text-sm text-foreground">

              Modo palpite: você <strong>não</strong> pode fazer perguntas no Discord nesta vez. Todos verão que você

              escolheu palpitar.

            </p>

            <label className="flex cursor-pointer items-start gap-2 text-sm">

              <input

                type="checkbox"

                className="mt-1"

                checked={noQuestionsAck}

                onChange={(e) => setNoQuestionsAck(e.target.checked)}

              />

              <span>Entendo — vou palpitar sem fazer perguntas nesta vez.</span>

            </label>

            <div className="flex flex-wrap gap-2">

              <Button loading={pending === "mode"} disabled={pending !== null} onClick={() => void pickMode("guess")}>

                Confirmar e palpitar

              </Button>

              <Button variant="ghost" disabled={pending !== null} onClick={() => setGuessConfirmOpen(false)}>

                Voltar

              </Button>

            </div>

          </div>

        )}

        {error && <Alert tone="error">{error}</Alert>}

      </div>

    );

  }



  if (mode === "question") {

    return (

      <div className="game-panel flex flex-col gap-4 rounded-2xl p-5 sm:p-6">

        <div>

          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accent">Modo pergunta</p>

          <p className="mt-1 text-sm text-foreground">

            Faça uma pergunta de sim ou não pelo Discord. Depois clique em <strong>Próximo</strong>. Palpite não está

            disponível nesta vez.

          </p>

        </div>

        <div className="flex flex-wrap items-center gap-3">

          <Button variant="secondary" onClick={handlePass} loading={pending === "pass"} disabled={pending !== null}>

            Próximo (passar a vez)

          </Button>

        </div>

        {error && <Alert tone="error">{error}</Alert>}

      </div>

    );

  }



  return (

    <div className="game-panel flex flex-col gap-4 rounded-2xl border-amber-400/20 p-5 ring-1 ring-amber-400/15 sm:p-6">

      <div>

        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accent">Modo palpite</p>

        <p className="mt-1 text-sm text-foreground">

          Envie sua resposta completa. Sem perguntas nesta vez — todos foram avisados.

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

        <Button type="submit" loading={pending === "guess"} disabled={pending !== null}>

          Palpitar

        </Button>

      </form>

      <p className="-mt-2 text-xs text-muted">Errar não elimina, mas passa a vez automaticamente.</p>

      {error && <Alert tone="error">{error}</Alert>}

    </div>

  );

}

