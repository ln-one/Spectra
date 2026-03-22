export type GameStep = "config" | "generate" | "preview";

export type GameMode = "timeline_sort" | "concept_match" | "logic_puzzle";

export interface GameModeOption {
  value: GameMode;
  label: string;
  description: string;
}
