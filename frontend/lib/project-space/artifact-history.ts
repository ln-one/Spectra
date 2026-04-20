import type { ArtifactRecord as Artifact } from "@/lib/sdk/project-space/types";

export type GenerationToolType =
  | "ppt"
  | "word"
  | "mindmap"
  | "outline"
  | "quiz"
  | "summary"
  | "animation"
  | "handout";

export interface ArtifactHistoryItem {
  artifactId: string;
  sessionId: string | null;
  toolType: GenerationToolType;
  artifactType: Artifact["type"];
  metadata?: Artifact["metadata"];
  artifactKind?: string;
  title: string;
  metadataTitle?: string | null;
  sourceArtifactId?: string | null;
  status: "completed" | "failed" | "processing" | "pending";
  createdAt: string;
  basedOnVersionId: string | null;
  storagePath?: string;
  runId?: string | null;
  runNo?: number | null;
}

export type ArtifactHistoryByTool = Record<
  GenerationToolType,
  ArtifactHistoryItem[]
>;

function emptyHistory(): ArtifactHistoryByTool {
  return {
    ppt: [],
    word: [],
    mindmap: [],
    outline: [],
    quiz: [],
    summary: [],
    animation: [],
    handout: [],
  };
}

const TOOL_TITLE_MAP: Record<GenerationToolType, string> = {
  ppt: "PPT",
  word: "Word",
  mindmap: "Mindmap",
  outline: "Game",
  quiz: "Quiz",
  summary: "Speaker Notes",
  animation: "Animation",
  handout: "Simulation",
};

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readHeadingFromMarkdown(markdown: unknown): string | null {
  const text = readTrimmedString(markdown);
  if (!text) return null;
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!firstLine) return null;
  const headingMatch = firstLine.match(/^#{1,6}\s+(.+)$/);
  if (headingMatch?.[1]) {
    return headingMatch[1].trim();
  }
  return null;
}

function readNestedTitleFromMetadata(metadata: Artifact["metadata"]): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const row = metadata as Record<string, unknown>;
  const snapshot =
    row.content_snapshot && typeof row.content_snapshot === "object"
      ? (row.content_snapshot as Record<string, unknown>)
      : null;
  if (!snapshot) return null;

  const directTitle =
    readTrimmedString(snapshot.title) ??
    readTrimmedString(snapshot.document_title) ??
    readTrimmedString(snapshot.name);
  if (directTitle) return directTitle;

  const topic =
    readTrimmedString(snapshot.topic) ??
    readTrimmedString((snapshot.lesson_plan as Record<string, unknown> | undefined)?.topic);
  if (topic) return `${topic} 教案`;

  const sourceSnapshot =
    snapshot.source_snapshot && typeof snapshot.source_snapshot === "object"
      ? (snapshot.source_snapshot as Record<string, unknown>)
      : null;
  const sourceTitle = readTrimmedString(sourceSnapshot?.primary_source_title);
  if (sourceTitle) return `${sourceTitle} 教案`;

  const markdownTitle =
    readHeadingFromMarkdown(snapshot.lesson_plan_markdown) ??
    readHeadingFromMarkdown(snapshot.markdown_content);
  if (markdownTitle) return markdownTitle;

  return null;
}

function sanitizeWordDisplayTitle(raw: string): string {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const cleaned = normalized
    .replace(/^第\s*\d+\s*次讲义文档$/i, "")
    .replace(
      /(?:[；;，,]\s*)?(?:standard|high|lesson_plan(?:_v1)?|detail[_ -]?level)\b.*$/i,
      ""
    )
    .replace(/[；;，,\s]+$/g, "")
    .trim();
  return cleaned || normalized;
}

function normalizeStatus(statusRaw: unknown): ArtifactHistoryItem["status"] {
  const normalized =
    typeof statusRaw === "string" ? statusRaw.toLowerCase() : "";
  if (normalized === "failed") return "failed";
  if (normalized === "processing") return "processing";
  if (normalized === "pending") return "pending";
  return "completed";
}

function readMetadataField(
  metadata: Artifact["metadata"],
  key: string
): unknown {
  if (!metadata) return undefined;
  return (metadata as Record<string, unknown>)[key];
}

function readArtifactKind(artifact: Artifact): string | null {
  const rawKind = readMetadataField(artifact.metadata, "kind");
  if (typeof rawKind !== "string") return null;
  const normalized = rawKind.trim();
  return normalized || null;
}

function readStudioCardToolType(
  metadata: Artifact["metadata"]
): GenerationToolType | null {
  const rawToolType = readMetadataField(metadata, "tool_type");
  if (typeof rawToolType !== "string") return null;
  const normalized = rawToolType.trim();
  if (!normalized) return null;

  const studioCardId = normalized.startsWith("studio_card:")
    ? normalized.slice("studio_card:".length)
    : normalized;

  if (studioCardId === "word_document") return "word";
  if (studioCardId === "courseware_ppt") return "ppt";
  if (studioCardId === "knowledge_mindmap") return "mindmap";
  if (studioCardId === "interactive_quick_quiz") return "quiz";
  if (studioCardId === "interactive_games") return "outline";
  if (studioCardId === "speaker_notes") return "summary";
  if (studioCardId === "demonstration_animations") return "animation";
  if (studioCardId === "classroom_qa_simulator") return "handout";
  return null;
}

function readRunNo(metadata: Artifact["metadata"]): number | null {
  const raw = readMetadataField(metadata, "run_no");
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function mapArtifactToToolType(artifact: Artifact): GenerationToolType {
  const metadataOutputType = readMetadataField(
    artifact.metadata,
    "output_type"
  );
  if (
    typeof metadataOutputType === "string" &&
    [
      "ppt",
      "word",
      "mindmap",
      "outline",
      "quiz",
      "summary",
      "animation",
      "handout",
    ].includes(metadataOutputType)
  ) {
    return metadataOutputType as GenerationToolType;
  }

  const studioCardToolType = readStudioCardToolType(artifact.metadata);
  if (studioCardToolType) return studioCardToolType;

  const artifactKind = readArtifactKind(artifact);
  if (artifactKind === "teaching_document") return "word";
  if (artifactKind === "interactive_game") return "outline";
  if (artifactKind === "animation_storyboard") return "animation";
  if (artifactKind === "speaker_notes") return "summary";
  if (artifactKind === "classroom_qa_simulator") return "handout";
  if (artifactKind === "quiz") return "quiz";
  if (artifactKind === "mindmap") return "mindmap";

  switch (artifact.type) {
    case "pptx":
      return "ppt";
    case "docx":
      return "word";
    case "mindmap":
      return "mindmap";
    case "summary":
      return "summary";
    case "exercise":
      return "quiz";
    case "gif":
    case "mp4":
      return "animation";
    case "html":
      return "handout";
    default:
      return "summary";
  }
}

export function toArtifactHistoryItem(artifact: Artifact): ArtifactHistoryItem {
  const toolType = mapArtifactToToolType(artifact);
  const titlePrefix = TOOL_TITLE_MAP[toolType];
  const status = normalizeStatus(
    readMetadataField(artifact.metadata, "status")
  );
  const artifactKind = readArtifactKind(artifact) ?? undefined;
  const metadataTitle = readMetadataField(artifact.metadata, "title");
  const metadataName = readMetadataField(artifact.metadata, "name");
  const metadataRunTitle = readMetadataField(artifact.metadata, "run_title");
  const metadataSourceArtifactId = readMetadataField(
    artifact.metadata,
    "source_artifact_id"
  );
  const nestedTitle = readNestedTitleFromMetadata(artifact.metadata);
  const rawTitle =
    typeof metadataTitle === "string" && metadataTitle.trim()
      ? metadataTitle.trim()
      : typeof metadataName === "string" && metadataName.trim()
        ? metadataName.trim()
        : nestedTitle ??
          (typeof metadataRunTitle === "string" && metadataRunTitle.trim()
            ? metadataRunTitle.trim()
            : toolType === "word"
              ? "未命名教案"
              : `${titlePrefix} 生成记录`)
;
  const title =
    toolType === "word"
      ? sanitizeWordDisplayTitle(rawTitle) || "未命名教案"
      : rawTitle;

  return {
    artifactId: artifact.id,
    sessionId: artifact.sessionId ?? null,
    toolType,
    artifactType: artifact.type,
    metadata: artifact.metadata ?? null,
    artifactKind,
    title,
    metadataTitle:
      typeof metadataTitle === "string" && metadataTitle.trim()
        ? metadataTitle.trim()
        : null,
    sourceArtifactId:
      typeof metadataSourceArtifactId === "string" &&
      metadataSourceArtifactId.trim()
        ? metadataSourceArtifactId.trim()
        : null,
    status,
    createdAt: artifact.createdAt ?? new Date().toISOString(),
    basedOnVersionId: artifact.basedOnVersionId ?? null,
    storagePath: artifact.storagePath ?? undefined,
    runId:
      (readMetadataField(artifact.metadata, "run_id") as string | undefined) ||
      null,
    runNo: readRunNo(artifact.metadata),
  };
}

export function groupArtifactsByTool(
  artifacts: Artifact[],
  sessionId?: string | null
): ArtifactHistoryByTool {
  const grouped = emptyHistory();
  const filtered = sessionId
    ? artifacts.filter((item) => (item.sessionId ?? null) === sessionId)
    : artifacts;

  const sorted = [...filtered].sort((a, b) => {
    return (
      new Date(b.createdAt ?? 0).getTime() -
      new Date(a.createdAt ?? 0).getTime()
    );
  });

  for (const artifact of sorted) {
    const item = toArtifactHistoryItem(artifact);
    grouped[item.toolType].push(item);
  }

  return grouped;
}
