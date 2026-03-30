import type { Message, StudioManagedTool } from "./types";

const STUDIO_CHAT_STORAGE_VERSION = 1;

export type StudioLocalStoragePayload = {
  version: number;
  messagesBySession: Record<string, Message[]>;
  hintDedupe: Record<string, true>;
};

const LEGACY_PREVIEW_HINT_PATTERN =
  /已进入.+预览。现在可以直接在这里说“再详细一点 \/ 增加案例 \/ 更简洁”，我会实时帮你微调。/;

function isLegacyPreviewHintMessage(message: Message): boolean {
  return (
    message.role === "assistant" &&
    typeof message.content === "string" &&
    LEGACY_PREVIEW_HINT_PATTERN.test(message.content)
  );
}

function getStudioChatStorageKey(projectId: string): string {
  return `studio-chat-local:${projectId}`;
}

export function readStudioLocalPayload(
  projectId: string
): StudioLocalStoragePayload {
  if (typeof window === "undefined") {
    return {
      version: STUDIO_CHAT_STORAGE_VERSION,
      messagesBySession: {},
      hintDedupe: {},
    };
  }

  try {
    const raw = window.localStorage.getItem(getStudioChatStorageKey(projectId));
    if (!raw) {
      return {
        version: STUDIO_CHAT_STORAGE_VERSION,
        messagesBySession: {},
        hintDedupe: {},
      };
    }

    const parsed = JSON.parse(raw) as Partial<StudioLocalStoragePayload>;
    const messagesBySessionRaw =
      parsed.messagesBySession && typeof parsed.messagesBySession === "object"
        ? parsed.messagesBySession
        : {};
    const messagesBySession = Object.fromEntries(
      Object.entries(messagesBySessionRaw).map(([sessionId, items]) => {
        const safeItems = Array.isArray(items)
          ? (items as Message[]).filter((message) => !isLegacyPreviewHintMessage(message))
          : [];
        return [sessionId, safeItems];
      })
    ) as Record<string, Message[]>;
    const hintDedupe =
      parsed.hintDedupe && typeof parsed.hintDedupe === "object"
        ? parsed.hintDedupe
        : {};

    return {
      version: STUDIO_CHAT_STORAGE_VERSION,
      messagesBySession,
      hintDedupe,
    };
  } catch {
    return {
      version: STUDIO_CHAT_STORAGE_VERSION,
      messagesBySession: {},
      hintDedupe: {},
    };
  }
}

export function writeStudioLocalPayload(
  projectId: string,
  payload: StudioLocalStoragePayload
): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getStudioChatStorageKey(projectId),
      JSON.stringify(payload)
    );
  } catch {
    // Ignore storage errors (quota/private mode).
  }
}

export function createLocalMessage(
  role: Message["role"],
  content: string,
  localMeta?: Message["localMeta"],
  now = new Date()
): Message {
  return {
    id: `local-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: now.toISOString(),
    localMeta,
  };
}

const TOOL_ALIAS: Record<StudioManagedTool, string> = {
  word: "文档",
  mindmap: "思维导图",
  outline: "互动游戏",
  quiz: "随堂小测",
  summary: "说课助手",
  animation: "演示动画",
  handout: "学情预演",
};

function resolveToolAlias(
  toolType: StudioManagedTool,
  toolLabel?: string
): string {
  return toolLabel?.trim() || TOOL_ALIAS[toolType] || "工具卡片";
}

export function buildStageHintMessage(
  toolType: StudioManagedTool,
  stage: "generate" | "preview",
  toolLabel?: string
): string {
  const alias = resolveToolAlias(toolType, toolLabel);
  if (stage === "generate") {
    return `已开始生成${alias}，我会先产出一版初稿。你也可以继续补充需求。`;
  }
  return "";
}

export function buildRefineProcessingMessage(
  toolType: StudioManagedTool,
  toolLabel?: string
): string {
  const alias = resolveToolAlias(toolType, toolLabel);
  return `Spectra 正在构思，正在微调${alias}...`;
}

export function buildRefineSuccessMessage(
  toolType: StudioManagedTool,
  toolLabel?: string
): string {
  const alias = resolveToolAlias(toolType, toolLabel);
  return `${alias}微调已完成，点击查看。`;
}

export function buildRefineFailureMessage(
  toolType: StudioManagedTool,
  toolLabel?: string
): string {
  const alias = resolveToolAlias(toolType, toolLabel);
  return `${alias}微调失败，请重试。`;
}
