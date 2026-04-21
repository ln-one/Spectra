import { studioCardsApi } from "@/lib/sdk/studio-cards";

export interface CoursewareGenerationConfig {
  prompt: string;
  pageCount: number;
  visualStyle: string;
  layoutMode: "smart" | "classic";
  templateId: string | null;
  visualPolicy: "auto" | "media_required" | "basic_graphics_only";
}

export interface TeachingBriefSnapshot {
  status?: string;
  topic?: string;
  audience?: string;
  duration_minutes?: number | null;
  lesson_hours?: number | null;
  target_pages?: number | null;
  teaching_objectives?: string[];
  knowledge_points?: Array<{ title?: string } | string>;
  global_emphasis?: string[];
  global_difficulties?: string[];
  teaching_strategy?: string;
  style_profile?: {
    template_family?: string;
    visual_tone?: string;
    notes?: string;
  } | null;
  readiness?: {
    missing_fields?: string[];
    can_generate?: boolean;
  } | null;
}

function mapVisualStyleToDiegoPreset(styleId: string): string {
  const normalized = String(styleId || "")
    .trim()
    .toLowerCase();
  const mapping: Record<string, string> = {
    free: "auto",
    wabi: "wabi-sabi",
    brutalist: "neo-brutalism",
    electro: "electro-pop",
    geometric: "geo-bold",
    modernacademic: "contemporary-academic",
    curatorial: "academic-curation",
    warmvc: "warm-vc",
    coolblue: "rational-blue",
    nordic: "nordic-research",
    fluid: "emotional-flow",
    cinema: "cinema-minimal",
    "8bit": "8bit",
  };
  return mapping[normalized] || normalized || "auto";
}

function normalizePageCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 12;
  return Math.min(50, Math.max(1, Math.round(parsed)));
}

export function extractSessionIdFromExecutionResult(
  executionResult: Record<string, unknown>
): string | null {
  const session =
    typeof executionResult.session === "object" &&
    executionResult.session !== null
      ? (executionResult.session as Record<string, unknown>)
      : null;
  return (
    (typeof session?.session_id === "string" && session.session_id) ||
    (typeof session?.id === "string" && session.id) ||
    null
  );
}

export function extractRunIdFromExecutionResult(
  executionResult: Record<string, unknown>
): string | null {
  const run =
    typeof executionResult.run === "object" && executionResult.run !== null
      ? (executionResult.run as Record<string, unknown>)
      : null;
  const runRunId = typeof run?.run_id === "string" ? run.run_id : null;
  return runRunId && runRunId.trim() ? runRunId : null;
}

function normalizeKnowledgePointTitles(
  brief: TeachingBriefSnapshot
): string[] | undefined {
  const raw = brief.knowledge_points ?? [];
  const titles = raw
    .map((item) =>
      typeof item === "string"
        ? item.trim()
        : String(item?.title || "").trim()
    )
    .filter(Boolean);
  return titles.length > 0 ? titles : undefined;
}

export function buildGenerationConfigFromTeachingBrief(
  brief: TeachingBriefSnapshot
): CoursewareGenerationConfig {
  const tone = String(brief.style_profile?.visual_tone || "")
    .trim()
    .toLowerCase();
  const templateFamily = String(brief.style_profile?.template_family || "")
    .trim()
    .toLowerCase();
  const layoutMode =
    templateFamily && templateFamily !== "auto" ? "classic" : "smart";
  const promptSegments = [
    String(brief.topic || "").trim(),
    ...(brief.teaching_objectives || []).slice(0, 2),
  ].filter(Boolean);
  return {
    prompt: promptSegments.join(" | ") || "课程主题",
    pageCount: normalizePageCount(brief.target_pages ?? 12),
    visualStyle: tone || "free",
    layoutMode,
    templateId: layoutMode === "classic" ? templateFamily || null : null,
    visualPolicy: "auto",
  };
}

export async function startCoursewarePptRun(params: {
  projectId: string;
  clientSessionId: string;
  runId?: string | null;
  ragSourceIds?: string[];
  selectedLibraryIds?: string[];
  config: CoursewareGenerationConfig;
  teachingBrief?: TeachingBriefSnapshot | null;
}): Promise<{ sessionId: string; runId: string }> {
  const {
    projectId,
    clientSessionId,
    runId,
    ragSourceIds,
    selectedLibraryIds,
    config,
    teachingBrief,
  } = params;
  const generationMode =
    config.layoutMode === "classic" ? "template" : "scratch";
  const normalizedPageCount = normalizePageCount(config.pageCount);
  const templateId =
    generationMode === "template" ? config.templateId ?? undefined : undefined;
  const stylePreset =
    generationMode === "scratch"
      ? mapVisualStyleToDiegoPreset(config.visualStyle)
      : "auto";
  const executeResponse = await studioCardsApi.execute("courseware_ppt", {
    project_id: projectId,
    client_session_id: clientSessionId,
    run_id: runId ?? undefined,
    selected_file_ids:
      ragSourceIds && ragSourceIds.length > 0
        ? ragSourceIds
        : undefined,
    rag_source_ids:
      ragSourceIds && ragSourceIds.length > 0
        ? ragSourceIds
        : undefined,
    selected_library_ids:
      selectedLibraryIds && selectedLibraryIds.length > 0
        ? selectedLibraryIds
        : undefined,
    config: {
      topic: config.prompt,
      pages: normalizedPageCount,
      target_slide_count: normalizedPageCount,
      generation_mode: generationMode,
      template_id: templateId,
      style_preset: stylePreset,
      visual_policy: config.visualPolicy,
      audience: teachingBrief?.audience,
      target_duration_minutes: teachingBrief?.duration_minutes ?? undefined,
      lesson_hours: teachingBrief?.lesson_hours ?? undefined,
      teaching_strategy: teachingBrief?.teaching_strategy,
      teaching_objectives:
        teachingBrief?.teaching_objectives && teachingBrief.teaching_objectives.length > 0
          ? teachingBrief.teaching_objectives
          : undefined,
      knowledge_points: normalizeKnowledgePointTitles(
        teachingBrief || {}
      ),
      global_emphasis:
        teachingBrief?.global_emphasis && teachingBrief.global_emphasis.length > 0
          ? teachingBrief.global_emphasis
          : undefined,
      global_difficulties:
        teachingBrief?.global_difficulties &&
        teachingBrief.global_difficulties.length > 0
          ? teachingBrief.global_difficulties
          : undefined,
      teaching_brief: teachingBrief ?? undefined,
    },
  });
  const executionResult =
    (executeResponse?.data?.execution_result as Record<string, unknown>) ?? {};
  const sessionId = extractSessionIdFromExecutionResult(executionResult);
  const resolvedRunId = extractRunIdFromExecutionResult(executionResult);
  if (!sessionId) {
    throw new Error("Missing session_id in courseware execution result");
  }
  if (!resolvedRunId) {
    throw new Error("Missing run.run_id in courseware execution result");
  }
  return { sessionId, runId: resolvedRunId };
}

export function isGenerateCoursewareIntent(content: string): boolean {
  const normalized = String(content || "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    /(生成|开始|启动|创建|做一套|出一套).{0,12}(ppt|课件|幻灯片)/i.test(normalized) ||
    /(ppt|课件|幻灯片).{0,12}(生成|开始|启动|创建)/i.test(normalized)
  );
}
