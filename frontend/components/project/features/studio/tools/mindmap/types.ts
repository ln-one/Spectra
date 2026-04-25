export type MindmapStep = "config" | "generate" | "preview";

export type MindmapFocus = "concept" | "process" | "comparison";

export interface MindNode {
  id: string;
  label: string;
  parentId?: string | null;
  summary?: string;
  children?: MindNode[];
}

export interface MindmapOption<T extends string = string> {
  value: T;
  label: string;
}
