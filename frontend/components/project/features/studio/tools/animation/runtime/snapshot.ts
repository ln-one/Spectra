import type { ToolFlowContext } from "../../types";
import type {
  AnimationArtifactRuntimeSnapshot,
  AnimationSceneOutlineItem,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readSceneOutline(value: unknown): AnimationSceneOutlineItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      title: typeof item.title === "string" ? item.title : "Scene",
      summary: typeof item.summary === "string" ? item.summary : undefined,
    }));
}

interface NormalizeRuntimeOptions {
  allowMissingRuntime: boolean;
}

function normalizeRuntimeSnapshot(
  candidate: Record<string, unknown>,
  options: NormalizeRuntimeOptions
): AnimationArtifactRuntimeSnapshot | null {
  const { allowMissingRuntime } = options;
  const runtimeVersion =
    typeof candidate.runtime_version === "string"
      ? candidate.runtime_version
      : typeof candidate.runtimeVersion === "string"
        ? candidate.runtimeVersion
        : "";
  const componentCode =
    typeof candidate.component_code === "string"
      ? candidate.component_code
      : typeof candidate.componentCode === "string"
        ? candidate.componentCode
        : "";
  const runtimeGraph = isRecord(candidate.runtime_graph)
    ? (candidate.runtime_graph as unknown as AnimationArtifactRuntimeSnapshot["runtimeGraph"])
    : null;

  const sceneOutline = readSceneOutline(
    candidate.scene_outline ?? candidate.sceneOutline
  );
  const durationSeconds =
    typeof candidate.duration_seconds === "number"
      ? candidate.duration_seconds
      : typeof candidate.durationSeconds === "number"
        ? candidate.durationSeconds
        : 6;

  if (runtimeVersion && (componentCode || runtimeGraph)) {
    const runtimePlan = runtimeGraph
      ? null
      : isRecord(candidate.runtime_plan)
        ? candidate.runtime_plan
        : null;
    return {
      runtimeVersion,
      componentCode,
      compileStatus:
        candidate.compile_status === "error"
          ? "error"
          : candidate.compile_status === "success"
            ? "success"
            : "pending",
      compileErrors: Array.isArray(candidate.compile_errors)
        ? candidate.compile_errors
            .filter(isRecord)
            .map((item) => ({
              message: typeof item.message === "string" ? item.message : "Unknown runtime error.",
              line: typeof item.line === "number" ? item.line : undefined,
              column: typeof item.column === "number" ? item.column : undefined,
              ruleId:
                typeof item.rule_id === "string"
                  ? item.rule_id
                  : typeof item.ruleId === "string"
                    ? item.ruleId
                    : undefined,
              source:
                typeof item.source === "string"
                  ? (item.source as AnimationArtifactRuntimeSnapshot["compileErrors"][number]["source"])
                  : undefined,
            }))
        : [],
      runtimePlanVersion:
        typeof candidate.runtime_plan_version === "string"
          ? candidate.runtime_plan_version
          : undefined,
      runtimePlan: runtimePlan,
      runtimeGraphVersion:
        typeof candidate.runtime_graph_version === "string"
          ? candidate.runtime_graph_version
          : undefined,
      runtimeGraph: runtimeGraph,
      runtimeDraftVersion:
        typeof candidate.runtime_draft_version === "string"
          ? candidate.runtime_draft_version
          : undefined,
      runtimeDraft:
        isRecord(candidate.runtime_draft) ? candidate.runtime_draft : null,
      runtimeAttemptCount:
        typeof candidate.runtime_attempt_count === "number"
          ? candidate.runtime_attempt_count
          : undefined,
      runtimeProvider:
        typeof candidate.runtime_provider === "string"
          ? candidate.runtime_provider
          : undefined,
      runtimeModel:
        typeof candidate.runtime_model === "string"
          ? candidate.runtime_model
          : undefined,
      runtimeDiagnostics: isRecord(candidate.runtime_diagnostics)
        ? {
            finishReason:
              typeof candidate.runtime_diagnostics.finish_reason === "string"
                ? candidate.runtime_diagnostics.finish_reason
                : typeof candidate.runtime_diagnostics.finishReason === "string"
                  ? candidate.runtime_diagnostics.finishReason
                  : undefined,
            hasReasoningContent:
              typeof candidate.runtime_diagnostics.has_reasoning_content === "boolean"
                ? candidate.runtime_diagnostics.has_reasoning_content
                : typeof candidate.runtime_diagnostics.hasReasoningContent === "boolean"
                  ? candidate.runtime_diagnostics.hasReasoningContent
                  : undefined,
            rawContentLength:
              typeof candidate.runtime_diagnostics.raw_content_length === "number"
                ? candidate.runtime_diagnostics.raw_content_length
                : typeof candidate.runtime_diagnostics.rawContentLength === "number"
                  ? candidate.runtime_diagnostics.rawContentLength
                  : undefined,
            schemaMode:
              typeof candidate.runtime_diagnostics.schema_mode === "string"
                ? candidate.runtime_diagnostics.schema_mode
                : typeof candidate.runtime_diagnostics.schemaMode === "string"
                  ? candidate.runtime_diagnostics.schemaMode
                  : undefined,
          }
        : undefined,
      runtimeValidationReport: Array.isArray(candidate.runtime_validation_report)
        ? candidate.runtime_validation_report
            .filter(isRecord)
            .map((item) => ({
              stage: typeof item.stage === "string" ? item.stage : "unknown",
              ruleId:
                typeof item.rule_id === "string"
                  ? item.rule_id
                  : typeof item.ruleId === "string"
                    ? item.ruleId
                    : undefined,
              message:
                typeof item.message === "string"
                  ? item.message
                  : "Unknown runtime validation message.",
              line: typeof item.line === "number" ? item.line : undefined,
              column: typeof item.column === "number" ? item.column : undefined,
            }))
        : [],
      runtimeSource:
        typeof candidate.runtime_source === "string"
          ? candidate.runtime_source
          : undefined,
      runtimeContract:
        typeof candidate.runtime_contract === "string"
          ? candidate.runtime_contract
          : undefined,
      familyHint:
        typeof candidate.family_hint === "string" ? candidate.family_hint : undefined,
      sceneOutline,
      usedPrimitives: Array.isArray(candidate.used_primitives)
        ? candidate.used_primitives.filter(
            (item): item is string => typeof item === "string"
          )
        : [],
      generationPromptDigest:
        typeof candidate.generation_prompt_digest === "string"
          ? candidate.generation_prompt_digest
          : undefined,
      durationSeconds,
      rhythm: typeof candidate.rhythm === "string" ? candidate.rhythm : undefined,
      stylePack:
        typeof candidate.style_pack === "string" ? candidate.style_pack : null,
      title: typeof candidate.title === "string" ? candidate.title : undefined,
      summary:
        typeof candidate.summary === "string" ? candidate.summary : undefined,
      metadata: candidate,
    };
  }

  if (allowMissingRuntime) {
    return {
      runtimeVersion: "animation_runtime.v4-missing",
      componentCode: "",
      compileStatus: "error",
      compileErrors: [
        {
          message: "该动画是旧版本 artifact，需要重新生成 runtime。",
          source: "schema",
        },
      ],
      runtimeSource: "missing_runtime",
      runtimeContract: "animation_runtime.v4",
      runtimePlan: null,
      runtimeAttemptCount: 0,
      runtimeProvider: null,
      runtimeModel: null,
      runtimeDiagnostics: null,
      runtimeValidationReport: [],
      familyHint:
        typeof candidate.animation_family === "string"
          ? candidate.animation_family
          : typeof candidate.family_hint === "string"
            ? candidate.family_hint
            : "generic_animation",
      sceneOutline:
        sceneOutline.length > 0
          ? sceneOutline
          : Array.isArray(candidate.scenes)
            ? candidate.scenes
                .filter(isRecord)
                .map((item) => ({
                  title: typeof item.title === "string" ? item.title : "Scene",
                  summary:
                    typeof item.description === "string" ? item.description : undefined,
                }))
            : [],
      usedPrimitives: [],
      durationSeconds,
      rhythm: typeof candidate.rhythm === "string" ? candidate.rhythm : undefined,
      stylePack:
        typeof candidate.style_pack === "string" ? candidate.style_pack : null,
      title: typeof candidate.title === "string" ? candidate.title : undefined,
      summary:
        typeof candidate.summary === "string" ? candidate.summary : undefined,
      requiresRegeneration: true,
      metadata: candidate,
    };
  }

  return null;
}

export function readAnimationRuntimeSnapshot(params: {
  flowContext?: ToolFlowContext;
  serverSpecPreview?: Record<string, unknown> | null;
}): AnimationArtifactRuntimeSnapshot | null {
  const metadata = params.flowContext?.resolvedArtifact?.artifactMetadata;
  const snapshot =
    isRecord(metadata?.content_snapshot) ? metadata.content_snapshot : null;
  if (snapshot) {
    const normalized = normalizeRuntimeSnapshot(snapshot, {
      allowMissingRuntime:
        snapshot.kind === "animation_storyboard" ||
        typeof snapshot.animation_family === "string" ||
        Array.isArray(snapshot.scenes) ||
        Array.isArray(snapshot.steps),
    });
    if (normalized) return normalized;
  }

  const resolved = params.flowContext?.resolvedArtifact;
  if (resolved?.contentKind === "json" && isRecord(resolved.content)) {
    const normalizedFromResolved = normalizeRuntimeSnapshot(
      resolved.content as Record<string, unknown>,
      {
        allowMissingRuntime:
          resolved.content.kind === "animation_storyboard" ||
          typeof resolved.content.animation_family === "string" ||
          Array.isArray(resolved.content.scenes) ||
          Array.isArray(resolved.content.steps),
      }
    );
    if (normalizedFromResolved) return normalizedFromResolved;
  }

  if (isRecord(params.serverSpecPreview)) {
    return normalizeRuntimeSnapshot(params.serverSpecPreview, {
      allowMissingRuntime: false,
    });
  }
  return null;
}
