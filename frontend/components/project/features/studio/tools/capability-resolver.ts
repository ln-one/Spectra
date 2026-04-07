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

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readSummaryText(parsed: Record<string, unknown>): string {
  if (!hasNonEmptyString(parsed.summary)) return "";
  return parsed.summary.trim();
}

function readKeyPoints(parsed: Record<string, unknown>): string[] {
  if (!Array.isArray(parsed.key_points)) return [];
  return parsed.key_points
    .filter((item): item is string => hasNonEmptyString(item))
    .map((item) => item.trim());
}

function resolveDefaultCapabilityByTool(
  toolId: StudioToolKey
): CapabilityResolution | null {
  if (toolId === "word") {
    return buildResolution("backend_placeholder", "正在等待后端 Word 成果。");
  }
  if (toolId === "summary") {
    return buildResolution("backend_placeholder", "正在等待后端讲稿内容。");
  }
  if (toolId === "handout") {
    return buildResolution("backend_placeholder", "正在等待后端课堂模拟内容。");
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
    "当前还没有后端成果，待生成后会在这里展示真实结果。"
  );
}

function resolveSummaryPayload(
  toolId: StudioToolKey,
  artifact: ArtifactHistoryItem,
  parsed: Record<string, unknown>,
  artifactMetadata?: Record<string, unknown> | null
): CapabilityResolution {
  const summaryText = readSummaryText(parsed);
  const keyPoints = readKeyPoints(parsed);

  if (toolId === "summary") {
    const slides = parsed.slides;
    if (isNonEmptyArray(slides) || summaryText || keyPoints.length > 0) {
      return buildResolution("backend_ready", "已加载后端讲稿内容。", {
        artifactId: artifact.artifactId,
        artifactType: artifact.artifactType,
        contentKind: "json",
        content: parsed,
        artifactMetadata: artifactMetadata ?? null,
      });
    }
    return buildResolution("backend_placeholder", "讲稿成果暂无可展示内容。");
  }

  if (toolId === "handout") {
    const turns = parsed.turns;
    const questionFocus = hasNonEmptyString(parsed.question_focus)
      ? parsed.question_focus.trim()
      : "";
    if (
      isNonEmptyArray(turns) ||
      summaryText ||
      keyPoints.length > 0 ||
      questionFocus
    ) {
      return buildResolution("backend_ready", "已加载后端课堂模拟内容。", {
        artifactId: artifact.artifactId,
        artifactType: artifact.artifactType,
        contentKind: "json",
        content: parsed,
        artifactMetadata: artifactMetadata ?? null,
      });
    }
    return buildResolution("backend_placeholder", "课堂模拟成果暂无可展示内容。");
  }

  return buildResolution(
    "backend_error",
    `当前工具不支持该 summary 成果类型：${artifact.artifactType}`
  );
}

export async function resolveCapabilityFromArtifact(params: {
  toolId: StudioToolKey;
  artifact: ArtifactHistoryItem;
  blob: Blob;
  artifactMetadata?: Record<string, unknown> | null;
}): Promise<CapabilityResolution> {
  const defaultResolution = resolveDefaultCapabilityByTool(params.toolId);
  const { toolId, artifact, blob, artifactMetadata } = params;
  const artifactType = artifact.artifactType;

  try {
    if (artifactType === "docx") {
      return buildResolution("backend_ready", "已加载后端 Word 文档。", {
        artifactId: artifact.artifactId,
        artifactType,
        contentKind: "binary",
        content: null,
        blob,
        artifactMetadata: artifactMetadata ?? null,
      });
    }

    if (artifactType === "mindmap") {
      const raw = await readBlobText(blob);
      const parsed = parseJsonSafely(raw) as Record<string, unknown>;
      const nodes = parsed?.nodes;
      if (isNonEmptyArray(nodes)) {
        return buildResolution("backend_ready", "已加载后端导图。", {
          artifactId: artifact.artifactId,
          artifactType,
          contentKind: "json",
          content: parsed,
          artifactMetadata: artifactMetadata ?? null,
        });
      }
      return buildResolution("backend_placeholder", "导图内容暂时为空，请重新生成或补充节点。");
    }

    if (artifactType === "exercise") {
      const raw = await readBlobText(blob);
      const parsed = parseJsonSafely(raw) as Record<string, unknown>;
      const questions = parsed?.questions;
      if (isNonEmptyArray(questions)) {
        return buildResolution("backend_ready", "已加载后端习题内容。", {
          artifactId: artifact.artifactId,
          artifactType,
          contentKind: "json",
          content: parsed,
          artifactMetadata: artifactMetadata ?? null,
        });
      }
      return buildResolution("backend_placeholder", "习题成果存在，但题目列表为空。");
    }

    if (artifactType === "summary") {
      const raw = await readBlobText(blob);
      const parsed = parseJsonSafely(raw) as Record<string, unknown>;
      return resolveSummaryPayload(toolId, artifact, parsed, artifactMetadata);
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
            ? "互动游戏 HTML 仍是占位内容。"
            : "动画 HTML 仍是占位内容。"
        );
      }
      return buildResolution(
        "backend_ready",
        toolId === "outline" ? "已加载后端互动游戏。"
        : "已加载后端动画 HTML。",
        {
          artifactId: artifact.artifactId,
          artifactType,
          contentKind: "text",
          content: html,
          artifactMetadata: artifactMetadata ?? null,
        }
      );
    }

    if (artifactType === "gif" || artifactType === "mp4") {
      if (blob.size <= PLACEHOLDER_MEDIA_SIZE_THRESHOLD) {
        return buildResolution(
          "backend_placeholder",
          `${artifactType.toUpperCase()} 成果仍是占位媒体。`
        );
      }
      return buildResolution(
        "backend_ready",
        `已加载后端 ${artifactType.toUpperCase()} 媒体。`,
        {
          artifactId: artifact.artifactId,
          artifactType,
          contentKind: "media",
          content: null,
          blob,
          artifactMetadata: artifactMetadata ?? null,
        }
      );
    }

    if (defaultResolution) {
      return defaultResolution;
    }

    return buildResolution(
      "backend_error",
      `暂不支持解析该成果类型：${artifactType}`
    );
  } catch (error) {
    return buildResolution(
      "backend_error",
      `读取后端成果失败：${
        error instanceof Error ? error.message : "unknown error"
      }`,
      null
    );
  }
}
