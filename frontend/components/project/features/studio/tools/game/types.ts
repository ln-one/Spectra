export type InteractiveGameSubtype =
  | "drag_classification"
  | "sequence_sort"
  | "relationship_link";

export type GameStep = "config" | "generate" | "preview";

export type GameMode = "timeline_sort" | "concept_match" | "freeform";

export interface InteractiveGameRuntime {
  html: string | null;
  sandboxVersion: string | null;
  assets: string[];
}

export interface InteractiveGameSpecItem {
  id: string;
  label: string;
  hint?: string;
}

export interface InteractiveGamePayload {
  schemaId: string | null;
  subtype: InteractiveGameSubtype | null;
  title: string | null;
  summary: string | null;
  subtitle: string | null;
  teachingGoal: string | null;
  teacherNotes: string[];
  instructions: string[];
  scorePolicy: Record<string, unknown>;
  completionRule: Record<string, unknown>;
  answerKey: Record<string, unknown> | null;
  spec: Record<string, unknown>;
  runtime: InteractiveGameRuntime;
  sourceBinding: Record<string, unknown> | null;
  provenance: Record<string, unknown> | null;
}
