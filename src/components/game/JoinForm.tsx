"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, TextInput } from "@/components/ui/Field";
import { describeError } from "@/lib/game/errors";
import { MAX_PLAYERS, NICKNAME_MAX, validateNickname } from "@/lib/game/validation";
import { readSavedNickname, saveNickname } from "./HomeActions";

type JoinFormProps = {
  code: string;
  playerCount: number;
  onJoin: (nickname: string) => Promise<void>;
};

export function JoinForm({ code, playerCount, onJoin }: JoinFormProps) {
  const [nickname, setNickname] = useState(() => readSavedNickname());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nick = validateNickname(nickname);
    if (!nick.ok) {
      setError(nick.error);
      return;
    }
    setError(null);
    setPending(true);
    try {
      saveNickname(nick.value);
      await onJoin(nick.value);
    } catch (err) {
      setError(describeError(err));
      setPending(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md space-y-5">
      <div className="space-y-1 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accent">Sala</p>
        <h1 className="font-mono text-3xl font-bold tracking-[0.3em]">{code}</h1>
        <p className="text-sm text-muted">
          {playerCount} de {MAX_PLAYERS} jogadores no lobby
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Seu apelido" htmlFor="join-nickname" error={error}>
          <TextInput
            id="join-nickname"
            value={nickname}
            maxLength={NICKNAME_MAX}
            autoComplete="nickname"
            autoFocus
            placeholder="Como os amigos vão te ver"
            onChange={(e) => setNickname(e.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" loading={pending}>
          Entrar na sala
        </Button>
      </form>
    </Card>
  );
}
