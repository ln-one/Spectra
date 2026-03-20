export type StudioToolKey =
  | "word"
  | "mindmap"
  | "outline"
  | "quiz"
  | "summary"
  | "animation"
  | "handout";

export type ToolDraftValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[];

export type ToolDraftState = Record<string, ToolDraftValue>;

export interface ToolPanelProps {
  toolId: StudioToolKey;
  toolName: string;
}
