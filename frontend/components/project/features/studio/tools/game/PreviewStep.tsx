import { Loader2 } from "lucide-react";
import type { ToolFlowContext } from "../types";
import { WorkbenchCenteredState } from "../WorkbenchCenteredState";
import { GameSurfaceAdapter, parseGamePayload } from "./GameSurfaceAdapter";

interface PreviewStepProps {
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
}

export function PreviewStep({
  lastGeneratedAt: _lastGeneratedAt,
  flowContext,
}: PreviewStepProps) {
  const payload = parseGamePayload(flowContext?.resolvedArtifact?.content);
  const latestArtifactId =
    flowContext?.resolvedArtifact?.artifactId ??
    flowContext?.latestArtifacts?.[0]?.artifactId ??
    null;
  const isExecuting =
    flowContext?.workflowState === "executing" ||
    flowContext?.isActionRunning === true;
  const hasRunnableRuntime = Boolean(payload.runtime.html);

  if (!hasRunnableRuntime) {
    return isExecuting ? (
      <WorkbenchCenteredState
        tone="rose"
        icon={Loader2}
        loading
        title="正在生成互动游戏"
        description="首个可试玩 sandbox 返回后，这里会直接切成正式工作面。"
        minHeightClassName="min-h-[520px]"
      />
    ) : (
      <WorkbenchCenteredState
        tone="rose"
        title="暂未收到可试玩小游戏"
        description="生成完成后，这里只展示真实 sandbox 工作面。"
        minHeightClassName="min-h-[520px]"
      />
    );
  }

  return (
    <div className="h-full min-h-0 rounded-2xl border border-zinc-200 bg-white p-4">
      <GameSurfaceAdapter
        payload={payload}
        latestArtifactId={latestArtifactId}
        onExportArtifact={flowContext?.onExportArtifact}
      />
    </div>
  );
}
