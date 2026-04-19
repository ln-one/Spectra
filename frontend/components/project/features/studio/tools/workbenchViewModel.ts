import type { ToolFlowContext } from "./types";
import type { ArtifactWorkbenchViewModel } from "./ArtifactWorkbenchShell";

function readArtifactContent(flowContext?: ToolFlowContext): Record<string, unknown> | null {
  const content = flowContext?.resolvedArtifact?.content;
  if (!content || typeof content !== "object") return null;
  return content as Record<string, unknown>;
}

function getCardId(flowContext?: ToolFlowContext): string {
  const fromCapability = flowContext?.cardCapability?.id?.trim();
  if (fromCapability) return fromCapability;

  const fromDisplay = flowContext?.display?.studioCardId?.trim();
  if (fromDisplay) return fromDisplay;

  const toolId = flowContext?.display?.toolId;
  if (toolId === "summary") return "speaker_notes";
  if (toolId === "quiz") return "interactive_quick_quiz";
  if (toolId === "outline") return "interactive_games";
  if (toolId === "mindmap") return "knowledge_mindmap";
  if (toolId === "handout") return "classroom_qa_simulator";
  if (toolId === "word") return "word_document";
  if (toolId === "animation") return "demonstration_animations";

  const contentKind = readArtifactContent(flowContext)?.kind;
  if (contentKind === "speaker_notes") return "speaker_notes";
  if (contentKind === "word_document" || contentKind === "teaching_document") {
    return "word_document";
  }
  if (contentKind === "quiz") return "interactive_quick_quiz";
  if (contentKind === "mindmap") return "knowledge_mindmap";
  if (contentKind === "classroom_qa_simulator") return "classroom_qa_simulator";
  if (contentKind === "interactive_game") return "interactive_games";
  if (contentKind === "animation_storyboard") return "demonstration_animations";

  const artifactType = flowContext?.resolvedArtifact?.artifactType;
  if (artifactType === "docx") return "word_document";
  if (artifactType === "summary") return "speaker_notes";
  if (artifactType === "exercise") return "interactive_quick_quiz";
  if (artifactType === "html") return "interactive_games";
  if (artifactType === "gif" || artifactType === "mp4") return "demonstration_animations";
  if (artifactType === "mindmap") return "knowledge_mindmap";
  if (artifactType === "handout") return "classroom_qa_simulator";

  return "";
}

function getArtifactType(flowContext?: ToolFlowContext): string {
  const artifactType = flowContext?.resolvedArtifact?.artifactType;
  return typeof artifactType === "string" ? artifactType.trim().toLowerCase() : "";
}

function getProductTitle(cardId: string, flowContext?: ToolFlowContext): string {
  const displayTitle = flowContext?.display?.productTitle?.trim();
  if (displayTitle) return displayTitle;

  switch (cardId) {
    case "word_document":
      return "教案";
    case "speaker_notes":
      return "讲稿备注";
    case "interactive_quick_quiz":
      return "随堂小测";
    case "knowledge_mindmap":
      return "知识导图";
    case "classroom_qa_simulator":
      return "学情预演";
    case "interactive_games":
      return "互动游戏";
    case "demonstration_animations":
      return "演示动画";
    default:
      return "当前成果";
  }
}

function formatSourceReference(
  flowContext: ToolFlowContext | undefined,
  sourceId: string | null
): string {
  if (!sourceId) return "";
  const matched = (flowContext?.sourceOptions ?? []).find((item) => item.id === sourceId);
  const title = matched?.title?.trim();
  return title ? `${title}` : sourceId;
}

function normalizeBindingStatusLabel(status: string): string {
  switch (status.trim()) {
    case "bound":
    case "ready":
      return "已绑定";
    case "pending":
      return "待绑定";
    case "partial":
      return "部分绑定";
    default:
      return status.trim();
  }
}

function getSourceBindingStatus(flowContext?: ToolFlowContext): string {
  const cardId = getCardId(flowContext);
  const artifactType = getArtifactType(flowContext);
  const content = readArtifactContent(flowContext);
  const directSourceId =
    flowContext?.selectedSourceId ??
    flowContext?.latestArtifacts?.[0]?.sourceArtifactId ??
    (content && typeof content.source_artifact_id === "string"
      ? content.source_artifact_id.trim()
      : null);
  const sourceLabel = formatSourceReference(flowContext, directSourceId);
  const direct = flowContext?.sourceBinding;
  if (direct && typeof direct.status === "string" && direct.status.trim()) {
    const label = normalizeBindingStatusLabel(direct.status);
    return sourceLabel ? `已绑定来源成果：${sourceLabel}` : `当前绑定状态：${label}`;
  }
  const binding = content?.source_binding;
  if (binding && typeof binding === "object") {
    const row = binding as Record<string, unknown>;
    if (typeof row.status === "string" && row.status.trim()) {
      const label = normalizeBindingStatusLabel(row.status);
      return sourceLabel ? `已绑定来源成果：${sourceLabel}` : `当前绑定状态：${label}`;
    }
  }
  return flowContext?.requiresSourceArtifact
    ? "当前需要先绑定来源成果。"
    : cardId === "demonstration_animations"
      ? sourceLabel
        ? artifactType === "gif"
          ? `当前已绑定 PPT 来源：${sourceLabel}，可继续执行 placement。`
          : `当前已绑定 PPT 来源：${sourceLabel}；如需 placement，请先生成 GIF 版动画。`
        : "动画生成本身不依赖 PPT；如需 placement，请先绑定一个 PPT 成果。"
    : "当前卡片无需额外绑定来源成果。";
}

function getLineageSummary(flowContext?: ToolFlowContext): string {
  const cardId = getCardId(flowContext);
  const currentTitle = getProductTitle(cardId, flowContext);
  const direct = flowContext?.provenance;
  const provenance =
    direct && typeof direct === "object" ? direct : readArtifactContent(flowContext)?.provenance;
  if (provenance && typeof provenance === "object") {
    const row = provenance as Record<string, unknown>;
    const sourceIds = Array.isArray(row.created_from_artifact_ids)
      ? row.created_from_artifact_ids.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        )
      : [];
    if (sourceIds.length > 0) {
      const sourceTitle = formatSourceReference(flowContext, sourceIds[0]);
      return `从 ${sourceTitle || sourceIds[0]} 延展为${currentTitle}`;
    }
    const replacesArtifactId =
      typeof row.replaces_artifact_id === "string" ? row.replaces_artifact_id : "";
    if (replacesArtifactId.trim()) {
      return "当前成果基于上一版内容继续迭代。";
    }
  }
  const content = readArtifactContent(flowContext);
  const sourceArtifactId =
    content && typeof content.source_artifact_id === "string"
      ? content.source_artifact_id.trim()
      : "";
  if (sourceArtifactId) {
    const sourceTitle = formatSourceReference(flowContext, sourceArtifactId);
    return `从 ${sourceTitle || sourceArtifactId} 延展为${currentTitle}`;
  }
  return "当前还没有可展示的生成链信息。";
}

function getArtifactSummary(flowContext?: ToolFlowContext): string {
  const cardId = getCardId(flowContext);
  const artifactType = getArtifactType(flowContext);
  switch (cardId) {
    case "word_document":
      return "教案工作台已就绪，可预览、加入来源、导出并继续微调。";
    case "speaker_notes":
      return "讲稿工作面已就绪，可按页查看并微调段落。";
    case "interactive_quick_quiz":
      return "单题工作面已就绪，可答题、切题并微调当前题。";
    case "knowledge_mindmap":
      return "导图工作面已就绪，可选中节点并继续扩展结构。";
    case "classroom_qa_simulator":
      return "课堂预演工作面已就绪，可继续追问并推进下一轮。";
    case "interactive_games":
      return "游戏工作面已就绪，可试玩、微调或导出当前成果。";
    case "demonstration_animations":
      if (artifactType === "gif") {
        return flowContext?.selectedSourceId
          ? "GIF 动画成果已就绪，可继续 recommendation / placement，或导出正式成果。"
          : "GIF 动画成果已就绪；如需 placement，请先绑定一个 PPT 成果。";
      }
      if (artifactType === "mp4" || artifactType === "html") {
        return "正式动画成果已就绪，可导出或继续 structured refine；如需 placement，请生成 GIF 版动画。";
      }
      return "动画成果与 runtime 预览已就绪，可继续导出、placement 或按规格生成新版。";
    default:
      return "当前工作面已准备好继续操作。";
  }
}

function getCurrentArtifactTitle(flowContext?: ToolFlowContext): string {
  const latestArtifact = flowContext?.latestArtifacts?.[0];
  const latestTitle = latestArtifact?.title?.trim();
  if (latestTitle) return latestTitle;

  const content = readArtifactContent(flowContext);
  const contentTitle =
    content && typeof content.title === "string" ? content.title.trim() : "";
  if (contentTitle) return contentTitle;

  return getProductTitle(getCardId(flowContext), flowContext);
}

function getCurrentSurfaceLabel(flowContext?: ToolFlowContext): string {
  switch (getCardId(flowContext)) {
    case "word_document":
      return "教案工作台";
    case "speaker_notes":
      return "提词器式讲稿工作面";
    case "interactive_quick_quiz":
      return "单题沉浸式工作面";
    case "knowledge_mindmap":
      return "结构导图工作面";
    case "classroom_qa_simulator":
      return "多轮课堂预演工作面";
    case "interactive_games":
      return "可试玩互动游戏工作面";
    case "demonstration_animations":
      return "动画成果与 placement 工作面";
    default:
      return "成果工作面";
  }
}

function getDocumentSummaryFallback(flowContext?: ToolFlowContext): string {
  const latestArtifact = flowContext?.latestArtifacts?.[0];
  const latestTitle = latestArtifact?.title?.trim();
  if (latestTitle) {
    return `${latestTitle} 已生成，可继续微调或导出。`;
  }
  const content = readArtifactContent(flowContext);
  const documentTitle =
    content && typeof content.title === "string" ? content.title.trim() : "";
  if (documentTitle) {
    return `${documentTitle} 已生成，可继续微调、加入来源或导出。`;
  }
  return "已生成教案，可继续微调、加入来源或导出。";
}

function getSummary(
  flowContext: ToolFlowContext | undefined,
  fallback: string
): string {
  const content = readArtifactContent(flowContext);
  const summary =
    content && typeof content.summary === "string" ? content.summary.trim() : "";
  if (summary) return summary;
  if (flowContext?.display?.studioCardId === "word_document") {
    return getDocumentSummaryFallback(flowContext);
  }
  return fallback;
}

function getRecommendedAction(flowContext?: ToolFlowContext): string {
  const nextAction = flowContext?.latestRunnableState?.next_action;
  const cardId = getCardId(flowContext);
  const artifactType = getArtifactType(flowContext);

  if (nextAction === "follow_up_turn") return "继续追问，推进下一轮课堂预演。";
  if (nextAction === "answer_or_refine") return "先答题，或继续微调当前题。";
  if (nextAction === "refine" && cardId === "word_document") {
    return "继续微调教案，或导出正式产物。";
  }
  if (nextAction === "refine" && cardId === "speaker_notes") return "继续微调讲稿。";
  if (nextAction === "refine" && cardId === "knowledge_mindmap") {
    return "选择节点后继续结构化编辑。";
  }
  if (nextAction === "placement" && cardId === "demonstration_animations") {
    if (artifactType === "mp4" || artifactType === "html") {
      return "当前成果仅支持导出；如需 placement，请先生成 GIF 版动画。";
    }
    return flowContext?.selectedSourceId
      ? "当前动画已生成，可先推荐投放位置或直接确认插入 PPT。"
      : "当前动画已生成；如需 placement，请先绑定一个 PPT 成果。";
  }
  if (
    cardId === "interactive_games" &&
    flowContext?.capabilityStatus === "protocol_limited"
  ) {
    return "当前结果来自冻结兼容区，只允许试玩、导出或走正式 replacement refine。";
  }
  if (
    cardId === "classroom_qa_simulator" &&
    flowContext?.workflowState === "ready_to_execute"
  ) {
    return "先执行课堂预演，生成首轮真实课堂对话。";
  }
  if (cardId === "classroom_qa_simulator" && flowContext?.canFollowUpTurn) {
    return "继续追问，推进下一轮课堂预演。";
  }
  if (cardId === "word_document") return "继续微调教案，或导出正式产物。";
  if (cardId === "speaker_notes") return "继续微调讲稿。";
  if (cardId === "interactive_quick_quiz") return "先答题，或继续微调当前题。";
  if (cardId === "knowledge_mindmap") return "选择节点后继续结构化编辑。";
  if (cardId === "classroom_qa_simulator") return "继续追问，推进下一轮课堂预演。";
  if (cardId === "interactive_games") return "继续试玩并微调玩法，或导出当前成果。";
  if (cardId === "demonstration_animations") {
    if (artifactType === "gif") {
      return flowContext?.selectedSourceId
        ? "继续推荐投放、确认插入，或导出正式动画。"
        : "当前 GIF 动画已生成；如需 placement，请先绑定一个 PPT 成果。";
    }
    if (artifactType === "mp4" || artifactType === "html") {
      return "先导出正式动画；如需 placement，请生成 GIF 成果。";
    }
    return flowContext?.selectedSourceId
      ? "继续推荐投放、确认插入，或按规格生成新版动画。"
      : "先导出正式动画；如需 placement，请先绑定一个 PPT 成果。";
  }
  return "根据当前成果继续下一步操作。";
}

function getNextStepSummary(flowContext?: ToolFlowContext): string {
  const artifactType = getArtifactType(flowContext);
  switch (getCardId(flowContext)) {
    case "speaker_notes":
      return "下一步可继续进入正式文档、随堂小测、知识导图或课堂预演。";
    case "word_document":
      return "下一步可继续导出教案，或回到讲稿与课堂预演继续打磨表达。";
    case "interactive_quick_quiz":
      return "下一步可继续微调当前题，或带着题目重点进入课堂预演。";
    case "knowledge_mindmap":
      return "下一步可继续扩展节点，或带着知识结构进入课堂预演。";
    case "classroom_qa_simulator":
      return "下一步可继续追问，或回到讲稿和文档调整课堂表达策略。";
    case "interactive_games":
      return "下一步可继续微调玩法，或带着当前成果回到课堂工作流继续组合使用。";
    case "demonstration_animations":
      if (artifactType === "gif") {
        return flowContext?.selectedSourceId
          ? "下一步可继续 placement、导出正式动画，或回到讲稿和课件工作流继续组合使用。"
          : "下一步可先绑定一个 PPT 成果，再执行 placement 或导出正式动画。";
      }
      if (artifactType === "mp4" || artifactType === "html") {
        return "下一步可导出正式动画；若要 placement，请生成 GIF 并绑定 PPT。";
      }
      return "下一步可继续 placement、导出正式动画，或回到讲稿和课件工作流继续组合使用。";
    default:
      return "下一步可围绕当前成果继续微调、导出或进入后续卡片。";
  }
}

export function buildArtifactWorkbenchViewModel(
  flowContext: ToolFlowContext | undefined,
  lastGeneratedAt: string | null,
  fallbackSummary: string
): ArtifactWorkbenchViewModel {
  return {
    currentArtifactTitle: getCurrentArtifactTitle(flowContext),
    currentSurfaceLabel: getCurrentSurfaceLabel(flowContext),
    summary: getSummary(flowContext, fallbackSummary),
    lastGeneratedAt,
    recommendedAction: getRecommendedAction(flowContext),
    sourceBindingStatus: getSourceBindingStatus(flowContext),
    lineageSummary: getLineageSummary(flowContext),
    artifactSummary: getArtifactSummary(flowContext),
    nextStepSummary: getNextStepSummary(flowContext),
  };
}
