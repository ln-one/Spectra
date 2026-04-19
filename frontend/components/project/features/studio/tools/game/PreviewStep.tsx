import { ArtifactWorkbenchShell } from "../ArtifactWorkbenchShell";
import type { ToolFlowContext } from "../types";
import { buildArtifactWorkbenchViewModel } from "../workbenchViewModel";
import { GameSurfaceAdapter, parseGamePayload } from "./GameSurfaceAdapter";

interface PreviewStepProps {
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
}

export function PreviewStep({
  lastGeneratedAt,
  flowContext,
}: PreviewStepProps) {
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ?? "正在等待后端返回真实游戏内容。";
  const { html, title, instruction, gamePattern } =
    capabilityStatus === "backend_ready" || capabilityStatus === "protocol_limited"
      ? parseGamePayload(flowContext?.resolvedArtifact?.content)
      : { html: null, title: null, instruction: null, gamePattern: null };
  const latestArtifactId = flowContext?.latestArtifacts?.[0]?.artifactId ?? null;
  const canStructuredRefine = Boolean(
    latestArtifactId && flowContext?.onStructuredRefineArtifact
  );
  const viewModel = buildArtifactWorkbenchViewModel(
    flowContext,
    lastGeneratedAt,
    instruction || "等待后端返回真实游戏内容。"
  );

  return (
    <ArtifactWorkbenchShell
      flowContext={{
        ...flowContext,
        capabilityStatus,
        capabilityReason,
      }}
      viewModel={viewModel}
      emptyState={
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
          <p className="text-sm font-medium text-zinc-700">暂未收到后端真实游戏</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            当前不会渲染前端假游戏。等待后端 HTML 返回后，这里会直接变成可试玩的课堂玩法。
          </p>
        </div>
      }
    >
      <GameSurfaceAdapter
        html={html}
        title={title}
        instruction={instruction}
        gamePattern={gamePattern}
        latestArtifactId={latestArtifactId}
        onStructuredRefine={
          canStructuredRefine
            ? async () => {
                await flowContext?.onStructuredRefineArtifact?.({
                  artifactId: latestArtifactId!,
                  message: instruction || title || "继续完善当前互动玩法",
                  refineMode: "structured_refine",
                  config: {
                    game_pattern: gamePattern ?? undefined,
                  },
                });
              }
            : undefined
        }
        onExportArtifact={flowContext?.onExportArtifact}
      />
    </ArtifactWorkbenchShell>
  );
}
