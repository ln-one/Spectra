import type { MessageLocalMeta } from "@/stores/project-store/types";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  citations?: unknown;
  localMeta?: MessageLocalMeta;
}
