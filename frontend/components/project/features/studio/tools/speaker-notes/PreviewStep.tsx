import { Mic2 } from "lucide-react";
import { CapabilityNotice } from "../CapabilityNotice";
import type { ToolFlowContext } from "../types";
import { ACTION_HINT_STYLE } from "./constants";
import type { SlideScriptItem } from "./types";

interface PreviewStepProps {
  activePage: number;
  lastGeneratedAt: string | null;
  highlightTransition: boolean;
  flowContext?: ToolFlowContext;
  onSelectPage: (page: number) => void;
}

interface BackendSummaryPayload {
  summary: string;
  keyPoints: string[];
}

function parseBackendScripts(flowContext?: ToolFlowContext): SlideScriptItem[] {
  if (!flowContext?.resolvedArtifact) return [];
  if (flowContext.resolvedArtifact.contentKind !== "json") return [];
  if (
    !flowContext.resolvedArtifact.content ||
    typeof flowContext.resolvedArtifact.content !== "object"
  ) {
    return [];
  }

  const content = flowContext.resolvedArtifact.content as Record<
    string,
    unknown
  >;
  const rawSlides = Array.isArray(content.slides) ? content.slides : [];
  const scripts: SlideScriptItem[] = [];

  for (let index = 0; index < rawSlides.length; index += 1) {
    const slide = rawSlides[index];
    if (!slide || typeof slide !== "object") continue;

    const row = slide as Record<string, unknown>;
    const page = Number(row.page ?? index + 1);
    const title =
      typeof row.title === "string" && row.title.trim()
        ? row.title.trim()
        : `Slide ${index + 1}`;
    const script =
      typeof row.script === "string" && row.script.trim()
        ? row.script.trim()
        : typeof row.summary === "string" && row.summary.trim()
          ? row.summary.trim()
          : "";
    const actionHint =
      typeof row.action_hint === "string" && row.action_hint.trim()
        ? row.action_hint.trim()
        : undefined;

    if (!Number.isFinite(page) || !script) continue;
    scripts.push({ page, title, script, actionHint });
  }

  return scripts;
}

function parseBackendSummary(
  flowContext?: ToolFlowContext
): BackendSummaryPayload | null {
  if (!flowContext?.resolvedArtifact) return null;
  if (flowContext.resolvedArtifact.contentKind !== "json") return null;
  if (
    !flowContext.resolvedArtifact.content ||
    typeof flowContext.resolvedArtifact.content !== "object"
  ) {
    return null;
  }

  const content = flowContext.resolvedArtifact.content as Record<
    string,
    unknown
  >;
  const summary =
    typeof content.summary === "string" ? content.summary.trim() : "";
  const keyPoints = Array.isArray(content.key_points)
    ? content.key_points
        .filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0
        )
        .map((item) => item.trim())
    : [];

  if (!summary && keyPoints.length === 0) return null;
  return { summary, keyPoints };
}

export function PreviewStep({
  activePage,
  lastGeneratedAt,
  highlightTransition,
  flowContext,
  onSelectPage,
}: PreviewStepProps) {
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ??
    "Waiting for backend speaker notes content.";
  const backendScripts = parseBackendScripts(flowContext);
  const backendSummary = parseBackendSummary(flowContext);
  const activeScript =
    backendScripts.find((item) => item.page === activePage) ??
    backendScripts[0] ??
    null;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <CapabilityNotice status={capabilityStatus} reason={capabilityReason} />

        <div className="mt-4">
          <p className="text-sm font-semibold text-zinc-900">
            Real-time Speaker Notes
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {lastGeneratedAt
              ? `Last generated: ${new Date(lastGeneratedAt).toLocaleString()}`
              : "Only real backend content is rendered in this view."}
          </p>
        </div>

        {activeScript ? (
          <div className="mt-4 grid grid-cols-[88px_minmax(0,1fr)] gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
            <div className="space-y-2">
              {backendScripts.map((item) => (
                <button
                  key={item.page}
                  type="button"
                  onClick={() => onSelectPage(item.page)}
                  className={`h-14 w-full rounded-lg border px-2 text-[11px] ${
                    activePage === item.page
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-600"
                  }`}
                >
                  P{item.page}
                </button>
              ))}
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex items-center gap-2 text-zinc-800">
                <Mic2 className="h-4 w-4" />
                <p className="text-sm font-semibold">
                  Slide {activeScript.page} - {activeScript.title}
                </p>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-[17px] leading-8 text-zinc-800">
                {activeScript.script}
              </p>
              {activeScript.actionHint ? (
                <p
                  className={`mt-4 inline-flex rounded px-2 py-1 text-xs ${ACTION_HINT_STYLE} ${
                    highlightTransition ? "ring-2 ring-violet-200" : ""
                  }`}
                >
                  {activeScript.actionHint}
                </p>
              ) : null}
            </div>
          </div>
        ) : backendSummary ? (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
            {backendSummary.summary ? (
              <p className="text-sm leading-6 text-zinc-800">
                {backendSummary.summary}
              </p>
            ) : null}
            {backendSummary.keyPoints.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-zinc-700">
                {backendSummary.keyPoints.map((point, index) => (
                  <li key={`${point}-${index}`}>{point}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
            <Mic2 className="mx-auto h-8 w-8 text-zinc-400" />
            <p className="mt-3 text-sm font-medium text-zinc-700">
              暂未收到后端真实说课讲稿
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              This panel no longer renders frontend mock data.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
