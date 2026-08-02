export type GameErrorCode =
  | "game_conflict"
  | "game_not_found"
  | "game_run_not_found"
  | "game_run_conflict"
  | "game_revival_unavailable"
  | "game_revival_conflict";

export class GameError extends Error {
  constructor(readonly code: GameErrorCode) {
    super(code);
    this.name = "GameError";
  }
}
