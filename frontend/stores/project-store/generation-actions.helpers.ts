import type { GenerationHistory, GenerationOptions, GenerationTool } from "./types";
import { GENERATION_TOOLS } from "./types";

export function normalizeGenerationOptions(options?: GenerationOptions): GenerationOptions {
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

export function mapSessionsToHistory(
  sessions: Array<{
    session_id: string;
    state: string;
    output_type: string;
    created_at: string;
  }>
): GenerationHistory[] {
  return sessions.map((s) => {
    let status: GenerationHistory["status"] = "processing";
    if (s.state === "SUCCESS") status = "completed";
    else if (s.state === "FAILED") status = "failed";
    else if (s.state === "IDLE") status = "pending";

    const toolId = s.output_type === "ppt" ? "ppt" : s.output_type === "word" ? "word" : "ppt";
    const tool = GENERATION_TOOLS.find((t) => t.id === toolId);

    return {
      id: s.session_id,
      toolId,
      toolName: tool?.name || "生成任务",
      status,
      sessionState: s.state,
      createdAt: s.created_at,
      title: tool?.name || "生成任务",
    };
  });
}
