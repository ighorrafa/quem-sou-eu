import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Assignment,
  Card,
  GuessResult,
  PeekRoomResult,
  Player,
  Room,
  RoomSnapshot,
  TurnEvent,
  TurnMode,
} from "./types";

const EVENTS_LIMIT = 40;
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export async function peekRoom(supabase: SupabaseClient, code: string): Promise<PeekRoomResult | null> {
  const rows = unwrap(await supabase.rpc("peek_room", { p_code: code })) as PeekRoomResult[] | null;
  return rows && rows.length > 0 ? rows[0] : null;
}

export async function createRoom(supabase: SupabaseClient, nickname: string) {
  const rows = unwrap(await supabase.rpc("create_room", { p_nickname: nickname })) as
    | { room_id: string; code: string }[]
    | null;
  if (!rows || rows.length === 0) throw new Error("could_not_generate_code");
  return rows[0];
}

export async function joinRoom(supabase: SupabaseClient, code: string, nickname: string): Promise<string> {
  return unwrap(await supabase.rpc("join_room", { p_code: code, p_nickname: nickname })) as string;
}

export async function updateNickname(supabase: SupabaseClient, roomId: string, nickname: string) {
  unwrap(await supabase.rpc("update_nickname", { p_room_id: roomId, p_nickname: nickname }));
}

export async function upsertCard(
  supabase: SupabaseClient,
  roomId: string,
  title: string,
  imagePath: string,
): Promise<string> {
  return unwrap(
    await supabase.rpc("upsert_card", { p_room_id: roomId, p_title: title, p_image_path: imagePath }),
  ) as string;
}

export async function setReady(supabase: SupabaseClient, roomId: string, ready: boolean) {
  unwrap(await supabase.rpc("set_ready", { p_room_id: roomId, p_ready: ready }));
}

export async function leaveRoom(supabase: SupabaseClient, roomId: string) {
  unwrap(await supabase.rpc("leave_room", { p_room_id: roomId }));
}

export async function kickPlayer(supabase: SupabaseClient, roomId: string, playerId: string) {
  unwrap(await supabase.rpc("kick_player", { p_room_id: roomId, p_player_id: playerId }));
}

export async function startGame(supabase: SupabaseClient, roomId: string) {
  unwrap(await supabase.rpc("start_game", { p_room_id: roomId }));
}

export async function chooseTurnMode(
  supabase: SupabaseClient,
  roomId: string,
  turnVersion: number,
  mode: TurnMode,
) {
  unwrap(
    await supabase.rpc("choose_turn_mode", {
      p_room_id: roomId,
      p_turn_version: turnVersion,
      p_mode: mode,
    }),
  );
}

export async function advanceTurn(supabase: SupabaseClient, roomId: string, turnVersion: number) {
  unwrap(await supabase.rpc("advance_turn", { p_room_id: roomId, p_turn_version: turnVersion }));
}

export async function submitGuess(
  supabase: SupabaseClient,
  roomId: string,
  turnVersion: number,
  guess: string,
): Promise<GuessResult> {
  return unwrap(
    await supabase.rpc("submit_guess", { p_room_id: roomId, p_turn_version: turnVersion, p_guess: guess }),
  ) as GuessResult;
}

export async function restartGame(supabase: SupabaseClient, roomId: string) {
  unwrap(await supabase.rpc("restart_game", { p_room_id: roomId }));
}

export async function uploadCardImage(supabase: SupabaseClient, path: string, blob: Blob) {
  const { error } = await supabase.storage.from("cards").upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false,
    cacheControl: "3600",
  });
  if (error) throw new Error(error.message);
}

/** Carrega tudo que o RLS permite ver na sala em uma rodada de consultas paralelas. */
export async function fetchRoomSnapshot(supabase: SupabaseClient, roomId: string): Promise<RoomSnapshot | null> {
  const [roomRes, playersRes, cardsRes, assignmentsRes, eventsRes] = await Promise.all([
    supabase.from("rooms").select("*").eq("id", roomId).maybeSingle(),
    supabase.from("players").select("*").eq("room_id", roomId).order("joined_at", { ascending: true }),
    supabase.from("cards").select("id, room_id, owner_player_id, title, image_path, created_at").eq("room_id", roomId),
    supabase.from("assignments").select("*").eq("room_id", roomId),
    supabase
      .from("turn_events")
      .select("*")
      .eq("room_id", roomId)
      .order("id", { ascending: false })
      .limit(EVENTS_LIMIT),
  ]);

  const room = unwrap(roomRes) as Room | null;
  if (!room) return null;

  return {
    room,
    players: unwrap(playersRes) as Player[],
    cards: unwrap(cardsRes) as Card[],
    assignments: unwrap(assignmentsRes) as Assignment[],
    events: (unwrap(eventsRes) as TurnEvent[]).reverse(),
  };
}

export async function createSignedImageUrls(
  supabase: SupabaseClient,
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from("cards").createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) throw new Error(error.message);
  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) map[item.path] = item.signedUrl;
  }
  return map;
}
