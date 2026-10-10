/** Traduz códigos de erro lançados pelas funções SQL para mensagens amigáveis. */
const MESSAGES: Record<string, string> = {
  not_authenticated: "Sua sessão expirou. Recarregue a página.",
  invalid_nickname: "Apelido inválido.",
  invalid_title: "Resposta da carta inválida.",
  invalid_guess: "Palpite inválido.",
  invalid_image_path: "Imagem inválida. Envie novamente.",
  image_not_uploaded: "A imagem não foi encontrada. Envie novamente.",
  room_not_found: "Sala não encontrada ou expirada.",
  room_not_in_lobby: "A sala já saiu do lobby.",
  room_in_lobby: "A sala ainda está no lobby.",
  room_not_playing: "A partida não está em andamento.",
  room_full: "A sala está cheia (máximo de 12 jogadores).",
  not_a_member: "Você não faz parte desta sala.",
  not_host: "Apenas o anfitrião pode fazer isso.",
  not_your_turn: "Não é a sua vez.",
  stale_turn: "A vez já mudou. Atualizando...",
  turn_mode_required: "Escolha pergunta ou palpite antes de continuar.",
  wrong_turn_mode: "Esta ação não combina com o modo que você escolheu.",
  turn_mode_already_set: "O modo desta vez já foi escolhido.",
  not_enough_players: "São necessários pelo menos 2 jogadores.",
  players_not_ready: "Todos precisam enviar a carta e marcar Pronto.",
  card_required: "Envie sua carta antes de marcar Pronto.",
  could_not_generate_code: "Não foi possível criar a sala. Tente novamente.",
};

export function describeError(error: unknown, fallback = "Algo deu errado. Tente novamente."): string {
  if (!error) return fallback;
  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "";
  for (const [code, text] of Object.entries(MESSAGES)) {
    if (message.includes(code)) return text;
  }
  return message || fallback;
}

export function errorCode(error: unknown): string | null {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : typeof error === "string"
        ? error
        : "";
  for (const code of Object.keys(MESSAGES)) {
    if (message.includes(code)) return code;
  }
  return null;
}
