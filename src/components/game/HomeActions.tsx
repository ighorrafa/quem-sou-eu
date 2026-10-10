"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, TextInput } from "@/components/ui/Field";
import { createRoom } from "@/lib/game/api";
import { describeError } from "@/lib/game/errors";
import { isValidRoomCode, ROOM_CODE_LENGTH, sanitizeRoomCode } from "@/lib/game/roomCode";
import { NICKNAME_MAX, validateNickname } from "@/lib/game/validation";

const NICK_STORAGE_KEY = "qse:nickname";

export function readSavedNickname(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(NICK_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveNickname(nickname: string) {
  try {
    window.localStorage.setItem(NICK_STORAGE_KEY, nickname);
  } catch {
    // Sem localStorage: segue sem lembrar.
  }
}

export function HomeActions({ supabase }: { supabase: SupabaseClient }) {
  const router = useRouter();
  const [nickname, setNickname] = useState(() => readSavedNickname());
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const nick = validateNickname(nickname);
    if (!nick.ok) {
      setCreateError(nick.error);
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      saveNickname(nick.value);
      const room = await createRoom(supabase, nick.value);
      router.push(`/sala/${room.code}`);
    } catch (err) {
      setCreateError(describeError(err));
      setCreating(false);
    }
  }

  function handleJoin(event: FormEvent) {
    event.preventDefault();
    const clean = sanitizeRoomCode(code);
    if (!isValidRoomCode(clean)) {
      setJoinError(`Informe o código de ${ROOM_CODE_LENGTH} caracteres da sala.`);
      return;
    }
    setJoinError(null);
    const nick = validateNickname(nickname);
    if (nick.ok) saveNickname(nick.value);
    router.push(`/sala/${clean}`);
  }

  return (
    <div className="grid w-full gap-6 md:grid-cols-2">
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold">Criar sala</h2>
          <p className="mt-1 text-sm text-muted">Você será o anfitrião e receberá um código para compartilhar.</p>
        </div>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <Field label="Seu apelido" htmlFor="create-nickname" error={createError}>
            <TextInput
              id="create-nickname"
              value={nickname}
              maxLength={NICKNAME_MAX}
              autoComplete="nickname"
              placeholder="Como os amigos vão te ver"
              onChange={(e) => setNickname(e.target.value)}
            />
          </Field>
          <Button type="submit" size="lg" loading={creating}>
            Criar sala
          </Button>
        </form>
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold">Entrar em uma sala</h2>
          <p className="mt-1 text-sm text-muted">Peça o código ou o link para quem criou a sala.</p>
        </div>
        <form onSubmit={handleJoin} className="flex flex-col gap-4">
          <Field label="Código da sala" htmlFor="join-code" error={joinError}>
            <TextInput
              id="join-code"
              value={code}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={ROOM_CODE_LENGTH}
              placeholder="ABC123"
              className="font-mono text-lg uppercase tracking-[0.3em]"
              onChange={(e) => setCode(sanitizeRoomCode(e.target.value))}
            />
          </Field>
          <Button type="submit" size="lg" variant="secondary">
            Entrar
          </Button>
        </form>
      </Card>

      <Alert tone="info">
        A conversa acontece no Discord (ou onde vocês preferirem). O site cuida das cartas, da vez de cada um e do
        ranking. Envie apenas imagens que você tem direito de usar.
      </Alert>
    </div>
  );
}
