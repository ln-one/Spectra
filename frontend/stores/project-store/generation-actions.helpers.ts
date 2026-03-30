import type {
  GenerationHistory,
  GenerationOptions,
  GenerationTool,
  SessionStatePayload,
} from "./types";
import { GENERATION_TOOLS } from "./types";

export function normalizeGenerationOptions(
  options?: GenerationOptions
): GenerationOptions {
  return {
    template: options?.template || "default",
    show_page_number: options?.show_page_number ?? true,
    include_animations: options?.include_animations ?? false,
    include_games: options?.include_games ?? false,
    use_text_to_image: options?.use_text_to_image ?? false,
    ...options,
  };
}

export function resolveOutputType(tool: GenerationTool): "ppt" | "word" {
  return tool.type === "ppt" ||
    tool.type === "mindmap" ||
    tool.type === "outline" ||
    tool.type === "animation"
    ? "ppt"
    : "word";
}

export function resolveReusableGenerationSessionId(
  activeSessionId: string | null,
  generationSession: SessionStatePayload | null
): string | undefined {
  if (!activeSessionId) return undefined;
  const session = generationSession?.session;
  if (!session || session.session_id !== activeSessionId) {
    return activeSessionId;
  }
  // Keep generation bound to current conversation session.
  // Session creation should only be explicit from session switcher.
  return activeSessionId;
}

export function mapSessionsToHistory(
  sessions: Array<{
    session_id: string;
    state: string;
    output_type: string;
    created_at: string;
    display_title?: string | null;
  }>
): GenerationHistory[] {
  return sessions.map((session) => {
    let status: GenerationHistory["status"] = "processing";
    if (session.state === "SUCCESS") status = "completed";
    else if (session.state === "FAILED") status = "failed";
    else if (session.state === "IDLE") status = "pending";

    const toolId =
      session.output_type === "ppt"
        ? "ppt"
        : session.output_type === "word"
          ? "word"
          : "ppt";
    const tool = GENERATION_TOOLS.find((entry) => entry.id === toolId);
    const fallbackTitle = `会话 ${session.session_id.slice(-6)}`;
    const resolvedTitle =
      String(session.display_title || "").trim() || fallbackTitle;

    return {
      id: session.session_id,
      toolId,
      toolName: tool?.name || "生成任务",
      status,
      sessionState: session.state,
      createdAt: session.created_at,
      title: resolvedTitle,
    };
  });
}
