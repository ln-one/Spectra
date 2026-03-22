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
      "backend_not_implemented",
      "后端输出为 docx 文件，当前面板为前端草稿预览。"
    );
  }
  if (toolId === "summary") {
    return buildResolution(
      "backend_not_implemented",
      "后端暂未提供结构化讲稿产物，当前使用前端示意提词稿。"
    );
  }
  if (toolId === "handout") {
    return buildResolution(
      "backend_not_implemented",
      "后端暂未提供多轮问答仿真结构，当前使用前端示意预演。"
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
    "暂无后端成果内容，已回退前端示意内容。"
  );
}

export async function resolveCapabilityFromArtifact(params: {
  toolId: StudioToolKey;
  artifact: ArtifactHistoryItem;
  blob: Blob;
}): Promise<CapabilityResolution> {
  const defaultResolution = resolveDefaultCapabilityByTool(params.toolId);
  if (defaultResolution) {
    return defaultResolution;
  }

  const { toolId, artifact, blob } = params;
  const artifactType = artifact.artifactType;

  try {
    if (artifactType === "mindmap") {
      const raw = await readBlobText(blob);
      const parsed = parseJsonSafely(raw) as Record<string, unknown>;
      const nodes = parsed?.nodes;
      if (isNonEmptyArray(nodes)) {
        return buildResolution("backend_ready", "后端返回了思维导图结构。", {
          artifactId: artifact.artifactId,
          artifactType,
          contentKind: "json",
          content: parsed,
        });
      }
      return buildResolution(
        "backend_placeholder",
        "当前思维导图仅返回空 nodes，已回退前端示意内容。"
      );
    }

    if (artifactType === "exercise") {
      const raw = await readBlobText(blob);
      const parsed = parseJsonSafely(raw) as Record<string, unknown>;
      const questions = parsed?.questions;
      if (isNonEmptyArray(questions)) {
        return buildResolution("backend_ready", "后端返回了题目内容。", {
          artifactId: artifact.artifactId,
          artifactType,
          contentKind: "json",
          content: parsed,
        });
      }
      return buildResolution(
        "backend_placeholder",
        "当前随堂小测仅返回空 questions，已回退前端示意内容。"
      );
    }

    if (artifactType === "html") {
      const html = await readBlobText(blob);
      const normalized = normalizeHtml(html);
      if (!normalized || normalized === normalizeHtml(HTML_EMPTY_TEMPLATE)) {
        const reason =
          toolId === "outline"
            ? "当前互动游戏仅返回空 HTML 模板，已回退前端示意内容。"
            : "当前动画仅返回空 HTML 模板，已回退前端示意内容。";
        return buildResolution("backend_placeholder", reason);
      }
      const readyReason =
        toolId === "outline"
          ? "后端返回了可渲染的游戏 HTML 内容。"
          : "后端返回了可渲染的动画 HTML 内容。";
      return buildResolution("backend_ready", readyReason, {
        artifactId: artifact.artifactId,
        artifactType,
        contentKind: "text",
        content: html,
      });
    }

    if (artifactType === "gif" || artifactType === "mp4") {
      // 占位素材通常是极小文件，这里使用保守阈值识别。
      if (blob.size <= PLACEHOLDER_MEDIA_SIZE_THRESHOLD) {
        return buildResolution(
          "backend_placeholder",
          `当前 ${artifactType.toUpperCase()} 为占位媒体，已回退前端示意内容。`
        );
      }
      return buildResolution(
        "backend_ready",
        `后端返回了可播放的 ${artifactType.toUpperCase()} 内容。`,
        {
          artifactId: artifact.artifactId,
          artifactType,
          contentKind: "media",
          content: null,
          blob,
        }
      );
    }

    return buildResolution(
      "backend_error",
      `不支持的成果类型：${artifactType}。已回退前端示意内容。`
    );
  } catch (error) {
    return buildResolution(
      "backend_error",
      `解析后端成果失败：${
        error instanceof Error ? error.message : "unknown error"
      }。已回退前端示意内容。`
    );
  }
}
