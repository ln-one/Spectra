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
  return `最近一次生成：${new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(lastGeneratedAt))}`;
}

function getGovernanceCopy(flowContext?: ToolFlowContext): string | null {
  const tag = flowContext?.cardCapability?.governance_tag;
  const priority = flowContext?.cardCapability?.cleanup_priority;
  if (!tag && !priority) return null;

  const tagLabel =
    tag === "harden"
      ? "加固"
      : tag === "borrow"
        ? "借底座"
        : tag === "freeze"
          ? "冻结"
          : tag === "defer"
            ? "延后"
            : tag === "separate-track"
              ? "独立轨道"
              : "待评估";
  const priorityLabel = priority ? priority.toUpperCase() : "待定";
  return `治理：${tagLabel} · 清理优先级：${priorityLabel}`;
}

function getWorkflowStateLabel(flowContext?: ToolFlowContext): string | null {
  switch (flowContext?.workflowState) {
    case "idle":
      return "工作流：待机";
    case "missing_requirements":
      return "工作流：缺少前提";
    case "ready_to_execute":
      return "工作流：可正式执行";
    case "executing":
      return "工作流：执行中";
    case "result_available":
      return "工作流：结果可用";
    case "refining":
      return "工作流：微调中";
    case "continuing":
      return "工作流：续轮中";
    case "failed":
      return "工作流：失败";
    default:
      return null;
  }
}

function getGovernanceRiskLabel(flowContext?: ToolFlowContext): string | null {
  const risk = flowContext?.governanceRubric?.authority_boundary_risk;
  if (risk === "low") return "Authority risk：低";
  if (risk === "medium") return "Authority risk：中";
  if (risk === "high") return "Authority risk：高";
  return null;
}

function getRubricRows(flowContext?: ToolFlowContext): string[] {
  const rubric = flowContext?.governanceRubric;
  if (!rubric) return [];
  return [
    `协议：${rubric.protocol_ready ? "ready" : "limited"}`,
    `工作面：${rubric.surface_ready ? "ready" : "placeholder"}`,
    `执行：${rubric.execute_ready ? "ready" : "blocked"}`,
    `微调：${rubric.refine_ready ? "ready" : "blocked"}`,
    `来源绑定：${rubric.source_binding_ready ? "ready" : "required"}`,
  ];
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
  const governanceCopy = getGovernanceCopy(flowContext);
  const workflowStateLabel = getWorkflowStateLabel(flowContext);
  const governanceRiskLabel = getGovernanceRiskLabel(flowContext);
  const rubricRows = getRubricRows(flowContext);

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
            {governanceCopy || workflowStateLabel || governanceRiskLabel ? (
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-600">
                {workflowStateLabel ? (
                  <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                    {workflowStateLabel}
                  </div>
                ) : null}
                {governanceRiskLabel ? (
                  <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                    {governanceRiskLabel}
                  </div>
                ) : null}
                {governanceCopy ? (
                  <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                    {governanceCopy}
                  </div>
                ) : null}
              </div>
            ) : null}
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

          {rubricRows.length > 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <p className="text-xs font-semibold text-zinc-900">治理视图</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {rubricRows.map((row) => (
                  <span
                    key={row}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] text-zinc-700"
                  >
                    {row}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

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

export { ArtifactWorkbenchShell as CardWorkbenchShell };
