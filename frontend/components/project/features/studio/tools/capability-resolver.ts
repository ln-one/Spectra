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

function readArtifactMetadata(
  artifact: ArtifactHistoryItem
): Record<string, unknown> | null {
  if (!artifact.metadata || typeof artifact.metadata !== "object") {
    return null;
  }
  return artifact.metadata as Record<string, unknown>;
}

function readContentSnapshot(
  artifact: ArtifactHistoryItem
): Record<string, unknown> | null {
  const metadata = readArtifactMetadata(artifact);
  const snapshot = metadata?.content_snapshot;
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    return snapshot as Record<string, unknown>;
  }
  if (typeof snapshot === "string" && snapshot.trim()) {
    try {
      const parsed = parseJsonSafely(snapshot);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function parseJsonObjectSafely(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = parseJsonSafely(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isAnimationRuntimePayload(
  payload: Record<string, unknown> | null
): boolean {
  if (!payload) return false;
  if (payload.kind === "animation_storyboard") return true;
  if (typeof payload.runtime_version === "string") return true;
  if (typeof payload.runtime_graph_version === "string") return true;
  if (typeof payload.runtime_contract === "string") return true;
  if (typeof payload.component_code === "string") return true;
  if (payload.runtime_graph && typeof payload.runtime_graph === "object") return true;
  return false;
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

function extractAnimationSpecFromLegacyHtml(
  rawHtml: string
): Record<string, unknown> | null {
  if (!rawHtml || typeof rawHtml !== "string") return null;
  const marker = "window.__SPECTRA_DEBUG_SPEC__";
  const markerIndex = rawHtml.indexOf(marker);
  if (markerIndex < 0) return null;
  const equalsIndex = rawHtml.indexOf("=", markerIndex);
  if (equalsIndex < 0) return null;
  const bootstrapIndex = rawHtml.indexOf(
    ";(function bootstrapSpectraAnimation",
    equalsIndex
  );
  if (bootstrapIndex < 0) return null;
  const candidate = rawHtml.slice(equalsIndex + 1, bootstrapIndex).trim();
  if (!candidate.startsWith("{")) return null;
  try {
    const parsed = parseJsonSafely(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
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

function readInteractiveGameCompatibilityStatus(
  payload: Record<string, unknown> | null
): "protocol_limited" | null {
  if (!payload) return null;
  const compatibility = payload.compatibility_zone;
  if (!compatibility || typeof compatibility !== "object") return null;
  const status = (compatibility as Record<string, unknown>).status;
  if (status === "protocol_limited") return "protocol_limited";
  return null;
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
    return buildResolution(
      "backend_placeholder",
      "Waiting for backend Word artifact."
    );
  }
  if (toolId === "summary") {
    return buildResolution(
      "backend_placeholder",
      "Waiting for backend speaker notes content."
    );
  }
  if (toolId === "handout") {
    return buildResolution(
      "backend_placeholder",
      "Waiting for backend classroom simulation content."
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
    "No backend artifact yet. Preview will render real backend output once available."
  );
}

function resolveSummaryPayload(
  toolId: StudioToolKey,
  artifact: ArtifactHistoryItem,
  parsed: Record<string, unknown>
): CapabilityResolution {
  const summaryText = readSummaryText(parsed);
  const keyPoints = readKeyPoints(parsed);

  if (toolId === "summary") {
    const slides = parsed.slides;
    if (isNonEmptyArray(slides) || summaryText || keyPoints.length > 0) {
      return buildResolution("backend_ready", "Loaded backend speaker notes.", {
        artifactId: artifact.artifactId,
        artifactType: artifact.artifactType,
        contentKind: "json",
        content: parsed,
      });
    }
    return buildResolution(
      "backend_placeholder",
      "Speaker notes artifact has no displayable content yet."
    );
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
      return buildResolution(
        "backend_ready",
        "Loaded backend classroom simulation content.",
        {
          artifactId: artifact.artifactId,
          artifactType: artifact.artifactType,
          contentKind: "json",
          content: parsed,
        }
      );
    }
    return buildResolution(
      "backend_placeholder",
      "Classroom simulation artifact has no displayable content yet."
    );
  }

  return buildResolution(
    "backend_error",
    `Tool does not support summary artifact type: ${artifact.artifactType}.`
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
  const artifactMetadata = readArtifactMetadata(artifact);
  const contentSnapshot = readContentSnapshot(artifact);
  const metadataAsPayload =
    artifactMetadata && isAnimationRuntimePayload(artifactMetadata)
      ? artifactMetadata
      : null;

  try {
    if (artifactType === "docx") {
      const hasStructuredDocument =
        contentSnapshot &&
        typeof contentSnapshot.document_content === "object" &&
        contentSnapshot.document_content !== null;
      if (hasStructuredDocument) {
        return buildResolution(
          "backend_ready",
          "Loaded backend Word document content.",
          {
            artifactId: artifact.artifactId,
            artifactType,
            contentKind: "json",
            content: contentSnapshot,
            blob,
            artifactMetadata,
          }
        );
      }
      return buildResolution(
        "backend_ready",
        "Loaded backend Word document.",
        {
          artifactId: artifact.artifactId,
          artifactType,
          contentKind: "binary",
          content: null,
          blob,
          artifactMetadata,
        }
      );
    }

    if (artifactType === "mindmap") {
      const parsed =
        contentSnapshot ??
        ((parseJsonSafely(await readBlobText(blob)) as Record<string, unknown>) ??
          null);
      const nodes = parsed?.nodes;
      if (isNonEmptyArray(nodes)) {
        return buildResolution("backend_ready", "Loaded backend mindmap.", {
          artifactId: artifact.artifactId,
          artifactType,
          contentKind: "json",
          content: parsed,
          artifactMetadata,
        });
      }
      return buildResolution(
        "backend_placeholder",
        "导图内容暂时为空，请重新生成或补充节点。"
      );
    }

    if (artifactType === "exercise") {
      const parsed =
        contentSnapshot ??
        ((parseJsonSafely(await readBlobText(blob)) as Record<string, unknown>) ??
          null);
      const questions = parsed?.questions;
      if (isNonEmptyArray(questions)) {
        return buildResolution(
          "backend_ready",
          "Loaded backend quiz content.",
          {
            artifactId: artifact.artifactId,
            artifactType,
            contentKind: "json",
            content: parsed,
            artifactMetadata,
          }
        );
      }
      return buildResolution(
        "backend_placeholder",
        "Quiz artifact exists but questions are empty."
      );
    }

    if (artifactType === "summary") {
      const parsed =
        contentSnapshot ??
        ((parseJsonSafely(await readBlobText(blob)) as Record<string, unknown>) ??
          null);
      const resolution = resolveSummaryPayload(toolId, artifact, parsed);
      if (resolution.resolvedArtifact) {
        resolution.resolvedArtifact.artifactMetadata = artifactMetadata;
      }
      return resolution;
    }

    if (artifactType === "html") {
      if (toolId === "outline" && contentSnapshot) {
        const html =
          typeof contentSnapshot.html === "string" ? contentSnapshot.html.trim() : "";
        if (!html || normalizeHtml(html) === normalizeHtml(HTML_EMPTY_TEMPLATE)) {
          return buildResolution(
            "backend_placeholder",
            "Interactive game HTML is still placeholder."
          );
        }
        const compatibilityStatus =
          readInteractiveGameCompatibilityStatus(contentSnapshot);
        return buildResolution(
          compatibilityStatus ?? "backend_ready",
          compatibilityStatus
            ? "Loaded backend interactive game HTML through legacy compatibility zone."
            : "Loaded backend interactive game HTML.",
          {
            artifactId: artifact.artifactId,
            artifactType,
            contentKind: "json",
            content: contentSnapshot,
            artifactMetadata,
          }
        );
      }
      if (
        toolId === "animation" &&
        (isAnimationRuntimePayload(contentSnapshot) ||
          isAnimationRuntimePayload(metadataAsPayload))
      ) {
        return buildResolution(
          "backend_ready",
          "Loaded backend animation runtime storyboard.",
          {
            artifactId: artifact.artifactId,
            artifactType,
            contentKind: "json",
            content: contentSnapshot ?? metadataAsPayload,
            artifactMetadata,
          }
        );
      }
      const rawHtml = await readBlobText(blob);
      if (toolId === "animation") {
        const parsedJson = parseJsonObjectSafely(rawHtml);
        if (isAnimationRuntimePayload(parsedJson)) {
          return buildResolution(
            "backend_ready",
            "Loaded backend animation runtime storyboard.",
            {
              artifactId: artifact.artifactId,
              artifactType,
              contentKind: "json",
              content: parsedJson,
              artifactMetadata,
            }
          );
        }
        const legacyEmbeddedSpec = extractAnimationSpecFromLegacyHtml(rawHtml);
        if (isAnimationRuntimePayload(legacyEmbeddedSpec)) {
          return buildResolution(
            "backend_ready",
            "Loaded backend animation runtime storyboard from legacy HTML payload.",
            {
              artifactId: artifact.artifactId,
              artifactType,
              contentKind: "json",
              content: legacyEmbeddedSpec,
              artifactMetadata,
            }
          );
        }
      }
      const extractedHtml = extractHtmlFromJsonPayload(rawHtml);
      const html = extractedHtml ?? rawHtml;
      const normalized = normalizeHtml(html);
      if (!normalized || normalized === normalizeHtml(HTML_EMPTY_TEMPLATE)) {
        return buildResolution(
          "backend_placeholder",
          toolId === "outline"
            ? "Interactive game HTML is still placeholder."
            : "Animation HTML is still placeholder."
        );
      }
      return buildResolution(
        "backend_ready",
        toolId === "outline"
          ? "Loaded backend interactive game HTML."
          : "Loaded backend animation HTML.",
        {
          artifactId: artifact.artifactId,
          artifactType,
          contentKind: "text",
          content: html,
          artifactMetadata,
        }
      );
    }

    if (artifactType === "gif" || artifactType === "mp4") {
      if (blob.size <= PLACEHOLDER_MEDIA_SIZE_THRESHOLD) {
        return buildResolution(
          "backend_placeholder",
          `${artifactType.toUpperCase()} artifact is still placeholder media.`
        );
      }
      return buildResolution(
        "backend_ready",
        `Loaded backend ${artifactType.toUpperCase()} media.`,
        {
          artifactId: artifact.artifactId,
          artifactType,
          contentKind: "media",
          content: null,
          blob,
          artifactMetadata,
        }
      );
    }

    if (defaultResolution) {
      return defaultResolution;
    }

    return buildResolution(
      "backend_error",
      `Unsupported artifact type for capability resolver: ${artifactType}.`
    );
  } catch (error) {
    return buildResolution(
      "backend_error",
      `Failed to parse backend artifact: ${
        error instanceof Error ? error.message : "unknown error"
      }.`,
      null
    );
  }
}
