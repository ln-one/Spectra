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
  outline: "互动游戏",
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

function readMindmapTitleFromMetadata(
  metadata: Artifact["metadata"]
): string | null {
  const snapshot = readMetadataSnapshot(metadata);
  if (!snapshot) return null;

  const directTitle =
    readTrimmedString(snapshot.title) ??
    readTrimmedString(snapshot.topic) ??
    readTrimmedString(snapshot.name) ??
    readTrimmedString(snapshot.root_topic) ??
    readTrimmedString(snapshot.subject);
  if (directTitle) return directTitle;

  const rootNode =
    snapshot.root && typeof snapshot.root === "object" && !Array.isArray(snapshot.root)
      ? (snapshot.root as Record<string, unknown>)
      : null;
  if (rootNode) {
    const rootTitle =
      readTrimmedString(rootNode.title) ??
      readTrimmedString(rootNode.topic) ??
      readTrimmedString(rootNode.name);
    if (rootTitle) return rootTitle;
  }

  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
  for (const node of nodes) {
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    const row = node as Record<string, unknown>;
    const parentId = readTrimmedString(row.parent_id) ?? readTrimmedString(row.parentId);
    if (parentId) continue;
    const rootTitle =
      readTrimmedString(row.title) ??
      readTrimmedString(row.topic) ??
      readTrimmedString(row.name);
    if (rootTitle) return rootTitle;
  }

  return null;
}

function readQuizTitleFromMetadata(
  metadata: Artifact["metadata"]
): string | null {
  const snapshot = readMetadataSnapshot(metadata);
  if (!snapshot) return null;

  const directTitle =
    readTrimmedString(snapshot.title) ??
    readTrimmedString(snapshot.name) ??
    readTrimmedString(snapshot.topic);
  if (directTitle) return directTitle;

  const scope = readTrimmedString(snapshot.scope);
  if (scope) return `${scope} 小测`;
  return null;
}

function readInteractiveGameTitleFromMetadata(
  metadata: Artifact["metadata"]
): string | null {
  const snapshot = readMetadataSnapshot(metadata);
  if (!snapshot) return null;

  const directTitle =
    readTrimmedString(snapshot.title) ??
    readTrimmedString(snapshot.name) ??
    readTrimmedString(snapshot.topic);
  if (directTitle) return directTitle;

  const teachingGoal = readTrimmedString(snapshot.teaching_goal);
  if (teachingGoal) return `${teachingGoal} 互动游戏`;
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

function sanitizeMindmapDisplayTitle(raw: string): string {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const lowered = normalized.toLowerCase();
  const compact = lowered.replace(/\s+/g, "");
  const isPlaceholder =
    lowered === "mindmap" ||
    lowered === "mind map" ||
    lowered === "知识导图" ||
    lowered === "思维导图" ||
    lowered === "未命名导图" ||
    lowered === "未命名思维导图" ||
    lowered === "未命名知识导图" ||
    lowered === "loaded backend mindmap" ||
    compact === "思维导图-preview" ||
    compact === "知识导图-preview" ||
    compact === "mindmap-preview" ||
    compact === "mindmap生成记录";
  if (isPlaceholder) return "";

  const cleaned = normalized
    .replace(/\s*[-·|｜:：]\s*preview$/i, "")
    .replace(/\s*[-·|｜:：]\s*(?:mindmap|知识导图|思维导图)$/i, "")
    .replace(/^(?:mindmap|知识导图|思维导图)\s*[-·|｜:：]\s*/i, "")
    .replace(/[；;，,\s]+$/g, "")
    .trim();

  const cleanedLower = cleaned.toLowerCase();
  if (
    !cleaned ||
    cleanedLower === "mindmap" ||
    cleaned === "知识导图" ||
    cleaned === "思维导图"
  ) {
    return "";
  }
  return cleaned;
}

function sanitizeQuizDisplayTitle(raw: string): string {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const lowered = normalized.toLowerCase();
  const compact = lowered.replace(/\s+/g, "");
  const isPlaceholder =
    lowered === "quiz" ||
    lowered === "随堂小测" ||
    lowered === "课堂小测" ||
    lowered === "未命名小测" ||
    lowered === "未命名 quiz" ||
    lowered === "未命名quiz" ||
    compact === "quiz生成记录" ||
    compact === "quiz-preview" ||
    compact === "随堂小测-preview" ||
    compact === "课堂小测-preview";
  if (isPlaceholder) return "";

  const cleaned = normalized
    .replace(/\s*[-·|｜:：]\s*preview$/i, "")
    .replace(/\s*[-·|｜:：]\s*quiz$/i, "")
    .replace(/^quiz\s*[-·|｜:：]\s*/i, "")
    .replace(/[；;，,\s]+$/g, "")
    .trim();

  const cleanedCompact = cleaned.toLowerCase().replace(/\s+/g, "");
  if (
    !cleaned ||
    cleaned.toLowerCase() === "quiz" ||
    cleaned === "随堂小测" ||
    cleaned === "课堂小测" ||
    cleanedCompact === "quiz生成记录"
  ) {
    return "";
  }
  return cleaned;
}

function sanitizeInteractiveGameDisplayTitle(raw: string): string {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const lowered = normalized.toLowerCase();
  const compact = lowered.replace(/\s+/g, "");
  const isPlaceholder =
    lowered === "game" ||
    lowered === "interactive game" ||
    lowered === "interactivegame" ||
    lowered === "互动游戏" ||
    lowered === "课堂互动游戏" ||
    lowered === "未命名互动游戏" ||
    compact === "game生成记录" ||
    compact === "互动游戏生成记录" ||
    compact === "interactivegame生成记录" ||
    compact === "game-preview" ||
    compact === "互动游戏-preview" ||
    compact === "interactivegame-preview";
  if (isPlaceholder) return "";

  const cleaned = normalized
    .replace(/\s*[-·|｜:：]\s*preview$/i, "")
    .replace(/\s*[-·|｜:：]\s*(?:game|interactive game|互动游戏)$/i, "")
    .replace(/^(?:game|interactive game|互动游戏)\s*[-·|｜:：]\s*/i, "")
    .replace(/[；;，,\s]+$/g, "")
    .trim();

  const cleanedCompact = cleaned.toLowerCase().replace(/\s+/g, "");
  if (
    !cleaned ||
    cleaned.toLowerCase() === "game" ||
    cleaned.toLowerCase() === "interactive game" ||
    cleaned === "互动游戏" ||
    cleanedCompact === "game生成记录" ||
    cleanedCompact === "互动游戏生成记录"
  ) {
    return "";
  }
  return cleaned;
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
  const nestedMindmapTitle = readMindmapTitleFromMetadata(artifact.metadata);
  const nestedQuizTitle = readQuizTitleFromMetadata(artifact.metadata);
  const nestedInteractiveGameTitle = readInteractiveGameTitleFromMetadata(
    artifact.metadata
  );
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
  const mindmapCandidates =
    toolType === "mindmap"
      ? [
          typeof metadataTitle === "string" ? metadataTitle.trim() : "",
          typeof metadataName === "string" ? metadataName.trim() : "",
          nestedMindmapTitle ?? "",
          typeof metadataRunTitle === "string" ? metadataRunTitle.trim() : "",
        ]
          .map(sanitizeMindmapDisplayTitle)
          .filter((value) => Boolean(value))
      : [];
  const quizCandidates =
    toolType === "quiz"
      ? [
          typeof metadataTitle === "string" ? metadataTitle.trim() : "",
          typeof metadataName === "string" ? metadataName.trim() : "",
          nestedQuizTitle ?? "",
          typeof metadataRunTitle === "string" ? metadataRunTitle.trim() : "",
        ]
          .map(sanitizeQuizDisplayTitle)
          .filter((value) => Boolean(value))
      : [];
  const interactiveGameCandidates =
    toolType === "outline"
      ? [
          typeof metadataTitle === "string" ? metadataTitle.trim() : "",
          typeof metadataName === "string" ? metadataName.trim() : "",
          nestedInteractiveGameTitle ?? "",
          typeof metadataRunTitle === "string" ? metadataRunTitle.trim() : "",
        ]
          .map(sanitizeInteractiveGameDisplayTitle)
          .filter((value) => Boolean(value))
      : [];
  const rawTitle =
    toolType === "word"
      ? (wordCandidates[0] ?? "未命名教案")
      : toolType === "mindmap"
        ? (mindmapCandidates[0] ?? `${titlePrefix} 生成记录`)
        : toolType === "quiz"
          ? (quizCandidates[0] ?? `${titlePrefix} 生成记录`)
          : toolType === "outline"
            ? (interactiveGameCandidates[0] ?? `${titlePrefix} 生成记录`)
        : typeof metadataTitle === "string" && metadataTitle.trim()
          ? metadataTitle.trim()
          : typeof metadataName === "string" && metadataName.trim()
          ? metadataName.trim()
          : nestedTitle ??
            (typeof metadataRunTitle === "string" && metadataRunTitle.trim()
              ? metadataRunTitle.trim()
              : `${titlePrefix} 生成记录`);
  const title =
    toolType === "word"
      ? rawTitle || "未命名教案"
      : toolType === "mindmap"
        ? rawTitle || "未命名导图"
        : toolType === "quiz"
          ? rawTitle || "未命名小测"
          : toolType === "outline"
            ? rawTitle || "未命名互动游戏"
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
