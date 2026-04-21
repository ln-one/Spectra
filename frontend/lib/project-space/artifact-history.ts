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
  replacesArtifactId?: string | null;
  supersededByArtifactId?: string | null;
  isCurrent?: boolean | null;
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
  const lowered = normalized.toLowerCase();
  const isPlaceholder =
    /^第\s*\d+\s*次讲义文档(?:[。.!！])?$/i.test(normalized) ||
    lowered === "讲义文档" ||
    lowered === "教学文档" ||
    lowered === "未命名文档" ||
    lowered === "教案" ||
    lowered === "教学教案" ||
    lowered === "未命名教案" ||
    lowered === "word 生成记录" ||
    lowered === "word生成记录";
  if (isPlaceholder) return "";
  const cleaned = normalized
    .replace(/^第\s*\d+\s*次讲义文档(?:[。.!！])?$/i, "")
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

function readMetadataBoolean(
  metadata: Artifact["metadata"],
  key: string
): boolean | null {
  const value = readMetadataField(metadata, key);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return null;
}

function readArtifactKind(artifact: Artifact): string | null {
  const rawKind = readMetadataField(artifact.metadata, "kind");
  if (typeof rawKind !== "string") return null;
  const normalized = rawKind.trim();
  return normalized || null;
}

function readMetadataSnapshot(
  metadata: Artifact["metadata"]
): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const row = metadata as Record<string, unknown>;
  const snapshot = row.content_snapshot;
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    return snapshot as Record<string, unknown>;
  }
  if (typeof snapshot === "string" && snapshot.trim()) {
    try {
      const parsed = JSON.parse(snapshot);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function hasAnimationRuntimeHints(metadata: Artifact["metadata"]): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  const row = metadata as Record<string, unknown>;
  const snapshot = readMetadataSnapshot(metadata);
  const hasRuntimeGraph = (value: unknown): boolean =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);
  return Boolean(
    readTrimmedString(row.runtime_contract) ||
      readTrimmedString(row.runtime_version) ||
      readTrimmedString(row.runtime_graph_version) ||
      hasRuntimeGraph(row.runtime_graph) ||
      (snapshot &&
        (readTrimmedString(snapshot.runtime_contract) ||
          readTrimmedString(snapshot.runtime_version) ||
          readTrimmedString(snapshot.runtime_graph_version) ||
          hasRuntimeGraph(snapshot.runtime_graph)))
  );
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
  const snapshot = readMetadataSnapshot(artifact.metadata);
  const snapshotKind = readTrimmedString(snapshot?.kind);
  if (artifactKind === "teaching_document") return "word";
  if (artifactKind === "interactive_game") return "outline";
  if (artifactKind === "animation_storyboard") return "animation";
  if (artifactKind === "speaker_notes") return "summary";
  if (artifactKind === "classroom_qa_simulator") return "handout";
  if (artifactKind === "quiz") return "quiz";
  if (artifactKind === "mindmap") return "mindmap";
  if (snapshotKind === "interactive_game") return "outline";
  if (snapshotKind === "animation_storyboard") return "animation";
  if (artifact.type === "html" && hasAnimationRuntimeHints(artifact.metadata)) {
    return "animation";
  }

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
      return "outline";
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
  const metadataReplacesArtifactId = readMetadataField(
    artifact.metadata,
    "replaces_artifact_id"
  );
  const metadataSupersededByArtifactId = readMetadataField(
    artifact.metadata,
    "superseded_by_artifact_id"
  );
  const metadataIsCurrent = readMetadataBoolean(artifact.metadata, "is_current");
  const nestedTitle = readNestedTitleFromMetadata(artifact.metadata);
  const wordCandidates =
    toolType === "word"
      ? [
          typeof metadataTitle === "string" ? metadataTitle.trim() : "",
          typeof metadataName === "string" ? metadataName.trim() : "",
          nestedTitle ?? "",
          typeof metadataRunTitle === "string" ? metadataRunTitle.trim() : "",
        ]
          .map(sanitizeWordDisplayTitle)
          .filter((value) => Boolean(value))
      : [];
  const rawTitle =
    toolType === "word"
      ? (wordCandidates[0] ?? "未命名教案")
      : typeof metadataTitle === "string" && metadataTitle.trim()
        ? metadataTitle.trim()
        : typeof metadataName === "string" && metadataName.trim()
          ? metadataName.trim()
          : nestedTitle ??
            (typeof metadataRunTitle === "string" && metadataRunTitle.trim()
              ? metadataRunTitle.trim()
              : `${titlePrefix} 生成记录`);
  const title = toolType === "word" ? rawTitle || "未命名教案" : rawTitle;

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
    replacesArtifactId:
      typeof metadataReplacesArtifactId === "string" &&
      metadataReplacesArtifactId.trim()
        ? metadataReplacesArtifactId.trim()
        : null,
    supersededByArtifactId:
      typeof metadataSupersededByArtifactId === "string" &&
      metadataSupersededByArtifactId.trim()
        ? metadataSupersededByArtifactId.trim()
        : null,
    isCurrent: metadataIsCurrent,
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
