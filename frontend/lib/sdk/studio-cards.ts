import { apiFetch, toApiError } from "./client";

export type StudioCardId =
  | "courseware_ppt"
  | "word_document"
  | "interactive_quick_quiz"
  | "interactive_games"
  | "knowledge_mindmap"
  | "demonstration_animations"
  | "speaker_notes"
  | "classroom_qa_simulator";

export type StudioCardReadiness =
  | "ready"
  | "foundation_ready"
  | "protocol_pending";

export interface StudioCardAction {
  type: string;
  label: string;
  notes?: string;
}

export interface StudioCardCapability {
  id: string;
  title: string;
  readiness: StudioCardReadiness;
  context_mode: "session" | "artifact" | "hybrid";
  execution_mode: "session_command" | "artifact_create" | "composite";
  primary_capabilities?: string[];
  related_capabilities?: string[];
  artifact_types?: string[];
  session_output_type?: "ppt" | "word" | "both";
  requires_source_artifact: boolean;
  supports_chat_refine: boolean;
  supports_selection_context: boolean;
  config_fields?: Array<Record<string, unknown>>;
  actions: StudioCardAction[];
  notes?: string;
}

export interface StudioCardExecutionBinding {
  command?: string;
  endpoint?: string;
  bound_config_keys?: string[];
  pending_config_keys?: string[];
  result_fields?: string[];
  notes?: string;
}

export interface StudioCardExecutionPlan {
  card_id: string;
  readiness: StudioCardReadiness;
  initial_binding: StudioCardExecutionBinding;
  refine_binding?: StudioCardExecutionBinding;
  source_binding?: StudioCardExecutionBinding;
}

export interface StudioCardExecutionPreviewRequest {
  project_id: string;
  config?: Record<string, unknown>;
  visibility?: "private" | "project-visible" | "shared";
  source_artifact_id?: string;
  rag_source_ids?: string[];
  client_session_id?: string;
  run_id?: string;
}

export interface StudioCardRefineRequest {
  project_id: string;
  artifact_id?: string;
  session_id?: string;
  message?: string;
  config?: Record<string, unknown>;
  visibility?: "private" | "project-visible" | "shared";
  source_artifact_id?: string;
  rag_source_ids?: string[];
}

export interface StudioCardSourceArtifact {
  id: string;
  project_id?: string;
  type: string;
  title?: string;
  visibility?: string;
  based_on_version_id?: string;
  session_id?: string;
  updated_at?: string;
}

export interface StudioCardTurnRequest {
  project_id: string;
  artifact_id: string;
  teacher_answer: string;
  config?: Record<string, unknown>;
  rag_source_ids?: string[];
  turn_anchor?: string;
}

export interface StudioCardTurnResult {
  turn_anchor: string;
  student_profile: string;
  student_question: string;
  teacher_answer: string;
  feedback: string;
  score: number;
  next_focus?: string;
}

export interface AnimationPlacementRecommendationRequest {
  project_id: string;
  artifact_id: string;
  ppt_artifact_id: string;
}

export interface AnimationPlacementConfirmRequest {
  project_id: string;
  artifact_id: string;
  ppt_artifact_id: string;
  page_numbers: number[];
  slot: string;
}

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message: string;
};

async function parseResponse<T>(
  response: Response,
  fallbackMessage: string
): Promise<T> {
  if (!response.ok) {
    let payload: unknown = { message: fallbackMessage };
    try {
      payload = await response.json();
    } catch {
      // Keep fallback payload when no JSON body exists.
    }
    throw toApiError(payload, response.status);
  }
  return (await response.json()) as T;
}

export const studioCardsApi = {
  async getCatalog(): Promise<
    ApiEnvelope<{ studio_cards: StudioCardCapability[] }>
  > {
    const response = await apiFetch("/api/v1/generate/studio-cards");
    return parseResponse<ApiEnvelope<{ studio_cards: StudioCardCapability[] }>>(
      response,
      "获取 Studio 卡片目录失败"
    );
  },

  async getCard(
    cardId: string
  ): Promise<ApiEnvelope<{ studio_card: StudioCardCapability }>> {
    const response = await apiFetch(
      `/api/v1/generate/studio-cards/${encodeURIComponent(cardId)}`
    );
    return parseResponse<ApiEnvelope<{ studio_card: StudioCardCapability }>>(
      response,
      "获取 Studio 卡片详情失败"
    );
  },

  async getExecutionPlan(
    cardId: string
  ): Promise<ApiEnvelope<{ execution_plan: StudioCardExecutionPlan }>> {
    const response = await apiFetch(
      `/api/v1/generate/studio-cards/${encodeURIComponent(cardId)}/execution-plan`
    );
    return parseResponse<
      ApiEnvelope<{ execution_plan: StudioCardExecutionPlan }>
    >(response, "获取 Studio 卡片执行协议失败");
  },

  async getExecutionPreview(
    cardId: string,
    body: StudioCardExecutionPreviewRequest
  ): Promise<ApiEnvelope<{ execution_preview: Record<string, unknown> }>> {
    const response = await apiFetch(
      `/api/v1/generate/studio-cards/${encodeURIComponent(cardId)}/execution-preview`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    return parseResponse<
      ApiEnvelope<{ execution_preview: Record<string, unknown> }>
    >(response, "获取 Studio 卡片执行预览失败");
  },

  async execute(
    cardId: string,
    body: StudioCardExecutionPreviewRequest
  ): Promise<ApiEnvelope<{ execution_result: Record<string, unknown> }>> {
    const response = await apiFetch(
      `/api/v1/generate/studio-cards/${encodeURIComponent(cardId)}/execute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    return parseResponse<
      ApiEnvelope<{ execution_result: Record<string, unknown> }>
    >(response, "执行 Studio 卡片失败");
  },

  async createDraft(
    cardId: string,
    body: StudioCardExecutionPreviewRequest
  ): Promise<ApiEnvelope<{ execution_result: Record<string, unknown> }>> {
    const response = await apiFetch(
      `/api/v1/generate/studio-cards/${encodeURIComponent(cardId)}/draft`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    return parseResponse<
      ApiEnvelope<{ execution_result: Record<string, unknown> }>
    >(response, "创建 Studio 卡片草稿失败");
  },

  async refine(
    cardId: string,
    body: StudioCardRefineRequest
  ): Promise<ApiEnvelope<{ card_id: string; session_id?: string }>> {
    const response = await apiFetch(
      `/api/v1/generate/studio-cards/${encodeURIComponent(cardId)}/refine`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    return parseResponse<ApiEnvelope<{ card_id: string; session_id?: string }>>(
      response,
      "执行 Studio 卡片 refine 失败"
    );
  },

  async refineArtifact(
    cardId: string,
    body: StudioCardRefineRequest
  ): Promise<ApiEnvelope<{ execution_result: Record<string, unknown> }>> {
    const response = await apiFetch(
      `/api/v1/generate/studio-cards/${encodeURIComponent(cardId)}/refine`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    return parseResponse<
      ApiEnvelope<{ execution_result: Record<string, unknown> }>
    >(response, "执行结构化 Studio 卡片 refine 失败");
  },

  async getSources(
    cardId: string,
    projectId: string,
    sessionId?: string | null
  ): Promise<ApiEnvelope<{ sources: StudioCardSourceArtifact[] }>> {
    const params = new URLSearchParams({ project_id: projectId });
    if (sessionId?.trim()) {
      params.set("session_id", sessionId.trim());
    }
    const response = await apiFetch(
      `/api/v1/generate/studio-cards/${encodeURIComponent(cardId)}/sources?${params.toString()}`
    );
    return parseResponse<ApiEnvelope<{ sources: StudioCardSourceArtifact[] }>>(
      response,
      "获取 Studio 卡片源成果失败"
    );
  },

  async turn(body: StudioCardTurnRequest): Promise<
    ApiEnvelope<{
      artifact: Record<string, unknown>;
      turn_result: StudioCardTurnResult;
    }>
  > {
    const response = await apiFetch(
      "/api/v1/generate/studio-cards/classroom_qa_simulator/turn",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    return parseResponse<
      ApiEnvelope<{
        artifact: Record<string, unknown>;
        turn_result: StudioCardTurnResult;
      }>
    >(response, "推进课堂问答模拟失败");
  },

  async recommendAnimationPlacement(
    body: AnimationPlacementRecommendationRequest
  ): Promise<
    ApiEnvelope<{
      recommendation: Record<string, unknown>;
      artifact: Record<string, unknown>;
    }>
  > {
    const response = await apiFetch(
      "/api/v1/generate/studio-cards/demonstration_animations/recommend-placement",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    return parseResponse<
      ApiEnvelope<{
        recommendation: Record<string, unknown>;
        artifact: Record<string, unknown>;
      }>
    >(response, "获取动画插入推荐失败");
  },

  async confirmAnimationPlacement(
    body: AnimationPlacementConfirmRequest
  ): Promise<
    ApiEnvelope<{
      placements: Record<string, unknown>[];
      artifact: Record<string, unknown>;
      ppt_artifact?: Record<string, unknown>;
    }>
  > {
    const response = await apiFetch(
      "/api/v1/generate/studio-cards/demonstration_animations/confirm-placement",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    return parseResponse<
      ApiEnvelope<{
        placements: Record<string, unknown>[];
        artifact: Record<string, unknown>;
        ppt_artifact?: Record<string, unknown>;
      }>
    >(response, "记录动画插入关系失败");
  },
};
