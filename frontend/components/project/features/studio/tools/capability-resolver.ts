import type { ArtifactHistoryItem } from "@/lib/project-space/artifact-history";
import type {
  CapabilityStatus,
  ResolvedArtifactPayload,
  StudioToolKey,
} from "./types";

export interface CapabilityResolution {
  status: CapabilityStatus;
  reason: string;
  resolvedArtifact: ResolvedArtifactPayload | null;
}

const HTML_EMPTY_TEMPLATE = "<html><body>empty</body></html>";
const PLACEHOLDER_MEDIA_SIZE_THRESHOLD = 128;

function normalizeHtml(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function buildResolution(
  status: CapabilityStatus,
  reason: string,
  resolvedArtifact: ResolvedArtifactPayload | null = null
): CapabilityResolution {
  return { status, reason, resolvedArtifact };
}

function parseJsonSafely(raw: string): unknown {
  return JSON.parse(raw);
}

function extractHtmlFromJsonPayload(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    const parsed = parseJsonSafely(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const row = parsed as Record<string, unknown>;
    const candidates = [
      row.html,
      row.content_html,
      row.preview_html,
      row.template_html,
    ];
    for (const item of candidates) {
      if (typeof item === "string" && item.trim()) {
        return item.trim();
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") {
    return blob.text();
  }
  if (typeof blob.arrayBuffer === "function") {
    const buffer = await blob.arrayBuffer();
    return new TextDecoder().decode(buffer);
  }
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }
        if (reader.result instanceof ArrayBuffer) {
          resolve(new TextDecoder().decode(reader.result));
          return;
        }
        reject(new Error("blob reader returned unsupported result"));
      };
      reader.onerror = () => {
        reject(new Error("blob reader failed"));
      };
      reader.readAsText(blob);
    });
  }
  throw new Error("blob reader is not available");
}

function isNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function resolveDefaultCapabilityByTool(
  toolId: StudioToolKey
): CapabilityResolution | null {
  if (toolId === "word") {
    return buildResolution(
      "backend_placeholder",
      "正在等待后端生成 Word 文档，完成后会显示真实预览与下载入口。"
    );
  }
  if (toolId === "summary") {
    return buildResolution(
      "backend_placeholder",
      "正在等待后端生成说课讲稿，完成后会在当前面板展示真实内容。"
    );
  }
  if (toolId === "handout") {
    return buildResolution(
      "backend_placeholder",
      "正在等待后端生成问答预演，完成后会在当前面板展示真实内容。"
    );
  }
  return null;
}

export function buildCapabilityWithoutArtifact(
  toolId: StudioToolKey
): CapabilityResolution {
  const defaultResolution = resolveDefaultCapabilityByTool(toolId);
  if (defaultResolution) {
    return defaultResolution;
  }
  return buildResolution(
    "backend_placeholder",
    "当前还没有后端产物，预览区会在后端返回真实内容后直接显示。"
  );
}

function resolveSummaryPayload(
  toolId: StudioToolKey,
  artifact: ArtifactHistoryItem,
  parsed: Record<string, unknown>
): CapabilityResolution {
  if (toolId === "summary") {
    const slides = parsed.slides;
    if (isNonEmptyArray(slides) || typeof parsed.summary === "string") {
      return buildResolution("backend_ready", "已读取后端说课讲稿内容。", {
        artifactId: artifact.artifactId,
        artifactType: artifact.artifactType,
        contentKind: "json",
        content: parsed,
      });
    }
    return buildResolution(
      "backend_placeholder",
      "说课讲稿产物结构为空，暂未收到可展示的后端讲稿内容。"
    );
  }

  if (toolId === "handout") {
    const turns = parsed.turns;
    if (isNonEmptyArray(turns) || typeof parsed.summary === "string") {
      return buildResolution("backend_ready", "已读取后端问答预演内容。", {
        artifactId: artifact.artifactId,
        artifactType: artifact.artifactType,
        contentKind: "json",
        content: parsed,
      });
    }
    return buildResolution(
      "backend_placeholder",
      "问答预演产物结构为空，暂未收到可展示的后端预演内容。"
    );
  }

  return buildResolution(
    "backend_error",
    `当前工具不支持解析 ${artifact.artifactType} 产物。`
  );
}

export async function resolveCapabilityFromArtifact(params: {
  toolId: StudioToolKey;
  artifact: ArtifactHistoryItem;
  blob: Blob;
}): Promise<CapabilityResolution> {
  const defaultResolution = resolveDefaultCapabilityByTool(params.toolId);
  const { toolId, artifact, blob } = params;
  const artifactType = artifact.artifactType;

  try {
    if (artifactType === "docx") {
      return buildResolution(
        "backend_ready",
        "已读取到后端生成的 Word 文档。",
        {
          artifactId: artifact.artifactId,
          artifactType,
          contentKind: "binary",
          content: null,
          blob,
        }
      );
    }

    if (artifactType === "mindmap") {
      const raw = await readBlobText(blob);
      const parsed = parseJsonSafely(raw) as Record<string, unknown>;
      const nodes = parsed?.nodes;
      if (isNonEmptyArray(nodes)) {
        return buildResolution("backend_ready", "已读取后端思维导图结构。", {
          artifactId: artifact.artifactId,
          artifactType,
          contentKind: "json",
          content: parsed,
        });
      }
      return buildResolution(
        "backend_placeholder",
        "思维导图产物暂时为空，暂未收到可展示的后端导图结构。"
      );
    }

    if (artifactType === "exercise") {
      const raw = await readBlobText(blob);
      const parsed = parseJsonSafely(raw) as Record<string, unknown>;
      const questions = parsed?.questions;
      if (isNonEmptyArray(questions)) {
        return buildResolution("backend_ready", "已读取后端题目内容。", {
          artifactId: artifact.artifactId,
          artifactType,
          contentKind: "json",
          content: parsed,
        });
      }
      return buildResolution(
        "backend_placeholder",
        "题目产物暂时为空，暂未收到可展示的后端题目内容。"
      );
    }

    if (artifactType === "summary") {
      const raw = await readBlobText(blob);
      const parsed = parseJsonSafely(raw) as Record<string, unknown>;
      return resolveSummaryPayload(toolId, artifact, parsed);
    }

    if (artifactType === "html") {
      const rawHtml = await readBlobText(blob);
      const extractedHtml = extractHtmlFromJsonPayload(rawHtml);
      const html = extractedHtml ?? rawHtml;
      const normalized = normalizeHtml(html);
      if (!normalized || normalized === normalizeHtml(HTML_EMPTY_TEMPLATE)) {
        return buildResolution(
          "backend_placeholder",
          toolId === "outline"
            ? "互动游戏产物仍是空模板，暂未收到可玩的后端 HTML。"
            : "演示动画产物仍是空模板，暂未收到可播放的后端内容。"
        );
      }
      return buildResolution(
        "backend_ready",
        toolId === "outline"
          ? "已读取后端互动游戏 HTML。"
          : "已读取后端演示动画 HTML。",
        {
          artifactId: artifact.artifactId,
          artifactType,
          contentKind: "text",
          content: html,
        }
      );
    }

    if (artifactType === "gif" || artifactType === "mp4") {
      if (blob.size <= PLACEHOLDER_MEDIA_SIZE_THRESHOLD) {
        return buildResolution(
          "backend_placeholder",
          `${artifactType.toUpperCase()} 仍是占位素材，暂未收到可播放的后端媒体内容。`
        );
      }
      return buildResolution(
        "backend_ready",
        `已读取后端 ${artifactType.toUpperCase()} 媒体内容。`,
        {
          artifactId: artifact.artifactId,
          artifactType,
          contentKind: "media",
          content: null,
          blob,
        }
      );
    }

    if (defaultResolution) {
      return defaultResolution;
    }

    return buildResolution(
      "backend_error",
      `暂不支持解析 ${artifactType} 类型的产物。`
    );
  } catch (error) {
    return buildResolution(
      "backend_error",
      `解析后端产物失败：${
        error instanceof Error ? error.message : "unknown error"
      }。`,
      null
    );
  }
}
