/**
 * Regras puras de turno e distribuição. O banco é a fonte da verdade
 * (`next_active_player`, `start_game`); estas versões existem para a
 * interface antecipar estados e para testes unitários.
 */

export type TurnPlayer = {
  id: string;
  turn_order: number | null;
  finished_position: number | null;
};

/** Próximo jogador ativo após `currentId`, em ordem de turno com wrap-around. */
export function nextActivePlayer(players: TurnPlayer[], currentId: string | null): string | null {
  const current = players.find((p) => p.id === currentId);
  const currentOrder = current?.turn_order ?? -1;
  const active = players
    .filter((p) => p.finished_position === null && p.id !== currentId && p.turn_order !== null)
    .sort((a, b) => (a.turn_order as number) - (b.turn_order as number));
  if (active.length === 0) return null;
  const after = active.find((p) => (p.turn_order as number) > currentOrder);
  return (after ?? active[0]).id;
}

/** Ordem de turno dos jogadores ainda ativos, começando pelo atual. */
export function activeQueue(players: TurnPlayer[], currentId: string | null): TurnPlayer[] {
  const active = players
    .filter((p) => p.finished_position === null && p.turn_order !== null)
    .sort((a, b) => (a.turn_order as number) - (b.turn_order as number));
  const start = Math.max(
    0,
    active.findIndex((p) => p.id === currentId),
  );
  return [...active.slice(start), ...active.slice(0, start)];
}

/**
 * Distribuição em anel: embaralha os ids e cada um recebe a carta do
 * próximo. Com 2+ jogadores ninguém recebe a própria carta.
 */
export function dealCardsInRing(
  playerIds: string[],
  random: () => number = Math.random,
): Map<string, string> {
  if (playerIds.length < 2) {
    throw new Error("São necessários pelo menos 2 jogadores para distribuir cartas.");
  }
  const ring = [...playerIds];
  for (let i = ring.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ring[i], ring[j]] = [ring[j], ring[i]];
  }
  const result = new Map<string, string>();
  ring.forEach((playerId, index) => {
    result.set(playerId, ring[(index + 1) % ring.length]);
  });
  return result;
}

export type RankedPlayer = TurnPlayer & { nickname: string };

/** Ranking por ordem de acerto; quem ainda não acertou vem por último. */
export function rankPlayers<T extends RankedPlayer>(players: T[]): T[] {
  return [...players].sort((a, b) => {
    if (a.finished_position === null && b.finished_position === null) {
      return (a.turn_order ?? 0) - (b.turn_order ?? 0);
    }
    if (a.finished_position === null) return 1;
    if (b.finished_position === null) return -1;
    return a.finished_position - b.finished_position;
  });
}
