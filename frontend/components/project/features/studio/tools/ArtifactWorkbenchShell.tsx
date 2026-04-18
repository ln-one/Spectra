import type { ReactNode } from "react";
import { CapabilityNotice } from "./CapabilityNotice";
import type { ToolFlowContext } from "./types";

export interface ArtifactWorkbenchViewModel {
  currentArtifactTitle: string;
  currentSurfaceLabel: string;
  summary: string;
  lastGeneratedAt: string | null;
  recommendedAction: string;
  sourceBindingStatus: string;
  lineageSummary: string;
  artifactSummary: string;
  nextStepSummary: string;
}

interface ArtifactWorkbenchShellProps {
  flowContext?: ToolFlowContext;
  viewModel: ArtifactWorkbenchViewModel;
  emptyState: ReactNode;
  children?: ReactNode;
}

function formatGeneratedAt(lastGeneratedAt: string | null): string {
  if (!lastGeneratedAt) {
    return "正在等待首个真实成果返回。";
  }
  return `最近一次生成：${new Date(lastGeneratedAt).toLocaleString()}`;
}

export function ArtifactWorkbenchShell({
  flowContext,
  viewModel,
  emptyState,
  children,
}: ArtifactWorkbenchShellProps) {
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ?? "正在等待后端返回真实内容。";

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <CapabilityNotice status={capabilityStatus} reason={capabilityReason} />

        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-medium tracking-[0.18em] text-zinc-500">
                  当前成果
                </p>
                <p className="text-base font-semibold text-zinc-900">
                  {viewModel.currentArtifactTitle}
                </p>
                <p className="text-xs text-zinc-600">
                  {viewModel.currentSurfaceLabel}
                </p>
              </div>
              <p className="text-[11px] text-zinc-500">
                {formatGeneratedAt(viewModel.lastGeneratedAt)}
              </p>
            </div>
            <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-700">
              当前建议动作：{viewModel.recommendedAction}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <p className="text-xs font-semibold text-zinc-900">来源绑定</p>
              <p className="mt-2 text-xs text-zinc-600">
                {viewModel.sourceBindingStatus}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <p className="text-xs font-semibold text-zinc-900">生成链路</p>
              <p className="mt-2 text-xs text-zinc-600">
                {viewModel.lineageSummary}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <p className="text-xs font-semibold text-zinc-900">成果摘要</p>
              <p className="mt-2 text-xs text-zinc-600">
                {viewModel.summary || viewModel.artifactSummary}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <p className="text-xs font-semibold text-zinc-900">下一步衔接</p>
              <p className="mt-2 text-xs text-zinc-600">
                {viewModel.nextStepSummary}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <p className="text-xs font-semibold text-zinc-900">当前工作面</p>
            <p className="mt-2 text-xs text-zinc-600">
              {viewModel.artifactSummary}
            </p>
          </div>
        </div>

        <div className="mt-4">
          {children ? (
            <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
              {children}
            </div>
          ) : (
            emptyState
          )}
        </div>
      </section>
    </div>
  );
}
