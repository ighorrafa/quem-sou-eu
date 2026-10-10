"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, TextInput } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/Modal";
import { kickPlayer, leaveRoom, setReady, startGame, updateNickname, uploadCardImage, upsertCard } from "@/lib/game/api";
import { describeError } from "@/lib/game/errors";
import { buildCardImagePath, prepareCardImage } from "@/lib/game/image";
import type { RoomSnapshot, Player } from "@/lib/game/types";
import { MIN_PLAYERS, NICKNAME_MAX, TITLE_MAX, validateImageFile, validateNickname, validateTitle } from "@/lib/game/validation";
import { saveNickname } from "./HomeActions";

type LobbyProps = {
  supabase: SupabaseClient;
  user: User;
  snapshot: RoomSnapshot;
  me: Player;
  isHost: boolean;
  imageUrls: Record<string, string>;
  refresh: () => Promise<void>;
};

export function Lobby({ supabase, user, snapshot, me, isHost, imageUrls, refresh }: LobbyProps) {
  const router = useRouter();
  const { room, players, cards } = snapshot;
  const myCard = useMemo(() => cards.find((c) => c.owner_player_id === me.id) ?? null, [cards, me.id]);

  // null = ainda não editado localmente; usa o valor remoto.
  const [nicknameDraft, setNicknameDraft] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const nickname = nicknameDraft ?? me.nickname;
  const title = titleDraft ?? myCard?.title ?? "";

  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hostError, setHostError] = useState<string | null>(null);
  const [startPending, setStartPending] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leavePending, setLeavePending] = useState(false);
  const [kickTarget, setKickTarget] = useState<Player | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const currentImageUrl = preview ?? (myCard ? imageUrls[myCard.image_path] : undefined);
  const readyCount = players.filter((p) => p.is_ready).length;
  const canStart = players.length >= MIN_PLAYERS && readyCount === players.length;

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return;
    const check = validateImageFile(selected);
    if (!check.ok) {
      setError(check.error);
      event.target.value = "";
      return;
    }
    setError(null);
    setFile(selected);
  }

  async function handleReady(event: FormEvent) {
    event.preventDefault();
    const nick = validateNickname(nickname);
    if (!nick.ok) return setError(nick.error);
    const titleCheck = validateTitle(title);
    if (!titleCheck.ok) return setError(titleCheck.error);
    if (!file && !myCard) return setError("Escolha uma imagem para a sua carta.");

    setError(null);
    setPending(true);
    try {
      if (nick.value !== me.nickname) {
        await updateNickname(supabase, room.id, nick.value);
        saveNickname(nick.value);
      }

      let imagePath = myCard?.image_path ?? null;
      if (file) {
        const blob = await prepareCardImage(file);
        imagePath = buildCardImagePath(room.id, user.id);
        await uploadCardImage(supabase, imagePath, blob);
      }
      if (!imagePath) throw new Error("image_not_uploaded");

      if (file || !myCard || myCard.title !== titleCheck.value) {
        await upsertCard(supabase, room.id, titleCheck.value, imagePath);
      }
      await setReady(supabase, room.id, true);
      setFile(null);
      setNicknameDraft(null);
      setTitleDraft(null);
      if (fileInput.current) fileInput.current.value = "";
      await refresh();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  }

  async function handleUnready() {
    setPending(true);
    setError(null);
    try {
      await setReady(supabase, room.id, false);
      await refresh();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  }

  async function handleStart() {
    setStartPending(true);
    setHostError(null);
    try {
      await startGame(supabase, room.id);
      await refresh();
    } catch (err) {
      setHostError(describeError(err));
    } finally {
      setStartPending(false);
    }
  }

  async function handleKick(player: Player) {
    setHostError(null);
    try {
      await kickPlayer(supabase, room.id, player.id);
      await refresh();
    } catch (err) {
      setHostError(describeError(err));
    } finally {
      setKickTarget(null);
    }
  }

  async function handleLeave() {
    setLeavePending(true);
    try {
      await leaveRoom(supabase, room.id);
      router.push("/");
    } catch (err) {
      setError(describeError(err));
      setLeavePending(false);
      setConfirmLeave(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <ConfirmDialog
        open={confirmLeave}
        title="Sair da sala?"
        description="Você pode voltar pelo mesmo link enquanto a sala estiver no lobby."
        confirmLabel="Sair"
        danger
        loading={leavePending}
        onConfirm={() => void handleLeave()}
        onCancel={() => setConfirmLeave(false)}
      />
      <ConfirmDialog
        open={kickTarget !== null}
        title={`Remover ${kickTarget?.nickname ?? ""}?`}
        description="O jogador sai da sala e precisará entrar de novo pelo link."
        confirmLabel="Remover"
        danger
        onConfirm={() => kickTarget && void handleKick(kickTarget)}
        onCancel={() => setKickTarget(null)}
      />
      <Card className="flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-semibold">Sua carta</h2>
          <p className="mt-1 text-sm text-muted">
            Escolha uma imagem e a resposta que os outros devem adivinhar. Ela será sorteada para outro jogador, nunca
            para você.
          </p>
        </div>

        {me.is_ready ? (
          <div className="flex flex-col gap-4">
            <Alert tone="success">Você está pronto. Aguardando os outros jogadores e o anfitrião.</Alert>
            <div className="flex flex-wrap items-start gap-4">
              {currentImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentImageUrl} alt="Prévia da sua carta" className="size-32 rounded-xl object-cover" />
              )}
              <div className="text-sm">
                <p className="text-muted">Apelido</p>
                <p className="font-semibold">{me.nickname}</p>
                <p className="mt-2 text-muted">Resposta</p>
                <p className="font-semibold">{myCard?.title}</p>
              </div>
            </div>
            <div>
              <Button variant="secondary" onClick={() => void handleUnready()} loading={pending}>
                Editar carta
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleReady} className="flex flex-col gap-4">
            <Field label="Seu apelido" htmlFor="lobby-nickname">
              <TextInput
                id="lobby-nickname"
                value={nickname}
                maxLength={NICKNAME_MAX}
                onChange={(e) => setNicknameDraft(e.target.value)}
              />
            </Field>
            <Field
              label="Resposta da carta"
              htmlFor="lobby-title"
              hint="Quem receber a carta precisa digitar exatamente isto (acentos, maiúsculas, espaços e pontuação não importam)."
            >
              <TextInput
                id="lobby-title"
                value={title}
                maxLength={TITLE_MAX}
                placeholder="Ex.: Albert Einstein, Torre Eiffel, Copa de 2002"
                onChange={(e) => setTitleDraft(e.target.value)}
              />
            </Field>
            <Field label="Imagem" htmlFor="lobby-image" hint="JPEG, PNG ou WebP. A imagem é reduzida antes do envio.">
              <div className="flex flex-wrap items-center gap-4">
                <label
                  htmlFor="lobby-image"
                  className="flex size-32 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-background/40 text-center text-xs text-muted hover:border-accent"
                >
                  {currentImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={currentImageUrl} alt="Prévia da imagem" className="size-full object-cover" />
                  ) : (
                    <span className="px-2">Clique para escolher</span>
                  )}
                </label>
                <input
                  ref={fileInput}
                  id="lobby-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={handleFile}
                />
                <div className="text-sm text-muted">
                  {file ? (
                    <p>
                      Novo arquivo: <span className="text-foreground">{file.name}</span>
                    </p>
                  ) : myCard ? (
                    <p>Imagem atual mantida. Escolha outra para substituir.</p>
                  ) : (
                    <p>Nenhuma imagem escolhida.</p>
                  )}
                </div>
              </div>
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" size="lg" loading={pending}>
                Pronto
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmLeave(true)} disabled={pending}>
                Sair da sala
              </Button>
            </div>
          </form>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Jogadores</h2>
          <span className="text-sm text-muted">
            {readyCount}/{players.length} prontos
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          {players.map((player) => (
            <li
              key={player.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/30 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className={`size-2.5 shrink-0 rounded-full ${player.is_ready ? "bg-success" : "bg-muted/50"}`} />
                <span className="truncate font-medium">{player.nickname}</span>
                {player.user_id === room.host_id && (
                  <span className="rounded-full border border-accent/50 px-2 py-0.5 text-xs text-accent">anfitrião</span>
                )}
                {player.id === me.id && <span className="text-xs text-muted">(você)</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">{player.is_ready ? "pronto" : "preparando"}</span>
                {isHost && player.id !== me.id && (
                  <Button size="sm" variant="danger" onClick={() => setKickTarget(player)}>
                    Remover
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {isHost ? (
          <div className="flex flex-col gap-3 border-t border-border/70 pt-4">
            {hostError && <Alert tone="error">{hostError}</Alert>}
            <Button size="lg" onClick={() => void handleStart()} disabled={!canStart} loading={startPending}>
              Iniciar partida
            </Button>
            <p className="text-xs text-muted">
              {players.length < MIN_PLAYERS
                ? `Convide pelo menos ${MIN_PLAYERS} jogadores.`
                : canStart
                  ? "Todos prontos. Pode começar."
                  : "Aguardando todos marcarem Pronto."}
            </p>
          </div>
        ) : (
          <p className="border-t border-border/70 pt-4 text-sm text-muted">O anfitrião inicia a partida quando todos estiverem prontos.</p>
        )}
      </Card>
    </div>
  );
}
