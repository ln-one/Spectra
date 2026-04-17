import { useState } from "react";
import { Mic2 } from "lucide-react";
import { CapabilityNotice } from "../CapabilityNotice";
import type { ToolFlowContext } from "../types";
import { SpeakerNotesSurface } from "./SpeakerNotesSurface";
import type {
  SlideScriptItem,
  SourcePptSlidePreview,
  SpeakerNotesParagraph,
  SpeakerNotesSection,
} from "./types";

interface PreviewStepProps {
  activePage: number;
  lastGeneratedAt: string | null;
  highlightTransition: boolean;
  sourceSlides?: SourcePptSlidePreview[];
  flowContext?: ToolFlowContext;
  onSelectPage: (page: number) => void;
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
    const sectionsRaw = Array.isArray(row.sections) ? row.sections : [];
    let sections: SpeakerNotesSection[] = sectionsRaw
      .map((section, sectionIndex) => {
        if (!section || typeof section !== "object") return null;
        const sectionRow = section as Record<string, unknown>;
        const paragraphsRaw = Array.isArray(sectionRow.paragraphs)
          ? sectionRow.paragraphs
          : [];
        const paragraphs: SpeakerNotesParagraph[] = paragraphsRaw
          .map((paragraph, paragraphIndex) => {
            if (!paragraph || typeof paragraph !== "object") return null;
            const paragraphRow = paragraph as Record<string, unknown>;
            const text =
              typeof paragraphRow.text === "string"
                ? paragraphRow.text.trim()
                : "";
            const anchorId =
              typeof paragraphRow.anchor_id === "string"
                ? paragraphRow.anchor_id.trim()
                : "";
            if (!text || !anchorId) return null;
            return {
              id:
                typeof paragraphRow.id === "string" && paragraphRow.id.trim()
                  ? paragraphRow.id.trim()
                  : `${page}-paragraph-${paragraphIndex + 1}`,
              anchorId,
              text,
              role:
                typeof paragraphRow.role === "string" && paragraphRow.role.trim()
                  ? paragraphRow.role.trim()
                  : "script",
            };
          })
          .filter((item): item is SpeakerNotesParagraph => Boolean(item));
        if (paragraphs.length === 0) return null;
        return {
          id:
            typeof sectionRow.id === "string" && sectionRow.id.trim()
              ? sectionRow.id.trim()
              : `${page}-section-${sectionIndex + 1}`,
          title:
            typeof sectionRow.title === "string" && sectionRow.title.trim()
              ? sectionRow.title.trim()
              : `段落 ${sectionIndex + 1}`,
          paragraphs,
        };
      })
      .filter((item): item is SpeakerNotesSection => Boolean(item));

    if (sections.length === 0) {
      const fallbackParagraphs: SpeakerNotesParagraph[] = [];
      const script =
        typeof row.script === "string" && row.script.trim()
          ? row.script.trim()
          : typeof row.summary === "string" && row.summary.trim()
            ? row.summary.trim()
            : "";
      const actionHint =
        typeof row.action_hint === "string" ? row.action_hint.trim() : "";
      const transitionLine =
        typeof row.transition_line === "string"
          ? row.transition_line.trim()
          : "";
      if (script) {
        fallbackParagraphs.push({
          id: `${page}-paragraph-1`,
          anchorId: `speaker_notes:v2:slide-${page}:paragraph-1`,
          text: script,
          role: "script",
        });
      }
      if (actionHint) {
        fallbackParagraphs.push({
          id: `${page}-paragraph-2`,
          anchorId: `speaker_notes:v2:slide-${page}:paragraph-2`,
          text: actionHint,
          role: "action_hint",
        });
      }
      if (transitionLine) {
        fallbackParagraphs.push({
          id: `${page}-paragraph-3`,
          anchorId: `speaker_notes:v2:slide-${page}:paragraph-3`,
          text: transitionLine,
          role: "transition",
        });
      }
      if (fallbackParagraphs.length > 0) {
        sections = [
          {
            id: `${page}-section-1`,
            title: "讲解内容",
            paragraphs: fallbackParagraphs,
          },
        ];
      }
    }

    if (!Number.isFinite(page) || sections.length === 0) continue;
    scripts.push({
      page,
      title,
      slideId:
        typeof row.id === "string" && row.id.trim() ? row.id.trim() : undefined,
      sections,
    });
  }

  return scripts;
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
  const artifactContent =
    flowContext?.resolvedArtifact?.content &&
    typeof flowContext.resolvedArtifact.content === "object"
      ? (flowContext.resolvedArtifact.content as Record<string, unknown>)
      : null;
  const summary =
    artifactContent && typeof artifactContent.summary === "string"
      ? artifactContent.summary
      : "";
  const provenance =
    artifactContent && typeof artifactContent.provenance === "object"
      ? (artifactContent.provenance as Record<string, unknown>)
      : null;
  const sourceBinding =
    artifactContent && typeof artifactContent.source_binding === "object"
      ? (artifactContent.source_binding as Record<string, unknown>)
      : null;
  const sourceBindingStatus =
    sourceBinding && typeof sourceBinding.status === "string"
      ? sourceBinding.status
      : "已绑定";
  const provenanceSourceArtifactIds =
    provenance && Array.isArray(provenance.created_from_artifact_ids)
      ? provenance.created_from_artifact_ids
      : [];
  const sourceSlideByPage = new Map(
    sourceSlides.map((item) => [item.page, item])
  );
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);

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

        {backendScripts.length > 0 ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
            <SpeakerNotesSurface
              slides={backendScripts}
              activePage={activePage}
              selectedAnchorId={selectedAnchorId}
              onSelectPage={onSelectPage}
              onSelectParagraph={(paragraph, slide) => {
                setSelectedAnchorId(paragraph.anchorId);
                const sourceSlide = sourceSlideByPage.get(slide.page);
                if (sourceSlide?.page && sourceSlide.page !== activePage) {
                  onSelectPage(sourceSlide.page);
                }
              }}
              onRefineParagraph={(paragraph, slide) => {
                void flowContext?.onStructuredRefineArtifact?.({
                  artifactId: flowContext.resolvedArtifact?.artifactId ?? "",
                  message: paragraph.text,
                  refineMode: "structured_refine",
                  selectionAnchor: {
                    scope: "paragraph",
                    anchor_id: paragraph.anchorId,
                    artifact_id: flowContext.resolvedArtifact?.artifactId,
                    label: `${slide.title} / ${paragraph.role}`,
                  },
                  config: {
                    active_page: slide.page,
                    highlight_transition: highlightTransition,
                  },
                });
              }}
            />
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 bg-white p-3">
                <p className="text-xs font-semibold text-zinc-900">来源绑定</p>
                <p className="mt-2 text-xs text-zinc-600">
                  当前绑定来源：{sourceBindingStatus}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-3">
                <p className="text-xs font-semibold text-zinc-900">Lineage</p>
                <p className="mt-2 text-xs text-zinc-600">
                  上游来源：
                  {typeof provenanceSourceArtifactIds[0] === "string"
                    ? String(provenanceSourceArtifactIds[0])
                    : "已绑定课件"}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-3">
                <p className="text-xs font-semibold text-zinc-900">讲稿摘要</p>
                <p className="mt-2 text-xs text-zinc-600">{summary || "已生成逐页讲稿。"}</p>
              </div>
            </div>
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
