import type { components } from "@/lib/sdk/types";

type Artifact = components["schemas"]["Artifact"];

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
  artifactKind?: string;
  title: string;
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
  ppt: "课件",
  word: "文档",
  mindmap: "导图",
  outline: "互动游戏",
  quiz: "小测",
  summary: "讲稿",
  animation: "演示动画",
  handout: "学情预演",
};

const GENERIC_ARTIFACT_TITLES = new Set([
  "演示动画",
  "教学动画",
  "科普动画",
  "动画",
  "动画占位",
  "animation",
  "animation placeholder",
]);

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

function readContentSnapshotTitle(metadata: Artifact["metadata"]): string | null {
  const snapshot = readMetadataField(metadata, "content_snapshot");
  if (!snapshot || typeof snapshot !== "object") return null;
  const title = (snapshot as Record<string, unknown>).title;
  if (typeof title !== "string") return null;
  const normalized = title.trim();
  return normalized || null;
}

function sanitizeHistoryTitle(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (GENERIC_ARTIFACT_TITLES.has(normalized.toLowerCase())) return null;
  return normalized;
}

function deriveArtifactHistoryTitle(
  artifact: Artifact,
  toolType: GenerationToolType
): string | null {
  const metadataTitle = sanitizeHistoryTitle(
    typeof readMetadataField(artifact.metadata, "title") === "string"
      ? (readMetadataField(artifact.metadata, "title") as string)
      : null
  );
  if (metadataTitle) return metadataTitle;

  if (toolType === "animation") {
    const topic = sanitizeHistoryTitle(
      typeof readMetadataField(artifact.metadata, "topic") === "string"
        ? (readMetadataField(artifact.metadata, "topic") as string)
        : null
    );
    if (topic) return topic;

    const snapshotTitle = sanitizeHistoryTitle(
      readContentSnapshotTitle(artifact.metadata)
    );
    if (snapshotTitle) return snapshotTitle;
  }

  const runTitle = sanitizeHistoryTitle(
    typeof readMetadataField(artifact.metadata, "run_title") === "string"
      ? (readMetadataField(artifact.metadata, "run_title") as string)
      : null
  );
  if (runTitle) return runTitle;

  return null;
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
  const derivedTitle = deriveArtifactHistoryTitle(artifact, toolType);
  const title = derivedTitle || `${titlePrefix} ${artifact.id.slice(0, 8)}`;

  return {
    artifactId: artifact.id,
    sessionId: artifact.session_id ?? null,
    toolType,
    artifactType: artifact.type,
    artifactKind,
    title,
    status,
    createdAt: artifact.updated_at ?? artifact.created_at,
    basedOnVersionId: artifact.based_on_version_id ?? null,
    storagePath: artifact.storage_path,
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
    ? artifacts.filter((item) => item.session_id === sessionId)
    : artifacts;

  const sorted = [...filtered].sort((a, b) => {
    const bTs = new Date(b.updated_at ?? b.created_at).getTime();
    const aTs = new Date(a.updated_at ?? a.created_at).getTime();
    return bTs - aTs;
  });

  for (const artifact of sorted) {
    const item = toArtifactHistoryItem(artifact);
    grouped[item.toolType].push(item);
  }

  return grouped;
}
