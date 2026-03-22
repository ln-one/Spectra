"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkflowStepper } from "@/components/project/shared";
import type { ToolPanelProps } from "./types";
import { FOCUS_OPTIONS, getReadinessLabel, MINDMAP_STEPS } from "./mindmap/constants";
import { ConfigStep } from "./mindmap/ConfigStep";
import { GenerateStep } from "./mindmap/GenerateStep";
import { PreviewStep } from "./mindmap/PreviewStep";
import {
  countNodes,
  createBaseTree,
  findNodeById,
  injectChildren,
} from "./mindmap/tree-utils";
import type { MindNode, MindmapFocus, MindmapStep } from "./mindmap/types";
import { useWorkflowStepSync } from "./useWorkflowStepSync";

export function MindmapToolPanel({
  toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const [activeStep, setActiveStep] = useState<MindmapStep>("config");
  useWorkflowStepSync(activeStep, setActiveStep, flowContext);
  const [topic, setTopic] = useState("鍖栧鍙嶅簲閫熺巼");
  const [depth, setDepth] = useState("3");
  const [focus, setFocus] = useState<MindmapFocus>("concept");
  const [targetAudience, setTargetAudience] = useState("楂樹竴");
  const [selectedId, setSelectedId] = useState("root");
  const [tree, setTree] = useState<MindNode>(() => createBaseTree(topic, focus, 3));
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  useEffect(() => {
    onDraftChange?.({
      topic,
      depth: Number(depth),
      focus,
      target_audience: targetAudience,
      selected_id: selectedId,
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    depth,
    flowContext?.selectedSourceId,
    focus,
    onDraftChange,
    selectedId,
    targetAudience,
    topic,
  ]);

  const totalNodeCount = useMemo(() => countNodes(tree), [tree]);
  const selectedNodeLabel = useMemo(
    () => findNodeById(tree, selectedId)?.label ?? "鏈€夋嫨",
    [selectedId, tree]
  );
  const focusLabel =
    FOCUS_OPTIONS.find((item) => item.value === focus)?.label ?? "姒傚康鍏崇郴";

  const handleGenerate = async () => {
    const generatedTree = createBaseTree(
      topic.trim() || "鏈懡鍚嶄富棰?",
      focus,
      Number(depth)
    );
    setTree(generatedTree);
    setSelectedId("root");

    if (!flowContext?.onExecute) {
      setLastGeneratedAt(new Date().toISOString());
      setActiveStep("preview");
      return;
    }

    setIsGenerating(true);
    try {
      await flowContext.onExecute();
      setLastGeneratedAt(new Date().toISOString());
      setActiveStep("preview");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-full overflow-hidden rounded-2xl border border-zinc-200 bg-[linear-gradient(160deg,#ffffff,#f8fafc)] shadow-[0_22px_65px_-48px_rgba(15,23,42,0.45)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-zinc-200 px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">
                {toolName}涓夋宸ヤ綔鍙?              </h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                鐢ㄤ笁姝ュ畬鎴愬鍥惧埗浣滐細鍏堣缃紝鍐嶇敓鎴愶紝鏈€鍚庡湪闈㈡澘閲岀湅缁撴灉骞剁粏鍖栥€?              </p>
            </div>
            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] text-zinc-600">
              {getReadinessLabel(flowContext?.readiness)}
            </span>
          </div>


        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <div className="flex h-full min-h-0 gap-4">
          <WorkflowStepper
            className="w-[228px] shrink-0"
            layout="rail"
            currentStep={activeStep}
            steps={MINDMAP_STEPS}
            onStepChange={(stepId) => setActiveStep(stepId as MindmapStep)}
            title="鎬濈淮瀵煎浘娴佺▼"
            subtitle="Workflow"
          />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {activeStep === "config" ? (
            <ConfigStep
              topic={topic}
              depth={depth}
              focus={focus}
              targetAudience={targetAudience}
              focusLabel={focusLabel}
              onTopicChange={setTopic}
              onDepthChange={setDepth}
              onFocusChange={setFocus}
              onTargetAudienceChange={setTargetAudience}
              onNext={() => setActiveStep("generate")}
            />
          ) : null}

          {activeStep === "generate" ? (
            <GenerateStep
              topic={topic}
              depth={depth}
              targetAudience={targetAudience}
              focusLabel={focusLabel}
              flowContext={flowContext}
              isGenerating={isGenerating}
              onBack={() => setActiveStep("config")}
              onGenerate={() => void handleGenerate()}
            />
          ) : null}

          {activeStep === "preview" ? (
            <PreviewStep
              tree={tree}
              selectedId={selectedId}
              selectedNodeLabel={selectedNodeLabel}
              totalNodeCount={totalNodeCount}
              lastGeneratedAt={lastGeneratedAt}
              flowContext={flowContext}
              onSelectNode={setSelectedId}
              onRegenerate={() => setActiveStep("generate")}
              onInjectChildren={() =>
                setTree((prev) => injectChildren(prev, selectedId))
              }
            />
          ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

