export type RoomStatus = "lobby" | "playing" | "finished";

export type TurnMode = "question" | "guess";

export type Room = {
  id: string;
  code: string;
  host_id: string;
  status: RoomStatus;
  round: number;
  turn_version: number;
  turn_mode: TurnMode | null;
  current_player_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  expires_at: string;
};

export type Player = {
  id: string;
  room_id: string;
  user_id: string;
  nickname: string;
  is_ready: boolean;
  turn_order: number | null;
  finished_position: number | null;
  finished_at: string | null;
  joined_at: string;
};

/** Carta visível para o usuário atual (a própria carta atribuída nunca chega aqui). */
export type Card = {
  id: string;
  room_id: string;
  owner_player_id: string;
  title: string;
  image_path: string;
  created_at: string;
};

export type Assignment = {
  room_id: string;
  player_id: string;
  card_id: string;
};

export type TurnEventKind =
  | "start"
  | "pass"
  | "guess_wrong"
  | "guess_right"
  | "finish"
  | "restart"
  | "mode_question"
  | "mode_guess";

export type TurnEvent = {
  id: number;
  room_id: string;
  player_id: string | null;
  kind: TurnEventKind;
  guess: string | null;
  turn_version: number;
  created_at: string;
};

export type RoomSnapshot = {
  room: Room;
  players: Player[];
  cards: Card[];
  assignments: Assignment[];
  events: TurnEvent[];
};

export type PeekRoomResult = {
  status: RoomStatus;
  player_count: number;
  is_member: boolean;
};

export type GuessResult = {
  correct: boolean;
  position: number | null;
  finished: boolean;
};
