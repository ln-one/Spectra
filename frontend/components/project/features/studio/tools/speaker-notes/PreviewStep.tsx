import { Mic2 } from "lucide-react";
import { CapabilityNotice } from "../CapabilityNotice";
import type { ToolFlowContext } from "../types";
import { ACTION_HINT_STYLE } from "./constants";
import type { SlideScriptItem, SourcePptSlidePreview } from "./types";

interface PreviewStepProps {
  activePage: number;
  lastGeneratedAt: string | null;
  highlightTransition: boolean;
  sourceSlides?: SourcePptSlidePreview[];
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
  sourceSlides = [],
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
  const sourceSlideByPage = new Map(
    sourceSlides.map((item) => [item.page, item])
  );

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
          <div className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
            {backendScripts.map((item) => {
              const sourceSlide = sourceSlideByPage.get(item.page);
              const thumbnailUrl =
                sourceSlide?.thumbnailUrl ?? sourceSlide?.imageUrl ?? "";
              const isActive = activePage === item.page;
              return (
                <button
                  key={item.page}
                  type="button"
                  onClick={() => onSelectPage(item.page)}
                  className={`w-full rounded-xl border text-left transition ${
                    isActive
                      ? "border-zinc-900 bg-white shadow-sm"
                      : "border-zinc-200 bg-white/80"
                  }`}
                >
                  <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3 p-3">
                    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
                      <div className="aspect-[16/10]">
                        {thumbnailUrl ? (
                          <img
                            src={thumbnailUrl}
                            alt={`P${item.page} ${item.title}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                            P{item.page}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-zinc-800">
                        <Mic2 className="h-4 w-4" />
                        <p className="truncate text-sm font-semibold">
                          第 {item.page} 页 · {item.title}
                        </p>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-[14px] leading-6 text-zinc-800">
                        {item.script}
                      </p>
                      {item.actionHint ? (
                        <p
                          className={`mt-2 inline-flex rounded px-2 py-1 text-xs ${ACTION_HINT_STYLE} ${
                            highlightTransition && isActive
                              ? "ring-2 ring-violet-200"
                              : ""
                          }`}
                        >
                          {item.actionHint}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
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
